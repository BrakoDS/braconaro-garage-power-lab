// @ts-check
/**
 * Treino do dia (lado aluno).
 *
 * Lê o doc compartilhado `treinoPortal/{mesId}` que o Montador publica (um treino
 * por data em `dias[dateId]`, igual para todos). A regra permite qualquer aluno
 * autenticado ler. Resolve o treino pela data de hoje. Silencioso em falha.
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
/** 'YYYY-MM-DD' de uma data (local). */
export function dateIdDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DOW = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex' };
const NOME_DIA = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };

/** Segunda-feira da semana de uma data. */
function segundaDaSemana(d) {
  const x = new Date(d);
  const dow = x.getDay(); // 0=dom..6=sab
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

/** Lê o doc do mês atual (treinos por data). Retorna o doc ou null. */
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
 * A partir do doc do mês, resolve o treino da DATA de hoje e monta a faixa da
 * semana (dia da semana → modalidade, das datas seg–sex desta semana).
 * @param {any} doc  documento de treinoPortal/{mesId}
 * @returns {{ diaHoje:string|null, treino:any|null, descanso:boolean, semanaMods:object }|null}
 */
export function resolverHoje(doc) {
  if (!doc || !doc.dias) return null;
  const hoje = new Date();
  const diaHoje = DOW[hoje.getDay()] || null; // null = fim de semana (só p/ destaque da faixa)
  const treino = doc.dias[dateIdDe(hoje)] || null;
  const semanaMods = {};
  const seg = segundaDaSemana(hoje);
  ['seg', 'ter', 'qua', 'qui', 'sex'].forEach((k, i) => {
    const d = new Date(seg); d.setDate(d.getDate() + i);
    const t = doc.dias[dateIdDe(d)];
    if (t) semanaMods[k] = t.modalidade;
  });
  return { diaHoje, treino, descanso: !treino, semanaMods };
}

export { NOME_DIA };
