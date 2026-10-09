// @ts-check
/**
 * O boot da Gestão: o portão de acesso (o mesmo login do Coach/Montador), a
 * entrada, o sync com a nuvem e o que roda depois dele, e a publicação do
 * Portal do Aluno a cada gravação.
 *
 * Saiu do `app.js` no fatiamento — é o que sobrou dele depois que todas as
 * telas foram para módulo próprio. Não desenha tela nenhuma: as telas já estão
 * ligadas (telas.js) quando `iniciarBoot()` roda, e a partir daqui tudo chega
 * a elas pelo barramento ('alunos-mudaram', 'registros-mudaram').
 *
 * A ORDEM depois do sync:
 *   0) o cache local passa a ser o espelho da nuvem (e o medidor anota);
 *   1) a caixa de cada aluno (foto, feedback, presença, diário) é mesclada;
 *   2) o Portal é publicado, já com o que a caixa trouxe;
 *   3) o mural e os desafios vêm da nuvem;
 *   4) os selos da lista (kcal e medalhas) e o ranking do box;
 *   5) o selo de follow-up dos leads;
 *   6) a Fila de mensagens mescla o que outro aparelho já enviou ou descartou.
 *
 * O PIX DO MERCADO PAGO (pix-baixa.js): o webhook não grava na ficha — anota no
 * livro-caixa `cobrancasPix`, e a baixa é feita pelo pix-baixa.js (a mesma regra da baixa manual). Roda
 * depois da caixa dos alunos e ANTES de publicar o Portal (passo 1b), de 2 em 2
 * minutos e ao voltar para a aba, e antes de cada publicação do Portal — senão
 * uma Gestão aberta desde antes do Pix republicaria o Portal sem ele.
 */
import { cloudAtivo, sessaoAtual, login, resetarSenha } from '../../compartilhado/firebase/cloud.js';
import { estaLiberado, tentarLiberar } from '../../compartilhado/firebase/auth.js';
import { bloquearSeNaoCoach } from '../../compartilhado/firebase/coach-guard.js';
import * as db from './db.js?v=14';
import * as eventos from './eventos.js?v=14';
import { publicarPortal } from './portal-sync.js?v=14';
import { mergarInboxes } from './portal-merge.js?v=14';
import { sincronizarAvisos } from './avisos.js?v=14';
import { sincronizarDesafios } from './desafios.js?v=14';
import { estado, emit, EVENTOS } from './estado.js?v=14';
import { $ } from './util/dom.js?v=14';
import { renderLista } from './ui-lista.js?v=14';
import { atualizarSelosDaLista } from './selos-lista.js?v=14';
import { carregarBadgeLeads } from './ui-tela-leads.js?v=14';
import { sincronizarAutomacao } from './automacao.js?v=14';
import { atualizarFilaDeMensagens } from './ui-tela-automacao.js?v=14';
import { medirTamanhoBanco, iniciarBackup } from './medidor-banco.js?v=14';
import { aplicarPixPendentes } from './pix-baixa.js?v=14';
import { listarPixParaTratar, marcarPixTratado } from './pix-read.js?v=14';
import { reg } from './registro.js?v=14';

/* ============================================================
   A gravação publica o Portal
   ============================================================ */

let _portalTimer = /** @type {any} */ (null);
/**
 * Publica o Portal do Aluno daqui a pouco — várias gravações seguidas viram uma
 * publicação. Antes, aplica os Pix já aprovados: o Portal não pode voltar a
 * mostrar "a pagar" para quem já pagou.
 */
function agendarPublicarPortal() {
  clearTimeout(_portalTimer);
  _portalTimer = setTimeout(async () => { await tratarPix(); publicarPortal(db.listar(), db.diasFechados()); }, 1500);
}

/* ============================================================
   O Pix do Mercado Pago
   ============================================================ */

const PIX_INTERVALO_MS = 2 * 60_000;
let _pixRodando = /** @type {Promise<void>|null} */ (null);

/**
 * Aplica os Pix aprovados (e registra os avisos) — uma rodada por vez. Só com
 * a nuvem em dia (v2): no modo local a baixa não subiria.
 */
function tratarPix() {
  const uid = estado.uid;
  if (!uid || (typeof db.modoSync === 'function' && db.modoSync() !== 'v2')) return Promise.resolve();
  if (_pixRodando) return _pixRodando;
  _pixRodando = aplicarPixPendentes({
    listar: () => listarPixParaTratar(uid),
    marcarTratado: (id, em) => marcarPixTratado(uid, id, em),
    obter: db.obter, todos: db.listar, atualizar: db.atualizar, registrar: reg, agora: Date.now,
  })
    .then((r) => { if (r.baixas || r.avisos) console.info(`[Gestão] Pix: ${r.baixas} baixa(s), ${r.avisos} aviso(s).`); })
    .catch((e) => console.warn('[Gestão] Pix: não deu para conferir agora.', e?.code || e))
    .finally(() => { _pixRodando = null; });
  return _pixRodando;
}

let _pixLigado = false;
/** De tempos em tempos, e ao voltar para a aba. */
function ligarPixPeriodico() {
  if (_pixLigado) return;
  _pixLigado = true;
  setInterval(tratarPix, PIX_INTERVALO_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tratarPix(); });
}

/* ============================================================
   Entrar
   ============================================================ */

/** A ficha aberta no perfil, recarregada do banco (o sync ou a caixa a mudaram). */
function recarregarFichaAberta() {
  if (!$('#tela-perfil')?.classList.contains('active') || !estado.alunoAtual) return null;
  const a = db.obter(estado.alunoAtual.id);
  if (a) estado.alunoAtual = a;
  return a;
}

