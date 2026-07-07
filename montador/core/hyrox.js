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
  { n: 2, nome: 'Dumbbell Thrusters', base: 'Sled Push', equipamento: ['halter'], padrao: 'empurrar', padraoSec: 'quadriceps',
    tipo: 'reps', prescricao: { iniciante: 20, intermediario: 30, avancado: 30 },
    carga: 'halteres 7–10 kg (total)', nota: 'Agachou → empurrou acima da cabeça, sem pausa.' },
  { n: 3, nome: 'Remada sentada no monocross', base: 'Sled Pull', equipamento: ['monocross'], padrao: 'puxar',
    tipo: 'reps', prescricao: { iniciante: 30, intermediario: 50, avancado: 50 },
    carga: 'carga moderada/pesada (polia)', nota: 'Puxada forte até o abdômen, controla a volta.' },
  { n: 4, nome: 'Burpee over bar', base: 'Burpee Broad Jump', equipamento: ['corporal', 'barra_livre'], padrao: 'empurrar',
    tipo: 'reps', prescricao: { iniciante: 15, intermediario: 30, avancado: 30 },
    carga: 'peso corporal', nota: 'Pode passar a perna uma de cada vez se o salto for complexo.' },
  { n: 5, nome: 'Remada baixa rápida no monocross', base: 'Rowing', equipamento: ['monocross'], padrao: 'puxar',
    tipo: 'reps', prescricao: { iniciante: 200, intermediario: 250, avancado: 250 },
    carga: 'carga leve/moderada (polia)', nota: 'Cadência de remo: rápido e ritmado.' },
  { n: 6, nome: 'Farmer’s carry (halteres pesados)', base: 'Farmers Carry', equipamento: ['halter_pesado'], padrao: 'estabilizadores', padraoSec: 'posterior_gluteo',
    tipo: 'distancia', prescricao: { iniciante: 80, intermediario: 100, avancado: 100 },
    carga: 'halteres pesados (12,5–17,5 kg)', nota: 'Tronco firme, ombros para trás, passos curtos.' },
  { n: 7, nome: 'Walking lunges com halteres', base: 'Sandbag Lunges', equipamento: ['halter'], padrao: 'quadriceps', padraoSec: 'posterior_gluteo',
    tipo: 'distancia', prescricao: { iniciante: 30, intermediario: 40, avancado: 40 },
    carga: 'halteres 5–8 kg cada', nota: 'Joelho de trás quase ao chão, tronco ereto.' },
  { n: 8, nome: 'Wall ball', base: 'Wall Balls', equipamento: ['wall_ball'], padrao: 'quadriceps', padraoSec: 'empurrar',
    tipo: 'reps', prescricao: { iniciante: 30, intermediario: 50, avancado: 50 },
    carga: 'bola 4–6 kg', nota: 'Agachou → arremessou ao alvo; recebe já agachando.' },
];

/** Estimativas de esforço p/ a duração (segundos). São aproximações — rótulo "~". */
const SEG_POR_METRO_CORRIDA = 0.34;      // ~10,5 km/h com penalidade de tiros de 50 m
const SEG_POR_METRO_CARRY = 0.9;         // farmer/lunge carregados
const SEG_POR_REP = { 1: 1.3, 2: 3.2, 3: 1.6, 4: 4.5, 5: 1.1, 8: 3.0 }; // por nº de estação
const TRANSICAO_SEG = 15;                // troca corrida↔estação

/**
 * Duração estimada de uma rodada de estação (só o trabalho da estação).
 * @param {EstacaoHyrox} est @param {Nivel} nivel
 */
function duracaoEstacaoSeg(est, nivel) {
  const q = est.prescricao[nivel];
  if (est.tipo === 'distancia') return Math.round(q * SEG_POR_METRO_CARRY);
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
  const monocross = EQUIP_POR_ID.monocross;
  return {
    corrida: HYROX_CORRIDA,
    estacoes: HYROX_ESTACOES,
    duracaoSeg: {
      iniciante: estimarDuracaoSeg('iniciante'),
      intermediario: estimarDuracaoSeg('intermediario'),
      avancado: estimarDuracaoSeg('avancado'),
    },
    // Hyrox é for-time: a turma faz o mesmo percurso em rodízio, não é um circuito
    // de K estações simultâneas. O gargalo prático é o monocross (3 estações usam).
    viabilidade: {
      ok: true,
      formato: 'for-time',
      nota: `Formato for-time: turma de até ${nAlunos} em rodízio. ${monocross?.unidades ?? 2} estações de monocross — organize revezamento nas rodadas de polia.`,
    },
  };
}
