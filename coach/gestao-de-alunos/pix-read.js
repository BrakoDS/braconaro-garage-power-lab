// @ts-check
/**
 * O livro-caixa do Pix dinâmico (Mercado Pago) — lado coach.
 *
 * `gestao/{uid}/cobrancasPix/{paymentId}`: cada Pix gerado pelo Portal. Quem
 * cria e aprova é o servidor (functions/src/pix-servico.ts, no webhook do
 * Mercado Pago); quando há algo para o coach — Pix aprovado, divergente ou
 * estornado —, o webhook liga `avisarGestao`. Daqui a Gestão lê essas e, depois
 * de tratar (pix-baixa.js), desliga a bandeira.
 *
 * Sem nuvem (a vitrine, o modo local), não lê nada.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2';
let _db = null, _fns = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDocs: fsMod.getDocs, collection: fsMod.collection, query: fsMod.query, where: fsMod.where, updateDoc: fsMod.updateDoc };
}

/** As cobranças com algo a tratar (`avisarGestao == true`). Igualdade num campo só: sem índice composto. @param {string} uid */
export async function listarPixParaTratar(uid) {
  if (!uid || !cloudAtivo()) return [];
  await init();
  const col = _fns.collection(_db, 'gestao', uid, 'cobrancasPix');
  const snap = await _fns.getDocs(_fns.query(col, _fns.where('avisarGestao', '==', true)));
  const arr = [];
  snap.forEach((d) => arr.push({ ...d.data(), paymentId: d.id }));
  return arr;
}

/** Desliga a bandeira e anota quando foi tratada. @param {string} uid @param {string} paymentId @param {number} em */
export async function marcarPixTratado(uid, paymentId, em) {
  if (!uid || !cloudAtivo()) return;
  await init();
  await _fns.updateDoc(_fns.doc(_db, 'gestao', uid, 'cobrancasPix', paymentId), { avisarGestao: false, aplicadaEm: em });
}
