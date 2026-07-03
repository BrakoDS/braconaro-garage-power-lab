// @ts-check
/**
 * Leitura do gasto calórico de treino do aluno (lado coach).
 *
 * O aluno registra em `gastoTreinos/{email}` (via Portal do Aluno). A regra do
 * Firestore permite ao coach (dono de gestao/{uid}) ler qualquer um desses docs
 * para acompanhamento. Reaproveita o app Firebase já inicializado.
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
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, collection: fsMod.collection, getDocs: fsMod.getDocs };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** Retorna { nivelAtividade, gastos:[] } do aluno (ou null se não houver). @param {string} email */
export async function carregarGastoTreino(email) {
  if (!cloudAtivo() || !emailKey(email)) return null;
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'gastoTreinos', emailKey(email)));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { nivelAtividade: d.nivelAtividade || '', gastos: Array.isArray(d.gastos) ? d.gastos : [] };
}

/** Lê todos os docs de `gastoTreinos` numa só consulta. @returns {Promise<Map<string, any[]>>} email → gastos[] */
export async function carregarTodosGastos() {
  if (!cloudAtivo()) return new Map();
  await init();
  const snap = await _fns.getDocs(_fns.collection(_db, 'gastoTreinos'));
  const map = new Map();
  snap.forEach((doc) => { const d = doc.data(); map.set(doc.id, Array.isArray(d.gastos) ? d.gastos : []); });
  return map;
}
