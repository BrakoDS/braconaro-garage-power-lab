// @ts-check
/**
 * Academia — Inventário + Catálogo de Exercícios.
 * Mesmo login do Coach/Montador (Firebase). Dados via ./db.js (local + nuvem).
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha } from '../montador/ui/cloud.js';
import { bloquearSeNaoCoach } from '../montador/ui/coach-guard.js';
import { estaLiberado, tentarLiberar } from '../montador/ui/auth.js';
import { PADROES, PADRAO_LABEL } from '../montador/config/padroes.js';
import * as db from './db.js';

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let UID = null;

/* ============================================================
   Estado dos filtros
   ============================================================ */
let abaAtiva = 'inventario';
const F = { invBusca: '', invCat: 'todos', exBusca: '', exTag: 'todos', exMusc: 'todos', exEquip: 'todos', soDisp: true, soDesat: false };

/* ============================================================
   Abas
   ============================================================ */
$$('.tab').forEach((t) => t.addEventListener('click', () => trocarAba(t.dataset.tab)));
function trocarAba(aba) {
  abaAtiva = aba;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === aba));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + aba));
  $('#fab').textContent = aba === 'inventario' ? '+ Equipamento' : '+ Exercício';
}

/* ============================================================
   Render — Inventário
   ============================================================ */
function renderFiltrosCat() {
  const cats = [...new Set(db.listarInventario().map((e) => e.categoria))];
  const ordem = db.CATEGORIAS.filter((c) => cats.includes(c));
  const chip = (f, txt) => `<button class="chip${F.invCat === f ? ' on' : ''}" data-cat="${esc(f)}" type="button">${esc(txt)}</button>`;
  $('#filtros-cat').innerHTML = [chip('todos', 'Todos'), ...ordem.map((c) => chip(c, c))].join('');
}

function renderInventario() {
  const q = norm(F.invBusca);
  let itens = db.listarInventario().filter((e) => {
    if (F.invCat !== 'todos' && e.categoria !== F.invCat) return false;
    return !q || norm(e.nome).includes(q);
  });
  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $('#count-inv').textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
  if (!itens.length) {
    $('#lista-inv').innerHTML = `<div class="empty"><b>${db.listarInventario().length ? 'Nada encontrado' : 'Inventário vazio'}</b>${db.listarInventario().length ? 'Tente outro filtro ou busca.' : 'Toque em “+ Equipamento” para começar.'}</div>`;
    return;
  }
  $('#lista-inv').innerHTML = itens.map((e) => `
    <button class="row" data-id="${esc(e.id)}" type="button">
      <div>
        <div class="nome">${esc(e.nome)}</div>
        <div class="sub"><span class="badge cat">${esc(e.categoria)}</span>${e.area ? `<span>${esc(e.area)}</span>` : ''}</div>
      </div>
      <div class="qtd">${Number(e.quantidade) || 0}<small>${(Number(e.quantidade) === 1) ? 'unid' : 'unids'}</small></div>
    </button>`).join('');
}

/* ============================================================
   Render — Exercícios
   ============================================================ */
