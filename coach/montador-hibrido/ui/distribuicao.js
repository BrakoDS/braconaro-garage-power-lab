// @ts-check
/**
 * MÓDULO 3 — DISTRIBUIÇÃO E PERSONALIZAÇÃO.
 *
 * As turmas do dia já vêm montadas: o sistema lê em que horário cada aluno
 * treina NAQUELE dia da semana e agrupa sozinho. O coach ajusta o que fugiu da
 * rotina (quem avisou que hoje vem no outro horário, quem vai faltar) e manda o
 * treino para TODOS os horários de uma vez.
 *
 * ── O que mudou, e por quê ───────────────────────────────────────────────────
 * Antes o coach escolhia um horário, marcava os alunos na mão, salvava, e
 * repetia para o horário seguinte — três vezes o mesmo treino, num box com três
 * aulas por dia. O horário de cada aluno JÁ ESTAVA na ficha da Gestão o tempo
 * todo (`diasTreino` + `horarios`, um mapa por dia); só ninguém estava lendo.
 *
 * ── Por que NÃO existe um campo `horario_padrao` ─────────────────────────────
 * Porque o horário não é único: o próprio formulário da Gestão diz "marque os
 * dias e a hora de cada um — eles podem ser diferentes". Quem treina 7h na
 * segunda e 19h na quarta não tem um horário padrão, e um campo assim brigaria
 * com o mapa por dia até alguém descobrir qual dos dois o sistema usava.
 *
 * ── A prévia continua vindo do servidor ──────────────────────────────────────
 * Com `dryRun: true`, pelo mesmo caminho do envio. Recalcular lesão, restrição e
 * balizamento de 1RM aqui daria dois resultados possíveis para a mesma pergunta,
 * e o coach aprovaria um para enviar o outro.
 */
import * as gestaoDb from '../../gestao-de-alunos/db.js';
import {
  montarTurmas, moverAluno, removerAluno, adicionarHorario, paraEnvio, impedimentos,
  totalDeAlunos, horaLegivel, MAX_POR_TURMA, SEM_HORARIO,
} from '../core/turmas.js';
import { diaSemanaDe } from '../../../compartilhado/regras/datas-treino.js';
import { distributeWorkoutToStudents } from '../cloud/chamadas.js';
import { esc } from './render-treino.js';
import { resumo } from '../core/lousa-modelo.js';
import * as store from './store.js';
import { avisar, confirmar } from '../../../compartilhado/ui/dialogo.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

const DIA_LONGO = {
  seg: 'segunda-feira', ter: 'terça-feira', qua: 'quarta-feira',
  qui: 'quinta-feira', sex: 'sexta-feira', sab: 'sábado', dom: 'domingo',
};

/** As turmas em edição. Derivadas da ficha, ajustadas pelo coach, nunca gravadas. */
let turmas = [];
/** A data de que as turmas atuais foram montadas — remontar quando ela mudar. */
let montadoPara = '';
let ocupado = false;

/** @param {{uid: () => string, irPara: (aba: string) => void}} ctx */
export function montar(ctx) {
  const alvo = $('#turma-corpo');
  const btnPrever = $('#turma-prever');
  const btnEnviar = $('#turma-enviar');
  if (!alvo) return;

  alvo.addEventListener('change', (ev) => {
    const sel = /** @type {HTMLSelectElement} */ (ev.target);
    if (!sel.matches('[data-mover]')) return;
    turmas = moverAluno(turmas, sel.getAttribute('data-mover') || '', sel.value);
    store.atualizar({ fichas: [] }); // a prévia deixa de valer: ela é por aluno e por horário
  });

  alvo.addEventListener('click', async (ev) => {
    const el = /** @type {HTMLElement} */ (ev.target);
    const remover = el.closest('[data-remover]');
    if (remover) {
      turmas = removerAluno(turmas, remover.getAttribute('data-remover') || '');
      store.atualizar({ fichas: [] });
      return;
    }
    if (el.closest('#turma-add-horario')) {
      const hora = $('#turma-nova-hora')?.value;
      const antes = turmas.length;
      turmas = adicionarHorario(turmas, hora);
      if (turmas.length === antes) {
        await avisar({ titulo: 'Horário inválido', texto: 'Escolha uma hora que ainda não esteja na lista.' });
      }
      desenhar(alvo);
    }
  });

  btnPrever?.addEventListener('click', () => executar(ctx, { dryRun: true, botao: btnPrever }));
  btnEnviar?.addEventListener('click', () => executar(ctx, { dryRun: false, botao: btnEnviar }));

  store.aoMudar(() => desenhar(alvo));
  document.addEventListener('hibrido:aba', (ev) => {
    if (/** @type {any} */ (ev).detail === 'turma') desenhar(alvo);
  });
  desenhar(alvo);
}

/** Alunos ativos da Gestão. Inativo não entra na turma. */
function alunosAtivos() {
  try {
    return gestaoDb.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
  } catch (e) {
    console.warn('Lista de alunos indisponível:', e);
    return [];
  }
}

