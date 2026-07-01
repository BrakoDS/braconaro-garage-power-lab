// @ts-check
/**
 * Gestão de Alunos — app principal.
 * Gate de acesso reaproveitando o login do Coach/Montador (Firebase) e toda a
 * UI das telas 1 (listagem) e 2 (perfil com 3 abas). Dados via ./db.js.
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, sair } from '../montador/ui/cloud.js';
import { estaLiberado, tentarLiberar } from '../montador/ui/auth.js';
import * as db from './db.js';
import * as calc from './calc.js?v=2';
import * as storage from './storage-alunos.js';
import { exportarAvaliacao, exportarFicha } from './pdf.js';

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoje = () => new Date().toISOString().slice(0, 10);
function fmtData(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
function addDias(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function calcIdade(iso) { if (!iso) return ''; const n = new Date(iso + 'T00:00:00'); const h = new Date(); let i = h.getFullYear() - n.getFullYear(); const mm = h.getMonth() - n.getMonth(); if (mm < 0 || (mm === 0 && h.getDate() < n.getDate())) i--; return i >= 0 && i < 130 ? String(i) : ''; }
function waLink(tel) { const d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; const full = d.startsWith('55') ? d : '55' + d; return `https://wa.me/${full}`; }
const STATUS_LABEL = { ativo: 'Ativo', inativo: 'Inativo', pendente: 'Pendente' };

/* ---- Fotos (Firebase Storage) ---- */
let UID = null;
function iniciais(nome) { return ((nome || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase(); }
/** Abre o seletor de arquivos de imagem e chama cb(file). */
function escolherFoto(cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) cb(f); inp.remove(); });
  document.body.appendChild(inp); inp.click();
}
async function uploadFoto(path, file, maxDim) {
  if (!storage.storageAtivo() || !UID) throw new Error('storage-indisponivel');
  const blob = await storage.comprimir(file, maxDim);
  return await storage.enviar(path, blob);
}
function avisoStorage(e) {
  console.warn('Falha no upload da foto:', e?.code || e);
  alert('Não foi possível enviar a foto. Confirme que você está logado e que o Firebase Storage está ativado com as regras publicadas (ver storage.rules).');
}
/** Apaga do Storage as fotos de uma avaliação. */
function apagarFotosDaAvaliacao(id, av) {
  if (!UID || !storage.storageAtivo() || !av) return;
  Object.keys(av.fotos || {}).forEach((slot) => storage.apagar(`gestao/${UID}/${id}/aval-${av.num}-${slot}.webp`).catch(() => {}));
}
/** Apaga do Storage o avatar + todas as fotos de avaliação de um aluno. */
function apagarFotosDoAluno(a) {
  if (!UID || !storage.storageAtivo() || !a) return;
  if (a.fotoUrl) storage.apagar(`gestao/${UID}/${a.id}/avatar.webp`).catch(() => {});
  (a.avaliacoes || []).forEach((av) => apagarFotosDaAvaliacao(a.id, av));
}
function renderAvatar() {
  const a = alunoAtual; const el = $('#p-avatar'); if (!a || !el) return;
  el.innerHTML = a.fotoUrl ? `<img src="${esc(a.fotoUrl)}" alt="Foto de ${esc(a.nome)}" />` : `<span>${esc(iniciais(a.nome))}</span>`;
}
$('#p-avatar')?.addEventListener('click', () => {
  const a = alunoAtual; if (!a) return;
  escolherFoto(async (file) => {
    const el = $('#p-avatar'); if (el) el.classList.add('loading');
    try {
      const url = await uploadFoto(`gestao/${UID}/${a.id}/avatar.webp`, file, 600);
      db.atualizar(a.id, { fotoUrl: url });
      alunoAtual = db.obter(a.id);
      renderAvatar(); renderLista();
    } catch (e) { avisoStorage(e); }
    finally { const el2 = $('#p-avatar'); if (el2) el2.classList.remove('loading'); }
  });
});

/* ============================================================
   Formulário de DADOS (reusado no cadastro e na aba 1)
   ============================================================ */
const OBJETIVOS = ['Emagrecimento', 'Hipertrofia', 'Condicionamento', 'Saúde / qualidade de vida', 'Outro'];
const SEXOS = ['Masculino', 'Feminino', 'Outro'];

function opt(val, atual) { return `<option value="${esc(val)}"${val === atual ? ' selected' : ''}>${esc(val)}</option>`; }

