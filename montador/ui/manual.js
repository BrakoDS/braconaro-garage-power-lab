// @ts-check
/**
 * TREINO MANUAL — montagem por seleção (sem digitação).
 *
 * O coach escolhe a Classificação/Objetivo (modalidade) no topo; ela filtra os
 * exercícios das listas (mesmo catálogo efetivo da Academia usado pelo gerador).
 * Estrutura: Aquecimento/Mobilidade (até 3 seleções) + 8 blocos principais, cada
 * um com Exercício · Séries · Repetições · Técnica avançada. A meta de volume da
 * semana e as barras por músculo são as MESMAS do Treino Automático, e o
 * salvamento reaproveita o mesmo snapshot/fluxo (histórico + Portal do Aluno).
 */
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import { PADRAO_LABEL, PADROES } from '../config/padroes.js';
import { EXERCICIOS } from '../data/exercicios.js';
import { calcularVolume } from '../core/volume.js';
import { variantesNivel } from '../core/niveis.js';
import * as store from './store.js';
import { renderMetaVolume, renderVolume } from './render.js';
import { publicarTreino } from './portal-treino.js';

const N_BLOCOS = 8;
const N_AQUEC = 3;
/** Duração de cada exercício de mobilidade no aquecimento (mesma regra do gerador). */
const AQUEC_SEG = { forca: 150, default: 120 };

/** Técnicas avançadas selecionáveis (mesmos rótulos/detalhes do Híbrido). */
const TECNICAS = {
  dropset: { label: 'Drop-set', detalhe: 'Drop-set na última série: reduza a carga e vá até a falha' },
  isometria: { label: 'Isometria', detalhe: 'Isometria de 1–2s no pico da contração, em toda série' },
  tempo: { label: 'Tempo 2-1-2', detalhe: 'Cadência 2-1-2 (2s descida · 1s pico · 2s subida)' },
  biset: { label: 'Bi-set', detalhe: 'Bi-set com o exercício seguinte — sem descanso entre os dois' },
};

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- estado local da aba ----------
let modalidade = /** @type {import('../config/modalidades.js').ModalidadeId} */ ('forca');
/** @type {string[]} ids de mobilidade escolhidos ('' = vazio) */
const aquecSel = Array(N_AQUEC).fill('');
/** @type {{ex:string, series:number, reps:number, tecnica:string}[]} */
const blocos = Array.from({ length: N_BLOCOS }, () => ({ ex: '', series: 4, reps: 10, tecnica: '' }));

const porId = (id) => EXERCICIOS.find((e) => e.id === id) || null;

// ---------- pools (lêem o catálogo VIVO — já com as tags da Academia) ----------
function poolPrincipal() {
  const mod = MODALIDADES[modalidade];
  return EXERCICIOS.filter((e) =>
    e.categorias.includes(modalidade)
    && !(e.categorias.length === 1 && e.categorias[0] === 'mobilidade')
    && (!mod.padroesAlvo || mod.padroesAlvo.includes(e.padrao)));
}
const poolMobilidade = () => EXERCICIOS.filter((e) => e.categorias.includes('mobilidade'));

/** IDs já usados em OUTROS dias da mesma semana (marcados na lista, mas selecionáveis). */
function idsUsadosNaSemana(dateId) {
  const ids = new Set();
  for (const t of store.treinosDaSemana(dateId)) {
    if (t.dateId === dateId) continue;
    for (const e of (t.exercicios || [])) if (e.id) ids.add(e.id);
  }
  return ids;
}

// ---------- options ----------
function optionsExercicios(selecionado, usados) {
  const porPadrao = {};
  for (const e of poolPrincipal()) (porPadrao[e.padrao] = porPadrao[e.padrao] || []).push(e);
  const grupos = PADROES.filter((p) => porPadrao[p]?.length).map((p) => {
    const opts = porPadrao[p]
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((e) => `<option value="${e.id}"${e.id === selecionado ? ' selected' : ''}>${esc(e.nome)}${usados.has(e.id) ? ' · já na semana' : ''}</option>`)
      .join('');
    return `<optgroup label="${PADRAO_LABEL[p] || p}">${opts}</optgroup>`;
  }).join('');
  return `<option value="">— vazio —</option>${grupos}`;
}

