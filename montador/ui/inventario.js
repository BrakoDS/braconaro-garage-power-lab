// @ts-check
/**
 * Ponte Montador ↔ Academia.
 *
 * Lê o INVENTÁRIO real do coach (app /academia, mesmo Firestore/localStorage)
 * e o aplica ao motor de viabilidade do gerador: a partir daí o montador só
 * monta treinos com os equipamentos que existem e nas quantidades cadastradas.
 *
 * Os IDs de equipamento batem entre os dois apps (a Academia foi semeada deste
 * mesmo catálogo). Equipamento removido na Academia → 0 unidades → o gerador
 * deixa de usar exercícios que dependem dele.
 */
import * as academia from '../../academia/db.js';
import { aplicarDisponibilidade } from '../data/equipamentos.js';

/** Aplica o inventário local da Academia ao gerador. @returns {number} qtd de itens aplicados */
export function aplicarInventarioAcademia() {
  const inv = academia.listarInventario();
  if (!inv.length) return 0; // sem inventário: mantém o catálogo estático (não zera tudo)
  /** @type {Record<string, number>} */
  const map = {};
  for (const e of inv) map[e.id] = Math.max(0, Number(e.quantidade) || 0);
  aplicarDisponibilidade(map);
  return inv.length;
}

/** Puxa o inventário da nuvem (se logado) antes de aplicar. @param {string} [uid] */
export async function sincronizarInventarioAcademia(uid) {
  if (uid) { try { await academia.iniciarSync(uid); } catch { /* offline/regra: segue no local */ } }
}
