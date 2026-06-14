// @ts-check
import { gerarTreino } from '../core/gerador.js';
import { gerarProgramaSemanal, GRADE_PADRAO } from '../core/programaSemanal.js';
import { gerarMesociclo } from '../core/mesociclo.js';
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import { COMBINACOES, COMBINACAO_POR_ID } from '../config/frequencias.js';
import * as store from './store.js';
import { renderTreino, renderCenarios, renderMesociclo, ativarTrocas } from './render.js';
import { sugerirCarga } from '../core/cargas.js';

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const $$ = (s) => Array.from(document.querySelectorAll(s));
const NIVEIS = ['iniciante', 'intermediario', 'avancado'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const GRADE_IDS = { seg: '#g-seg', ter: '#g-ter', qua: '#g-qua', qui: '#g-qui', sex: '#g-sex' };
const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

// ---------- abas ----------
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  tab.classList.add('active');
  $('#view-' + tab.dataset.view).classList.add('active');
}));

// ---------- popular selects ----------
function popularSelects() {
  MODALIDADE_IDS.forEach((id) => $('#d-modalidade').appendChild(opt(id, MODALIDADES[id].nome)));
  DIAS.forEach((d) => $('#d-dia').appendChild(opt(d, d.toUpperCase())));
  COMBINACOES.forEach((c) => $('#al-combinacao').appendChild(opt(c.id, `${c.frequencia}× — ${c.rotulo}`)));
  ['#d-nivel', '#al-nivel', '#m-nivel'].forEach((sel) => NIVEIS.forEach((n) => $(sel).appendChild(opt(n, n))));
  $('#d-nivel').value = 'intermediario';
  $('#m-nivel').value = 'intermediario';

  // grade da semana: cada dia escolhe uma modalidade (ou folga)
  const cfg = store.getConfig();
  const grade = cfg.grade || GRADE_PADRAO;
  Object.entries(GRADE_IDS).forEach(([dia, sel]) => {
    const el = $(sel);
    el.appendChild(opt('', '— folga —'));
    MODALIDADE_IDS.forEach((id) => el.appendChild(opt(id, MODALIDADES[id].nome)));
    el.value = grade[dia] || '';
  });
  const nivelSel = $('#s-nivel');
  NIVEIS.forEach((n) => nivelSel.appendChild(opt(n, n)));
  nivelSel.value = cfg.nivelRef || 'intermediario';
}

// ---------- AULA DO DIA ----------
/** @type {import('../core/tipos.js').Treino|null} */
let treinoDia = null;

function gerarDia() {
  treinoDia = gerarTreino({
    modalidade: $('#d-modalidade').value,
    nivel: $('#d-nivel').value,
    dia: $('#d-dia').value,
    semana: Number($('#d-semana').value) || 1,
    seed: Math.floor(Math.random() * 1e9),
  });
  $('#d-saida').innerHTML = renderTreino(treinoDia);
}

/** Snapshot compacto de um treino para o histórico. */
function snapshotTreino(t) {
  return {
    modalidade: t.modalidade, dia: t.dia, semana: t.semana, nivel: t.nivel,
    tempoTotalSeg: t.tempoTotalSeg, totalSeries: t.volume.totalSeries,
    exercicios: t.principal.map((p) => ({
      nome: p.exercicio.nome, padrao: p.exercicio.padrao,
      series: p.series, reps: p.reps,
      carga: sugerirCarga(p.exercicio, t.nivel, t.modalidade).texto,
    })),
  };
}

function salvarTreinoDia() {
  const alunoId = $('#d-aluno').value;
  if (!alunoId) { alert('Selecione um aluno em "Salvar para".'); return; }
  if (!treinoDia) { alert('Gere um treino primeiro.'); return; }
  store.salvarSessao(alunoId, {
    data: new Date().toISOString(), tipo: 'dia',
    resumo: `${MODALIDADES[treinoDia.modalidade].nome} · ${treinoDia.principal.length} exercícios · ${treinoDia.volume.totalSeries} séries`,
    dados: snapshotTreino(treinoDia),
  });
  const btn = $('#d-salvar');
  const txt = btn.textContent; btn.textContent = '✓ Salvo'; setTimeout(() => { btn.textContent = txt; }, 1500);
}

// ---------- PROGRAMA DA SEMANA ----------
function atualizarSelectAlunos() {
  const placeholders = { '#d-aluno': '— sem aluno —', '#h-aluno': '— selecione um aluno —' };
  Object.entries(placeholders).forEach(([id, ph]) => {
    const sel = $(id);
    const atual = sel.value;
    sel.innerHTML = '';
    sel.appendChild(opt('', ph));
    store.listarAlunos().forEach((a) => sel.appendChild(opt(a.id, `${a.nome} (${a.nivel})`)));
    sel.value = atual; // preserva seleção quando possível
  });
}

/** Lê a grade configurada nos selects e persiste. */
function lerGrade() {
  const grade = {};
  Object.entries(GRADE_IDS).forEach(([dia, sel]) => { const v = $(sel).value; if (v) grade[dia] = v; });
  const nivelRef = $('#s-nivel').value;
  store.setConfig({ grade, nivelRef });
  return { grade, nivelRef };
}

