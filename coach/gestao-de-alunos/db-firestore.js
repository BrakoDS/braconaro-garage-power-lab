// @ts-check
/**
 * Porta da Gestão sobre o Firestore de verdade (SDK web, mesmo app Firebase do
 * login): a migração (`db-migracao.js`) e o sync do dia a dia (`db-sync.js`)
 * falam com o banco só por aqui. A lógica e a ordem dos passos ficam lá; aqui,
 * só a tradução. Substitui o antigo `cloud-alunos.js` (blob inteiro em setDoc).
 *
 * A FICHA (`alunos/{id}`) se grava numa transação: lê o que está na nuvem e
 * grava por cima só os campos que mudaram aqui (ficha-campos.js), com o
 * carimbo do servidor (`atualizadoEm: serverTimestamp()`). As regras do
 * Firestore exigem esse carimbo em toda gravação de ficha — é o que fecha a
 * porta para uma aba antiga da Gestão, que regravava a ficha inteira.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { canonico, decidirTrava } from './db-migracao.js?v=38';
import { escritasDaAtualizacao, CONJUNTOS, aplicarConjunto } from './ficha-campos.js?v=38';

const V = '10.12.2';
/** @type {any} */ let _db = null;
/** @type {any} */ let F = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = F.getFirestore(app);
}

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

/**
 * @param {string} uid o coach
 * @returns {Promise<import('./db-migracao.js').Porta>}
 */
export async function portaFirestore(uid) {
  await init();
  const raiz = F.doc(_db, 'gestao', uid);
  const ref = (/** @type {string[]} */ caminho) => F.doc(_db, 'gestao', uid, ...caminho);
  const ehFicha = (/** @type {string[]} */ c) => c.length === 2 && c[0] === 'alunos';

  /**
   * Uma ficha, numa transação: sumiu da nuvem → cria inteira; `inteira` sobre
   * uma que existe → mescla (o conjunto só soma); por campo → só os campos.
   * @param {any} op a operação `ficha` do cache
   */
  const gravarFicha = (op) => F.runTransaction(_db, async (/** @type {any} */ tx) => {
    const r = ref(op.caminho);
    const s = await tx.get(r);
    const carimbo = F.serverTimestamp();
    if (!s.exists()) { tx.set(r, { ...op.dados, atualizadoEm: carimbo }); return; }
    const atual = s.data();
    if (op.inteira) {
      const dados = { ...op.dados, atualizadoEm: carimbo };
      for (const k of CONJUNTOS) if (Array.isArray(dados[k])) dados[k] = aplicarConjunto(atual[k], { mais: dados[k] });
      tx.set(r, dados, { merge: true });
      return;
    }
    const pares = [];
    for (const e of escritasDaAtualizacao(atual, op.dados, op)) pares.push(new F.FieldPath(...e.caminho), e.apagar ? F.deleteField() : e.valor);
    pares.push(new F.FieldPath('atualizadoEm'), carimbo);
    tx.update(r, pares[0], pares[1], ...pares.slice(2));
  });

  const filhos = async (/** @type {string} */ alunoId, /** @type {string} */ nome) => {
    const s = await F.getDocs(F.collection(_db, 'gestao', uid, 'alunos', alunoId, nome));
    return new Map(s.docs.map((/** @type {any} */ d) => [d.id, d.data()]));
  };

  return {
    async lerRaiz() {
      const s = await F.getDoc(raiz);
      return s.exists() ? s.data() : null;
    },

    // Transação: duas abas abrindo juntas não tomam a trava as duas.
    travar: (pedido) => F.runTransaction(_db, async (/** @type {any} */ tx) => {
      const s = await tx.get(raiz);
      const d = decidirTrava(s.exists() ? s.data() : null, pedido);
      if (d.ok) tx.update(raiz, { migracao: { status: 'andando', em: pedido.em, aparelho: pedido.aparelho } });
      return d;
    }),

    async gravarBackup(id, dados) {
      await F.setDoc(ref(['backup', id]), dados);
    },

    async lerSubcolecoes() {
      const s = await F.getDocs(F.collection(_db, 'gestao', uid, 'alunos'));
      const fichas = new Map(s.docs.map((/** @type {any} */ d) => [d.id, d.data()]));
      const ids = [...fichas.keys()];
      const [avs, fbs] = await Promise.all([
        Promise.all(ids.map((id) => filhos(id, 'avaliacoes'))),
        Promise.all(ids.map((id) => filhos(id, 'feedbacks'))),
      ]);
      return {
        fichas,
        avaliacoes: new Map(ids.map((id, i) => [id, avs[i]])),
        feedbacks: new Map(ids.map((id, i) => [id, fbs[i]])),
      };
    },

    async gravarLote(ops) {
      const fichas = ops.filter((op) => op.tipo === 'ficha');
      const resto = ops.filter((op) => op.tipo !== 'ficha');
      if (resto.length) {
        const b = F.writeBatch(_db);
        for (const op of resto) {
          // O meta substitui só os campos que leva (`mergeFields`): `migracao` e
          // `migradoEm` ficam, e um feriado desmarcado some de verdade — com
          // `merge: true` o mapa seria mesclado e a chave apagada voltaria.
          if (op.tipo === 'meta') b.set(raiz, op.dados, { mergeFields: Object.keys(op.dados) });
          // A ficha inteira só vem da migração do blob v1 — com o carimbo, que a regra exige.
          else if (op.tipo === 'set') b.set(ref(op.caminho), ehFicha(op.caminho) ? { ...op.dados, atualizadoEm: F.serverTimestamp() } : op.dados);
          else b.delete(ref(op.caminho));
        }
        await b.commit();
      }
      for (const op of fichas) await gravarFicha(op);
    },

    /**
     * As fichas ao vivo (onSnapshot da subcoleção). Devolve o cancelamento.
     * @param {(fichas: Map<string, any>) => void} aoChegar @param {(e: any) => void} [aoFalhar]
     */
    ouvirFichas(aoChegar, aoFalhar) {
      return F.onSnapshot(
        F.collection(_db, 'gestao', uid, 'alunos'),
        (/** @type {any} */ s) => aoChegar(new Map(s.docs.map((/** @type {any} */ d) => [d.id, d.data()]))),
        (/** @type {any} */ e) => { if (aoFalhar) aoFalhar(e); },
      );
    },

    // Transação: confere que ninguém regravou o blob durante a cópia e só então
    // tira `alunos`. Update, nunca delete — o documento raiz fica.
    virar: (alunosEsperados, virada) => F.runTransaction(_db, async (/** @type {any} */ tx) => {
      const s = await tx.get(raiz);
      if (!s.exists() || canonico(s.data().alunos) !== alunosEsperados) return false;
      tx.update(raiz, { ...virada, alunos: F.deleteField() });
      return true;
    }),

    async liberar(migracao) {
      await F.updateDoc(raiz, { migracao });
    },
  };
}
