// @ts-check
/**
 * Leitura do Diário de Evolução do aluno (lado coach). Subcoleção
 * `diario/{email}/fotos/{dia}` — a regra deixa o coach LER, nunca escrever.
 *
 * A aba Registros lê daqui na hora, em vez de guardar a URL no evento: se o
 * aluno apagar a foto, ela some da Gestão junto; e se refizer a do dia (mesmo
 * caminho no Storage), a linha antiga não passa a mostrar a foto nova.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2';
let _db = null, _fns = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { collection: fsMod.collection, getDocs: fsMod.getDocs };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/**
 * Os documentos crus do diário, com o id. Sem nuvem ou sem e-mail, `null`
 * ("não sei"), que é diferente de `[]` ("o aluno não tem foto").
 * @param {string} email @returns {Promise<any[]|null>}
 */
export async function carregarFotosDoDiario(email) {
  if (!cloudAtivo() || !emailKey(email)) return null;
  await init();
  const snap = await _fns.getDocs(_fns.collection(_db, 'diario', emailKey(email), 'fotos'));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
