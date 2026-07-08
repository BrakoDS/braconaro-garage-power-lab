// @ts-check
/* Controlador da UI. Fluxo mensal: o programa de cada semana do mês é gerado,
   salvo e travado (regerar = substituir). Ver README "Fluxo mensal". */
import { gerarProgramaSemanal, GRADE_PADRAO } from '../core/programaSemanal.js';
import { gerarMesociclo } from '../core/mesociclo.js';
import { MODALIDADES, MODALIDADE_IDS } from '../config/modalidades.js';
import * as store from './store.js';
import * as gestao from './gestao.js';
import { renderCenarios, renderDiaSalvo, renderRelatorioMes, renderAcumuladoAluno, renderMesociclo, renderTreino, ativarTrocas } from './render.js';
import { alternativasPorIds, gerarTreino } from '../core/gerador.js';
import { EXERCICIO_POR_ID } from '../data/exercicios.js';
import { variantesNivel, NIVEIS } from '../core/niveis.js';

/** A geração ancora no intermediário; as colunas iniciante/avançado derivam dele. */
const NIVEL_ANCORA = 'intermediario';

const $ = (s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const $$ = (s) => Array.from(document.querySelectorAll(s));
const GRADE_IDS = { seg: '#g-seg', ter: '#g-ter', qua: '#g-qua', qui: '#g-qui', sex: '#g-sex' };
const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

// ---------- abas ----------
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  tab.classList.add('active');
  $('#view-' + tab.dataset.view).classList.add('active');
  if (tab.dataset.view === 'historico') { atualizarMesesSelects(); renderHistorico(); }
}));

// ---------- popular selects ----------
function popularSelects() {
  const cfg = store.getConfig();
  const grade = cfg.grade || GRADE_PADRAO;
  Object.entries(GRADE_IDS).forEach(([dia, sel]) => {
    const el = $(sel);
    el.appendChild(opt('', '— folga —'));
    MODALIDADE_IDS.forEach((id) => el.appendChild(opt(id, MODALIDADES[id].nome)));
    el.value = grade[dia] || '';
  });
  // Só o Mesociclo mantém seletor de nível; Programa da semana e Treino único mostram os 3 níveis em colunas.
  NIVEIS.forEach((n) => $('#m-nivel').appendChild(opt(n, n)));
  MODALIDADE_IDS.forEach((id) => $('#u-modalidade').appendChild(opt(id, MODALIDADES[id].nome)));
  $('#m-nivel').value = cfg.nivelRef || 'intermediario';

  // semana do mês (1..5)
  for (let n = 1; n <= 5; n++) $('#s-semana').appendChild(opt(String(n), `Semana ${n}`));
  $('#s-semana').value = String(store.semanaDoMes());
}

/** Popula os selects de mês (atual + meses com programas salvos). */
function atualizarMesesSelects() {
  const atual = store.mesIdDe();
  const ids = [...new Set([atual, ...store.listarMeses()])].sort().reverse();
  [['#s-mes', store.mesIdDe()], ['#h-mes', store.mesIdDe()]].forEach(([sel, def]) => {
    const cur = $(sel).value || def;
    $(sel).innerHTML = '';
    ids.forEach((id) => $(sel).appendChild(opt(id, store.rotuloMes(id))));
    $(sel).value = ids.includes(cur) ? cur : atual;
  });
}

function atualizarSelectAlunos() {
  const sel = $('#h-aluno');
  const atual = sel.value;
  sel.innerHTML = '';
  sel.appendChild(opt('', '— relatório do box —'));
  gestao.listarAlunos().forEach((a) => sel.appendChild(opt(a.id, a.nivel ? `${a.nome} (${a.nivel})` : a.nome)));
  sel.value = atual;
}

// ---------- PROGRAMA DA SEMANA ----------
function lerGrade() {
  const grade = {};
  Object.entries(GRADE_IDS).forEach(([dia, sel]) => { const v = $(sel).value; if (v) grade[dia] = v; });
  const nivelRef = NIVEL_ANCORA; // âncora fixa; os 3 níveis aparecem em colunas
  store.setConfig({ grade, nivelRef });
  return { grade, nivelRef };
}

function aplicarGradeNosSelects(grade) {
  Object.entries(GRADE_IDS).forEach(([dia, sel]) => { $(sel).value = grade[dia] || ''; });
}

