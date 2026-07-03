// @ts-check
/**
 * Desafios da semana (lado aluno).
 *  - lê a lista publicada pelo coach em `desafiosPortal/geral`;
 *  - lê/grava o progresso do próprio aluno em `desafios/{email}`
 *    ({ checks: { [desafioId]: [isoDates] }, concluidos: [{id, semana, em}] }).
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
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** Lista de desafios ATIVOS (mais recentes primeiro). Silencioso se falhar. */
export async function carregarDesafios() {
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'desafiosPortal', 'geral'));
    const arr = snap.exists() && Array.isArray(snap.data().desafios) ? snap.data().desafios : [];
    return arr.filter((d) => d && d.ativo !== false).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  } catch (e) { console.warn('Desafios:', e?.code || e); return []; }
}

/** Progresso do aluno. @param {string} email */
export async function carregarProgressoDesafios(email) {
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'desafios', emailKey(email)));
  const d = snap.exists() ? snap.data() : {};
  return { checks: (d.checks && typeof d.checks === 'object') ? d.checks : {}, concluidos: Array.isArray(d.concluidos) ? d.concluidos : [] };
}

/** Grava o progresso do aluno. @param {string} email @param {{checks:object, concluidos:any[]}} prog */
export async function salvarProgressoDesafios(email, prog) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'desafios', emailKey(email)), {
    checks: JSON.parse(JSON.stringify(prog.checks || {})),
    concluidos: JSON.parse(JSON.stringify(prog.concluidos || [])),
    atualizadoEm: Date.now(),
  });
}
