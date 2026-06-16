// @ts-check
/**
 * Sincronização em nuvem (Firebase Auth + Firestore). Opcional: só liga se
 * cloud-config.js estiver configurado. Modelo: um documento por coach em
 * `coaches/{uid}` com { alunos, config, programas }.
 *
 * Carrega ao logar; envia (debounced) a cada mudança. Last-write-wins.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../cloud-config.js';
import * as store from './store.js';

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
    signOut: authMod.signOut,
    onAuth: authMod.onAuthStateChanged,
    doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc,
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
}

/** Login do coach. @param {string} email @param {string} senha */
export async function login(email, senha) {
  await iniciar();
  const cred = await _fns.signIn(_auth, email, senha);
  _user = cred.user;
  return _user;
}

/** Tem dados úteis (algum programa ou aluno)? @param {any} est */
function temDados(est) {
  return !!est && ((est.programas && Object.keys(est.programas).length) || (est.alunos && est.alunos.length));
}

/**
 * Sincroniza no login, sem perder dados:
 *  - nuvem com dados  → adota a nuvem (sobrescreve o local);
 *  - nuvem vazia + local com dados → semeia a nuvem com o local;
 *  - ambos vazios → nada.
 */
export async function carregarParaStore() {
  if (!_user) return false;
  const ref = _fns.doc(_db, 'coaches', _user.uid);
  const snap = await _fns.getDoc(ref);
  const nuvem = snap.exists() ? snap.data() : null;
  if (temDados(nuvem)) {
    store.setEstado(nuvem);
    return true;
  }
  const local = store.getEstado();
  if (temDados(local)) {
    await _fns.setDoc(ref, JSON.parse(JSON.stringify(local))); // semeia a nuvem
  }
  return false;
}

let _timer = null;
/** Envia o estado atual à nuvem (debounced 800ms). */
export function agendarEnvio(est) {
  if (!_user) return;
  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    try {
      await _fns.setDoc(_fns.doc(_db, 'coaches', _user.uid), JSON.parse(JSON.stringify(est)));
    } catch (e) { console.error('Falha ao salvar na nuvem:', e); }
  }, 800);
}

/** Conecta o store à nuvem: cada salvamento agenda um envio. */
export function conectarStore() {
  store.aoSalvar((est) => agendarEnvio(est));
}

export function usuario() { return _user; }
