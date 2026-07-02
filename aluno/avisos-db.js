// @ts-check
/**
 * Leitura dos Avisos da Academia (lado aluno).
 *
 * Lê o mural único `avisosPortal/geral` (Firestore). A regra permite qualquer
 * aluno autenticado ler. Reaproveita o app Firebase já inicializado no login.
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

/** Retorna os avisos ativos (mais recentes primeiro). Silencioso se falhar. */
export async function carregarAvisos() {
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'avisosPortal', 'geral'));
    const arr = snap.exists() && Array.isArray(snap.data().avisos) ? snap.data().avisos : [];
    return arr.filter((a) => a && a.ativo !== false).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  } catch (e) {
    console.warn('Avisos:', e?.code || e);
    return [];
  }
}
