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
 * Padrão WhatsApp (Etapa 15.2): a mensagem nasce SÓ com os três campos — sem
 * `status`, que a leitura entende como 'enviado'. O resto chega por update:
 *   - `status`  quem RECEBEU marca 'entregue' / 'lido' (só avança, nunca volta);
 *   - `editado` quem ESCREVEU trocou o texto.
 *
 * Apagar (Etapa 17.1) é apagar de verdade: o documento sai do Firestore e a
 * escuta tira o balão da tela — não fica "Mensagem apagada" no lugar. O
 * `apagado: true` da 15.2 (texto '' no documento) ainda pode existir em
 * conversa antiga: é lido como mensagem que não existe mais.
 *
 * Mídia (Etapa 17.2 no app, 17.3 aqui): foto, vídeo e voz. O arquivo vai para
 * o Storage em `chats/{email}/{timestamp}_{tipo}.{ext}` e SÓ DEPOIS nasce a
 * mensagem, com `tipo`, `mediaUrl`, `duracao` (vídeo e áudio) e, no vídeo,
 * `thumbUrl` (a capa). Mensagem de texto continua sem `tipo`. O `texto` da
 * mídia é o rótulo ("📷 Foto"): é o que a lista, o resumo e o push mostram.
 * Os tetos e rótulos são os mesmos do app — o `npm run paridade` do app
 * compara os dois lados.
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
 * @typedef {'enviado'|'entregue'|'lido'} StatusMensagem
 * @typedef {'texto'|'imagem'|'video'|'audio'} TipoMensagem
 * @typedef {'imagem'|'video'|'audio'} TipoMidia
 * @typedef {{ texto: string, remetente: Remetente, timestamp: number,
 *   tipo?: TipoMidia, mediaUrl?: string, duracao?: number, thumbUrl?: string }} NovaMensagem
 *   `tipo` só na mídia (texto não leva o campo); `duracao` em segundos; `thumbUrl` é a capa do vídeo.
 * @typedef {Omit<NovaMensagem, 'tipo'> & { id: string, tipo: TipoMensagem, status: StatusMensagem,
 *   editado: boolean, pendente?: boolean }} Mensagem
 * @typedef {{ texto: string, remetente: Remetente, timestamp: number }} ResumoDaMensagem
 * @typedef {{ email: string, ultimaMensagem: ResumoDaMensagem | null, atualizadoEm: number }} Conversa
 */

/** @type {readonly TipoMidia[]} */
const TIPOS_MIDIA = ['imagem', 'video', 'audio'];

/**
 * Tetos do que sobe ao Storage — os mesmos do app (`LIMITES_MIDIA` em
 * core/chat.ts) e das regras (storage.rules: 5/10/50 MB; firestore.rules:
 * duração até 180,5 s no vídeo e 300,5 s no áudio).
 * @type {Record<TipoMidia, { bytes: number, duracaoMax?: number }>}
 */
export const LIMITES_MIDIA = {
  imagem: { bytes: 5 * 1024 * 1024 },
  video: { bytes: 50 * 1024 * 1024, duracaoMax: 180 },
  audio: { bytes: 10 * 1024 * 1024, duracaoMax: 300 },
};

/** Voz mais curta que isto foi clique sem querer — não vira mensagem. */
export const VOZ_MIN_S = 1;

/** Upload parado por este tempo (sem nenhum byte novo) é cancelado. */
export const UPLOAD_PARADO_MS = 30_000;

/** O erro do upload cancelado por falta de rede: nada foi criado, é mandar de novo. */
export const UPLOAD_PARADO = 'upload-parado';

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

/** O update da edição, ou `null` se o texto novo não vale uma mensagem. @param {unknown} texto */
export function edicaoDaMensagem(texto) {
  const t = prepararTexto(texto);
  return t ? { texto: t, editado: /** @type {true} */ (true) } : null;
}

/**
 * O coach só apaga a resposta dele, já gravada.
 * @param {Pick<Mensagem, 'remetente'|'pendente'>} m
 */
export function podeApagar(m) {
  return m.remetente === 'coach' && !m.pendente;
}

/**
 * E só edita a de texto — foto, vídeo e voz não têm texto para trocar (a
 * regra `alteracaoDoAutor` também exige tipo texto).
 * @param {Pick<Mensagem, 'remetente'|'pendente'|'tipo'>} m
 */
export function podeEditar(m) {
  return podeApagar(m) && m.tipo === 'texto';
}

