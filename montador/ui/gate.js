// @ts-check
/**
 * Porta de entrada do montador. Dois modos:
 *  - Nuvem ativa: login real por e-mail/senha (Firebase) + carrega dados da nuvem.
 *  - Nuvem inativa: senha local simples (dissuasor), como antes.
 * Em ambos, o app (app.js) só é carregado após liberar.
 */
import { estaLiberado, tentarLiberar } from './auth.js';
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, carregarParaStore, conectarStore, usuario } from './cloud.js';
import { aplicarInventarioAcademia, sincronizarInventarioAcademia } from './inventario.js';

const gate = document.getElementById('gate');
const form = document.getElementById('gate-form');
const input = /** @type {HTMLInputElement} */ (document.getElementById('gate-senha'));
const erro = document.getElementById('gate-erro');

function entrar() {
  if (gate) gate.style.display = 'none';
  document.querySelector('main')?.removeAttribute('hidden');
  document.querySelector('.topbar')?.removeAttribute('hidden');
  try { aplicarInventarioAcademia(); } catch (e) { console.warn('Inventário da Academia indisponível:', e); }
  import('./app.js');
}

function mostrarErro(msg) { if (erro) { erro.style.color = ''; erro.textContent = msg; erro.style.display = 'block'; } }
function mostrarOk(msg) { if (erro) { erro.style.color = 'var(--ok)'; erro.textContent = msg; erro.style.display = 'block'; } }

/** Mensagem amigável a partir do código de erro do Firebase Auth. */
function msgErroAuth(e) {
  const c = e?.code || '';
  const mapa = {
    'auth/invalid-credential': 'E-mail ou senha incorretos. Sem conta ainda? Use "Primeiro acesso? Criar conta".',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/user-not-found': 'Conta não encontrada. Use "Primeiro acesso? Criar conta".',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — faça login normalmente.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/operation-not-allowed': 'Ative "E-mail/senha" no Firebase (Authentication → Sign-in method).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado. Publique as regras do Firestore (Firestore → Regras).',
    'unavailable': 'Banco indisponível no momento. Verifique a conexão e tente de novo.',
    'failed-precondition': 'Crie o banco em Firestore Database (ainda não foi criado).',
  };
  return mapa[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

async function entrarComNuvem() {
  await carregarParaStore();
  conectarStore();
  await sincronizarInventarioAcademia(usuario()?.uid); // puxa o inventário da nuvem antes de aplicar
  entrar();
}

if (cloudAtivo()) {
  // ---- modo nuvem: login e-mail/senha ----
  if (gate) gate.style.display = 'flex'; // mostra o login JÁ (evita tela branca se algo falhar)
  const email = document.createElement('input');
  email.type = 'email'; email.id = 'gate-email'; email.placeholder = 'E-mail'; email.autocomplete = 'username';
  input?.setAttribute('placeholder', 'Senha');
  input?.setAttribute('autocomplete', 'current-password');
  form?.insertBefore(email, input);

  // link "primeiro acesso? criar conta"
  let criando = false;
  const btn = form?.querySelector('button[type=submit]');
  const toggle = document.createElement('a');
  toggle.href = '#'; toggle.style.cssText = 'color:var(--mut);font-size:13px;cursor:pointer';
  toggle.textContent = 'Primeiro acesso? Criar conta';
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    criando = !criando;
    if (btn) btn.textContent = criando ? 'Criar conta e entrar' : 'Entrar';
    toggle.textContent = criando ? 'Já tenho conta — entrar' : 'Primeiro acesso? Criar conta';
    if (erro) erro.style.display = 'none';
  });
  form?.appendChild(toggle);

  // link "esqueci a senha"
  const reset = document.createElement('a');
  reset.href = '#'; reset.style.cssText = 'color:var(--mut);font-size:13px;cursor:pointer';
  reset.textContent = 'Esqueci a senha';
  reset.addEventListener('click', async (e) => {
    e.preventDefault();
    const mail = email.value.trim();
    if (!mail) { mostrarErro('Digite seu e-mail acima primeiro.'); email.focus(); return; }
    try {
      await resetarSenha(mail);
      mostrarOk('Enviamos um link de redefinição para seu e-mail. Verifique a caixa (e o spam).');
    } catch (err) {
      mostrarErro(msgErroAuth(err));
      console.error('Reset:', err?.code, err?.message);
    }
  });
  form?.appendChild(reset);

  if (gate) gate.style.display = 'flex';
  sessaoAtual().then((u) => { if (u) entrarComNuvem(); else email.focus(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (erro) erro.style.display = 'none';
    try {
      if (criando) await criarConta(email.value.trim(), input.value);
      else await login(email.value.trim(), input.value);
      await entrarComNuvem();
    } catch (e) {
      mostrarErro(msgErroAuth(e));
      console.error('Auth:', e?.code, e?.message);
    }
  });
} else if (estaLiberado()) {
  // ---- modo local: já liberado nesta sessão ----
  entrar();
} else if (gate) {
  // ---- modo local: senha simples ----
  gate.style.display = 'flex';
  input?.focus();
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ok = await tentarLiberar(input.value);
    if (ok) entrar();
    else { mostrarErro('Senha incorreta.'); input.value = ''; input.focus(); }
  });
}