function formDadosHTML(a = {}, opts = {}) {
  const sexoOpts = `<option value="">—</option>` + SEXOS.map((s) => opt(s, a.sexo)).join('');
  const objOpts = `<option value="">—</option>` + OBJETIVOS.map((s) => opt(s, a.objetivo)).join('');
  const freqOpts = `<option value="">—</option>` + [1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${String(n) === String(a.freqVezes) ? ' selected' : ''}>${n}x por semana</option>`).join('');
  const nivelOpts = `<option value="">—</option>` + [['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']].map(([v, l]) => `<option value="${v}"${a.nivel === v ? ' selected' : ''}>${l}</option>`).join('');
  const diasSel = new Set(a.diasTreino || []);
  const diasHTML = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb']].map(([v, l]) => `<label><input type="checkbox" name="diasTreino" value="${v}"${diasSel.has(v) ? ' checked' : ''}/>${l}</label>`).join('');
  const stOpts = ['ativo', 'inativo', 'pendente'].map((s) => `<option value="${s}"${(a.status || 'ativo') === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('');
  const idField = opts.idEditavel
    ? `<div class="field full"><label>ID do aluno</label><input name="id" type="text" value="${esc(a.id)}" placeholder="Use o seu padrão de ID — ou deixe vazio para gerar (001, 002…)" /><span class="hint">Precisa ser único. Vazio = numeração automática.</span></div>`
    : `<div class="field full"><label>ID do aluno</label><input type="text" value="${esc(a.id)}" disabled /><span class="hint">O ID é definido no cadastro e não muda (mantém as fotos no lugar).</span></div>`;
  return `
  <div class="form-sec">
    <h3>Dados pessoais</h3>
    <div class="grid-form">
      ${idField}
      <div class="field full"><label>Nome completo *</label><input name="nome" type="text" required value="${esc(a.nome)}" placeholder="Nome do aluno" /></div>
      <div class="field"><label>Data de nascimento</label><input name="nascimento" type="date" value="${esc(a.nascimento)}" /><span class="hint" data-idade>${a.nascimento ? 'Idade: ' + calcIdade(a.nascimento) + ' anos' : ''}</span></div>
      <div class="field"><label>Sexo</label><select name="sexo">${sexoOpts}</select></div>
      <div class="field"><label>Telefone / WhatsApp</label><input name="telefone" type="tel" value="${esc(a.telefone)}" placeholder="(14) 99999-9999" /><a class="wa" data-wa target="_blank" rel="noopener" style="display:none">Abrir no WhatsApp →</a></div>
      <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(a.email)}" placeholder="email@exemplo.com" /></div>
      <div class="field full"><label>Endereço</label><input name="endereco" type="text" value="${esc(a.endereco)}" placeholder="Rua, número, bairro, cidade" /></div>
      <div class="field"><label>Status</label><select name="status">${stOpts}</select></div>
    </div>
  </div>
  <div class="form-sec">
    <h3>Dados do treino</h3>
    <div class="grid-form">
      <div class="field"><label>Altura (cm)</label><input name="altura" type="number" min="0" step="0.1" value="${esc(a.altura)}" placeholder="175" /></div>
      <div class="field"><label>Peso atual (kg)</label><input name="peso" type="number" min="0" step="0.1" value="${esc(a.peso)}" placeholder="80" /></div>
      <div class="field"><label>Objetivo</label><select name="objetivo">${objOpts}</select></div>
      <div class="field"><label>Nível de treino</label><select name="nivel">${nivelOpts}</select></div>
      <div class="field"><label>Frequência semanal</label><select name="freqVezes">${freqOpts}</select></div>
      <div class="field"><label>Horário do treino</label><input name="freqHorario" type="text" value="${esc(a.freqHorario)}" placeholder="Ex.: 18h–19h" /></div>
      <div class="field full"><label>Dias de treino na semana</label><div class="dias-treino">${diasHTML}</div><span class="hint">Usado pelo Montador para o acumulado mensal do aluno.</span></div>
      <div class="field full"><label>Observações médicas / restrições / histórico de lesões</label><textarea name="obs" placeholder="Lesões, restrições, condições de saúde, observações relevantes…">${esc(a.obs)}</textarea></div>
    </div>
  </div>
  <div class="form-sec">
    <h3>Financeiro</h3>
    <div class="grid-form">
      <div class="field"><label>Mensalidade (R$)</label><input name="mensalidade" type="number" min="0" step="0.01" value="${esc(a.mensalidade)}" placeholder="150" /></div>
      <div class="field"><label>Dia de vencimento</label><input name="vencimento" type="number" min="1" max="31" value="${esc(a.vencimento)}" placeholder="10" /><span class="hint">Dia do mês (1–31) em que a mensalidade vence.</span></div>
    </div>
  </div>`;
}

/** Liga o cálculo de idade e o link do WhatsApp dentro de um container de form. */
function wireForm(root) {
  const nasc = $('input[name=nascimento]', root);
  const idadeEl = $('[data-idade]', root);
  if (nasc && idadeEl) nasc.addEventListener('input', () => { const i = calcIdade(nasc.value); idadeEl.textContent = i ? `Idade: ${i} anos` : ''; });
  const tel = $('input[name=telefone]', root);
  const wa = $('[data-wa]', root);
  if (tel && wa) {
    const upd = () => { const l = waLink(tel.value); if (l) { wa.href = l; wa.style.display = 'inline-flex'; } else wa.style.display = 'none'; };
    tel.addEventListener('input', upd); upd();
  }
}

/** Lê os campos de um <form> de dados para um objeto. */
function lerForm(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  o.diasTreino = fd.getAll('diasTreino'); // checkboxes múltiplos
  if (o.nascimento) o.idade = calcIdade(o.nascimento);
  return o;
}

/* ============================================================
   TELA 1 — Listagem
   ============================================================ */
const elLista = $('#lista-alunos');
let filtro = '';
let filtroStatus = 'todos'; // 'todos' | 'atrasada' | 'avencer'

function statusTag(s) { const k = (s || 'ativo').toLowerCase(); return `<span class="status ${k}">${STATUS_LABEL[k] || 'Ativo'}</span>`; }

/** Situação da próxima avaliação do aluno (pela avaliação mais recente). */
function statusAvaliacao(a) {
  const avs = (a.avaliacoes || []).filter((x) => x.dataRealizada);
  if (!avs.length) return { tipo: 'sem' };
  const ultima = avs.reduce((m, x) => (x.dataRealizada > m.dataRealizada ? x : m), avs[0]);
  if (!ultima.dataProxima) return { tipo: 'sem' };
  const dias = Math.round((new Date(ultima.dataProxima + 'T00:00:00') - new Date(hoje() + 'T00:00:00')) / 86400000);
  if (dias < 0) return { tipo: 'atrasada', dias: -dias };
  if (dias <= 7) return { tipo: 'avencer', dias };
  return { tipo: 'emdia', dias };
}

function avalBadge(s) {
  if (s.tipo === 'atrasada') return `<span class="aval-tag atrasada">⚠ Atrasada ${s.dias}d</span>`;
  if (s.tipo === 'avencer') return `<span class="aval-tag avencer">Reavaliar ${s.dias === 0 ? 'hoje' : 'em ' + s.dias + 'd'}</span>`;
  return '';
}

function renderResumoAval(nAtr, nVenc) {
  const el = $('#aval-resumo'); if (!el) return;
  if (!nAtr && !nVenc) { el.innerHTML = ''; return; }
  const chip = (f, cls, txt) => `<button class="filtro-chip ${cls}${filtroStatus === f ? ' on' : ''}" data-f="${f}" type="button">${txt}</button>`;
  let html = chip('todos', '', 'Todos');
  if (nAtr) html += chip('atrasada', 'atrasada', `${nAtr} atrasada${nAtr > 1 ? 's' : ''}`);
  if (nVenc) html += chip('avencer', 'avencer', `${nVenc} a vencer`);
  el.innerHTML = html;
}

function renderLista() {
  const todos = db.listar();
  let nAtr = 0, nVenc = 0;
  todos.forEach((a) => { const t = statusAvaliacao(a).tipo; if (t === 'atrasada') nAtr++; else if (t === 'avencer') nVenc++; });
  renderResumoAval(nAtr, nVenc);

  const q = filtro.toLowerCase();
  let alunos = todos.filter((a) => {
    if (filtroStatus !== 'todos' && statusAvaliacao(a).tipo !== filtroStatus) return false;
    if (!filtro) return true;
    return (a.nome || '').toLowerCase().includes(q) || (a.id || '').includes(q);
  });
  // atrasadas no topo, depois a vencer
  const prio = (a) => { const t = statusAvaliacao(a).tipo; return t === 'atrasada' ? 0 : t === 'avencer' ? 1 : 2; };
  alunos = alunos.slice().sort((x, y) => prio(x) - prio(y));

  if (!alunos.length) {
    elLista.innerHTML = `<div class="empty"><b>${todos.length ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}</b>${todos.length ? 'Tente outro filtro, nome ou ID.' : 'Use o botão “Cadastrar novo aluno” para começar.'}</div>`;
    return;
  }
  elLista.innerHTML = alunos.map((a) => `
    <button class="aluno-row" data-id="${esc(a.id)}" type="button">
      <span class="rav">${a.fotoUrl ? `<img src="${esc(a.fotoUrl)}" alt="" />` : esc(iniciais(a.nome))}</span>
      <span><span class="rnome">${esc(a.nome || 'Sem nome')}</span><br><span class="rsub">#${esc(a.id)} · ${esc(a.objetivo || 'Sem objetivo definido')}${avalBadge(statusAvaliacao(a))}</span></span>
      ${statusTag(a.status)}
    </button>`).join('');
}

elLista.addEventListener('click', (e) => {
  const row = e.target.closest('.aluno-row');
  if (row) abrirPerfil(row.dataset.id);
});
$('#aval-resumo').addEventListener('click', (e) => {
  const chip = e.target.closest('.filtro-chip');
  if (chip) { filtroStatus = chip.dataset.f; renderLista(); }
});
$('#busca').addEventListener('input', (e) => { filtro = e.target.value; renderLista(); });

/* ============================================================
   Navegação entre telas
   ============================================================ */
function mostrarTela(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}
$('#btn-voltar').addEventListener('click', () => { renderLista(); mostrarTela('tela-lista'); });
$('#btn-ficha-pdf').addEventListener('click', () => { if (alunoAtual) exportarFicha(alunoAtual); });

/* ============================================================
   TELA — Financeiro (mensalidades)
   ============================================================ */
const MESES_FIN = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numMoney = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
function mesIdAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function rotuloMesFin(mesId) { const [a, m] = mesId.split('-').map(Number); return `${MESES_FIN[m - 1]} / ${a}`; }
function addMesFin(mesId, n) { const [a, m] = mesId.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

let finMes = mesIdAtual();

/** 'pago' | 'vencido' | 'pendente' para um aluno num mês. */
function statusFin(a, mesId) {
  if (a.pagamentos && a.pagamentos[mesId]) return 'pago';
  const [ano, m] = mesId.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(1, parseInt(a.vencimento, 10) || 10), ultimoDia);
  const venc = `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return hoje() > venc ? 'vencido' : 'pendente';
}

function renderFinanceiro() {
  $('#fin-mes-lbl').textContent = rotuloMesFin(finMes);
  const alunos = db.listar().filter((a) => (a.status || 'ativo') !== 'inativo' && numMoney(a.mensalidade) > 0);
  let previsto = 0, recebido = 0;
  const linhas = alunos.map((a) => {
    const valor = numMoney(a.mensalidade);
    previsto += valor;
    const st = statusFin(a, finMes);
    if (st === 'pago') recebido += valor;
    const lbl = st === 'pago' ? 'Pago' : st === 'vencido' ? 'Vencido' : 'Pendente';
    const btn = st === 'pago'
      ? `<button class="btn ghost btn-sm fin-toggle" data-id="${esc(a.id)}" data-op="0" type="button">Desfazer</button>`
      : `<button class="btn btn-sm fin-toggle" data-id="${esc(a.id)}" data-op="1" type="button">Marcar pago</button>`;
    return `<div class="fin-row">
      <div class="fin-info"><div class="fin-nome">${esc(a.nome)}</div><div class="fin-sub">vence dia ${esc(a.vencimento || '—')} · ${brl(valor)}</div></div>
      <span class="fin-badge ${st}">${lbl}</span>
      ${btn}
    </div>`;
  }).join('');
  $('#fin-tot').innerHTML = `
    <div class="fin-card"><span class="fin-card-l">Recebido</span><span class="fin-card-v ok">${brl(recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">A receber</span><span class="fin-card-v${previsto - recebido > 0 ? ' bad' : ''}">${brl(previsto - recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Previsto no mês</span><span class="fin-card-v">${brl(previsto)}</span></div>`;
  $('#fin-list').innerHTML = linhas || `<div class="empty"><b>Nenhuma mensalidade cadastrada</b>Defina o valor da mensalidade no perfil do aluno (aba Dados → Financeiro).</div>`;
}

function toggleFin(id, pago) {
  const a = db.obter(id); if (!a) return;
  const pg = { ...(a.pagamentos || {}) };
  if (pago) pg[finMes] = true; else delete pg[finMes];
  db.atualizar(id, { pagamentos: pg });
  renderFinanceiro();
}

$('#btn-financeiro').addEventListener('click', () => { finMes = mesIdAtual(); renderFinanceiro(); mostrarTela('tela-financeiro'); });
$('#fin-voltar').addEventListener('click', () => { renderLista(); mostrarTela('tela-lista'); });
$('#fin-prev').addEventListener('click', () => { finMes = addMesFin(finMes, -1); renderFinanceiro(); });
$('#fin-next').addEventListener('click', () => { finMes = addMesFin(finMes, 1); renderFinanceiro(); });
$('#fin-list').addEventListener('click', (e) => { const b = e.target.closest('.fin-toggle'); if (b) toggleFin(b.dataset.id, b.dataset.op === '1'); });

/* ============================================================
   TELA — Aviso em massa (WhatsApp)
   ============================================================ */
const AVISO_TPLS = [
  'Amanhã não tem aula! ⚠️',
  'Bom treino a todos! 💪',
  'Lembrete: sua mensalidade vence esta semana. 🙏',
  'Atenção: novo horário a partir de segunda-feira.',
];
const avisoEnviados = new Set();

function waMsg(tel, msg) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  const full = d.startsWith('55') ? d : '55' + d;
  return `https://wa.me/${full}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}
function avisoDestinatarios() {
  return db.listar().filter((a) => (a.status || 'ativo') !== 'inativo' && String(a.telefone || '').replace(/\D/g, '').length >= 10);
}
function renderAviso() {
  $('#aviso-tpls').innerHTML = AVISO_TPLS.map((t) => `<button class="aviso-tpl" type="button" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  const alunos = avisoDestinatarios();
  $('#aviso-count').textContent = `${avisoEnviados.size} de ${alunos.length} enviados`;
  $('#aviso-list').innerHTML = alunos.length ? alunos.map((a) => {
    const env = avisoEnviados.has(a.id);
    return `<div class="aviso-row${env ? ' enviado' : ''}">
      <div class="aviso-info"><div class="fin-nome">${esc(a.nome)}</div><div class="fin-sub">${esc(a.telefone)}</div></div>
      ${env ? '<span class="aviso-ok">Enviado ✓</span>' : ''}
      <button class="btn ${env ? 'ghost ' : ''}btn-sm aviso-send" data-id="${esc(a.id)}" data-tel="${esc(a.telefone)}" type="button">${env ? 'Reenviar' : 'Enviar'}</button>
    </div>`;
  }).join('') : `<div class="empty"><b>Nenhum destinatário</b>Cadastre alunos ativos com telefone/WhatsApp para avisar aqui.</div>`;
}

$('#btn-aviso').addEventListener('click', () => { renderAviso(); mostrarTela('tela-aviso'); });
$('#aviso-voltar').addEventListener('click', () => { renderLista(); mostrarTela('tela-lista'); });
$('#aviso-tpls').addEventListener('click', (e) => { const c = e.target.closest('.aviso-tpl'); if (c) { $('#aviso-msg').value = c.dataset.t; $('#aviso-msg').focus(); } });
$('#aviso-copiar').addEventListener('click', async () => {
  const m = $('#aviso-msg').value.trim(); if (!m) return;
  try { await navigator.clipboard.writeText(m); const b = $('#aviso-copiar'), t = b.textContent; b.textContent = 'Copiado ✓'; setTimeout(() => (b.textContent = t), 1500); } catch {}
});
$('#aviso-list').addEventListener('click', (e) => {
  const b = e.target.closest('.aviso-send'); if (!b) return;
  const msg = $('#aviso-msg').value.trim();
  if (!msg) { alert('Escreva a mensagem primeiro.'); $('#aviso-msg').focus(); return; }
  const link = waMsg(b.dataset.tel, msg);
  if (link) window.open(link, '_blank');
  avisoEnviados.add(b.dataset.id);
  renderAviso();
});

/* ============================================================
   TELA — Check-in / frequência
   ============================================================ */
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SUMIDO_DIAS = 7;
let chkData = hoje();

const diasDesde = (iso) => Math.round((new Date(hoje() + 'T00:00:00') - new Date(iso + 'T00:00:00')) / 86400000);
function labelDia(iso) { const d = new Date(iso + 'T00:00:00'); return `${DIAS_SEM[d.getDay()]} · ${fmtData(iso)}`; }
function ultimaPresenca(a) { const p = (a.presencas || []).slice().sort(); return p.length ? p[p.length - 1] : null; }

function renderCheckin() {
  $('#chk-data-lbl').textContent = labelDia(chkData);
  const alunos = db.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
  const presentes = alunos.filter((a) => (a.presencas || []).includes(chkData)).length;
  $('#chk-resumo').innerHTML =
    `<div class="fin-card"><span class="fin-card-l">Presentes no dia</span><span class="fin-card-v ok">${presentes}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Alunos ativos</span><span class="fin-card-v">${alunos.length}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Sumidos (${SUMIDO_DIAS}+ dias)</span><span class="fin-card-v${alunos.some((a) => { const u = ultimaPresenca(a); return !u || diasDesde(u) >= SUMIDO_DIAS; }) ? ' bad' : ''}">${alunos.filter((a) => { const u = ultimaPresenca(a); return !u || diasDesde(u) >= SUMIDO_DIAS; }).length}</span></div>`;

  $('#chk-list').innerHTML = alunos.length ? alunos.map((a) => {
    const pres = (a.presencas || []).includes(chkData);
    const u = ultimaPresenca(a);
    const sub = u ? `última presença: ${fmtData(u)}` : 'sem check-in ainda';
    return `<div class="fin-row${pres ? ' chk-pres' : ''}">
      <div class="fin-info"><div class="fin-nome">${esc(a.nome)}</div><div class="fin-sub">${sub}</div></div>
      <button class="btn ${pres ? '' : 'ghost '}btn-sm chk-toggle" data-id="${esc(a.id)}" type="button">${pres ? '✓ Presente' : 'Marcar presente'}</button>
    </div>`;
  }).join('') : `<div class="empty"><b>Nenhum aluno ativo</b>Cadastre alunos para registrar presença.</div>`;

  const sumidos = alunos
    .map((a) => ({ nome: a.nome, u: ultimaPresenca(a) }))
    .filter((s) => !s.u || diasDesde(s.u) >= SUMIDO_DIAS)
    .map((s) => ({ nome: s.nome, dias: s.u ? diasDesde(s.u) : null }))
    .sort((x, y) => (y.dias ?? 99999) - (x.dias ?? 99999));
  $('#chk-sumidos').innerHTML = sumidos.length
    ? `<h4 class="chk-titulo">Quem sumiu (${SUMIDO_DIAS}+ dias sem vir)</h4>` +
      sumidos.map((s) => `<div class="chk-sumido"><span class="li-nome">${esc(s.nome)}</span><span class="aval-tag atrasada">${s.dias == null ? 'nunca veio' : 'há ' + s.dias + 'd'}</span></div>`).join('')
    : '';
}

function toggleCheckin(id) {
  const a = db.obter(id); if (!a) return;
  const set = new Set(a.presencas || []);
  if (set.has(chkData)) set.delete(chkData); else set.add(chkData);
  db.atualizar(id, { presencas: [...set].sort() });
  renderCheckin();
}

$('#btn-checkin').addEventListener('click', () => { chkData = hoje(); renderCheckin(); mostrarTela('tela-checkin'); });
$('#chk-voltar').addEventListener('click', () => { renderLista(); mostrarTela('tela-lista'); });
$('#chk-prev').addEventListener('click', () => { chkData = addDias(chkData, -1); renderCheckin(); });
$('#chk-next').addEventListener('click', () => { chkData = addDias(chkData, 1); renderCheckin(); });
$('#chk-list').addEventListener('click', (e) => { const b = e.target.closest('.chk-toggle'); if (b) toggleCheckin(b.dataset.id); });

/* ============================================================
   TELA 2 — Perfil
   ============================================================ */
let alunoAtual = null;

function abrirPerfil(id) {
  const a = db.obter(id);
  if (!a) return;
  alunoAtual = a;
  $('#p-id').textContent = '#' + a.id;
  $('#p-nome').textContent = a.nome || 'Sem nome';
  const st = $('#p-status');
  st.className = 'status ' + (a.status || 'ativo');
  st.textContent = STATUS_LABEL[a.status] || 'Ativo';
  renderAvatar();
  // aba dados
  $('#tab-dados').innerHTML = `
    <form id="form-dados">
      ${formDadosHTML(a)}
      <div class="form-actions">
        <button class="btn" type="submit">Salvar alterações</button>
        <span class="saved-flag" data-saved>Salvo ✓</span>
        <span style="flex:1"></span>
        <button class="btn danger btn-sm" type="button" id="btn-excluir-aluno">Excluir aluno</button>
      </div>
    </form>`;
  const form = $('#form-dados');
  wireForm(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    db.atualizar(a.id, lerForm(form));
    alunoAtual = db.obter(a.id);
    $('#p-nome').textContent = alunoAtual.nome || 'Sem nome';
    const s2 = $('#p-status'); s2.className = 'status ' + (alunoAtual.status || 'ativo'); s2.textContent = STATUS_LABEL[alunoAtual.status] || 'Ativo';
    const flag = $('[data-saved]', form); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1600);
  });
  $('#btn-excluir-aluno').addEventListener('click', () => {
    if (confirm(`Excluir o aluno "${a.nome || a.id}"? Esta ação não pode ser desfeita.`)) {
      apagarFotosDoAluno(a);
      db.remover(a.id); renderLista(); mostrarTela('tela-lista');
    }
  });
  // demais abas
  renderAvaliacoes();
  // volta sempre para a aba Dados ao abrir
  ativarAba('dados');
  mostrarTela('tela-perfil');
}

/* ---- Abas ---- */
function ativarAba(nome) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === nome));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + nome));
  if (nome === 'progresso') renderProgresso();
  else if (nome === 'anamnese') renderAnamnese();
  else if (nome === 'parq') renderParq();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => ativarAba(t.dataset.tab)));

