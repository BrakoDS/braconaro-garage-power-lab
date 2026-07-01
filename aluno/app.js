// @ts-check
/**
 * Portal do Aluno — app principal (Fase 1: read-only).
 * Login e-mail/senha (Firebase, mesmo projeto). Lê a fatia publicada pelo coach
 * em portal/{email} e mostra boas-vindas, progresso, financeiro e avaliações
 * (com comparação). Reaproveita o design e o calc.js do app de alunos.
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, sair, usuario } from '../montador/ui/cloud.js';
import { carregarPortal } from './portal-db.js';
import * as calc from '../alunos/calc.js?v=2';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtData(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
function iniciais(n) { return ((n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase(); }
function primeiroNome(n) { return (n || 'Aluno').trim().split(/\s+/)[0]; }
function delta(a, b) { return (a == null || b == null) ? null : b - a; }
function sinal(v, d = 1) { return v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d); }

/** @type {any} */
let PORTAL = null;

/* ============================================================
   Render do dashboard
   ============================================================ */
function alunoLike() { return { sexo: PORTAL?.sexo, nascimento: PORTAL?.nascimento }; }
function avaliacoesOrdenadas() {
  return (PORTAL?.avaliacoes || []).filter((x) => x.dataRealizada).slice().sort((a, b) => (a.dataRealizada < b.dataRealizada ? -1 : 1));
}

function render() {
  const temDados = !!PORTAL;
  $('#sem-dados').hidden = temDados;
  ['sec-progresso', 'sec-financeiro', 'sec-avaliacoes'].forEach((id) => { $('#' + id).hidden = !temDados; });

  // Boas-vindas (sempre, com nome do que tiver)
  const nome = PORTAL?.nome || (usuario()?.email || '').split('@')[0];
  const foto = PORTAL?.fotoUrl;
  const subt = PORTAL ? [PORTAL.objetivo, PORTAL.nivel].filter(Boolean).join(' · ') : 'Bem-vindo(a) ao seu portal.';
  $('#welcome').innerHTML = `
    <div class="wel-avatar">${foto ? `<img src="${esc(foto)}" alt="Foto de ${esc(nome)}" />` : esc(iniciais(nome))}</div>
    <div class="wel-txt"><h1>Olá, ${esc(primeiroNome(nome))}! 👋</h1><p>${esc(subt || 'Acompanhe sua evolução.')}</p></div>`;

  if (!temDados) return;
  renderProgresso();
  renderFinanceiro();
  renderAvaliacoes();
}

function renderProgresso() {
  const avs = avaliacoesOrdenadas();
  const pri = avs[0], ult = avs[avs.length - 1];
  const rPri = pri ? calc.calcular(pri, alunoLike()) : null;
  const rUlt = ult ? calc.calcular(ult, alunoLike()) : null;
  const dPeso = delta(numf(pri?.peso), numf(ult?.peso));
  const dPerc = delta(rPri?.perc, rUlt?.perc);
  const card = (v, l, s) => `<div class="card"><span class="v">${v}</span><span class="l">${l}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  $('#progresso').innerHTML =
    card(avs.length, 'Avaliações', ult ? 'última: ' + fmtData(ult.dataRealizada) : '—') +
    card((PORTAL.presencas || []).length, 'Check-ins', 'presenças registradas') +
    card(ult?.peso ? fmt(numf(ult.peso), 1) : '—', 'Peso atual (kg)', avs.length >= 2 && dPeso != null ? `${sinal(dPeso)} kg desde a 1ª` : '') +
    card(rUlt?.perc != null ? fmt(rUlt.perc, 1) + '%' : '—', '% Gordura', avs.length >= 2 && dPerc != null ? `${sinal(dPerc)}% desde a 1ª` : '');
}

function statusFin(mesId) {
  if (PORTAL.pagamentos && PORTAL.pagamentos[mesId]) return 'pago';
  const [ano, m] = mesId.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(1, parseInt(PORTAL.vencimento, 10) || 10), ultimoDia);
  const venc = `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return new Date().toISOString().slice(0, 10) > venc ? 'vencido' : 'pendente';
}

function renderFinanceiro() {
  const valor = numf(PORTAL.mensalidade) || 0;
  if (!valor) {
    $('#financeiro').innerHTML = `<div class="fin-box"><div><div class="fin-cap">Mensalidade</div><div class="fin-val">—</div></div><span class="fin-badge pendente">Não cadastrada</span></div>`;
    return;
  }
  const mesId = new Date().toISOString().slice(0, 7);
  const st = statusFin(mesId);
  const lbl = st === 'pago' ? 'Pago' : st === 'vencido' ? 'Vencido' : 'Pendente';
  const M = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  $('#financeiro').innerHTML = `
    <div class="fin-box">
      <div>
        <div class="fin-cap">Mensalidade · ${M[Number(mesId.split('-')[1]) - 1]}</div>
        <div class="fin-val">${brl(valor)}</div>
        ${PORTAL.vencimento ? `<div class="av-sub">vence dia ${esc(PORTAL.vencimento)}</div>` : ''}
      </div>
      <span class="fin-badge ${st}">${lbl}</span>
    </div>`;
}

