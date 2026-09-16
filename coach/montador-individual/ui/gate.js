// @ts-check
/**
 * Porta de entrada do Montador Individual: login do coach (Firebase Auth),
 * carga da nuvem e só então o app.
 *
 * Mesmo desenho da Academia e do montador atual — o login é do núcleo
 * compartilhado (`cloud.js`), o documento é deste app (`cloud-individual.js`).
 * O app (`app.js`) só é importado depois de liberar: sem sessão, nada da tela
 * do coach chega ao navegador.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha, usuario } from '../../../compartilhado/firebase/cloud.js';
import { bloquearSeNaoCoach } from '../../../compartilhado/firebase/coach-guard.js';
import { construirCatalogoEfetivo, sincronizarCatalogoAcademia } from '../../../compartilhado/dados/catalogo-efetivo.js';
import { carregarParaStore, conectarStore } from '../cloud-individual.js';
import * as store from './store.js';

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const form = document.getElementById('gate-form');
const email = /** @type {HTMLInputElement} */ (document.getElementById('gate-email'));
const senha = /** @type {HTMLInputElement} */ (document.getElementById('gate-senha'));
const erro = document.getElementById('gate-erro');

function mostrarErro(/** @type {string} */ msg, ok = false) {
  if (!erro) return;
  erro.textContent = msg;
  erro.style.color = ok ? 'var(--ok)' : '';
  erro.style.display = 'block';
}

/** Mensagem amigável a partir do código do Firebase. @param {any} e */
function msgErro(e) {
  const mapa = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Conta não encontrada. Crie a sua no montador atual.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado. Publique as regras do Firestore.',
    'unavailable': 'Banco indisponível no momento. Tente de novo.',
  };
  return mapa[e?.code] || `Erro ao entrar (${e?.code || 'desconhecido'}).`;
}

async function entrar() {
  const u = usuario();
  if (u && await bloquearSeNaoCoach(u)) return; // barra conta de aluno
  const uid = u?.uid;
  await carregarParaStore(uid, store);
  conectarStore(uid, store);
  // O catálogo da Academia é a fonte dos exercícios que o coach digita aqui.
  await sincronizarCatalogoAcademia(uid);
  try { construirCatalogoEfetivo(); } catch (e) { console.warn('Catálogo da Academia indisponível:', e); }
  if (gate) gate.style.display = 'none';
  app?.removeAttribute('hidden');
  import('./app.js');
}

if (!cloudAtivo()) {
  // Sem nuvem não há como saber quem é o coach nem onde salvar. É estado de
  // configuração, não de uso: melhor dizer isso do que abrir uma tela que não salva.
  mostrarErro('A nuvem está desligada nesta instalação — este montador precisa dela.');
} else {
  sessaoAtual().then((u) => { if (u) entrar().catch((e) => mostrarErro(msgErro(e))); else email?.focus(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (erro) erro.style.display = 'none';
    try {
      await login(email.value.trim(), senha.value);
      await entrar();
    } catch (e) {
      mostrarErro(msgErro(e));
      console.error('Auth:', e?.code, e?.message);
    }
  });

  document.getElementById('gate-reset')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const mail = email.value.trim();
    if (!mail) { mostrarErro('Digite seu e-mail acima primeiro.'); email.focus(); return; }
    try {
      await resetarSenha(mail);
      mostrarErro('Enviamos um link de redefinição. Verifique a caixa de entrada e o spam.', true);
    } catch (e) { mostrarErro(msgErro(e)); }
  });
}
