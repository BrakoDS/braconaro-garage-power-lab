// @ts-check
/**
 * CÁLCULO DE VOLUME por grupamento muscular e por padrão de movimento.
 * Convenção: 1 série conta 1.0 para cada músculo PRIMÁRIO e 0.5 para SECUNDÁRIO.
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 *
 * @typedef {Object} ItemTreino
 * @property {Exercicio} exercicio
 * @property {number} series
 *
 * @typedef {Object} Volume
 * @property {Record<string, number>} porMusculo
 * @property {Record<string, number>} porPadrao
 * @property {number} totalSeries
 */

const PESO_PRIMARIO = 1.0;
const PESO_SECUNDARIO = 0.5;

/**
 * Crédito de volume de um movimento de WOD (Híbrido ou bloco de WOD do Livre).
 * É NOMINAL, não medido: um WOD mistura reps/tempo/rodadas de um jeito que não dá
 * pra contar "séries" de verdade, então cada movimento entra com um peso fixo só
 * para não sumir da tabela de padrão de movimento e do total de séries do dia.
 * Por isso NUNCA entra em `porMusculo` — ali o número precisa ser volume real de
 * músculo, e um crédito inventado distorceria a leitura de quanto cada grupo
 * trabalhou. Mesma constante para o Híbrido (`hibrido.js`) e o Treino Livre
 * (`livre.js`) — os dois têm que combinar sempre, nunca divergir em silêncio.
 */
export const CREDITO_WOD = 2.5;

/**
 * Volume de uma lista de itens de treino.
 * @param {ItemTreino[]} itens
 * @returns {Volume}
 */
export function calcularVolume(itens) {
  /** @type {Record<string, number>} */
  const porMusculo = {};
  /** @type {Record<string, number>} */
  const porPadrao = {};
  let totalSeries = 0;

  for (const { exercicio, series } of itens) {
    totalSeries += series;
    porPadrao[exercicio.padrao] = (porPadrao[exercicio.padrao] || 0) + series;
    for (const m of exercicio.musculosPrimarios) {
      porMusculo[m] = (porMusculo[m] || 0) + series * PESO_PRIMARIO;
    }
    for (const m of exercicio.musculosSecundarios) {
      porMusculo[m] = (porMusculo[m] || 0) + series * PESO_SECUNDARIO;
    }
  }
  return { porMusculo, porPadrao, totalSeries };
}

/**
 * Soma vários volumes (ex.: semana inteira).
 * @param {Volume[]} volumes
 * @returns {Volume}
 */
export function somarVolumes(volumes) {
  /** @type {Volume} */
  const acc = { porMusculo: {}, porPadrao: {}, totalSeries: 0 };
  for (const v of volumes) {
    acc.totalSeries += v.totalSeries;
    for (const [k, val] of Object.entries(v.porMusculo)) acc.porMusculo[k] = (acc.porMusculo[k] || 0) + val;
    for (const [k, val] of Object.entries(v.porPadrao)) acc.porPadrao[k] = (acc.porPadrao[k] || 0) + val;
  }
  return acc;
}

/**
 * Projeta volume mensal a partir do semanal (4,33 semanas/mês).
 * @param {Volume} semanal
 * @returns {Volume}
 */
export function projetarMensal(semanal) {
  const f = 4.33;
  const escala = (/** @type {Record<string,number>} */ obj) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Math.round(v * f)]));
  return {
    porMusculo: escala(semanal.porMusculo),
    porPadrao: escala(semanal.porPadrao),
    totalSeries: Math.round(semanal.totalSeries * f),
  };
}
