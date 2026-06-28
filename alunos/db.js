// @ts-check
/**
 * Camada de dados da Gestão de Alunos.
 *
 * Hoje persiste em localStorage (simples e offline). Toda a leitura/escrita
 * passa por aqui, então trocar por Firebase/Firestore depois é só reimplementar
 * estas funções — o resto do app não muda.
 */
const KEY = 'braconaro_gestao_alunos_v1';

function ler() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '');
    if (d && typeof d === 'object' && Array.isArray(d.alunos)) return d;
  } catch {}
  return { seq: 0, alunos: [] };
}
function gravar(d) { localStorage.setItem(KEY, JSON.stringify(d)); }

/** @returns {any[]} todos os alunos (mais recentes primeiro) */
export function listar() {
  return ler().alunos.slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

/** @param {string} id */
export function obter(id) {
  return ler().alunos.find((a) => a.id === id) || null;
}

/** Cria um aluno e retorna o registro (com ID gerado). @param {any} dados */
export function criar(dados) {
  const d = ler();
  d.seq += 1;
  const id = String(d.seq).padStart(3, '0');
  const aluno = {
    status: 'ativo',
    avaliacoes: [],
    criadoEm: Date.now(),
    ...dados,
    id, // garante que o id gerado não seja sobrescrito
  };
  d.alunos.push(aluno);
  gravar(d);
  return aluno;
}

/** Atualiza campos de um aluno. @param {string} id @param {any} dados */
export function atualizar(id, dados) {
  const d = ler();
  const a = d.alunos.find((x) => x.id === id);
  if (!a) return null;
  Object.assign(a, dados);
  gravar(d);
  return a;
}

/** Remove um aluno. @param {string} id */
export function remover(id) {
  const d = ler();
  d.alunos = d.alunos.filter((a) => a.id !== id);
  gravar(d);
}

/** Adiciona uma avaliação (numeração automática). @param {string} id @param {any} av */
export function addAvaliacao(id, av) {
  const d = ler();
  const a = d.alunos.find((x) => x.id === id);
  if (!a) return null;
  a.avaliacoes = a.avaliacoes || [];
  const num = (a.avaliacoes.reduce((m, x) => Math.max(m, x.num || 0), 0) || 0) + 1;
  const aval = { num, criadoEm: Date.now(), ...av };
  a.avaliacoes.push(aval);
  gravar(d);
  return aval;
}

/** Remove uma avaliação pelo número. @param {string} id @param {number} num */
export function removerAvaliacao(id, num) {
  const d = ler();
  const a = d.alunos.find((x) => x.id === id);
  if (!a || !a.avaliacoes) return;
  a.avaliacoes = a.avaliacoes.filter((x) => x.num !== num);
  gravar(d);
}
