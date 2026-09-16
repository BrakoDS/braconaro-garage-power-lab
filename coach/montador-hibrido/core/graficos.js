// @ts-check
/**
 * GEOMETRIA DOS GRÁFICOS do Dashboard de Volume — matemática pura, sem DOM.
 *
 * Os gráficos são SVG escrito à mão, sem biblioteca, pelo mesmo motivo que o
 * resto do site não tem bundler: a página é servida estática e uma dependência
 * de gráfico custaria mais bytes que a ferramenta inteira. O que separa "SVG à
 * mão" de "SVG improvisado" é isto aqui: a conta de onde cada marca vai fica
 * num módulo puro, testado, e quem desenha só interpola string.
 *
 * DECISÕES DE LEITURA que estão codificadas aqui, e por quê:
 *
 *  - UM EIXO SÓ. `escalaBarras` mede a barra do prescrito E a marca da meta
 *    contra o MESMO máximo. Duas escalas no mesmo gráfico fariam "prescrito"
 *    parecer maior ou menor que a meta por causa da régua, não do treino.
 *
 *  - UMA COR PARA TODAS AS BARRAS. O grupamento (peito, costas, perna) é
 *    categoria sem ordem natural: pintar a barra maior de um tom mais forte
 *    codificaria o comprimento duas vezes e não diria nada novo. Quem informa é
 *    o comprimento; a cor é identidade da série, e a série é uma só.
 *
 *  - A ROSCA PARA EM 6 FATIAS. Acima disso as fatias vizinhas ficam
 *    indistinguíveis e a legenda vira lista. O excedente vai para "Outros", com
 *    o detalhe na tabela — não em uma sétima cor inventada.
 */

/**
 * As cores das fatias da rosca, em ordem FIXA.
 *
 * Ordem fixa e não sorteada/por tamanho: o coach abre o dashboard toda semana, e
 * "barra é azul" só vira leitura automática se barra for azul sempre. Atribuir
 * cor por posição no ranking repintaria o gráfico inteiro quando o mês mudasse
 * a ordem.
 *
 * Validadas como conjunto contra o fundo escuro do painel (#121212): todas
 * dentro da faixa de luminosidade, acima do piso de croma, contraste ≥ 3:1 e
 * separação para daltonismo acima do alvo no pior par vizinho.
 */
export const PALETA_ROSCA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];

/** A cor do agregado "Outros" — cinza de propósito: não é uma categoria, é o resto. */
export const COR_OUTROS = '#6E7781';

/** Quantas fatias a rosca mostra antes de agregar o resto. */
export const MAX_FATIAS = PALETA_ROSCA.length;

/**
 * Abaixo desta fatia o rótulo não cabe DENTRO do anel e vai só para a legenda.
 *
 * O número saiu de medir, não de chutar: "12,2%" ocupa cerca de 30 unidades do
 * viewBox na fonte do gráfico, e a banda do anel tem 32. Numa fatia de 7% o
 * arco no raio médio é mais estreito que o próprio texto, e o rótulo vaza por
 * cima da fatia vizinha — o caso exato de rótulo cortado pela própria marca. A
 * 15% o arco tem folga de sobra, e quem ficou de fora não perdeu nada: a
 * legenda ao lado traz o percentual de TODAS as fatias, com a cor ao lado.
 */
const PCT_MINIMO_ROTULO = 15;

/**
 * @typedef {Object} ItemBarra
 * @property {string} rotulo
 * @property {number} valor   séries prescritas
 * @property {number} meta    meta do período
 *
 * @typedef {Object} BarraCalculada
 * @property {string} rotulo
 * @property {number} valor
 * @property {number} meta
 * @property {number} pctValor  largura da barra, 0-100
 * @property {number} pctMeta   posição da marca de meta, 0-100
 * @property {number} saldo     valor − meta
 * @property {'abaixo'|'na_meta'|'acima'} estado
 */

/**
 * Barras do tracker, todas na mesma régua.
 *
 * O máximo inclui as METAS e não só os valores: uma semana em que nenhum grupo
 * chegou perto da meta desenharia barras enormes contra uma marca de meta fora
 * da tela se a régua olhasse só o prescrito — o coach leria "volume alto" numa
 * semana fraca.
 *
 * `folga` afasta a maior barra da borda do cartão, para o rótulo do valor caber
 * do lado de fora em vez de ser cortado dentro da marca.
 *
 * @param {ItemBarra[]} itens
 * @param {{folga?: number}} [opcoes]
 * @returns {BarraCalculada[]}
 */
