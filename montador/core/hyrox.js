// @ts-check
/**
 * TEMPLATE HYROX — formato da competição adaptado ao box.
 *
 * O Hyrox de verdade é FIXO: 8 rodadas de (corrida + estação), sempre na mesma
 * ordem (SkiErg → Sled Push → Sled Pull → Burpee → Row → Farmers → Lunges →
 * Wall Ball). Aqui reproduzimos essa mecânica com os aparelhos do box e com os
 * 3 níveis já ajustados (corrida e reps escalam por nível). Não varia semana a
 * semana — é o próprio formato de prova.
 *
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 * @typedef {import('./volume.js').Volume} Volume
 */
import { EQUIP_POR_ID, ALUNOS_POR_SESSAO } from '../data/equipamentos.js';

/** Corrida por rodada (tiros de 50 m ida/volta). */
export const HYROX_CORRIDA = {
  iniciante:     { voltas: 2, metros: 200 },
  intermediario: { voltas: 3, metros: 300 },
  avancado:      { voltas: 5, metros: 500 },
};

/**
 * As 8 estações, na ordem da prova. `tipo` define a unidade da prescrição
 * (`reps` ou `distancia` em metros). `padrao` alimenta o volume nominal.
 * @typedef {Object} EstacaoHyrox
 * @property {number} n
 * @property {string} nome            Nome no box
 * @property {string} base            Estação equivalente na competição
 * @property {string[]} equipamento   IDs de equipamentos.js
 * @property {import('../config/padroes.js').Padrao} padrao
 * @property {import('../config/padroes.js').Padrao} [padraoSec]  Padrão secundário (volume nominal)
 * @property {'reps'|'distancia'} tipo
 * @property {Record<Nivel, number>} prescricao
 * @property {string} carga
 * @property {string} [nota]
 */

/** @type {EstacaoHyrox[]} */
export const HYROX_ESTACOES = [
  { n: 1, nome: 'Puxada alta no monocross', base: 'SkiErg', equipamento: ['monocross'], padrao: 'puxar',
    tipo: 'reps', prescricao: { iniciante: 200, intermediario: 250, avancado: 250 },
    carga: 'carga moderada (polia)', nota: 'Ritmo de esqui: puxada explosiva, tronco à frente.' },
  { n: 2, nome: 'Sled Push (empurrar trenó)', base: 'Sled Push', equipamento: ['sled', 'turf', 'anilha_olimpica_15'], padrao: 'quadriceps', padraoSec: 'empurrar',
    tipo: 'distancia', prescricao: { iniciante: 20, intermediario: 30, avancado: 40 },
    carga: 'trenó + 15–45 kg (1 a 3 anilhas por nível)', nota: 'Trenó baixo, tronco firme, passos curtos e potentes no turf de 5 m.' },
  { n: 3, nome: 'Sled Pull (puxar trenó)', base: 'Sled Pull', equipamento: ['sled', 'turf', 'anilha_olimpica_15', 'corda_naval_4m'], padrao: 'puxar', padraoSec: 'estabilizadores',
    tipo: 'distancia', prescricao: { iniciante: 20, intermediario: 30, avancado: 40 },
    carga: 'trenó + 15–45 kg, puxar pela corda', nota: 'Puxe a corda mão sobre mão, quadril baixo e tronco estável.' },
  { n: 4, nome: 'Burpee over bar', base: 'Burpee Broad Jump', equipamento: ['corporal', 'barra_livre'], padrao: 'empurrar',
    tipo: 'reps', prescricao: { iniciante: 15, intermediario: 30, avancado: 30 },
    carga: 'peso corporal', nota: 'Pode passar a perna uma de cada vez se o salto for complexo.' },
  { n: 5, nome: 'Remada baixa rápida no monocross', base: 'Rowing', equipamento: ['monocross'], padrao: 'puxar',
    tipo: 'reps', prescricao: { iniciante: 200, intermediario: 250, avancado: 250 },
    carga: 'carga leve/moderada (polia)', nota: 'Cadência de remo: rápido e ritmado.' },
  { n: 6, nome: 'Farmer’s carry (halteres pesados)', base: 'Farmers Carry', equipamento: ['halter_pesado'], padrao: 'estabilizadores', padraoSec: 'posterior_gluteo',
    tipo: 'distancia', prescricao: { iniciante: 80, intermediario: 100, avancado: 100 },
    carga: 'halteres pesados (12,5–17,5 kg)', nota: 'Tronco firme, ombros para trás, passos curtos.' },
  { n: 7, nome: 'Sandbag Lunges (avanço com saco de areia)', base: 'Sandbag Lunges', equipamento: ['sandbag'], padrao: 'quadriceps', padraoSec: 'posterior_gluteo',
    tipo: 'distancia', prescricao: { iniciante: 30, intermediario: 40, avancado: 40 },
    carga: 'sandbag 20 kg nos ombros', nota: 'Saco apoiado nos ombros/pescoço; joelho de trás toca o chão, tronco ereto.' },
  { n: 8, nome: 'Wall ball', base: 'Wall Balls', equipamento: ['wall_ball'], padrao: 'quadriceps', padraoSec: 'empurrar',
    tipo: 'reps', prescricao: { iniciante: 30, intermediario: 50, avancado: 50 },
    carga: 'bola 4–6 kg', nota: 'Agachou → arremessou ao alvo; recebe já agachando.' },
];

