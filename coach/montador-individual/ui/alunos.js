// @ts-check
/**
 * Ponte Montador Individual → Gestão de Alunos.
 *
 * O montador não tem lista própria de aluno: a ficha da Gestão é a fonte da
 * verdade do perfil (objetivo, nível, foco, restrições, dias de treino). Import
 * entre apps do coach é o padrão do projeto — o montador atual já faz isso.
 *
 * A gravação também passa por aqui: o painel da turma tem o atalho "aplicar
 * sempre para a Ana", que muda a FICHA dela, não o dia. Sem isso, o coach teria
 * de sair do montador, abrir a Gestão, achar o aluno e voltar — e não faria.
 */
import * as gestaoDb from '../../gestao-de-alunos/db.js';

/** Alunos da Gestão que treinam hoje no box (inativo não entra na turma). */
export function listarAlunos() {
  return gestaoDb.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
}

/** Puxa os alunos da nuvem para o cache local. @param {string} [uid] */
export async function sincronizarAlunos(uid) {
  if (uid) { try { await gestaoDb.iniciarSync(uid); } catch { /* offline ou sem regra: segue no local */ } }
}

/**
 * O perfil de treino de um aluno, no formato que `perfil-treino.js` espera.
 * @param {any} a ficha da Gestão
 */
export function perfilDe(a) {
  return {
    objetivo: a?.objetivo || '',
    foco: a?.foco || [],
    restricoes: a?.restricoes || [],
    metas: a?.metas || {},
  };
}

/**
 * Grava no perfil do aluno (ficha da Gestão) o que o coach decidiu que vale
 * sempre — foco, restrições, meta. Volta a ficha atualizada.
 * @param {string} id @param {any} patch
 */
export function atualizarPerfil(id, patch) {
  return gestaoDb.atualizar(id, patch);
}
