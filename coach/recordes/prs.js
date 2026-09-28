// @ts-check
/**
 * Mural de Recordes — a regra, sem Firebase e sem tela (lado coach).
 *
 *   alunos/{email}/prs/{id}   um PR: { exercicio, carga, reps, data, criadoEm }
 *
 * O aluno registra pelo Garage App (Meus Recordes, Etapa 16.1) e o coach lê os
 * de todos numa consulta só (`prs-db.js`). O e-mail do aluno não está no
 * documento: sai do caminho. Os limites são os da regra do Firestore
 * (`prValido`) e do `validarPR` do app — o que passa disso não foi gravado por
 * eles e não entra no mural.
 *
 * Rodar os testes: node --test coach/recordes/prs.test.js
 */
import { alunoDaConversa, emMs, emailKey, enderecoDaConversa } from '../mensagens/chat.js';

export const EXERCICIO_MAX = 60;
export const CARGA_MAX = 500;
export const REPS_MAX = 50;

/** Um PR com a data dentro disto (hoje e os dias antes) ganha o selo "Novo". */
export const DIAS_DE_NOVO = 7;

/** Quantos PRs o feed desenha de uma vez — o resto aparece pelos filtros. */
export const LIMITE_FEED = 150;

/**
 * @typedef {{ id: string, email: string, caminho: string, exercicio: string,
 *   carga: number, reps: number, data: string, criadoEm: number }} PR
 * @typedef {{ exercicio: string, aluno: string }} Filtro
 *   `exercicio` é a chave (`chaveExercicio`), `aluno` o e-mail; '' é "todos".
 */

/** Data local em 'AAAA-MM-DD' — nunca `toISOString()`, que é UTC. @param {Date} d */
const diaId = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'AAAA-MM-DD' de um dia que existe no calendário (a regra só confere o formato). @param {unknown} v */
export function dataValida(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return diaId(d) === v;
}

/**
 * De quem é o PR, pelo caminho do documento. A consulta de grupo traria uma
 * subcoleção `prs` de qualquer lugar do banco; só a de `alunos/{email}` vale.
 * @param {string} caminho @returns {{ email: string, id: string }|null}
 */
export function donoDoCaminho(caminho) {
  const m = /^alunos\/([^/]+)\/prs\/([^/]+)$/.exec(String(caminho || ''));
  if (!m) return null;
  const email = emailKey(m[1]);
  return email.includes('@') ? { email, id: m[2] } : null;
}

/** Nome do exercício como vai para a tela: aparado e sem espaço dobrado. @param {unknown} v */
const limparNome = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Lê um PR do servidor sem confiar nele. `null` quando algum campo foge do que
 * o app e a regra deixam gravar.
 * @param {string} caminho @param {unknown} dados @returns {PR|null}
 */
export function normalizarPR(caminho, dados) {
  const dono = donoDoCaminho(caminho);
  if (!dono || !dados || typeof dados !== 'object') return null;
  const d = /** @type {Record<string, unknown>} */ (dados);
  const exercicio = limparNome(d.exercicio);
  if (!exercicio || exercicio.length > EXERCICIO_MAX) return null;
  const carga = d.carga;
  if (typeof carga !== 'number' || !Number.isFinite(carga) || carga <= 0 || carga > CARGA_MAX) return null;
  const reps = d.reps;
  if (typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1 || reps > REPS_MAX) return null;
  if (!dataValida(d.data)) return null;
  return {
    id: dono.id,
    email: dono.email,
    caminho,
    exercicio,
    carga,
    reps,
    data: /** @type {string} */ (d.data),
    criadoEm: emMs(d.criadoEm),
  };
}

/**
 * Do PR mais recente para o mais antigo: pela data em que foi batido e, no
 * mesmo dia, pela hora em que foi registrado.
 * @template {Pick<PR, 'data'|'criadoEm'|'caminho'>} T @param {T[]} lista @returns {T[]}
 */
