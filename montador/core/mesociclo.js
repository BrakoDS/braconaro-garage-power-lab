// @ts-check
/**
 * MESOCICLO — encadeia N semanas (padrão 4) do PROGRAMA DA SEMANA do box, com
 * progressão de carga/volume e deload na última. O programa é o mesmo para todos;
 * o mesociclo mostra como ele evolui ao longo do ciclo.
 *
 * @typedef {import('../config/frequencias.js').Dia} Dia
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 */
import { gerarProgramaSemanal, GRADE_PADRAO } from './programaSemanal.js';
import { ehDeload, intensidadeSemana } from './periodizacao.js';
import { MODALIDADES } from '../config/modalidades.js';

/**
 * @param {Object} opcoes
 * @param {Partial<Record<Dia, ModalidadeId>>} [opcoes.grade]
 * @param {'iniciante'|'intermediario'|'avancado'} [opcoes.nivelRef]
 * @param {number} [opcoes.nSemanas]
 * @param {number} [opcoes.semanaGap]  Semana do ciclo em que o HIIT vira GAP (1×/mês). 0 = nunca.
 * @param {number} [opcoes.seed]
 */
export function gerarMesociclo(opcoes) {
  const { grade = GRADE_PADRAO, nivelRef = 'intermediario', nSemanas = 4, seed } = opcoes;
  // GAP substitui o HIIT uma vez por mês; por padrão na 3ª semana (evita a de deload)
  const semanaGap = opcoes.semanaGap ?? 3;

  // intensidade média a partir das modalidades da grade
  const faixas = Object.values(grade).filter(Boolean).map((m) => MODALIDADES[m].intensidadePctRM);
  const lo = Math.round(faixas.reduce((a, f) => a + f[0], 0) / faixas.length);
  const hi = Math.round(faixas.reduce((a, f) => a + f[1], 0) / faixas.length);

  const semanas = [];
  for (let semana = 1; semana <= nSemanas; semana++) {
    // troca HIIT→GAP na semana designada
    const temGap = semana === semanaGap && Object.values(grade).includes('hiit');
    const gradeSemana = temGap
      ? Object.fromEntries(Object.entries(grade).map(([d, m]) => [d, m === 'hiit' ? 'gap' : m]))
      : grade;

    const programa = gerarProgramaSemanal({
      grade: gradeSemana, nivelRef, semana, seed: seed != null ? seed + semana * 100 : undefined,
    });
    const totalSeries = programa.treinos.reduce((a, t) => a + t.volume.totalSeries, 0);
    semanas.push({
      semana,
      deload: ehDeload(semana),
      gap: temGap,
      intensidade: intensidadeSemana([lo, hi], semana),
      totalSeries,
      atingeMinimo: programa.cenarios[3]?.atingeMinimo ?? true,
      programa,
    });
  }

  return { grade, nivelRef, nSemanas, semanaGap, semanas };
}