function renderFiltrosTags() {
  const chip = (f, txt) => `<button class="chip${F.exTag === f ? ' on' : ''}" data-tag="${esc(f)}" type="button">${esc(txt)}</button>`;
  $('#filtros-tags').innerHTML = [chip('todos', 'Todos'), ...db.TAGS.map((t) => chip(t, t))].join('');
}
function renderFiltroEquip() {
  const inv = db.listarInventario().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const sel = F.exEquip;
  $('#filtro-equip').innerHTML = `<option value="todos"${sel === 'todos' ? ' selected' : ''}>Equipamento: todos</option>` +
    inv.map((e) => `<option value="${esc(e.id)}"${sel === e.id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('');
}
function renderFiltroMusc() {
  // só mostra músculos que aparecem em pelo menos um exercício
  const usados = new Set(db.listarExercicios().flatMap((x) => x.musculos || []));
  const lista = db.MUSCULOS.filter((m) => usados.has(m));
  const sel = F.exMusc;
  $('#filtro-musc').innerHTML = `<option value="todos"${sel === 'todos' ? ' selected' : ''}>Músculo: todos</option>` +
    lista.map((m) => `<option value="${esc(m)}"${sel === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
}

function nomesEquip(ids) {
  const inv = db.listarInventario();
  return (ids || []).map((id) => (inv.find((e) => e.id === id)?.nome) || ('?' + id));
}

function renderExercicios() {
  const q = norm(F.exBusca);
  let itens = db.listarExercicios().map((x) => ({ x, d: db.disponibilidade(x), ativo: x.ativo !== false }));
  itens = itens.filter(({ x, d, ativo }) => {
    if (F.exTag !== 'todos' && !(x.tags || []).includes(F.exTag)) return false;
    if (F.exMusc !== 'todos' && !(x.musculos || []).includes(F.exMusc)) return false;
    if (F.exEquip !== 'todos' && !(x.equipamentoIds || []).includes(F.exEquip)) return false;
    if (F.soDesat) return !ativo && (!q || norm(x.nome).includes(q));
    if (F.soDisp && !d.disponivel) return false;
    return !q || norm(x.nome).includes(q);
  });
  itens.sort((a, b) => Number(a.d.disponivel) - Number(b.d.disponivel) || a.x.nome.localeCompare(b.x.nome, 'pt'));
  $('#count-ex').textContent = `${itens.length} ${itens.length === 1 ? 'exercício' : 'exercícios'}`;
  if (!itens.length) {
    $('#lista-ex').innerHTML = `<div class="empty"><b>Nenhum exercício</b>${db.listarExercicios().length ? 'Ajuste os filtros — talvez estejam ocultos por “Só disponíveis” ou “Desativados”.' : 'Toque em “+ Exercício” para começar.'}</div>`;
    return;
  }
  $('#lista-ex').innerHTML = itens.map(({ x, d, ativo }) => `
    <button class="row${d.disponivel ? '' : ' indisp'}${ativo ? '' : ' indisp'}" data-id="${esc(x.id)}" type="button">
      <div>
        <div class="nome">${esc(x.nome)}${ativo ? '' : ' <span class="badge" style="color:var(--bad);border-color:var(--bad)">Desativado</span>'}</div>
        <div class="sub">${(x.tags || []).map((t) => `<span class="tag ${esc(t)}">${esc(t)}</span>`).join('')}${(x.musculos || []).map((m) => `<span class="musc">${esc(m)}</span>`).join('')}</div>
        <div class="sub2">${esc(nomesEquip(x.equipamentoIds).join(', ') || 'sem equipamento')}</div>
        ${x.padrao ? `<div class="sub2" style="color:var(--mut-2)">Padrão: ${esc(PADRAO_LABEL[x.padrao] || x.padrao)}</div>` : '<div class="alerta">⚠ Sem padrão de movimento — não entra na montagem de treino</div>'}
        ${d.disponivel ? '' : `<div class="alerta">⚠ Indisponível — falta: ${esc(d.falta.join(', '))}</div>`}
        ${ativo ? '' : '<div class="alerta">⚠ Desativado — não entra na montagem de treino</div>'}
      </div>
      <div class="qtd" style="font-size:1.3rem;color:${d.disponivel && ativo ? 'var(--ok)' : 'var(--bad)'}">${d.disponivel && ativo ? '●' : '○'}</div>
    </button>`).join('');
}

/* ============================================================
   Render geral
   ============================================================ */
function renderTudo() {
  renderFiltrosCat(); renderInventario();
  renderFiltrosTags(); renderFiltroMusc(); renderFiltroEquip(); renderExercicios();
}

/* ============================================================
   Filtros — eventos
   ============================================================ */
$('#busca-inv').addEventListener('input', (e) => { F.invBusca = e.target.value; renderInventario(); });
$('#filtros-cat').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { F.invCat = c.dataset.cat; renderFiltrosCat(); renderInventario(); } });
$('#busca-ex').addEventListener('input', (e) => { F.exBusca = e.target.value; renderExercicios(); });
$('#filtros-tags').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { F.exTag = c.dataset.tag; renderFiltrosTags(); renderExercicios(); } });
$('#filtro-musc').addEventListener('change', (e) => { F.exMusc = e.target.value; renderExercicios(); });
$('#filtro-equip').addEventListener('change', (e) => { F.exEquip = e.target.value; renderExercicios(); });
$('#chip-disp').addEventListener('click', () => { F.soDisp = !F.soDisp; $('#chip-disp').classList.toggle('on', F.soDisp); renderExercicios(); });
$('#chip-desat').addEventListener('click', () => { F.soDesat = !F.soDesat; $('#chip-desat').classList.toggle('on', F.soDesat); renderExercicios(); });

