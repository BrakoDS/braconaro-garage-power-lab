// @ts-check
/**
 * Consentimento LGPD (termo de adesão) — um doc por aluno em
 * `consentimentos/{email}`. Guarda a versão do termo aceita e quando, para
 * detectar se o termo mudou e pedir aceite de novo.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

/** Versão atual do termo — mude este valor se o texto mudar substancialmente (pede aceite de novo). */
export const VERSAO_TERMO = '1.0';

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

/** Retorna { versao, aceitoEm } ou null se nunca aceitou. @param {string} email */
export async function carregarConsentimento(email) {
  if (!CLOUD_ATIVO || !emailKey(email)) return null;
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'consentimentos', emailKey(email)));
  return snap.exists() ? snap.data() : null;
}

/** Registra o aceite da versão atual do termo. @param {string} email */
export async function registrarAceite(email) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'consentimentos', emailKey(email)), {
    versao: VERSAO_TERMO, aceitoEm: Date.now(),
  });
}

/** true se o aluno precisa aceitar (nunca aceitou, ou aceitou versão antiga). */
export function precisaAceitar(consentimento) {
  return !consentimento || consentimento.versao !== VERSAO_TERMO;
}
