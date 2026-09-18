// @ts-check
/**
 * CALENDÁRIO DE TREINOS — o mês inteiro numa tela.
 *
 * O box já teve esta visão e ela ficou de fora desta versão. É onde o coach
 * enxerga o mês de uma vez: o que já foi dado, o que está marcado, e o buraco de
 * terça que ninguém tinha notado olhando um dia por vez.
 *
 * ── Passado é registro; hoje e o futuro são rascunho ─────────────────────────
 * Clicar num treino de hoje ou de depois REABRE a lousa para edição. Clicar num
 * treino passado abre um painel de leitura. A diferença não é zelo: o
 * consolidado de volume já CONTOU aquele treino, e deixar reescrever uma terça
 * de três semanas atrás faria o gráfico do mês mudar sozinho, sem nada na tela
 * explicando por quê.
 *
 * ── A cor do chip vem da tabela compartilhada ────────────────────────────────
 * `COR_MODALIDADE` (`compartilhado/config/cores-modalidade.js`) é a mesma que o
 * calendário do Montador e o do Portal do Aluno já usam. Um mapa próprio aqui
 * daria ao mesmo treino uma cor nesta tela e outra no celular do aluno.
 */
import { COR_MODALIDADE } from '../../../compartilhado/config/cores-modalidade.js';
import {
  gradeDoMes, agruparPorDia, editavel, mesVizinho, mesDe, chaveDeCor, DIAS_SEMANA,
} from '../core/calendario.js';
import { resumo } from '../core/lousa-modelo.js';
import { listarLousas, marcaDasLousas } from '../cloud/chamadas.js';
import { cardsDoTreino, esc } from './render-treino.js';
import { abrirTreinoSalvo } from './lousa.js';
import * as store from './store.js';
import { painel, avisar } from '../../../compartilhado/ui/dialogo.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** Cinza neutro para sistema que não está na tabela de modalidades. */
const COR_SEM_MODALIDADE = { bg: '#3a3a42', fg: '#e8eaed' };

let mesAtual = '';
/** @type {Record<string, any[]>} */
let porDia = {};
let carregando = false;
/** A marca de `marcaDasLousas()` de quando este mês foi lido com sucesso. */
let marcaLida = -1;

/** @param {{uid: () => string, irPara: (aba: string) => void}} ctx */
export function montar(ctx) {
  const alvo = $('#calendario-corpo');
  if (!alvo) return;

  mesAtual = mesDe(store.ler().dateId);

  $('#cal-anterior')?.addEventListener('click', () => { mesAtual = mesVizinho(mesAtual, -1); carregar(ctx, alvo); });
  $('#cal-seguinte')?.addEventListener('click', () => { mesAtual = mesVizinho(mesAtual, 1); carregar(ctx, alvo); });
  $('#cal-hoje')?.addEventListener('click', () => { mesAtual = mesDe(hojeId()); carregar(ctx, alvo); });

  alvo.addEventListener('click', (ev) => {
    const chip = /** @type {HTMLElement} */ (ev.target).closest('[data-treino]');
    if (chip) return abrirTreino(ctx, chip.getAttribute('data-treino') || '');
    // Clicar num dia VAZIO já deixa a lousa pronta naquela data — é o gesto de
    // "quero montar o treino desse dia", e sem isto o coach teria de ir na aba
    // anterior e digitar a data de novo.
    const dia = /** @type {HTMLElement} */ (ev.target).closest('[data-dia-livre]');
    if (dia) {
      store.atualizar({ dateId: dia.getAttribute('data-dia-livre') || '' });
      ctx.irPara('lousa');
    }
  });

  // Carrega quando a aba aparece, e não no boot: são leituras do Firestore, e
  // quem só quer montar a aula de hoje nunca abre esta tela.
  //
  // E RECARREGA depois de qualquer gravação. Ler uma vez só por sessão fazia o
  // treino recém-salvo não aparecer no mês — e o gesto que esta tela mesma
  // ensina ("clique num dia vazio para montar nele") leva direto a isso: o
  // coach sai daqui, monta, distribui, volta, e o dia continua vazio. Ele
  // conclui que não salvou, e remonta o treino que já estava lá.
  //
  // A marca evita o outro extremo: quem só passeia entre as abas não paga uma
  // releitura do mês a cada clique.
  document.addEventListener('hibrido:aba', (ev) => {
    if (/** @type {any} */ (ev).detail !== 'calendario') return;
    if (marcaLida === marcaDasLousas()) return;
    carregar(ctx, alvo);
  });
}

function hojeId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function carregar(ctx, alvo) {
  if (carregando) return;
  carregando = true;
  desenhar(alvo, { carregando: true });
  try {
    // A faixa cobre a GRADE, não o mês: a primeira e a última linha mostram dias
    // vizinhos, e buscar só o mês deixaria aqueles dias sempre vazios — o coach
    // acharia que não houve treino na segunda que abre a semana.
    const grade = gradeDoMes(mesAtual, hojeId());
    const dias = grade.semanas.flat();
    const inicio = dias[0]?.dateId || `${mesAtual}-01`;
    const fim = dias[dias.length - 1]?.dateId || `${mesAtual}-31`;
    porDia = agruparPorDia(await listarLousas(ctx.uid(), inicio, fim));
    // Só aqui, e não ao entrar na aba: se a leitura falhar, a próxima visita
    // tem de tentar de novo em vez de ficar presa a um mês vazio.
    marcaLida = marcaDasLousas();
  } catch (e) {
    console.error('Falha ao ler os treinos do mês:', e);
    porDia = {};
    alvo.innerHTML = `<div class="card"><h3>Não deu para ler o mês</h3>
      <p class="mut">${esc(/** @type {Error} */ (e).message || 'Confira a conexão e tente de novo.')}</p></div>`;
    carregando = false;
    return;
  }
  carregando = false;
  desenhar(alvo);
}

