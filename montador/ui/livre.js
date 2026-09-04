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
import { FORMATOS_WOD, DESCRICAO_FORMATO, DESCRICAO_EMOM_ROTACAO } from '../config/wod-formatos.js';

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** O catálogo efetivo já está em EXERCICIOS: `construirCatalogoEfetivo()` o substitui no boot. */
const porId = (id) => EXERCICIOS.find((e) => e.id === id) || null;

/** Estado da aba. Um objeto só, porque a tela inteira se redesenha a partir dele.
 * NÃO é exportado: `linhasIncompletas(blocos)` recebe os blocos por parâmetro,
 * então o teste de paridade chama a função de verdade sem que ninguém de fora
 * possa mexer no estado da aba. */
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

/** Bloco novo já nasce com o descanso da classificação — ponto de partida, não imposição.
 * Os campos de WOD (formato/duração/rodadas) vêm de fábrica mesmo num bloco de
 * série: assim trocar o alternador de tipo nunca precisa inicializar nada — só
 * troca qual metade dos campos a tela mostra e o core lê. */
function blocoNovo() {
  const m = MODALIDADES[est.classificacao];
  return {
    tipo: 'series',
    nome: '', series: m?.series || 3, reps: m?.reps || '', descansoSeg: m?.descansoSeg || 60, porNivel: true,
    formato: 'AMRAP', duracaoMin: 16, rodadas: '',
    exercicios: [],
  };
}

/* ---------- contexto ---------- */
const dateId = () => $('#l-data').value || store.dateIdDe();
const nAlunos = () => Math.min(20, Math.max(1, Number($('#l-alunos')?.value) || 8));
const usados = () => idsUsadosEm(store.treinosDaSemana(dateId()), dateId());

/** Técnicas ativas da Academia, para o seletor de cada linha. */
const tecnicasAtivas = () => academia.listarTecnicas().filter((t) => t.ativo !== false);

/** Normaliza para busca: sem acento, sem caixa — "agach" acha "Agachamento". */
const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- grupos (bi-set) ----------
   Cópia deliberada da regra de agrupamento de `core/livre.js` — não import,
   porque esta tela decide o que aparece (botão de corrente, série travada,
   aviso da barra de salvar) antes de existir snapshot nenhum. As duas cópias
   têm que dar exatamente a mesma resposta, ou o aviso mente pro coach: foi
   esse o bug caro da leva anterior desta aba. */

/** Número a partir de campo de formulário (vem string), ou null se não der. Mesma regra de `core/livre.js`.
 * Exportada (com `herdar`, `gruposDoBloco` e `linhasIncompletas`) para o teste de
 * paridade em `livre.test.js` — sem export, a única forma de testar essa regra
 * era copiá-la de novo, e uma cópia só prova a cópia, nunca o arquivo real. */
export function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** O primeiro valor definido da linha, senão o do bloco. Mesma regra de `core/livre.js`. */
export const herdar = (daLinha, doBloco) => (daLinha === undefined || daLinha === null || daLinha === '' ? doBloco : daLinha);

/**
 * Agrupa as linhas de um bloco exatamente como `montarLivre` agrupa: só linhas
 * com exercício válido entram, a primeira delas nunca linka (não há a quem), e
 * a série do grupo é a da primeira linha (o líder).
 * @param {any} b
 * @returns {{membros: {l:any, li:number, e:any}[], series: number|null}[]}
 */
export function gruposDoBloco(b) {
  // O core desvia bloco de WOD para `montarBlocoWod`, que nem olha para série —
  // aplicar a regra de série aqui acusaria "incompleto" um bloco que o core já
  // salva normalmente (achado da revisão da Task 3). Nenhum grupo de bi-set
  // existe num WOD, então a resposta certa é a lista vazia, espelhando o core.
  if (b && b.tipo === 'wod') return [];
  const validas = [];
  (b.exercicios || []).forEach((l, li) => {
    const e = l && l.id ? porId(l.id) : null;
    if (e) validas.push({ l, li, e });
  });
  const grupos = [];
  validas.forEach((item, idx) => {
    if (idx === 0 || !item.l.linkado) grupos.push({ membros: [] });
    grupos[grupos.length - 1].membros.push(item);
  });
  return grupos.map((g) => ({ membros: g.membros, series: num(herdar(g.membros[0].l.series, b.series)) }));
}

