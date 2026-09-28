// @ts-check
/**
 * A TELA do Montador Individual: uma só, com o treino do dia, e um histórico
 * por mês ao lado.
 *
 * Nesta etapa (3) o treino é o da turma — o mesmo para todos. A coluna dos
 * alunos, o cadeado valendo e o Publicar entram na Etapa 4, em cima deste mesmo
 * treino base. O que já está aqui e é de propósito: o campo `travado` da linha,
 * gravado desde agora, para a Etapa 4 não precisar mexer em treino já salvo.
 *
 * Sem framework, como o resto do projeto: render inteiro do que mudou e
 * delegação de evento no container.
 */
import { ESTRUTURAS, ESTRUTURA_IDS, estruturaDe } from '../../../compartilhado/config/estruturas.js';
import { EXERCICIOS, EXERCICIO_POR_ID } from '../../../compartilhado/dados/exercicios.js';
import { MUSC_MAP } from '../../../compartilhado/config/musculos.js';
import { PADRAO_LABEL } from '../../../compartilhado/config/padroes.js';
import { GRUPO_LABEL, GRUPOS } from '../../../compartilhado/regras/grupos.js';
import { idsUsadosEm } from '../../../compartilhado/regras/usados.js';
import { confirmar } from '../../../compartilhado/ui/dialogo.js';
import {
  treinoNovo, trocarEstrutura, linhaNova, blocoNovo,
  volumeDoTreino, paraSalvar,
} from '../core/treino-base.js';
import * as store from './store.js';
import { renderTurma, abrirAluno, recarregarAjustes, trocasPorAluno, mesDoAluno } from './turma.js';
import { listarAlunos } from './alunos.js';
import { salvarTrocas } from '../cloud-aluno.js';
import { paraPortal, temConteudoParaPortal } from '../core/para-portal.js';
import { publicarTreino, lerDiaPublicado } from '../../../compartilhado/firebase/treino-portal.js';

const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const esc = (/** @type {any} */ v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Número curto: 7 em vez de 7,0; 7,5 em vez de 7,50. */
const num = (/** @type {number} */ n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** @type {import('../core/treino-base.js').TreinoBase} */
let treino;

// ---------- montagem inicial ----------
const selEstrutura = /** @type {HTMLSelectElement} */ ($('#f-estrutura'));
selEstrutura.innerHTML = ESTRUTURA_IDS.map((id) => `<option value="${id}">${esc(ESTRUTURAS[id].label)}</option>`).join('');

const inpData = /** @type {HTMLInputElement} */ ($('#f-data'));
const inpAlunos = /** @type {HTMLInputElement} */ ($('#f-alunos'));

/** Catálogo efetivo no datalist — é por ele que o coach escolhe o exercício. */
function encherDatalist() {
  const dl = $('#dl-exercicios');
  dl.innerHTML = EXERCICIOS.map((e) => `<option value="${esc(e.nome)}"></option>`).join('');
}

/** Exercício do catálogo pelo nome digitado (sem diferenciar acento de caixa). */
const chave = (/** @type {string} */ s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
function acharPorNome(nome) {
  const k = chave(nome);
  return EXERCICIOS.find((e) => chave(e.nome) === k) || null;
}

// ---------- estado da tela ----------
function carregarDia(dateId) {
  const salvo = store.getTreino(dateId);
  treino = salvo
    ? /** @type {any} */ ({ ...treinoNovo({ dateId }), ...salvo })
    : treinoNovo({ dateId, estrutura: selEstrutura.value, nAlunos: Number(inpAlunos.value) || 8 });
  selEstrutura.value = treino.estrutura;
  inpAlunos.value = String(treino.nAlunos);
  render();
  avisar(salvo ? 'Treino salvo nesta data — editando o que já existe.' : '');
  // As exceções são por dia: trocar a data troca o conjunto inteiro. Uma leitura
  // por aluno aqui, e não a cada tecla — a turma redesenha o tempo todo.
  recarregarAjustes(dateId).then(desenharTurma).catch((e) => console.warn('Ajustes do dia:', e));
}

function avisar(texto, tipo = '') {
  const el = $('#aviso-salvo');
  el.textContent = texto;
  el.className = `aviso ${tipo}`;
}

// ---------- render ----------
function render() {
  $('#f-dica').textContent = estruturaDe(treino.estrutura).desc;
  renderAquecimento();
  renderBlocos();
  renderResumo();
  desenharTurma();
}

/** A turma é derivada do treino base e das fichas — redesenha junto com o resumo. */
let _turma = [];
function desenharTurma() {
  try {
    _turma = renderTurma($('#turma'), treino);
  } catch (e) {
    // A turma vem da Gestão: sem ela (offline, sem permissão), o coach ainda monta
    // o treino. Derrubar a tela inteira por causa da coluna seria desproporcional.
    console.warn('Turma indisponível:', e);
    $('#turma').innerHTML = '<p class="vazio">Não deu para montar a turma agora. O treino continua editável.</p>';
  }
}

$('#turma').addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-acao="ver"]');
  if (!btn) return;
  const i = Number(btn.closest('[data-aluno]')?.getAttribute('data-aluno'));
  if (_turma[i]) abrirAluno(_turma[i], treino.dateId, () => render());
});

