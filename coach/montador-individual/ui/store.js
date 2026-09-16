// @ts-check
/**
 * Estado do Montador Individual: um treino base por DATA, em `treinos[dateId]`.
 *
 * Mesma forma do montador atual — um treino por dia, igual para a turma — e a
 * individualidade vem depois, derivada do perfil de cada aluno (Etapa 4). Por
 * isso aqui não há nada por aluno: o que se guarda é o treino da aula.
 *
 * `config` é o único campo leve do documento na nuvem. Os alunos NÃO moram aqui:
 * eles vêm da Gestão (`gestao/{uid}`), que é a fonte da verdade do perfil.
 *
 * @typedef {import('../core/treino-base.js').TreinoBase} TreinoBase
 */
import { faixaDaSemana } from '../../../compartilhado/regras/datas-treino.js';

export { dateIdDe, mesIdDe, dataDe, diaSemanaDe, rotuloMes } from '../../../compartilhado/regras/datas-treino.js';

const CHAVE = 'braconaro_montador_individual_v1';

/** @returns {{config: Record<string, any>, treinos: Record<string, any>}} */
export function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (raw) {
      const e = JSON.parse(raw);
      return { config: e.config || {}, treinos: e.treinos || {} };
    }
  } catch (e) { /* localStorage indisponível ou corrompido: começa vazio */ }
  return { config: {}, treinos: {} };
}

const estado = carregar();

/** @param {object} est */
function salvar(est) {
  localStorage.setItem(CHAVE, JSON.stringify(est));
  if (_aoSalvar) _aoSalvar(est); // espelha na nuvem (se ligada)
}

// ---------- ponte com a nuvem ----------
/** @type {((est:object)=>void)|null} */
let _aoSalvar = null;
/** Registra um callback chamado a cada salvamento. @param {(est:object)=>void} cb */
export function aoSalvar(cb) { _aoSalvar = cb; }
/** Substitui o estado local pelo da nuvem, sem disparar envio de volta. @param {any} novo */
export function setEstado(novo) {
  estado.config = novo.config || {};
  estado.treinos = novo.treinos || {};
  localStorage.setItem(CHAVE, JSON.stringify(estado));
}
/** Snapshot do estado atual (para enviar à nuvem). */
export function getEstado() { return estado; }

// ---------- config ----------
export function getConfig() { return estado.config; }
/** @param {object} patch */
export function setConfig(patch) { Object.assign(estado.config, patch); salvar(estado); }

// ---------- treinos por data ----------
/** @param {string} dateId */
export function getTreino(dateId) { return estado.treinos[dateId] ?? null; }

/** @param {string} dateId @param {any} treino */
export function salvarTreino(dateId, treino) {
  estado.treinos[dateId] = { ...treino, dateId };
  salvar(estado);
}

/** @param {string} dateId */
export function removerTreino(dateId) {
  if (estado.treinos[dateId]) { delete estado.treinos[dateId]; salvar(estado); }
}

/** Treinos de um mês ('YYYY-MM'), em ordem de data. @param {string} mesId */
export function listarTreinosDoMes(mesId) {
  return Object.entries(estado.treinos)
    .filter(([dateId]) => dateId.startsWith(mesId + '-'))
    .map(([dateId, t]) => ({ ...t, dateId }))
    .sort((a, b) => a.dateId.localeCompare(b.dateId));
}

/**
 * Treinos da MESMA semana (seg–dom) de `dateId`. É o que alimenta o aviso de
 * repetição e, na Etapa 4, a meta de volume do aluno.
 * @param {string} dateId
 */
export function treinosDaSemana(dateId) {
  const { ini, fim } = faixaDaSemana(dateId);
  return Object.entries(estado.treinos)
    .filter(([d]) => d >= ini && d <= fim)
    .map(([d, t]) => ({ ...t, dateId: d }))
    .sort((a, b) => a.dateId.localeCompare(b.dateId));
}

/** Meses com treino salvo, do mais recente para o mais antigo. */
export function listarMeses() {
  return [...new Set(Object.keys(estado.treinos).map((d) => d.slice(0, 7)))].sort().reverse();
}