export function escalaBarras(itens, { folga = 1.1 } = {}) {
  const lista = (itens || []).map((i) => ({
    rotulo: String(i.rotulo || ''),
    valor: Math.max(0, Number(i.valor) || 0),
    meta: Math.max(0, Number(i.meta) || 0),
  }));
  const bruto = Math.max(0, ...lista.map((i) => Math.max(i.valor, i.meta)));
  // Régua zero (semana sem treino e sem meta) vira 1 para não dividir por zero:
  // todas as barras saem em 0%, que é a leitura correta.
  const max = bruto > 0 ? bruto * folga : 1;

  return lista.map((i) => {
    const saldo = Math.round((i.valor - i.meta) * 10) / 10;
    return {
      ...i,
      pctValor: Math.round((i.valor / max) * 1000) / 10,
      pctMeta: Math.round((i.meta / max) * 1000) / 10,
      saldo,
      estado: saldo < 0 ? 'abaixo' : saldo > 0 ? 'acima' : 'na_meta',
    };
  });
}

/**
 * @typedef {Object} Fatia
 * @property {string} rotulo
 * @property {number} valor
 *
 * @typedef {Object} ArcoCalculado
 * @property {string} rotulo
 * @property {number} valor
 * @property {number} pct
 * @property {string} cor
 * @property {string} d           o atributo `d` do <path>
 * @property {boolean} rotulavel  a fatia é grande o bastante para o rótulo caber dentro?
 * @property {{x: number, y: number}} centro  onde o rótulo de dentro vai
 */

/** Ponto na circunferência. Ângulo em radianos, 0 = meio-dia, sentido horário. */
function ponto(cx, cy, raio, ang) {
  return { x: cx + raio * Math.sin(ang), y: cy - raio * Math.cos(ang) };
}

const arredonda = (n) => Math.round(n * 100) / 100;

/**
 * Os arcos da rosca de variabilidade.
 *
 * O vão de 2px entre fatias é desenhado como VÃO e não como contorno: um
 * contorno em volta de cada fatia engrossa a marca e cria uma cor a mais no
 * gráfico. O vão deixa o fundo do cartão aparecer, que é o que separa de
 * verdade.
 *
 * Fatia única (o box que só usou barra o mês inteiro) vira anel fechado: um
 * arco cujo início e fim coincidem é um `d` degenerado, que alguns navegadores
 * desenham como nada. Dois semicírculos resolvem sem caso especial na tela.
 *
 * @param {Fatia[]} fatias
 * @param {{cx?: number, cy?: number, raio?: number, espessura?: number, vaoPx?: number}} [opcoes]
 * @returns {{arcos: ArcoCalculado[], total: number}}
 */