function renderAquecimento() {
  const lista = $('#lista-aquecimento');
  if (!treino.aquecimento.length) { lista.innerHTML = '<p class="vazio">Sem aquecimento neste dia.</p>'; return; }
  lista.innerHTML = treino.aquecimento.map((a, i) => `
    <div class="linha" data-aq="${i}">
      <span class="num">${i + 1}</span>
      <input class="nome" list="dl-exercicios" data-campo="nome" value="${esc(a.nome)}" placeholder="mobilidade de quadril" />
      <input class="campo" type="number" min="0" step="10" data-campo="duracaoSeg" value="${a.duracaoSeg ?? 90}" title="segundos" />
      <span class="marca ok">seg</span>
      <button class="x" data-acao="rm-aq" title="Remover">×</button>
    </div>`).join('');
}

/** Campos que cada estrutura mostra na linha. */
function camposDaLinha(l) {
  if (estruturaDe(treino.estrutura).contagem === 'series') {
    return `
      <input class="campo" type="number" min="0" max="20" data-campo="series" value="${l.series ?? 3}" title="séries" />
      <input class="campo largo" data-campo="reps" value="${esc(l.reps ?? '8–12')}" title="repetições" />
      <input class="campo" type="number" min="0" step="15" data-campo="descansoSeg" value="${l.descansoSeg ?? 75}" title="descanso (s)" />`;
  }
  if (l.duracaoSeg !== undefined) {
    return `<input class="campo largo" type="number" min="0" step="30" data-campo="duracaoSeg" value="${l.duracaoSeg}" title="duração (s)" />`;
  }
  return `
    <input class="campo" type="number" min="0" max="60" data-campo="rounds" value="${l.rounds ?? 8}" title="rounds" />
    <input class="campo" type="number" min="0" step="5" data-campo="trabalhoSeg" value="${l.trabalhoSeg ?? 20}" title="trabalho (s)" />
    <input class="campo" type="number" min="0" step="5" data-campo="descansoSeg" value="${l.descansoSeg ?? 10}" title="descanso (s)" />`;
}

function renderBlocos() {
  // Aviso de repetição: o que já foi usado nos OUTROS dias da mesma semana.
  const usados = idsUsadosEm(store.treinosDaSemana(treino.dateId).map(paraFormatoUsados), treino.dateId);
  $('#blocos').innerHTML = treino.blocos.map((b, bi) => `
    <section class="bloco" data-bloco="${bi}">
      <div class="bloco-cab">
        <input class="nome-bloco" data-campo="nome-bloco" value="${esc(b.nome)}" />
        <div class="espaco">
          <button class="btn ghost btn-sm" data-acao="add-linha">+ exercício</button>
          <button class="btn ghost btn-sm perigo" data-acao="rm-bloco">Remover bloco</button>
        </div>
      </div>
      <div class="linhas">
        ${b.exercicios.length ? b.exercicios.map((l, li) => linhaHTML(l, li, usados)).join('') : '<p class="vazio">Nenhum exercício ainda. Use “+ exercício”.</p>'}
      </div>
    </section>`).join('');
}

