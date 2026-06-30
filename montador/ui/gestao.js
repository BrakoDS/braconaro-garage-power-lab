// @ts-check
/**
 * Ponte Montador → Gestão de Alunos.
 *
 * O montador não mantém mais a sua própria lista de alunos: ele usa os alunos
 * cadastrados no app /alunos (mesmo Firestore `gestao/{uid}` / localStorage).
 * Cada aluno traz `nome`, `nivel` e `diasTreino` (dias da semana) — este último
 * usado pelo acumulado mensal do Histórico.
 */
import * as gestaoDb from '../../alunos/db.js';

/** @returns {any[]} alunos da Gestão (mais recentes primeiro) */
export function listarAlunos() {
  return gestaoDb.listar();
}

/** Puxa os alunos da nuvem (se logado) para o cache local. @param {string} [uid] */
export async function sincronizarAlunos(uid) {
  if (uid) { try { await gestaoDb.iniciarSync(uid); } catch { /* offline/regra: segue no local */ } }
}
