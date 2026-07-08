// @ts-check
/**
 * Treino do dia (lado aluno).
 *
 * Lê o doc compartilhado `treinoPortal/{mesId}` que o Montador publica (programa
 * do mês, igual para todos). A regra permite qualquer aluno autenticado ler.
 * Escolhe a semana e o dia de hoje pela grade. Silencioso em falha.
 */
import { firebaseConfig } from '../montador/cloud-config.js';

const V = '10.12.2';
let _db = null, _fns = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc };
}

/** 'YYYY-MM' de hoje. */
export function mesIdHoje(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Semana do mês (1..5). */
export function semanaDoMes(d = new Date()) { return Math.ceil(d.getDate() / 7); }

const DOW = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex' };
const NOME_DIA = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };

/** Lê o programa do mês atual. Retorna o doc ou null. */
export async function carregarTreinoDoMes() {
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'treinoPortal', mesIdHoje()));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('Treino do dia:', e?.code || e);
    return null;
  }
}

/**
 * A partir do doc do mês, resolve o treino de HOJE.
 * @param {any} doc  documento de treinoPortal/{mesId}
 * @returns {{ semana:number, grade:object, diaHoje:string, treino:any|null, descanso:boolean }|null}
 */
export function resolverHoje(doc) {
  if (!doc || !doc.semanas) return null;
  const hoje = new Date();
  const semana = semanaDoMes(hoje);
  const sem = doc.semanas[semana] || doc.semanas[String(semana)];
  const grade = sem?.grade || {};
  const diaHoje = DOW[hoje.getDay()] || null; // null = fim de semana
  const treino = diaHoje && sem ? (sem.dias || []).find((d) => d.dia === diaHoje) || null : null;
  return { semana, grade, diaHoje, treino, descanso: !treino };
}

export { NOME_DIA };