/** @param {any} [user] o usuário logado (sem nuvem: nenhum) */
async function entrar(user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra contas de aluno
  estado.uid = user?.uid || null;
  $('#gate').style.display = 'none';
  $('#app').removeAttribute('hidden');
  renderLista();
  atualizarFilaDeMensagens(); // o selo da Fila de mensagens, já com o que está neste aparelho
  // Sincroniza com a nuvem (se houver usuário logado). Não bloqueia a UI.
  if (!(user && user.uid)) return;
  eventos.configurarEventos(user.uid); // sobe o que ficou na fila da última sessão
  db.iniciarSync(user.uid, () => {
    // Dados da nuvem chegaram: o estado passa a apontar para a ficha nova e
    // as telas que ouvem 'alunos-mudaram' (lista, cabeçalho, abas) se redesenham.
    recarregarFichaAberta();
    emit(EVENTOS.ALUNOS_MUDARAM);
  }).then(async (modo) => {
    // 0) agora o cache local é o espelho da nuvem
    medirTamanhoBanco('após sync');
    // Nuvem ainda no formato antigo e a migração não terminou (outro aparelho
    // migrando, rede): o merge APAGA a caixa do aluno depois de aplicar, e a
    // ficha daqui ainda não sobe — o feedback ficaria só neste aparelho. A
    // caixa espera a próxima abertura; o Portal também.
    const nuvemEmDia = modo !== 'local';
    // 1) puxa o que os alunos enviaram (foto/feedback/presença/diário) e mescla no coach
    const n = !nuvemEmDia ? 0 : await mergarInboxes(db.listar(), (id, patch) => db.atualizar(id, patch), eventos.registrar);
    if (n) {
      renderLista();
      const a = recarregarFichaAberta();
      // O merge acabou de pôr eventos novos na fila (foto, feedback, diário):
      // a aba Registros e a Progresso, se abertas, mostram já.
      if (a) emit(EVENTOS.REGISTROS_MUDARAM, a.id);
    }
    // 1b) os Pix aprovados no Mercado Pago viram baixa — antes de publicar o Portal
    if (nuvemEmDia) { await tratarPix(); recarregarFichaAberta(); ligarPixPeriodico(); }
    // 2) publica o Portal do Aluno (com a foto nova já aplicada) após sincronizar
    if (nuvemEmDia) publicarPortal(db.listar());
    // 3) puxa o mural de avisos + desafios da nuvem (para editar no mesmo estado em qualquer aparelho)
    sincronizarAvisos();
    sincronizarDesafios();
    // 4) selos da lista (treino queimado na semana, medalhas) e o ranking do box
    atualizarSelosDaLista();
    // 5) leads que precisam de follow-up (selo no botão "Leads")
    carregarBadgeLeads();
    // 6) a Fila de mensagens: o que outro aparelho já enviou ou descartou sai daqui
    sincronizarAutomacao(user.uid);
  });
}

/* ============================================================
   O portão de acesso
   ============================================================ */

/** O texto do erro de login, na língua do coach. @param {any} e */
export function msgAuth(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Conta não encontrada. Contas de coach são criadas pelo administrador.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — faça login normalmente.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado (regras do Firestore).',
  })[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

/** Liga o portão. Com a nuvem: login do Firebase (ou a sessão já aberta). Sem: a senha local. */
function iniciarPortao() {
  const gate = $('#gate'), gform = $('#gate-form');
  const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
  const gReset = $('#gate-reset');
  const erroMsg = (m) => { gErro.style.color = ''; gErro.textContent = m; gErro.style.display = 'block'; };
  const okMsg = (m) => { gErro.style.color = 'var(--ok)'; gErro.textContent = m; gErro.style.display = 'block'; };

  if (cloudAtivo()) {
    gate.style.display = 'flex';
    gReset.addEventListener('click', async (/** @type {Event} */ e) => { e.preventDefault(); const m = gEmail.value.trim(); if (!m) { erroMsg('Digite seu e-mail acima primeiro.'); gEmail.focus(); return; } try { await resetarSenha(m); okMsg('Enviamos um link de redefinição para seu e-mail.'); } catch (err) { erroMsg(msgAuth(err)); } });
    sessaoAtual().then((u) => { if (u) entrar(u); else gEmail.focus(); });
    gform.addEventListener('submit', async (/** @type {Event} */ e) => {
      e.preventDefault(); gErro.style.display = 'none';
      try {
        const user = await login(gEmail.value.trim(), gSenha.value);
        entrar(user);
      }
      catch (err) { erroMsg(msgAuth(err)); console.error('Auth:', /** @type {any} */ (err)?.code, /** @type {any} */ (err)?.message); }
    });
  } else if (estaLiberado()) {
    entrar();
  } else {
    gate.style.display = 'flex';
    gEmail?.remove(); gReset?.remove(); gSenha.focus();
    gform.addEventListener('submit', async (/** @type {Event} */ e) => { e.preventDefault(); if (await tentarLiberar(gSenha.value)) entrar(); else { erroMsg('Senha incorreta.'); gSenha.value = ''; gSenha.focus(); } });
  }
}

/**
 * Liga a publicação do Portal, o backup, mede o banco e abre o portão.
 * Chamar UMA vez, depois das telas (telas.js): a sessão já aberta entra direto
 * e desenha a lista, que precisa estar ligada.
 */
export function iniciarBoot() {
  // Toda gravação: publica o Portal e avisa as telas que ouvem. É o ÚNICO lugar
  // que agenda a publicação depois de gravar — as telas só gravam.
  db.aoGravar(() => { agendarPublicarPortal(); emit(EVENTOS.ALUNOS_MUDARAM); });
  iniciarBackup();
  medirTamanhoBanco();
  iniciarPortao();
}
