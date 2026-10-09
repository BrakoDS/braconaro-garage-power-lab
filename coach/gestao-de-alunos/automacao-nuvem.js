// @ts-check
/**
 * As mensagens já enviadas ou descartadas na Fila de mensagens, na nuvem — o
 * que faz o anti-spam valer entre aparelhos (o celular não sugere de novo o
 * que o notebook já mandou).
 *
 * Um documento só, `gestao/{uid}/automacao/feitas`, com uma entrada por chave:
 * `{ 'recibo:Ana01:2026-10': { status: 'enviada', em } }`. Só a chave e o
 * status: nada de nome, telefone ou texto. Cada marca sobe sozinha, por
 * `merge` — dois aparelhos marcando ao mesmo tempo não apagam a marca um do
 * outro. A regra de gestao/{uid}/{sub=**} (o próprio coach) já cobre o caminho.
 *
 * Sem nuvem (a vitrine, o modo local) tudo aqui devolve null e não faz nada.
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
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc, deleteField: fsMod.deleteField };
}

const ref = (uid) => _fns.doc(_db, 'gestao', uid, 'automacao', 'feitas');

/** As chaves feitas guardadas na nuvem, ou null sem nuvem. @param {string} uid @returns {Promise<Record<string, any> | null>} */
export async function lerFeitas(uid) {
  if (!uid || !cloudAtivo()) return null;
  await init();
  const snap = await _fns.getDoc(ref(uid));
  return snap.exists() ? snap.data() || {} : {};
}

/** Sobe chaves feitas (só as dadas; as outras ficam). @param {string} uid @param {Record<string, any>} feitas */
export async function gravarFeitas(uid, feitas) {
  if (!uid || !cloudAtivo() || !Object.keys(feitas).length) return;
  await init();
  await _fns.setDoc(ref(uid), feitas, { merge: true });
}

/** Apaga chaves da nuvem (as que passaram do prazo). @param {string} uid @param {string[]} chaves */
export async function apagarFeitas(uid, chaves) {
  if (!uid || !cloudAtivo() || !chaves.length) return;
  await init();
  await _fns.setDoc(ref(uid), Object.fromEntries(chaves.map((k) => [k, _fns.deleteField()])), { merge: true });
}
