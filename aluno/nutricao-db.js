// @ts-check
/**
 * Nutrição Básica — persistência do gasto calórico de treino (lado aluno).
 *
 * Cada aluno tem um documento próprio em `gastoTreinos/{email}` com o nível de
 * atividade escolhido e a lista de lançamentos ({ id, data, calorias }). A
 * regra do Firestore permite ao aluno ler/gravar só o doc do próprio e-mail.
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

/** Carrega { nivelAtividade, gastos:[] } do aluno (defaults se ainda não existe). @param {string} email */
export async function carregarNutricao(email) {
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'gastoTreinos', emailKey(email)));
  const d = snap.exists() ? snap.data() : {};
  return { nivelAtividade: d.nivelAtividade || '1.55', gastos: Array.isArray(d.gastos) ? d.gastos : [] };
}

/** Grava o documento inteiro (nível + lançamentos). @param {string} email @param {{nivelAtividade:string, gastos:any[]}} dados */
export async function salvarNutricao(email, dados) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'gastoTreinos', emailKey(email)), {
    nivelAtividade: dados.nivelAtividade || '1.55',
    gastos: JSON.parse(JSON.stringify(dados.gastos || [])),
    atualizadoEm: Date.now(),
  });
}
