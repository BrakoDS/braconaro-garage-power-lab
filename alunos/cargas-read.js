// @ts-check
/**
 * Leitura do registro de cargas do aluno (lado coach). Doc `cargas/{email}`,
 * que o aluno preenche no Portal. A regra permite ao coach ler.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

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
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** Retorna os registros de carga do aluno (ou []). @param {string} email */
export async function carregarCargasAluno(email) {
  if (!cloudAtivo() || !emailKey(email)) return [];
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'cargas', emailKey(email)));
  if (!snap.exists()) return [];
  const d = snap.data();
  return Array.isArray(d.registros) ? d.registros : [];
}
