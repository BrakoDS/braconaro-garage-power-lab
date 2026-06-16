// @ts-check
/**
 * Porta de entrada do montador. Dois modos:
 *  - Nuvem ativa: login real por e-mail/senha (Firebase) + carrega dados da nuvem.
 *  - Nuvem inativa: senha local simples (dissuasor), como antes.
 * Em ambos, o app (app.js) só é carregado após liberar.
 */
import { estaLiberado, tentarLiberar } from './auth.js';
import { cloudAtivo, sessaoAtual, login, carregarParaStore, conectarStore } from './cloud.js';

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
  if (gate) gate.style.display = 'flex';

  // já logado? (Firebase lembra a sessão)
  sessaoAtual().then((u) => { if (u) entrarComNuvem(); else email.focus(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (erro) erro.style.display = 'none';
    try {
      await login(email.value.trim(), input.value);
      await entrarComNuvem();
    } catch (e) {
      mostrarErro('E-mail ou senha incorretos.');
      input.value = '';
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
