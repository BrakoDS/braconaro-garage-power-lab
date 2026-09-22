// @ts-check
/**
 * Leitura da rotina de hábitos do aluno (lado coach). Doc `rotinas/{email}`.
 *
 * Quem grava é o **app mobile**: os blocos que o aluno montou no wizard mais os
 * dois hábitos obrigatórios (água e creatina) derivados do peso da avaliação, e o
 * `concluidos` de cada dia. O coach só lê.
 *
 * A regra do Firestore já previa esta leitura desde a Fase 2B:
 *
 *     match /rotinas/{email} {
 *       allow read, write: if request.auth.token.email == email;   // o aluno
 *       allow read: if exists(/databases/$(database)/documents/gestao/$(request.auth.uid));  // o coach
 *     }
 *
 * Ela ficou escrita à frente de um painel que não existia — este arquivo é a
 * ponta que faltava. A interpretação dos dados fica em
 * `compartilhado/regras/adesao.js`, que é puro e testado no Node; aqui é só o
 * transporte. Reaproveita o app Firebase já inicializado, no mesmo formato de
 * `desafios-read.js` e `nutricao-read.js`.
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
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, collection: fsMod.collection, getDocs: fsMod.getDocs };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/**
 * A rotina do aluno, crua. `null` quando o aluno ainda não abriu o app.
 *
 * Devolver `null` em vez de um objeto vazio é de propósito: o painel precisa
 * distinguir "não usa o app" de "usa e não está cumprindo".
 * @param {string} email
 * @returns {Promise<{blocos?: any[], concluidos?: Record<string, string[]>} | null>}
 */
export async function carregarRotinaAluno(email) {
  if (!cloudAtivo() || !emailKey(email)) return null;
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'rotinas', emailKey(email)));
  return snap.exists() ? snap.data() : null;
}

/**
 * Todas as rotinas numa só consulta — para a listagem geral de alunos.
 * @returns {Promise<Map<string, any>>} email → documento
 */
export async function carregarTodasRotinas() {
  if (!cloudAtivo()) return new Map();
  await init();
  const snap = await _fns.getDocs(_fns.collection(_db, 'rotinas'));
  const map = new Map();
  snap.forEach((doc) => map.set(doc.id, doc.data()));
  return map;
}
