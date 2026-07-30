// @ts-check
/**
 * Publicação da Garage Store para a vitrine pública.
 *
 * O catálogo do coach vive em `academia/{uid}` (a camada de dados continua sendo a
 * do app Academia, mesmo com a Loja sendo um app à parte), e as regras do Firestore
 * fecham esse documento só para ele — nenhum aluno ou visitante lê de lá. Então a
 * vitrine tem um doc próprio, `lojaPortal/atual`, de leitura pública e escrita só do
 * coach. Mesmo desenho de `montador/ui/portal-treino.js` com `treinoPortal`.
 *
 * Publica SÓ o que está ativo: desativar um produto tira ele do ar na próxima
 * publicação, sem apagar nada do catálogo do coach.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';


const V = '10.12.2';
const DOC = 'atual';
let _db = null, _fns = null;

export function lojaCloudAtiva() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc };
}

/** Enxuga um produto para o que a vitrine precisa (nada além disso vai a público). */
const produtoEnxuto = (p) => ({
  id: p.id,
  nome: p.nome,
  url: p.url,
  categoria: p.categoria || 'Outros',
  preco: p.preco === '' || p.preco == null ? null : Number(p.preco),
  imagem: p.imagem || '',
  dica: p.dica || '',
});

/**
 * Sobrescreve a vitrine com os produtos ATIVOS. Sem `merge`: o doc é o retrato
 * completo do que está no ar, então produto removido some de verdade.
 * @param {any[]} produtos catálogo inteiro do coach
 */
export async function publicarLoja(produtos) {
  if (!lojaCloudAtiva()) return false;
  const ativos = (produtos || []).filter((p) => p.ativo !== false && p.nome && p.url);
  try {
    await init();
    await _fns.setDoc(_fns.doc(_db, 'lojaPortal', DOC), {
      produtos: ativos.map(produtoEnxuto),
      atualizadoEm: Date.now(),
    });
    return true;
  } catch (e) {
    console.warn('Publicar Garage Store:', e?.code || e);
    return false;
  }
}

/** Lê a vitrine publicada (usado pela loja pública). @returns {Promise<any[]>} */
export async function carregarLoja() {
  if (!lojaCloudAtiva()) return [];
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'lojaPortal', DOC));
    return snap.exists() ? (snap.data().produtos || []) : [];
  } catch (e) {
    console.warn('Carregar Garage Store:', e?.code || e);
    return [];
  }
}
