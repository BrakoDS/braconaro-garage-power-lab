// @ts-check
/**
 * TREINO MANUAL — montagem por seleção (sem digitação).
 *
 * O coach escolhe a Classificação/Objetivo no topo, e ela define A ESTRUTURA da
 * tela, não só o filtro de exercícios: blocos na Força e na Hipertrofia, estações
 * TABATA no HIIT, músicas no GAP, postos de bi-set no Híbrido, estações da prova no
 * Hyrox. Quem responde "qual é a forma da modalidade X" é `core/formato-manual.js`;
 * este arquivo é o despachante, e cada formato tem seu editor em `manual-*.js`.
 *
 * O snapshot salvo é o MESMO que o Treino Automático produz para aquela modalidade,
 * então histórico, card do coach e Portal do Aluno exibem sem código próprio.
 *
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 *
 * @typedef {Object} CtxManual
 * @property {ModalidadeId} modalidade
 * @property {any} formato        Descritor de `formatoManual`
 * @property {number} nAlunos
 * @property {number} semana
 * @property {string} dateId
 * @property {Set<string>} usados  IDs já usados em OUTROS dias da mesma semana
 *
 * @typedef {Object} MontagemManual
 * @property {import('../core/volume.js').Volume} vol
 * @property {Object} extra    O que entra no snapshot (ex.: `{hiit: …}`)
 * @property {number} nItens   Quantos itens o coach preencheu (0 = nada a salvar)
 *
 * @typedef {Object} EditorManual
 * @property {(ctx: CtxManual) => string} html
 * @property {(ctx: CtxManual, ev: Event) => boolean} aoMudar  true = precisa re-renderizar
 * @property {(ctx: CtxManual) => void} reset
 * @property {(ctx: CtxManual) => MontagemManual} montar
 * @property {(ctx: CtxManual) => string} [distribuicao]
 */
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import { EXERCICIOS } from '../data/exercicios.js';
import { MOV_GAP_POR_ID } from '../data/gap.js';
import { formatoManual } from '../core/formato-manual.js';
import { duracaoMobilidade } from '../core/gerador.js';
import { idsUsadosEm } from '../core/usados.js';
import * as academia from '../../academia/db.js';
import * as store from './store.js';
import { renderMetaVolume, renderVolume } from './render.js';
import { confirmar } from './dialogo.js';
import { publicarTreino } from './portal-treino.js';

import { editorBlocos } from './manual-blocos.js';
import { editorTabata } from './manual-tabata.js';
import { editorGap } from './manual-gap.js';
import { editorPostos } from './manual-postos.js';
import { editorHyrox } from './manual-hyrox.js';
import { editorMurph } from './manual-murph.js';

/** @type {Record<string, EditorManual>} */
const EDITORES = {
  blocos: editorBlocos,
  tabata4: editorTabata,
  gapMusicas: editorGap,
  postosBiset: editorPostos,
  hyroxEstacoes: editorHyrox,
  murphFixo: editorMurph,
};

export const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- estado da aba ----------
let modalidade = /** @type {ModalidadeId} */ ('forca');

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
export const GAP_COMO_EXERCICIO = Object.fromEntries(
  Object.values(MOV_GAP_POR_ID).map((m) => { const e = movGapComoExercicio(m); return [e.id, e]; })
);

export const porId = (id) => (id?.startsWith(GAP_PREFIXO) ? GAP_COMO_EXERCICIO[id] : EXERCICIOS.find((e) => e.id === id)) || null;

// ---------- utilitários compartilhados pelos editores ----------
export const poolMobilidade = () => EXERCICIOS.filter((e) => e.categorias.includes('mobilidade'));

export function optionsMobilidade(selecionado) {
  const opts = poolMobilidade()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((e) => `<option value="${e.id}"${e.id === selecionado ? ' selected' : ''}>${esc(e.nome)}</option>`)
    .join('');
  return `<option value="">— vazio —</option>${opts}`;
}

/**
 * Lista de exercícios como `<option>`s simples, ordenada por nome.
 * @param {any[]} pool @param {string} selecionado @param {Set<string>} [usados]
 */
export function optionsDe(pool, selecionado, usados) {
  return `<option value="">— vazio —</option>` + [...pool]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    .map((e) => `<option value="${esc(e.id)}"${e.id === selecionado ? ' selected' : ''}>${esc(e.nome)}${usados?.has(e.id) ? ' · já na semana' : ''}</option>`)
    .join('');
}

export const optionsNum = (de, ate, sel, sufixo = '') => {
  let out = '';
  for (let n = de; n <= ate; n++) out += `<option value="${n}"${n === sel ? ' selected' : ''}>${n}${sufixo}</option>`;
  return out;
};

/**
 * Técnicas avançadas: vêm da aba "Técnicas" da Academia (mesma ponte que o catálogo
 * de exercícios usa). O que o coach cadastra lá aparece aqui; desativada não aparece.
 */
