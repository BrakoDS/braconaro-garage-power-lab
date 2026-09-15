// @ts-check
/**
 * MÚSCULO → RÓTULO LEGÍVEL.
 *
 * Vocabulário no núcleo compartilhado porque tem dois consumidores que não podem
 * depender um do outro: a tela da Academia (mostra o rótulo em português no
 * formulário de exercício) e o cálculo de volume por grupo (`regras/grupos.js`,
 * que cobre estas 14 chaves mais as de `padroes.js`). Deixar isto dentro de um
 * app faria o núcleo depender daquele app — a mesma seta invertida que
 * `fatorNivel` e `modalidades.js` já corrigiram antes deste.
 */
export const MUSC_MAP = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', trapezio: 'Trapézio',
  biceps: 'Bíceps', triceps: 'Tríceps', antebraco: 'Antebraço',
  core: 'Core/Abdômen', lombar: 'Lombar',
  quadriceps: 'Quadríceps', posterior_coxa: 'Posterior de coxa',
  gluteo: 'Glúteo', panturrilha: 'Panturrilha', estabilizadores: 'Estabilizadores',
};
