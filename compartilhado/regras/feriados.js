// @ts-check
/**
 * FERIADOS — nacionais, do estado de São Paulo e do município de Agudos.
 *
 * Mora em `compartilhado/regras/` porque as duas telas precisam concordar: o
 * calendário da Gestão mostra o feriado, e a conta da semana (`semana.js`) usa a
 * mesma lista para não cobrar presença num dia em que o box não abriu. Se cada
 * lado tivesse a própria lista, o coach veria feriado numa tela e falta na outra.
 *
 * FONTES, para quem for conferir ou corrigir:
 *  - Nacionais: Lei 662/1949, Lei 6.802/1980 (Aparecida) e Lei 14.759/2023, que
 *    tornou 20 de novembro feriado NACIONAL a partir de 2024 — antes disso era
 *    estadual/municipal em parte do país.
 *  - Estadual SP: Revolução Constitucionalista de 1932, 9 de julho.
 *  - Agudos: São Paulo Apóstolo, padroeiro, 25 de janeiro (Lei municipal
 *    5.048/2017); e o aniversário do município, 27 de julho — data da Lei 543,
 *    de 27/07/1898, que elevou o distrito a município. (Cuidado: 20/02/1899 é a
 *    instalação da câmara, não a emancipação; várias listas na internet erram
 *    isso e trazem fevereiro.)
 *
 * O que NÃO está aqui: feriado é lei, e lei muda. Quando mudar, esta lista é o
 * único lugar a corrigir — e os testes dizem se algo quebrou.
 */

/** @typedef {'nacional'|'estadual'|'municipal'|'facultativo'} TipoFeriado */
/** @typedef {{data: string, nome: string, tipo: TipoFeriado}} Feriado */

/** Dia fixo, no formato [mês, dia]. */
const FIXOS = /** @type {const} */ ([
  [1, 1, 'Confraternização Universal', 'nacional'],
  [1, 25, 'São Paulo Apóstolo — padroeiro de Agudos', 'municipal'],
  [4, 21, 'Tiradentes', 'nacional'],
  [5, 1, 'Dia do Trabalho', 'nacional'],
  [7, 9, 'Revolução Constitucionalista de 1932', 'estadual'],
  [7, 27, 'Aniversário de Agudos', 'municipal'],
  [9, 7, 'Independência do Brasil', 'nacional'],
  [10, 12, 'Nossa Senhora Aparecida', 'nacional'],
  [11, 2, 'Finados', 'nacional'],
  [11, 15, 'Proclamação da República', 'nacional'],
  [11, 20, 'Consciência Negra', 'nacional'],
  [12, 25, 'Natal', 'nacional'],
]);

const iso = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * Domingo de Páscoa pelo algoritmo de Meeus/Butcher (calendário gregoriano).
 *
 * Existe porque Carnaval, Sexta-feira Santa e Corpus Christi não têm data fixa:
 * são contados a partir da Páscoa, que por sua vez depende da lua. Sem isto, a
 * lista precisaria ser digitada ano a ano — e no primeiro ano esquecido o
 * calendário mentiria em silêncio.
 * @param {number} ano @returns {Date}
 */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** A data que cai `n` dias depois (ou antes, se negativo) de `base`. */
function desloca(base, n) {
  const d = new Date(base.getTime() + n * 86400000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Todos os feriados de um ano, ordenados por data.
 *
 * Carnaval e Corpus Christi entram como `facultativo`, não como feriado: por lei
 * são ponto facultativo, e afirmar o contrário no calendário do coach seria o
 * sistema inventando lei. O box quase sempre fecha nesses dias — mas quem decide
 * isso é ele, no botão do calendário, não esta lista.
 * @param {number} ano @returns {Feriado[]}
 */
export function feriadosDoAno(ano) {
  const p = pascoa(ano);
  /** @type {Feriado[]} */
  const lista = FIXOS.map(([mes, dia, nome, tipo]) => ({ data: iso(ano, mes, dia), nome, tipo: /** @type {TipoFeriado} */ (tipo) }));

  lista.push(
    { data: desloca(p, -48), nome: 'Carnaval (segunda)', tipo: 'facultativo' },
    { data: desloca(p, -47), nome: 'Carnaval (terça)', tipo: 'facultativo' },
    { data: desloca(p, -46), nome: 'Quarta-feira de Cinzas (até 14h)', tipo: 'facultativo' },
    // Sexta-feira Santa é tratada como feriado em todo o país (Lei 9.093/1995 a
    // nomeia entre os dias de guarda). Fica como 'nacional' porque é assim que
    // ela funciona na prática para quem monta escala de academia.
    { data: desloca(p, -2), nome: 'Sexta-feira Santa', tipo: 'nacional' },
    { data: desloca(p, 60), nome: 'Corpus Christi', tipo: 'facultativo' },
  );

  return lista.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/** Índice ano → lista, para não recalcular a cada célula do calendário. */
const _cache = new Map();
const doAno = (ano) => {
  if (!_cache.has(ano)) _cache.set(ano, feriadosDoAno(ano));
  return _cache.get(ano);
};

/**
 * O feriado de uma data, ou `null`. Se houver mais de um no mesmo dia (acontece:
 * 9 de julho é estadual e já caiu junto de facultativo), devolve o de maior peso
 * — feriado oficial vence ponto facultativo, porque é ele que fecha comércio.
 * @param {string} dataIso 'YYYY-MM-DD' @returns {Feriado|null}
 */
export function feriadoEm(dataIso) {
  if (typeof dataIso !== 'string' || dataIso.length < 10) return null;
  const ano = Number(dataIso.slice(0, 4));
  if (!Number.isFinite(ano)) return null;
  const achados = doAno(ano).filter((f) => f.data === dataIso);
  if (!achados.length) return null;
  const peso = { nacional: 3, estadual: 2, municipal: 2, facultativo: 1 };
  return achados.sort((a, b) => peso[b.tipo] - peso[a.tipo])[0];
}

/** Os feriados de um mês, para o calendário desenhar. @returns {Feriado[]} */
export function feriadosDoMes(ano, mes) {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}-`;
  return doAno(ano).filter((f) => f.data.startsWith(prefixo));
}