function renderAvaliacoes() {
  const avs = avaliacoesOrdenadas();
  const ultimas = avs.slice().reverse().slice(0, 3);
  $('#btn-comparar').disabled = avs.length < 2;
  $('#btn-comparar').style.display = avs.length < 2 ? 'none' : '';
  if (!avs.length) { $('#avaliacoes').innerHTML = `<div class="empty">Você ainda não tem avaliações registradas.</div>`; return; }
  $('#avaliacoes').innerHTML = ultimas.map((av) => {
    const r = calc.calcular(av, alunoLike());
    return `<div class="av-row">
      <span class="av-num">#${String(av.num || 0).padStart(2, '0')}</span>
      <div><div class="av-data">${fmtData(av.dataRealizada)}</div><div class="av-sub">${av.dataProxima ? 'próxima: ' + fmtData(av.dataProxima) : ''}</div></div>
      <div class="av-metrics">
        <div class="av-metric"><b>${av.peso ? fmt(numf(av.peso), 1) : '—'}</b><span>Peso</span></div>
        <div class="av-metric"><b>${r.perc != null ? fmt(r.perc, 1) + '%' : '—'}</b><span>% Gord.</span></div>
        <div class="av-metric"><b>${fmt(r.imc, 1)}</b><span>IMC</span></div>
      </div>
    </div>`;
  }).join('');
}

/* ---------- Comparação (últimas 3) ---------- */
function abrirComparar() {
  const avs = avaliacoesOrdenadas();
  const sel = avs.slice(-3); // até 3, em ordem cronológica
  if (sel.length < 2) return;
  const R = sel.map((av) => calc.calcular(av, alunoLike()));
  const rows = [];
  const nc = sel.length + 1;
  const sec = (t) => rows.push(`<tr class="cmp-sec"><td colspan="${nc}">${t}</td></tr>`);
  const lin = (label, vals, un, dec) => {
    if (vals.every((v) => v == null)) return;
    rows.push(`<tr><td>${label}</td>${vals.map((v) => `<td>${v == null ? '—' : fmt(v, dec) + (un ? ' ' + un : '')}</td>`).join('')}</tr>`);
  };
  sec('Composição corporal');
  lin('Peso', sel.map((a) => numf(a.peso)), 'kg', 1);
  lin('IMC', R.map((r) => r.imc), '', 1);
  lin('% Gordura', R.map((r) => r.perc), '%', 1);
  lin('Massa magra', R.map((r) => r.massaMagra), 'kg', 1);
  lin('Massa gorda', R.map((r) => r.massaGorda), 'kg', 1);
  sec('Perímetros (cm)');
  (calc.PERIMETROS || []).forEach((p) => lin(p.label, sel.map((a) => numf(a.perimetros?.[p.key])), 'cm', 1));
  sec('Testes físicos');
  lin('Flexões', sel.map((a) => numf(a.testes?.flexoes)), '', 0);
  lin('Prancha', sel.map((a) => numf(a.testes?.prancha)), 's', 0);
  lin('Agachamentos', sel.map((a) => numf(a.testes?.agachamentos)), '', 0);
  lin('Abdominais', sel.map((a) => numf(a.testes?.abdominais)), '', 0);

  const head = `<tr class="cmp-head"><th>Métrica</th>${sel.map((a) => `<th>${fmtData(a.dataRealizada)}</th>`).join('')}</tr>`;
  $('#modal-comparar-body').innerHTML = `<table class="cmp-table">${head}${rows.join('')}</table>`;
  $('#modal-comparar').classList.add('open');
}
$('#btn-comparar').addEventListener('click', abrirComparar);
$$('.modal-bg').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('open'); }));

/* ============================================================
   GATE de acesso (login do aluno)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gToggle = $('#gate-toggle'), gReset = $('#gate-reset');
const gBtn = gform.querySelector('button[type=submit]');

async function entrar(user) {
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  const email = (user?.email || '').toLowerCase();
  try { PORTAL = email ? await carregarPortal(email) : null; }
  catch (e) { PORTAL = null; console.warn('Portal:', e?.code || e); }
  render();
}
function erroMsg(m) { gErro.style.color = ''; gErro.textContent = m; gErro.style.display = 'block'; }
function okMsg(m) { gErro.style.color = 'var(--ok)'; gErro.textContent = m; gErro.style.display = 'block'; }
function msgAuth(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos. Primeiro acesso? Use "Criar conta".',
    'auth/user-not-found': 'Conta não encontrada. Use "Primeiro acesso? Criar conta".',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — é só fazer login.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
  })[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

$('#sair').addEventListener('click', async () => { try { await sair(); } catch {} location.reload(); });

if (cloudAtivo()) {
  gate.style.display = 'flex';
  let criando = false;
  gToggle.addEventListener('click', (e) => { e.preventDefault(); criando = !criando; gBtn.textContent = criando ? 'Criar conta e entrar' : 'Entrar'; gToggle.textContent = criando ? 'Já tenho conta — entrar' : 'Primeiro acesso? Criar conta'; gErro.style.display = 'none'; });
  gReset.addEventListener('click', async (e) => { e.preventDefault(); const m = gEmail.value.trim(); if (!m) { erroMsg('Digite seu e-mail acima primeiro.'); gEmail.focus(); return; } try { await resetarSenha(m); okMsg('Enviamos um link de redefinição para seu e-mail.'); } catch (err) { erroMsg(msgAuth(err)); } });
  sessaoAtual().then((u) => { if (u) entrar(u); else gEmail.focus(); });
  gform.addEventListener('submit', async (e) => {
    e.preventDefault(); gErro.style.display = 'none';
    try {
      const user = criando ? await criarConta(gEmail.value.trim(), gSenha.value) : await login(gEmail.value.trim(), gSenha.value);
      entrar(user);
    } catch (err) { erroMsg(msgAuth(err)); }
  });
} else {
  gate.style.display = 'flex';
  erroMsg('O Portal do Aluno precisa da nuvem (Firebase) ativa.');
}