/** Segundos como no relógio do WhatsApp: '0:05', '1:02', '1:00:00'. @param {number} segundos */
export function formatarDuracao(segundos) {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * O texto que a mídia leva: lista, resumo, push e quem ainda não desenha mídia.
 * @param {TipoMidia} tipo @param {number} [duracao]
 */
export function rotuloDaMidia(tipo, duracao) {
  const tempo = duracao && duracao > 0 ? ` (${formatarDuracao(duracao)})` : '';
  if (tipo === 'imagem') return '📷 Foto';
  if (tipo === 'video') return `🎥 Vídeo${tempo}`;
  return `🎤 Mensagem de voz${tempo}`;
}

/**
 * O arquivo passa nos tetos? `null` quando sim; senão, o motivo para o coach.
 * Tamanho ou duração desconhecidos não barram — a regra do Storage tem a
 * palavra final sobre o tamanho.
 * @param {TipoMidia} tipo @param {{ bytes?: number|null, duracao?: number|null }} arquivo
 * @returns {string|null}
 */
export function validarMidia(tipo, arquivo) {
  const limite = LIMITES_MIDIA[tipo];
  const nome = tipo === 'imagem' ? 'A foto' : tipo === 'video' ? 'O vídeo' : 'O áudio';
  if (arquivo.bytes && arquivo.bytes > limite.bytes) {
    return `${nome} passa de ${Math.round(limite.bytes / (1024 * 1024))} MB. Escolha um menor.`;
  }
  if (limite.duracaoMax && arquivo.duracao && arquivo.duracao > limite.duracaoMax + 0.5) {
    return `${nome} passa de ${formatarDuracao(limite.duracaoMax)}. Mande um trecho menor.`;
  }
  return null;
}

/**
 * Vídeo que o celular do aluno toca: MP4 ou MOV. WebM, AVI e MKV ficam de
 * fora — o iPhone não abre, e comprimir vídeo no navegador não é viável.
 * @param {string|null|undefined} mimeType @param {string} [nome]
 */
export function videoAceito(mimeType, nome = '') {
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') return true;
  // Sem tipo informado (acontece no Windows com .mov), vale a extensão.
  return !mimeType && /\.(mp4|m4v|mov)$/i.test(nome);
}

/**
 * Extensão e tipo do arquivo no Storage. A foto já sai do navegador em JPEG,
 * e a voz em M4A (AAC) — o mesmo do app.
 * @param {TipoMidia} tipo @param {string|null} [mimeType] @param {string} [nome]
 * @returns {{ ext: string, contentType: string }}
 */
export function formatoDoArquivo(tipo, mimeType, nome = '') {
  if (tipo === 'imagem') return { ext: 'jpg', contentType: 'image/jpeg' };
  if (tipo === 'audio') return { ext: 'm4a', contentType: 'audio/mp4' };
  const mov = mimeType === 'video/quicktime' || /\.mov$/i.test(nome.split('?')[0]);
  return mov ? { ext: 'mov', contentType: 'video/quicktime' } : { ext: 'mp4', contentType: 'video/mp4' };
}

/**
 * Os formatos de gravação que o celular do aluno toca, na ordem de
 * preferência: AAC em MP4. O `audio/mp4` sem codec fica por último — o
 * codec real é conferido depois com `vozCompativel`.
 */
export const FORMATOS_DE_VOZ = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4;codecs=aac', 'audio/mp4'];

/**
 * O formato que o `MediaRecorder` deste navegador vai usar, ou `null` se ele
 * só grava o que o iPhone não toca (WebM/Opus, no Firefox).
 * @param {(tipo: string) => boolean} suporta o `MediaRecorder.isTypeSupported`
 */
export function formatoDeGravacao(suporta) {
  return FORMATOS_DE_VOZ.find((f) => { try { return suporta(f); } catch { return false; } }) ?? null;
}

/**
 * O que o gravador diz que gravou é tocável no celular? MP4 sem Opus. (Um
 * Chrome pode aceitar `audio/mp4` e encher de Opus, que o iPhone não toca.)
 * @param {string|null|undefined} mimeType
 */
export function vozCompativel(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  return m.startsWith('audio/mp4') && !m.includes('opus');
}

/**
 * Onde o arquivo mora no Storage: `chats/{email}/{timestamp}_{tipo}.{ext}`.
 * @param {string} email @param {number} timestamp @param {TipoMidia} tipo @param {string} ext
 */
export function caminhoDaMidia(email, timestamp, tipo, ext) {
  return `chats/${emailKey(email)}/${timestamp}_${tipo}.${ext}`;
}

/** A capa do vídeo, ao lado dele: `chats/{email}/{timestamp}_capa.jpg`. @param {string} email @param {number} timestamp */
export function caminhoDaCapa(email, timestamp) {
  return `chats/${emailKey(email)}/${timestamp}_capa.jpg`;
}

/** Só URL https vira `<img>`/player — nada de javascript:, data: ou lixo gravado. @param {unknown} v @returns {v is string} */
const urlValida = (v) => typeof v === 'string' && /^https:\/\/\S+$/.test(v);

/** Segundos gravados, ou `undefined` se não é uma duração. @param {unknown} v */
const duracaoValida = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/**
 * A mensagem de mídia pronta para gravar, depois do upload — ou `null` se o
 * endereço não é https. Campo vazio não vai para o documento.
 * @param {TipoMidia} tipo @param {string} mediaUrl @param {Remetente} remetente
 * @param {{ duracao?: number|null, thumbUrl?: string|null }} [extra] @param {number} [agora]
 * @returns {NovaMensagem|null}
 */
export function novaMensagemDeMidia(tipo, mediaUrl, remetente, extra = {}, agora = Date.now()) {
  if (!urlValida(mediaUrl)) return null;
  const duracao = tipo === 'imagem' ? undefined : duracaoValida(extra.duracao);
  /** @type {NovaMensagem} */
  const m = { texto: rotuloDaMidia(tipo, duracao), remetente, timestamp: agora, tipo, mediaUrl };
  if (duracao) m.duracao = Math.round(duracao * 10) / 10;
  if (tipo === 'video' && urlValida(extra.thumbUrl)) m.thumbUrl = extra.thumbUrl;
  return m;
}

/** 0–100, inteiro, para a barra do upload. @param {number} feito @param {number} total */
export function porcentagem(feito, total) {
  if (!(total > 0) || !(feito > 0)) return 0;
  return Math.min(100, Math.round((feito / total) * 100));
}

/** O vigia do upload: sem byte novo por mais que o limite, desiste. @param {number} ultimoAvanco @param {number} agora */
export function uploadParado(ultimoAvanco, agora, limite = UPLOAD_PARADO_MS) {
  return agora - ultimoAvanco > limite;
}

/** Mídia fora dos tetos — a `message` já é o motivo, para o coach. */
export class MidiaRecusada extends Error {
  /** @param {string} motivo */
  constructor(motivo) {
    super(motivo);
    this.name = 'MidiaRecusada';
  }
}

/**
 * O que a tela diz depois de mandar uma mídia. No navegador não há fila
 * offline de verdade, então só três saídas: `sem-rede` (caiu no upload, nada
 * foi criado), `recusada` com o motivo (arquivo fora dos tetos) e `recusada`
 * sem motivo (regra ou erro estranho — a tela usa o texto genérico).
 * @param {unknown} e @returns {{ resultado: 'sem-rede'|'recusada', motivo?: string }}
 */
export function resultadoDaFalha(e) {
  if (e instanceof MidiaRecusada) return { resultado: 'recusada', motivo: e.message };
  if (e instanceof Error && e.message === UPLOAD_PARADO) return { resultado: 'sem-rede' };
  return { resultado: 'recusada' };
}

/**
 * O que o resumo `chats/{email}` vira quando a mensagem `id` é apagada — o
 * mesmo `resumoAposApagar` do app:
 *   - `undefined`  não era a última: o resumo fica como está;
 *   - a mensagem   era a última: a anterior passa a ser a última;
 *   - `null`       era a única: a conversa ficou vazia, o resumo sai também.
 * @param {Mensagem[]} mensagens @param {string} id @returns {NovaMensagem|null|undefined}
 */
export function resumoAposApagar(mensagens, id) {
  const lista = ordenarMensagens(mensagens);
  if (lista[lista.length - 1]?.id !== id) return undefined;
  const anterior = lista[lista.length - 2];
  // Só o que o resumo leva: a mídia entra pelo rótulo, que já é o `texto` dela.
  return anterior ? { texto: anterior.texto, remetente: anterior.remetente, timestamp: anterior.timestamp } : null;
}

/**
 * As mensagens do aluno que o coach deve marcar, e com qual status: com a
 * conversa à vista, 'lido'; com a aba escondida, só 'entregue' — e 'entregue'
 * só sai de 'enviado', que o status nunca volta. A pendente fica de fora.
 * @param {Mensagem[]} mensagens @param {boolean} aVista
 * @returns {{ status: 'entregue'|'lido', ids: string[] }}
 */
export function paraMarcar(mensagens, aVista) {
  const status = aVista ? 'lido' : 'entregue';
  const ids = mensagens
    .filter((m) => m.remetente === 'aluno' && !m.pendente
      && (aVista ? m.status !== 'lido' : m.status === 'enviado'))
    .map((m) => m.id);
  return { status, ids };
}

/**
 * Os ticks da resposta do coach: um ✓ enviado, dois entregue, dois em destaque lido.
 * @param {StatusMensagem} status
 */
export function ticksDoStatus(status) {
  return { marca: status === 'enviado' ? '✓' : '✓✓', lido: status === 'lido' };
}

/**
 * O resumo da conversa: a última mensagem, com o texto encurtado.
 * @param {string} aluno @param {NovaMensagem} m
 */
export function resumoDoChat(aluno, m) {
  const texto = m.texto.length > RESUMO_MAX ? `${m.texto.slice(0, RESUMO_MAX - 1).trimEnd()}…` : m.texto;
  // Só os três campos: o endereço da mídia não mora no resumo — o rótulo basta.
  return { aluno, ultimaMensagem: { texto, remetente: m.remetente, timestamp: m.timestamp }, atualizadoEm: m.timestamp };
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

/** Status gravado, ou 'enviado' — a mensagem nasce sem ele, e lixo não vira tick. @returns {StatusMensagem} */
export function normalizarStatus(/** @type {unknown} */ v) {
  return v === 'entregue' || v === 'lido' ? v : 'enviado';
}

/**
 * Lê uma mensagem do servidor sem confiar nela. Sem remetente conhecido ou
 * sem hora, não é mensagem. A apagada da 15.2 (`apagado: true`) também não.
 * Mídia só com endereço https; sem ele, vale o texto (o rótulo), como texto.
 * @param {string} id @param {unknown} dados @returns {Mensagem|null}
 */
export function normalizarMensagem(id, dados) {
  if (!id || !dados || typeof dados !== 'object') return null;
  const d = /** @type {Record<string, unknown>} */ (dados);
  if (d.remetente !== 'aluno' && d.remetente !== 'coach') return null;
  if (d.apagado === true) return null;
  const timestamp = emMs(d.timestamp);
  if (!timestamp) return null;
  /** @type {Remetente} */
  const remetente = d.remetente;
  const base = { id, remetente, timestamp, status: normalizarStatus(d.status), editado: d.editado === true };
  const textoGravado = typeof d.texto === 'string' ? d.texto.trim() : '';

  const tipo = TIPOS_MIDIA.find((t) => t === d.tipo);
  if (tipo && urlValida(d.mediaUrl)) {
    const duracao = tipo === 'imagem' ? undefined : duracaoValida(d.duracao);
    /** @type {Mensagem} */
    const m = { ...base, texto: textoGravado || rotuloDaMidia(tipo, duracao), tipo, mediaUrl: d.mediaUrl };
    if (duracao) m.duracao = duracao;
    if (tipo === 'video' && urlValida(d.thumbUrl)) m.thumbUrl = d.thumbUrl;
    return m;
  }

  if (!textoGravado) return null;
  return { ...base, texto: textoGravado, tipo: 'texto' };
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

/**
 * O endereço da Central: `#email` abre a conversa, e `&rascunho=texto` deixa um
 * texto pronto no campo de resposta — é assim que o Mural de Recordes manda o
 * parabéns. Tudo no `#`, que não sai do navegador: nem o e-mail nem o texto
 * vão parar no log do servidor.
 * @param {string} email @param {string} [rascunho]
 */
export function enderecoDaConversa(email, rascunho) {
  const base = `#${encodeURIComponent(emailKey(email))}`;
  const t = prepararTexto(rascunho);
  return t ? `${base}&${new URLSearchParams({ rascunho: t })}` : base;
}

/**
 * Lê o endereço que `enderecoDaConversa` monta. Sem '@' não é aluno, e um `%`
 * solto no endereço não derruba a página.
 * @param {string} hash @returns {{ email: string, rascunho: string|null }}
 */
export function lerEndereco(hash) {
  const h = String(hash || '').replace(/^#/, '');
  const i = h.indexOf('&');
  let email = '';
  try { email = emailKey(decodeURIComponent(i < 0 ? h : h.slice(0, i))); } catch { /* endereço torto */ }
  const rascunho = i < 0 ? null : prepararTexto(new URLSearchParams(h.slice(i + 1)).get('rascunho'));
  return { email: email.includes('@') ? email : '', rascunho };
}
