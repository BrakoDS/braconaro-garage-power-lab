// @ts-check
/**
 * Leads da landing (formulário de aula experimental) — lado coach.
 * Coleção pública em escrita (qualquer visitante cria um lead), mas só o
 * coach (dono de gestao/{uid}) lê/atualiza/apaga — ver firestore.rules.
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
  _fns = { doc: fsMod.doc, getDocs: fsMod.getDocs, collection: fsMod.collection, updateDoc: fsMod.updateDoc, deleteDoc: fsMod.deleteDoc };
}

/** Todos os leads, mais recentes primeiro. */
export async function carregarLeads() {
  if (!cloudAtivo()) return [];
  await init();
  const snap = await _fns.getDocs(_fns.collection(_db, 'leads'));
  const arr = [];
  snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
  return arr.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

/** Atualiza o status de um lead: novo | contatado | convertido | descartado. */
export async function atualizarStatusLead(id, status) {
  await init();
  await _fns.updateDoc(_fns.doc(_db, 'leads', id), { status });
}

/** Apaga um lead. */
export async function excluirLead(id) {
  await init();
  await _fns.deleteDoc(_fns.doc(_db, 'leads', id));
}
