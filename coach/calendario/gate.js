// @ts-check
/** Porta do Calendário: o mesmo login do Coach; conta de aluno vê "Área restrita". */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../compartilhado/firebase/coach-guard.js';
import { iniciarCalendario } from './app.js';

const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const gate = $('#gate'), gErro = $('#gate-erro');

async function entrar(/** @type {any} */ user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra conta de aluno
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  iniciarCalendario(user);
}

$('#gate-form').addEventListener('submit', async (/** @type {SubmitEvent} */ ev) => {
  ev.preventDefault();
  const email = $('#gate-email').value.trim();
  const senha = $('#gate-senha').value;
  gErro.textContent = '';
  if (!email || !senha) { gErro.textContent = 'Informe e-mail e senha.'; return; }
  try {
    const user = await login(email, senha);
    $('#gate-senha').value = '';
    await entrar(user);
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    gErro.textContent = /** @type {Record<string, string>} */ ({
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'Conta não encontrada.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
    })[code] || `Não foi possível entrar (${code || 'erro desconhecido'}).`;
  }
});

$('#gate-reset').addEventListener('click', async (/** @type {MouseEvent} */ ev) => {
  ev.preventDefault();
  const email = $('#gate-email').value.trim();
  if (!email) { gErro.textContent = 'Digite seu e-mail para receber o link.'; return; }
  try { await resetarSenha(email); gErro.textContent = 'Link de redefinição enviado para o seu e-mail.'; }
  catch { gErro.textContent = 'Não foi possível enviar o link.'; }
});

(async () => {
  gate.style.display = 'flex';
  if (!cloudAtivo()) { gErro.textContent = 'Login indisponível (nuvem desativada).'; return; }
  const user = await sessaoAtual();
  if (user) await entrar(user);
})();
