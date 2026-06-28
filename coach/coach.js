// @ts-check
/**
 * Porta de acesso do painel Coach. Reaproveita o mesmo login do montador
 * (Firebase e-mail/senha quando a nuvem está ativa, ou senha local como
 * dissuasor). A sessão do Firebase é compartilhada com o montador, então
 * quem entra aqui abre o montador sem precisar logar de novo.
 *
 * Diferente do montador, aqui o "liberar" apenas revela o hub de apps —
 * não carrega nenhum app nem sincroniza dados.
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, sair } from '../montador/ui/cloud.js';
import { estaLiberado, tentarLiberar } from '../montador/ui/auth.js';

const gate  = document.getElementById('gate');
const form  = document.getElementById('gate-form');
const email = /** @type {HTMLInputElement} */ (document.getElementById('gate-email'));
const senha = /** @type {HTMLInputElement} */ (document.getElementById('gate-senha'));
const erro  = document.getElementById('gate-erro');
const toggle = document.getElementById('gate-toggle');
const reset  = document.getElementById('gate-reset');
const btnEntrar = form?.querySelector('button[type=submit]');
const hub   = document.getElementById('hub');
const btnSair = document.getElementById('sair');

function entrar() {
  if (gate) gate.style.display = 'none';
  hub?.removeAttribute('hidden');
}
function mostrarErro(msg) { if (erro) { erro.style.color = ''; erro.textContent = msg; erro.style.display = 'block'; } }
function mostrarOk(msg)  { if (erro) { erro.style.color = 'var(--ok)'; erro.textContent = msg; erro.style.display = 'block'; } }

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
    'permission-denied': 'Login OK, mas o banco está bloqueado. Publique as regras do Firestore.',
    'unavailable': 'Serviço indisponível no momento. Verifique a conexão e tente de novo.',
  };
  return mapa[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

// Botão "Sair" (encerra a sessão do coach)
btnSair?.addEventListener('click', async () => {
  try { await sair(); } catch {}
  location.reload();
});

if (cloudAtivo()) {
  // ---- modo nuvem: login e-mail/senha ----
  if (gate) gate.style.display = 'flex';

  let criando = false;
  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    criando = !criando;
    if (btnEntrar) btnEntrar.textContent = criando ? 'Criar conta e entrar' : 'Entrar';
    if (toggle) toggle.textContent = criando ? 'Já tenho conta — entrar' : 'Primeiro acesso? Criar conta';
    if (erro) erro.style.display = 'none';
  });

  reset?.addEventListener('click', async (e) => {
    e.preventDefault();
    const mail = email.value.trim();
    if (!mail) { mostrarErro('Digite seu e-mail acima primeiro.'); email.focus(); return; }
    try {
      await resetarSenha(mail);
      mostrarOk('Enviamos um link de redefinição para seu e-mail. Verifique a caixa (e o spam).');
    } catch (err) { mostrarErro(msgErroAuth(err)); console.error('Reset:', err?.code, err?.message); }
  });

  // Sessão já ativa? Entra direto.
  sessaoAtual().then((u) => { if (u) entrar(); else email.focus(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (erro) erro.style.display = 'none';
    try {
      if (criando) await criarConta(email.value.trim(), senha.value);
      else await login(email.value.trim(), senha.value);
      entrar();
    } catch (e) { mostrarErro(msgErroAuth(e)); console.error('Auth:', e?.code, e?.message); }
  });
} else if (estaLiberado()) {
  // ---- modo local: já liberado nesta sessão ----
  entrar();
} else {
  // ---- modo local: senha simples ----
  if (gate) gate.style.display = 'flex';
  // sem nuvem, não há e-mail/criar conta/reset
  email?.closest ? email.remove() : null;
  toggle?.remove();
  reset?.remove();
  senha?.focus();
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ok = await tentarLiberar(senha.value);
    if (ok) entrar();
    else { mostrarErro('Senha incorreta.'); senha.value = ''; senha.focus(); }
  });
}
