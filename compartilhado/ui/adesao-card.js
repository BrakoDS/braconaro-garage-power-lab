// @ts-check
/**
 * O card de adesão aos hábitos, em HTML.
 *
 * Separado do `app.js` da Gestão por dois motivos concretos: o `app.js` importa o
 * Firebase e não roda fora do navegador (então o card não poderia ser conferido
 * sem um aluno de verdade logado), e o mesmo desenho serve o Portal do Aluno no
 * dia em que ele mostrar a própria consistência.
 *
 * Só monta string: os dados vêm prontos de `compartilhado/regras/adesao.js` e o
 * estilo vem das classes `.ade-*` de `coach/gestao-de-alunos/alunos.css`.
 *
 * ## Por que um heatmap, e não um gráfico
 *
 * A pergunta do coach é "este aluno está cumprindo?", e ela se responde em um
 * olhar ou não se responde. Um gráfico de linha pede leitura de eixo; uma barra
 * por semana esconde o dia em que ele parou. O mapa de quadrados — uma coluna por
 * semana, sete linhas de segunda a domingo — mostra a CONSISTÊNCIA como textura:
 * uma faixa escura no meio de quadrados claros é vista antes de qualquer número,
 * e é exatamente o padrão que interessa (o aluno que some nos fins de semana, o
 * que desistiu há duas semanas, o que nunca falha).
 *
 * O número grande dos 7 dias fica em cima porque é o que vira conversa imediata;
 * a lista por hábito fica embaixo porque só é lida depois que o mapa já disse que
 * há algo errado.
 */

import { ORDEM_SEMANA, SIGLA_CURTA } from '../regras/adesao.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** '2026-09-23' → '23/09/26'. */
const dataCurta = (iso) => {
  const [an, m, d] = String(iso).split('-');
  return `${d}/${m}/${an.slice(2)}`;
};

/**
 * Cor do número grande — o semáforo que o coach lê antes de qualquer texto.
 * @param {number|null} pct
 */
export function corDaAdesao(pct) {
  if (pct == null) return '';
  if (pct >= 80) return 'ok';
  if (pct >= 50) return 'warn';
  return 'bad';
}

/**
 * O mapa de consistência.
 *
 * Cada quadrado é um dia; a intensidade é a faixa de `nivelDeAdesao`. Quadrado
 * sem nível (classe `n-`) é "sem dado", não "zero": antes do primeiro registro do
 * aluno, e em dia sem hábito previsto, não há adesão para medir.
 *
 * HTML e não SVG porque cada quadrado precisa de `title` — passar o mouse e ver
 * "22/09/26 · 2 de 3 (67%)" é metade da utilidade do mapa.
 *
 * @param {{semanas: any[][]}} mapa
 */
export function heatmapAdesao(mapa) {
  const rotulos = ORDEM_SEMANA.map((s) => `<span>${SIGLA_CURTA[s]}</span>`).join('');

  const semanas = mapa.semanas.map((semana) => {
    // A semana em curso vem parcial (vai só até hoje) e isso alinha sozinho: a
    // janela sempre começa numa segunda, então o 3º quadrado é sempre quarta.
    const quadrados = semana.map((d) => {
      const n = d.nivel == null ? '-' : d.nivel;
      const legenda = d.semDado
        ? `${dataCurta(d.iso)} · sem hábito previsto`
        : `${dataCurta(d.iso)} · ${d.feitos} de ${d.previstos} (${d.pct}%)${d.hoje ? ' · hoje, em curso' : ''}`;
      return `<i class="ade-q n${n}${d.hoje ? ' hoje' : ''}" title="${esc(legenda)}"></i>`;
    }).join('');
    return `<div class="ade-sem">${quadrados}</div>`;
  }).join('');

  return `<div class="ade-mapa">
      <div class="ade-rotulos">${rotulos}</div>
      <div class="ade-semanas">${semanas}</div>
    </div>
    <div class="ade-legenda">
      <span>sem dado</span><i class="ade-q n-"></i>
      <span style="margin-left:10px">pouco</span>
      <i class="ade-q n0"></i><i class="ade-q n1"></i><i class="ade-q n2"></i><i class="ade-q n3"></i><i class="ade-q n4"></i>
      <span>tudo</span>
    </div>`;
}