/** Monta o snapshot compacto e persistível de um programa gerado. */
function montarSnapshot(prog, mesId, semana, grade, nivelRef) {
  return {
    mesId, semana, geradoEm: new Date().toISOString(), grade, nivelRef,
    minimo: prog.minimo, cenarios: prog.cenarios, volPorDia: prog.volPorDia,
    dias: prog.treinos.map((t) => t.hyrox ? ({
      dia: t.dia, modalidade: t.modalidade,
      viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo },
      hyrox: t.hyrox, // template Hyrox estruturado (formato da competição)
    }) : t.hiit ? ({
      dia: t.dia, modalidade: t.modalidade,
      viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo },
      hiit: t.hiit, // template HIIT em 4 estações TABATA
    }) : t.gap ? ({
      dia: t.dia, modalidade: t.modalidade,
      viabilidade: { ok: true, tamanhoGrupo: t.tamanhoGrupo },
      gap: t.gap, // aula GAP estruturada TABATA
    }) : ({
      dia: t.dia, modalidade: t.modalidade,
      viabilidade: { ok: t.viabilidade.ok, tamanhoGrupo: t.viabilidade.tamanhoGrupo },
      exercicios: t.principal.map((p) => ({
        id: p.exercicio.id, nome: p.exercicio.nome, padrao: p.exercicio.padrao,
        equipamento: p.exercicio.equipamento, reps: p.reps, descansoSeg: p.descansoSeg,
        seriesRef: p.series, // séries do intermediário (âncora) — base das colunas e da troca
        niveis: variantesNivel(p.exercicio, p.series, t.modalidade),
      })),
      finalizador: t.finalizador ? { tipo: t.finalizador.tipo, descricao: t.finalizador.descricao } : null,
    })),
  };
}

function renderProgramaView(snap, jaExistia) {
  const aviso = `<div class="card" style="border-color:var(--acc)">
    <b>Semana ${snap.semana} — ${store.rotuloMes(snap.mesId)}</b> · salva ✓
    ${jaExistia ? '(visualizando o treino salvo desta semana)' : '(gerada e salva no histórico)'}.
    Para mudar, clique em <b>Gerar / ver semana</b> e confirme a substituição.</div>`;
  $('#s-saida').innerHTML = aviso + renderCenarios(snap) + snap.dias.map((d) => renderDiaSalvo(d, true)).join('');
}

function gerarPrograma() {
  const mesId = $('#s-mes').value;
  const semana = Number($('#s-semana').value);
  const { grade, nivelRef } = lerGrade();

  const existente = store.getPrograma(mesId, semana);
  if (existente) {
    const sub = confirm(`Já existe um treino salvo para a Semana ${semana} — ${store.rotuloMes(mesId)}.\n\nDeseja substituir o treino dessa semana?`);
    if (!sub) { renderProgramaView(existente, true); return; }
  }

  // usa a última semana salva do mês para variar os exercícios
  const ant = store.programasAnteriores(mesId, semana).slice(-1)[0];
  const evitarPorDia = {};
  if (ant) ant.dias.forEach((d) => { evitarPorDia[d.dia] = d.exercicios.map((e) => e.id); });

  const prog = gerarProgramaSemanal({ grade, nivelRef, semana, evitarPorDia, seed: Math.floor(Math.random() * 1e6) });
  const snap = montarSnapshot(prog, mesId, semana, grade, nivelRef);
  store.salvarPrograma(mesId, semana, snap);
  renderProgramaView(snap, false);
  atualizarMesesSelects();
}

/**
 * "Trocar" um exercício de uma semana salva (ajuste fino). Mantém padrão e séries,
 * recalcula a carga e RE-SALVA o snapshot — a semana continua travada, só refinada.
 */
