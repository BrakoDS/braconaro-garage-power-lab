// @ts-check
/**
 * AS EXCEÇÕES DE UM ALUNO — `treinoAluno/{email}`, um documento por aluno.
 *
 * Guarda só o que FUGIU da regra num dia: "hoje a Ana faz 2 séries de
 * agachamento", "o João trocou mesa flexora por cadeira flexora". A versão comum
 * de cada aluno não mora aqui nem em lugar nenhum — ela é derivada do perfil na
 * hora, e é isso que faz o mês inteiro caber sem 8 registros por dia.
 *
 * O documento é o mesmo que o aluno lê no Portal (Etapa 5) e o mesmo em que ele
 * grava o registro pós-aula dele. Por isso a gravação é sempre por CAMPO do dia
 * (`ajustes.{dateId}`), com merge: coach e aluno escrevem no mesmo documento em
 * momentos diferentes, e um não pode apagar o outro dia do outro.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2';
let _db = null, _fns = null;

/** A chave do documento é o e-mail em minúsculas, como em `cargas` e `desafios`. */
export const chaveEmail = (/** @type {string} */ e) => String(e || '').trim().toLowerCase();

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc, updateDoc: fsMod.updateDoc, deleteField: fsMod.deleteField };
}

const ligado = () => CLOUD_ATIVO && !!firebaseConfig?.apiKey;

/**
 * Todas as exceções de um aluno: `{ [dateId]: ajuste }`.
 * @param {string} email
 */
export async function carregarAjustes(email) {
  if (!ligado() || !email) return {};
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'treinoAluno', chaveEmail(email)));
  return (snap.exists() && snap.data()?.ajustes) || {};
}

/**
 * Grava a exceção de UM dia. Merge, e só naquele campo: o aluno escreve o
 * pós-aula dele no mesmo documento, e o coach não pode apagar o resto ao salvar.
 * @param {string} email @param {string} dateId @param {any} ajuste
 */
export async function salvarAjuste(email, dateId, ajuste) {
  if (!ligado() || !email || !dateId) return;
  await init();
  await _fns.setDoc(_fns.doc(_db, 'treinoAluno', chaveEmail(email)), {
    email: chaveEmail(email),
    ajustes: { [dateId]: { ...ajuste, atualizadoEm: Date.now() } },
  }, { merge: true });
}

/**
 * Apaga a exceção de um dia — o aluno volta a receber a versão derivada do
 * perfil dele. `deleteField` em vez de objeto vazio: exceção vazia gravada
 * continuaria sendo lida como "o coach mexeu aqui".
 * @param {string} email @param {string} dateId
 */
export async function removerAjuste(email, dateId) {
  if (!ligado() || !email || !dateId) return;
  await init();
  try {
    await _fns.updateDoc(_fns.doc(_db, 'treinoAluno', chaveEmail(email)), { [`ajustes.${dateId}`]: _fns.deleteField() });
  } catch (e) {
    // Documento que ainda não existe: não há exceção para apagar.
    if (e?.code !== 'not-found') throw e;
  }
}
