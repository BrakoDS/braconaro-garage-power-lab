// @ts-check
/**
 * Nuvem do Montador Individual: `montadorIndividual/{uid}` com { config } e o
 * histórico ao lado, um documento por mês em
 * `montadorIndividual/{uid}/treinos/{YYYY-MM}`.
 *
 * Documento separado de `coaches/{uid}` de propósito: durante o teste, os dois
 * montadores não podem disputar o mesmo documento. O nome da coleção evita "v2"
 * porque renomear coleção do Firestore depois exige migrar tudo.
 *
 * Já nasce dividido por mês. O montador atual chegou a 164 KB num documento só,
 * com o teto do Firestore em 1 MB — repetir aqui seria conhecer o problema e
 * escolher tê-lo de novo. A peça é a mesma (`sync-por-mes.js`), com a migração
 * do formato antigo DESLIGADA: aqui nunca existiu documento velho.
 */
import { criarSincronia } from '../../compartilhado/firebase/sync-por-mes.js';

const sync = criarSincronia({ colecao: 'montadorIndividual', campos: ['config'] });

let _timer = null;

/**
 * Carrega a nuvem para o store (ou semeia a nuvem com o local, se ela estiver vazia).
 * @param {string} uid
 * @param {{setEstado:Function, getEstado:Function}} store
 */
export async function carregarParaStore(uid, store) {
  if (!uid) return false;
  return sync.carregar(uid, store);
}

/**
 * Conecta o store à nuvem: cada salvamento agenda um envio (debounce de 800ms,
 * o mesmo do montador atual — o coach digita carga tecla a tecla).
 * @param {string} uid
 * @param {{aoSalvar:Function}} store
 */
export function conectarStore(uid, store) {
  store.aoSalvar((/** @type {any} */ est) => {
    clearTimeout(_timer);
    _timer = setTimeout(async () => {
      try { await sync.enviar(uid, est); } catch (e) { console.error('Falha ao salvar na nuvem:', e); }
    }, 800);
  });
}

/** Esquece o que a nuvem tinha (ao sair). */
export function esquecer() { sync.esquecer(); }
