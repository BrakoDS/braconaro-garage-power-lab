// @ts-check
/**
 * Porta de entrada do montador. Dois modos:
 *  - Nuvem ativa: login real por e-mail/senha (Firebase) + carrega dados da nuvem.
 *  - Nuvem inativa: senha local simples (dissuasor), como antes.
 * Em ambos, o app (app.js) só é carregado após liberar.
 */
import { estaLiberado, tentarLiberar } from './auth.js';
import { cloudAtivo, sessaoAtual, login, criarConta, carregarParaStore, conectarStore } from './cloud.js';

const gate = document.getElementById('gate');
const form = document.getElementById('gate-form');
const input = /** @type {HTMLInputElement} */ (document.getElementById('gate-senha'));
const erro = document.getElementById('gate-erro');

function entrar() {
  if (gate) gate.style.display = 'none';
  document.querySelector('main')?.removeAttribute('hidden');
  document.querySelector('.topbar')?.removeAttribute('hidden');
  import('./app.js');
}

function mostrarErro(msg) { if (erro) { erro.textContent = msg; erro.style.display = 'block'; } }

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
  };
  return mapa[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

async function entrarComNuvem() {
  await carregarParaStore();
  conectarStore();
  entrar();
}

if (cloudAtivo()) {
  // ---- modo nuvem: login e-mail/senha ----
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
