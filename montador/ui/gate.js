// @ts-check
/**
 * Porta de entrada do montador: pede a senha e só então carrega o app.
 * Se já liberado nesta sessão, entra direto.
 */
import { estaLiberado, tentarLiberar } from './auth.js';

const gate = document.getElementById('gate');
const form = document.getElementById('gate-form');
const input = /** @type {HTMLInputElement} */ (document.getElementById('gate-senha'));
const erro = document.getElementById('gate-erro');

function entrar() {
  if (gate) gate.style.display = 'none';
  document.querySelector('main')?.removeAttribute('hidden');
  document.querySelector('.topbar')?.removeAttribute('hidden');
  import('./app.js'); // carrega o app só depois de liberar
}

if (estaLiberado()) {
  entrar();
} else if (gate) {
  gate.style.display = 'flex';
  input?.focus();
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ok = await tentarLiberar(input.value);
    if (ok) { entrar(); }
    else if (erro) { erro.style.display = 'block'; input.value = ''; input.focus(); }
  });
}