/* ============================================================
   Modais — abrir/fechar
   ============================================================ */
function abrirModal(id) { $('#' + id).classList.add('open'); }
function fecharModal(id) { $('#' + id).classList.remove('open'); }
$$('.modal-bg').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) fecharModal(m.id); });
});

$('#fab').addEventListener('click', () => { if (abaAtiva === 'inventario') abrirEquip(); else abrirExerc(); });

/* ---------- Modal Equipamento ---------- */
let equipEdit = null;
function preencherSelectCat(valor) {
  $('#sel-cat').innerHTML = db.CATEGORIAS.map((c) => `<option value="${esc(c)}"${c === valor ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
function abrirEquip(item = null) {
  equipEdit = item;
  const f = $('#form-equip');
  $('#modal-equip-titulo').textContent = item ? 'Editar equipamento' : 'Novo equipamento';
  preencherSelectCat(item?.categoria || 'Peso livre');
  f.nome.value = item?.nome || '';
  f.quantidade.value = item ? (Number(item.quantidade) || 0) : 1;
  f.area.value = item?.area || '';
  f.obs.value = item?.obs || '';
  $('#btn-del-equip').hidden = !item;
  abrirModal('modal-equip');
  setTimeout(() => f.nome.focus(), 50);
}
$('#form-equip').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const dados = {
    nome: f.nome.value.trim(), categoria: f.categoria.value,
    quantidade: Math.max(0, parseInt(f.quantidade.value, 10) || 0),
    area: f.area.value.trim(), obs: f.obs.value.trim(),
  };
  if (!dados.nome) return;
  if (equipEdit) dados.id = equipEdit.id;
  db.salvarEquip(dados);
  fecharModal('modal-equip');
  renderTudo();
});
$('#btn-del-equip').addEventListener('click', () => {
  if (!equipEdit) return;
  const n = db.exerciciosComEquip(equipEdit.id);
  const aviso = n ? `\n\nAtenção: ${n} exercício(s) usam este equipamento e ficarão INDISPONÍVEIS até serem ajustados.` : '';
  if (!confirm(`Excluir "${equipEdit.nome}"?${aviso}`)) return;
  db.removerEquip(equipEdit.id);
  fecharModal('modal-equip');
  renderTudo();
});

/* ---------- Modal Exercício ---------- */
let exercEdit = null;
function abrirExerc(item = null) {
  exercEdit = item;
  const f = $('#form-exerc');
  $('#modal-exerc-titulo').textContent = item ? 'Editar exercício' : 'Novo exercício';
  f.nome.value = item?.nome || '';
  f.obs.value = item?.obs || '';
  $('#erro-exerc').classList.remove('show');

  // Equipamentos (puxa do inventário) — regra: só dá pra escolher o que existe no inventário
  const inv = db.listarInventario().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const sel = new Set(item?.equipamentoIds || []);
  const pe = $('#pick-equip');
  if (!inv.length) {
    pe.className = 'pick vazio';
    pe.innerHTML = 'Cadastre equipamentos no Inventário primeiro — um exercício precisa de pelo menos um.';
  } else {
    pe.className = 'pick';
    pe.innerHTML = inv.map((eq) => `<input type="checkbox" id="eq_${esc(eq.id)}" value="${esc(eq.id)}"${sel.has(eq.id) ? ' checked' : ''}/><label for="eq_${esc(eq.id)}">${esc(eq.nome)}</label>`).join('');
  }

  // Padrão de movimento (o que o gerador do montador usa p/ equilibrar o full body) + nível
  $('#ex-padrao').innerHTML = ['<option value="">— selecione —</option>',
    ...PADROES.map((p) => `<option value="${esc(p)}">${esc(PADRAO_LABEL[p] || p)}</option>`)].join('');
  $('#ex-padrao').value = item?.padrao || '';
  $('#ex-nivel').value = item?.nivel || 'intermediario';
  f.ativo.checked = item ? item.ativo !== false : true;

  // Tags
  const selT = new Set(item?.tags || []);
  $('#pick-tags').className = 'pick';
  $('#pick-tags').innerHTML = db.TAGS.map((t) => `<input type="checkbox" id="tg_${esc(t)}" value="${esc(t)}"${selT.has(t) ? ' checked' : ''}/><label for="tg_${esc(t)}">${esc(t)}</label>`).join('');

  // Músculos
  const selM = new Set(item?.musculos || []);
  const muscId = (m) => 'mu_' + m.replace(/[^A-Za-z]/g, '');
  $('#pick-musc').className = 'pick';
  $('#pick-musc').innerHTML = db.MUSCULOS.map((m) => `<input type="checkbox" id="${muscId(m)}" value="${esc(m)}"${selM.has(m) ? ' checked' : ''}/><label for="${muscId(m)}">${esc(m)}</label>`).join('');

  $('#btn-del-exerc').hidden = !item;
  abrirModal('modal-exerc');
  setTimeout(() => f.nome.focus(), 50);
}
$('#form-exerc').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const nome = f.nome.value.trim();
  const equipamentoIds = $$('#pick-equip input:checked').map((i) => i.value);
  const tags = $$('#pick-tags input:checked').map((i) => i.value);
  const musculos = $$('#pick-musc input:checked').map((i) => i.value);
  const err = $('#erro-exerc');
  if (!nome) return;
  // Regra de negócio: exercício exige ao menos 1 equipamento do inventário
  if (!equipamentoIds.length) {
    err.textContent = db.listarInventario().length
      ? 'Selecione ao menos um equipamento do inventário para este exercício.'
      : 'Não há equipamentos no inventário. Cadastre um equipamento antes de criar exercícios.';
    err.classList.add('show');
    return;
  }
  const dados = {
    nome, equipamentoIds, tags, musculos,
    padrao: f.padrao.value, nivel: f.nivel.value || 'intermediario',
    ativo: f.ativo.checked,
    obs: f.obs.value.trim(),
  };
  if (exercEdit) dados.id = exercEdit.id;
  db.salvarExerc(dados);
  fecharModal('modal-exerc');
  renderExercicios();
});
$('#btn-del-exerc').addEventListener('click', () => {
  if (!exercEdit) return;
  if (!confirm(`Excluir o exercício "${exercEdit.nome}"?`)) return;
  db.removerExerc(exercEdit.id);
  fecharModal('modal-exerc');
  renderExercicios();
});

/* Clique nas listas → editar */
$('#lista-inv').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { const it = db.obterEquip(r.dataset.id); if (it) abrirEquip(it); } });
$('#lista-ex').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { const it = db.obterExerc(r.dataset.id); if (it) abrirExerc(it); } });

/* ============================================================
   GATE de acesso (mesmo login do Coach/Montador)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gToggle = $('#gate-toggle'), gReset = $('#gate-reset');
const gBtn = gform.querySelector('button[type=submit]');

async function entrar(user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra contas de aluno
  UID = user?.uid || null;
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  trocarAba('inventario');
  renderTudo();
  if (user && user.uid) db.iniciarSync(user.uid, renderTudo);
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
    } catch (err) { erroMsg(msgAuth(err)); console.error('Auth:', err?.code, err?.message); }
  });
} else if (estaLiberado()) {
  entrar();
} else {
  gate.style.display = 'flex';
  gEmail?.remove(); gToggle?.remove(); gReset?.remove(); gSenha.focus();
  gform.addEventListener('submit', async (e) => { e.preventDefault(); if (await tentarLiberar(gSenha.value)) entrar(); else { erroMsg('Senha incorreta.'); gSenha.value = ''; gSenha.focus(); } });
}
