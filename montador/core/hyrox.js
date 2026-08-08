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
 * @typedef {'iniciante'|'intermediario'|'avancado'|'competitivo'} Nivel
 * @typedef {import('./volume.js').Volume} Volume
 */
import { EQUIP_POR_ID, ALUNOS_POR_SESSAO } from '../data/equipamentos.js';

/**
 * Níveis do Hyrox — os três do resto do app MAIS o Competitivo.
 *
 * O Competitivo existe SÓ aqui, e de propósito: é a prescrição de quem treina
 * para a prova de verdade (1 km de corrida por rodada, 250 remadas), e não faz
 * sentido nas outras modalidades, onde o nível escala carga e não distância.
 * Por isso este módulo tem a própria lista em vez de usar `NIVEIS` de niveis.js —
 * acrescentar 'competitivo' lá vazaria uma 4ª coluna para Força e Hipertrofia.
 * @type {Nivel[]}
 */
export const NIVEIS_HYROX = ['iniciante', 'intermediario', 'avancado', 'competitivo'];

export const NIVEL_HYROX_LABEL = {
  iniciante: 'Ini.', intermediario: 'Int.', avancado: 'Avanç.', competitivo: 'Comp.',
};

/**
 * Corrida por rodada (tiros de 50 m ida/volta), com a alternativa na airbike.
 *
 * `bikeMin` NÃO é uma estação a mais nem um bloco extra: é a MESMA rodada de
 * corrida, feita pedalando. Serve a dois casos reais do box — aluno com patologia
 * que não permite impacto, e dia em que correr na rua está inviável. Por isso os
 * tempos são equivalentes à corrida do mesmo nível, e não uma prescrição própria:
 * quem pedala faz o mesmo percurso da turma, e termina junto.
 */
export const HYROX_CORRIDA = {
  iniciante:     { voltas: 1, metros: 100, bikeMin: 0.8 },
  intermediario: { voltas: 3, metros: 300, bikeMin: 1 },
  avancado:      { voltas: 5, metros: 500, bikeMin: 2 },
  competitivo:   { voltas: 10, metros: 1000, bikeMin: 4 },
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
  { n: 1, nome: 'SkiErg (simulador de esqui)', base: 'SkiErg', equipamento: ['monocross'], padrao: 'puxar',
    tipo: 'reps', prescricao: { iniciante: 60, intermediario: 80, avancado: 100, competitivo: 250 },
    carga: 'carga moderada (polia)', nota: 'Adaptado nos 2 monocross lado a lado. Ritmo de esqui: puxada explosiva, tronco à frente.' },
  { n: 2, nome: 'Sled Push (empurrar trenó)', base: 'Sled Push', equipamento: ['sled', 'turf', 'anilha_olimpica_15'], padrao: 'quadriceps', padraoSec: 'empurrar',
    tipo: 'distancia', prescricao: { iniciante: 20, intermediario: 30, avancado: 40, competitivo: 100 },
    carga: 'trenó + 15–45 kg (1 a 3 anilhas por nível)', nota: 'Trenó baixo, tronco firme, passos curtos e potentes no turf de 5 m.' },
  { n: 3, nome: 'Sled Pull (puxar trenó)', base: 'Sled Pull', equipamento: ['sled', 'turf', 'anilha_olimpica_15', 'corda_naval_4m'], padrao: 'puxar', padraoSec: 'estabilizadores',
    tipo: 'distancia', prescricao: { iniciante: 20, intermediario: 30, avancado: 40, competitivo: 100 },
    carga: 'trenó + 15–45 kg, puxar pela corda', nota: 'Puxe a corda mão sobre mão, quadril baixo e tronco estável.' },
  { n: 4, nome: 'Burpee Broad Jump', base: 'Burpee Broad Jump', equipamento: ['corporal'], padrao: 'empurrar',
    tipo: 'distancia', prescricao: { iniciante: 20, intermediario: 40, avancado: 60, competitivo: 100 },
    carga: 'peso corporal', nota: 'Como na prova (avança em metros): a cada rep, flexão com o peito ao chão + salto para a frente. Competitivo = 100 m, a distância da prova.' },
  { n: 5, nome: 'Rowing (simulador de remo)', base: 'Rowing', equipamento: ['monocross_movel'], padrao: 'puxar',
    tipo: 'reps', prescricao: { iniciante: 60, intermediario: 80, avancado: 100, competitivo: 250 },
    carga: 'carga leve/moderada (polia)', nota: 'No 3º monocross (móvel), reservado ao dia de Hyrox. Cadência de remo: rápido e ritmado.' },
  { n: 6, nome: 'Farmer’s carry (halteres pesados)', base: 'Farmers Carry', equipamento: ['halter_pesado'], padrao: 'estabilizadores', padraoSec: 'posterior_gluteo',
    tipo: 'distancia', prescricao: { iniciante: 80, intermediario: 100, avancado: 150, competitivo: 200 },
    carga: 'halteres pesados (12,5–17,5 kg)', nota: 'Tronco firme, ombros para trás, passos curtos.' },
  { n: 7, nome: 'Sandbag Lunges (avanço com saco de areia)', base: 'Sandbag Lunges', equipamento: ['sandbag'], padrao: 'quadriceps', padraoSec: 'posterior_gluteo',
    tipo: 'distancia', prescricao: { iniciante: 20, intermediario: 30, avancado: 40, competitivo: 100 },
    carga: 'sandbag 20 kg nos ombros', nota: 'Saco apoiado nos ombros/pescoço; joelho de trás toca o chão, tronco ereto.' },
  { n: 8, nome: 'Wall ball', base: 'Wall Balls', equipamento: ['wall_ball'], padrao: 'quadriceps', padraoSec: 'empurrar',
    tipo: 'reps', prescricao: { iniciante: 30, intermediario: 50, avancado: 75, competitivo: 100 },
    carga: 'bola 4–6 kg', nota: 'Agachou → arremessou ao alvo; recebe já agachando.' },
];

