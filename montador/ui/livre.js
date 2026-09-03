// @ts-check
/**
 * TREINO LIVRE — montagem solta.
 *
 * As outras duas abas decidem pelo coach: o Automático gera o dia, e no Manual a
 * modalidade molda a tela (HIIT vira TABATA, GAP vira músicas). Esta aba existe
 * para o caso em que ele já sabe o que quer e nenhuma dessas formas descreve.
 *
 * Por isso ela NÃO é mais um formato do Treino Manual: o despachante de lá
 * existe para a modalidade moldar a tela, e aqui a classificação é só etiqueta.
 *
 * A regra mora em `core/livre.js` (puro, com testes). Este arquivo é a tela.
 */
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import { EXERCICIOS } from '../data/exercicios.js';
import { montarLivre } from '../core/livre.js';
import { idsUsadosEm } from '../core/usados.js';
import { congelarTecnica } from '../core/tecnicas-auto.js';
import * as academia from '../../academia/db.js';
import * as store from './store.js';
import { renderMetaVolume, renderVolume } from './render.js';
import { confirmar } from './dialogo.js';
import { publicarTreino } from './portal-treino.js';

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** O catálogo efetivo já está em EXERCICIOS: `construirCatalogoEfetivo()` o substitui no boot. */
const porId = (id) => EXERCICIOS.find((e) => e.id === id) || null;

/** Estado da aba. Um objeto só, porque a tela inteira se redesenha a partir dele. */
const est = {
  classificacao: 'hipertrofia',
  aquecimento: /** @type {{id:string, duracaoSeg:number}[]} */ ([]),
  blocos: /** @type {any[]} */ ([]),
};

let iniciada = false;

export function iniciarLivre() {
  if (iniciada) return;
  iniciada = true;
  $('#l-modalidade').innerHTML = MODALIDADE_IDS
    .map((id) => `<option value="${id}"${id === est.classificacao ? ' selected' : ''}>${esc(MODALIDADES[id].nome)}</option>`)
    .join('');
  $('#l-data').value = store.dateIdDe();
  if (!est.blocos.length) est.blocos.push(blocoNovo());
  $('#l-modalidade').addEventListener('change', (e) => {
    est.classificacao = /** @type {any} */ (e.target).value;
    render();
  });
  $('#l-data').addEventListener('change', render);
  $('#l-alunos').addEventListener('change', render);
  ligarEventosUmaVez();
  render();
}

/** Bloco novo já nasce com o descanso da classificação — ponto de partida, não imposição. */
function blocoNovo() {
  const m = MODALIDADES[est.classificacao];
  return { nome: '', series: m?.series || 3, reps: m?.reps || '', descansoSeg: m?.descansoSeg || 60, porNivel: true, exercicios: [] };
}

/* ---------- contexto ---------- */
const dateId = () => $('#l-data').value || store.dateIdDe();
const nAlunos = () => Math.min(20, Math.max(1, Number($('#l-alunos')?.value) || 8));
const usados = () => idsUsadosEm(store.treinosDaSemana(dateId()), dateId());

/** Técnicas ativas da Academia, para o seletor de cada linha. */
const tecnicasAtivas = () => academia.listarTecnicas().filter((t) => t.ativo !== false);

/** Normaliza para busca: sem acento, sem caixa — "agach" acha "Agachamento". */
const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- render ---------- */
function render() {
  const u = usados();
  $('#l-corpo').innerHTML = htmlAquecimento() + est.blocos.map((b, i) => htmlBloco(b, i, u)).join('')
    + '<button class="btn ghost lv-add" id="l-add-bloco" type="button">+ bloco</button>';
  renderResumo();
}

function htmlAquecimento() {
  const linhas = est.aquecimento.map((a, i) => `
    <div class="lv-linha" data-aquec="${i}">
      <span class="lv-busca-wrap">
        <input class="lv-busca" data-alvo="aquec" data-i="${i}" type="text" placeholder="Buscar exercício ou mobilidade…"
               value="${esc(a.id ? (porId(a.id)?.nome || '') : '')}" autocomplete="off" />
      </span>
      <label class="lv-campo">seg <input type="number" min="0" step="10" class="lv-dur" data-i="${i}" value="${a.duracaoSeg}" /></label>
      <span></span><span></span>
      <button class="lv-x" data-rm-aquec="${i}" type="button" aria-label="Remover">×</button>
    </div>`).join('');
  return `<section class="lv-sec">
    <div class="lv-sec-h"><h4>Aquecimento / Mobilidade</h4></div>
    ${linhas}
    <button class="btn ghost lv-add" id="l-add-aquec" type="button">+ item</button>
  </section>`;
}