function optionsMobilidade(selecionado) {
  const opts = poolMobilidade()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((e) => `<option value="${e.id}"${e.id === selecionado ? ' selected' : ''}>${esc(e.nome)}</option>`)
    .join('');
  return `<option value="">— vazio —</option>${opts}`;
}

const optionsNum = (de, ate, sel, sufixo = '') => {
  let out = '';
  for (let n = de; n <= ate; n++) out += `<option value="${n}"${n === sel ? ' selected' : ''}>${n}${sufixo}</option>`;
  return out;
};

function optionsTecnica(sel) {
  return `<option value="">Nenhuma</option>` + Object.entries(TECNICAS)
    .map(([k, t]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${t.label}</option>`).join('');
}

// ---------- render do editor ----------
function renderEditor() {
  const dateId = $('#m-data').value || store.dateIdDe();
  const usados = idsUsadosNaSemana(dateId);

  const aquecRows = aquecSel.map((id, i) => `
    <div class="man-row man-aquec">
      <span class="man-n">${i + 1}</span>
      <select class="man-sel man-mob" data-i="${i}">${optionsMobilidade(id)}</select>
    </div>`).join('');

  const blocoRows = blocos.map((b, i) => `
    <div class="man-row">
      <span class="man-n">${i + 1}</span>
      <select class="man-sel man-ex" data-i="${i}">${optionsExercicios(b.ex, usados)}</select>
      <select class="man-sel man-series" data-i="${i}" title="Séries">${optionsNum(2, 6, b.series, '×')}</select>
      <select class="man-sel man-reps" data-i="${i}" title="Repetições">${optionsNum(1, 20, b.reps, ' reps')}</select>
      <select class="man-sel man-tec" data-i="${i}" title="Técnica avançada">${optionsTecnica(b.tecnica)}</select>
    </div>`).join('');

  $('#m-editor').innerHTML = `
    <article class="card">
      <h4>Aquecimento / Mobilidade <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— até ${N_AQUEC} exercícios, ${Math.round((AQUEC_SEG[modalidade] || AQUEC_SEG.default) / 60 * 10) / 10}min cada</span></h4>
      ${aquecRows}
      <h4>Parte principal <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— até ${N_BLOCOS} blocos · exercício, séries, reps e técnica</span></h4>
      <div class="man-head"><span></span><span>Exercício</span><span>Séries</span><span>Reps</span><span>Técnica</span></div>
      ${blocoRows}
    </article>`;
}

// ---------- meta de volume + barras por músculo (mesma lógica do automático) ----------
function volumeAtual() {
  const itens = blocos
    .filter((b) => b.ex && porId(b.ex))
    .map((b) => ({ exercicio: porId(b.ex), series: b.series }));
  return { itens, vol: calcularVolume(itens) };
}

function atualizarPaineis() {
  const dateId = $('#m-data').value || store.dateIdDe();
  const { itens, vol } = volumeAtual();
  const volsWeek = store.treinosDaSemana(dateId)
    .filter((t) => t.dateId !== dateId)
    .map((t) => t.volPorPadrao || {});
  $('#m-meta').innerHTML = renderMetaVolume(volsWeek, itens.length ? vol.porPadrao : null);
  $('#m-vol').innerHTML = itens.length
    ? `<article class="card"><h4>Volume por músculo (séries equivalentes)</h4>${renderVolume(vol)}</article>`
    : '';
  renderSalvarBar(dateId, itens.length > 0);
}

function renderSalvarBar(dateId, temExercicios) {
  const jaTem = store.getTreino(dateId);
  const dataTxt = store.dataDe(dateId).toLocaleDateString('pt-BR');
  $('#m-salvar').innerHTML = temExercicios ? `<div class="card salvar-bar">
    <div>Salvar na data <b>${dataTxt}</b>${jaTem ? ' <span class="chip warn">já há treino nesse dia</span>' : ''} e publicar no <b>Portal do Aluno</b>.</div>
    <button class="btn" id="btn-salvar-manual" type="button">Salvar no histórico</button>
  </div>` : '';
}

// ---------- snapshot no MESMO formato do automático ----------
function snapshotManual(dateId) {
  const { itens, vol } = volumeAtual();
  const aquecSeg = AQUEC_SEG[modalidade] || AQUEC_SEG.default;
  const mod = MODALIDADES[modalidade];
  return {
    dia: store.diaSemanaDe(dateId),
    modalidade,
    geradoEm: new Date().toISOString(),
    manual: true,
    volPorPadrao: vol.porPadrao,
    viabilidade: { ok: false }, // montagem manual: sem checagem de equipamento/grupos
    aquecimento: aquecSel.filter(Boolean).map((id) => porId(id)).filter(Boolean)
      .map((e) => ({ nome: e.nome, duracaoSeg: aquecSeg })),
    exercicios: blocos.filter((b) => b.ex && porId(b.ex)).map((b) => {
      const e = porId(b.ex);
      const t = TECNICAS[b.tecnica];
      return {
        id: e.id, nome: e.nome, padrao: e.padrao, equipamento: e.equipamento,
        reps: `${b.reps} reps`, descansoSeg: mod.descansoSeg, seriesRef: b.series,
        niveis: variantesNivel(e, b.series, modalidade),
        tecnica: t ? { tipo: b.tecnica, detalhe: t.detalhe } : null,
      };
    }),
    finalizador: null,
  };
}

function salvarManual() {
  const dateId = $('#m-data').value || store.dateIdDe();
  const { itens } = volumeAtual();
  if (!itens.length) return;
  const dataTxt = store.dataDe(dateId).toLocaleDateString('pt-BR');
  if (store.getTreino(dateId)) {
    if (!confirm(`Já existe um treino salvo em ${dataTxt}.\n\nSubstituir pelo treino manual?`)) return;
  }
  const snap = snapshotManual(dateId);
  store.salvarTreino(dateId, snap);
  publicarTreino(dateId, snap);
  $('#m-salvar').innerHTML = `<div class="card salvar-bar"><span class="ok">✓ Treino manual salvo em ${dataTxt} e enviado ao Portal do Aluno.</span></div>`;
  atualizarPaineis0AposSalvar(dateId);
}

/** Após salvar, re-renderiza a meta já contando o treino salvo na semana. */
function atualizarPaineis0AposSalvar(dateId) {
  const volsWeek = store.treinosDaSemana(dateId).map((t) => t.volPorPadrao || {});
  $('#m-meta').innerHTML = renderMetaVolume(volsWeek, null);
}

// ---------- init ----------
export function initManual() {
  // popular selects fixos
  MODALIDADE_IDS.forEach((id) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = MODALIDADES[id].nome;
    $('#m-modalidade').appendChild(o);
  });
  $('#m-data').value = store.dateIdDe();

  renderEditor();
  atualizarPaineis();

  $('#m-modalidade').addEventListener('change', () => {
    modalidade = /** @type {any} */ ($('#m-modalidade').value);
    // exercícios já escolhidos que não pertencem à nova classificação saem da montagem
    const validos = new Set(poolPrincipal().map((e) => e.id));
    for (const b of blocos) if (b.ex && !validos.has(b.ex)) b.ex = '';
    renderEditor();
    atualizarPaineis();
  });

  $('#m-data').addEventListener('change', () => { renderEditor(); atualizarPaineis(); });

  $('#m-limpar').addEventListener('click', () => {
    aquecSel.fill('');
    for (const b of blocos) { b.ex = ''; b.series = 4; b.reps = 10; b.tecnica = ''; }
    renderEditor();
    atualizarPaineis();
  });

  // delegação: qualquer select do editor
  $('#m-editor').addEventListener('change', (ev) => {
    const el = /** @type {HTMLSelectElement} */ (ev.target);
    const i = Number(el.dataset.i);
    if (el.classList.contains('man-mob')) aquecSel[i] = el.value;
    else if (el.classList.contains('man-ex')) blocos[i].ex = el.value;
    else if (el.classList.contains('man-series')) blocos[i].series = Number(el.value);
    else if (el.classList.contains('man-reps')) blocos[i].reps = Number(el.value);
    else if (el.classList.contains('man-tec')) blocos[i].tecnica = el.value;
    atualizarPaineis();
  });

  $('#m-salvar').addEventListener('click', (ev) => {
    if (/** @type {HTMLElement} */ (ev.target).closest('#btn-salvar-manual')) salvarManual();
  });

  // ao entrar na aba, re-renderiza (catálogo da Academia pode ter chegado depois)
  document.querySelector('.tab[data-view="manual"]')?.addEventListener('click', () => {
    renderEditor();
    atualizarPaineis();
  });
}
