// @ts-check
/**
 * Chat Coach ↔ Aluno — a regra, sem Firebase e sem tela (lado coach).
 *
 *   chats/{email}                  o resumo da conversa: { aluno, ultimaMensagem, atualizadoEm }
 *   chats/{email}/mensagens/{id}   uma mensagem: { texto, remetente, timestamp }
 *
 * Espelho de `app-mobile/src/core/chat.ts` — o app grava, a Central lê, e as
 * duas pontas precisam concordar no formato. O `id` da mensagem é o id do
 * documento; o `timestamp` é o relógio do aparelho em ms (um Timestamp do
 * Firestore também é aceito na leitura).
 *
 * Rodar os testes: node --test coach/mensagens/chat.test.js
 */

/** Teto de uma mensagem — o mesmo da regra do Firestore e do app. */
export const TEXTO_MAX = 1000;

/** Quantas mensagens a conversa aberta escuta — as mais recentes. */
export const LIMITE_HISTORICO = 200;

/** Quantas conversas a lista escuta — as mais recentes. */
export const LIMITE_CONVERSAS = 100;

/** Quanto do texto vai para o resumo da conversa. */
export const RESUMO_MAX = 120;

/** Duas mensagens seguidas da mesma pessoa, dentro disto, formam um bloco. */
export const JANELA_DO_BLOCO_MS = 5 * 60_000;

/**
 * @typedef {'aluno'|'coach'} Remetente
 * @typedef {{ texto: string, remetente: Remetente, timestamp: number }} NovaMensagem
 * @typedef {NovaMensagem & { id: string, pendente?: boolean }} Mensagem
 * @typedef {{ email: string, ultimaMensagem: NovaMensagem | null, atualizadoEm: number }} Conversa
 */

export const emailKey = (/** @type {unknown} */ e) => String(e ?? '').trim().toLowerCase();

/** Data local em 'AAAA-MM-DD' — nunca `toISOString()`, que é UTC. @param {Date} d */
const diaId = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** @param {string} dia */
function diaAnterior(dia) {
  const [a, m, d] = dia.split('-').map(Number);
  return diaId(new Date(a, m - 1, d - 1));
}

/**
 * O texto como vai para o servidor: aparado, sem a pilha de linhas em branco,
 * cortado no teto. `null` quando não sobra nada.
 * @param {unknown} bruto @returns {string|null}
 */
export function prepararTexto(bruto) {
  if (typeof bruto !== 'string') return null;
  const t = bruto
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, TEXTO_MAX)
    .trim();
  return t || null;
}

/**
 * A mensagem pronta para gravar, ou `null` se o texto não vale uma mensagem.
 * @param {unknown} texto @param {Remetente} remetente @param {number} [agora]
 * @returns {NovaMensagem|null}
 */
export function novaMensagem(texto, remetente, agora = Date.now()) {
  const t = prepararTexto(texto);
  return t ? { texto: t, remetente, timestamp: agora } : null;
}

/**
 * O resumo da conversa: a última mensagem, com o texto encurtado.
 * @param {string} aluno @param {NovaMensagem} m
 */
export function resumoDoChat(aluno, m) {
  const texto = m.texto.length > RESUMO_MAX ? `${m.texto.slice(0, RESUMO_MAX - 1).trimEnd()}…` : m.texto;
  return { aluno, ultimaMensagem: { ...m, texto }, atualizadoEm: m.timestamp };
}

/**
 * Milissegundos de um horário gravado: número ou Timestamp do Firestore. 0 quando não dá.
 * @param {unknown} v @returns {number}
 */
export function emMs(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (!v || typeof v !== 'object') return 0;
  const t = /** @type {{ toMillis?: () => number, seconds?: unknown, nanoseconds?: unknown }} */ (v);
  if (typeof t.toMillis === 'function') return emMs(t.toMillis());
  if (typeof t.seconds === 'number') {
    return emMs(t.seconds * 1000 + Math.floor((typeof t.nanoseconds === 'number' ? t.nanoseconds : 0) / 1e6));
  }
  return 0;
}

/**
 * Lê uma mensagem do servidor sem confiar nela.
 * @param {string} id @param {unknown} dados @returns {Mensagem|null}
 */
export function normalizarMensagem(id, dados) {
  if (!id || !dados || typeof dados !== 'object') return null;
  const d = /** @type {Record<string, unknown>} */ (dados);
  if (d.remetente !== 'aluno' && d.remetente !== 'coach') return null;
  const texto = typeof d.texto === 'string' ? d.texto.trim() : '';
  const timestamp = emMs(d.timestamp);
  if (!texto || !timestamp) return null;
  return { id, texto, remetente: d.remetente, timestamp };
}

/**
 * Lê o resumo `chats/{email}`. O id do documento é o e-mail — é ele que vale,
 * e não o campo `aluno`, que qualquer um dos dois lados pode ter gravado torto.
 * @param {string} id @param {unknown} dados @returns {Conversa|null}
 */
