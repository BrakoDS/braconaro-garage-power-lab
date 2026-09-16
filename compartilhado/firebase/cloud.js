// @ts-check
/**
 * Sincronização em nuvem (Firebase Auth + Firestore). Opcional: só liga se
 * cloud-config.js estiver configurado. Modelo: `coaches/{uid}` com
 * { alunos, config } e o histórico ao lado, um documento por mês em
 * `coaches/{uid}/treinos/{YYYY-MM}`.
 *
 * A divisão por mês é de 15/09/2026: com tudo junto o documento ia para o teto de
 * 1 MB do Firestore em cerca de um ano, e cada salvamento reescrevia o histórico
 * inteiro para mudar uma carga. A regra de dividir, fundir e decidir o que mudou
 * mora em `treinos-por-mes.js`, testada sem rede; aqui é só a conversa com o banco.
 *
 * Carrega ao logar; envia (debounced) a cada mudança. Last-write-wins por mês.
 */
import { CLOUD_ATIVO, firebaseConfig } from './config.js';
import {
  agruparPorMes, juntarMeses, fundirTreinos, fatiaDoCoach,
  precisaMigrar, mesesQueMudaram, assinatura,
} from './treinos-por-mes.js';

const V = '10.12.2';
let _auth = null, _db = null, _user = null, _fns = {};

/** A nuvem está configurada/ativa? */
export function cloudAtivo() {
  return CLOUD_ATIVO && !!firebaseConfig && !!firebaseConfig.apiKey;
}

/** Inicializa os SDKs do Firebase (uma vez). */
export async function iniciar() {
  if (!cloudAtivo() || _auth) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.initializeApp(firebaseConfig);
  _auth = authMod.getAuth(app);
  _db = fsMod.getFirestore(app);
  _fns = {
    signIn: authMod.signInWithEmailAndPassword,
    signUp: authMod.createUserWithEmailAndPassword,
    reset: authMod.sendPasswordResetEmail,
    signOut: authMod.signOut,
    onAuth: authMod.onAuthStateChanged,
    doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc,
    collection: fsMod.collection, getDocs: fsMod.getDocs, writeBatch: fsMod.writeBatch,
  };
}

/** Resolve com o usuário já logado (Firebase persiste a sessão) ou null. */
export async function sessaoAtual() {
  await iniciar();
  return new Promise((res) => {
    const unsub = _fns.onAuth(_auth, (u) => { unsub(); _user = u || null; res(_user); });
  });
}

/** Encerra a sessão do coach. */
export async function sair() {
  if (_auth) await _fns.signOut(_auth);
  _user = null;
  // A base é "o que a nuvem DESTE coach tem". Deixá-la de pé faria o próximo a
  // logar no mesmo aparelho pular o envio de um mês que ele nunca gravou.
  _base = { coach: '', meses: {} };
}

/** Login do coach. @param {string} email @param {string} senha */
export async function login(email, senha) {
  await iniciar();
  const cred = await _fns.signIn(_auth, email, senha);
  _user = cred.user;
  return _user;
}

/** Cria a conta do coach (primeiro acesso). @param {string} email @param {string} senha */
export async function criarConta(email, senha) {
  await iniciar();
  const cred = await _fns.signUp(_auth, email, senha);
  _user = cred.user;
  return _user;
}

/** Envia e-mail de redefinição de senha. @param {string} email */
export async function resetarSenha(email) {
  await iniciar();
  await _fns.reset(_auth, email);
}

/** Tem dados úteis (algum treino, aluno ou programa antigo)? @param {any} est */
function temDados(est) {
  return !!est && !!(Object.keys(est.treinos || {}).length
    || (est.alunos || []).length
    || Object.keys(est.programas || {}).length);
}

/** Referências dos três lugares, num canto só. @param {string} uid */
const refCoach = (uid) => _fns.doc(_db, 'coaches', uid);
const refMes = (/** @type {string} */ uid, /** @type {string} */ mesId) => _fns.doc(_db, 'coaches', uid, 'treinos', mesId);
const refArquivo = (/** @type {string} */ uid, /** @type {string} */ nome) => _fns.doc(_db, 'coaches', uid, 'arquivo', nome);
const refMeses = (/** @type {string} */ uid) => _fns.collection(_db, 'coaches', uid, 'treinos');

/** Lê todos os meses de `coaches/{uid}/treinos`. @param {string} uid */
async function lerMeses(uid) {
  const snap = await _fns.getDocs(refMeses(uid));
  /** @type {Record<string, Record<string, any>>} */
  const meses = {};
  snap.forEach((/** @type {any} */ d) => { meses[d.id] = d.data()?.treinos || {}; });
  return meses;
}

/**
 * O que a nuvem tinha na última vez que falamos com ela, para não reenviar o que
 * não mudou. Sem isto, o primeiro salvamento depois do login reescreveria todos
 * os meses — justamente o que a divisão veio evitar.
 * @type {{coach: string, meses: Record<string, Record<string, any>>}}
 */
let _base = { coach: '', meses: {} };
function lembrarBase(/** @type {any} */ est) {
  _base = { coach: assinatura(fatiaDoCoach(est)), meses: agruparPorMes(est.treinos || {}) };
}