/**
 * Uma linha por hábito, do pior para o melhor.
 *
 * É o "cumprindo o quê" que vem depois do "está cumprindo" do mapa. Os dois
 * obrigatórios (água e creatina) levam a faixa amarela: foram prescritos pela
 * avaliação física, não escolhidos pelo aluno.
 * @param {any[]} porBloco
 */
export function listaPorHabito(porBloco) {
  if (!porBloco?.length) return '';
  const linhas = porBloco.map((b) => {
    const pct = b.pct ?? 0;
    const cor = pct >= 100 ? 'ok' : pct < 50 ? 'bad' : '';
    return `<li class="ade-bloco${b.obrigatorio ? ' obrig' : ''}">
      <span class="nome">${esc(b.nome)}${b.obrigatorio && b.detalhe ? ` <em>${esc(b.detalhe)}</em>` : ''}</span>
      <span class="ade-bar"><i class="${cor}" style="width:${pct}%"></i></span>
      <span class="val"><b>${b.feitos}</b>/${b.previstos}</span>
    </li>`;
  }).join('');
  return `<ul class="ade-blocos">${linhas}</ul>`;
}

/**
 * O card inteiro.
 *
 * Três estados diferentes antes do card cheio, e a diferença entre eles importa:
 * "não usa o app", "usa e ainda não tem histórico" e "usa e não está cumprindo"
 * pedem conversas opostas com o aluno. Um painel que mostrasse 0% nos três seria
 * pior que painel nenhum.
 *
 * @param {ReturnType<import('../regras/adesao.js').resumoDeAdesao>} r
 * @param {{ nome?: string, waHref?: (texto: string) => string }} [ctx]
 */
export function cardDeAdesao(r, ctx = {}) {
  if (!r.temRotina) {
    return `<div class="prog-ph">O aluno ainda não montou a rotina no app.
      Água e creatina entram sozinhas assim que houver avaliação física registrada.</div>`;
  }
  if (!r.temHistorico) {
    return `<div class="prog-ph">Rotina com ${r.blocos} hábitos publicada, mas nenhum dia marcado
      ainda — o histórico começa no primeiro hábito que ele concluir.</div>`;
  }

  const pct = r.semana.pct ?? 0;
  const nome1 = String(ctx.nome || '').trim().split(/\s+/)[0] || 'Você';

  // Só oferece o WhatsApp quando há o que dizer: parabenizar quem está indo bem
  // ou chamar quem sumiu. No meio da tabela, mensagem automática vira ruído.
  let zap = '';
  if (ctx.waHref && pct >= 80) {
    zap = `<a class="btn btn-sm med-wa" target="_blank" rel="noopener" href="${ctx.waHref(
      `${nome1}, ${pct}% dos seus hábitos cumpridos na semana. É exatamente assim que o resultado aparece. 💪`,
    )}">Parabenizar</a>`;
  } else if (ctx.waHref && pct < 50) {
    zap = `<a class="btn btn-sm" target="_blank" rel="noopener" href="${ctx.waHref(
      `${nome1}, vi que os hábitos da semana ficaram em ${pct}%. Quer ajustar a rotina no app para algo mais fácil de manter?`,
    )}">Chamar no WhatsApp</a>`;
  }

  const semAvaliacao = r.obrigatorios.length === 0
    ? ' · sem avaliação física, água e creatina ainda não entram na rotina'
    : '';

  return `
    <div class="ade-topo">
      <div class="ade-num"><b class="${corDaAdesao(pct)}">${pct}%</b><small>dos hábitos nos últimos 7 dias</small></div>
      <div class="ade-chips">
        <span class="ade-chip">30 dias: <b>${r.mes.pct == null ? '—' : `${r.mes.pct}%`}</b></span>
        ${r.sequencia > 0
          ? `<span class="ade-chip ok">🔥 <b>${r.sequencia}</b> ${r.sequencia === 1 ? 'dia completo seguido' : 'dias completos seguidos'}</span>`
          : '<span class="ade-chip">sem sequência ativa</span>'}
        ${zap}
      </div>
    </div>
    ${heatmapAdesao(r.mapa)}
    ${listaPorHabito(r.porBloco)}
    <p class="ade-nota">${r.semana.feitos} de ${r.semana.previstos} hábitos previstos nos últimos 7 dias.
      Histórico desde ${dataCurta(r.desde)}${semAvaliacao}.</p>`;
}
