// @ts-check
/**
 * TEMPLATE HIIT — 4 estações TABATA.
 *
 * Formato do box: 4 estações (INFERIORES · CORE · SUPERIORES · CARDIO), cada uma
 * com 4 exercícios em TABATA (20s on / 10s off). Cada estação roda 16 rounds =
 * 4 voltas cíclicas pelos 4 exercícios. Exercício UNILATERAL conta como 2 (um lado
 * por vez → 2 slots). Prescrição única para a turma (TABATA é por tempo).
 *
 * Monta a partir do catálogo EFETIVO (Academia + inventário do box).
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 * @typedef {import('./volume.js').Volume} Volume
 */
import { EXERCICIOS } from '../data/exercicios.js';
import { EQUIP_POR_ID, ALUNOS_POR_SESSAO, unidadesDe } from '../data/equipamentos.js';

const TABATA = { trabalhoSeg: 20, descansoSeg: 10, roundsPorEstacao: 16, slotsPorEstacao: 4 };
const DESCANSO_ENTRE_ESTACOES_SEG = 60;
const AQUECIMENTO_SEG = 300;

/** Estabilizadores isométricos que servem à estação de CORE. */
const CORE_ESTAB = new Set(['prancha_lateral', 'bird_dog']);

export const HIIT_ESTACOES = /** @type {const} */ ([
  { grupo: 'inferiores', titulo: 'Inferiores' },
  { grupo: 'core', titulo: 'Core' },
  { grupo: 'superiores', titulo: 'Superiores' },
  { grupo: 'cardio', titulo: 'Cardio' },
]);

/**
 * Grupo TABATA de um exercício.
 * @param {Exercicio} ex
 * @returns {'inferiores'|'core'|'superiores'|'cardio'|null}
 */
export function grupoTabata(ex) {
  if (ex.cardio) return 'cardio';
  if (ex.padrao === 'core') return 'core';
  if (ex.padrao === 'quadriceps' || ex.padrao === 'posterior_gluteo') return 'inferiores';
  if (ex.padrao === 'empurrar' || ex.padrao === 'puxar') return 'superiores';
  if (ex.padrao === 'estabilizadores' && CORE_ESTAB.has(ex.id)) return 'core';
  return null;
}

/** Todos os equipamentos do exercício estão disponíveis (≥1) no inventário? @param {Exercicio} ex */
function disponivel(ex) {
  return (ex.equipamento || []).every((id) => unidadesDe(id) >= 1);
}

/**
 * Quão bem o exercício atende 8 alunos ao mesmo tempo num TABATA: peso corporal e
 * equipamento farto pontuam mais (evita gargalo de aparelho com poucas unidades).
 * @param {Exercicio} ex @param {number} nAlunos
 */
function pontuarViabilidade(ex, nAlunos) {
  if (!ex.equipamento || !ex.equipamento.length) return 100; // peso corporal: ideal
  const min = Math.min(...ex.equipamento.map((id) => unidadesDe(id)));
  return min >= nAlunos ? 90 : min >= Math.ceil(nAlunos / 2) ? 60 : 25;
}

// -------- RNG determinístico (mesmo mulberry32 do gerador) --------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Nomes legíveis dos equipamentos de um exercício. */
function equipNomes(ids) {
  return (ids || []).map((i) => EQUIP_POR_ID[i]?.nome || i).join(', ');
}

/** Sub-padrões que uma estação deve equilibrar (joelho×quadril, empurrar×puxar). */
function subPadroes(grupo) {
  if (grupo === 'inferiores') return ['posterior_gluteo', 'quadriceps'];
  if (grupo === 'superiores') return ['puxar', 'empurrar'];
  return null;
}

/**
 * Preenche os 4 slots de uma estação a partir do pool classificado. Unilateral ocupa
 * 2 slots (lado E e lado D). INFERIORES e SUPERIORES equilibram os dois sub-padrões
 * (ex.: garante pelo menos um posterior/glúteo, não só quadríceps).
 * @param {string} grupo @param {Exercicio[]} pool @param {() => number} rng
 */
