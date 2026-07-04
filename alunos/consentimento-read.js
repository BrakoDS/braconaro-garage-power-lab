// @ts-check
/**
 * Leitura do consentimento LGPD do aluno (lado coach). Doc `consentimentos/{email}`.
 * A regra permite ao coach ler (auditoria — comprovar que o aluno aceitou).
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

/** Retorna { versao, aceitoEm } ou null. @param {string} email */
export async function carregarConsentimentoLGPD(email) {
  if (!cloudAtivo() || !emailKey(email)) return null;
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'consentimentos', emailKey(email)));
  return snap.exists() ? snap.data() : null;
}
