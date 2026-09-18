// @ts-check
/**
 * MÓDULO 2 — MOTOR DE ALERTAS E VARIABILIDADE.
 *
 * Mostra o que a semana já tem demais (o mesmo exercício outra vez em menos de
 * 72h, barra em todo exercício, a semana inteira em um grupamento) e oferece a
 * troca em um clique.
 *
 * DUAS DECISÕES DE COMPORTAMENTO que valem explicar:
 *
 *  1. ACEITAR UMA TROCA NÃO APAGA A LISTA DE ALERTAS. O caminho óbvio seria
 *     invalidar tudo a cada mudança (é o que `store.definirTreino` faz), mas aqui
 *     isso esvaziaria a tela embaixo do dedo do coach no meio de três alertas —
 *     ele resolveria um e perderia os outros dois de vista. Em vez disso o
 *     alerta resolvido fica marcado como resolvido, e o botão de rechecar diz
 *     que a análise agora está desatualizada.
 *
 *  2. "MANTER A ESCOLHA DO COACH" É UMA AÇÃO DE VERDADE, não um "fechar".
 *     Repetir de propósito faz parte de periodização, e um motor que só oferece
 *     "trocar" está dizendo que o coach errou. Manter dispensa o alerta, e ele
 *     não volta a incomodar naquele treino.
 */
import { checkWorkoutVariability, salvarLousa } from '../cloud/chamadas.js';
import { trocarImplemento, resumo } from '../core/lousa-modelo.js';
import { cardsDoTreino, esc } from './render-treino.js';
import * as store from './store.js';
import { avisar } from '../../../compartilhado/ui/dialogo.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

const ROTULO_SEVERIDADE = { alta: 'Atenção', media: 'Revisar', baixa: 'Observação' };
const ROTULO_TIPO = {
  duplicacao: 'Duplicação < 72h',
  saturacao: 'Saturação de equipamento',
  redundancia: 'Redundância de estímulo',
};

/** Alertas que o coach já resolveu ou dispensou nesta sessão. */
const decididos = new Map();
/** A análise na tela ainda corresponde ao treino atual? */
let desatualizada = false;

