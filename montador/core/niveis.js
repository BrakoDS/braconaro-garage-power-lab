// @ts-check
/**
 * VARIANTES POR NÍVEL de um exercício.
 *
 * A aula do box tem alunos de níveis diferentes fazendo o MESMO treino (mesma
 * montagem de estações). O que muda por nível é o nº de séries e a carga sugerida.
 * Este módulo deriva, de um exercício já selecionado, as 3 variantes (iniciante /
 * intermediário / avançado) a partir das séries do INTERMEDIÁRIO (âncora da geração).
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 */
import { sugerirCarga } from './cargas.js';
import { fatorNivel } from './periodizacao.js';

/** @type {Nivel[]} */
export const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

export const NIVEL_LABEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };

/**
 * Séries de um exercício num nível, escalando a partir das séries do intermediário
 * (âncora). Como o intermediário tem fator 1.0, isto aplica só a diferença de nível
 * sobre o valor já ajustado por semana/tempo — mantendo a proporção do trim.
 * @param {number} seriesAncora  séries geradas para o intermediário
 * @param {Nivel} nivel
 */
export function seriesDoNivel(seriesAncora, nivel) {
  const base = fatorNivel('intermediario'); // 1.0 — deixa explícita a âncora
  return Math.max(2, Math.round(seriesAncora * fatorNivel(nivel) / base));
}

/**
 * As 3 variantes de nível (séries + carga) de um exercício.
 * @param {Exercicio} ex
 * @param {number} seriesAncora  séries do intermediário para este exercício
 * @param {ModalidadeId} modalidade
 * @returns {Record<Nivel, { series: number, carga: string }>}
 */
export function variantesNivel(ex, seriesAncora, modalidade) {
  /** @type {any} */
  const out = {};
  for (const n of NIVEIS) {
    out[n] = { series: seriesDoNivel(seriesAncora, n), carga: sugerirCarga(ex, n, modalidade).texto };
  }
  return out;
}