export function ordenarPRs(lista) {
  return [...lista].sort((a, b) =>
    (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)
    || b.criadoEm - a.criadoEm
    || (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
}

/**
 * A chave do exercício para agrupar e filtrar: "Back Squat", "back  squat" e
 * "BACK SQUAT" são o mesmo exercício. Sem acento e sem caixa.
 * @param {string} nome
 */
export function chaveExercicio(nome) {
  return limparNome(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const porNome = (/** @type {{ nome: string }} */ a, /** @type {{ nome: string }} */ b) =>
  a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

/**
 * Os exercícios do filtro, em ordem alfabética. O nome mostrado é a grafia
 * que mais aparece; no empate, a do PR mais recente.
 * @param {PR[]} prs @returns {{ chave: string, nome: string, total: number }[]}
 */
export function opcoesDeExercicio(prs) {
  /** @type {Map<string, { total: number, grafias: Map<string, number> }>} */
  const grupos = new Map();
  for (const pr of ordenarPRs(prs)) {
    const chave = chaveExercicio(pr.exercicio);
    const g = grupos.get(chave) || { total: 0, grafias: new Map() };
    g.total += 1;
    g.grafias.set(pr.exercicio, (g.grafias.get(pr.exercicio) || 0) + 1);
    grupos.set(chave, g);
  }
  return [...grupos].map(([chave, g]) => {
    let nome = '', vezes = 0;
    for (const [grafia, n] of g.grafias) if (n > vezes) { nome = grafia; vezes = n; } // Map guarda a ordem: a mais recente vem antes
    return { chave, nome, total: g.total };
  }).sort(porNome);
}

/**
 * Os alunos do filtro, em ordem alfabética, com o nome da ficha da Gestão (ou
 * o e-mail, sem ficha).
 * @param {PR[]} prs @param {any[]} alunos @returns {{ email: string, nome: string, total: number }[]}
 */
export function opcoesDeAluno(prs, alunos) {
  /** @type {Map<string, number>} */
  const totais = new Map();
  for (const pr of prs) totais.set(pr.email, (totais.get(pr.email) || 0) + 1);
  return [...totais].map(([email, total]) => ({ email, nome: alunoDaConversa(email, alunos).nome, total })).sort(porNome);
}

/** @param {PR[]} prs @param {Partial<Filtro>} filtro @returns {PR[]} */
export function filtrarPRs(prs, filtro) {
  const ex = filtro.exercicio || '';
  const aluno = emailKey(filtro.aluno);
  return prs.filter((pr) => (!ex || chaveExercicio(pr.exercicio) === ex) && (!aluno || pr.email === aluno));
}

/**
 * Dias entre a data do PR e hoje, no fuso local: 0 hoje, 1 ontem.
 * @param {string} data @param {number} [agora]
 */
export function diasDesde(data, agora = Date.now()) {
  const [a, m, d] = data.split('-').map(Number);
  const hoje = new Date(agora);
  const meiaNoite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((meiaNoite.getTime() - new Date(a, m - 1, d).getTime()) / 86_400_000);
}

/** Batido nos últimos `DIAS_DE_NOVO` dias. @param {Pick<PR, 'data'>} pr @param {number} [agora] */
export const ehNovo = (pr, agora = Date.now()) => diasDesde(pr.data, agora) < DIAS_DE_NOVO;

/** "Hoje", "Ontem" ou 'dd/mm/aaaa'. @param {string} data @param {number} [agora] */
export function rotuloDaData(data, agora = Date.now()) {
  const dias = diasDesde(data, agora);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return dataBr(data);
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'. @param {string} data */
export const dataBr = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

/** A carga com vírgula, como se fala na box: 102,5. @param {number} carga */
export const formatarCarga = (carga) => String(Math.round(carga * 100) / 100).replace('.', ',');

/** @param {number} reps */
export const formatarReps = (reps) => `${reps} ${reps === 1 ? 'rep' : 'reps'}`;

/**
 * Os números do topo do mural.
 * @param {PR[]} prs @param {number} [agora]
 */
export function resumoDoMural(prs, agora = Date.now()) {
  return {
    total: prs.length,
    naSemana: prs.filter((pr) => ehNovo(pr, agora)).length,
    alunos: new Set(prs.map((pr) => pr.email)).size,
  };
}

/** O primeiro nome, para a mensagem. Sem ficha o "nome" é o e-mail — aí, nenhum. @param {string} nome */
export function primeiroNome(nome) {
  const n = String(nome || '').trim();
  return n.includes('@') ? '' : n.split(/\s+/)[0] || '';
}

/**
 * O parabéns que vai pronto para o campo da Central de Mensagens. "PR de
 * Deadlift" em vez de "no/na": o exercício é texto livre e não tem gênero.
 * @param {Pick<PR, 'exercicio'|'carga'|'reps'>} pr @param {string} nome
 */
export function mensagemDeParabens(pr, nome) {
  const pn = primeiroNome(nome);
  return `Parabéns${pn ? `, ${pn}` : ''}! 🏆 Novo PR de ${pr.exercicio}: ${formatarCarga(pr.carga)} kg × ${formatarReps(pr.reps)}. Mandou muito bem — bora pro próximo! 💪`;
}

/**
 * O atalho para a Central de Mensagens: abre a conversa com o aluno e deixa o
 * parabéns no campo, sem enviar.
 * @param {PR} pr @param {string} nome @param {string} [central] caminho da Central a partir do mural
 */
export function linkDeParabens(pr, nome, central = '../mensagens/index.html') {
  return `${central}${enderecoDaConversa(pr.email, mensagemDeParabens(pr, nome))}`;
}

/**
 * Os filtros no endereço do mural (`#exercicio=…&aluno=…`) — no `#`, que não
 * vai para o servidor. Voltar da Central cai no mesmo recorte.
 * @param {Filtro} filtro
 */
export function enderecoDoFiltro(filtro) {
  const p = new URLSearchParams();
  if (filtro.exercicio) p.set('exercicio', filtro.exercicio);
  if (filtro.aluno) p.set('aluno', emailKey(filtro.aluno));
  const s = p.toString();
  return s ? `#${s}` : '';
}

/** @param {string} hash @returns {Filtro} */
export function lerFiltro(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  return { exercicio: chaveExercicio(p.get('exercicio') || ''), aluno: emailKey(p.get('aluno')) };
}