function preencherEstacao(grupo, pool, rng) {
  const score = new Map(pool.map((e) => [e.id, pontuarViabilidade(e, ALUNOS_POR_SESSAO) + rng() * 20]));
  const ordenado = [...pool].sort((a, b) => score.get(b.id) - score.get(a.id));

  const MAX = TABATA.slotsPorEstacao;
  const slots = [];
  const usados = new Set();
  const cabe = (ex) => ex.unilateral ? slots.length <= MAX - 2 : slots.length < MAX;
  const addEx = (ex) => {
    if (!ex || usados.has(ex.id) || !cabe(ex)) return false;
    usados.add(ex.id);
    const carga = ex.equipamento && ex.equipamento.length ? equipNomes(ex.equipamento) : 'peso corporal';
    if (ex.unilateral) {
      slots.push({ id: ex.id, nome: ex.nome, lado: 'D', unilateral: true, carga });
      slots.push({ id: ex.id, nome: ex.nome, lado: 'E', unilateral: true, carga });
    } else {
      slots.push({ id: ex.id, nome: ex.nome, carga });
    }
    return true;
  };

  // 1) equilíbrio: alterna os sub-padrões (ex.: posterior/glúteo ↔ quadríceps) p/ não
  //    ficar só de um lado — bom treino e mantém o volume semanal de cada padrão.
  const subs = subPadroes(grupo);
  if (subs) {
    for (let turn = 0; slots.length < MAX && turn < 20; turn++) {
      const sub = subs[turn % subs.length];
      addEx(ordenado.find((e) => e.padrao === sub && !usados.has(e.id) && cabe(e)));
    }
  }

  // 2) completa por pontuação (viabilidade + variedade)
  for (const ex of ordenado) { if (slots.length >= MAX) break; addEx(ex); }

  // 3) pool pequeno: repete os melhores bilaterais p/ fechar 4 slots
  let i = 0;
  while (slots.length < MAX && ordenado.length) {
    const ex = ordenado[i % ordenado.length]; i++;
    if (!ex.unilateral) {
      const carga = ex.equipamento && ex.equipamento.length ? equipNomes(ex.equipamento) : 'peso corporal';
      slots.push({ id: ex.id, nome: ex.nome, carga });
    }
    if (i > ordenado.length * 2) break; // trava de segurança
  }
  return slots.slice(0, MAX);
}

/**
 * Gera as 4 estações TABATA.
 * @param {{ nAlunos?: number, seed?: number }} [opcoes]
 */
export function gerarHiitTabata(opcoes = {}) {
  const nAlunos = opcoes.nAlunos ?? ALUNOS_POR_SESSAO;
  const rng = mulberry32(opcoes.seed ?? hashSeed('hiit-tabata'));

  // Só exercícios classificados como HIIT (tag 'hiit') — antes o pool era só por
  // grupo muscular, então vazava qualquer exercício (hipertrofia, hyrox-only) cujo
  // padrão batesse. Agora o dia de HIIT só usa o que está marcado para HIIT.
  const disponiveis = EXERCICIOS.filter((e) => disponivel(e) && e.categorias.includes('hiit'));
  const estacoes = HIIT_ESTACOES.map(({ grupo, titulo }) => {
    const pool = disponiveis.filter((e) => grupoTabata(e) === grupo);
    return { grupo, titulo, slots: preencherEstacao(grupo, pool, rng), rounds: TABATA.roundsPorEstacao };
  });

  return {
    protocolo: TABATA,
    estacoes,
    duracaoSeg: estimarDuracaoSeg(),
    viabilidade: {
      ok: true,
      nota: `4 estações TABATA. Turma de até ${nAlunos} faz junto (peso corporal) ou em revezamento onde o aparelho tiver poucas unidades.`,
    },
  };
}

/** Duração estimada total: 4 estações × 16 rounds × (20+10)s + descansos + aquecimento. */
export function estimarDuracaoSeg() {
  const trabalho = HIIT_ESTACOES.length * TABATA.roundsPorEstacao * (TABATA.trabalhoSeg + TABATA.descansoSeg);
  const descansos = (HIIT_ESTACOES.length - 1) * DESCANSO_ENTRE_ESTACOES_SEG;
  return trabalho + descansos + AQUECIMENTO_SEG;
}

/**
 * Volume nominal (condicionamento) p/ manter cenários/mesociclo válidos.
 * Cada slot conta um equivalente-séries no padrão do seu exercício.
 * @param {ReturnType<typeof gerarHiitTabata>['estacoes']} estacoes
 * @returns {Volume}
 */
export function volumeHiit(estacoes) {
  const SERIES_EQUIV = 2; // TABATA = muitos rounds curtos; equivalente modesto por slot
  const porId = Object.fromEntries(EXERCICIOS.map((e) => [e.id, e]));
  /** @type {Record<string, number>} */
  const porPadrao = {};
  let totalSeries = 0;
  for (const est of estacoes) {
    for (const s of est.slots) {
      const ex = porId[s.id];
      const p = ex?.padrao;
      if (p) { porPadrao[p] = (porPadrao[p] || 0) + SERIES_EQUIV; totalSeries += SERIES_EQUIV; }
    }
  }
  return { porMusculo: {}, porPadrao, totalSeries };
}