/** Rótulo pelo tamanho do grupo — a etiqueta que o coach reconhece de cabeça. */
function rotuloGrupo(tamanho) {
  if (tamanho === 2) return 'Bi-set';
  if (tamanho === 3) return 'Tri-set';
  return 'Série gigante';
}

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
      <span class="lv-link-vazio" aria-hidden="true"></span>
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
  // O alternador é do cabeçalho dos dois tipos — monta uma vez e injeta em
  // qualquer um dos dois HTMLs abaixo.
  const tipo = b.tipo === 'wod' ? 'wod' : 'series';
  const tipoBtns = `<div class="lv-tipo" role="group" aria-label="Tipo do bloco">
      <button type="button" class="${tipo === 'series' ? 'lv-tipo-on' : ''}" data-set-tipo="series" data-b="${bi}">séries</button>
      <button type="button" class="${tipo === 'wod' ? 'lv-tipo-on' : ''}" data-set-tipo="wod" data-b="${bi}">WOD</button>
    </div>`;
  return tipo === 'wod' ? htmlBlocoWod(b, bi, u, tipoBtns) : htmlBlocoSeries(b, bi, u, tipoBtns);
}

function htmlBlocoSeries(b, bi, u, tipoBtns) {
  const tecs = tecnicasAtivas();
  // Mesmo agrupamento que `montarLivre` vai fazer — decide o botão de
  // corrente, o campo de série travado e a etiqueta, antes de existir
  // snapshot nenhum.
  const infoPorLinha = new Map();
  gruposDoBloco(b).forEach((g) => {
    g.membros.forEach(({ li }, idx) => {
      infoPorLinha.set(li, { ehLider: idx === 0, tamanho: g.membros.length, series: g.series });
    });
  });
  const linhas = (b.exercicios || []).map((l, li) => {
    const e = l.id ? porId(l.id) : null;
    const jaNaSemana = e && u.has(e.id) ? '<span class="lv-usado"> · já na semana</span>' : '';
    const opts = ['<option value="">— sem técnica —</option>']
      .concat(tecs.map((t) => `<option value="${esc(t.id)}"${l.tecnica && l.tecnica.tipo === t.id ? ' selected' : ''}>${esc(t.nome)}</option>`))
      .join('');
    const info = infoPorLinha.get(li);
    // Segue o líder: não tem série própria, mostra a dele e trava o campo — um
    // campo vazio ali mentiria pro coach sobre o que vai valer pro aluno.
    const seguidor = !!(info && !info.ehLider);
    // Botão de corrente só a partir da 2ª linha (não há a quem linkar na
    // primeira); um espaço vazio mantém as colunas alinhadas nas demais.
    // O aceso segue `seguidor` (participação REAL no grupo), não `l.linkado`
    // cru: linkar uma linha cujo líder ainda não tem exercício escolhido deixa
    // a corrente inerte, e mostrá-la acesa ali mentiria — achado da revisão da
    // Task 3. `l.linkado` continua sendo o dado que o clique alterna; só o
    // destaque visual muda.
    const linkBtn = li > 0
      ? `<button type="button" class="lv-link${seguidor ? ' lv-link-on' : ''}" data-link="${bi}:${li}"
          title="Linkar com a linha de cima — bi-set: alterna com a parceira a cada série">⛓</button>`
      : '<span class="lv-link-vazio" aria-hidden="true"></span>';
    const tag = info && info.ehLider && info.tamanho >= 2
      ? `<span class="lv-grupo-tag">${rotuloGrupo(info.tamanho)}</span>` : '';
    const seriesVal = seguidor ? (info.series > 0 ? info.series : '') : (l.series ?? '');
    return `<div class="lv-linha${seguidor ? ' lv-linkada' : ''}" data-b="${bi}" data-l="${li}">
      ${linkBtn}
      <span class="lv-busca-wrap">
        <input class="lv-busca" data-alvo="ex" data-b="${bi}" data-l="${li}" type="text"
               placeholder="Buscar exercício…" value="${esc(e ? e.nome : '')}" autocomplete="off" />${tag}${jaNaSemana}
      </span>
      <input type="number" min="1" class="lv-series" data-b="${bi}" data-l="${li}" value="${seriesVal}" placeholder="${b.series}"${seguidor ? ' disabled' : ''} />
      <input type="text" class="lv-reps" data-b="${bi}" data-l="${li}" value="${esc(l.reps ?? '')}" placeholder="${esc(b.reps)}" />
      <select class="lv-tec" data-b="${bi}" data-l="${li}">${opts}</select>
      <button class="lv-x" data-rm-linha="${bi}:${li}" type="button" aria-label="Remover">×</button>
    </div>`;
  }).join('');
  return `<section class="lv-sec">
    <div class="lv-sec-h">
      <input class="lv-bloco-nome" data-b="${bi}" type="text" placeholder="Bloco ${bi + 1}" value="${esc(b.nome)}" />
      ${tipoBtns}
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

/** Texto de ajuda do bloco de WOD: a descrição do formato e, só no EMOM, a
 * conta da rotação por minuto (decisão do coach — ver DESCRICAO_EMOM_ROTACAO
 * em config/wod-formatos.js). Espelha a mesma escolha de texto que o core faz
 * em `montarBlocoWod`, para a tela nunca prometer uma execução e o card
 * salvo mostrar outra. */
function htmlWodAjuda(b) {
  const formato = FORMATOS_WOD.includes(b.formato) ? b.formato : 'AMRAP';
  const desc = formato === 'EMOM' ? DESCRICAO_EMOM_ROTACAO : DESCRICAO_FORMATO[formato];
  let conta = '';
  if (formato === 'EMOM') {
    // n = quantos movimentos já têm exercício escolhido — uma linha vazia não
    // ocupa minuto nenhum na rotação. Sem nenhum movimento a conta não existe
    // (não dá pra dividir por zero, e não há o que mostrar ainda).
    // `porId` e não só `l.id`: um id que não resolve mais no catálogo (exercício
    // apagado da Academia depois do rascunho) não vira movimento no core, e a
    // conta na tela contaria um minuto que não existe.
    const n = (b.exercicios || []).filter((l) => l.id && porId(l.id)).length;
    const d = Math.max(0, Math.round(num(b.duracaoMin) || 0));
    if (n > 0) {
      const voltas = Math.floor(d / n);
      const resto = d % n;
      conta = ` Com ${d} min e ${n} movimento${n === 1 ? '' : 's'}: ${voltas} volta${voltas === 1 ? '' : 's'} completa${voltas === 1 ? '' : 's'}`
        + (resto ? ', a última fica pela metade' : '') + '.';
    }
  }
  return `<div class="lv-wod-ajuda">${esc(desc)}${conta}</div>`;
}

function htmlBlocoWod(b, bi, u, tipoBtns) {
  const formato = FORMATOS_WOD.includes(b.formato) ? b.formato : 'AMRAP';
  const opts = FORMATOS_WOD.map((f) => `<option value="${f}"${f === formato ? ' selected' : ''}>${f}</option>`).join('');
  const linhas = (b.exercicios || []).map((l, li) => {
    const e = l.id ? porId(l.id) : null;
    const jaNaSemana = e && u.has(e.id) ? '<span class="lv-usado"> · já na semana</span>' : '';
    return `<div class="lv-linha-wod" data-b="${bi}" data-l="${li}">
      <span class="lv-busca-wrap">
        <input class="lv-busca" data-alvo="ex" data-b="${bi}" data-l="${li}" type="text"
               placeholder="Buscar exercício…" value="${esc(e ? e.nome : '')}" autocomplete="off" />${jaNaSemana}
      </span>
      <input type="text" class="lv-prescricao" data-b="${bi}" data-l="${li}" value="${esc(l.prescricao ?? '')}" placeholder="12 reps · 200m · 10 cal" />
      <button class="lv-x" data-rm-linha="${bi}:${li}" type="button" aria-label="Remover">×</button>
    </div>`;
  }).join('');
  return `<section class="lv-sec">
    <div class="lv-sec-h">
      <input class="lv-bloco-nome" data-b="${bi}" type="text" placeholder="WOD" value="${esc(b.nome)}" />
      ${tipoBtns}
      <label class="lv-campo">formato <select class="lv-wod-formato" data-b="${bi}">${opts}</select></label>
      <label class="lv-campo">duração (min) <input type="number" min="0" class="lv-wod-duracao" data-b="${bi}" value="${b.duracaoMin ?? 16}" /></label>
      ${formato === 'For Time' ? `<label class="lv-campo">rodadas <input type="number" min="0" class="lv-wod-rodadas" data-b="${bi}" value="${b.rodadas ?? ''}" /></label>` : ''}
      ${est.blocos.length > 1 ? `<button class="lv-x" data-rm-bloco="${bi}" type="button">remover bloco</button>` : ''}
    </div>
    ${htmlWodAjuda(b)}
    ${linhas}
    <button class="btn ghost lv-add" data-add-linha="${bi}" type="button">+ movimento</button>
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
   `render()` troca o innerHTML de `#l-corpo` a cada busca digitada e a cada
   troca de bloco/linha (`change`, no blur/commit — não a cada tecla de séries
   ou reps); se os listeners fossem religados ali, cada render empilharia mais
   um, e depois de dez ajustes o mesmo clique rodaria dez vezes. */
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
    return;
  }
  // Formato e duração mudam a linha de ajuda (conta do EMOM) e o campo de
  // rodadas (só existe no For Time) — precisam de render() inteiro, não só
  // do resumo. Rodadas não muda nada visível além do próprio campo.
  if (el.classList.contains('lv-wod-formato')) { est.blocos[Number(d.b)].formato = el.value; render(); return; }
  if (el.classList.contains('lv-wod-duracao')) { est.blocos[Number(d.b)].duracaoMin = el.value; render(); return; }
  if (el.classList.contains('lv-wod-rodadas')) { est.blocos[Number(d.b)].rodadas = el.value; renderResumo(); return; }
  if (el.classList.contains('lv-prescricao')) { est.blocos[Number(d.b)].exercicios[Number(d.l)].prescricao = el.value; renderResumo(); return; }
}