/* ============================================================
   ABA 2 — Avaliações
   ============================================================ */
function renderAvaliacoes() {
  const a = alunoAtual; if (!a) return;
  const avs = (a.avaliacoes || []).slice().sort((x, y) => (y.num || 0) - (x.num || 0));
  const lista = $('#aval-list');
  if (!avs.length) {
    lista.innerHTML = `<div class="empty"><b>Nenhuma avaliação</b>Clique em “Nova avaliação” para registrar a primeira.</div>`;
    return;
  }
  const hj = hoje();
  lista.innerHTML = avs.map((av) => {
    const atrasada = av.dataProxima && av.dataProxima < hj;
    const r = calc.calcular(av, a);
    const resumo = [];
    if (av.peso) resumo.push(`${(+av.peso).toLocaleString('pt-BR')} kg`);
    if (r.perc != null) resumo.push(`${r.perc.toFixed(1)}% gordura`);
    return `
    <button class="aval-row" data-num="${av.num}" type="button">
      <span class="anum">Avaliação #${String(av.num).padStart(2, '0')}</span>
      <span class="adatas">
        <span class="adata">Realizada: ${fmtData(av.dataRealizada)}${resumo.length ? ' · ' + resumo.join(' · ') : ''}</span>
        <span class="aprox${atrasada ? ' atrasada' : ''}">Próxima: ${fmtData(av.dataProxima)}</span>
      </span>
      ${atrasada ? '<span class="badge-late">Atrasada</span>' : '<span class="badge-ok">Em dia</span>'}
    </button>`;
  }).join('');
}
$('#aval-list').addEventListener('click', (e) => {
  const row = e.target.closest('.aval-row');
  if (row) abrirFormAvaliacao(Number(row.dataset.num));
});
$('#btn-nova-aval').addEventListener('click', () => abrirFormAvaliacao(null));