/** Estimativas de esforço p/ a duração (segundos). São aproximações — rótulo "~". */
const SEG_POR_METRO_CORRIDA = 0.34;      // ~10,5 km/h com penalidade de tiros de 50 m
const SEG_POR_METRO_CARRY = 0.9;         // farmer/lunge carregados
const SEG_POR_METRO_SLED = 1.8;          // trenó carregado é lento e grindy
const SEG_POR_REP = { 1: 1.3, 4: 4.5, 5: 1.1, 8: 3.0 }; // reps por nº de estação (2 e 3 viraram distância/sled)
const TRANSICAO_SEG = 15;                // troca corrida↔estação

/**
 * Duração estimada de uma rodada de estação (só o trabalho da estação).
 * @param {EstacaoHyrox} est @param {Nivel} nivel
 */
function duracaoEstacaoSeg(est, nivel) {
  const q = est.prescricao[nivel];
  if (est.tipo === 'distancia') {
    const rate = (est.n === 2 || est.n === 3) ? SEG_POR_METRO_SLED : SEG_POR_METRO_CARRY;
    return Math.round(q * rate);
  }
  return Math.round(q * (SEG_POR_REP[est.n] ?? 2));
}

/** Duração total estimada do Hyrox para um nível (corrida + 8 estações + transições). */
export function estimarDuracaoSeg(nivel) {
  const corrida = HYROX_CORRIDA[nivel].metros * SEG_POR_METRO_CORRIDA * HYROX_ESTACOES.length;
  const estacoes = HYROX_ESTACOES.reduce((a, e) => a + duracaoEstacaoSeg(e, nivel), 0);
  const transicoes = HYROX_ESTACOES.length * 2 * TRANSICAO_SEG;
  return Math.round(corrida + estacoes + transicoes);
}

/**
 * Volume nominal (condicionamento) para manter `treino.volume` válido no cálculo
 * semanal/mesociclo. Cada estação conta um equivalente-séries no seu padrão.
 * @returns {Volume}
 */
export function volumeHyrox() {
  const PRIM = 3, SEC = 1.5; // equivalente de condicionamento por estação (primário + secundário)
  /** @type {Record<string, number>} */
  const porPadrao = {};
  const add = (p, v) => { porPadrao[p] = (porPadrao[p] || 0) + v; };
  for (const e of HYROX_ESTACOES) { add(e.padrao, PRIM); if (e.padraoSec) add(e.padraoSec, SEC); }
  const totalSeries = Object.values(porPadrao).reduce((a, b) => a + b, 0);
  return { porMusculo: {}, porPadrao, totalSeries };
}

/**
 * Gera a sessão Hyrox estruturada.
 * @param {{ nAlunos?: number }} [opcoes]
 */
export function gerarHyrox(opcoes = {}) {
  const nAlunos = opcoes.nAlunos ?? ALUNOS_POR_SESSAO;
  const sled = EQUIP_POR_ID.sled;
  return {
    corrida: HYROX_CORRIDA,
    estacoes: HYROX_ESTACOES,
    duracaoSeg: {
      iniciante: estimarDuracaoSeg('iniciante'),
      intermediario: estimarDuracaoSeg('intermediario'),
      avancado: estimarDuracaoSeg('avancado'),
    },
    // Hyrox é for-time: a turma faz o mesmo percurso em rodízio, não é um circuito
    // de K estações simultâneas. Os gargalos práticos são o TRENÓ (só 1), a SANDBAG
    // (só 1) e o monocross (2 estações de polia).
    viabilidade: {
      ok: true,
      formato: 'for-time',
      nota: `Formato for-time: turma de até ${nAlunos} em rodízio. Gargalos: só ${sled?.unidades ?? 1} trenó (Sled Push/Pull), ${EQUIP_POR_ID.sandbag?.unidades ?? 1} sandbag (Lunges) e ${EQUIP_POR_ID.monocross?.unidades ?? 2} monocross — organize o revezamento nessas estações.`,
    },
  };
}