function htmlBloco(b, bi, u) {
  const tecs = tecnicasAtivas();
  const linhas = (b.exercicios || []).map((l, li) => {
    const e = l.id ? porId(l.id) : null;
    const jaNaSemana = e && u.has(e.id) ? '<span class="lv-usado"> · já na semana</span>' : '';
    const opts = ['<option value="">— sem técnica —</option>']
      .concat(tecs.map((t) => `<option value="${esc(t.id)}"${l.tecnica && l.tecnica.tipo === t.id ? ' selected' : ''}>${esc(t.nome)}</option>`))
      .join('');
    return `<div class="lv-linha" data-b="${bi}" data-l="${li}">
      <span class="lv-busca-wrap">
        <input class="lv-busca" data-alvo="ex" data-b="${bi}" data-l="${li}" type="text"
               placeholder="Buscar exercício…" value="${esc(e ? e.nome : '')}" autocomplete="off" />${jaNaSemana}
      </span>
      <input type="number" min="1" class="lv-series" data-b="${bi}" data-l="${li}" value="${l.series ?? ''}" placeholder="${b.series}" />
      <input type="text" class="lv-reps" data-b="${bi}" data-l="${li}" value="${esc(l.reps ?? '')}" placeholder="${esc(b.reps)}" />
      <select class="lv-tec" data-b="${bi}" data-l="${li}">${opts}</select>
      <button class="lv-x" data-rm-linha="${bi}:${li}" type="button" aria-label="Remover">×</button>
    </div>`;
  }).join('');
  return `<section class="lv-sec">
    <div class="lv-sec-h">
      <input class="lv-bloco-nome" data-b="${bi}" type="text" placeholder="Bloco ${bi + 1}" value="${esc(b.nome)}" />
      <label class="lv-campo">séries <input type="number" min="1" class="lv-b-series" data-b="${bi}" value="${b.series}" /></label>
      <label class="lv-campo">reps <input type="text" class="lv-reps lv-b-reps" data-b="${bi}" value="${esc(b.reps)}" /></label>
      <label class="lv-campo">descanso <input type="number" min="0" step="5" class="lv-b-desc" data-b="${bi}" value="${b.descansoSeg}" /></label>
      <label class="lv-nivel" title="Ligado: o número é a âncora do intermediário e os outros níveis escalam. Desligado: vale igual para a turma toda.">
        <input type="checkbox" class="lv-b-nivel" data-b="${bi}" ${b.porNivel ? 'checked' : ''} /> abrir por nível
      </label>
      ${est.blocos.length > 1 ? `<button class="lv-x" data-rm-bloco="${bi}" type="button">remover bloco</button>` : ''}
    </div>
    ${linhas}
    <button class="btn ghost lv-add" data-add-linha="${bi}" type="button">+ exercício</button>
  </section>`;
}

/* ---------- busca ---------- */
/** Fecha qualquer lista de sugestão aberta. */
function fecharSugestoes() {
  document.querySelectorAll('#view-livre .lv-sug').forEach((n) => n.remove());
}

/**
 * Sugestões para um campo de busca. Filtra o catálogo efetivo INTEIRO — sem
 * recorte por modalidade, que é o ponto da aba.
 * @param {HTMLInputElement} input
 */
