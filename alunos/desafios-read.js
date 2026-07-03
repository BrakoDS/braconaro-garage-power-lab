// @ts-check
/**
 * Leitura do progresso de desafios do aluno (lado coach). Doc `desafios/{email}`.
 * A regra permite ao coach ler. Retorna a lista de conclusões (com categoria).
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

/** Conclusões de desafios do aluno (array de {id, semana, categoria, em}). @param {string} email */
export async function carregarConclusoesDesafios(email) {
  if (!cloudAtivo() || !emailKey(email)) return [];
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'desafios', emailKey(email)));
  if (!snap.exists()) return [];
  const d = snap.data();
  return Array.isArray(d.concluidos) ? d.concluidos : [];
}
