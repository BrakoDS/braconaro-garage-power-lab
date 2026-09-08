// @ts-check
/**
 * Estado persistente em localStorage. Sem backend.
 *
 * Organização: cada TREINO é salvo numa DATA específica ('YYYY-MM-DD') em
 * `treinos[dateId]`. Um treino por dia, igual para todos os alunos. Regerar/salvar
 * na mesma data substitui (com confirmação na UI). O calendário do histórico lê
 * `listarTreinosDoMes`; a meta de volume lê `treinosDaSemana`.
 *
 * @typedef {Object} Aluno
 * @property {string} id
 * @property {string} nome
 * @property {'iniciante'|'intermediario'|'avancado'} nivel
 * @property {string} combinacaoId
 * @property {Partial<Record<string, import('../config/modalidades.js').ModalidadeId>>} modalidadesPorDia
 *
 * @typedef {Object} TreinoSalvo
 * @property {string} dateId           'YYYY-MM-DD'
 * @property {string} dia              dia da semana ('seg'..'dom')
 * @property {string} modalidade
 * @property {string} geradoEm         ISO
 * @property {Object} viabilidade
 * @property {Array=} exercicios       (Força/Hipertrofia) ou hyrox/hiit/gap/hibrido
 * @property {any=} finalizador
 * @property {Record<string, number>} volPorPadrao  volume por padrão de movimento
 */

const CHAVE = 'braconaro_montador_v2';

export function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (raw) {
      const e = JSON.parse(raw);
      // `programas` (formato semanal antigo) fica preservado no cru p/ não apagar
      // dados legados, mas não é mais exposto por funções — o fluxo novo usa `treinos`.
      return { alunos: e.alunos || [], config: e.config || {}, treinos: e.treinos || {}, programas: e.programas || {} };
    }
  } catch (e) { /* ignora */ }
  return { alunos: [], config: {}, treinos: {}, programas: {} };
}

/** @param {object} est */
export function salvar(est) {
  localStorage.setItem(CHAVE, JSON.stringify(est));
  if (_aoSalvar) _aoSalvar(est); // espelha na nuvem (se ativa)
}

const estado = carregar();

// ---------- ponte com a nuvem (opcional) ----------
/** @type {((est:object)=>void)|null} */
let _aoSalvar = null;
/** Registra um callback chamado a cada salvamento (usado pelo sync em nuvem). */
export function aoSalvar(cb) { _aoSalvar = cb; }
/** Substitui o estado local pelo vindo da nuvem (sem disparar push de volta). */
export function setEstado(novo) {
  estado.alunos = novo.alunos || [];
  estado.config = novo.config || {};
  estado.treinos = novo.treinos || {};
  estado.programas = novo.programas || {}; // legado preservado
  localStorage.setItem(CHAVE, JSON.stringify(estado)); // cache local, sem re-push
}
/** Snapshot do estado atual (para enviar à nuvem). */
export function getEstado() { return estado; }

// ---------- helpers de data ----------
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** 'YYYY-MM' de uma data. @param {Date} [d] */
export function mesIdDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Semana do mês (1..5) de uma data. @param {Date} [d] */
export function semanaDoMes(d = new Date()) { return Math.ceil(d.getDate() / 7); }
/** Rótulo legível 'Junho/2026'. @param {string} mesId */
export function rotuloMes(mesId) {
  const [ano, m] = mesId.split('-').map(Number);
  return `${MESES[m - 1]}/${ano}`;
}

// ---------- configuração do box (grade da semana) ----------
export function getConfig() { return estado.config; }
/** @param {object} patch */
export function setConfig(patch) { Object.assign(estado.config, patch); salvar(estado); }

// ---------- alunos ----------
export function listarAlunos() { return estado.alunos; }
/** @param {Omit<Aluno,'id'>} dados */
export function adicionarAluno(dados) {
  const aluno = { id: 'a_' + Date.now().toString(36), ...dados };
  estado.alunos.push(aluno); salvar(estado); return aluno;
}
/** @param {string} id @param {Partial<Aluno>} patch */
export function atualizarAluno(id, patch) {
  const a = estado.alunos.find((x) => x.id === id);
  if (a) { Object.assign(a, patch); salvar(estado); } return a;
}
/** @param {string} id */
export function removerAluno(id) {
  const i = estado.alunos.findIndex((x) => x.id === id);
  if (i >= 0) { estado.alunos.splice(i, 1); salvar(estado); }
}

// ---------- helpers de data (por dia) ----------
/** 'YYYY-MM-DD' de uma data (local, sem UTC shift). @param {Date} d */
export function dateIdDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Date (meia-noite local) a partir de 'YYYY-MM-DD'. @param {string} dateId */
export function dataDe(dateId) {
  const [a, m, d] = dateId.split('-').map(Number);
  return new Date(a, m - 1, d);
}
/** Chave 'seg'..'dom' de um dateId. */
const DOW_KEY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
export function diaSemanaDe(dateId) { return DOW_KEY[dataDe(dateId).getDay()]; }

/** Segunda-feira (ISO) da semana de um dateId. @param {string} dateId @returns {Date} */
function segundaDaSemana(dateId) {
  const d = dataDe(dateId);
  const dow = d.getDay(); // 0=dom..6=sab
  const offset = dow === 0 ? -6 : 1 - dow; // volta até a segunda
  d.setDate(d.getDate() + offset);
  return d;
}

// ---------- treinos por data ----------
/** @param {string} dateId @returns {TreinoSalvo|null} */
export function getTreino(dateId) { return estado.treinos[dateId] ?? null; }

/** @param {string} dateId @param {TreinoSalvo} treino */
export function salvarTreino(dateId, treino) {
  estado.treinos[dateId] = { ...treino, dateId };
  salvar(estado);
}

/** @param {string} dateId */
export function removerTreino(dateId) {
  if (estado.treinos[dateId]) { delete estado.treinos[dateId]; salvar(estado); }
}

/** Treinos de um mês ('YYYY-MM'), ordenados por data. @param {string} mesId */
export function listarTreinosDoMes(mesId) {
  return Object.entries(estado.treinos)
    .filter(([dateId]) => dateId.startsWith(mesId + '-'))
    .map(([dateId, t]) => ({ ...t, dateId }))
    .sort((a, b) => a.dateId.localeCompare(b.dateId));
}

/**
 * Treinos salvos na MESMA semana (seg–dom) de `dateId`. Usado pela não-repetição
 * e pela meta de volume semanal. @param {string} dateId @returns {TreinoSalvo[]}
 */
export function treinosDaSemana(dateId) {
  const seg = segundaDaSemana(dateId);
  const ini = dateIdDe(seg);
  const domD = new Date(seg); domD.setDate(domD.getDate() + 6);
  const fim = dateIdDe(domD);
  return Object.entries(estado.treinos)
    .filter(([d]) => d >= ini && d <= fim)
    .map(([d, t]) => ({ ...t, dateId: d }))
    .sort((a, b) => a.dateId.localeCompare(b.dateId));
}

/** Lista os mesIds ('YYYY-MM') que têm treinos salvos (mais recente primeiro). */
export function listarMeses() {
  return [...new Set(Object.keys(estado.treinos).map((d) => d.slice(0, 7)))].sort().reverse();
}
