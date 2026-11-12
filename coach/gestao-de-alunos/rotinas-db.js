// @ts-check
/**
 * As LISTAS DA ROTINA na nuvem (Fase 1 · etapa 8): `gestao/{uid}/rotinas/{AAAA-MM-DD}`,
 * uma por dia, gravada pela rotina das 7h do servidor (`rotinasDoBox`). Só o
 * servidor grava; a regra do Firestore deixa a Gestão só LER.
 *
 * A Gestão ouve as 7 mais novas, ao vivo: a lista de hoje aparece na Fila
 * sozinha, mesmo com a Gestão aberta desde ontem. O que cada item vira (o texto,
 * se ainda vale) é decidido em rotinas-regras.js. Avisa `AUTOMACAO_MUDOU`, que é
 * o que a Fila ouve. Sem nuvem (a vitrine local), lê do localStorage deste
 * navegador, para dar para testar.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { emit, EVENTOS } from './estado.js?v=40';

const V = '10.12.2';
const CHAVE_LOCAL = 'braconaro_rotinas_v1';
/** Quantos dias de lista a Fila junta (a mensagem mais longa vale 4 dias; a margem cobre um fim de semana). */
const DIAS = 7;
let _db = null, _fns = null;
/** @type {import('./rotinas-regras.js').ListaDoDia[]} */
let _listas = [];
/** @type {null | (() => void)} */
let _parar = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { collection: fsMod.collection, onSnapshot: fsMod.onSnapshot, query: fsMod.query, orderBy: fsMod.orderBy, limit: fsMod.limit, documentId: fsMod.documentId };
}

/** As listas dos últimos dias, da mais nova para a mais antiga. */
export function rotinas() { return _listas; }

/**
 * Começa a ouvir as listas da rotina (uma vez por sessão). Sem nuvem, lê as do navegador.
 * @param {string|null} uid
 */
export async function ouvirRotinas(uid) {
  if (!cloudAtivo() || !uid) {
    try { _listas = JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '[]') || []; } catch { _listas = []; }
    emit(EVENTOS.AUTOMACAO_MUDOU);
    return;
  }
  if (_parar) return;
  await init();
  _parar = _fns.onSnapshot(
    _fns.query(_fns.collection(_db, 'gestao', uid, 'rotinas'), _fns.orderBy(_fns.documentId(), 'desc'), _fns.limit(DIAS)),
    (/** @type {any} */ s) => {
      /** @type {any[]} */ const listas = [];
      s.forEach((/** @type {any} */ d) => { const v = d.data() || {}; listas.push({ dia: d.id, itens: Array.isArray(v.itens) ? v.itens : [] }); });
      _listas = listas;
      emit(EVENTOS.AUTOMACAO_MUDOU);
    },
    (/** @type {any} */ e) => console.warn('[rotinas] não deu para ouvir as listas da rotina.', e?.code || e),
  );
}
