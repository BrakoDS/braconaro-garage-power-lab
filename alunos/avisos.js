// @ts-check
/**
 * Avisos da Academia (lado coach).
 *
 * Mural único publicado em `avisosPortal/geral` (Firestore) e lido por todos os
 * alunos no Portal. O coach edita numa cópia local (localStorage) e cada
 * mudança é reenviada inteira à nuvem. Degrada para só-local se a nuvem faltar.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

const KEY = 'braconaro_avisos_v1';
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

/* ---------- Cópia local ---------- */
export function listarAvisos() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || ''); if (Array.isArray(d)) return d; } catch {}
  return [];
}
function setLocal(arr) { localStorage.setItem(KEY, JSON.stringify(arr)); }

/** Salva a lista local e reenvia o mural inteiro à nuvem (silencioso se falhar). */
export async function salvarAvisos(arr) {
  setLocal(arr);
  if (!cloudAtivo()) return;
  try {
    await init();
    await _fns.setDoc(_fns.doc(_db, 'avisosPortal', 'geral'), { avisos: JSON.parse(JSON.stringify(arr)), atualizadoEm: Date.now() });
  } catch (e) { console.warn('Falha ao publicar avisos:', e?.code || e); }
}

/** Puxa o mural da nuvem para a cópia local (chamar no login, p/ multi-dispositivo). */
export async function sincronizarAvisos() {
  if (!cloudAtivo()) return listarAvisos();
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'avisosPortal', 'geral'));
    if (snap.exists() && Array.isArray(snap.data().avisos)) { setLocal(snap.data().avisos); }
  } catch (e) { console.warn('Falha ao sincronizar avisos:', e?.code || e); }
  return listarAvisos();
}
