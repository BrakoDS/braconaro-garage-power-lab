// @ts-check
/**
 * Porta de entrada da Semana do Box — a mesma de `coach/montador-hibrido/ui/gate.js`:
 * o coach tem uma conta só, e uma segunda forma de entrar seria uma segunda
 * forma de ficar de fora.
 *
 * Diferença: aqui NÃO existe o modo "senha local". A ferramenta inteira é
 * servidor (gerar, publicar, ler a semana), e sem a nuvem não há o que mostrar.
 *
 * `app.js` só é importado depois do login — a tela fica atrás da porta, não só
 * escondida por CSS.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha, usuario } from '../../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../../compartilhado/firebase/coach-guard.js';

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

/** @param {string} msg */
function mostrarErro(msg) { if (erro) { erro.style.color = ''; erro.textContent = msg; erro.style.display = 'block'; } }
/** @param {string} msg */
function mostrarOk(msg) { if (erro) { erro.style.color = 'var(--ok)'; erro.textContent = msg; erro.style.display = 'block'; } }

/** Mesmo mapa do Montador Híbrido. @param {any} e */
function msgErroAuth(e) {
  /** @type {Record<string, string>} */
  const mapa = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/user-not-found': 'Conta não encontrada. Contas de coach são criadas pelo administrador.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  };
  return mapa[e?.code || ''] || `Erro ao entrar (${e?.code || 'desconhecido'}).`;
}

async function entrarComNuvem() {
  const u = usuario();
  if (u && await bloquearSeNaoCoach(u)) return; // barra contas de aluno
  entrar();
}

if (!cloudAtivo()) {
  if (gate) gate.style.display = 'flex';
  input?.setAttribute('disabled', '');
  mostrarErro('A Semana do Box precisa da nuvem (Firebase), e ela não está configurada neste site.');
} else {
  if (gate) gate.style.display = 'flex'; // mostra o login JÁ (evita tela branca se algo falhar)
  const email = document.createElement('input');
  email.type = 'email'; email.id = 'gate-email'; email.placeholder = 'E-mail'; email.autocomplete = 'username';
  form?.insertBefore(email, input);

  const reset = document.createElement('a');
  reset.href = '#'; reset.className = 'gate-link';
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
    }
  });
  form?.appendChild(reset);

  sessaoAtual().then((u) => { if (u) entrarComNuvem(); else email.focus(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (erro) erro.style.display = 'none';
    try {
      await login(email.value.trim(), input.value);
      await entrarComNuvem();
    } catch (e) {
      mostrarErro(msgErroAuth(e));
    }
  });
}