/** @param {{uid: () => string, irPara: (aba: string) => void}} ctx */
export function montar(ctx) {
  const alvo = $('#alertas-corpo');
  const botao = $('#alertas-checar');
  if (!alvo || !botao) return;

  let ocupado = false;

  botao.addEventListener('click', async () => {
    const est = store.ler();
    if (ocupado) return;
    if (!est.treino) {
      await avisar({ titulo: 'Sem treino', texto: 'Reconheça a lousa primeiro — a checagem compara o treino novo com a semana.' });
      ctx.irPara('lousa');
      return;
    }

    ocupado = true;
    botao.disabled = true;
    const rotulo = botao.textContent;
    botao.textContent = 'Consultando a semana…';
    try {
      const resultado = await checkWorkoutVariability({
        structuredWorkout: est.treino,
        weekStartDate: est.dateId,
      });
      decididos.clear();
      desatualizada = false;
      store.atualizar({ alertas: resultado });
    } catch (e) {
      await avisar({ titulo: 'Não deu para checar', texto: /** @type {Error} */ (e).message });
    } finally {
      ocupado = false;
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  });

  alvo.addEventListener('click', async (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('[data-troca]');
    if (!b) return;
    const idx = Number(b.getAttribute('data-alerta'));
    const acao = b.getAttribute('data-troca');
    const alerta = store.ler().alertas?.alertas?.[idx];
    if (!alerta) return;

    if (acao === 'manter') {
      decididos.set(idx, { tipo: 'manter' });
      desenhar(alvo);
      return;
    }

    const para = b.getAttribute('data-para') || '';
    const de = b.getAttribute('data-de') || '';
    const novo = trocarImplemento(store.ler().treino, { alvo: alerta.alvo, de, para });
    // `fichas` cai fora: uma prévia de turma calculada no treino anterior
    // deixaria o coach distribuir o que ele acabou de mudar.
    store.atualizar({ treino: novo, fichas: [] });
    decididos.set(idx, { tipo: 'trocado', para });
    desatualizada = true;
    desenhar(alvo);
    await regravar(ctx, novo);
  });

  store.aoMudar(() => desenhar(alvo));
  desenhar(alvo);
}

/**
 * Regrava a lousa depois de uma troca aceita.
 *
 * Sem isto, o Firestore ficaria com o treino de antes da troca — e é ele que a
 * distribuição para a turma e o consolidado de volume leem. O coach veria a
 * troca na tela e a turma receberia o exercício antigo.
 */
async function regravar(ctx, treino) {
  const est = store.ler();
  if (!est.workoutId) return; // ainda não foi salvo; a aba da lousa salva ao aprovar
  try {
    await salvarLousa(ctx.uid(), {
      dateId: est.dateId,
      geradoEm: new Date().toISOString(),
      treino,
    }, est.workoutId);
  } catch (e) {
    console.error('Falha ao regravar a lousa após a troca:', e);
    await avisar({
      titulo: 'Troca aplicada só aqui',
      texto: 'A troca está na tela, mas não chegou à nuvem. Confira a conexão antes de distribuir para a turma.',
    });
  }
}

function desenhar(alvo) {
  const est = store.ler();
  if (!est.treino) {
    alvo.innerHTML = '<p class="vazio">Reconheça a lousa na aba anterior para checar a variabilidade da semana.</p>';
    return;
  }

  const analise = est.alertas;
  const cabecalho = `
    <div class="card">
      <h3>Treino em análise</h3>
      <p class="mut">${esc(resumo(est.treino))} · ${esc(est.dateId)}</p>
      ${cardsDoTreino(est.treino, { compacto: true })}
    </div>`;

  if (!analise) {
    alvo.innerHTML = `${cabecalho}
      <p class="vazio">Use <b>Checar variabilidade</b> para comparar este treino com os últimos 7 dias.</p>`;
    return;
  }

  const r = analise.resumo || {};
  const resumoHTML = `
    <div class="card">
      <h3>A semana até aqui</h3>
      <p class="mut">
        ${r.treinosNaJanela || 0} treino(s) na janela · ${r.exerciciosNaJanela || 0} exercícios ·
        ${r.seriesNaJanela || 0} séries
      </p>
      ${desatualizada ? '<p class="nota nota-aviso">O treino mudou depois desta análise. Cheque de novo para ver o efeito das trocas.</p>' : ''}
    </div>`;

  const alertas = analise.alertas || [];
  const lista = alertas.length
    ? alertas.map((a, i) => cardDeAlerta(a, i)).join('')
    : `<div class="card card-ok">
         <h3>Nenhum alerta</h3>
         <p class="mut">Sem repetição em menos de 72h, sem implemento saturado e sem grupamento concentrado nesta janela.</p>
       </div>`;

  alvo.innerHTML = cabecalho + resumoHTML + lista;
}

function cardDeAlerta(a, i) {
  const decidido = decididos.get(i);
  const classe = decidido ? 'card card-alerta decidido' : `card card-alerta sev-${esc(a.severidade)}`;

  const rodape = decidido
    ? `<p class="decisao">${decidido.tipo === 'manter'
        ? '✓ Mantido pelo coach.'
        : `✓ Trocado para <b>${esc(decidido.para)}</b>.`}</p>`
    : `<div class="trocas">
        ${(a.sugestoes || []).map((s) => s.acao === 'manter'
          ? `<button class="chip-troca manter" type="button" data-troca="manter" data-alerta="${i}">${esc(s.rotulo)}</button>`
          : `<button class="chip-troca" type="button" data-troca="trocar" data-alerta="${i}"
               data-de="${esc(s.de)}" data-para="${esc(s.para)}">${esc(s.rotulo)}</button>`).join('')}
      </div>`;

  return `
    <article class="${classe}">
      <header class="alerta-h">
        <span class="alerta-tipo">${esc(ROTULO_TIPO[a.tipo] || a.tipo)}</span>
        <span class="alerta-sev">${esc(ROTULO_SEVERIDADE[a.severidade] || a.severidade)}</span>
      </header>
      <h3>${esc(a.titulo)}</h3>
      <p class="mut">${esc(a.detalhe)}</p>
      ${rodape}
    </article>`;
}
