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
 * Meta de SÉRIES semanais por padrão de movimento, por frequência.
 * Quem treina menos vezes recebe mais densidade por sessão para garantir
 * volume suficiente (full body sempre).
 * @type {Record<3|4|5, Record<import('./padroes.js').Padrao, number>>}
 */
export const META_SERIES_SEMANAIS = {
  3: { empurrar: 12, puxar: 12, quadriceps: 12, posterior_gluteo: 12, core: 9, estabilizadores: 6 },
  4: { empurrar: 14, puxar: 14, quadriceps: 14, posterior_gluteo: 14, core: 10, estabilizadores: 8 },
  5: { empurrar: 16, puxar: 16, quadriceps: 16, posterior_gluteo: 16, core: 12, estabilizadores: 10 },
};

const ORDEM_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex'];

/**
 * Indica se dois dias são consecutivos (para evitar repetir padrão pesado).
 * @param {Dia} a @param {Dia} b
 */
export function diasConsecutivos(a, b) {
  return Math.abs(ORDEM_DIAS.indexOf(a) - ORDEM_DIAS.indexOf(b)) === 1;
}
