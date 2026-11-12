// @ts-check
/**
 * As PROPOSTAS DOS AGENTES e o LOG das chamadas deles, na nuvem (Fase 1 ·
 * etapa 7, decisão 13): `gestao/{uid}/propostas/{id}` e `gestao/{uid}/agentesLog`.
 *
 * Quem grava as duas coleções é só o servidor (functions/src/agentes.ts). A
 * regra do Firestore deixa a Gestão LER as duas e, na proposta que ainda
 * espera, só registrar a decisão do coach (`situacao` e `decisao`). As regras
 * do que aprovar faz moram em agentes-regras.js; aqui só se lê e se grava.
 *
 * Ouve ao vivo: a proposta que um agente acabou de fazer aparece sozinha, e as
 * telas ouvem `PROPOSTAS_MUDARAM`. Sem nuvem (a vitrine local), lê e grava no
 * localStorage deste navegador, para dar para testar.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { emit, EVENTOS } from './estado.js?v=40';

const V = '10.12.2';
const CHAVE_LOCAL = 'braconaro_propostas_v1';
const CHAVE_LOCAL_LOG = 'braconaro_agentes_log_v1';
/** Quantas linhas do log o painel mostra (as mais novas). */
const LINHAS_DO_LOG = 100;
let _db = null, _fns = null;
/** @type {Record<string, any>} */
let _propostas = {};
/** @type {any[]} */
let _log = [];
/** @type {(() => void)[]} */
let _parar = [];

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = {
    doc: fsMod.doc, updateDoc: fsMod.updateDoc, collection: fsMod.collection, onSnapshot: fsMod.onSnapshot,
    query: fsMod.query, orderBy: fsMod.orderBy, limit: fsMod.limit,
  };
}

/** @param {string} chave */
function lerLocal(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch { return null; }
}

/** As propostas conhecidas agora, por id. */
export function propostas() { return _propostas; }

/** As linhas mais novas do log das chamadas dos agentes. */
export function logDosAgentes() { return _log; }

/**
 * Começa a ouvir as propostas e o log (uma vez por sessão). Sem nuvem, lê o do
 * navegador.
 * @param {string|null} uid
 */
export async function ouvirPropostas(uid) {
  if (!cloudAtivo() || !uid) {
    _propostas = lerLocal(CHAVE_LOCAL) || {};
    _log = lerLocal(CHAVE_LOCAL_LOG) || [];
    emit(EVENTOS.PROPOSTAS_MUDARAM);
    return;
  }
  if (_parar.length) return;
  await init();
  const aviso = (/** @type {string} */ o) => (/** @type {any} */ e) => console.warn(`[agentes] não deu para ouvir ${o}.`, e?.code || e);
  _parar.push(_fns.onSnapshot(_fns.collection(_db, 'gestao', uid, 'propostas'), (/** @type {any} */ s) => {
    /** @type {Record<string, any>} */ const mapa = {};
    s.forEach((/** @type {any} */ d) => { mapa[d.id] = { ...d.data(), id: d.id }; });
    _propostas = mapa;
    emit(EVENTOS.PROPOSTAS_MUDARAM);
  }, aviso('as propostas')));
  _parar.push(_fns.onSnapshot(
    _fns.query(_fns.collection(_db, 'gestao', uid, 'agentesLog'), _fns.orderBy('em', 'desc'), _fns.limit(LINHAS_DO_LOG)),
    (/** @type {any} */ s) => {
      /** @type {any[]} */ const linhas = [];
      s.forEach((/** @type {any} */ d) => { linhas.push({ ...d.data(), id: d.id }); });
      _log = linhas;
      emit(EVENTOS.PROPOSTAS_MUDARAM);
    }, aviso('o log dos agentes'),
  ));
}

/**
 * Grava a decisão do coach numa proposta (só `situacao` e `decisao`, como a
 * regra do Firestore pede). Resolve depois de gravar; erro sobe.
 * @param {string|null} uid @param {string} id @param {{ situacao: string, decisao: Record<string, any> }} patch
 */
export async function decidir(uid, id, patch) {
  if (!cloudAtivo() || !uid) {
    const mapa = { ...(lerLocal(CHAVE_LOCAL) || {}) };
    if (!mapa[id]) return;
    mapa[id] = { ...mapa[id], ...patch };
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(mapa)); } catch (e) { console.warn('[agentes] o navegador não guardou.', e); }
    _propostas = mapa;
    emit(EVENTOS.PROPOSTAS_MUDARAM);
    return;
  }
  await init();
  await _fns.updateDoc(_fns.doc(_db, 'gestao', uid, 'propostas', id), { situacao: patch.situacao, decisao: patch.decisao });
  // O onSnapshot traz de volta; o aviso imediato deixa a tela responder já.
  _propostas = { ..._propostas, [id]: { ..._propostas[id], ...patch } };
  emit(EVENTOS.PROPOSTAS_MUDARAM);
}
