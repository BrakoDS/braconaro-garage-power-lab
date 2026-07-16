// @ts-check
/* Controlador da UI. Fluxo único: escolhe modalidade + data → gera treino (sem
   repetir exercícios já usados na semana) → mostra meta de volume da semana →
   salva na data (conflito = substituir) e publica no Portal do Aluno. O histórico
   é um calendário mensal colorido por modalidade. */
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import * as store from './store.js';
import { renderDiaSalvo, renderTreino, ativarTrocas, renderCalendario, renderMetaVolume } from './render.js';
import { gerarTreino } from '../core/gerador.js';
import { variantesNivel } from '../core/niveis.js';
import { publicarTreino, removerTreinoPortal } from './portal-treino.js';

/** A geração ancora no intermediário; as colunas iniciante/avançado derivam dele. */
const NIVEL_ANCORA = 'intermediario';

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const $$ = (s) => Array.from(document.querySelectorAll(s));
const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

/** 'DD/MM/AAAA' a partir de 'YYYY-MM-DD'. */
function formatarData(dateId) {
  return store.dataDe(dateId).toLocaleDateString('pt-BR');
}

// ---------- abas ----------
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  tab.classList.add('active');
  $('#view-' + tab.dataset.view).classList.add('active');
  if (tab.dataset.view === 'historico') renderHistorico();
}));

// ---------- popular selects ----------
function popularSelects() {
  MODALIDADE_IDS.forEach((id) => $('#u-modalidade').appendChild(opt(id, MODALIDADES[id].nome)));
  $('#u-data').value = store.dateIdDe(); // default: hoje
}

// ---------- snapshot persistível de UM treino (formato "dia") ----------
/** @param {any} t treino de gerarTreino @param {string} dateId */
function diaSnapshotDe(t, dateId) {
  const dia = store.diaSemanaDe(dateId);
  const base = {
    dia, modalidade: t.modalidade, geradoEm: new Date().toISOString(),
    volPorPadrao: t.volume?.porPadrao || {},
  };
  if (t.hyrox) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, hyrox: t.hyrox };
  if (t.hiit) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, hiit: t.hiit };
  if (t.gap) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, gap: t.gap };
  if (t.hibrido) return {
    ...base,
    viabilidade: { ok: t.hibrido.viabilidade.ok, tamanhoGrupo: t.tamanhoGrupo },
    hibrido: {
      split: t.hibrido.split, splitLabel: t.hibrido.splitLabel,
      mobilidade: t.hibrido.mobilidade,
      hipertrofia: t.hibrido.hipertrofia.map((p) => ({
        nome: p.exercicio.nome, padrao: p.exercicio.padrao, equipamento: p.exercicio.equipamento,
        reps: p.reps, descansoSeg: p.descansoSeg, seriesRef: p.series,
        niveis: variantesNivel(p.exercicio, p.series, t.modalidade),
        multiarticular: p.exercicio.multiarticular !== false,
        tecnica: p.tecnica,
      })),
      wod: t.hibrido.wod, duracaoSeg: t.hibrido.duracaoSeg,
    },
  };
  return {
    ...base,
    viabilidade: { ok: t.viabilidade.ok, tamanhoGrupo: t.viabilidade.tamanhoGrupo },
    exercicios: t.principal.map((p) => ({
      id: p.exercicio.id, nome: p.exercicio.nome, padrao: p.exercicio.padrao,
      equipamento: p.exercicio.equipamento, reps: p.reps, descansoSeg: p.descansoSeg,
      seriesRef: p.series, niveis: variantesNivel(p.exercicio, p.series, t.modalidade),
    })),
    finalizador: t.finalizador ? { tipo: t.finalizador.tipo, descricao: t.finalizador.descricao } : null,
  };
}

// ---------- TREINO (gerador único) ----------
/** @type {any} */
let treinoGerado = null;

/** IDs de exercício já usados em OUTROS dias da mesma semana (não-repetição). */
function idsUsadosNaSemana(dateId) {
  const ids = new Set();
  for (const t of store.treinosDaSemana(dateId)) {
    if (t.dateId === dateId) continue; // o próprio dia será substituído — não conta
    for (const e of (t.exercicios || [])) if (e.id) ids.add(e.id);
  }
  return [...ids];
}

