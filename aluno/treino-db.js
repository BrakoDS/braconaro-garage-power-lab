// @ts-check
/**
 * Cronograma de treinos (lado aluno).
 *
 * Lê o doc compartilhado `treinoPortal/{mesId}` que o Montador publica (um treino
 * por data em `dias[dateId]`, igual para todos). A regra permite qualquer aluno
 * autenticado ler, inclusive meses passados — é o que deixa o aluno navegar o
 * cronograma para trás. Silencioso em falha.
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

/**
 * Cache por mês. O cronograma deixa o aluno navegar para trás e para a frente, e
 * sem isto cada toque nas setas seria uma leitura nova do mesmo documento.
 * Guarda inclusive o `null` de mês sem treino — é resposta, não falha.
 */
const _meses = new Map();

/**
 * Lê o doc de um mês (treinos por data). Sem argumento, o mês atual.
 * @param {string} [mesId] 'YYYY-MM'
 * @returns {Promise<any|null>} o doc, ou null se o mês não tem treino publicado
 */
export async function carregarTreinoDoMes(mesId = mesIdHoje()) {
  if (_meses.has(mesId)) return _meses.get(mesId);
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'treinoPortal', mesId));
    const doc = snap.exists() ? snap.data() : null;
    _meses.set(mesId, doc);
    return doc;
  } catch (e) {
    console.warn('Treino do mês:', e?.code || e);
    return null; // sem cache: falha de rede merece nova tentativa
  }
}