function desenhar(alvo, { carregando: emCurso = false } = {}) {
  const grade = gradeDoMes(mesAtual, hojeId());
  const rotulo = $('#cal-mes');
  if (rotulo) rotulo.textContent = grade.rotulo;

  if (!grade.semanas.length) {
    alvo.innerHTML = '<p class="vazio">Mês inválido.</p>';
    return;
  }

  const cabecalho = DIAS_SEMANA.map((d) => `<div class="cal-dow">${esc(d)}</div>`).join('');
  const celulas = grade.semanas.flat().map((d) => celula(d, porDia[d.dateId] || [])).join('');

  const total = grade.semanas.flat()
    .filter((d) => !d.foraDoMes)
    .reduce((n, d) => n + (porDia[d.dateId]?.length || 0), 0);

  alvo.innerHTML = `
    <div class="card">
      ${emCurso ? '<p class="mut" style="margin:0 0 10px">Carregando os treinos do mês…</p>' : ''}
      <div class="cal-grade">${cabecalho}${celulas}</div>
      <p class="cal-rodape">
        ${total} treino(s) neste mês · clique num treino de hoje ou do futuro para reabrir na Lousa,
        ou num dia vazio para montar nele.
      </p>
      ${legenda()}
    </div>`;
}

function celula(dia, treinos) {
  const classes = ['cal-dia'];
  if (dia.foraDoMes) classes.push('fora');
  if (dia.ehHoje) classes.push('hoje');

  const chips = treinos.map((t) => {
    const c = COR_MODALIDADE[chaveDeCor(t.treino?.sistema)] || COR_SEM_MODALIDADE;
    const podeEditar = editavel(t.dateId, hojeId());
    // O chip mostra o TÍTULO, que é o que diferencia dois treinos do mesmo dia —
    // a cor já diz o sistema. `classTime` só aparece nos treinos salvos antes de
    // o horário sair da Lousa; hoje quem decide a hora é a aba Turma.
    const rotuloChip = t.classTime
      ? `${t.classTime} · ${t.treino?.sistema || '—'}`
      : (t.treino?.titulo || t.treino?.sistema || '—');
    return `<button class="cal-chip${podeEditar ? ' editavel' : ''}" type="button"
      data-treino="${esc(t.workoutId || '')}"
      style="background:${c.bg};color:${c.fg}"
      title="${esc(t.treino?.titulo || '')} — ${podeEditar ? 'clique para reabrir na Lousa' : 'treino passado: somente leitura'}">
      ${esc(rotuloChip)}${podeEditar ? '' : ' <span class="cal-cadeado" aria-label="somente leitura">🔒</span>'}
    </button>`;
  }).join('');

  // Dia vazio do mês vira alvo de clique; dia de fora, não — marcar o treino de
  // outro mês a partir daqui trocaria o mês debaixo do coach sem ele pedir.
  const livre = !treinos.length && !dia.foraDoMes ? ` data-dia-livre="${esc(dia.dateId)}" role="button" tabindex="0"` : '';

  return `<div class="${classes.join(' ')}"${livre}>
    <span class="cal-num">${dia.dia}</span>
    <div class="cal-chips">${chips}</div>
  </div>`;
}

function legenda() {
  const usados = ['hipertrofia', 'hiit', 'gap', 'hyrox'];
  return `<div class="cal-legenda">${usados.map((k) => {
    const c = COR_MODALIDADE[k];
    return `<span class="cal-leg"><i style="background:${c.bg}"></i>${esc(c.nome)}</span>`;
  }).join('')}</div>`;
}

async function abrirTreino(ctx, workoutId) {
  const t = Object.values(porDia).flat().find((x) => x.workoutId === workoutId);
  if (!t) return;

  if (editavel(t.dateId, hojeId())) {
    if (abrirTreinoSalvo(t)) {
      ctx.irPara('lousa');
    } else {
      await avisar({ titulo: 'Lousa indisponível', texto: 'Abra a aba Lousa uma vez e tente de novo.' });
    }
    return;
  }

  // Passado: leitura. O painel mostra o mesmo card que a prévia mostra, para o
  // coach reconhecer o treino sem ter de traduzir outro formato.
  await painel({
    titulo: `${t.treino?.titulo || 'Treino'} · ${t.dateId}${t.classTime ? ` · ${t.classTime}` : ''}`,
    corpoHTML: `
      <p class="previa-meta">${esc(resumo(t.treino))}${t.distribuido ? ' · já distribuído para a turma' : ''}</p>
      <p class="mut" style="font-size:12.5px">Treino passado — somente leitura. O consolidado de volume já contou este dia.</p>
      ${cardsDoTreino(t.treino)}`,
    largo: true,
    acoes: [],
  });
}
