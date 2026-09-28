// @ts-check
/**
 * Mural de Recordes no Firestore (lado coach) — ver `prs.js` para o formato.
 *
 *   alunos/{email}/prs/{id}   um PR por documento, gravado pelo Garage App
 *
 * O documento alunos/{email} pode nem existir: o app só o cria para guardar o
 * token de push, e a subcoleção vive sem ele. Listar `alunos` e descer em cada
 * um perderia esses alunos, então a leitura é uma consulta de grupo de coleção
 * — `collectionGroup('prs')` — que a regra `{path=**}/prs` libera só ao coach.
 *
 * Sem filtro e sem ordem no servidor: consulta de grupo com `orderBy` pede um
 * índice de escopo de grupo, que este repositório não publica. Os PRs de uma
 * box cabem numa escuta só; a ordem e os filtros saem de `prs.js`.
 *
 * Apagar usa o caminho completo, que a regra de `alunos/{email}/prs/{id}`
 * libera ao coach — o PR some do mural e do Meus Recordes do aluno.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import { donoDoCaminho, normalizarPR, ordenarPRs } from './prs.js';

const V = '10.12.2';
/** @type {any} */ let _db = null;
/** @type {any} */ let _fs = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  _fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = _fs.getFirestore(app);
}

/**
 * Escuta os PRs de todos os alunos, do mais recente para o mais antigo.
 * Devolve a função que para de escutar.
 * @param {(prs: import('./prs.js').PR[]) => void} aoMudar
 * @param {(e: any) => void} aoErrar
 * @returns {Promise<() => void>}
 */
export async function ouvirPRs(aoMudar, aoErrar) {
  await init();
  return _fs.onSnapshot(_fs.collectionGroup(_db, 'prs'), (/** @type {any} */ snap) => {
    const lista = [];
    for (const d of snap.docs) {
      const pr = normalizarPR(d.ref.path, d.data());
      if (pr) lista.push(pr);
    }
    aoMudar(ordenarPRs(lista));
  }, aoErrar);
}

/**
 * Apaga um PR (o digitado errado). Lança se o caminho não é de um PR de aluno
 * ou se a regra recusou.
 * @param {string} caminho `alunos/{email}/prs/{id}`, como veio da escuta
 */
export async function apagarPR(caminho) {
  if (!donoDoCaminho(caminho)) throw new Error('pr-invalido');
  await init();
  await _fs.deleteDoc(_fs.doc(_db, caminho));
}
