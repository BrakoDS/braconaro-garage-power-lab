// @ts-check
/**
 * PERIODIZAÇÃO (versão base — expande na Fase 3).
 * Ciclo de 4 semanas com progressão e deload, mais ajuste por nível do aluno.
 *
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 */

/**
 * Fator de séries por semana do mesociclo (1–4).
 * Semanas 1→3 progridem; semana 4 é deload.
 * @param {number} semana 1..4
 */
export function fatorSemana(semana) {
  const s = ((semana - 1) % 4) + 1;
  return { 1: 1.0, 2: 1.1, 3: 1.2, 4: 0.6 }[s] ?? 1.0;
}

/** Semana 4 do ciclo é deload. @param {number} semana */
export function ehDeload(semana) {
  return ((semana - 1) % 4) + 1 === 4;
}

/**
 * Ajuste de séries por nível do aluno.
 * @param {Nivel} nivel
 */
export function fatorNivel(nivel) {
  return { iniciante: 0.8, intermediario: 1.0, avancado: 1.15 }[nivel] ?? 1.0;
}

/**
 * Séries finais de um exercício considerando modalidade, semana e nível.
 * @param {number} seriesBase
 * @param {number} semana
 * @param {Nivel} nivel
 */
export function seriesAjustadas(seriesBase, semana, nivel) {
  const bruto = seriesBase * fatorSemana(semana) * fatorNivel(nivel);
  return Math.max(2, Math.round(bruto));
}