/** Fecha o buraco sem deixar corrente pendurada no vazio: se a linha removida
 * era a cabeça de um grupo de 2+, o próximo membro vira a nova cabeça — e a
 * primeira linha do bloco nunca pode ficar linkada (não há a quem, ali). */
function removerLinha(bi, li) {
  const arr = est.blocos[bi].exercicios;
  const grupo = gruposDoBloco(est.blocos[bi]).find((g) => g.membros[0].li === li);
  if (grupo && grupo.membros.length >= 2) grupo.membros[1].l.linkado = false;
  arr.splice(li, 1);
  if (arr[0]) arr[0].linkado = false;
}

function aoClicar(ev) {
  const alvo = /** @type {HTMLElement} */ (ev.target);
  if (alvo.closest('#l-add-aquec')) { est.aquecimento.push({ id: '', duracaoSeg: 60 }); render(); return; }
  if (alvo.closest('#l-add-bloco')) { est.blocos.push(blocoNovo()); render(); return; }
  const el = alvo.closest('[data-add-linha],[data-rm-linha],[data-rm-bloco],[data-rm-aquec],[data-link],[data-set-tipo]');
  if (!el) return;
  const d = /** @type {HTMLElement} */ (el).dataset;
  if (d.addLinha != null) est.blocos[Number(d.addLinha)].exercicios.push({ id: '' });
  else if (d.rmLinha) { const [b, l] = d.rmLinha.split(':').map(Number); removerLinha(b, l); }
  else if (d.rmBloco != null) est.blocos.splice(Number(d.rmBloco), 1);
  else if (d.rmAquec != null) est.aquecimento.splice(Number(d.rmAquec), 1);
  else if (d.link) { const [b, l] = d.link.split(':').map(Number); const ex = est.blocos[b].exercicios[l]; ex.linkado = !ex.linkado; }
  // Trocar o tipo só troca o rótulo — as duas metades de campo (série/wod)
  // continuam no mesmo objeto de linha/bloco, nunca apagadas: é assim que a
  // ida e volta entre os dois tipos não perde nada que o coach já digitou.
  else if (d.setTipo) est.blocos[Number(d.b)].tipo = d.setTipo;
  render();
}

