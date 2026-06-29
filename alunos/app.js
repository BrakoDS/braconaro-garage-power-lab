// @ts-check
/**
 * Gestão de Alunos — app principal.
 * Gate de acesso reaproveitando o login do Coach/Montador (Firebase) e toda a
 * UI das telas 1 (listagem) e 2 (perfil com 3 abas). Dados via ./db.js.
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha, sair } from '../montador/ui/cloud.js';
import { estaLiberado, tentarLiberar } from '../montador/ui/auth.js';
import * as db from './db.js';
import * as calc from './calc.js';
import * as storage from './storage-alunos.js';
import { exportarAvaliacao } from './pdf.js';

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
      <span class="rav">${a.fotoUrl ? `<img src="${esc(a.fotoUrl)}" alt="" />` : esc(iniciais(a.nome))}</span>
      <span><span class="rnome">${esc(a.nome || 'Sem nome')}</span><br><span class="rsub">#${esc(a.id)} · ${esc(a.objetivo || 'Sem objetivo definido')}</span></span>
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
  for (const k of ['peitoral', 'abdominal', 'coxa', 'triceps', 'suprailiaca']) { const v = g('dobra_' + k); if (v !== '') av.dobras[k] = v; }
  for (const p of calc.PERIMETROS) { const v = g('perim_' + p.key); if (v !== '') av.perimetros[p.key] = v; }
  return av;
}

function renderResultados(av, aluno) {
  const r = calc.calcular(av, aluno);
  const percSub = r.perc != null ? r.percClass
    : (r.faltaSexo ? 'Defina o sexo na aba Dados' : r.faltaIdade ? 'Informe a data de nascimento (aba Dados)' : 'Preencha as 3 dobras');
  const cards = [
    { t: '% Gordura corporal', v: r.perc != null ? fmtN(r.perc, 1) + '%' : '—', s: percSub, hi: true },
    { t: 'IMC', v: r.imc != null ? fmtN(r.imc, 1) : '—', s: r.imcClass },
    { t: 'Massa gorda', v: r.massaGorda != null ? fmtN(r.massaGorda, 1) + ' kg' : '—', s: '' },
    { t: 'Massa magra', v: r.massaMagra != null ? fmtN(r.massaMagra, 1) + ' kg' : '—', s: '' },
    { t: 'RCQ', v: r.rcq != null ? fmtN(r.rcq, 2) : '—', s: r.rcqClass },
    { t: 'Σ 3 dobras', v: r.soma != null ? fmtN(r.soma, 0) + ' mm' : '—', s: '' },
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
  const dobras = calc.dobrasDoSexo(cod);
  $('#modal-aval').querySelector('.modal').classList.add('lg');
  $('#modal-aval-titulo').textContent = novo ? 'Nova avaliação' : `Avaliação #${String(num).padStart(2, '0')}`;
  $('#btn-del-aval').style.display = novo ? 'none' : '';
  const cond = av.cond || {}, dz = av.dobras || {}, pz = av.perimetros || {};
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
      <div class="form-sec"><h3>Dobras cutâneas (mm) · Pollock 3${cod === 'F' ? ' · feminino' : cod === 'M' ? ' · masculino' : ''}</h3>${avisoSexo}${avisoIdade}
        <div class="grid-form g3">${dobras.map((d) => `<div class="field"><label>${d.label}</label>${f('dobra_' + d.key, dz[d.key], '', '0.5')}</div>`).join('')}</div>
      </div>
      <div class="form-sec"><h3>Perímetros (cm)</h3>
        <div class="grid-form g3">${calc.PERIMETROS.map((p) => `<div class="field"><label>${p.label}</label>${f('perim_' + p.key, pz[p.key], '', '0.1')}</div>`).join('')}</div>
      </div>
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
  const vazio = (s) => `<div class="prog-ph">${avs.length ? 'Cadastre ao menos 2 avaliações com este dado.' : 'Nenhuma avaliação cadastrada ainda.'}</div>`;
  const chart = (s, opt) => (s.length >= 2 ? chartSVG(s, opt) : vazio(s));
  panel.innerHTML = `
    <div class="prog-grid">
      <div class="prog-card full"><h4>Evolução do peso corporal</h4>${chart(sPeso, { cor: 'var(--accent)' })}</div>
      <div class="prog-card"><h4>% Gordura corporal</h4>${chart(sPerc, { cor: '#ff5b50' })}</div>
      <div class="prog-card"><h4>Massa magra</h4>${chart(sMagra, { cor: '#3fb950' })}</div>
      <div class="prog-card full"><h4>Evolução da cintura</h4>${chart(sCintura, { cor: 'var(--accent-2)' })}</div>
      <div class="prog-card full"><h4>Pontos que foram melhorados</h4><div class="insights">${insightsHTML(a, avs)}</div></div>
    </div>`;
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
