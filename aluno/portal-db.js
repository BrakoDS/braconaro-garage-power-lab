// @ts-check
/**
 * Leitura do Portal do Aluno (lado aluno).
 *
 * Lê a fatia publicada pelo coach em `portal/{email}` (Firestore). O e-mail é
 * o do próprio aluno logado — a regra do Firestore só permite ler o documento
 * cujo id == o e-mail autenticado. Reaproveita o app Firebase do login.
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

/** Carrega a fatia do aluno (ou null se ainda não foi publicada pelo coach). @param {string} email */
export async function carregarPortal(email) {
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'portal', emailKey(email)));
  return snap.exists() ? snap.data() : null;
}
