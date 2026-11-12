// @ts-check
/**
 * Os FECHAMENTOS DO MÊS na nuvem (Fase 1 · etapa 4): `gestao/{uid}/fechamentos/{AAAA-MM}`,
 * um documento por mês fechado. As regras (o retrato, aprovar, reabrir) moram
 * em fechamento-regras.js; aqui só se lê e se grava. A regra do Firestore que
 * já existe (`gestao/{uid}/{colecao}`) deixa só o coach ler e gravar ali.
 *
 * Não confundir com `sistema/fechamento`, que é a marca dos feriados (crédito
 * de box fechado, etapa 2).
 *
 * A Gestão ouve a coleção ao vivo: um fechamento aprovado noutro aparelho chega
 * aqui sozinho, e as telas ouvem `FECHAMENTOS_MUDARAM`. Sem nuvem (a vitrine
 * local), guarda no localStorage deste navegador, para dar para testar.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { emit, EVENTOS } from './estado.js?v=39';

const V = '10.12.2';
const CHAVE_LOCAL = 'braconaro_fechamentos_v1';
let _db = null, _fns = null;
/** @type {Record<string, any>} */
let _fechamentos = {};
/** @type {null | (() => void)} */
let _pararDeOuvir = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, setDoc: fsMod.setDoc, collection: fsMod.collection, onSnapshot: fsMod.onSnapshot };
}

/** O que está no localStorage (modo local). */
function lerLocal() {
  try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '{}') || {}; } catch { return {}; }
}

/** @param {Record<string, any>} mapa */
function definir(mapa) {
  _fechamentos = mapa;
  emit(EVENTOS.FECHAMENTOS_MUDARAM);
}

/** Os fechamentos conhecidos agora, por mês (`AAAA-MM`). */
export function fechamentos() { return _fechamentos; }

/** O fechamento de um mês, ou null. @param {string} mesId */
export function fechamentoDe(mesId) { return _fechamentos[mesId] || null; }

/**
 * Começa a ouvir os fechamentos do coach (uma vez por sessão). Sem nuvem, lê o
 * do navegador.
 * @param {string|null} uid
 */
export async function ouvirFechamentos(uid) {
  if (!cloudAtivo() || !uid) { definir(lerLocal()); return; }
  if (_pararDeOuvir) return;
  await init();
  _pararDeOuvir = _fns.onSnapshot(_fns.collection(_db, 'gestao', uid, 'fechamentos'), (/** @type {any} */ s) => {
    /** @type {Record<string, any>} */ const mapa = {};
    s.forEach((/** @type {any} */ d) => { mapa[d.id] = d.data(); });
    definir(mapa);
  }, (/** @type {any} */ e) => console.warn('[fechamentos] não deu para ouvir os fechamentos.', e?.code || e));
}

/**
 * Grava o documento de um mês (aprovado ou reaberto), inteiro. O retrato vai
 * pelo JSON para não levar `undefined`, que o Firestore recusa.
 * @param {string|null} uid @param {string} mesId @param {any} doc
 */
export async function gravarFechamento(uid, mesId, doc) {
  const limpo = JSON.parse(JSON.stringify(doc));
  if (!cloudAtivo() || !uid) {
    const mapa = { ...lerLocal(), [mesId]: limpo };
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(mapa)); } catch (e) { console.warn('[fechamentos] o navegador não guardou.', e); }
    definir(mapa);
    return;
  }
  await init();
  await _fns.setDoc(_fns.doc(_db, 'gestao', uid, 'fechamentos', mesId), limpo);
  // O onSnapshot traz de volta; o aviso imediato deixa a tela responder já.
  definir({ ..._fechamentos, [mesId]: limpo });
}
