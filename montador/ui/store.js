// @ts-check
/**
 * Estado persistente da aplicação em localStorage.
 * Sem backend: alunos e preferências ficam no navegador do coach.
 *
 * @typedef {Object} Aluno
 * @property {string} id
 * @property {string} nome
 * @property {'iniciante'|'intermediario'|'avancado'} nivel
 * @property {string} combinacaoId   id de uma combinação de frequencias.js
 * @property {Partial<Record<string, import('../config/modalidades.js').ModalidadeId>>} modalidadesPorDia
 */

const CHAVE = 'braconaro_montador_v1';

/** @returns {{ alunos: Aluno[] }} */
export function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignora */ }
  return { alunos: [] };
}

/** @param {{ alunos: Aluno[] }} estado */
export function salvar(estado) {
  localStorage.setItem(CHAVE, JSON.stringify(estado));
}

const estado = carregar();

export function listarAlunos() { return estado.alunos; }

/** @param {Omit<Aluno,'id'>} dados */
export function adicionarAluno(dados) {
  const aluno = { id: 'a_' + Date.now().toString(36), ...dados };
  estado.alunos.push(aluno);
  salvar(estado);
  return aluno;
}

/** @param {string} id @param {Partial<Aluno>} patch */
export function atualizarAluno(id, patch) {
  const a = estado.alunos.find((x) => x.id === id);
  if (a) { Object.assign(a, patch); salvar(estado); }
  return a;
}

/** @param {string} id */
export function removerAluno(id) {
  const i = estado.alunos.findIndex((x) => x.id === id);
  if (i >= 0) { estado.alunos.splice(i, 1); salvar(estado); }
}