/** Estimativas de esforço p/ a duração (segundos). São aproximações — rótulo "~". */
const SEG_POR_METRO_CORRIDA = 0.34;      // ~10,5 km/h com penalidade de tiros de 50 m
const SEG_POR_METRO_CARRY = 0.9;         // farmer/lunge carregados
const SEG_POR_METRO_SLED = 1.8;          // trenó carregado é lento e grindy
const SEG_POR_METRO_BURPEE = 2.8;        // burpee broad jump: avança pouco por rep, bem lento
const SEG_POR_REP = { 1: 1.3, 5: 1.1, 8: 3.0 }; // reps por nº de estação (2/3 = sled, 4 = burpee broad jump: distância)
const TRANSICAO_SEG = 15;                // troca corrida↔estação

/**
 * Duração estimada de uma rodada de estação (só o trabalho da estação).
 * @param {EstacaoHyrox} est @param {Nivel} nivel
 */
function duracaoEstacaoSeg(est, nivel) {
  const q = est.prescricao[nivel];
  if (est.tipo === 'distancia') {
    const rate = (est.n === 2 || est.n === 3) ? SEG_POR_METRO_SLED
      : est.n === 4 ? SEG_POR_METRO_BURPEE
      : SEG_POR_METRO_CARRY;
    return Math.round(q * rate);
  }
  return Math.round(q * (SEG_POR_REP[est.n] ?? 2));
}

/**
 * Duração total estimada do Hyrox para um nível (corrida + estações + transições).
 *
 * `estacoes` existe para o Treino Manual, onde o coach desliga o que o box não vai
 * rodar hoje. Como a corrida acontece antes de CADA estação, o termo de corrida
 * conta as estações ATIVAS — é a parte mais longa da prova, e prendê-la ao total
 * faria desligar estações quase não mudar o relógio.
 * @param {Nivel} nivel @param {EstacaoHyrox[]} [estacoes]
 */
export function estimarDuracaoSeg(nivel, estacoes = HYROX_ESTACOES) {
  const corrida = HYROX_CORRIDA[nivel].metros * SEG_POR_METRO_CORRIDA * estacoes.length;
  const trabalho = estacoes.reduce((a, e) => a + duracaoEstacaoSeg(e, nivel), 0);
  const transicoes = estacoes.length * 2 * TRANSICAO_SEG;
  return Math.round(corrida + trabalho + transicoes);
}

/**
 * Volume nominal (condicionamento) para manter `treino.volume` válido no cálculo
 * semanal/mesociclo. Cada estação conta um equivalente-séries no seu padrão.
 * @param {EstacaoHyrox[]} [estacoes]  Subconjunto ativo (Treino Manual). Default: a prova inteira.
 * @returns {Volume}
 */
export function volumeHyrox(estacoes = HYROX_ESTACOES) {
  const PRIM = 3, SEC = 1.5; // equivalente de condicionamento por estação (primário + secundário)
  /** @type {Record<string, number>} */
  const porPadrao = {};
  const add = (p, v) => { porPadrao[p] = (porPadrao[p] || 0) + v; };
  for (const e of estacoes) { add(e.padrao, PRIM); if (e.padraoSec) add(e.padraoSec, SEC); }
  const totalSeries = Object.values(porPadrao).reduce((a, b) => a + b, 0);
  return { porMusculo: {}, porPadrao, totalSeries };
}

/**
 * Gera a sessão Hyrox estruturada.
 * @param {{ nAlunos?: number, estacoes?: EstacaoHyrox[] }} [opcoes]
 *        `estacoes` é o subconjunto ligado no Treino Manual; omitir dá a prova inteira.
 */
export function gerarHyrox(opcoes = {}) {
  const nAlunos = opcoes.nAlunos ?? ALUNOS_POR_SESSAO;
  const estacoes = opcoes.estacoes ?? HYROX_ESTACOES;
  const sled = EQUIP_POR_ID.sled;
  return {
    corrida: HYROX_CORRIDA,
    estacoes,
    duracaoSeg: Object.fromEntries(
      NIVEIS_HYROX.map((n) => [n, estimarDuracaoSeg(n, estacoes)])),
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
