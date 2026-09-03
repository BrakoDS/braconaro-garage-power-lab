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

function render() {
  $('#l-corpo').innerHTML = '<div class="mut">Em construção.</div>';
}

/** Delegação de eventos do corpo: liga uma vez ao contêiner estável, porque
 * render() troca o innerHTML a cada redesenho e listeners diretos morreriam
 * junto. Vazio aqui — a Task 5 preenche quando o corpo ganha blocos. */
function ligarEventosUmaVez() {}