export function tecnicasDisponiveis() {
  try {
    return academia.listarTecnicas()
      .filter((t) => t.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  } catch { return []; }
}
export const tecnicaPorId = (id) => tecnicasDisponiveis().find((t) => t.id === id) || null;

export function optionsTecnica(sel) {
  return `<option value="">Nenhuma</option>` + tecnicasDisponiveis()
    .map((t) => `<option value="${esc(t.id)}"${t.id === sel ? ' selected' : ''}>${esc(t.nome)}</option>`).join('');
}

/** Congela a técnica no snapshot: o rótulo vai junto porque ela é editável na
 *  Academia e pode até ser apagada depois — o treino salvo guarda o nome do dia. */
export function tecnicaSalva(id) {
  const t = tecnicaPorId(id);
  return t ? { tipo: t.id, label: t.nome, detalhe: t.resumo || t.objetivo || '' } : null;
}

/** Rótulo do orçamento de mobilidade: quanto as escolhas gastam do tempo previsto. */
function rotuloOrcamento(sel, orcamentoSeg) {
  const gasto = sel.map((id) => (id ? porId(id) : null)).filter(Boolean)
    .reduce((a, e) => a + duracaoMobilidade(e), 0);
  const min = (s) => `${Math.round(s / 60 * 10) / 10} min`.replace('.', ',');
  return {
    estourou: gasto > orcamentoSeg,
    texto: gasto
      ? `≈ ${min(gasto)} de ${min(orcamentoSeg)}${gasto > orcamentoSeg ? ' — passou do previsto' : ''}`
      : `orçamento de ${min(orcamentoSeg)} · 30–60s cada`,
  };
}

/** Bloco de mobilidade: slots + o total gasto contra o orçamento da modalidade. */
export function blocoMobilidade(sel, orcamentoSeg, extraBotao = true) {
  const { texto, estourou } = rotuloOrcamento(sel, orcamentoSeg);
  const linhas = sel.map((id, i) => `
    <div class="man-row man-aquec">
      <span class="man-n">${i + 1}</span>
      <select class="man-sel man-mob" data-i="${i}">${optionsMobilidade(id)}</select>
    </div>`).join('');
  return `
    <h4>Aquecimento / Mobilidade
      <span class="mut man-orc${estourou ? ' warn' : ''}" style="font-weight:400;text-transform:none;letter-spacing:0">— ${texto}</span></h4>
    ${linhas}
    ${extraBotao ? '<button class="btn ghost sm man-add" id="m-add-mob" type="button">+ mobilidade</button>' : ''}`;
}

/**
 * Atualiza SÓ o rótulo do orçamento, sem redesenhar o editor.
 *
 * Escolher uma mobilidade muda um número no cabeçalho, e nada mais. Redesenhar por
 * causa disso descartaria os `<select>` que o coach está usando — na prática, quem
 * preenchesse a segunda mobilidade perderia a primeira do meio da lista.
 */
export function atualizarOrcamentoMob(sel, orcamentoSeg) {
  const alvo = document.querySelector('#m-editor .man-orc');
  if (!alvo) return;
  const { texto, estourou } = rotuloOrcamento(sel, orcamentoSeg);
  alvo.textContent = `— ${texto}`;
  alvo.classList.toggle('warn', estourou);
}

/** As mobilidades escolhidas, no formato do snapshot (mesma forma do automático). */
export function mobilidadeSalva(sel) {
  return sel.map((id) => (id ? porId(id) : null)).filter(Boolean)
    .map((e) => ({
      nome: e.nome, duracaoSeg: duracaoMobilidade(e),
      musculosAlvo: e.musculosPrimarios || [],
    }));
}

// ---------- contexto ----------
const alunosAtual = () => Math.min(20, Math.max(1, Number($('#m-alunos')?.value) || 8));
const semanaAtual = () => Math.min(4, Math.max(1, Number($('#m-semana')?.value) || 1));

/** IDs já usados em OUTROS dias da mesma semana (marcados na lista, mas selecionáveis). */
const idsUsadosNaSemana = (dateId) => idsUsadosEm(store.treinosDaSemana(dateId), dateId);

/** @returns {CtxManual} */
function ctx() {
  const dateId = $('#m-data').value || store.dateIdDe();
  const nAlunos = alunosAtual();
  const semana = semanaAtual();
  return {
    modalidade, nAlunos, semana, dateId,
    formato: formatoManual(modalidade, { nAlunos, semana }),
    usados: idsUsadosNaSemana(dateId),
  };
}

const editorDe = (c) => EDITORES[c.formato.tipo] || EDITORES.blocos;

// ---------- render ----------
function renderEditor() {
  const c = ctx();
  // A semana só governa o Híbrido; mostrá-la nas outras sugeriria um efeito que não existe.
  $('#m-campo-semana').hidden = c.formato.tipo !== 'postosBiset';
  $('#m-editor').innerHTML = `<article class="card">${editorDe(c).html(c)}</article>`;
}

function atualizarPaineis() {
  const c = ctx();
  const editor = editorDe(c);
  const { vol, nItens } = editor.montar(c);

  const volsWeek = store.treinosDaSemana(c.dateId)
    .filter((t) => t.dateId !== c.dateId)
    .map((t) => t.volPorPadrao || {});
  $('#m-meta').innerHTML = renderMetaVolume(volsWeek, nItens ? vol.porPadrao : null);
  $('#m-dist').innerHTML = editor.distribuicao ? editor.distribuicao(c) : '';
  $('#m-vol').innerHTML = nItens
    ? `<article class="card"><h4>Volume por músculo (séries equivalentes)</h4>${renderVolume(vol)}</article>`
    : '';
  renderSalvarBar(c.dateId, nItens > 0);
}

function renderSalvarBar(dateId, temConteudo) {
  const jaTem = store.getTreino(dateId);
  const dataTxt = store.dataDe(dateId).toLocaleDateString('pt-BR');
  $('#m-salvar').innerHTML = temConteudo ? `<div class="card salvar-bar">
    <div>Salvar na data <b>${dataTxt}</b>${jaTem ? ' <span class="chip warn">já há treino nesse dia</span>' : ''} e publicar no <b>Portal do Aluno</b>.</div>
    <button class="btn" id="btn-salvar-manual" type="button">Salvar no histórico</button>
  </div>` : '';
}

// ---------- snapshot ----------
function snapshotManual(c) {
  const { vol, extra } = editorDe(c).montar(c);
  return {
    dia: store.diaSemanaDe(c.dateId),
    modalidade: c.modalidade,
    geradoEm: new Date().toISOString(),
    manual: true,
    volPorPadrao: vol.porPadrao,
    nAlunos: c.nAlunos, // a edição do dia salvo precisa da turma p/ recalcular viabilidade
    ...extra,
  };
}

async function salvarManual() {
  const c = ctx();
  if (!editorDe(c).montar(c).nItens) return;
  const dataTxt = store.dataDe(c.dateId).toLocaleDateString('pt-BR');
  if (store.getTreino(c.dateId)) {
    const ok = await confirmar({
      titulo: 'Substituir treino?',
      texto: `Já existe um treino registrado em <b>${dataTxt}</b>. Ele será trocado por este treino manual, no histórico e no Portal do Aluno.`,
      ok: 'Substituir', perigo: true,
    });
    if (!ok) return;
  }
  const snap = snapshotManual(c);
  store.salvarTreino(c.dateId, snap);
  publicarTreino(c.dateId, snap);
  $('#m-salvar').innerHTML = `<div class="card salvar-bar"><span class="ok">✓ Treino manual salvo em ${dataTxt} e enviado ao Portal do Aluno.</span></div>`;
  // Re-renderiza a meta já contando o treino que acabou de entrar na semana.
  const volsWeek = store.treinosDaSemana(c.dateId).map((t) => t.volPorPadrao || {});
  $('#m-meta').innerHTML = renderMetaVolume(volsWeek, null);
}

// ---------- init ----------
export function initManual() {
  MODALIDADE_IDS.forEach((id) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = MODALIDADES[id].nome;
    $('#m-modalidade').appendChild(o);
  });
  $('#m-data').value = store.dateIdDe();

  const redesenhar = () => { renderEditor(); atualizarPaineis(); };

  redesenhar();

  $('#m-modalidade').addEventListener('change', () => {
    modalidade = /** @type {any} */ ($('#m-modalidade').value);
    // Cada formato guarda seu próprio estado; trocar de modalidade zera o do novo,
    // senão o editor abriria com escolhas de uma estrutura que não existe mais.
    const c = ctx();
    editorDe(c).reset(c);
    redesenhar();
  });

  // Turma e semana mudam a ESTRUTURA no Híbrido (nº de postos, séries, mobilidade),
  // então redesenham o editor, não só os painéis.
  $('#m-alunos').addEventListener('change', redesenhar);
  $('#m-semana').addEventListener('change', redesenhar);
  $('#m-data').addEventListener('change', redesenhar);

  $('#m-limpar').addEventListener('click', () => {
    const c = ctx();
    editorDe(c).reset(c);
    redesenhar();
  });

  // Delegação: qualquer select/checkbox/botão do editor.
  const tratar = (ev) => {
    const c = ctx();
    const precisaRedesenhar = editorDe(c).aoMudar(c, ev);
    if (precisaRedesenhar) renderEditor();
    atualizarPaineis();
  };
  $('#m-editor').addEventListener('change', tratar);
  $('#m-editor').addEventListener('click', (ev) => {
    if (/** @type {HTMLElement} */ (ev.target).closest('button')) tratar(ev);
  });

  $('#m-salvar').addEventListener('click', (ev) => {
    if (/** @type {HTMLElement} */ (ev.target).closest('#btn-salvar-manual')) salvarManual();
  });

  // Ao entrar na aba, re-renderiza (catálogo da Academia pode ter chegado depois).
  document.querySelector('.tab[data-view="manual"]')?.addEventListener('click', redesenhar);
}
