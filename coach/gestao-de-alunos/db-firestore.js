// @ts-check
/**
 * Porta da Gestão sobre o Firestore de verdade (SDK web, mesmo app Firebase do
 * login): a migração (`db-migracao.js`) e o sync do dia a dia (`db-sync.js`)
 * falam com o banco só por aqui. A lógica e a ordem dos passos ficam lá; aqui,
 * só a tradução. Substitui o antigo `cloud-alunos.js` (blob inteiro em setDoc).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { canonico, decidirTrava } from './db-migracao.js';

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
      const b = F.writeBatch(_db);
      for (const op of ops) {
        // O meta substitui só os campos que leva (`mergeFields`): `migracao` e
        // `migradoEm` ficam, e um feriado desmarcado some de verdade — com
        // `merge: true` o mapa seria mesclado e a chave apagada voltaria.
        if (op.tipo === 'meta') b.set(raiz, op.dados, { mergeFields: Object.keys(op.dados) });
        else if (op.tipo === 'set') b.set(ref(op.caminho), op.dados);
        else b.delete(ref(op.caminho));
      }
      await b.commit();
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
