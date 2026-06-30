// @ts-check
/**
 * Sincronização em nuvem da Academia (Firebase Firestore).
 *
 * Guarda um documento por coach em `academia/{uid}` — separado do montador
 * (`coaches/{uid}`) e dos alunos (`gestao/{uid}`), para um app não sobrescrever
 * o outro. Reaproveita o app Firebase já inicializado pelo login.
 * A apiKey é pública por design; a segurança vem do login + regras do Firestore.
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
  const snap = await _fns.getDoc(_fns.doc(_db, 'academia', uid));
  return snap.exists() ? snap.data() : null;
}

/** Grava o estado completo no documento do coach. @param {string} uid @param {any} data */
export async function salvar(uid, data) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'academia', uid), JSON.parse(JSON.stringify(data)));
}
