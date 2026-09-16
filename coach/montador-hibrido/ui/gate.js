// @ts-check
/**
 * Porta de entrada do Montador Híbrido — a mesma de
 * `coach/montador-de-treino/ui/gate.js`, e deliberadamente igual: são apps do
 * mesmo painel, o coach tem uma conta só, e uma segunda forma de entrar seria
 * uma segunda forma de ficar de fora.
 *
 * Dois modos:
 *  - nuvem ativa: login real por e-mail/senha (Firebase);
 *  - nuvem inativa: senha local simples (dissuasor), como o resto do painel.
 *
 * Em ambos, `app.js` só é importado depois de liberar — a ferramenta inteira
 * fica atrás da porta, não só escondida por CSS.
 */
import { estaLiberado, tentarLiberar } from '../../../compartilhado/firebase/auth.js';
import {
  cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, usuario,
} from '../../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../../compartilhado/firebase/coach-guard.js';
import * as gestaoDb from '../../gestao-de-alunos/db.js';

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

function mostrarErro(msg) { if (erro) { erro.style.color = ''; erro.textContent = msg; erro.style.display = 'block'; } }
function mostrarOk(msg) { if (erro) { erro.style.color = 'var(--ok)'; erro.textContent = msg; erro.style.display = 'block'; } }

/** Mensagem amigável a partir do código do Firebase Auth — mesmo mapa do montador atual. */
function msgErroAuth(e) {
  const mapa = {
    'auth/invalid-credential': 'E-mail ou senha incorretos. Sem conta ainda? Use "Primeiro acesso? Criar conta".',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/user-not-found': 'Conta não encontrada. Use "Primeiro acesso? Criar conta".',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — faça login normalmente.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado. Publique as regras do Firestore.',
    'unavailable': 'Banco indisponível no momento. Verifique a conexão e tente de novo.',
  };
  return mapa[e?.code || ''] || `Erro ao entrar (${e?.code || 'desconhecido'}).`;
}

async function entrarComNuvem() {
  const u = usuario();
  if (u && await bloquearSeNaoCoach(u)) return; // barra contas de aluno
  // Os alunos da Gestão são a turma do Módulo 3. Sincronizar aqui, e não na aba,
  // evita a tela de turma abrir vazia no primeiro acesso de um aparelho novo.
  try { await gestaoDb.iniciarSync(u?.uid); } catch { /* offline: segue no cache local */ }
  entrar();
}

if (cloudAtivo()) {
  if (gate) gate.style.display = 'flex'; // mostra o login JÁ (evita tela branca se algo falhar)
  const email = document.createElement('input');
  email.type = 'email'; email.id = 'gate-email'; email.placeholder = 'E-mail'; email.autocomplete = 'username';
  input?.setAttribute('autocomplete', 'current-password');
  form?.insertBefore(email, input);

  let criando = false;
  const btn = form?.querySelector('button[type=submit]');
  const toggle = document.createElement('a');
  toggle.href = '#'; toggle.className = 'gate-link';
  toggle.textContent = 'Primeiro acesso? Criar conta';
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    criando = !criando;
    if (btn) btn.textContent = criando ? 'Criar conta e entrar' : 'Entrar';
    toggle.textContent = criando ? 'Já tenho conta — entrar' : 'Primeiro acesso? Criar conta';
    if (erro) erro.style.display = 'none';
  });
  form?.appendChild(toggle);

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
      if (criando) await criarConta(email.value.trim(), input.value);
      else await login(email.value.trim(), input.value);
      await entrarComNuvem();
    } catch (e) {
      mostrarErro(msgErroAuth(e));
    }
  });
} else if (estaLiberado()) {
  entrar();
} else if (gate) {
  gate.style.display = 'flex';
  input?.focus();
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (await tentarLiberar(input.value)) entrar();
    else { mostrarErro('Senha incorreta.'); input.value = ''; input.focus(); }
  });
}
