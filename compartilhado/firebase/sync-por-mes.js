// @ts-check
/**
 * SINCRONIA POR MÊS — a conversa com o Firestore de um app que guarda um treino
 * por dia: documento principal `{colecao}/{uid}` com os campos leves, e o
 * histórico ao lado, um documento por mês em `{colecao}/{uid}/treinos/{YYYY-MM}`.
 *
 * Nasceu dentro de `cloud.js`, atendendo só `coaches/{uid}`, quando aquele
 * documento chegou a 164 KB com o teto do Firestore em 1 MB. Saiu de lá para o
 * montador individual poder usar a mesma peça: um segundo app que guardasse tudo
 * num documento só repetiria o mesmo problema daqui a um ano, e uma cópia da
 * lógica garantiria que as duas versões divergissem na primeira correção.
 *
 * A regra pura (agrupar, fundir, decidir o que mudou) está em `treinos-por-mes.js`,
 * testada sem rede. Aqui é só banco.
 */
import { firebaseConfig } from './config.js';
import {
  agruparPorMes, juntarMeses, fundirTreinos, fatiaDoDoc, temConteudo,
  precisaMigrar, mesesQueMudaram, assinatura,
} from './treinos-por-mes.js';

const V = '10.12.2'; // mesma versão do SDK usada em cloud.js e cloud-academia.js
let _db = null, _fns = null;

/** Handles do Firestore, reaproveitando o app que o login já inicializou. */
async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = {
    doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc,
    collection: fsMod.collection, getDocs: fsMod.getDocs, writeBatch: fsMod.writeBatch,
  };
}

/**
 * Uma sincronia por app.
 *
 * @param {Object} opcoes
 * @param {string} opcoes.colecao        'coaches' | 'montadorIndividual'
 * @param {string[]} opcoes.campos       campos que ficam no documento principal
 * @param {boolean} [opcoes.migrarLegado] este app já teve tudo num documento só?
 */