/* ============================================================
   Modais
   ============================================================ */
function abrirModal(id) { $('#' + id).classList.add('open'); }
function fecharModal(id) { $('#' + id).classList.remove('open'); }
$$('.modal-bg').forEach((bg) => {
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) bg.classList.remove('open'); });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal-bg.open').forEach((m) => m.classList.remove('open')); });

/* ---- Modal: novo aluno ---- */
$('#fab-novo').addEventListener('click', () => {
  $('#modal-aluno-body').innerHTML = formDadosHTML({}, { idEditavel: true });
  wireForm($('#modal-aluno-body'));
  abrirModal('modal-aluno');
  setTimeout(() => $('input[name=id]', $('#modal-aluno-body'))?.focus(), 50);
});
$('#form-novo').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = lerForm(e.target);
  if (!dados.nome) { alert('Informe o nome do aluno.'); return; }
  const novo = db.criar(dados);
  if (!novo) { alert('Já existe um aluno com esse ID. Escolha outro.'); return; }
  fecharModal('modal-aluno');
  renderLista();
  abrirPerfil(novo.id);
});

/* ---- Modal: formulário da avaliação ---- */
let avalAberta = null;

function fmtN(v, dec = 1) { return v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtDataCurta(iso) { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}/${m}`; }

function lerAval(form) {
  const fd = new FormData(form);
  const g = (k) => (fd.get(k) ?? '').toString().trim();
  const av = {
    dataRealizada: g('dataRealizada'), dataProxima: g('dataProxima'),
    peso: g('peso'), estatura: g('estatura'), obs: g('obs'),
    pas: g('pas'), pad: g('pad'), fc: g('fc'), spo2: g('spo2'),
    cond: { jejum: !!fd.get('cond_jejum'), semTreino: !!fd.get('cond_semTreino'), roupasLeves: !!fd.get('cond_roupasLeves'), bexiga: !!fd.get('cond_bexiga') },
    dobras: {}, perimetros: {},
  };
  for (const k of ['peitoral', 'axilarMedia', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa']) { const v = g('dobra_' + k); if (v !== '') av.dobras[k] = v; }
  for (const p of calc.PERIMETROS) { const v = g('perim_' + p.key); if (v !== '') av.perimetros[p.key] = v; }
  av.testes = {};
  for (const k of ['flexoes', 'prancha', 'agachamentos', 'abdominais']) { const v = g('teste_' + k); if (v !== '') av.testes[k] = v; }
  av.mobilidade = {};
  for (const k of ['tornozeloD', 'tornozeloE', 'ombroD', 'ombroE', 'sentarAlcancar']) { const v = g('mob_' + k); if (v !== '') av.mobilidade[k] = v; }
  return av;
}

function renderResultados(av, aluno) {
  const r = calc.calcular(av, aluno);
  const rceVal = calc.rcest(av.perimetros?.cintura, av.estatura);
  const percSub = r.perc != null ? r.percClass
    : (r.faltaSexo ? 'Defina o sexo na aba Dados' : r.faltaIdade ? 'Informe a data de nascimento (aba Dados)' : 'Preencha as 3 dobras');
  const cards = [
    { t: '% Gordura corporal', v: r.perc != null ? fmtN(r.perc, 1) + '%' : '—', s: percSub, hi: true },
    { t: 'IMC', v: r.imc != null ? fmtN(r.imc, 1) : '—', s: r.imcClass },
    { t: 'Massa gorda', v: r.massaGorda != null ? fmtN(r.massaGorda, 1) + ' kg' : '—', s: '' },
    { t: 'Massa magra', v: r.massaMagra != null ? fmtN(r.massaMagra, 1) + ' kg' : '—', s: '' },
    { t: 'RCQ', v: r.rcq != null ? fmtN(r.rcq, 2) : '—', s: r.rcqClass },
    { t: 'Cintura/estatura', v: rceVal != null ? fmtN(rceVal, 2) : '—', s: calc.classifRcest(rceVal) },
    { t: 'Σ dobras', v: r.soma != null ? fmtN(r.soma, 0) + ' mm' : '—', s: r.protocolo || '' },
  ];
  if (av.pas && av.pad) cards.push({ t: 'Pressão arterial', v: `${av.pas}/${av.pad}`, s: 'mmHg · ' + calc.classifPressao(av.pas, av.pad) });
  if (av.fc) cards.push({ t: 'Freq. cardíaca', v: `${av.fc}`, s: 'bpm' });
  if (av.spo2) cards.push({ t: 'Saturação SpO₂', v: `${av.spo2}%`, s: calc.classifSpo2(av.spo2) });
  $('#aval-resultados').innerHTML = cards.map((c) => `<div class="res${c.hi ? ' hi' : ''}"><span class="rt">${c.t}</span><span class="rv">${c.v}</span>${c.s ? `<span class="rs">${esc(c.s)}</span>` : ''}</div>`).join('');
}

function abrirFormAvaliacao(num) {
  const a = alunoAtual; if (!a) return;
  const novo = num == null;
  let av;
  if (novo) av = { dataRealizada: hoje(), dataProxima: addDias(hoje(), 90), peso: a.peso || '', estatura: a.altura || '', cond: {}, dobras: {}, perimetros: {} };
  else { av = (a.avaliacoes || []).find((x) => x.num === num); if (!av) return; }
  avalAberta = novo ? null : num;
  const cod = calc.sexoCod(a);
  const dobras = calc.DOBRAS_7;
  $('#modal-aval').querySelector('.modal').classList.add('lg');
  $('#modal-aval-titulo').textContent = novo ? 'Nova avaliação' : `Avaliação #${String(num).padStart(2, '0')}`;
  $('#btn-del-aval').style.display = novo ? 'none' : '';
  const cond = av.cond || {}, dz = av.dobras || {}, pz = av.perimetros || {}, tz = av.testes || {}, mz = av.mobilidade || {};
  const chk = (k, l) => `<label class="chk"><input type="checkbox" name="cond_${k}"${cond[k] ? ' checked' : ''}/> ${l}</label>`;
  const f = (name, val, ph = '') => `<input name="${name}" type="number" inputmode="decimal" min="0" step="any" value="${esc(val ?? '')}" placeholder="${ph}"/>`;
  const avisoSexo = cod ? '' : `<div class="note" style="margin-bottom:12px">⚠️ Defina o <b>sexo</b> do aluno na aba <b>Dados</b> para calcular o % de gordura.</div>`;
  const avisoIdade = (a.nascimento || a.idade) ? '' : `<div class="note" style="margin-bottom:12px">⚠️ Informe a <b>data de nascimento</b> na aba Dados (a fórmula usa a idade).</div>`;
  $('#modal-aval-body').innerHTML = `
    <form id="form-aval">
      <div class="form-sec"><h3>Datas</h3><div class="grid-form">
        <div class="field"><label>Data realizada</label><input name="dataRealizada" type="date" value="${esc(av.dataRealizada || '')}"/></div>
        <div class="field"><label>Próxima avaliação</label><input name="dataProxima" type="date" value="${esc(av.dataProxima || '')}"/></div>
      </div></div>
      <div class="form-sec"><h3>Condições do aluno</h3><div class="chks">${chk('jejum', 'Jejum 2–4h')}${chk('semTreino', 'Sem treino intenso 12h')}${chk('roupasLeves', 'Roupas leves')}${chk('bexiga', 'Bexiga vazia')}</div></div>
      <div class="form-sec"><h3>Medidas básicas</h3><div class="grid-form">
        <div class="field"><label>Peso (kg)</label>${f('peso', av.peso, '80')}</div>
        <div class="field"><label>Estatura (cm)</label>${f('estatura', av.estatura, '175')}</div>
      </div></div>
      <div class="form-sec"><h3>Sinais vitais</h3><div class="grid-form g3">
        <div class="field"><label>Pressão arterial (mmHg)</label><div class="pa-row"><input name="pas" type="number" inputmode="numeric" min="0" step="any" value="${esc(av.pas ?? '')}" placeholder="120" /><span>/</span><input name="pad" type="number" inputmode="numeric" min="0" step="any" value="${esc(av.pad ?? '')}" placeholder="80" /></div></div>
        <div class="field"><label>Freq. cardíaca (bpm)</label>${f('fc', av.fc, '70')}</div>
        <div class="field"><label>Saturação SpO₂ (%)</label>${f('spo2', av.spo2, '98')}</div>
      </div></div>
      <div class="form-sec"><h3>Dobras cutâneas (mm) · Pollock 7</h3>${avisoSexo}${avisoIdade}
        <div class="grid-form g3">${dobras.map((d) => `<div class="field"><label>${d.label}</label>${f('dobra_' + d.key, dz[d.key])}</div>`).join('')}</div>
      </div>
      <div class="form-sec"><h3>Perímetros (cm)</h3>
        <div class="grid-form g3">${calc.PERIMETROS.map((p) => `<div class="field"><label>${p.label}</label>${f('perim_' + p.key, pz[p.key], '', '0.1')}</div>`).join('')}</div>
      </div>
      <div class="form-sec"><h3>Testes físicos</h3><div class="grid-form g3">
        <div class="field"><label>Flexões (máx.)</label>${f('teste_flexoes', tz.flexoes)}</div>
        <div class="field"><label>Prancha (segundos)</label>${f('teste_prancha', tz.prancha)}</div>
        <div class="field"><label>Agachamentos (1 min)</label>${f('teste_agachamentos', tz.agachamentos)}</div>
        <div class="field"><label>Abdominais (1 min)</label>${f('teste_abdominais', tz.abdominais)}</div>
      </div></div>
      <div class="form-sec"><h3>Mobilidade (cm)</h3><div class="grid-form g3">
        <div class="field"><label>Tornozelo dir.</label>${f('mob_tornozeloD', mz.tornozeloD)}</div>
        <div class="field"><label>Tornozelo esq.</label>${f('mob_tornozeloE', mz.tornozeloE)}</div>
        <div class="field"><label>Ombro dir.</label>${f('mob_ombroD', mz.ombroD)}</div>
        <div class="field"><label>Ombro esq.</label>${f('mob_ombroE', mz.ombroE)}</div>
        <div class="field"><label>Sentar-e-alcançar</label>${f('mob_sentarAlcancar', mz.sentarAlcancar)}</div>
      </div></div>
      <div class="form-sec"><h3>Resultados</h3><div id="aval-resultados" class="resultados"></div></div>
      <div class="form-sec"><h3>Fotos de progresso</h3><div id="aval-fotos" class="fotos-grid"></div></div>
      <div class="field full"><label>Observações</label><textarea name="obs" placeholder="Observações desta avaliação…">${esc(av.obs || '')}</textarea></div>
      <div class="form-actions" style="margin-top:14px"><button class="btn" type="submit">${novo ? 'Salvar avaliação' : 'Salvar alterações'}</button><button class="btn ghost" type="button" id="btn-pdf">Exportar PDF</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    </form>`;
  const form = $('#form-aval');
  const recalc = () => renderResultados(lerAval(form), a);
  form.addEventListener('input', recalc);
  recalc();
  renderFotosAval();
  $('#aval-fotos').addEventListener('click', onFotoAvalClick);
  $('#btn-pdf').addEventListener('click', () => {
    if (avalAberta == null) { alert('Salve a avaliação primeiro para exportar o PDF.'); return; }
    const cur = (alunoAtual.avaliacoes || []).find((x) => x.num === avalAberta);
    if (cur) exportarAvaliacao(alunoAtual, cur);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = lerAval(form);
    if (avalAberta == null) {
      const nv = db.addAvaliacao(a.id, dados);
      avalAberta = nv.num;
      $('#modal-aval-titulo').textContent = `Avaliação #${String(nv.num).padStart(2, '0')}`;
      $('#btn-del-aval').style.display = '';
    } else {
      const cur = (a.avaliacoes || []).find((x) => x.num === avalAberta);
      if (cur) Object.assign(cur, dados);
      db.atualizar(a.id, { avaliacoes: a.avaliacoes });
    }
    alunoAtual = db.obter(a.id);
    renderAvaliacoes();
    renderFotosAval();
    const flag = $('#form-aval [data-saved]'); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1500);
  });
  abrirModal('modal-aval');
}

