// @ts-check
/**
 * MÓDULO 4 — DASHBOARD DE VOLUME.
 *
 * Três leituras do mesmo ciclo: o tracker da semana (prescrito × meta por
 * grupamento), o relatório do mês (o fechamento e o saldo) e a rosca de
 * variabilidade (a fatia de cada implemento).
 *
 * Os gráficos são SVG escrito à mão. A geometria — onde cada marca vai — mora em
 * `core/graficos.js`, que é puro e testado; aqui só se interpola string. Isso é
 * o que separa "SVG à mão" de "SVG improvisado": a conta que decide se uma barra
 * mente tem teste, e a que decide se ela é dourada, não precisa.
 *
 * DECISÕES DE LEITURA (o resto do porquê está em `core/graficos.js`):
 *  - UMA COR PARA TODAS AS BARRAS. Grupamento é categoria sem ordem; pintar a
 *    maior mais forte codificaria o comprimento duas vezes.
 *  - A RÉGUA INCLUI A META e começa em zero, nos dois gráficos. Cortar o eixo é
 *    o jeito mais fácil de fazer uma semana fraca parecer cheia, e é com este
 *    número que o coach decide carga.
 *  - TABELA SEMPRE DISPONÍVEL, ao lado de cada gráfico. Quem não distingue as
 *    fatias da rosca (e quem vai imprimir a semana) precisa dos números.
 */
import { GRUPOS, GRUPO_LABEL } from '../../../compartilhado/regras/grupos.js';
import { escalaBarras, arcosRosca, pontosLinha } from '../core/graficos.js';
import { chaveSemana, chaveMes, rotuloMes, rotuloSemana, semanasDoMes, faixaDaSemana } from '../core/periodos.js';
import { lerConsolidado, marcaDasLousas } from '../cloud/chamadas.js';
import { esc } from './render-treino.js';
import * as store from './store.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** A cor da série única: o dourado da marca, o mesmo de todo botão do painel. */
const COR_SERIE = '#FFC700';
/** Grade e eixo ficam um tom acima do fundo do cartão — presentes, nunca competindo com a marca. */
const COR_GRADE = 'rgba(255,255,255,.10)';

/** @param {{uid: () => string}} ctx */
export function montar(ctx) {
  const alvo = $('#volume-corpo');
  const campoData = $('#volume-data');
  if (!alvo) return;

  campoData.value = store.ler().dateId;
  campoData.addEventListener('change', () => carregar(ctx, alvo, campoData.value));

  $('#volume-recarregar')?.addEventListener('click', () => carregar(ctx, alvo, campoData.value));

  // Carrega ao abrir a aba, e não no boot: o consolidado são várias leituras do
  // Firestore, e o coach que só quer montar a aula de hoje nunca abre esta tela.
  //
  // Recarrega depois de qualquer gravação, pelo mesmo motivo do Calendário: ler
  // uma vez só por sessão mostrava a semana SEM o treino que o coach acabou de
  // salvar. Aqui o número errado é pior que uma tela vazia — ele parece certo.
  //
  // O consolidado é escrito por um GATILHO, que leva alguns segundos depois da
  // gravação; por isso o botão "Recarregar" continua existindo, para o caso de
  // o coach chegar na aba antes de o servidor terminar.
  let marcaLida = -1;
  document.addEventListener('hibrido:aba', (ev) => {
    if (/** @type {any} */ (ev).detail !== 'volume') return;
    if (marcaLida === marcaDasLousas()) return;
    marcaLida = marcaDasLousas();
    carregar(ctx, alvo, campoData.value);
  });
}

async function carregar(ctx, alvo, dateId) {
  const semana = chaveSemana(dateId);
  const mes = chaveMes(dateId);
  if (!semana || !mes) {
    alvo.innerHTML = '<p class="vazio">Escolha uma data válida.</p>';
    return;
  }

  alvo.innerHTML = '<p class="vazio">Carregando o consolidado…</p>';

  try {
    const uid = ctx.uid();
    const chavesSemana = semanasDoMes(mes);
    // Em paralelo: são leituras independentes, e em série o coach esperaria a
    // soma dos tempos para ver uma tela só.
    const [doSemana, doMes, ...dasSemanas] = await Promise.all([
      lerConsolidado(uid, semana),
      lerConsolidado(uid, mes),
      ...chavesSemana.map((s) => lerConsolidado(uid, s.chave)),
    ]);

    const serieMensal = chavesSemana.map((s, i) => ({
      rotulo: s.rotulo,
      valor: Number(dasSemanas[i]?.totalSeries) || 0,
    }));

    alvo.innerHTML = [
      trackerSemanal(doSemana, dateId),
      relatorioMensal(doMes, mes, serieMensal),
      roscaVariabilidade(doMes, mes),
    ].join('');
  } catch (e) {
    console.error('Falha ao ler o consolidado de volume:', e);
    alvo.innerHTML = `<div class="card"><h3>Não deu para ler o volume</h3>
      <p class="mut">${esc(/** @type {Error} */ (e).message || 'Confira a conexão e tente de novo.')}</p></div>`;
  }
}

