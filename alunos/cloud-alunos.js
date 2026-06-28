// @ts-check
/**
 * Sincronização em nuvem da Gestão de Alunos (Firebase Firestore).
 *
 * Guarda um documento por coach em `gestao/{uid}` — separado do montador
 * (que usa `coaches/{uid}`), para que um app não sobrescreva o outro.
 *
 * Reaproveita o app Firebase já inicializado pelo login (montador/ui/cloud.js):
 * usa getApp() se existir, senão inicializa. A apiKey é pública por design;
 * a segurança vem do login + das regras do Firestore (ver /firestore.rules).
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
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc };
}

/** Lê o documento do coach (ou null). @param {string} uid */
export async function carregar(uid) {
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'gestao', uid));
  return snap.exists() ? snap.data() : null;
}

/** Grava o estado completo no documento do coach. @param {string} uid @param {any} data */
export async function salvar(uid, data) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'gestao', uid), JSON.parse(JSON.stringify(data)));
}