function renderMetaPanel(dateId, treino) {
  const volsWeek = store.treinosDaSemana(dateId)
    .filter((t) => t.dateId !== dateId)
    .map((t) => t.volPorPadrao || {});
  $('#u-meta').innerHTML = renderMetaVolume(volsWeek, treino ? (treino.volume?.porPadrao || {}) : null);
}

function renderSalvarBar(dateId) {
  const jaTem = store.getTreino(dateId);
  $('#u-salvar').innerHTML = `<div class="card salvar-bar">
    <div>Salvar na data <b>${formatarData(dateId)}</b>${jaTem ? ' <span class="chip warn">já há treino nesse dia</span>' : ''} e publicar no <b>Portal do Aluno</b>.</div>
    <button class="btn" id="btn-salvar-treino" type="button">Salvar no histórico</button>
  </div>`;
}

function gerarUnico() {
  const modalidade = $('#u-modalidade').value;
  const nAlunos = Math.min(20, Math.max(1, Number($('#u-alunos').value) || 8));
  const dateId = $('#u-data').value || store.dateIdDe();
  const idsEvitar = idsUsadosNaSemana(dateId);
  const treino = gerarTreino({ modalidade, nivel: NIVEL_ANCORA, dia: 'unico', semana: 1, nAlunos, idsEvitar, seed: Math.floor(Math.random() * 1e6) });
  treinoGerado = treino;
  $('#u-saida').innerHTML = renderTreino(treino, { mostrarDiaSemana: false });
  renderMetaPanel(dateId, treino);
  renderSalvarBar(dateId);
}

function salvarTreinoAtual() {
  if (!treinoGerado) return;
  const dateId = $('#u-data').value || store.dateIdDe();
  if (store.getTreino(dateId)) {
    if (!confirm(`Já existe um treino salvo em ${formatarData(dateId)}.\n\nSubstituir pelo treino gerado?`)) return;
  }
  const snap = diaSnapshotDe(treinoGerado, dateId);
  store.salvarTreino(dateId, snap);
  publicarTreino(dateId, snap);
  $('#u-salvar').innerHTML = `<div class="card salvar-bar"><span class="ok">✓ Treino salvo em ${formatarData(dateId)} e enviado ao Portal do Aluno.</span></div>`;
  renderMetaPanel(dateId, treinoGerado);
}

// ---------- HISTÓRICO (calendário) ----------
let calMesId = store.mesIdDe();

/** Desloca 'YYYY-MM' por `delta` meses. */
function shiftMes(mesId, delta) {
  const [a, m] = mesId.split('-').map(Number);
  return store.mesIdDe(new Date(a, m - 1 + delta, 1));
}

function renderHistorico() {
  const treinos = store.listarTreinosDoMes(calMesId);
  $('#h-saida').innerHTML = renderCalendario(calMesId, treinos, store.rotuloMes(calMesId)) + '<div id="cal-detalhe"></div>';
}

function ativarCalendario() {
  $('#h-saida').addEventListener('click', (ev) => {
    const nav = ev.target.closest('.cal-nav');
    if (nav) { calMesId = shiftMes(calMesId, Number(nav.dataset.nav)); renderHistorico(); return; }

    const cel = ev.target.closest('.cal-cel.tem');
    if (cel) {
      const dateId = cel.dataset.date;
      const snap = store.getTreino(dateId);
      if (!snap) return;
      const det = $('#cal-detalhe');
      det.innerHTML = `<div class="cal-det-topo"><b>${formatarData(dateId)}</b>
        <button class="btn danger sm" id="btn-excluir-dia" data-date="${dateId}" type="button">Excluir treino</button></div>`
        + renderDiaSalvo(snap, false);
      det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const del = ev.target.closest('#btn-excluir-dia');
    if (del) {
      const dateId = del.dataset.date;
      if (!confirm(`Excluir o treino de ${formatarData(dateId)}?\n\nEle sai do histórico e do "Treino do dia" do aluno.`)) return;
      store.removerTreino(dateId);
      removerTreinoPortal(dateId);
      renderHistorico();
    }
  });
}

// ---------- init ----------
popularSelects();
$('#u-gerar').addEventListener('click', gerarUnico);
$('#u-imprimir').addEventListener('click', () => window.print());
ativarTrocas($('#u-saida'));
$('#view-unico').addEventListener('click', (ev) => { if (ev.target.closest('#btn-salvar-treino')) salvarTreinoAtual(); });
ativarCalendario();
renderHistorico();