/** @param {any} l @param {number} li @param {Set<string>} usados `idsUsadosEm` devolve Set, não lista */
function linhaHTML(l, li, usados) {
  const repetido = l.id && usados.has(l.id);
  return `
    <div class="linha ${repetido ? 'repetido' : ''}" data-linha="${li}">
      <span class="num">${li + 1}</span>
      <input class="nome" list="dl-exercicios" data-campo="nome" value="${esc(l.nome)}" placeholder="digite o exercício" />
      ${camposDaLinha(l)}
      <button class="trava ${l.travado ? 'on' : ''}" data-acao="travar" title="${l.travado ? 'Travado: igual para todos' : 'Destravado'}">${l.travado ? '🔒' : '🔓'}</button>
      ${repetido ? '<span class="marca">já na semana</span>' : ''}
      ${l.nome && !l.id ? '<span class="marca">fora do catálogo</span>' : ''}
      <button class="x" data-acao="rm-linha" title="Remover">×</button>
    </div>`;
}

/** O aviso de repetição lê `exercicios[]`; o treino base guarda blocos. */
function paraFormatoUsados(t) {
  return { dateId: t.dateId, exercicios: (t.blocos || []).flatMap((b) => b.exercicios || []) };
}

function renderResumo() {
  const v = volumeDoTreino(treino);
  const linhaItem = ([k, val], rotulo) => `<div class="item"><span>${esc(rotulo)}</span><b>${num(val)}</b></div>`;
  const porGrupo = GRUPOS.filter((g) => v.porGrupo[g]).map((g) => linhaItem([g, v.porGrupo[g]], GRUPO_LABEL[g])).join('');
  const porPadrao = Object.entries(v.porPadrao).sort((a, b) => b[1] - a[1]).map((e) => linhaItem(e, PADRAO_LABEL[e[0]] || e[0])).join('');
  const porMusculo = Object.entries(v.porMusculo).sort((a, b) => b[1] - a[1]).map((e) => linhaItem(e, MUSC_MAP[e[0]] || e[0])).join('');
  $('#resumo').innerHTML = `
    <div class="grades">
      <div class="grade"><h3>Por grupo</h3>${porGrupo || '<p class="vazio">—</p>'}</div>
      <div class="grade"><h3>Por padrão de movimento</h3>${porPadrao || '<p class="vazio">—</p>'}</div>
      <div class="grade"><h3>Por músculo</h3>${porMusculo || '<p class="vazio">—</p>'}</div>
    </div>
    <p class="total">Total: ${num(v.totalSeries)} séries equivalentes${estruturaDe(treino.estrutura).contagem === 'tempo' ? ' (contadas pelo relógio)' : ''}</p>`;
}

// ---------- edição ----------
/** Aplica o exercício do catálogo na linha, para o volume ter músculo e padrão. */
function aplicarCatalogo(linha) {
  const ex = acharPorNome(linha.nome);
  if (!ex) { linha.id = ''; linha.padrao = undefined; linha.musculosPrimarios = []; linha.musculosSecundarios = []; return; }
  linha.id = ex.id;
  linha.padrao = ex.padrao;
  linha.musculosPrimarios = ex.musculosPrimarios || [];
  linha.musculosSecundarios = ex.musculosSecundarios || [];
}