/* ---- Fotos de progresso da avaliação ---- */
const FOTO_SLOTS = [['frente', 'Frente'], ['lado', 'Lado'], ['costas', 'Costas']];
function avalAtual() { return alunoAtual && avalAberta != null ? (alunoAtual.avaliacoes || []).find((x) => x.num === avalAberta) : null; }
function renderFotosAval() {
  const cont = $('#aval-fotos'); if (!cont) return;
  if (avalAberta == null) { cont.innerHTML = `<div class="note">Salve a avaliação para anexar fotos de progresso (frente, lado e costas).</div>`; return; }
  const av = avalAtual(); const fotos = (av && av.fotos) || {};
  cont.innerHTML = FOTO_SLOTS.map(([k, l]) => `
    <div class="foto-slot" data-slot="${k}">
      ${fotos[k] ? `<img src="${esc(fotos[k])}" alt="${l}" /><button class="foto-del" data-del="${k}" type="button" title="Remover">×</button>` : `<span class="foto-add">+ ${l}</span>`}
      <span class="foto-cap">${l}</span>
    </div>`).join('');
}
function onFotoAvalClick(e) {
  const del = e.target.closest('[data-del]');
  if (del) { removerFotoAval(del.dataset.del); return; }
  const slotEl = e.target.closest('.foto-slot');
  if (slotEl) escolherFoto((file) => adicionarFotoAval(slotEl.dataset.slot, file));
}
async function adicionarFotoAval(slot, file) {
  const a = alunoAtual, av = avalAtual(); if (!a || !av) return;
  const slotEl = $(`#aval-fotos .foto-slot[data-slot=${slot}]`); if (slotEl) slotEl.classList.add('loading');
  try {
    const url = await uploadFoto(`gestao/${UID}/${a.id}/aval-${av.num}-${slot}.webp`, file, 1200);
    av.fotos = av.fotos || {}; av.fotos[slot] = url;
    db.atualizar(a.id, { avaliacoes: a.avaliacoes });
    alunoAtual = db.obter(a.id);
    renderFotosAval();
  } catch (e) { avisoStorage(e); if (slotEl) slotEl.classList.remove('loading'); }
}
async function removerFotoAval(slot) {
  const a = alunoAtual, av = avalAtual(); if (!a || !av || !av.fotos) return;
  if (!confirm('Remover esta foto?')) return;
  delete av.fotos[slot];
  db.atualizar(a.id, { avaliacoes: a.avaliacoes });
  alunoAtual = db.obter(a.id);
  renderFotosAval();
  storage.apagar(`gestao/${UID}/${a.id}/aval-${av.num}-${slot}.webp`).catch(() => {});
}