export function normalizarConversa(id, dados) {
  const email = emailKey(id);
  if (!email || !dados || typeof dados !== 'object') return null;
  const d = /** @type {Record<string, unknown>} */ (dados);
  const ultima = normalizarMensagem('ultima', d.ultimaMensagem);
  const atualizadoEm = emMs(d.atualizadoEm) || (ultima ? ultima.timestamp : 0);
  if (!atualizadoEm) return null;
  return {
    email,
    ultimaMensagem: ultima ? { texto: ultima.texto, remetente: ultima.remetente, timestamp: ultima.timestamp } : null,
    atualizadoEm,
  };
}

/**
 * Da conversa mais recente para a mais antiga; no empate, pelo e-mail.
 * @template {{ email: string, atualizadoEm: number }} T @param {T[]} lista @returns {T[]}
 */
export function ordenarConversas(lista) {
  return [...lista].sort((a, b) => b.atualizadoEm - a.atualizadoEm || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
}

/**
 * A última palavra foi do aluno: a conversa espera o coach.
 * @param {Conversa} c
 */
export const aguardaResposta = (c) => c.ultimaMensagem?.remetente === 'aluno';

/**
 * Da mais antiga para a mais nova; no mesmo milissegundo, pelo id.
 * @template {{ id: string, timestamp: number }} T @param {T[]} lista @returns {T[]}
 */
export function ordenarMensagens(lista) {
  return [...lista].sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 'HH:mm' no fuso local. @param {number} ts */
export function horaDaMensagem(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** O separador do dia: "Hoje", "Ontem" ou 'dd/mm/aaaa'. @param {number} ts @param {number} [agora] */
export function rotuloDoDia(ts, agora = Date.now()) {
  const dia = diaId(new Date(ts));
  const hoje = diaId(new Date(agora));
  if (dia === hoje) return 'Hoje';
  if (dia === diaAnterior(hoje)) return 'Ontem';
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

/**
 * O horário curto da lista de conversas: a hora se foi hoje, "Ontem", ou 'dd/mm'.
 * @param {number} ts @param {number} [agora]
 */
export function quandoNaLista(ts, agora = Date.now()) {
  const r = rotuloDoDia(ts, agora);
  if (r === 'Hoje') return horaDaMensagem(ts);
  return r === 'Ontem' ? r : r.slice(0, 5);
}

/**
 * Uma linha da conversa aberta: o separador do dia ou uma mensagem.
 * @typedef {{ tipo: 'dia', id: string, rotulo: string }
 *   | { tipo: 'mensagem', id: string, mensagem: Mensagem, continuacao: boolean }} ItemChat
 */

/**
 * A conversa pronta para desenhar, em ordem cronológica: cada dia abre com o
 * seu separador, e `continuacao` marca a mensagem que encosta na anterior.
 * @param {Mensagem[]} mensagens @param {number} [agora] @returns {ItemChat[]}
 */
export function itensDoChat(mensagens, agora = Date.now()) {
  /** @type {ItemChat[]} */
  const itens = [];
  let diaAtual = '';
  /** @type {Mensagem|null} */
  let anterior = null;
  for (const m of ordenarMensagens(mensagens)) {
    const dia = diaId(new Date(m.timestamp));
    if (dia !== diaAtual) {
      diaAtual = dia;
      anterior = null;
      itens.push({ tipo: 'dia', id: `dia-${dia}`, rotulo: rotuloDoDia(m.timestamp, agora) });
    }
    const continuacao = !!anterior
      && anterior.remetente === m.remetente
      && m.timestamp - anterior.timestamp <= JANELA_DO_BLOCO_MS;
    itens.push({ tipo: 'mensagem', id: m.id, mensagem: m, continuacao });
    anterior = m;
  }
  return itens;
}

/**
 * Quem é o aluno da conversa, pela ficha da Gestão (e-mail → nome e foto). Sem
 * ficha, o e-mail mesmo — a conversa aparece, só sem o nome.
 * @param {string} email @param {any[]} alunos
 * @returns {{ nome: string, foto: string, naFicha: boolean }}
 */
export function alunoDaConversa(email, alunos) {
  const a = (alunos || []).find((x) => emailKey(x?.email) === emailKey(email));
  const nome = String(a?.nome || '').trim();
  return { nome: nome || emailKey(email), foto: String(a?.fotoUrl || ''), naFicha: !!a };
}

/**
 * As iniciais do avatar: primeira letra do primeiro e do último nome.
 * @param {string} nome
 */
export function iniciais(nome) {
  const partes = String(nome || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (!partes.length) return '?';
  const a = partes[0][0];
  const b = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (a + b).toUpperCase();
}

/**
 * A busca da lista: por nome ou e-mail, sem acento e sem caixa.
 * @param {{ nome: string, email: string }} x @param {string} termo
 */
export function casaBusca(x, termo) {
  const norm = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = norm(String(termo || '').trim());
  return !t || norm(x.nome).includes(t) || norm(x.email).includes(t);
}
