// @ts-check
/**
 * Registro de cargas (lado aluno). Doc por aluno em `cargas/{email}` com a lista
 * de séries registradas ({ id, exercicio, cargaKg, reps, data }). A regra do
 * Firestore permite ao aluno ler/gravar só o doc do próprio e-mail.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

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

/** Carrega { registros:[] } do aluno. @param {string} email */
export async function carregarCargas(email) {
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'cargas', emailKey(email)));
  const d = snap.exists() ? snap.data() : {};
  return { registros: Array.isArray(d.registros) ? d.registros : [] };
}

/** Grava a lista inteira. @param {string} email @param {{registros:any[]}} dados */
export async function salvarCargas(email, dados) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'cargas', emailKey(email)), {
    registros: JSON.parse(JSON.stringify(dados.registros || [])),
    atualizadoEm: Date.now(),
  });
}