export function criarSincronia({ colecao, campos, migrarLegado = false }) {
  const refDoc = (/** @type {string} */ uid) => _fns.doc(_db, colecao, uid);
  const refMes = (/** @type {string} */ uid, /** @type {string} */ mesId) => _fns.doc(_db, colecao, uid, 'treinos', mesId);
  const refArquivo = (/** @type {string} */ uid, /** @type {string} */ nome) => _fns.doc(_db, colecao, uid, 'arquivo', nome);
  const refMeses = (/** @type {string} */ uid) => _fns.collection(_db, colecao, uid, 'treinos');

  /**
   * O que a nuvem tinha na última vez que falamos com ela, para não reenviar o
   * que não mudou. Sem isto, o primeiro salvamento depois do login reescreveria
   * todos os meses — justamente o que a divisão veio evitar.
   * @type {{doc: string, meses: Record<string, Record<string, any>>}}
   */
  let base = { doc: '', meses: {} };
  const lembrar = (/** @type {any} */ est) => {
    base = { doc: assinatura(fatiaDoDoc(est, campos)), meses: agruparPorMes(est.treinos || {}) };
  };

  /** Lê todos os meses do coach. @param {string} uid */
  async function lerMeses(uid) {
    const snap = await _fns.getDocs(refMeses(uid));
    /** @type {Record<string, Record<string, any>>} */
    const meses = {};
    snap.forEach((/** @type {any} */ d) => { meses[d.id] = d.data()?.treinos || {}; });
    return meses;
  }

  /**
   * Passa o formato antigo (tudo num documento) para o novo. Num lote só: cópia
   * crua do documento, os meses, os `programas` semanais no arquivo e só então o
   * documento principal regravado sem os dois campos. Se o commit falhar, o
   * antigo continua inteiro. (O lote aceita 500 escritas; são meses, não dias.)
   * @param {string} uid @param {any} antigo @param {Record<string, any>} treinos
   */
  async function migrar(uid, antigo, treinos) {
    const copia = await _fns.getDoc(refArquivo(uid, 'antes-da-divisao'));
    const lote = _fns.writeBatch(_db);
    if (!copia.exists()) lote.set(refArquivo(uid, 'antes-da-divisao'), { documento: antigo, copiadoEm: Date.now() });
    const meses = agruparPorMes(treinos);
    for (const mesId of Object.keys(meses)) lote.set(refMes(uid, mesId), { treinos: meses[mesId], atualizadoEm: Date.now() });
    const programas = antigo.programas || {};
    if (Object.keys(programas).length) lote.set(refArquivo(uid, 'programas'), { programas, arquivadoEm: Date.now() });
    lote.set(refDoc(uid), fatiaDoDoc(antigo, campos)); // `set` sem merge: é o que apaga treinos e programas
    await lote.commit();
  }

  return {
    /**
     * Sincroniza no login, sem perder dados: nuvem com dados adota a nuvem;
     * nuvem vazia com local cheio semeia a nuvem; ambos vazios, nada.
     * @param {string} uid
     * @param {{setEstado:Function, getEstado:Function}} store
     * @returns {Promise<boolean>} adotou a nuvem?
     */
    async carregar(uid, store) {
      await init();
      const [snap, meses] = await Promise.all([_fns.getDoc(refDoc(uid)), lerMeses(uid)]);
      const antigo = snap.exists() ? snap.data() : {};
      // O legado só existe em app que já rodou com tudo num documento — e lá ele
      // pode reaparecer, se uma aba com o código velho regravar o documento.
      const legado = migrarLegado ? (antigo.treinos || {}) : {};
      const treinos = fundirTreinos(juntarMeses(meses), legado);
      let migrou = false;
      if (migrarLegado && precisaMigrar(antigo)) {
        try { await migrar(uid, antigo, treinos); migrou = true; } catch (e) {
          // Sem migrar, o coach ainda trabalha: os treinos já estão em mãos e o
          // documento antigo continua íntegro. Tentamos de novo no próximo login.
          console.error('Falha ao dividir os treinos por mês:', e);
        }
      }
      const nuvem = { ...fatiaDoDoc(antigo, campos), treinos };
      if (migrarLegado) nuvem.programas = migrou ? {} : (antigo.programas || {});
      if (temConteudo(nuvem, campos)) {
        lembrar(nuvem);
        store.setEstado(nuvem);
        return true;
      }
      const local = store.getEstado();
      if (temConteudo(local, campos)) await this.enviar(uid, local); // semeia já no formato novo
      return false;
    },

    /**
     * Manda o que mudou: o documento principal só se os campos dele mudaram, e um
     * documento por mês tocado. Mês que ficou sem treino é reescrito vazio, senão
     * o treino apagado voltaria no próximo login.
     * @param {string} uid @param {any} est
     */
    async enviar(uid, est) {
      await init();
      const fatia = fatiaDoDoc(est, campos);
      const meses = agruparPorMes(est.treinos || {});
      const escritas = [];
      if (assinatura(fatia) !== base.doc) escritas.push(_fns.setDoc(refDoc(uid), JSON.parse(JSON.stringify(fatia))));
      for (const mesId of mesesQueMudaram(base.meses, meses)) {
        const doMes = JSON.parse(JSON.stringify(meses[mesId] || {}));
        escritas.push(_fns.setDoc(refMes(uid, mesId), { treinos: doMes, atualizadoEm: Date.now() }));
      }
      if (!escritas.length) return;
      await Promise.all(escritas);
      // Só depois de tudo gravar. Se uma escrita falhar, a base fica como estava e
      // o próximo salvamento tenta de novo o que ficou para trás.
      lembrar(est);
    },

    /**
     * Esquece o que a nuvem tinha. Chamado ao sair: a base é "o que a nuvem DESTE
     * coach tem", e deixá-la de pé faria o próximo a logar no mesmo aparelho pular
     * o envio de um mês que ele nunca gravou.
     */
    esquecer() { base = { doc: '', meses: {} }; },
  };
}
