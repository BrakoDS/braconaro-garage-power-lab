// @ts-check
/**
 * Gestão de Alunos — app principal.
 * Gate de acesso reaproveitando o login do Coach/Montador (Firebase) e toda a
 * UI das telas 1 (listagem) e 2 (perfil com 3 abas). Dados via ./db.js.
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, sair } from '../montador/ui/cloud.js';
import { estaLiberado, tentarLiberar } from '../montador/ui/auth.js';
import * as db from './db.js';

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

/* ============================================================
   Formulário de DADOS (reusado no cadastro e na aba 1)
   ============================================================ */
const OBJETIVOS = ['Emagrecimento', 'Hipertrofia', 'Condicionamento', 'Saúde / qualidade de vida', 'Outro'];
const SEXOS = ['Masculino', 'Feminino', 'Outro'];

function opt(val, atual) { return `<option value="${esc(val)}"${val === atual ? ' selected' : ''}>${esc(val)}</option>`; }

function formDadosHTML(a = {}) {
  const sexoOpts = `<option value="">—</option>` + SEXOS.map((s) => opt(s, a.sexo)).join('');
  const objOpts = `<option value="">—</option>` + OBJETIVOS.map((s) => opt(s, a.objetivo)).join('');
  const freqOpts = `<option value="">—</option>` + [1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${String(n) === String(a.freqVezes) ? ' selected' : ''}>${n}x por semana</option>`).join('');
  const stOpts = ['ativo', 'inativo', 'pendente'].map((s) => `<option value="${s}"${(a.status || 'ativo') === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('');
  return `
  <div class="form-sec">
    <h3>Dados pessoais</h3>
    <div class="grid-form">
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
      <div class="field"><label>Frequência semanal</label><select name="freqVezes">${freqOpts}</select></div>
      <div class="field"><label>Horário do treino</label><input name="freqHorario" type="text" value="${esc(a.freqHorario)}" placeholder="Ex.: 18h–19h" /></div>
      <div class="field full"><label>Observações médicas / restrições / histórico de lesões</label><textarea name="obs" placeholder="Lesões, restrições, condições de saúde, observações relevantes…">${esc(a.obs)}</textarea></div>
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
  if (o.nascimento) o.idade = calcIdade(o.nascimento);
  return o;
}

/* ============================================================
   TELA 1 — Listagem
   ============================================================ */
const elLista = $('#lista-alunos');
let filtro = '';

function statusTag(s) { const k = (s || 'ativo').toLowerCase(); return `<span class="status ${k}">${STATUS_LABEL[k] || 'Ativo'}</span>`; }

function renderLista() {
  const alunos = db.listar().filter((a) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (a.nome || '').toLowerCase().includes(q) || (a.id || '').includes(q);
  });
  if (!alunos.length) {
    elLista.innerHTML = `<div class="empty"><b>${db.listar().length ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}</b>${db.listar().length ? 'Tente outro nome ou ID.' : 'Use o botão “Cadastrar novo aluno” para começar.'}</div>`;
    return;
  }
  elLista.innerHTML = alunos.map((a) => `
    <button class="aluno-row" data-id="${esc(a.id)}" type="button">
      <span class="rid">#${esc(a.id)}</span>
      <span><span class="rnome">${esc(a.nome || 'Sem nome')}</span><br><span class="rsub">${esc(a.objetivo || 'Sem objetivo definido')}</span></span>
      ${statusTag(a.status)}
    </button>`).join('');
}

elLista.addEventListener('click', (e) => {
  const row = e.target.closest('.aluno-row');
  if (row) abrirPerfil(row.dataset.id);
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
    return `
    <button class="aval-row" data-num="${av.num}" type="button">
      <span class="anum">Avaliação #${String(av.num).padStart(2, '0')}</span>
      <span class="adatas">
        <span class="adata">Realizada: ${fmtData(av.dataRealizada)}</span>
        <span class="aprox${atrasada ? ' atrasada' : ''}">Próxima: ${fmtData(av.dataProxima)}</span>
      </span>
      ${atrasada ? '<span class="badge-late">Atrasada</span>' : '<span class="badge-ok">Em dia</span>'}
    </button>`;
  }).join('');
}
$('#aval-list').addEventListener('click', (e) => {
  const row = e.target.closest('.aval-row');
  if (row) abrirAvaliacao(Number(row.dataset.num));
});
$('#btn-nova-aval').addEventListener('click', () => {
  const a = alunoAtual; if (!a) return;
  const nova = db.addAvaliacao(a.id, { dataRealizada: hoje(), dataProxima: addDias(hoje(), 30) });
  alunoAtual = db.obter(a.id);
  renderAvaliacoes();
  abrirAvaliacao(nova.num);
});

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
  $('#modal-aluno-body').innerHTML = formDadosHTML({});
  wireForm($('#modal-aluno-body'));
  abrirModal('modal-aluno');
  setTimeout(() => $('input[name=nome]', $('#modal-aluno-body'))?.focus(), 50);
});
$('#form-novo').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = lerForm(e.target);
  if (!dados.nome) { alert('Informe o nome do aluno.'); return; }
  const novo = db.criar(dados);
  fecharModal('modal-aluno');
  renderLista();
  abrirPerfil(novo.id);
});

/* ---- Modal: detalhe da avaliação ---- */
let avalAberta = null;
function abrirAvaliacao(num) {
  const a = alunoAtual; if (!a) return;
  const av = (a.avaliacoes || []).find((x) => x.num === num);
  if (!av) return;
  avalAberta = num;
  $('#modal-aval-titulo').textContent = `Avaliação #${String(num).padStart(2, '0')}`;
  $('#modal-aval-body').innerHTML = `
    <div class="grid-form" style="grid-template-columns:1fr 1fr">
      <div class="field"><label>Data realizada</label><input type="date" id="av-realizada" value="${esc(av.dataRealizada || '')}" /></div>
      <div class="field"><label>Próxima avaliação</label><input type="date" id="av-proxima" value="${esc(av.dataProxima || '')}" /></div>
    </div>
    <div class="form-actions" style="margin-top:14px"><button class="btn btn-sm" id="av-salvar" type="button">Salvar datas</button><span class="saved-flag" data-saved>Salvo ✓</span></div>
    <div class="note" style="margin-top:18px"><b>Em breve:</b> os dados antropométricos e de bioimpedância desta avaliação (e os cálculos de evolução) serão adicionados aqui na próxima etapa.</div>`;
  $('#av-salvar').addEventListener('click', () => {
    av.dataRealizada = $('#av-realizada').value;
    av.dataProxima = $('#av-proxima').value;
    db.atualizar(a.id, { avaliacoes: a.avaliacoes });
    renderAvaliacoes();
    const flag = $('#modal-aval-body [data-saved]'); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1500);
  });
  abrirModal('modal-aval');
}
$('#btn-del-aval').addEventListener('click', () => {
  const a = alunoAtual; if (!a || avalAberta == null) return;
  if (confirm(`Excluir a Avaliação #${String(avalAberta).padStart(2, '0')}?`)) {
    db.removerAvaliacao(a.id, avalAberta);
    alunoAtual = db.obter(a.id);
    renderAvaliacoes();
    fecharModal('modal-aval');
  }
});

/* ============================================================
   GATE de acesso (mesmo login do Coach/Montador)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gToggle = $('#gate-toggle'), gReset = $('#gate-reset');
const gBtn = gform.querySelector('button[type=submit]');

function entrar() { gate.style.display = 'none'; $('#app').removeAttribute('hidden'); renderLista(); }
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
  sessaoAtual().then((u) => { if (u) entrar(); else gEmail.focus(); });
  gform.addEventListener('submit', async (e) => {
    e.preventDefault(); gErro.style.display = 'none';
    try { if (criando) await criarConta(gEmail.value.trim(), gSenha.value); else await login(gEmail.value.trim(), gSenha.value); entrar(); }
    catch (err) { erroMsg(msgAuth(err)); console.error('Auth:', err?.code, err?.message); }
  });
} else if (estaLiberado()) {
  entrar();
} else {
  gate.style.display = 'flex';
  gEmail?.remove(); gToggle?.remove(); gReset?.remove(); gSenha.focus();
  gform.addEventListener('submit', async (e) => { e.preventDefault(); if (await tentarLiberar(gSenha.value)) entrar(); else { erroMsg('Senha incorreta.'); gSenha.value = ''; gSenha.focus(); } });
}
