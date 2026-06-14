// @ts-check
/**
 * PADRÕES DE MOVIMENTO (base do treino FULL BODY).
 * Todo treino busca equilíbrio entre estes padrões.
 *
 * @typedef {'empurrar'|'puxar'|'quadriceps'|'posterior_gluteo'|'core'|'estabilizadores'} Padrao
 */

/** @type {Padrao[]} */
export const PADROES = [
  'empurrar',
  'puxar',
  'quadriceps',
  'posterior_gluteo',
  'core',
  'estabilizadores',
];

export const PADRAO_LABEL = {
  empurrar: 'Empurrar',
  puxar: 'Puxar',
  quadriceps: 'Quadríceps (dominante de joelho)',
  posterior_gluteo: 'Posterior / Glúteo (dominante de quadril)',
  core: 'Core',
  estabilizadores: 'Estabilizadores',
};

/**
 * Padrões obrigatórios conforme a quantidade de exercícios do treino.
 * Os "quatro grandes" entram sempre; core e estabilizadores entram quando há espaço
 * (e são cobertos no aquecimento/finalizador quando o treino é curto).
 * @param {4|5|6} nExercicios
 * @returns {Padrao[]}
 */
export function padroesObrigatorios(nExercicios) {
  const base = ['empurrar', 'puxar', 'quadriceps', 'posterior_gluteo'];
  if (nExercicios >= 5) base.push('core');
  if (nExercicios >= 6) base.push('estabilizadores');
  return /** @type {Padrao[]} */ (base);
}

/** Grupos musculares rastreados para volume. */
export const MUSCULOS = [
  'peito',
  'ombro',
  'triceps',
  'costas',
  'biceps',
  'quadriceps',
  'posterior_coxa',
  'gluteo',
  'panturrilha',
  'core',
  'antebraco',
];
