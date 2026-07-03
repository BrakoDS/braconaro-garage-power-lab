// @ts-check
/**
 * Leitura do ranking do box (lado aluno). Doc único `rankingPortal/geral`,
 * publicado pelo coach. Qualquer aluno autenticado lê.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

const V = '10.12.2';
let _db = null, _fns = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc };
}

/** Retorna { mes, itens:[{nome, treinos}] } ou null. */
export async function carregarRanking() {
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'rankingPortal', 'geral'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { mes: d.mes || '', itens: Array.isArray(d.itens) ? d.itens : [] };
  } catch (e) { console.warn('Ranking:', e?.code || e); return null; }
}