$('#blocos').addEventListener('input', (ev) => {
  const alvo = /** @type {HTMLInputElement} */ (ev.target);
  const campo = alvo.dataset.campo;
  if (!campo) return;
  const bi = Number(alvo.closest('[data-bloco]')?.getAttribute('data-bloco'));
  const bloco = treino.blocos[bi];
  if (!bloco) return;
  if (campo === 'nome-bloco') { bloco.nome = alvo.value; return; }
  const li = Number(alvo.closest('[data-linha]')?.getAttribute('data-linha'));
  const linha = bloco.exercicios[li];
  if (!linha) return;
  if (campo === 'nome') { linha.nome = alvo.value; aplicarCatalogo(linha); renderResumo(); desenharTurma(); return; }
  if (campo === 'reps') { linha.reps = alvo.value; return; }
  linha[campo] = Number(alvo.value);
  renderResumo();
  desenharTurma();
});

$('#blocos').addEventListener('change', (ev) => {
  // O nome só vira linha completa (com músculos e marca de repetição) ao sair do
  // campo: redesenhar a cada tecla tiraria o foco de quem está digitando.
  const alvo = /** @type {HTMLInputElement} */ (ev.target);
  if (alvo.dataset.campo === 'nome') render();
});

$('#blocos').addEventListener('click', async (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-acao]');
  if (!btn) return;
  const bi = Number(btn.closest('[data-bloco]')?.getAttribute('data-bloco'));
  const bloco = treino.blocos[bi];
  if (!bloco) return;
  const alvoLinha = btn.closest('[data-linha]');
  const li = alvoLinha ? Number(alvoLinha.getAttribute('data-linha')) : -1;
  const acao = btn.getAttribute('data-acao');

  if (acao === 'add-linha') bloco.exercicios.push(linhaNova(treino.estrutura));
  else if (acao === 'rm-linha') bloco.exercicios.splice(li, 1);
  else if (acao === 'travar') bloco.exercicios[li].travado = !bloco.exercicios[li].travado;
  else if (acao === 'rm-bloco') {
    const cheio = bloco.exercicios.some((l) => l.nome);
    if (cheio && !await confirmar({ titulo: 'Remover o bloco?', texto: `“${bloco.nome}” tem exercício escrito. Isso apaga o bloco inteiro.`, ok: 'Remover', perigo: true })) return;
    treino.blocos.splice(bi, 1);
  }
  render();
});

$('#lista-aquecimento').addEventListener('input', (ev) => {
  const alvo = /** @type {HTMLInputElement} */ (ev.target);
  const i = Number(alvo.closest('[data-aq]')?.getAttribute('data-aq'));
  const item = treino.aquecimento[i];
  if (!item || !alvo.dataset.campo) return;
  if (alvo.dataset.campo === 'nome') item.nome = alvo.value;
  else item.duracaoSeg = Number(alvo.value);
});

$('#lista-aquecimento').addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-acao="rm-aq"]');
  if (!btn) return;
  treino.aquecimento.splice(Number(btn.closest('[data-aq]')?.getAttribute('data-aq')), 1);
  renderAquecimento();
});

$('#btn-add-aquecimento').addEventListener('click', () => {
  treino.aquecimento.push({ nome: '', duracaoSeg: 90 });
  renderAquecimento();
});

$('#btn-add-bloco').addEventListener('click', () => {
  treino.blocos.push(blocoNovo(`Bloco ${treino.blocos.length + 1}`, estruturaDe(treino.estrutura).blocos[0].tipo));
  render();
});

selEstrutura.addEventListener('change', () => {
  treino = trocarEstrutura(treino, selEstrutura.value);
  render();
});

inpAlunos.addEventListener('input', () => { treino.nAlunos = Number(inpAlunos.value) || 1; });
inpData.addEventListener('change', () => carregarDia(inpData.value));

// ---------- salvar ----------
$('#btn-salvar').addEventListener('click', async () => {
  const semNome = treino.blocos.some((b) => b.exercicios.some((l) => !l.nome));
  if (semNome && !await confirmar({ titulo: 'Salvar assim?', texto: 'Há linha em branco no treino. Ela fica salva vazia e não conta volume.', ok: 'Salvar mesmo assim' })) return;
  if (store.getTreino(treino.dateId) && !await confirmar({ titulo: 'Substituir o treino desta data?', texto: 'Já existe treino salvo em ' + treino.dateId + '. Salvar substitui o que está lá.', ok: 'Substituir', perigo: true })) return;
  store.salvarTreino(treino.dateId, paraSalvar(treino));
  avisar('Salvo. O histórico já mostra este dia.', 'ok');
  renderHistorico();
});

