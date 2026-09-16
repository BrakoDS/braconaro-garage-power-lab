// @ts-check
/**
 * LOGIN DO COACH (Firebase Auth) e a ligação do store do montador atual com a
 * nuvem. Opcional: só liga se `config.js` estiver configurado.
 *
 * Modelo: `coaches/{uid}` com { alunos, config } e o histórico ao lado, um
 * documento por mês em `coaches/{uid}/treinos/{YYYY-MM}` — a divisão de
 * 15/09/2026, quando o documento único ia para o teto de 1 MB do Firestore em
 * cerca de um ano e cada salvamento reescrevia o histórico inteiro.
 *
 * Carrega ao logar; envia (debounced) a cada mudança. Last-write-wins por mês.
 */
import { CLOUD_ATIVO, firebaseConfig } from './config.js';
import { criarSincronia } from './sync-por-mes.js';

/**
 * A conversa com o Firestore mora em `sync-por-mes.js`, parametrizada pela
 * coleção: o montador individual usa a mesma peça apontando para
 * `montadorIndividual/{uid}`. Aqui ficam o Auth e a ligação com o store.
 * `migrarLegado`: só este app teve tudo num documento só, até 15/09/2026.
 */
const sync = criarSincronia({ colecao: 'coaches', campos: ['alunos', 'config'], migrarLegado: true });

const V = '10.12.2';
let _auth = null, _user = null, _fns = {};

/** A nuvem está configurada/ativa? */
export function cloudAtivo() {
  return CLOUD_ATIVO && !!firebaseConfig && !!firebaseConfig.apiKey;
}

/** Inicializa os SDKs do Firebase (uma vez). */
export async function iniciar() {
  if (!cloudAtivo() || _auth) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  // O app Firebase é iniciado aqui e reaproveitado por quem fala com o Firestore
  // (`sync-por-mes.js`, `cloud-academia.js`, ...) via `getApp()`.
  const app = appMod.initializeApp(firebaseConfig);
  _auth = authMod.getAuth(app);
  _fns = {
    signIn: authMod.signInWithEmailAndPassword,
    signUp: authMod.createUserWithEmailAndPassword,
    reset: authMod.sendPasswordResetEmail,
    signOut: authMod.signOut,
    onAuth: authMod.onAuthStateChanged,
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
  sync.esquecer();
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
  return sync.carregar(_user.uid, store);
}

let _timer = null;
/** Envia o que mudou à nuvem (debounced 800ms). */
export function agendarEnvio(est) {
  if (!_user) return;
  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    try {
      await sync.enviar(_user.uid, est);
    } catch (e) { console.error('Falha ao salvar na nuvem:', e); }
  }, 800);
}

/** Conecta o store à nuvem: cada salvamento agenda um envio. */
/** @param {{aoSalvar:Function}} store */
export function conectarStore(store) {
  store.aoSalvar((est) => agendarEnvio(est));
}

export function usuario() { return _user; }
