// @ts-check
/**
 * A CONVERSA COM O SERVIDOR da Semana do Box.
 *
 * Mesmo padrão de `coach/montador-hibrido/cloud/chamadas.js`: SDK pela CDN (o
 * site não tem bundler), `getFunctions(app, 'southamerica-east1')` e TIMEOUT do
 * cliente MAIOR que o da função — se o navegador desiste primeiro, o coach vê
 * erro enquanto a semana está sendo gravada do outro lado, e clica de novo.
 *
 * O que vai ao servidor é só o PEDIDO (a semana, a variação, a publicação).
 * Exercício, rodízio, equipamento e volume nunca saem daqui: a tela lê o
 * documento que o servidor gravou e mostra.
 */
import { firebaseConfig } from '../../../compartilhado/firebase/config.js';

const V = '10.12.2';
const REGIAO = 'southamerica-east1';
/** As três funções têm `timeoutSeconds: 30`. */
const TIMEOUT = 40000;

/** Erros de TRANSPORTE; erro lançado pela função já vem escrito para o coach. */
const ERRO_TRANSPORTE = {
  'functions/deadline-exceeded': 'O servidor demorou demais e a chamada foi cancelada. Confira a semana antes de tentar de novo — ela pode ter sido gravada.',
  'functions/unauthenticated': 'Sua sessão de coach expirou. Faça login de novo.',
  'functions/permission-denied': 'Esta conta não tem acesso à Semana do Box.',
  'functions/unavailable': 'Sem conexão com o servidor agora. Confira sua internet e tente de novo.',
  'functions/not-found': 'Esta ação ainda não existe no servidor — falta publicar as Cloud Functions.',
};
const ERRO_GENERICO = 'Não deu para completar a operação. Tente de novo.';

let _app = null, _fns = null, _fs = null, _db = null;

async function app() {
  if (_app) return _app;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  _app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  return _app;
}

async function funcoes() {
  if (_fns) return _fns;
  const mod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
  _fns = { mod, ref: mod.getFunctions(await app(), REGIAO) };
  return _fns;
}

async function firestore() {
  if (_db) return { db: _db, fs: _fs };
  _fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  _db = _fs.getFirestore(await app());
  return { db: _db, fs: _fs };
}

/** @param {any} e */
function erroLegivel(e) {
  const amigavel = ERRO_TRANSPORTE[e?.code];
  if (amigavel) return new Error(amigavel);
  // `failed-precondition`, `already-exists`, `invalid-argument`: a mensagem é da
  // própria função (functions/src/index.ts) e é a que o coach precisa ler.
  const msg = e?.message;
  return new Error(msg && !String(msg).startsWith('INTERNAL') ? msg : ERRO_GENERICO);
}

/** @param {string} nome @param {object} payload */
async function chamar(nome, payload) {
  const { mod, ref } = await funcoes();
  try {
    const r = await mod.httpsCallable(ref, nome, { timeout: TIMEOUT })(payload);
    return /** @type {any} */ (r).data;
  } catch (e) {
    console.error(`Falha em ${nome}:`, /** @type {any} */ (e)?.code, /** @type {any} */ (e)?.message);
    throw erroLegivel(e);
  }
}

/**
 * Pede ao servidor a semana de `data` ('AAAA-MM-DD', qualquer dia dela).
 * @param {{data: string, variacao?: number, substituirRascunho?: boolean}} pedido
 */
export function gerarMatriz({ data, variacao = 0, substituirRascunho = false }) {
  return chamar('gerarMatrizSemanalBox', { data, variacao, substituirRascunho });
}

/** Publica (ou devolve para rascunho) uma semana já gravada. @param {string} semanaId @param {boolean} publicar */
export function publicar(semanaId, publicar = true) {
  return chamar('publicarSemanaBox', { semanaId, publicar });
}

/**
 * As opções para trocar a vaga `posicao` (1 a 6) da `sessao` — o catálogo com
 * os conflitos já calculados pelo servidor, e se a sessão está travada.
 * @param {string} semanaId @param {string} sessao @param {number} posicao
 */
export function opcoesTroca(semanaId, sessao, posicao) {
  return chamar('opcoesTrocaBox', { semanaId, sessao, posicao });
}

/**
 * Grava a semana editada. O servidor revalida tudo (catálogo, bloco, equipamento,
 * dias passados de semana já publicada) e recalcula alertas e avisos.
 * @param {string} semanaId @param {Record<string, any>} dias
 */
export function salvarSemana(semanaId, dias) {
  return chamar('salvarSemanaBox', { semanaId, dias });
}

/**
 * Grava o inventário (total, em manutenção, observação por recurso) e RECONFERE
 * as semanas que ainda não terminaram. A resposta traz o inventário salvo, com
 * `limitesAtivos` calculado pelo servidor, e `semanasAfetadas` (as que passaram
 * do limite novo; `null` se a reconferência falhou).
 *
 * Com `{}` não muda nada: só grava os padrões do servidor quando o documento
 * ainda não existe — é assim que a tela abre sem copiar esses padrões.
 * @param {Record<string, {total?: number, emManutencao?: number, observacao?: string}>} equipamentos
 */
export function salvarInventario(equipamentos) {
  return chamar('salvarInventarioBox', { equipamentos });
}

/**
 * O inventário gravado (`coaches/{uid}/inventario/atual`), ou `null` se ainda
 * não existe. Só o coach lê; só a função grava.
 * @param {string} uid
 */
export async function lerInventario(uid) {
  const { db, fs } = await firestore();
  const snap = await fs.getDoc(fs.doc(db, `coaches/${uid}/inventario/atual`));
  return snap.exists() ? snap.data() : null;
}

/**
 * As semanas pedidas, por chave. Ausente = ainda não gerada (`null`). Uma
 * leitura por semana (até 6 num mês) — `coaches/{uid}/semanas` só o coach lê.
 * @param {string} uid @param {string[]} chaves
 * @returns {Promise<Record<string, any>>}
 */
export async function lerSemanas(uid, chaves) {
  const { db, fs } = await firestore();
  const docs = await Promise.all(chaves.map((c) => fs.getDoc(fs.doc(db, `coaches/${uid}/semanas/${c}`))));
  /** @type {Record<string, any>} */
  const porChave = {};
  docs.forEach((d, i) => { porChave[chaves[i]] = d.exists() ? d.data() : null; });
  return porChave;
}
