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
 * @property {Partial<Record<string, import('../../../compartilhado/config/modalidades.js').ModalidadeId>>} modalidadesPorDia
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
 * @property {Record<string, number>=} volPorMusculo  volume por músculo, em séries equivalentes — ausente em dia salvo antes de 15/09/2026
 */

import { faixaDaSemana } from '../../../compartilhado/regras/datas-treino.js';

const CHAVE = 'braconaro_montador_v2';

export function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (raw) {
      const e = JSON.parse(raw);
      // `programas` (formato semanal antigo) fica preservado no cru p/ não apagar
      // dados legados, mas não é mais exposto por funções — o fluxo novo usa `treinos`.
      // Na nuvem ele foi para `coaches/{uid}/arquivo/programas` em 15/09/2026, e o
      // login devolve este campo vazio; aqui continua tolerado para quem ainda o tem.
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
// Reexportados de `compartilhado/regras/datas-treino.js`: o montador individual
// usa as mesmas contas, e duas copias delas divergiriam no primeiro conserto de
// fuso. Quem importa do store continua importando do store.
export { dateIdDe, mesIdDe, dataDe, diaSemanaDe, semanaDoMes, rotuloMes } from '../../../compartilhado/regras/datas-treino.js';

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
  const { ini, fim } = faixaDaSemana(dateId);
  return Object.entries(estado.treinos)
    .filter(([d]) => d >= ini && d <= fim)
    .map(([d, t]) => ({ ...t, dateId: d }))
    .sort((a, b) => a.dateId.localeCompare(b.dateId));
}

/** Lista os mesIds ('YYYY-MM') que têm treinos salvos (mais recente primeiro). */
export function listarMeses() {
  return [...new Set(Object.keys(estado.treinos).map((d) => d.slice(0, 7)))].sort().reverse();
}