function abrirSugestoes(input) {
  fecharSugestoes();
  const termo = chave(input.value);
  const u = usados();
  const achados = !termo ? [] : EXERCICIOS
    .filter((e) => chave(e.nome).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    .slice(0, 12);

  const cx = document.createElement('div');
  cx.className = 'lv-sug';
  if (achados.length) {
    cx.innerHTML = achados.map((e) => `<button type="button" data-id="${esc(e.id)}">${esc(e.nome)}${u.has(e.id) ? '<span class="lv-usado"> · já na semana</span>' : ''}</button>`).join('');
  } else if (termo) {
    // A costura para a busca na internet: hoje é um link, amanhã é o convite.
    cx.innerHTML = `<div class="lv-vazio">“${esc(input.value)}” não está na sua biblioteca — cadastre em <a href="../academia/index.html" target="_blank" rel="noopener">/academia</a>.</div>`;
  } else {
    return;
  }
  input.parentElement?.appendChild(cx);
  cx.addEventListener('click', (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('button[data-id]');
    if (!btn) return;
    escolher(input, /** @type {HTMLElement} */ (btn).dataset.id || '');
  });
}

/** Grava o exercício escolhido no estado e redesenha. */
function escolher(input, id) {
  const d = input.dataset;
  if (d.alvo === 'aquec') est.aquecimento[Number(d.i)].id = id;
  else est.blocos[Number(d.b)].exercicios[Number(d.l)].id = id;
  fecharSugestoes();
  render();
}

/* ---------- eventos ----------
   TUDO delegado na seção, e ligado UMA vez em `ligarEventosUmaVez()`.
   `render()` troca o innerHTML de `#l-corpo` a cada tecla de séries; se os
   listeners fossem religados ali, cada render empilharia mais um, e depois de
   dez ajustes o mesmo clique rodaria dez vezes. */
let eventosLigados = false;

function ligarEventosUmaVez() {
  if (eventosLigados) return;
  eventosLigados = true;
  const raiz = $('#view-livre');
  raiz.addEventListener('input', (ev) => {
    const el = /** @type {HTMLElement} */ (ev.target);
    if (el.classList.contains('lv-busca')) abrirSugestoes(/** @type {any} */ (el));
  });
  // `focusin` e não `focus`: só ele borbulha até a seção.
  raiz.addEventListener('focusin', (ev) => {
    const el = /** @type {HTMLElement} */ (ev.target);
    if (el.classList.contains('lv-busca')) abrirSugestoes(/** @type {any} */ (el));
  });
  raiz.addEventListener('change', aoMudar);
  raiz.addEventListener('click', aoClicar);
  // Clicar fora fecha a lista. Fica no documento porque o clique pode ser em
  // qualquer lugar da página, não só dentro da aba.
  document.addEventListener('click', (ev) => {
    if (!(/** @type {HTMLElement} */ (ev.target).closest('.lv-busca-wrap'))) fecharSugestoes();
  });
}

function aoMudar(ev) {
  const el = /** @type {HTMLInputElement} */ (ev.target);
  const d = el.dataset;
  if (el.classList.contains('lv-dur')) { est.aquecimento[Number(d.i)].duracaoSeg = Number(el.value) || 0; renderResumo(); return; }
  if (el.classList.contains('lv-bloco-nome')) { est.blocos[Number(d.b)].nome = el.value; return; }
  if (el.classList.contains('lv-b-series')) { est.blocos[Number(d.b)].series = el.value; render(); return; }
  if (el.classList.contains('lv-b-reps')) { est.blocos[Number(d.b)].reps = el.value; render(); return; }
  if (el.classList.contains('lv-b-desc')) { est.blocos[Number(d.b)].descansoSeg = el.value; renderResumo(); return; }
  if (el.classList.contains('lv-b-nivel')) { est.blocos[Number(d.b)].porNivel = el.checked; renderResumo(); return; }
  if (el.classList.contains('lv-series')) { est.blocos[Number(d.b)].exercicios[Number(d.l)].series = el.value; renderResumo(); return; }
  if (el.classList.contains('lv-reps') && d.l != null) { est.blocos[Number(d.b)].exercicios[Number(d.l)].reps = el.value; return; }
  if (el.classList.contains('lv-tec')) {
    const t = tecnicasAtivas().find((x) => x.id === el.value);
    est.blocos[Number(d.b)].exercicios[Number(d.l)].tecnica = t ? congelarTecnica(t) : null;
  }
}

function aoClicar(ev) {
  const alvo = /** @type {HTMLElement} */ (ev.target);
  if (alvo.closest('#l-add-aquec')) { est.aquecimento.push({ id: '', duracaoSeg: 60 }); render(); return; }
  if (alvo.closest('#l-add-bloco')) { est.blocos.push(blocoNovo()); render(); return; }
  const el = alvo.closest('[data-add-linha],[data-rm-linha],[data-rm-bloco],[data-rm-aquec]');
  if (!el) return;
  const d = /** @type {HTMLElement} */ (el).dataset;
  if (d.addLinha != null) est.blocos[Number(d.addLinha)].exercicios.push({ id: '' });
  else if (d.rmLinha) { const [b, l] = d.rmLinha.split(':').map(Number); est.blocos[b].exercicios.splice(l, 1); }
  else if (d.rmBloco != null) est.blocos.splice(Number(d.rmBloco), 1);
  else if (d.rmAquec != null) est.aquecimento.splice(Number(d.rmAquec), 1);
  render();
}

/* ---------- resumo (meta, volume, barra de salvar) ---------- */
function montagem() {
  return montarLivre({ classificacao: est.classificacao, aquecimento: est.aquecimento, blocos: est.blocos, porId });
}

function renderResumo() {
  const { vol, nItens } = montagem();
  const daSemana = store.treinosDaSemana(dateId()).filter((t) => t.dateId !== dateId()).map((t) => t.volPorPadrao);
  $('#l-meta').innerHTML = renderMetaVolume(daSemana, vol.porPadrao);
  $('#l-volume').innerHTML = nItens
    ? `<article class="card"><h4>Volume por músculo (séries equivalentes)</h4>${renderVolume(vol)}</article>`
    : '';
}