function ativarTrocaPrograma() {
  $('#s-saida').addEventListener('click', (ev) => {
    const mesId = $('#s-mes').value;
    const semana = Number($('#s-semana').value);
    const snap = store.getPrograma(mesId, semana);
    if (!snap) return;

    const btn = ev.target.closest('.swap-prog');
    if (btn) {
      const dia = btn.dataset.dia;
      const idx = Number(btn.dataset.idx);
      const box = document.getElementById(`alts-${dia}-${idx}`);
      if (box.childElementCount) { box.innerHTML = ''; return; } // toggle
      const d = snap.dias.find((x) => x.dia === dia);
      const alts = alternativasPorIds(d.exercicios.map((e) => e.id), idx, d.modalidade, snap.nivelRef);
      box.innerHTML = alts.length
        ? alts.map((e) => `<button class="btn ghost sm alt-prog" data-dia="${dia}" data-idx="${idx}" data-ex="${e.id}">${e.nome}</button>`).join('')
        : '<small>sem alternativas viáveis</small>';
      return;
    }

    const alt = ev.target.closest('.alt-prog');
    if (alt) {
      const dia = alt.dataset.dia;
      const idx = Number(alt.dataset.idx);
      const novo = EXERCICIO_POR_ID[alt.dataset.ex];
      const d = snap.dias.find((x) => x.dia === dia);
      const antigo = d.exercicios[idx];
      const seriesRef = antigo.seriesRef ?? antigo.series ?? 3; // compat c/ snapshot antigo
      d.exercicios[idx] = {
        id: novo.id, nome: novo.nome, padrao: novo.padrao, equipamento: novo.equipamento,
        reps: antigo.reps, descansoSeg: antigo.descansoSeg,
        seriesRef, niveis: variantesNivel(novo, seriesRef, d.modalidade),
      };
      // padrão e séries iguais → volPorDia e cenários permanecem válidos
      store.salvarPrograma(mesId, semana, snap);
      renderProgramaView(snap, true);
    }
  });
}

/** Ao trocar mês/semana, carrega o programa salvo (se houver) ou mostra dica. */
function aoTrocarSemana() {
  const mesId = $('#s-mes').value;
  const semana = Number($('#s-semana').value);
  const ex = store.getPrograma(mesId, semana);
  if (ex) {
    aplicarGradeNosSelects(ex.grade);
    renderProgramaView(ex, true);
  } else {
    $('#s-saida').innerHTML = `<div class="empty">Sem treino salvo para a Semana ${semana} — ${store.rotuloMes(mesId)}.<br>Configure a grade e clique em <b>Gerar / ver semana</b>.</div>`;
  }
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

// ---------- TREINO ÚNICO ----------
function gerarUnico() {
  const modalidade = $('#u-modalidade').value;
  const nAlunos = Math.min(20, Math.max(1, Number($('#u-alunos').value) || 8));
  const treino = gerarTreino({ modalidade, nivel: NIVEL_ANCORA, dia: 'unico', semana: 1, nAlunos, seed: Math.floor(Math.random() * 1e6) });
  $('#u-saida').innerHTML = renderTreino(treino, { mostrarDiaSemana: false });
}

// ---------- HISTÓRICO ----------
function renderHistorico() {
  const mesId = $('#h-mes').value || store.mesIdDe();
  const alunoId = $('#h-aluno').value;
  const semanas = store.listarProgramasDoMes(mesId);
  const rotulo = store.rotuloMes(mesId);
  if (!alunoId) { $('#h-saida').innerHTML = renderRelatorioMes(rotulo, semanas); return; }
  const aluno = gestao.listarAlunos().find((a) => a.id === alunoId);
  if (!aluno) { $('#h-saida').innerHTML = '<div class="empty">Aluno não encontrado na Gestão de Alunos.</div>'; return; }
  const dias = Array.isArray(aluno.diasTreino) ? aluno.diasTreino : [];
  if (!dias.length) {
    $('#h-saida').innerHTML = `<div class="empty"><b>${aluno.nome}</b> ainda não tem <b>dias de treino</b> definidos.<br>Defina os dias no cadastro do aluno em <b>Gestão de Alunos</b> para ver o acumulado mensal.</div>`;
    return;
  }
  $('#h-saida').innerHTML = renderAcumuladoAluno(aluno.nome, dias, semanas, rotulo);
}

// ---------- init ----------
popularSelects();
atualizarMesesSelects();
atualizarSelectAlunos();
$('#s-gerar').addEventListener('click', gerarPrograma);
$('#s-mes').addEventListener('change', () => { atualizarMesesSelects(); aoTrocarSemana(); });
$('#s-semana').addEventListener('change', aoTrocarSemana);
$('#m-gerar').addEventListener('click', gerarMeso);
$('#u-gerar').addEventListener('click', gerarUnico);
$('#u-imprimir').addEventListener('click', () => window.print());
ativarTrocas($('#u-saida'));
$('#h-mes').addEventListener('change', renderHistorico);
$('#h-aluno').addEventListener('change', renderHistorico);
$('#s-imprimir').addEventListener('click', () => window.print());
$('#m-imprimir').addEventListener('click', () => window.print());
$('#h-imprimir').addEventListener('click', () => window.print());
ativarTrocaPrograma();
aoTrocarSemana();
renderHistorico();
