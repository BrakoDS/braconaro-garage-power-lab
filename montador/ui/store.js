// @ts-check
/**
 * Estado persistente em localStorage. Sem backend.
 *
 * Organização: o MÊS é a unidade. Cada SEMANA do mês tem UM programa (igual para
 * todos os alunos), salvo e "travado" — regerar só substituindo. O acumulado do
 * aluno no mês sai da soma dos dias que ele treina em cada semana salva.
 *
 * @typedef {Object} Aluno
 * @property {string} id
 * @property {string} nome
 * @property {'iniciante'|'intermediario'|'avancado'} nivel
 * @property {string} combinacaoId
 * @property {Partial<Record<string, import('../config/modalidades.js').ModalidadeId>>} modalidadesPorDia
 *
 * @typedef {Object} ProgramaSalvo
 * @property {string} mesId            'YYYY-MM'
 * @property {number} semana           semana do mês (1..5)
 * @property {string} geradoEm         ISO
 * @property {Object} grade
 * @property {string} nivelRef
 * @property {Array<{dia:string, modalidade:string, exercicios:Array, finalizador:any}>} dias
 * @property {Record<string, Record<string, number>>} volPorDia  volume por padrão por dia
 * @property {any} cenarios
 */

const CHAVE = 'braconaro_montador_v2';

export function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (raw) { const e = JSON.parse(raw); return { alunos: e.alunos || [], config: e.config || {}, programas: e.programas || {} }; }
  } catch (e) { /* ignora */ }
  return { alunos: [], config: {}, programas: {} };
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
  estado.programas = novo.programas || {};
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

// ---------- programas por mês/semana ----------
/** @param {string} mesId @param {number} semana @returns {ProgramaSalvo|null} */
export function getPrograma(mesId, semana) {
  return estado.programas[mesId]?.[semana] ?? null;
}
/** @param {string} mesId @param {number} semana @param {ProgramaSalvo} programa */
export function salvarPrograma(mesId, semana, programa) {
  if (!estado.programas[mesId]) estado.programas[mesId] = {};
  estado.programas[mesId][semana] = programa;
  salvar(estado);
}
/** @param {string} mesId @returns {ProgramaSalvo[]} ordenado por semana */
export function listarProgramasDoMes(mesId) {
  const mes = estado.programas[mesId] || {};
  return Object.values(mes).sort((a, b) => a.semana - b.semana);
}
/** Semanas anteriores a `semana` no mês (para o gerador usar histórico). */
export function programasAnteriores(mesId, semana) {
  return listarProgramasDoMes(mesId).filter((p) => p.semana < semana);
}
/** @param {string} mesId @param {number} semana */
export function removerPrograma(mesId, semana) {
  if (estado.programas[mesId]) { delete estado.programas[mesId][semana]; salvar(estado); }
}
/** Lista os mesIds que têm programas salvos (mais recente primeiro). */
export function listarMeses() {
  return Object.keys(estado.programas).sort().reverse();
}