// ---------- publicar ----------
$('#btn-publicar').addEventListener('click', async () => {
  if (!temConteudoParaPortal(treino)) {
    avisar('Nada para publicar: o dia está sem exercício com nome.', 'erro');
    return;
  }
  // Publicar é a única ação daqui que sai para o aparelho do aluno. Salvar
  // primeiro evita o pior caso: o Portal mostrando um treino que o coach não
  // tem mais, porque fechou a aba sem salvar.
  store.salvarTreino(treino.dateId, paraSalvar(treino));
  const jaPublicado = await lerDiaPublicado(treino.dateId);
  const texto = jaPublicado
    ? `Já existe treino publicado em ${treino.dateId} (${jaPublicado.modalidade || 'outro montador'}). Publicar substitui o que os alunos veem hoje.`
    : `Os alunos passam a ver o treino de ${treino.dateId} no Portal, com o número de séries da turma.`;
  if (!await confirmar({ titulo: 'Publicar para os alunos?', texto, ok: 'Publicar', perigo: !!jaPublicado })) return;
  try {
    await publicarTreino(treino.dateId, paraPortal(treino));
    // As trocas por restrição vão resolvidas (nome e grupo) para o documento de
    // cada aluno: o aparelho dele não tem o catálogo para transformar um id num
    // nome, e quem tem é esta tela, agora.
    const comTroca = trocasPorAluno(treino);
    await Promise.all(comTroca.map((t) => salvarTrocas(t.email, treino.dateId, t.trocas)));
    const extra = comTroca.length
      ? ' ' + comTroca.length + ' com troca por restrição: ' + comTroca.map((t) => t.nome).join(', ') + '.'
      : '';
    avisar('Publicado. Os alunos já veem este treino no Portal.' + extra, 'ok');
  } catch (e) {
    console.error('Publicar:', e);
    avisar('Não deu para publicar agora. Tente de novo.', 'erro');
  }
  renderHistorico();
});

$('#btn-limpar').addEventListener('click', async () => {
  if (!await confirmar({ titulo: 'Limpar o dia?', texto: 'Recomeça o treino desta data do zero. O que estiver salvo na nuvem só muda quando você salvar de novo.', ok: 'Limpar', perigo: true })) return;
  treino = treinoNovo({ dateId: treino.dateId, estrutura: selEstrutura.value, nAlunos: Number(inpAlunos.value) || 8 });
  render();
  avisar('');
});

// ---------- histórico ----------
const selMes = /** @type {HTMLSelectElement} */ ($('#h-mes'));

function renderHistorico() {
  // A lista de alunos vem da Gestão e pode chegar depois do primeiro render.
  if (selAluno && !selAluno.options.length) {
    selAluno.innerHTML = '<option value="">— escolha um aluno —</option>'
      + listarAlunos().map((a) => `<option value="${esc(a.id)}">${esc(a.nome || a.id)}</option>`).join('');
  }
  const meses = store.listarMeses();
  const atual = store.mesIdDe(store.dataDe(treino.dateId));
  const lista = meses.length ? meses : [atual];
  const escolhido = lista.includes(selMes.value) ? selMes.value : lista[0];
  selMes.innerHTML = lista.map((m) => `<option value="${m}" ${m === escolhido ? 'selected' : ''}>${esc(store.rotuloMes(m))}</option>`).join('');

  const dias = store.listarTreinosDoMes(escolhido);
  $('#lista-historico').innerHTML = dias.length ? dias.map((t) => {
    // `totalSeries` é o número que a tela mostrou ao salvar. A soma dos padrões
    // é só a retaguarda para dia salvo antes deste campo existir.
    const total = t.totalSeries ?? Object.values(t.volPorPadrao || {}).reduce((a, b) => a + Number(b), 0);
    const nEx = (t.blocos || []).reduce((a, b) => a + (b.exercicios || []).filter((l) => l.nome).length, 0);
    return `
      <div class="dia" data-dia="${t.dateId}">
        <span class="data">${esc(t.dateId)} · ${esc(t.dia)}</span>
        <span class="resumo-dia">${esc(estruturaDe(t.estrutura).label)} · ${nEx} exercício(s) · ${num(total)} séries</span>
        <span class="acoes-dia">
          <button class="btn ghost btn-sm" data-acao="abrir">Abrir</button>
          <button class="btn ghost btn-sm perigo" data-acao="apagar">Apagar</button>
        </span>
      </div>`;
  }).join('') : '<p class="vazio">Nenhum treino salvo neste mês.</p>';
}

