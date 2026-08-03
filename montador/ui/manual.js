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
import { EXERCICIOS, serveModalidade } from '../data/exercicios.js';
import { MOV_GAP_POR_ID } from '../data/gap.js';
import { calcularVolume } from '../core/volume.js';
import { duracaoMobilidade } from '../core/gerador.js';
import { variantesNivel } from '../core/niveis.js';
import * as academia from '../../academia/db.js';
import * as store from './store.js';
import { renderMetaVolume, renderVolume } from './render.js';
import { confirmar } from './dialogo.js';
import { publicarTreino } from './portal-treino.js';

const N_BLOCOS = 8;
/**
 * Slots de mobilidade. Eram 3 porque cada uma durava 2,5 min; agora cada uma dura
 * 30–60s (a duração vem do próprio exercício, mesma regra do gerador), então cabe
 * um aquecimento de verdade dentro do mesmo tempo de aula.
 */
const N_AQUEC = 8;

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- estado local da aba ----------
let modalidade = /** @type {import('../config/modalidades.js').ModalidadeId} */ ('forca');
/** @type {string[]} ids de mobilidade escolhidos ('' = vazio) */
const aquecSel = Array(N_AQUEC).fill('');
/** @type {{ex:string, series:number, reps:number, tecnica:string}[]} */
const blocos = Array.from({ length: N_BLOCOS }, () => ({ ex: '', series: 4, reps: 10, tecnica: '' }));

/* ---------- banco do GAP ----------
   O GAP não usa o catálogo: tem banco próprio de peso corporal em data/gap.js.
   Aqui cada movimento é adaptado para o formato `Exercicio`, e aí todo o resto do
   caminho (volume, variantes de nível, snapshot, Portal) funciona sem saber que
   veio de outro lugar. Os ids ganham o prefixo `gap:` porque há colisão real com o
   catálogo (`polichinelo` existe nos dois). */
const GAP_PREFIXO = 'gap:';

/** @param {import('../data/gap.js').MovGap} m */
function movGapComoExercicio(m) {
  return {
    id: GAP_PREFIXO + m.id,
    nome: m.nome,
    descricao: '',
    padrao: m.padrao,
    // mesma convenção do catálogo: o primeiro músculo é primário, o resto secundário
    musculosPrimarios: m.musculos.slice(0, 1),
    musculosSecundarios: m.musculos.slice(1),
    categorias: ['gap'],
    equipamento: ['corporal'],
    nivel: 'iniciante',
    tempoMedioSeg: 30,
    multiarticular: true,
  };
}

/** @type {Record<string, any>} */
const GAP_COMO_EXERCICIO = Object.fromEntries(
  Object.values(MOV_GAP_POR_ID).map((m) => { const e = movGapComoExercicio(m); return [e.id, e]; })
);

const porId = (id) => (id?.startsWith(GAP_PREFIXO) ? GAP_COMO_EXERCICIO[id] : EXERCICIOS.find((e) => e.id === id)) || null;

// ---------- pools (lêem o catálogo VIVO — já com as tags da Academia) ----------
function poolPrincipal() {
  if (modalidade === 'gap') return Object.values(GAP_COMO_EXERCICIO);
  const mod = MODALIDADES[modalidade];
  // `serveModalidade` é a MESMA regra do gerador automático: depois da unificação
  // FORÇA+HIPERTROFIA na tag MUSCULAÇÃO, `categorias.includes('forca')` não casa com
  // nada — Força vira "musculação + composto com carga", e isso mora lá.
  return EXERCICIOS.filter((e) =>
    serveModalidade(e, modalidade)
    && !(e.categorias.length === 1 && e.categorias[0] === 'mobilidade')
    && (!mod.padroesAlvo || mod.padroesAlvo.includes(e.padrao)));
}
const poolMobilidade = () => EXERCICIOS.filter((e) => e.categorias.includes('mobilidade'));

/** As mobilidades escolhidas nos slots, na ordem, sem os vazios. */
const mobilidadesEscolhidas = () =>
  aquecSel.map((id) => (id ? porId(id) : null)).filter(Boolean);

/** "≈ 5,5 min · 30–60s cada" — o total sai da soma real, não de um número fixo. */
function tempoAquecTxt() {
  const total = mobilidadesEscolhidas().reduce((a, e) => a + duracaoMobilidade(e), 0);
  return total
    ? `≈ ${Math.round(total / 60 * 10) / 10} min no total`
    : '30–60s cada';
}

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

/**
 * Técnicas avançadas: vêm da aba "Técnicas" da Academia (mesma ponte que o catálogo
 * de exercícios usa). O que o coach cadastra lá aparece aqui; desativada não aparece.
 */
function tecnicasDisponiveis() {
  try {
    return academia.listarTecnicas()
      .filter((t) => t.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  } catch { return []; }
}
const tecnicaPorId = (id) => tecnicasDisponiveis().find((t) => t.id === id) || null;

function optionsTecnica(sel) {
  return `<option value="">Nenhuma</option>` + tecnicasDisponiveis()
    .map((t) => `<option value="${esc(t.id)}"${t.id === sel ? ' selected' : ''}>${esc(t.nome)}</option>`).join('');
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
      <h4>Aquecimento / Mobilidade <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— até ${N_AQUEC} exercícios curtos · ${tempoAquecTxt()}</span></h4>
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
  const mod = MODALIDADES[modalidade];
  return {
    dia: store.diaSemanaDe(dateId),
    modalidade,
    geradoEm: new Date().toISOString(),
    manual: true,
    volPorPadrao: vol.porPadrao,
    viabilidade: { ok: false }, // montagem manual: sem checagem de equipamento/grupos
    aquecimento: mobilidadesEscolhidas()
      .map((e) => ({ nome: e.nome, duracaoSeg: duracaoMobilidade(e) })),
    exercicios: blocos.filter((b) => b.ex && porId(b.ex)).map((b) => {
      const e = porId(b.ex);
      const t = tecnicaPorId(b.tecnica);
      return {
        id: e.id, nome: e.nome, padrao: e.padrao, equipamento: e.equipamento,
        reps: `${b.reps} reps`, descansoSeg: mod.descansoSeg, seriesRef: b.series,
        niveis: variantesNivel(e, b.series, modalidade),
        // `label` vai junto porque o rótulo não é mais um mapa fixo no código — a
        // técnica é editável na Academia e pode até ser apagada depois. O treino
        // salvo guarda o nome que valia no dia.
        tecnica: t ? { tipo: t.id, label: t.nome, detalhe: t.resumo || t.objetivo || '' } : null,
      };
    }),
    finalizador: null,
  };
}

async function salvarManual() {
  const dateId = $('#m-data').value || store.dateIdDe();
  const { itens } = volumeAtual();
  if (!itens.length) return;
  const dataTxt = store.dataDe(dateId).toLocaleDateString('pt-BR');
  if (store.getTreino(dateId)) {
    const ok = await confirmar({
      titulo: 'Substituir treino?',
      texto: `Já existe um treino registrado em <b>${dataTxt}</b>. Ele será trocado por este treino manual, no histórico e no Portal do Aluno.`,
      ok: 'Substituir', perigo: true,
    });
    if (!ok) return;
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
