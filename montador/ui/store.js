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
 * @property {Sessao[]} [sessoes]   Histórico de treinos salvos
 *
 * @typedef {Object} Sessao
 * @property {string} id
 * @property {string} data          ISO date
 * @property {'dia'|'semana'} tipo
 * @property {string} resumo        Texto curto (modalidade(s), nº exercícios)
 * @property {any} dados            Snapshot compacto do treino/plano
 */

const CHAVE = 'braconaro_montador_v1';

/** @returns {{ alunos: Aluno[], config: { grade?: Object, nivelRef?: string } }} */
export function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (raw) { const e = JSON.parse(raw); return { alunos: e.alunos || [], config: e.config || {} }; }
  } catch (e) { /* ignora */ }
  return { alunos: [], config: {} };
}

/** @param {object} estado */
export function salvar(estado) {
  localStorage.setItem(CHAVE, JSON.stringify(estado));
}

const estado = carregar();

// ---------- configuração do box (grade da semana) ----------
export function getConfig() { return estado.config; }
/** @param {object} patch */
export function setConfig(patch) { Object.assign(estado.config, patch); salvar(estado); }

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

// ---------- histórico de sessões ----------

/** @param {string} alunoId @param {Omit<Sessao,'id'>} sessao */
export function salvarSessao(alunoId, sessao) {
  const a = estado.alunos.find((x) => x.id === alunoId);
  if (!a) return null;
  if (!a.sessoes) a.sessoes = [];
  const reg = { id: 's_' + Date.now().toString(36), ...sessao };
  a.sessoes.unshift(reg); // mais recente primeiro
  salvar(estado);
  return reg;
}

/** @param {string} alunoId @returns {Sessao[]} */
export function listarSessoes(alunoId) {
  return estado.alunos.find((x) => x.id === alunoId)?.sessoes ?? [];
}

/** @param {string} alunoId @param {string} sessaoId */
export function removerSessao(alunoId, sessaoId) {
  const a = estado.alunos.find((x) => x.id === alunoId);
  if (!a?.sessoes) return;
  const i = a.sessoes.findIndex((s) => s.id === sessaoId);
  if (i >= 0) { a.sessoes.splice(i, 1); salvar(estado); }
}