/**
 * Passa o formato antigo para o novo: cada mês vira documento, os `programas`
 * semanais vão para o arquivo e só então o documento do coach é regravado sem os
 * dois campos. Num lote só — se o commit falhar, o documento antigo continua
 * inteiro, e nada se perde. (O lote aceita 500 escritas; são meses, não dias.)
 * @param {string} uid
 * @param {any} base  o que estava em `coaches/{uid}`
 * @param {Record<string, any>} treinos  já fundido com o que veio dos meses
 */
async function migrarParaMeses(uid, base, treinos) {
  // Cópia crua do documento antes de dividir, uma vez só. A divisão é atômica e
  // testada, mas isto aqui é o histórico de treino do coach: se algo der errado,
  // a volta tem que ser possível sem depender do que sobrou em algum navegador.
  const copia = await _fns.getDoc(refArquivo(uid, 'antes-da-divisao'));
  const lote = _fns.writeBatch(_db);
  if (!copia.exists()) lote.set(refArquivo(uid, 'antes-da-divisao'), { documento: base, copiadoEm: Date.now() });
  const meses = agruparPorMes(treinos);
  for (const mesId of Object.keys(meses)) lote.set(refMes(uid, mesId), { treinos: meses[mesId], atualizadoEm: Date.now() });
  const programas = base.programas || {};
  if (Object.keys(programas).length) lote.set(refArquivo(uid, 'programas'), { programas, arquivadoEm: Date.now() });
  lote.set(refCoach(uid), fatiaDoCoach(base)); // `set` sem merge: é o que apaga treinos e programas
  await lote.commit();
}

/**
 * Sincroniza no login, sem perder dados:
 *  - nuvem com dados  → adota a nuvem (sobrescreve o local);
 *  - nuvem vazia + local com dados → semeia a nuvem com o local;
 *  - ambos vazios → nada.
 */
/**
 * O `store` entra por PARÂMETRO, não por import. Este arquivo é do núcleo
 * compartilhado — a tela do aluno, a Academia, a gestão e a loja dependem dele
 * para login. Importar o store do montador aqui faria o compartilhado depender
 * de um projeto, e todo mundo que só quer logar carregaria o estado do montador
 * junto. A dependência aponta para baixo: quem tem store é quem passa.
 * @param {{setEstado:Function, getEstado:Function}} store
 */
export async function carregarParaStore(store) {
  if (!_user) return false;
  const uid = _user.uid;
  const [snap, meses] = await Promise.all([_fns.getDoc(refCoach(uid)), lerMeses(uid)]);
  const base = snap.exists() ? snap.data() : {};
  // O legado só aparece antes da primeira migração — ou depois dela, se uma aba
  // velha regravou o documento do coach do jeito antigo.
  const treinos = fundirTreinos(juntarMeses(meses), base.treinos || {});
  let migrou = false;
  if (precisaMigrar(base)) {
    try { await migrarParaMeses(uid, base, treinos); migrou = true; } catch (e) {
      // Sem migrar, o coach ainda trabalha: os treinos já estão em mãos e o
      // documento antigo continua íntegro. Tentamos de novo no próximo login.
      console.error('Falha ao dividir os treinos por mês:', e);
    }
  }
  const nuvem = { alunos: base.alunos || [], config: base.config || {}, treinos, programas: migrou ? {} : (base.programas || {}) };
  if (temDados(nuvem)) {
    lembrarBase(nuvem);
    store.setEstado(nuvem);
    return true;
  }
  const local = store.getEstado();
  if (temDados(local)) {
    await enviarMudancas(local); // semeia a nuvem já no formato novo
  }
  return false;
}

/**
 * Manda o que mudou: o documento do coach só se alunos/config mudaram, e um
 * documento por mês tocado. Mês que ficou sem treino é reescrito vazio, senão o
 * treino apagado voltaria no próximo login.
 * @param {any} est estado do store
 */
async function enviarMudancas(est) {
  if (!_user) return;
  const uid = _user.uid;
  const coach = fatiaDoCoach(est);
  const meses = agruparPorMes(est.treinos || {});
  const escritas = [];
  if (assinatura(coach) !== _base.coach) escritas.push(_fns.setDoc(refCoach(uid), JSON.parse(JSON.stringify(coach))));
  for (const mesId of mesesQueMudaram(_base.meses, meses)) {
    const doMes = JSON.parse(JSON.stringify(meses[mesId] || {}));
    escritas.push(_fns.setDoc(refMes(uid, mesId), { treinos: doMes, atualizadoEm: Date.now() }));
  }
  if (!escritas.length) return;
  await Promise.all(escritas);
  // Só depois de tudo gravar. Se uma escrita falhar, a base fica como estava e o
  // próximo salvamento tenta de novo o que ficou para trás.
  lembrarBase(est);
}

let _timer = null;
/** Envia o que mudou à nuvem (debounced 800ms). */
export function agendarEnvio(est) {
  if (!_user) return;
  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    try {
      await enviarMudancas(est);
    } catch (e) { console.error('Falha ao salvar na nuvem:', e); }
  }, 800);
}

/** Conecta o store à nuvem: cada salvamento agenda um envio. */
/** @param {{aoSalvar:Function}} store */
export function conectarStore(store) {
  store.aoSalvar((est) => agendarEnvio(est));
}

export function usuario() { return _user; }
