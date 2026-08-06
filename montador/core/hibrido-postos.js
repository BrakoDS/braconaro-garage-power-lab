// @ts-check
/**
 * FORMATO DO BLOCO DE HIPERTROFIA DO HÍBRIDO — aritmética pura.
 *
 * O bloco é composto de POSTOS, cada posto um bi-set de músculos antagonistas.
 * Cada posto comporta 1 dupla: uma aluna no lado A, a outra no B, trocando a cada
 * série — é o bi-set que divide a turma, e é por isso que cada exercício só precisa
 * de 1 unidade de aparelho.
 *
 * Este módulo não conhece o catálogo. Quem escolhe exercício é `hibrido.js`.
 */

/** Duração fixa de uma série de bi-set em dupla (A + a troca + pausa). */
export const SERIE_SEG = 120;
/** Segundos por repetição — espelha `segPorRepMedia` do Híbrido em config/modalidades.js. */
export const SEG_POR_REP = 3;

/**
 * Os 4 pares, em ordem de prioridade: turma menor usa só os primeiros.
 * Os lados são MÚSCULOS PRIMÁRIOS, não padrões de movimento — é o que permite
 * bíceps e tríceps virarem alvo direto (ambos são `puxar`/`empurrar` e ficavam
 * invisíveis quando a seleção olhava só o padrão).
 *
 * O par de core não é antagonista no sentido estrito: o catálogo não tem nenhum
 * exercício de extensão de tronco. Pareia dois abdominais de planos diferentes.
 * @type {{id:string, label:string, a:string[], b:string[]}[]}
 */
export const PARES_ANTAGONISTAS = [
  { id: 'peito_costas',          label: 'Peito / Costas',                a: ['peito'],      b: ['costas'] },
  { id: 'quadriceps_posterior',  label: 'Quadríceps / Posterior-glúteo', a: ['quadriceps'], b: ['posterior_coxa', 'gluteo'] },
  { id: 'bracos',                label: 'Bíceps / Tríceps',              a: ['biceps'],     b: ['triceps'] },
  { id: 'core',                  label: 'Abdominal / Abdominal',         a: ['core'],       b: ['core'] },
];

/**
 * Quantos postos a turma pede — 1 dupla por posto.
 * Turma ímpar arredonda pra cima: um posto vira trio (as 3 rodam entre os 2
 * exercícios). Teto de 4 porque só existem 4 pares.
 * @param {number} nAlunos
 */
export function calcularPostos(nAlunos) {
  return Math.min(4, Math.max(1, Math.ceil(nAlunos / 2)));
}

/**
 * Séries por posto. O produto `nPostos × séries` fica travado em 12, o que mantém
 * o bloco em 24 min (12 × SERIE_SEG) independente do tamanho da turma. O clamp
 * protege turmas muito pequenas, que pediriam 6+ séries.
 * @param {number} nPostos
 */
export function calcularSeries(nPostos) {
  return Math.min(4, Math.max(3, Math.round(12 / nPostos)));
}
