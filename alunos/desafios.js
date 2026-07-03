// @ts-check
/**
 * Desafios da semana (lado coach). Lista única publicada em
 * `desafiosPortal/geral` (Firestore) e lida por todos os alunos no Portal.
 * O coach edita numa cópia local (localStorage) e cada mudança reenvia a lista
 * inteira. Degrada para só-local se a nuvem faltar.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

const KEY = 'braconaro_desafios_v1';
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

export function listarDesafios() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || ''); if (Array.isArray(d)) return d; } catch {}
  return [];
}
function setLocal(arr) { localStorage.setItem(KEY, JSON.stringify(arr)); }

/** Salva a lista local e reenvia à nuvem (silencioso se falhar). */
export async function salvarDesafios(arr) {
  setLocal(arr);
  if (!cloudAtivo()) return;
  try {
    await init();
    await _fns.setDoc(_fns.doc(_db, 'desafiosPortal', 'geral'), { desafios: JSON.parse(JSON.stringify(arr)), atualizadoEm: Date.now() });
  } catch (e) { console.warn('Falha ao publicar desafios:', e?.code || e); }
}

/** Puxa a lista da nuvem para a cópia local (no login, p/ multi-dispositivo). */
export async function sincronizarDesafios() {
  if (!cloudAtivo()) return listarDesafios();
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'desafiosPortal', 'geral'));
    if (snap.exists() && Array.isArray(snap.data().desafios)) setLocal(snap.data().desafios);
  } catch (e) { console.warn('Falha ao sincronizar desafios:', e?.code || e); }
  return listarDesafios();
}