const selAluno = /** @type {HTMLSelectElement} */ ($('#h-aluno'));

/**
 * O mês de um aluno: os dias que são dele e o volume por grupo contra a meta
 * SEMANAL dele — a média por semana, e não a soma do mês, que faria todo mundo
 * parecer muito acima da meta.
 */
function renderResumoDoAluno() {
  const alvo = $('#resumo-aluno');
  const aluno = listarAlunos().find((a) => a.id === selAluno.value);
  if (!aluno) { alvo.hidden = true; return; }
  alvo.hidden = false;
  const { perfil, dias, grupos, semanas } = mesDoAluno(aluno, selMes.value);
  const linhasDias = dias.length
    ? dias.map((d) => `<div class="item"><span>${esc(d.dateId)}</span><b>${num(d.total)} séries</b></div>`).join('')
    : '<p class="vazio">Nenhum treino dele neste mês.</p>';
  const linhasGrupos = Object.entries(grupos)
    .filter(([, v]) => v.porSemana > 0)
    .sort((a, b) => b[1].porSemana - a[1].porSemana)
    .map(([g, v]) => `<div class="item"><span>${esc(GRUPO_LABEL[g])}</span><b>${num(v.porSemana)}/${v.meta}</b></div>`)
    .join('') || '<p class="vazio">—</p>';
  alvo.innerHTML = `
    <div class="turma-cab">
      <h3>${esc(aluno.nome || aluno.id)}</h3>
      <span class="mut">${esc(perfil.objetivo || 'sem objetivo')} · ${dias.length} treino(s) em ${semanas} semana(s)</span>
    </div>
    <div class="grades">
      <div class="grade"><h3>Dias dele</h3>${linhasDias}</div>
      <div class="grade"><h3>Por grupo, por semana</h3>${linhasGrupos}</div>
    </div>`;
}

selMes.addEventListener('change', () => { renderHistorico(); renderResumoDoAluno(); });
selAluno.addEventListener('change', renderResumoDoAluno);

$('#lista-historico').addEventListener('click', async (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-acao]');
  if (!btn) return;
  const dateId = btn.closest('[data-dia]')?.getAttribute('data-dia');
  if (!dateId) return;
  if (btn.getAttribute('data-acao') === 'abrir') {
    inpData.value = dateId;
    carregarDia(dateId);
    trocarView('treino');
    return;
  }
  if (!await confirmar({ titulo: 'Apagar o treino?', texto: `O treino de ${dateId} sai do histórico e da nuvem.`, ok: 'Apagar', perigo: true })) return;
  store.removerTreino(dateId);
  renderHistorico();
  if (dateId === treino.dateId) carregarDia(dateId);
});

// ---------- abas ----------
function trocarView(nome) {
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.getAttribute('data-view') === nome);
  for (const view of document.querySelectorAll('.view')) view.classList.toggle('active', view.id === `view-${nome}`);
  if (nome === 'historico') renderHistorico();
}
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => trocarView(tab.getAttribute('data-view')));
}

// ---------- partida ----------
encherDatalist();
inpData.value = store.dateIdDe();
carregarDia(inpData.value);
renderHistorico();

// Só para conferência no navegador durante o desenvolvimento.
Object.assign(/** @type {any} */ (window), { __individual: { store, treinoAtual: () => treino, EXERCICIO_POR_ID } });