/* ---------- resumo (meta, volume, barra de salvar) ---------- */
function montagem() {
  return montarLivre({ classificacao: est.classificacao, aquecimento: est.aquecimento, blocos: est.blocos, porId });
}

function renderResumo() {
  const { vol, nItens } = montagem();
  const daSemana = store.treinosDaSemana(dateId()).filter((t) => t.dateId !== dateId()).map((t) => t.volPorPadrao || {});
  $('#l-meta').innerHTML = renderMetaVolume(daSemana, vol.porPadrao);
  $('#l-volume').innerHTML = nItens
    ? `<article class="card"><h4>Volume por músculo (séries equivalentes)</h4>${renderVolume(vol)}</article>`
    : '';
  renderSalvar(nItens);
}

/* ---------- salvar ---------- */
/** Linhas cujo GRUPO não vai ter série que preste — o coach precisa saber
 * quais. Mesma regra de agrupamento de `montarLivre`: quem decide é o líder,
 * e se a série dele não presta o grupo INTEIRO cai, não só ele — por isso o
 * aviso nomeia todas as linhas do grupo, não só a primeira. Divergir daria um
 * aviso que mente: foi o bug caro da leva anterior desta aba. */
export function linhasIncompletas(blocos = est.blocos) {
  const fora = [];
  blocos.forEach((b, bi) => {
    const nome = String(b.nome || '').trim() || `Bloco ${bi + 1}`;
    // `gruposDoBloco` já devolve [] para bloco de WOD — nada aqui precisa saber
    // que WOD existe, e é exatamente por isso que os dois nunca podem divergir
    // de novo (achado da revisão da Task 3).
    gruposDoBloco(b).forEach((g) => {
      if (g.series > 0) return;
      g.membros.forEach(({ li }) => fora.push(`${nome} · linha ${li + 1}`));
    });
  });
  return fora;
}