$('#btn-del-aval').addEventListener('click', () => {
  const a = alunoAtual; if (!a || avalAberta == null) return;
  if (confirm(`Excluir a Avaliação #${String(avalAberta).padStart(2, '0')}?`)) {
    apagarFotosDaAvaliacao(a.id, (a.avaliacoes || []).find((x) => x.num === avalAberta));
    db.removerAvaliacao(a.id, avalAberta);
    alunoAtual = db.obter(a.id);
    renderAvaliacoes();
    fecharModal('modal-aval');
  }
});

/* ============================================================
   Comparar duas avaliações
   ============================================================ */
$('#btn-comparar').addEventListener('click', abrirComparar);

function abrirComparar() {
  const a = alunoAtual; if (!a) return;
  const avs = (a.avaliacoes || []).slice().sort((x, y) => (x.dataRealizada < y.dataRealizada ? -1 : 1));
  if (avs.length < 2) { alert('Cadastre ao menos 2 avaliações para comparar.'); return; }
  const opts = (sel) => avs.map((av) => `<option value="${av.num}"${av.num === sel ? ' selected' : ''}>#${String(av.num).padStart(2, '0')} · ${fmtData(av.dataRealizada)}</option>`).join('');
  const aNum = avs[0].num, bNum = avs[avs.length - 1].num;
  $('#modal-comparar').querySelector('.modal').classList.add('lg');
  $('#modal-comparar-body').innerHTML = `
    <div class="cmp-selects">
      <select id="cmp-a">${opts(aNum)}</select>
      <span class="cmp-x">→</span>
      <select id="cmp-b">${opts(bNum)}</select>
    </div>
    <div id="cmp-resultado"></div>`;
  const upd = () => renderComparacao(Number($('#cmp-a').value), Number($('#cmp-b').value));
  $('#cmp-a').addEventListener('change', upd);
  $('#cmp-b').addEventListener('change', upd);
  upd();
  abrirModal('modal-comparar');
}

function renderComparacao(numA, numB) {
  const a = alunoAtual; if (!a) return;
  const avA = (a.avaliacoes || []).find((x) => x.num === numA);
  const avB = (a.avaliacoes || []).find((x) => x.num === numB);
  if (!avA || !avB) return;
  const rA = calc.calcular(avA, a), rB = calc.calcular(avB, a);
  const nf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const rows = [];
  const sec = (t) => rows.push(`<tr class="cmp-sec"><td colspan="4">${t}</td></tr>`);
  const lin = (label, va, vb, un, dec, melhorSe) => {
    if (va == null && vb == null) return;
    let d = '—', cls = '';
    if (va != null && vb != null) {
      const dd = vb - va;
      if (Math.abs(dd) < Math.pow(10, -dec) / 2) { d = '='; }
      else {
        const bom = melhorSe === 'down' ? dd < 0 : melhorSe === 'up' ? dd > 0 : null;
        cls = bom === true ? 'bom' : bom === false ? 'ruim' : '';
        d = `${dd > 0 ? '+' : '−'}${fmtN(Math.abs(dd), dec)}${un ? ' ' + un : ''}`;
      }
    }
    const cel = (v) => (v != null ? fmtN(v, dec) + (un ? ' ' + un : '') : '—');
    rows.push(`<tr><td>${label}</td><td>${cel(va)}</td><td>${cel(vb)}</td><td class="${cls}">${d}</td></tr>`);
  };

  sec('Composição corporal');
  lin('Peso', nf(avA.peso), nf(avB.peso), 'kg', 1, null);
  lin('IMC', rA.imc, rB.imc, '', 1, null);
  lin('% Gordura', rA.perc, rB.perc, '%', 1, 'down');
  lin('Massa gorda', rA.massaGorda, rB.massaGorda, 'kg', 1, 'down');
  lin('Massa magra', rA.massaMagra, rB.massaMagra, 'kg', 1, 'up');
  lin('RCQ', rA.rcq, rB.rcq, '', 2, 'down');
  lin('Cintura/estatura', calc.rcest(avA.perimetros?.cintura, avA.estatura), calc.rcest(avB.perimetros?.cintura, avB.estatura), '', 2, 'down');
  lin('Σ dobras', rA.soma, rB.soma, 'mm', 0, 'down');

  sec('Perímetros (cm)');
  const perimMelhor = { cintura: 'down', abdomen: 'down', quadril: null, bracoContraido: null, coxa: null, panturrilha: null };
  calc.PERIMETROS.forEach((p) => lin(p.label, nf(avA.perimetros?.[p.key]), nf(avB.perimetros?.[p.key]), 'cm', 1, perimMelhor[p.key]));

  if (avA.pas || avB.pas || avA.fc || avB.fc || avA.spo2 || avB.spo2) {
    sec('Sinais vitais');
    if (avA.pas || avB.pas) rows.push(`<tr><td>Pressão arterial</td><td>${avA.pas && avA.pad ? esc(avA.pas + '/' + avA.pad) : '—'}</td><td>${avB.pas && avB.pad ? esc(avB.pas + '/' + avB.pad) : '—'}</td><td></td></tr>`);
    lin('Freq. cardíaca', nf(avA.fc), nf(avB.fc), 'bpm', 0, 'down');
    lin('Saturação SpO₂', nf(avA.spo2), nf(avB.spo2), '%', 0, 'up');
  }

  sec('Testes físicos');
  lin('Flexões', nf(avA.testes?.flexoes), nf(avB.testes?.flexoes), '', 0, 'up');
  lin('Prancha', nf(avA.testes?.prancha), nf(avB.testes?.prancha), 's', 0, 'up');
  lin('Agachamentos', nf(avA.testes?.agachamentos), nf(avB.testes?.agachamentos), '', 0, 'up');
  lin('Abdominais', nf(avA.testes?.abdominais), nf(avB.testes?.abdominais), '', 0, 'up');

  sec('Mobilidade (cm)');
  lin('Tornozelo dir.', nf(avA.mobilidade?.tornozeloD), nf(avB.mobilidade?.tornozeloD), 'cm', 1, null);
  lin('Tornozelo esq.', nf(avA.mobilidade?.tornozeloE), nf(avB.mobilidade?.tornozeloE), 'cm', 1, null);
  lin('Ombro dir.', nf(avA.mobilidade?.ombroD), nf(avB.mobilidade?.ombroD), 'cm', 1, null);
  lin('Ombro esq.', nf(avA.mobilidade?.ombroE), nf(avB.mobilidade?.ombroE), 'cm', 1, null);
  lin('Sentar-e-alcançar', nf(avA.mobilidade?.sentarAlcancar), nf(avB.mobilidade?.sentarAlcancar), 'cm', 1, 'up');

  const fotos = [['frente', 'Frente'], ['lado', 'Lado'], ['costas', 'Costas']].map(([k, l]) => {
    const fa = avA.fotos?.[k], fb = avB.fotos?.[k];
    if (!fa && !fb) return '';
    const cel = (u) => (u ? `<img src="${esc(u)}" alt="${l}" />` : '<span class="cmp-foto-vazio">sem foto</span>');
    return `<div class="cmp-foto-row"><span class="cmp-foto-cap">${l}</span><div class="cmp-foto-par"><div>${cel(fa)}</div><div>${cel(fb)}</div></div></div>`;
  }).join('');

  $('#cmp-resultado').innerHTML = `
    <table class="cmp-table">
      <tr class="cmp-head"><th>Métrica</th><th>#${String(numA).padStart(2, '0')} · ${fmtData(avA.dataRealizada)}</th><th>#${String(numB).padStart(2, '0')} · ${fmtData(avB.dataRealizada)}</th><th>Δ</th></tr>
      ${rows.join('')}
    </table>
    ${fotos ? `<h4 class="cmp-fotos-titulo">Fotos de progresso</h4>${fotos}` : ''}`;
}

