// @ts-check
/**
 * MÚSCULO → GRUPO GRANDE.
 *
 * O volume conta músculo fino (bíceps, posterior de coxa). O coach e o aluno
 * pensam em grupo grande ("foco em braço", "quanto de perna eu fiz"). Este
 * módulo é a ponte, e existe para os dois lados falarem a mesma língua.
 *
 * Ele cobre AS DUAS listas de músculo que o projeto tem: as chaves de
 * `config/padroes.js` (o que o volume conta) e as do `MUSC_MAP` da Academia,
 * que tem trapézio, lombar e estabilizadores a mais. Músculo fora das duas não
 * ganha grupo — e não some do volume por músculo, que continua sendo a conta fina.
 */

/** Os sete grupos, na ordem em que aparecem na tela. */
export const GRUPOS = ['peito', 'costas', 'ombro', 'braco', 'perna', 'gluteo', 'core'];

export const GRUPO_LABEL = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', braco: 'Braço',
  perna: 'Perna', gluteo: 'Glúteo', core: 'Core',
};

/**
 * Lombar e estabilizadores entram em `core` porque é isso que eles são na aula:
 * sustentação de tronco. Panturrilha entra em `perna` em vez de virar um oitavo
 * grupo — ninguém no box pede "foco em panturrilha".
 * @type {Record<string, string>}
 */
const GRUPO_POR_MUSCULO = {
  peito: 'peito',
  costas: 'costas', trapezio: 'costas',
  ombro: 'ombro',
  biceps: 'braco', triceps: 'braco', antebraco: 'braco',
  quadriceps: 'perna', posterior_coxa: 'perna', panturrilha: 'perna',
  gluteo: 'gluteo',
  core: 'core', lombar: 'core', estabilizadores: 'core',
};

/** @param {string} musculo chave interna ('biceps'), não o rótulo ('Bíceps') */
export function grupoDoMusculo(musculo) {
  return GRUPO_POR_MUSCULO[musculo] ?? null;
}

/**
 * O grupo de um exercício é o do seu PRIMEIRO músculo primário.
 *
 * Só o primeiro de propósito: a rosca martelo é exercício de braço mesmo tendo
 * antebraço na lista, e um exercício que pertencesse a dois grupos ao mesmo
 * tempo tornaria a redistribuição de séries indeterminada — não haveria resposta
 * para "esta linha é de foco?".
 * @param {{musculosPrimarios?: string[]}} ex
 */
export function grupoDoExercicio(ex) {
  const primeiro = (ex && ex.musculosPrimarios) ? ex.musculosPrimarios[0] : null;
  return primeiro ? grupoDoMusculo(primeiro) : null;
}

/**
 * Soma um mapa de volume por músculo em volume por grupo.
 * @param {Record<string, number>} porMusculo
 * @returns {Record<string, number>}
 */
export function agregarPorGrupo(porMusculo) {
  /** @type {Record<string, number>} */
  const porGrupo = {};
  for (const [musculo, valor] of Object.entries(porMusculo || {})) {
    const g = grupoDoMusculo(musculo);
    if (!g) continue;
    porGrupo[g] = (porGrupo[g] || 0) + valor;
  }
  return porGrupo;
}