/** Movimentos de bloco WOD sem prescrição — aviso PRÓPRIO, separado de
 * `linhasIncompletas` (que fala de série, e WOD não tem série). É aviso, não
 * bloqueio: o core salva o movimento mesmo com `prescricao: ''` (o coach pode
 * querer só o nome, tipo "burpee"), então a tela avisa mas não descarta nada. */
function wodsSemPrescricao() {
  const fora = [];
  est.blocos.forEach((b) => {
    if (b.tipo !== 'wod') return;
    (b.exercicios || []).forEach((l) => {
      const e = l && l.id ? porId(l.id) : null;
      if (e && !String(l.prescricao ?? '').trim()) fora.push(e.nome);
    });
  });
  return fora;
}

function renderSalvar(nItens) {
  const d = dateId();
  const jaTem = store.getTreino(d);
  const dataTxt = store.dataDe(d).toLocaleDateString('pt-BR');
  const incompletas = linhasIncompletas();
  const semPrescricao = wodsSemPrescricao();
  $('#l-salvar').innerHTML = nItens ? `<div class="card salvar-bar">
    <div>Salvar na data <b>${dataTxt}</b>${jaTem ? ' <span class="chip warn">já há treino nesse dia</span>' : ''} e publicar no <b>Portal do Aluno</b>.
      ${incompletas.length ? `<div class="lv-aviso">Sem séries, não vão para o aluno: ${esc(incompletas.join(', '))}.</div>` : ''}
      ${semPrescricao.length ? `<div class="lv-aviso">Sem prescrição, o aluno vê só o nome: ${esc(semPrescricao.join(', '))}.</div>` : ''}
    </div>
    <button class="btn" id="btn-salvar-livre" type="button">Salvar no histórico</button>
  </div>` : '';
  $('#btn-salvar-livre')?.addEventListener('click', salvar);
}

function snapshot() {
  const { vol, extra } = montagem();
  return {
    dia: store.diaSemanaDe(dateId()),
    modalidade: est.classificacao,
    geradoEm: new Date().toISOString(),
    manual: true,
    volPorPadrao: vol.porPadrao,
    nAlunos: nAlunos(), // a edição do dia salvo precisa da turma p/ recalcular viabilidade
    ...extra,
  };
}

async function salvar() {
  const d = dateId();
  if (!montagem().nItens) return;
  const dataTxt = store.dataDe(d).toLocaleDateString('pt-BR');
  if (store.getTreino(d)) {
    const ok = await confirmar({
      titulo: 'Substituir treino?',
      texto: `Já existe um treino registrado em <b>${dataTxt}</b>. Ele será trocado por este treino livre, no histórico e no Portal do Aluno.`,
      ok: 'Substituir', perigo: true,
    });
    if (!ok) return;
  }
  const snap = snapshot();
  store.salvarTreino(d, snap);
  publicarTreino(d, snap);
  $('#l-salvar').innerHTML = `<div class="card salvar-bar"><span class="ok">✓ Treino livre salvo em ${dataTxt} e enviado ao Portal do Aluno.</span></div>`;
  // Redesenha só a meta, contando o treino que acabou de entrar na semana.
  // NÃO chama renderResumo(): ele termina redesenhando #l-salvar de volta pra
  // barra normal, e o navegador só pinta o estado final — a confirmação acima
  // nunca apareceria na tela.
  const daSemana = store.treinosDaSemana(d).map((t) => t.volPorPadrao || {});
  $('#l-meta').innerHTML = renderMetaVolume(daSemana, null);
}