/** O cartão de "ainda não existe consolidado" — situação normal, não erro. */
function aindaNao(titulo, periodo) {
  return `<section class="card">
    <h3>${esc(titulo)}</h3>
    <p class="mut">Nenhum treino consolidado em ${esc(periodo)} ainda. O consolidado é recalculado
    alguns segundos depois de cada lousa salva.</p>
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Tracker semanal — barras: prescrito × meta
 * ------------------------------------------------------------------ */

function trackerSemanal(c, dateId) {
  if (!c) return aindaNao('Tracker semanal', rotuloSemana(dateId) || 'esta semana');
  const { inicio, fim } = faixaDaSemana(dateId);

  const itens = GRUPOS.map((g) => ({
    rotulo: GRUPO_LABEL[g] || g,
    valor: Number(c.porGrupo?.[g]) || 0,
    meta: Number(c.metas?.[g]) || 0,
  }));

  return `<section class="card">
    <header class="grafico-h">
      <h3>Tracker semanal</h3>
      <p class="mut">${esc(rotuloSemana(dateId))} · ${c.treinos || 0} treino(s) · ${c.totalSeries || 0} séries prescritas</p>
    </header>
    ${chaveMarca()}
    ${barras(itens)}
    ${tabela(itens, 'Semana', `${inicio} a ${fim}`)}
  </section>`;
}

function relatorioMensal(c, mes, serie) {
  if (!c) return aindaNao('Relatório mensal', rotuloMes(mes));

  const itens = GRUPOS.map((g) => ({
    rotulo: GRUPO_LABEL[g] || g,
    valor: Number(c.porGrupo?.[g]) || 0,
    meta: Number(c.metas?.[g]) || 0,
  }));
  const calculadas = escalaBarras(itens);
  const abaixo = calculadas.filter((b) => b.estado === 'abaixo');

  return `<section class="card">
    <header class="grafico-h">
      <h3>Relatório mensal</h3>
      <p class="mut">${esc(rotuloMes(mes))} · ${c.treinos || 0} treino(s) · ${c.totalSeries || 0} séries prescritas</p>
    </header>
    ${chaveMarca()}
    ${barras(itens)}
    <p class="balanco">
      ${abaixo.length
        ? `<b>${abaixo.length} grupamento(s) abaixo da meta do ciclo:</b> ${abaixo.map((b) => `${esc(b.rotulo)} (${b.saldo})`).join(', ')}.`
        : '<b>Todos os grupamentos fecharam o ciclo na meta ou acima.</b>'}
    </p>
    <h4 class="grafico-sub">Volume por semana do mês</h4>
    ${linha(serie)}
    ${tabela(itens, 'Mês', rotuloMes(mes))}
  </section>`;
}

/** A chave da marca de meta. Não é legenda de cor (a série é uma só) — é o que aquele tracinho significa. */
function chaveMarca() {
  return `<p class="chave-marca">
    <span class="chave-barra" style="background:${COR_SERIE}"></span> prescrito
    <span class="chave-meta"></span> meta do período
  </p>`;
}

/**
 * As barras horizontais.
 *
 * Horizontal e não vertical porque os rótulos são palavras ("Posterior de
 * coxa"): em barras verticais eles sairiam inclinados ou abreviados. O valor vai
 * FORA da ponta da barra — dentro, ele seria cortado justamente nas barras
 * curtas, que são as que o coach mais precisa ler.
 */
function barras(itens) {
  const linhas = escalaBarras(itens).map((b) => `
    <div class="barra-linha">
      <span class="barra-rot">${esc(b.rotulo)}</span>
      <span class="barra-trilho" title="${esc(b.rotulo)}: ${b.valor} séries · meta ${b.meta}">
        <span class="barra-fill" style="width:${b.pctValor}%;background:${COR_SERIE}"></span>
        <span class="barra-meta" style="left:${b.pctMeta}%"></span>
      </span>
      <span class="barra-val ${b.estado}">${b.valor}<small>/${b.meta}</small></span>
    </div>`).join('');
  return `<div class="barras">${linhas}</div>`;
}

/**
 * A linha do volume ao longo das semanas.
 *
 * `preserveAspectRatio="none"` fora de propósito: esticar o SVG deformaria a
 * espessura do traço junto. O viewBox é fixo e o SVG escala inteiro.
 */
function linha(serie) {
  const r = pontosLinha(serie, { largura: 320, altura: 120, margem: 14 });
  if (!r.pontos.length) return '<p class="vazio">Sem semanas consolidadas neste mês ainda.</p>';

  const grade = [0, 0.5, 1].map((f) => {
    const y = 14 + (120 - 28) * f;
    return `<line x1="14" y1="${y}" x2="306" y2="${y}" stroke="${COR_GRADE}" stroke-width="1" />`;
  }).join('');

  const marcas = r.pontos.map((p) => `
    <circle cx="${p.x}" cy="${p.y}" r="4" fill="${COR_SERIE}" stroke="#121212" stroke-width="2">
      <title>${esc(p.rotulo)}: ${p.valor} séries</title>
    </circle>`).join('');

  return `
    <figure class="grafico-linha">
      <svg viewBox="0 0 320 140" role="img" aria-label="Séries prescritas por semana do mês">
        ${grade}
        <path d="${r.d}" fill="none" stroke="${COR_SERIE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        ${marcas}
        ${r.ultimo ? `<text x="${Math.min(r.ultimo.x, 292)}" y="${Math.max(r.ultimo.y - 10, 12)}"
            text-anchor="end" class="svg-rot">${r.ultimo.valor}</text>` : ''}
        ${r.pontos.map((p, i) => `<text x="${p.x}" y="134" text-anchor="${i === 0 ? 'start' : i === r.pontos.length - 1 ? 'end' : 'middle'}"
            class="svg-eixo">${esc(p.rotulo.slice(0, 5))}</text>`).join('')}
      </svg>
      <figcaption class="mut">Topo da régua: ${r.max} séries. A régua começa em zero.</figcaption>
    </figure>`;
}

/* ------------------------------------------------------------------ *
 * Rosca de variabilidade
 * ------------------------------------------------------------------ */

function roscaVariabilidade(c, mes) {
  if (!c) return aindaNao('Variabilidade de implementos', rotuloMes(mes));

  const fatias = Object.entries(c.porImplemento || {}).map(([rotulo, valor]) => ({ rotulo, valor: Number(valor) || 0 }));
  const { arcos, total } = arcosRosca(fatias, { cx: 100, cy: 100, raio: 84, espessura: 32 });

  if (!arcos.length) {
    return `<section class="card"><h3>Variabilidade de implementos</h3>
      <p class="mut">Nenhum implemento registrado em ${esc(rotuloMes(mes))}.</p></section>`;
  }

  const caminhos = arcos.map((a) => `
    <path d="${a.d}" fill="${a.cor}">
      <title>${esc(a.rotulo)}: ${a.pct}% (${a.valor} exercícios)</title>
    </path>`).join('');

  // Só as fatias grandes recebem número dentro do arco; as pequenas ficariam
  // com o texto transbordando por cima da vizinha. O valor delas está na
  // legenda e na tabela.
  const rotulos = arcos.filter((a) => a.rotulavel).map((a) => `
    <text x="${a.centro.x}" y="${a.centro.y}" text-anchor="middle" dominant-baseline="central"
      class="svg-fatia">${a.pct}%</text>`).join('');

  const legenda = arcos.map((a) => `
    <li><span class="leg-bola" style="background:${a.cor}"></span>
      ${esc(a.rotulo)} <b>${a.pct}%</b></li>`).join('');

  return `<section class="card">
    <header class="grafico-h">
      <h3>Variabilidade de implementos</h3>
      <p class="mut">${esc(rotuloMes(mes))} · ${total} usos de implemento no mês</p>
    </header>
    <div class="rosca-wrap">
      <figure class="rosca">
        <svg viewBox="0 0 200 200" role="img" aria-label="Percentual de uso por implemento no mês">
          ${caminhos}${rotulos}
        </svg>
      </figure>
      <ul class="rosca-leg">${legenda}</ul>
    </div>
    ${tabela(arcos.map((a) => ({ rotulo: a.rotulo, valor: a.valor, meta: a.pct })), 'Implemento', 'exercícios · % do mês')}
  </section>`;
}

/**
 * A tabela ao lado de cada gráfico.
 *
 * Não é acessório: é o que atende quem não distingue as cores da rosca, quem lê
 * a tela por leitor de tela e quem vai imprimir a semana para levar ao box —
 * três situações em que o gráfico sozinho não entrega o número.
 */
function tabela(itens, colunaA, legenda) {
  return `<details class="tabela-dados">
    <summary>Ver números</summary>
    <table>
      <caption class="mut">${esc(legenda)}</caption>
      <thead><tr><th>${esc(colunaA)}</th><th>Valor</th><th>Referência</th></tr></thead>
      <tbody>${itens.map((i) => `<tr>
        <td>${esc(i.rotulo)}</td><td>${i.valor}</td><td>${i.meta}</td>
      </tr>`).join('')}</tbody>
    </table>
  </details>`;
}
