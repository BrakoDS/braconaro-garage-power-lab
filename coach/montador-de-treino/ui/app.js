// @ts-check
/* Controlador da UI. Fluxo único: escolhe modalidade + data → gera treino (sem
   repetir exercícios já usados na semana) → mostra meta de volume da semana →
   salva na data (conflito = substituir) e publica no Portal do Aluno. O histórico
   é um calendário mensal colorido por modalidade. */
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import * as store from './store.js';
import {
  renderDiaSalvo, renderTreino, ativarTrocas, renderCalendario, renderMetaVolume,
  renderAnaliseSemanal, renderAnaliseMensal, ativarEdicaoDia,
} from './render.js';
import { trocarExercicioDoDia } from '../core/editar-dia.js';
import { gerarTreino } from '../core/gerador.js';
import { variantesNivel } from '../core/niveis.js';
import { idsUsadosEm } from '../core/usados.js';
import { ladoSalvo } from '../core/hibrido.js';
import * as academia from '../../academia/db.js';
import { publicarTreino, removerTreinoPortal } from './portal-treino.js';
import { initManual } from './manual.js';
import { iniciarLivre } from './livre.js';
import { confirmar, painel } from './dialogo.js';

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
  if (tab.dataset.view === 'livre') iniciarLivre();
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
    // O tamanho da turma vai junto: a edição do dia salvo recalcula a viabilidade
    // de aparelho, e sem isto ela teria que adivinhar a turma pelo tamanhoGrupo.
    nAlunos: t.nAlunos,
  };
  if (t.hyrox) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, hyrox: t.hyrox };
  if (t.hiit) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, hiit: t.hiit };
  if (t.gap) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, gap: t.gap };
  if (t.murph) return { ...base, viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo }, murph: t.murph };
  if (t.hibrido) return {
    ...base,
    viabilidade: { ok: t.hibrido.viabilidade.ok, tamanhoGrupo: t.tamanhoGrupo },
    hibrido: {
      mobilidade: t.hibrido.mobilidade,
      semanaRotulo: t.hibrido.semanaRotulo,
      hipertrofia: t.hibrido.hipertrofia.map((p) => ({
        par: p.par, parLabel: p.parLabel,
        series: p.series, reps: p.reps, descansoSeg: p.descansoSeg, pctRM: p.pctRM,
        tecnica: p.tecnica,
        a: ladoSalvo(p.a, p.series), b: ladoSalvo(p.b, p.series),
      })),
      wod: t.hibrido.wod, duracaoSeg: t.hibrido.duracaoSeg,
    },
  };
  return {
    ...base,
    viabilidade: { ok: t.viabilidade.ok, tamanhoGrupo: t.viabilidade.tamanhoGrupo },
    // O aquecimento era DESCARTADO aqui: o gerador escolhe as mobilidades do dia
    // (miradas nos músculos do bloco principal) e elas morriam no salvamento, então
    // o histórico abria sem alongamento nenhum e o coach não tinha o que passar
    // para o quadro. O Treino Manual sempre salvou — era só o automático.
    aquecimento: (t.aquecimento || []).map((a) => ({
      nome: a.exercicio.nome, duracaoSeg: a.duracaoSeg,
      musculosAlvo: a.exercicio.musculosPrimarios || [],
    })),
    tempos: {
      aquecimentoSeg: t.tempoAquecimentoSeg,
      principalSeg: t.tempoPrincipalSeg,
      totalSeg: t.tempoTotalSeg,
    },
    exercicios: t.principal.map((p) => ({
      id: p.exercicio.id, nome: p.exercicio.nome, padrao: p.exercicio.padrao,
      equipamento: p.exercicio.equipamento, reps: p.reps, descansoSeg: p.descansoSeg,
      seriesRef: p.series, niveis: variantesNivel(p.exercicio, p.series, t.modalidade),
      musculosPrimarios: p.exercicio.musculosPrimarios || [],
      musculosSecundarios: p.exercicio.musculosSecundarios || [],
      tecnica: p.tecnica || null,
    })),
    finalizador: t.finalizador ? { tipo: t.finalizador.tipo, descricao: t.finalizador.descricao } : null,
  };
}

// ---------- TREINO (gerador único) ----------
/** @type {any} */
let treinoGerado = null;

/**
 * IDs de exercício já usados em OUTROS dias da mesma semana (não-repetição).
 * `idsUsadosEm` (core/usados.js) já lê os dois formatos que guardam exercício de
 * musculação — `exercicios` (Automático/Manual em blocos) e `livre.blocos[]`
 * (Treino Livre) — é a mesma regra que os avisos "· já na semana" da tela usam.
 * Sem ela aqui, o gerador ficava cego ao que o Treino Livre montou na semana.
 */