/**
 * Remonta as turmas quando a DATA muda.
 *
 * Só quando a data muda, e não a cada desenho: o agrupamento é o ponto de
 * partida, e os ajustes do coach (quem mudou de horário, quem vai faltar) são
 * dele. Remontar a cada render jogaria fora o trabalho manual a cada clique.
 */
function sincronizarComData() {
  const dateId = store.ler().dateId;
  if (dateId === montadoPara) return;
  montadoPara = dateId;
  turmas = montarTurmas(alunosAtivos(), dateId);
}

function desenhar(alvo) {
  const est = store.ler();
  if (!est.treino) {
    alvo.innerHTML = '<p class="vazio">Reconheça a lousa na aba 1 para montar as turmas do dia.</p>';
    return;
  }
  sincronizarComData();

  const dia = DIA_LONGO[diaSemanaDe(est.dateId)] || '';
  const enviaveis = paraEnvio(turmas);
  const problemas = impedimentos(turmas);

  const cabecalho = `
    <div class="card">
      <h3>${esc(est.treino.titulo || 'Treino')}</h3>
      <p class="mut">${esc(resumo(est.treino))} · ${esc(dia)}, ${esc(est.dateId)}</p>
      <p class="turma-total">
        <b>${enviaveis.length} horário(s)</b> · <b>${totalDeAlunos(turmas)} aluno(s)</b> vão receber este treino.
      </p>
    </div>`;

  const blocos = turmas.length
    ? turmas.map((t) => blocoDaTurma(t, turmas)).join('')
    : `<div class="card"><h3>Ninguém treina nesta ${esc(dia)}</h3>
         <p class="mut">Os dias e horários saem da ficha de cada aluno, em
         <a href="../gestao-de-alunos/index.html">Gestão de Alunos</a>.</p></div>`;

  const novoHorario = `
    <div class="card turma-novo">
      <label for="turma-nova-hora">Acrescentar horário</label>
      <input id="turma-nova-hora" type="time" />
      <button class="btn ghost btn-sm" id="turma-add-horario" type="button">+ Criar bloco</button>
      <span class="mut">Para encaixar quem veio fora da rotina.</span>
    </div>`;

  const avisos = problemas.length
    ? `<div class="nota nota-aviso"><b>Antes de distribuir</b>
         <ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
    : '';

  const previa = est.fichas?.length
    ? `<h3 class="secao">Prévia por aluno</h3>${previaPorTurma(est.fichas)}`
    : '<p class="vazio">Use <b>Prever ajustes</b> para ver a ficha de cada aluno antes de enviar.</p>';

  alvo.innerHTML = cabecalho + avisos + blocos + novoHorario + previa;
}

function blocoDaTurma(t, todas) {
  const destinos = todas.map((x) => x.horario).filter((h) => h !== t.horario);
  const classe = ['card', 'turma-bloco', t.excede ? 'excede' : '', t.horario ? '' : 'sem-hora'].filter(Boolean).join(' ');

  const linhas = t.alunos.map((a) => `
    <li class="turma-aluno">
      <span class="turma-nome">${esc(a.nome || a.id)}</span>
      <span class="ex-chip mudo">${esc(a.nivel || 'sem nível')}</span>
      <select class="turma-mover" data-mover="${esc(a.id)}" aria-label="Mover ${esc(a.nome)} de horário">
        <option value="${esc(t.horario)}" selected>${esc(t.rotulo)}</option>
        ${destinos.map((h) => `<option value="${esc(h)}">mover para ${esc(h ? horaLegivel(h) : 'sem horário')}</option>`).join('')}
      </select>
      <button class="btn danger btn-sm" type="button" data-remover="${esc(a.id)}" title="Tirar da distribuição de hoje">✕</button>
    </li>`).join('');

  return `
    <section class="${classe}">
      <header class="turma-h">
        <h4>${esc(t.rotulo)}</h4>
        <span class="turma-contagem">${t.alunos.length}/${MAX_POR_TURMA}</span>
        ${t.excede ? '<span class="ex-chip aviso">acima do teto</span>' : ''}
        ${t.horario === SEM_HORARIO ? '<span class="ex-chip aviso">não será enviada</span>' : ''}
      </header>
      ${t.alunos.length
        ? `<ul class="turma-lista">${linhas}</ul>`
        : '<p class="mut turma-vazia">Ninguém neste horário hoje.</p>'}
      ${t.horario === SEM_HORARIO
        ? '<p class="mut turma-dica">Estes alunos treinam hoje, mas a ficha não diz a que horas. Cadastre a hora na Gestão ou mova cada um para um horário.</p>'
        : ''}
    </section>`;
}

/** A prévia reagrupada por horário — a mesma leitura da tela de cima. */
function previaPorTurma(fichas) {
  /** @type {Map<string, any[]>} */
  const porHora = new Map();
  for (const f of fichas) {
    const h = f.classTime || '';
    if (!porHora.has(h)) porHora.set(h, []);
    porHora.get(h)?.push(f);
  }
  return [...porHora.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([h, lista]) => `
      <h4 class="secao">${esc(h ? horaLegivel(h) : 'Sem horário')}</h4>
      ${lista.map(cardDaFicha).join('')}`)
    .join('');
}

async function executar(ctx, { dryRun, botao }) {
  if (ocupado) return;
  const est = store.ler();

  if (!est.treino) {
    await avisar({ titulo: 'Sem treino', texto: 'Reconheça a lousa antes de distribuir.' });
    ctx.irPara('lousa');
    return;
  }
  if (!est.workoutId) {
    await avisar({
      titulo: 'Treino não salvo',
      texto: 'Este treino ainda não chegou à nuvem. Volte à Lousa, reconheça de novo e confirme na prévia.',
    });
    ctx.irPara('lousa');
    return;
  }

  const enviaveis = paraEnvio(turmas);
  const problemas = impedimentos(turmas);
  if (problemas.length) {
    await avisar({ titulo: 'Ajuste as turmas primeiro', texto: problemas.join(' ') });
    return;
  }

  if (!dryRun) {
    const detalhe = enviaveis.map((t) => `${horaLegivel(t.classTime)} (${t.studentIds.length})`).join(', ');
    const ok = await confirmar({
      titulo: 'Distribuir para todos os horários?',
      texto: `<b>${totalDeAlunos(turmas)} alunos</b> em <b>${enviaveis.length} horário(s)</b> — ${esc(detalhe)} — `
        + `vão receber a ficha de ${esc(est.dateId)}. Isso substitui o que já estava publicado para esse dia.`,
      ok: 'Distribuir',
    });
    if (!ok) return;
  }

  ocupado = true;
  botao.disabled = true;
  const rotulo = botao.textContent;
  botao.textContent = dryRun ? 'Calculando…' : 'Distribuindo…';

  try {
    const r = await distributeWorkoutToStudents({ workoutId: est.workoutId, turmas: enviaveis, dryRun });
    store.atualizar({ fichas: r.fichas });

    if (r.semMatriz?.length) {
      // Aviso e não erro: o aluno recebe o treino da turma como está. O coach
      // precisa saber para cadastrar a matriz, mas a aula não para por isso.
      await avisar({
        titulo: 'Alunos sem matriz de individualização',
        texto: `${r.semMatriz.length} aluno(s) ainda não têm lesões, restrições e 1RM cadastrados — `
          + 'eles recebem o treino da turma sem ajuste. Cadastre a matriz na aba "Matriz" da ficha.',
      });
    }
    if (!dryRun) {
      await avisar({
        titulo: 'Treino distribuído',
        texto: `${r.gravadas} ficha(s) gravada(s) em ${enviaveis.length} horário(s), para a aula de ${est.dateId}.`,
      });
    }
  } catch (e) {
    await avisar({ titulo: dryRun ? 'Não deu para prever' : 'Não deu para distribuir', texto: /** @type {Error} */ (e).message });
  } finally {
    ocupado = false;
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function cardDaFicha(f) {
  const linhas = (f.linhas || []).map((l) => `
    <li class="ex">
      <div class="ex-topo">
        <span class="ex-nome">${esc(l.nome)}</span>
        <span class="ex-prescricao">${l.series ? `${l.series}×` : ''}${esc(l.reps || '')}</span>
      </div>
      <div class="ex-baixo">
        ${l.cargaKg != null
          ? `<span class="ex-chip carga">${l.cargaKg} kg${l.percentual ? ` · ${l.percentual}% 1RM` : ''}</span>`
          : '<span class="ex-chip mudo">sem 1RM</span>'}
        ${l.implemento ? `<span class="ex-chip mudo">${esc(l.implemento)}</span>` : ''}
        ${l.observacao ? `<span class="ex-obs">${esc(l.observacao)}</span>` : ''}
      </div>
      ${(l.motivos || []).map((m) => `<p class="ex-motivo">${esc(m)}</p>`).join('')}
    </li>`).join('');

  const removidos = (f.removidos || []).length
    ? `<div class="nota nota-aviso"><b>Fora da ficha</b>
         <ul>${f.removidos.map((r) => `<li>${esc(r.nome)}<small>${esc(r.motivo)}</small></li>`).join('')}</ul>
       </div>`
    : '';

  const avisos = (f.avisos || []).length
    ? `<div class="nota"><ul>${f.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`
    : '';

  return `
    <article class="card ficha">
      <header class="ficha-h">
        <h4>${esc(f.nome)}</h4>
        <span class="ex-chip mudo">${esc(f.nivel || 'sem nível')}</span>
        ${f.email ? '' : '<span class="ex-chip aviso">sem e-mail — não chega ao Portal</span>'}
      </header>
      <ul class="bloco-lista">${linhas}</ul>
      ${removidos}${avisos}
    </article>`;
}
