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
 * Iniciante em 0.85 (não 0.8): com 0.8, as modalidades de base 3 séries (Hyrox/Híbrido)
 * arredondavam para 2 (3×0.8=2.4) e o aluno de 3 dias não batia o mínimo semanal na
 * semana-base; 0.85 (3×0.85=2.55→3) mantém o piso sem apagar a diferença p/ o intermediário.
 * @param {Nivel} nivel
 */
export function fatorNivel(nivel) {
  return { iniciante: 0.85, intermediario: 1.0, avancado: 1.15 }[nivel] ?? 1.0;
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

/**
 * Progressão de INTENSIDADE dentro do mesociclo (onda 1→4).
 * Semana 1: base do range; 2: meio; 3: topo (pico); 4: deload (abaixo da base).
 * @param {[number,number]} faixaPctRM  Faixa de % de 1RM da modalidade
 * @param {number} semana
 * @returns {{ pctRM: number, rotulo: string }}
 */
export function intensidadeSemana(faixaPctRM, semana) {
  const [lo, hi] = faixaPctRM;
  const s = ((semana - 1) % 4) + 1;
  const t = { 1: 0.0, 2: 0.5, 3: 1.0, 4: -0.4 }[s] ?? 0;
  const pctRM = Math.round(lo + (hi - lo) * t);
  const rotulo = { 1: 'Introdução', 2: 'Acúmulo', 3: 'Pico', 4: 'Deload' }[s] ?? '';
  return { pctRM, rotulo };
}
