// @ts-check
/**
 * VARIANTES POR NÍVEL de um exercício.
 *
 * A aula do box tem alunos de níveis diferentes fazendo o MESMO treino (mesma
 * montagem de estações). O que muda por nível é o nº de séries e a carga sugerida.
 * Este módulo deriva, de um exercício já selecionado, as 3 variantes (iniciante /
 * intermediário / avançado) a partir das séries do INTERMEDIÁRIO (âncora da geração).
 *
 * @typedef {import('../dados/exercicios.js').Exercicio} Exercicio
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 */
import { sugerirCarga } from './cargas.js';

/** @type {Nivel[]} */
export const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

export const NIVEL_LABEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };

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
 * Séries de um exercício num nível, escalando a partir das séries do intermediário
 * (âncora). Como o intermediário tem fator 1.0, isto aplica só a diferença de nível
 * sobre o valor já ajustado por semana/tempo — mantendo a proporção do trim.
 *
 * O piso de 2 é a proteção do GERADOR: a âncora ali é calculada (periodização,
 * arredondamentos), então nunca chega ao coach como "1 série" por acidente. Quando
 * a âncora foi DIGITADA pelo coach (Treino Livre), esse piso vira mentira — ele
 * escreveu "1" e o sistema mostraria "2" para o próprio nível que ele mandou abrir
 * por nível. `opcoes.seriesDigitadas` troca o piso para 1, o mínimo que ainda é um
 * treino.
 * @param {number} seriesAncora  séries geradas (ou digitadas) para o intermediário
 * @param {Nivel} nivel
 * @param {{seriesDigitadas?: boolean}} [opcoes]
 */
export function seriesDoNivel(seriesAncora, nivel, opcoes = {}) {
  const base = fatorNivel('intermediario'); // 1.0 — deixa explícita a âncora
  const piso = opcoes.seriesDigitadas ? 1 : 2;
  return Math.max(piso, Math.round(seriesAncora * fatorNivel(nivel) / base));
}

/**
 * As 3 variantes de nível (séries + carga) de um exercício.
 * @param {Exercicio} ex
 * @param {number} seriesAncora  séries do intermediário para este exercício
 * @param {ModalidadeId} modalidade
 * @param {{seriesFixas?: boolean, seriesDigitadas?: boolean}} [opcoes]  Híbrido usa
 *        `seriesFixas`: lá as séries são função do nº de postos (seguram a duração da
 *        aula), e o nível age na carga. Treino Livre usa `seriesDigitadas`: ver
 *        `seriesDoNivel`.
 * @returns {Record<Nivel, { series: number, carga: string }>}
 */
export function variantesNivel(ex, seriesAncora, modalidade, opcoes = {}) {
  /** @type {any} */
  const out = {};
  for (const n of NIVEIS) {
    out[n] = {
      series: opcoes.seriesFixas ? seriesAncora : seriesDoNivel(seriesAncora, n, opcoes),
      carga: sugerirCarga(ex, n, modalidade).texto,
    };
  }
  return out;
}
