// @ts-check
/**
 * Sincronização da Gestão de Alunos com a nuvem (v2) — substitui o antigo
 * `cloud-alunos.js`, que regravava o blob inteiro a cada mudança.
 *
 * No login (`iniciar`):
 *   1. lê o documento raiz `gestao/{uid}`;
 *   2. se ele ainda é o blob v1: adota o blob (como o v1 fazia) e MIGRA
 *      (`db-migracao.js`). Migração que não termina agora (outro aparelho
 *      migrando, rede, blob regravado no meio) deixa este aparelho em modo
 *      'local' — tudo continua funcionando e indo para a fila, nada sobe — e
 *      tenta de novo em segundo plano;
 *   3. com a nuvem v2: lê o meta e as fichas, avaliações e feedbacks, e mescla
 *      no cache — a nuvem vence, menos o que está pendente na fila;
 *   4. envia a fila.
 *
 * Depois, cada gravação agenda um envio (800 ms, como o v1) que manda SÓ os
 * documentos marcados na fila, em lotes de até 500.
 *
 * Puro: o Firestore entra pela porta (`db-firestore.js`; nos testes,
 * `db-memoria.js`). O relógio também é injetado.
 */
import { migrarNuvem, emLotes, SCHEMA_V2 } from './db-migracao.js';
import { estadoDeBlobV1, estadoDeSubcolecoes } from './db-cache.js';

const DEBOUNCE_MS = 800;
const NOVA_TENTATIVA_MS = 30_000;
const MAX_TENTATIVAS = 20; // ~10 min: o tempo de uma trava de outro aparelho expirar

/**
 * @typedef {'desligado'|'local'|'v2'} Modo
 *   desligado: sem login / sem nuvem — só o cache;
 *   local: a nuvem ainda está no v1 — grava no cache e na fila, não sobe;
 *   v2: sincronizando por documento.
 */

/**
 * @param {{
 *   cache: ReturnType<typeof import('./db-cache.js').criarCache>,
 *   abrirPorta: (uid: string) => Promise<any>,
 *   aparelho?: string,
 *   migrar?: typeof migrarNuvem,
 *   relogio?: { agendar: (fn: () => void, ms: number) => any, cancelar: (t: any) => void },
 *   log?: (msg: string, extra?: any) => void,
 * }} deps
 */
