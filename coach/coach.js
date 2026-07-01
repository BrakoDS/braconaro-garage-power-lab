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

function entrar(user) {
  if (gate) gate.style.display = 'none';
  hub?.removeAttribute('hidden');
  montarPainel(user);
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
  sessaoAtual().then((u) => { if (u) entrar(u); else email.focus(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (erro) erro.style.display = 'none';
    try {
      const u = criando ? await criarConta(email.value.trim(), senha.value) : await login(email.value.trim(), senha.value);
      entrar(u);
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

/* ============================================================
   Painel do Coach — resumo do dia (dados da Gestão de Alunos)
   ============================================================ */
const $ = (s) => document.querySelector(s);
const escP = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hojeISO = () => new Date().toISOString().slice(0, 10);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Data da próxima reavaliação (da avaliação mais recente do aluno). */
function proxReav(a) {
  const avs = (a.avaliacoes || []).filter((x) => x.dataRealizada);
  if (!avs.length) return null;
  const ult = avs.reduce((m, x) => (x.dataRealizada > m.dataRealizada ? x : m), avs[0]);
  return ult.dataProxima || null;
}
const diasAte = (iso) => Math.round((new Date(iso + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 86400000);
const fmtBr = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}`; };

async function montarPainel(user) {
  let db;
  try { db = await import('../alunos/db.js'); } catch { return; } // painel é opcional
  const render = () => renderPainel(db.listar());
  render();
  if (user?.uid) { try { await db.iniciarSync(user.uid, render); } catch { /* offline/regra: usa local */ } }
}

function renderPainel(alunos) {
  const painel = $('#painel'); if (!painel) return;
  painel.removeAttribute('hidden');
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;

  const ativos = alunos.filter((a) => (a.status || 'ativo') === 'ativo').length;

  let atrasadas = 0, aVencer = 0;
  const agenda = [];
  for (const a of alunos) {
    const prox = proxReav(a);
    if (!prox) continue;
    const d = diasAte(prox);
    if (d < 0) atrasadas++; else if (d <= 7) aVencer++;
    agenda.push({ nome: a.nome, prox, d });
  }
  agenda.sort((x, y) => x.d - y.d);

  const aniv = [];
  for (const a of alunos) {
    if (!a.nascimento) continue;
    const [ano, mes, dia] = a.nascimento.split('-').map(Number);
    if (mes === mesAtual) aniv.push({ nome: a.nome, dia, idade: hoje.getFullYear() - ano });
  }
  aniv.sort((x, y) => x.dia - y.dia);

  const stat = (label, valor, sub, cls = '') =>
    `<div class="stat ${cls}"><span class="stat-v">${valor}</span><span class="stat-l">${label}</span>${sub ? `<span class="stat-s">${sub}</span>` : ''}</div>`;
  $('#painel-stats').innerHTML =
    stat('Alunos ativos', ativos, `de ${alunos.length}`) +
    stat('Avaliações atrasadas', atrasadas, atrasadas ? 'precisam reavaliar' : 'tudo em dia', atrasadas ? 'bad' : '') +
    stat('A vencer (7 dias)', aVencer, 'reavaliações próximas', aVencer ? 'warn' : '') +
    stat(`Aniversários de ${MESES[mesAtual - 1].slice(0, 3)}`, aniv.length, 'este mês');

  if (!alunos.length) {
    $('#painel-cols').innerHTML = `<div class="painel-vazio">Nenhum aluno cadastrado ainda. Abra a <a href="../alunos/index.html">Gestão de Alunos</a> para começar — o resumo aparece aqui.</div>`;
    return;
  }

  const itensAgenda = agenda.slice(0, 6).map((x) => {
    const cls = x.d < 0 ? 'bad' : x.d <= 7 ? 'warn' : 'mut';
    const txt = x.d < 0 ? `atrasada ${-x.d}d` : x.d === 0 ? 'hoje' : x.d <= 7 ? `em ${x.d}d` : fmtBr(x.prox);
    return `<li><span class="li-nome">${escP(x.nome)}</span><span class="li-tag ${cls}">${txt}</span></li>`;
  }).join('') || '<li class="vazio">Sem reavaliações registradas.</li>';

  const itensAniv = aniv.map((x) =>
    `<li><span class="li-nome">${escP(x.nome)}</span><span class="li-tag mut">dia ${x.dia} · faz ${x.idade}</span></li>`
  ).join('') || '<li class="vazio">Ninguém faz aniversário este mês.</li>';

  $('#painel-cols').innerHTML = `
    <div class="painel-card">
      <div class="pc-head"><h3>Agenda de reavaliações</h3><a href="../alunos/index.html">ver alunos →</a></div>
      <ul class="pc-list">${itensAgenda}</ul>
    </div>
    <div class="painel-card">
      <div class="pc-head"><h3>Aniversariantes de ${MESES[mesAtual - 1]}</h3></div>
      <ul class="pc-list">${itensAniv}</ul>
    </div>`;
}