/* ============================================================
   ABA 3 — Progresso (gráficos + insights)
   ============================================================ */
function chartSVG(serie, { cor = 'var(--accent)' } = {}) {
  const W = 600, H = 180, pad = { l: 46, r: 14, t: 16, b: 28 };
  const ys = serie.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const rng = max - min; min -= rng * 0.15; max += rng * 0.15;
  const n = serie.length;
  const X = (i) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const pts = serie.map((p, i) => [X(i), Y(p.y)]);
  const linha = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = linha + ` L ${pts[n - 1][0].toFixed(1)} ${H - pad.b} L ${pts[0][0].toFixed(1)} ${H - pad.b} Z`;
  const dots = pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${cor}"/>`).join('');
  const yMax = Math.max(...ys), yMin = Math.min(...ys);
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity="0.25"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" class="ax"/>
    <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="ax"/>
    <text x="${pad.l - 6}" y="${(Y(yMax) + 4).toFixed(1)}" class="clbl" text-anchor="end">${fmtN(yMax, 1)}</text>
    <text x="${pad.l - 6}" y="${(Y(yMin) + 4).toFixed(1)}" class="clbl" text-anchor="end">${fmtN(yMin, 1)}</text>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
    <text x="${X(0).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="start">${fmtDataCurta(serie[0].d)}</text>
    <text x="${X(n - 1).toFixed(1)}" y="${H - 9}" class="clbl" text-anchor="end">${fmtDataCurta(serie[n - 1].d)}</text>
  </svg>`;
}

function insightsHTML(a, avs) {
  if (avs.length < 2) return `<div class="note">Cadastre ao menos 2 avaliações para ver a evolução.</div>`;
  const pri = avs[0], ult = avs[avs.length - 1];
  const rp = calc.calcular(pri, a), ru = calc.calcular(ult, a);
  const items = [];
  const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const push = (label, va, vb, unidade, melhorSe) => {
    if (va == null || vb == null) return;
    const d = vb - va; if (Math.abs(d) < 1e-9) return;
    const bom = melhorSe === 'down' ? d < 0 : melhorSe === 'up' ? d > 0 : null;
    const cls = bom === true ? 'bom' : bom === false ? 'ruim' : '';
    items.push(`<div class="insight ${cls}"><span class="ic">${d < 0 ? '▼' : '▲'}</span><span><span class="it">${label}: ${d > 0 ? '+' : '−'}${fmtN(Math.abs(d), 1)} ${unidade}</span><br><span class="iv">de ${fmtN(va, 1)} para ${fmtN(vb, 1)} ${unidade}</span></span></div>`);
  };
  push('Peso', numf(pri.peso), numf(ult.peso), 'kg', null);
  push('% Gordura', rp.perc, ru.perc, '%', 'down');
  push('Massa magra', rp.massaMagra, ru.massaMagra, 'kg', 'up');
  push('Cintura', numf(pri.perimetros?.cintura), numf(ult.perimetros?.cintura), 'cm', 'down');
  push('Abdômen', numf(pri.perimetros?.abdomen), numf(ult.perimetros?.abdomen), 'cm', 'down');
  if (!items.length) return `<div class="note">Ainda não há dados comparáveis entre as avaliações.</div>`;
  return `<div class="note" style="margin-bottom:8px">Comparando a 1ª avaliação (${fmtDataCurta(pri.dataRealizada)}) com a última (${fmtDataCurta(ult.dataRealizada)}).</div>` + items.join('');
}

function renderProgresso() {
  const a = alunoAtual; if (!a) return;
  const panel = $('#tab-progresso');
  const avs = (a.avaliacoes || []).filter((x) => x.dataRealizada).sort((x, y) => (x.dataRealizada < y.dataRealizada ? -1 : 1));
  const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const serie = (fn) => avs.map((av) => ({ d: av.dataRealizada, y: fn(av) })).filter((p) => p.y != null && !isNaN(p.y));
  const sPeso = serie((av) => numf(av.peso));
  const sPerc = serie((av) => calc.calcular(av, a).perc);
  const sMagra = serie((av) => calc.calcular(av, a).massaMagra);
  const sCintura = serie((av) => numf(av.perimetros?.cintura));
  const sFlex = serie((av) => numf(av.testes?.flexoes));
  const sPrancha = serie((av) => numf(av.testes?.prancha));
  const sAgach = serie((av) => numf(av.testes?.agachamentos));
  const sAbd = serie((av) => numf(av.testes?.abdominais));
  const vazio = (s) => `<div class="prog-ph">${avs.length ? 'Cadastre ao menos 2 avaliações com este dado.' : 'Nenhuma avaliação cadastrada ainda.'}</div>`;
  const chart = (s, opt) => (s.length >= 2 ? chartSVG(s, opt) : vazio(s));
  const temDesempenho = [sFlex, sPrancha, sAgach, sAbd].some((s) => s.length >= 2);
  panel.innerHTML = `
    <div class="prog-grid">
      <div class="prog-card full"><h4>Evolução do peso corporal</h4>${chart(sPeso, { cor: 'var(--accent)' })}</div>
      <div class="prog-card"><h4>% Gordura corporal</h4>${chart(sPerc, { cor: '#ff5b50' })}</div>
      <div class="prog-card"><h4>Massa magra</h4>${chart(sMagra, { cor: '#3fb950' })}</div>
      <div class="prog-card full"><h4>Evolução da cintura</h4>${chart(sCintura, { cor: 'var(--accent-2)' })}</div>
      ${temDesempenho ? `
      <div class="prog-card"><h4>Flexões (máx.)</h4>${chart(sFlex, { cor: 'var(--accent)' })}</div>
      <div class="prog-card"><h4>Prancha (s)</h4>${chart(sPrancha, { cor: '#3fb950' })}</div>
      <div class="prog-card"><h4>Agachamentos (1 min)</h4>${chart(sAgach, { cor: 'var(--accent-2)' })}</div>
      <div class="prog-card"><h4>Abdominais (1 min)</h4>${chart(sAbd, { cor: '#ff5b50' })}</div>` : ''}
      <div class="prog-card full"><h4>Pontos que foram melhorados</h4><div class="insights">${insightsHTML(a, avs)}</div></div>
    </div>`;
}

/* ============================================================
   ABA — Anamnese
   ============================================================ */
function optsSelect(arr, atual) { return `<option value="">—</option>` + arr.map((s) => opt(s, atual)).join(''); }

function renderAnamnese() {
  const a = alunoAtual; if (!a) return;
  const an = a.anamnese || {};
  $('#tab-anamnese').innerHTML = `
    <form id="form-anamnese">
      <div class="form-sec"><h3>Treino & rotina</h3><div class="grid-form">
        <div class="field"><label>Experiência com treino</label><select name="experiencia">${optsSelect(['Iniciante', 'Intermediário', 'Avançado', 'Retornando'], an.experiencia)}</select></div>
        <div class="field"><label>Histórico de treino (tempo, modalidades)</label><input name="historicoTreino" value="${esc(an.historicoTreino)}" /></div>
        <div class="field"><label>Profissão / rotina de trabalho</label><input name="rotina" value="${esc(an.rotina)}" /></div>
        <div class="field"><label>Horas de sono / noite</label><input name="sono" type="number" step="any" value="${esc(an.sono)}" /></div>
        <div class="field"><label>Nível de estresse</label><select name="estresse">${optsSelect(['Baixo', 'Moderado', 'Alto'], an.estresse)}</select></div>
      </div></div>
      <div class="form-sec"><h3>Hábitos</h3><div class="grid-form">
        <div class="field"><label>Refeições por dia</label><input name="refeicoes" type="number" step="any" value="${esc(an.refeicoes)}" /></div>
        <div class="field"><label>Hidratação (L/dia)</label><input name="hidratacao" type="number" step="any" value="${esc(an.hidratacao)}" /></div>
        <div class="field"><label>Tabagismo</label><select name="tabagismo">${optsSelect(['Não', 'Sim', 'Ex-fumante'], an.tabagismo)}</select></div>
        <div class="field"><label>Álcool</label><select name="alcool">${optsSelect(['Não', 'Socialmente', 'Frequente'], an.alcool)}</select></div>
      </div></div>
      <div class="form-sec"><h3>Saúde</h3><div class="grid-form">
        <div class="field full"><label>Doenças / condições / cirurgias prévias</label><textarea name="doencas">${esc(an.doencas)}</textarea></div>
        <div class="field full"><label>Medicamentos em uso</label><textarea name="medicamentos">${esc(an.medicamentos)}</textarea></div>
        <div class="field full"><label>Histórico familiar (cardíaco, diabetes, hipertensão…)</label><textarea name="histFamiliar">${esc(an.histFamiliar)}</textarea></div>
        <div class="field full"><label>Dores ou lesões atuais</label><textarea name="doresLesoes">${esc(an.doresLesoes)}</textarea></div>
      </div></div>
      <div class="form-sec"><h3>Objetivo</h3><div class="grid-form">
        <div class="field full"><label>Objetivo detalhado / expectativas</label><textarea name="objetivoDetalhe">${esc(an.objetivoDetalhe)}</textarea></div>
      </div></div>
      <div class="form-actions"><button class="btn" type="submit">Salvar anamnese</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    </form>`;
  $('#form-anamnese').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target); const o = {};
    for (const [k, v] of fd.entries()) o[k] = typeof v === 'string' ? v.trim() : v;
    db.atualizar(a.id, { anamnese: o }); alunoAtual = db.obter(a.id);
    const fl = $('#form-anamnese [data-saved]'); fl.classList.add('show'); setTimeout(() => fl.classList.remove('show'), 1500);
  });
}

/* ============================================================
   ABA — PAR-Q
   ============================================================ */
const PARQ = [
  'Algum médico já disse que você possui um problema cardíaco e que só deveria praticar atividade física sob supervisão médica?',
  'Você sente dor no peito quando pratica atividade física?',
  'No último mês, você sentiu dor no peito sem estar praticando atividade física?',
  'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
  'Você tem algum problema ósseo ou articular que poderia piorar com a mudança na atividade física?',
  'Você toma atualmente algum medicamento para pressão arterial ou problema cardíaco?',
  'Você sabe de alguma outra razão pela qual não deveria praticar atividade física?',
];
function renderParq() {
  const a = alunoAtual; if (!a) return;
  const p = a.parq || {}; const resp = p.respostas || {};
  const linhas = PARQ.map((q, i) => `
    <div class="parq-q">
      <span class="parq-txt">${i + 1}. ${q}</span>
      <div class="parq-opts">
        <label class="chk"><input type="radio" name="q${i}" value="sim"${resp['q' + i] === 'sim' ? ' checked' : ''}/> Sim</label>
        <label class="chk"><input type="radio" name="q${i}" value="nao"${resp['q' + i] === 'nao' ? ' checked' : ''}/> Não</label>
      </div>
    </div>`).join('');
  $('#tab-parq').innerHTML = `
    <form id="form-parq">
      <div id="parq-result"></div>
      <div class="form-sec"><h3>Questionário de prontidão para atividade física (PAR-Q)</h3><div class="parq-list">${linhas}</div></div>
      <div class="form-sec"><div class="grid-form">
        <div class="field"><label>Data da triagem</label><input name="data" type="date" value="${esc(p.data || '')}" /></div>
        <div class="field full"><label>Observações</label><textarea name="obs">${esc(p.obs)}</textarea></div>
      </div></div>
      <div class="form-actions"><button class="btn" type="submit">Salvar PAR-Q</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    </form>`;
  const form = $('#form-parq');
  const avaliar = () => {
    const fd = new FormData(form); let algumSim = false, faltam = 0;
    for (let i = 0; i < PARQ.length; i++) { const v = fd.get('q' + i); if (!v) faltam++; else if (v === 'sim') algumSim = true; }
    const el = $('#parq-result');
    if (faltam === PARQ.length) { el.innerHTML = ''; return; }
    if (algumSim) el.innerHTML = `<div class="parq-banner alerta">⚠️ Há resposta "Sim" — recomende avaliação médica antes de iniciar ou intensificar a atividade física.</div>`;
    else if (faltam === 0) el.innerHTML = `<div class="parq-banner ok">✓ Todas as respostas "Não" — apto a iniciar atividade física com bom senso. Reavalie periodicamente.</div>`;
    else el.innerHTML = `<div class="parq-banner">Responda todas as ${PARQ.length} perguntas para concluir a triagem.</div>`;
  };
  form.addEventListener('change', avaliar); avaliar();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form); const respostas = {};
    for (let i = 0; i < PARQ.length; i++) { const v = fd.get('q' + i); if (v) respostas['q' + i] = v; }
    db.atualizar(a.id, { parq: { respostas, data: fd.get('data') || '', obs: (fd.get('obs') || '').toString().trim() } });
    alunoAtual = db.obter(a.id);
    const fl = $('#form-parq [data-saved]'); fl.classList.add('show'); setTimeout(() => fl.classList.remove('show'), 1500);
  });
}

/* ============================================================
   GATE de acesso (mesmo login do Coach/Montador)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gToggle = $('#gate-toggle'), gReset = $('#gate-reset');
const gBtn = gform.querySelector('button[type=submit]');

function entrar(user) {
  UID = user?.uid || null;
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  renderLista();
  // Sincroniza com a nuvem (se houver usuário logado). Não bloqueia a UI.
  if (user && user.uid) {
    db.iniciarSync(user.uid, () => {
      renderLista();
      if ($('#tela-perfil').classList.contains('active') && alunoAtual) {
        const a = db.obter(alunoAtual.id);
        if (a) { alunoAtual = a; renderAvaliacoes(); }
      }
    });
  }
}
function erroMsg(m) { gErro.style.color = ''; gErro.textContent = m; gErro.style.display = 'block'; }
function okMsg(m) { gErro.style.color = 'var(--ok)'; gErro.textContent = m; gErro.style.display = 'block'; }
function msgAuth(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos. Sem conta? Use “Primeiro acesso? Criar conta”.',
    'auth/user-not-found': 'Conta não encontrada. Use “Primeiro acesso? Criar conta”.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — faça login normalmente.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado (regras do Firestore).',
  })[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

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
    }
    catch (err) { erroMsg(msgAuth(err)); console.error('Auth:', err?.code, err?.message); }
  });
} else if (estaLiberado()) {
  entrar();
} else {
  gate.style.display = 'flex';
  gEmail?.remove(); gToggle?.remove(); gReset?.remove(); gSenha.focus();
  gform.addEventListener('submit', async (e) => { e.preventDefault(); if (await tentarLiberar(gSenha.value)) entrar(); else { erroMsg('Senha incorreta.'); gSenha.value = ''; gSenha.focus(); } });
}
