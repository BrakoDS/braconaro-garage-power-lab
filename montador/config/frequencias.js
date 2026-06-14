// @ts-check
/**
 * FREQUÊNCIAS e combinações de dias possíveis.
 * Cada combinação define em quais dias o aluno treina; o motor de volume usa
 * isso para distribuir estímulo e respeitar descanso entre dias consecutivos.
 *
 * @typedef {'seg'|'ter'|'qua'|'qui'|'sex'} Dia
 * @typedef {Object} CombinacaoDias
 * @property {string} id
 * @property {3|4|5} frequencia
 * @property {Dia[]} dias
 * @property {string} rotulo
 */

/** @type {CombinacaoDias[]} */
export const COMBINACOES = [
  // 3x
  { id: '3x-seg-qua-sex', frequencia: 3, dias: ['seg', 'qua', 'sex'], rotulo: 'SEG / QUA / SEX' },
  { id: '3x-seg-ter-qua', frequencia: 3, dias: ['seg', 'ter', 'qua'], rotulo: 'SEG / TER / QUA' },
  { id: '3x-ter-qui-sex', frequencia: 3, dias: ['ter', 'qui', 'sex'], rotulo: 'TER / QUI / SEX' },
  // 4x
  { id: '4x-seg-ter-qua-qui', frequencia: 4, dias: ['seg', 'ter', 'qua', 'qui'], rotulo: 'SEG / TER / QUA / QUI' },
  { id: '4x-seg-qua-qui-sex', frequencia: 4, dias: ['seg', 'qua', 'qui', 'sex'], rotulo: 'SEG / QUA / QUI / SEX' },
  // 5x
  { id: '5x-seg-sex', frequencia: 5, dias: ['seg', 'ter', 'qua', 'qui', 'sex'], rotulo: 'SEG a SEX' },
];

/** @type {Record<string, CombinacaoDias>} */
export const COMBINACAO_POR_ID = Object.fromEntries(COMBINACOES.map((c) => [c.id, c]));

/**
 * MÍNIMO SEMANAL de séries por padrão para BONS RESULTADOS.
 * O treino é o mesmo para todos; a frequência é só quantos dias o aluno pega.
 * Como cada dia é full body, este piso é o que um aluno de 3 dias precisa atingir
 * (pior caso). Quem vem 4–5 dias fica acima disso (resultado melhor).
 * @type {Record<import('./padroes.js').Padrao, number>}
 */
export const MINIMO_SEMANAL = {
  empurrar: 9, puxar: 9, quadriceps: 9, posterior_gluteo: 9,
  core: 3,            // complementado por aquecimento e trabalho secundário em vários lifts
  estabilizadores: 0, // informativo: coberto por carries, aquecimento e estabilização secundária
};

export const ORDEM_DIAS = /** @type {Dia[]} */ (['seg', 'ter', 'qua', 'qui', 'sex']);

/**
 * Combinações de dias válidas para uma frequência.
 * @param {3|4|5} frequencia
 */
export function combosPorFrequencia(frequencia) {
  return COMBINACOES.filter((c) => c.frequencia === frequencia);
}

/**
 * Indica se dois dias são consecutivos (para evitar repetir padrão pesado).
 * @param {Dia} a @param {Dia} b
 */
export function diasConsecutivos(a, b) {
  return Math.abs(ORDEM_DIAS.indexOf(a) - ORDEM_DIAS.indexOf(b)) === 1;
}
