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

import { intensidadeSemana } from './periodizacao.js';

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

/** Faixa de %1RM do Híbrido — espelha `intensidadePctRM` de config/modalidades.js. */
const FAIXA_PCT_RM = /** @type {[number,number]} */ ([65, 75]);
/** Reps por semana do ciclo. Semana 4 repete a 1 em volume, mas com carga de deload. */
const REPS_POR_SEMANA = { 1: 12, 2: 10, 3: 8, 4: 12 };
/** Nível desloca a CARGA (§5 do spec) — as séries estão presas ao relógio. */
const SHIFT_PCT_NIVEL = { iniciante: -5, intermediario: 0, avancado: 5 };
/** Minutos de WOD por semana do ciclo. */
const WOD_MIN_POR_SEMANA = { 1: 16, 2: 16, 3: 20, 4: 12 };

/** Semana 1..4 dentro do mesociclo. @param {number} semana */
function semanaDoCiclo(semana) {
  return ((Math.max(1, semana) - 1) % 4) + 1;
}

/**
 * A prescrição da semana. A pausa não é escolhida — ela é o resto de 120s depois
 * do trabalho, o que faz a relação sair fisiologicamente correta de graça:
 * mais carga → menos reps → mais pausa.
 * @param {number} semana
 * @param {'iniciante'|'intermediario'|'avancado'} nivel
 * @returns {{semanaCiclo:number, rotulo:string, pctRM:number, reps:number, descansoSeg:number, ehDeload:boolean}}
 */
export function prescricaoSemana(semana, nivel) {
  const s = semanaDoCiclo(semana);
  const { pctRM, rotulo } = intensidadeSemana(FAIXA_PCT_RM, s);
  const reps = REPS_POR_SEMANA[s];
  return {
    semanaCiclo: s,
    rotulo,
    pctRM: pctRM + (SHIFT_PCT_NIVEL[nivel] ?? 0),
    reps,
    descansoSeg: SERIE_SEG - 2 * reps * SEG_POR_REP,
    ehDeload: s === 4,
  };
}

/** @param {number} semana */
export function duracaoWodPorSemana(semana) {
  return WOD_MIN_POR_SEMANA[semanaDoCiclo(semana)];
}