function gerarPrograma(freqDestaque) {
  const { grade, nivelRef } = lerGrade();
  const prog = gerarProgramaSemanal({
    grade, nivelRef,
    semana: Number($('#s-semana').value) || 1,
    seed: Math.floor(Math.random() * 1e6),
  });
  $('#s-saida').innerHTML = renderCenarios(prog, freqDestaque) +
    prog.treinos.map((t) => renderTreino(t)).join('');
}

// ---------- MESOCICLO ----------
function gerarMeso() {
  const cfg = store.getConfig();
  const meso = gerarMesociclo({
    grade: cfg.grade || GRADE_PADRAO,
    nivelRef: $('#m-nivel').value || cfg.nivelRef || 'intermediario',
    nSemanas: Number($('#m-semanas').value) || 4,
    seed: Math.floor(Math.random() * 1e6),
  });
  $('#m-saida').innerHTML = renderMesociclo(meso);
}

// ---------- HISTÓRICO ----------
function renderHistorico() {
  const alunoId = $('#h-aluno').value;
  const el = $('#h-saida');
  if (!alunoId) { el.innerHTML = '<div class="empty">Selecione um aluno para ver o histórico.</div>'; return; }
  const sessoes = store.listarSessoes(alunoId);
  if (!sessoes.length) { el.innerHTML = '<div class="empty">Nenhum treino salvo para este aluno ainda.</div>'; return; }
  el.innerHTML = sessoes.map((s) => {
    const d = new Date(s.data);
    const exs = (s.dados.exercicios || []).map((e) =>
      `<tr><td>${e.nome}</td><td>${e.series}× ${e.reps}</td><td><small>${e.carga}</small></td></tr>`).join('');
    return `<article class="card">
      <div class="ex-row">
        <div><h3>${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</h3>
          <div class="mut">${s.resumo}</div></div>
        <button class="btn danger sm" data-delsessao="${s.id}" style="margin-left:auto">Remover</button>
      </div>
      <table><tbody>${exs}</tbody></table>
    </article>`;
  }).join('');
}

// ---------- ALUNOS ----------
function renderAlunos() {
  const lista = store.listarAlunos();
  const el = $('#al-lista');
  if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum aluno cadastrado ainda.</div>'; return; }
  el.innerHTML = lista.map((a) => {
    const c = COMBINACAO_POR_ID[a.combinacaoId];
    return `<div class="card aluno-card">
      <div>
        <div class="nome">${a.nome}</div>
        <div class="meta">${a.nivel} · ${c ? c.frequencia + '× ' + c.rotulo : '—'}</div>
      </div>
      <div class="acoes">
        <button class="btn ghost sm" data-gerar="${a.id}">Ver programa</button>
        <button class="btn danger sm" data-del="${a.id}">Remover</button>
      </div>
    </div>`;
  }).join('');
}

function bindAlunos() {
  $('#al-add').addEventListener('click', () => {
    const nome = $('#al-nome').value.trim();
    if (!nome) { $('#al-nome').focus(); return; }
    store.adicionarAluno({
      nome, nivel: $('#al-nivel').value, combinacaoId: $('#al-combinacao').value, modalidadesPorDia: {},
    });
    $('#al-nome').value = '';
    renderAlunos();
    atualizarSelectAlunos();
  });
  $('#al-lista').addEventListener('click', (ev) => {
    const del = ev.target.closest('[data-del]');
    if (del) { store.removerAluno(del.dataset.del); renderAlunos(); atualizarSelectAlunos(); return; }
    const ger = ev.target.closest('[data-gerar]');
    if (ger) {
      const aluno = store.listarAlunos().find((a) => a.id === ger.dataset.gerar);
      const freq = COMBINACAO_POR_ID[aluno?.combinacaoId]?.frequencia;
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.view').forEach((v) => v.classList.remove('active'));
      document.querySelector('.tab[data-view="semana"]').classList.add('active');
      $('#view-semana').classList.add('active');
      gerarPrograma(freq);
    }
  });
}

// ---------- init ----------
popularSelects();
atualizarSelectAlunos();
renderAlunos();
renderHistorico();
bindAlunos();
$('#d-gerar').addEventListener('click', gerarDia);
$('#s-gerar').addEventListener('click', () => gerarPrograma());
$('#m-gerar').addEventListener('click', gerarMeso);
$('#d-salvar').addEventListener('click', salvarTreinoDia);
$('#h-aluno').addEventListener('change', renderHistorico);
$('#h-saida').addEventListener('click', (ev) => {
  const del = ev.target.closest('[data-delsessao]');
  if (del) { store.removerSessao($('#h-aluno').value, del.dataset.delsessao); renderHistorico(); }
});
$('#d-imprimir').addEventListener('click', () => window.print());
$('#s-imprimir').addEventListener('click', () => window.print());
$('#m-imprimir').addEventListener('click', () => window.print());
$('#h-imprimir').addEventListener('click', () => window.print());
ativarTrocas($('main'));
gerarDia();