function idsUsadosNaSemana(dateId) {
  return [...idsUsadosEm(store.treinosDaSemana(dateId), dateId)];
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
  const semana = Math.min(4, Math.max(1, Number($('#u-semana').value) || 1));
  const dateId = $('#u-data').value || store.dateIdDe();
  const idsEvitar = idsUsadosNaSemana(dateId);
  // As técnicas vêm da aba "Técnicas" da Academia — o que o coach cadastrou lá é o
  // que o gerador pode sortear (só Hipertrofia, ver core/tecnicas-auto.js).
  let tecnicas = [];
  try { tecnicas = academia.listarTecnicas(); } catch { /* Academia indisponível: treino sai sem técnica */ }
  const treino = gerarTreino({ modalidade, nivel: NIVEL_ANCORA, dia: 'unico', semana, nAlunos, idsEvitar, tecnicas, seed: Math.floor(Math.random() * 1e6) });
  treinoGerado = treino;
  $('#u-saida').innerHTML = renderTreino(treino, { mostrarDiaSemana: false });
  renderMetaPanel(dateId, treino);
  renderSalvarBar(dateId);
}

async function salvarTreinoAtual() {
  if (!treinoGerado) return;
  const dateId = $('#u-data').value || store.dateIdDe();
  if (store.getTreino(dateId)) {
    const ok = await confirmar({
      titulo: 'Substituir treino?',
      texto: `Já existe um treino registrado em <b>${formatarData(dateId)}</b>. Ele será trocado pelo treino gerado, no histórico e no Portal do Aluno.`,
      ok: 'Substituir', perigo: true,
    });
    if (!ok) return;
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
  $('#h-saida').innerHTML = renderCalendario(calMesId, treinos, store.rotuloMes(calMesId))
    + renderAnaliseSemanal(calMesId, treinos)
    + renderAnaliseMensal(calMesId, treinos);
}

/**
 * Edição do dia salvo, dentro do modal.
 *
 * O snapshot em tela muda a cada troca, então quem responde "qual é o dia agora"
 * é esta variável — os handlers de `ativarEdicaoDia` a consultam a cada clique em
 * vez de fechar sobre o valor do momento em que foram registrados.
 */
let diaEmEdicao = null;
let _edicaoLigada = false;

function ligarEdicaoDia() {
  if (_edicaoLigada) return;
  _edicaoLigada = true;
  ativarEdicaoDia(
    $('#modal-app-corpo'),
    () => diaEmEdicao?.snap,
    (novoExercicio, indice) => {
      if (!diaEmEdicao) return;
      const { dateId } = diaEmEdicao;
      const novo = trocarExercicioDoDia(diaEmEdicao.snap, indice, novoExercicio);
      diaEmEdicao.snap = novo;
      // Grava e republica NA HORA: o modal não tem "salvar", e um treino editado
      // que só existe na tela é exatamente a divergência que queremos evitar
      // entre o que o coach vê e o que a aluna recebe.
      store.salvarTreino(dateId, novo);
      publicarTreino(dateId, novo);
      $('#modal-app-corpo').innerHTML = renderDiaSalvo(novo, true);
      renderHistorico(); // o calendário e as análises atrás do modal acompanham
    },
  );
}

/** Abre o treino do dia em modal; o "Excluir" de lá pede confirmação em seguida. */
async function abrirDia(dateId) {
  const snap = store.getTreino(dateId);
  if (!snap) return;
  ligarEdicaoDia();
  diaEmEdicao = { dateId, snap };
  const acao = await painel({
    titulo: formatarData(dateId),
    corpoHTML: renderDiaSalvo(snap, true),
    acoes: [{ id: 'excluir', label: 'Excluir treino', perigo: true }],
  });
  diaEmEdicao = null;
  if (acao !== 'excluir') return;
  const ok = await confirmar({
    titulo: 'Excluir treino?',
    texto: `O treino de <b>${formatarData(dateId)}</b> sai do histórico e também do “Treino do dia” do aluno.`,
    ok: 'Excluir', perigo: true,
  });
  if (!ok) return;
  store.removerTreino(dateId);
  removerTreinoPortal(dateId);
  renderHistorico();
}

function ativarCalendario() {
  $('#h-saida').addEventListener('click', (ev) => {
    const nav = ev.target.closest('.cal-nav');
    if (nav) { calMesId = shiftMes(calMesId, Number(nav.dataset.nav)); renderHistorico(); return; }
    const cel = ev.target.closest('.cal-cel.tem');
    if (cel) abrirDia(cel.dataset.date);
  });
}

// ---------- init ----------
popularSelects();
$('#u-gerar').addEventListener('click', gerarUnico);
$('#u-imprimir').addEventListener('click', () => window.print());
// Trocar um exercício gera um treino novo: sem isto, `treinoGerado` continuaria
// sendo o da geração inicial e era ELE que ia para o histórico e para o Portal.
// A meta de volume e a barra de salvar são refeitas junto — a troca muda o
// volume por padrão, e depois de já ter salvo o botão precisa voltar para o
// coach poder regravar com a troca.
ativarTrocas($('#u-saida'), (treino) => {
  treinoGerado = treino;
  const dateId = $('#u-data').value || store.dateIdDe();
  renderMetaPanel(dateId, treino);
  renderSalvarBar(dateId);
});
$('#view-unico').addEventListener('click', (ev) => { if (ev.target.closest('#btn-salvar-treino')) salvarTreinoAtual(); });
ativarCalendario();
renderHistorico();
initManual();