export function arcosRosca(fatias, { cx = 100, cy = 100, raio = 80, espessura = 32, vaoPx = 2 } = {}) {
  const limpas = (fatias || [])
    .map((f) => ({ rotulo: String(f.rotulo || ''), valor: Math.max(0, Number(f.valor) || 0) }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  // Além de MAX_FATIAS, o excedente vira "Outros" — nunca uma cor nova.
  const visiveis = limpas.slice(0, MAX_FATIAS);
  const resto = limpas.slice(MAX_FATIAS);
  if (resto.length) {
    visiveis.push({ rotulo: `Outros (${resto.length})`, valor: resto.reduce((s, f) => s + f.valor, 0) });
  }

  const total = visiveis.reduce((s, f) => s + f.valor, 0);
  if (!total) return { arcos: [], total: 0 };

  const rMedio = raio - espessura / 2;
  const rInterno = raio - espessura;
  // O vão em pixels vira ângulo no raio médio; sem isso o vão pareceria maior
  // na borda externa do anel do que na interna.
  const vaoAng = rMedio > 0 ? vaoPx / rMedio : 0;

  /** @type {ArcoCalculado[]} */
  const arcos = [];
  let ang = 0;

  for (const [i, f] of visiveis.entries()) {
    const fatiaAng = (f.valor / total) * Math.PI * 2;
    const ehUnica = visiveis.length === 1;
    // Fatia menor que o próprio vão não sobreviveria ao recuo: desenha sem vão
    // e deixa a legenda diferenciar.
    const recuo = !ehUnica && fatiaAng > vaoAng * 2 ? vaoAng / 2 : 0;
    const ini = ang + recuo;
    const fim = ang + fatiaAng - recuo;

    let d;
    if (ehUnica) {
      // Anel fechado: dois semicírculos externos e dois internos.
      const t = ponto(cx, cy, raio, 0), b = ponto(cx, cy, raio, Math.PI);
      const ti = ponto(cx, cy, rInterno, 0), bi = ponto(cx, cy, rInterno, Math.PI);
      d = `M ${arredonda(t.x)} ${arredonda(t.y)}`
        + ` A ${raio} ${raio} 0 0 1 ${arredonda(b.x)} ${arredonda(b.y)}`
        + ` A ${raio} ${raio} 0 0 1 ${arredonda(t.x)} ${arredonda(t.y)} Z`
        + ` M ${arredonda(ti.x)} ${arredonda(ti.y)}`
        + ` A ${rInterno} ${rInterno} 0 0 0 ${arredonda(bi.x)} ${arredonda(bi.y)}`
        + ` A ${rInterno} ${rInterno} 0 0 0 ${arredonda(ti.x)} ${arredonda(ti.y)} Z`;
    } else {
      const maior = fim - ini > Math.PI ? 1 : 0;
      const pe = ponto(cx, cy, raio, ini);
      const pf = ponto(cx, cy, raio, fim);
      const pi = ponto(cx, cy, rInterno, fim);
      const pii = ponto(cx, cy, rInterno, ini);
      d = `M ${arredonda(pe.x)} ${arredonda(pe.y)}`
        + ` A ${raio} ${raio} 0 ${maior} 1 ${arredonda(pf.x)} ${arredonda(pf.y)}`
        + ` L ${arredonda(pi.x)} ${arredonda(pi.y)}`
        + ` A ${rInterno} ${rInterno} 0 ${maior} 0 ${arredonda(pii.x)} ${arredonda(pii.y)} Z`;
    }

    const pct = Math.round((f.valor / total) * 1000) / 10;
    const meio = ponto(cx, cy, rMedio, ang + fatiaAng / 2);
    arcos.push({
      rotulo: f.rotulo,
      valor: f.valor,
      pct,
      cor: f.rotulo.startsWith('Outros') && resto.length ? COR_OUTROS : PALETA_ROSCA[i % PALETA_ROSCA.length],
      d,
      rotulavel: pct >= PCT_MINIMO_ROTULO,
      centro: { x: arredonda(meio.x), y: arredonda(meio.y) },
    });
    ang += fatiaAng;
  }

  return { arcos, total };
}

/**
 * @typedef {Object} PontoLinha
 * @property {string} rotulo
 * @property {number} valor
 * @property {number} x
 * @property {number} y
 *
 * @typedef {Object} LinhaCalculada
 * @property {PontoLinha[]} pontos
 * @property {string} d       o `d` da polilinha
 * @property {number} max     topo da régua
 * @property {PontoLinha|null} ultimo  o ponto a rotular diretamente
 */

/**
 * A linha do volume ao longo das semanas do mês.
 *
 * A régua começa SEMPRE em zero. Cortar o eixo no menor valor faria uma
 * variação de 40 para 44 séries parecer que o volume dobrou — é o jeito mais
 * fácil de mentir com um gráfico de linha, e o coach usa este número para
 * decidir carga.
 *
 * Só o ÚLTIMO ponto vem marcado para rótulo direto: um número em cima de cada
 * ponto é ruído que ninguém lê, e o resto dos valores está na tabela e no
 * tooltip.
 *
 * @param {{rotulo: string, valor: number}[]} serie
 * @param {{largura?: number, altura?: number, margem?: number}} [opcoes]
 * @returns {LinhaCalculada}
 */
export function pontosLinha(serie, { largura = 320, altura = 120, margem = 10 } = {}) {
  const lista = (serie || []).map((p) => ({
    rotulo: String(p.rotulo || ''),
    valor: Math.max(0, Number(p.valor) || 0),
  }));
  if (!lista.length) return { pontos: [], d: '', max: 0, ultimo: null };

  const max = Math.max(1, ...lista.map((p) => p.valor));
  const util = { l: largura - margem * 2, a: altura - margem * 2 };
  const passo = lista.length > 1 ? util.l / (lista.length - 1) : 0;

  const pontos = lista.map((p, i) => ({
    ...p,
    x: arredonda(margem + passo * i),
    y: arredonda(margem + util.a - (p.valor / max) * util.a),
  }));

  return {
    pontos,
    d: pontos.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '),
    max,
    ultimo: pontos[pontos.length - 1],
  };
}