export function criarSync({
  cache, abrirPorta, aparelho = 'desconhecido', migrar = migrarNuvem,
  relogio = { agendar: (fn, ms) => setTimeout(fn, ms), cancelar: (t) => clearTimeout(t) },
  log = (msg, extra) => console.info(`[Gestão] ${msg}`, extra ?? ''),
}) {
  /** @type {Modo} */ let modo = 'desligado';
  /** @type {any} */ let porta = null;
  /** @type {any} */ let timerEnvio = null;
  /** @type {any} */ let timerTentativa = null;
  /** @type {Promise<void>|null} */ let enviando = null;
  let deNovo = false;
  let tentativas = 0;
  /** @type {(() => void) | undefined} */ let aoAtualizar;

  const avisar = () => { if (aoAtualizar) { try { aoAtualizar(); } catch (e) { console.warn(e); } } };

  /** Lê a nuvem v2 inteira e mescla no cache. Nuvem sem fichas + cache cheio = semear (como o v1). */
  async function carregarV2() {
    const raiz = await porta.lerRaiz();
    const sub = await porta.lerSubcolecoes();
    const temLocal = Object.keys(cache.estado().alunos).length > 0;
    if (sub.fichas.size === 0 && temLocal) {
      log('Nuvem sem alunos e este aparelho com alunos: semeando a nuvem.');
      cache.marcarTudo();
    } else {
      cache.adotar(estadoDeSubcolecoes(raiz, sub));
    }
    modo = 'v2';
    avisar();
  }

  /**
   * Migra (se preciso) e carrega. Devolve o modo em que ficou.
   * @returns {Promise<Modo>}
   */
  async function sincronizar() {
    const raiz = await porta.lerRaiz();
    if (raiz && raiz.schema !== SCHEMA_V2 && Array.isArray(raiz.alunos)) {
      // Nuvem ainda no v1: primeiro mostra o que ela tem (o v1 fazia isso)…
      cache.adotar(estadoDeBlobV1(raiz));
      avisar();
      // …e então migra.
      const r = await migrar(porta, { aparelho, log: (m) => log(`Migração: ${m}`) });
      if (r.estado !== 'migrado' && r.estado !== 'ja-migrado') {
        modo = 'local';
        if (r.estado === 'bloqueado') {
          console.error('[Gestão] A migração para o formato novo está BLOQUEADA por dado inválido. '
            + 'Os dados seguem salvos neste aparelho e no blob antigo; nada sobe até corrigir.', r.problemas);
        } else {
          log(`Migração não terminou (${r.estado}) — modo local, nova tentativa em ${NOVA_TENTATIVA_MS / 1000}s.`, r);
          agendarTentativa();
        }
        return modo;
      }
      log(`Migração: ${r.estado}.`, r.contagem);
    }
    await carregarV2();
    await enviar();
    return modo;
  }

  function agendarTentativa() {
    if (tentativas >= MAX_TENTATIVAS) { log('Desisti de migrar nesta sessão; tento de novo na próxima abertura.'); return; }
    tentativas++;
    relogio.cancelar(timerTentativa);
    timerTentativa = relogio.agendar(() => {
      sincronizar().catch((e) => { log('Nova tentativa falhou.', e?.code || e); agendarTentativa(); });
    }, NOVA_TENTATIVA_MS);
  }

  /**
   * Manda a fila: cada caminho com o dado de agora, em lotes. Um envio por vez;
   * quem chama durante um envio ganha uma rodada a mais no fim.
   * @returns {Promise<void>}
   */
  function enviar() {
    if (modo !== 'v2' || !porta) return Promise.resolve();
    if (enviando) { deNovo = true; return enviando; }
    enviando = (async () => {
      do {
        deNovo = false;
        const fila = cache.fila();
        const itens = Object.keys(fila).map((caminho) => ({ caminho, op: cache.operacaoDe(caminho) }));
        if (!itens.length) break;
        const invalidos = itens.filter((x) => !x.op);
        if (invalidos.length) cache.confirmar(Object.fromEntries(invalidos.map((x) => [x.caminho, fila[x.caminho]])));
        for (const lote of emLotes(itens.filter((x) => x.op))) {
          await porta.gravarLote(lote.map((x) => x.op));
          cache.confirmar(Object.fromEntries(lote.map((x) => [x.caminho, fila[x.caminho]])));
        }
      } while (deNovo);
    })().finally(() => { enviando = null; });
    return enviando;
  }

  return {
    /** @returns {Modo} */
    modo: () => modo,

    /**
     * Liga a sincronização (após o login). Resolve depois da PRIMEIRA tentativa
     * — quem dá `await` nisto não fica preso esperando outro aparelho migrar.
     * @param {string} uid @param {() => void} [cb] chamado quando dados da nuvem chegam
     * @returns {Promise<Modo>}
     */
    async iniciar(uid, cb) {
      aoAtualizar = cb;
      tentativas = 0;
      porta = await abrirPorta(uid);
      return sincronizar();
    },

    /** Agenda o envio da fila (debounce). Fora do modo v2, a fila só espera. */
    agendarEnvio() {
      if (modo !== 'v2') return;
      relogio.cancelar(timerEnvio);
      timerEnvio = relogio.agendar(() => {
        enviar().catch((e) => console.warn('Falha ao salvar alunos na nuvem (fica na fila):', e?.code || e));
      }, DEBOUNCE_MS);
    },

    /** Envia já, sem esperar o debounce. */
    async enviarAgora() {
      relogio.cancelar(timerEnvio);
      await enviar();
    },
  };
}
