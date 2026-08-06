// @ts-check
/**
 * GERADOR DE TREINO HÍBRIDO — Mobilidade → Hipertrofia (split) → WOD.
 *
 * Ao contrário das outras modalidades do box (full body, mesmo treino p/ todos), o
 * Híbrido roda em SPLIT ROTATIVO — Superiores (empurrar+puxar) ou Inferiores
 * (quadríceps+posterior/glúteo) — alternando por semana. Isso é o que dá sentido à
 * "coerência biomecânica": a mobilidade é escolhida pelas articulações do split do
 * dia, e o WOD prioriza padrões OPOSTOS ao split (não refadiga o que já foi treinado).
 *
 * Nada aqui é fixo — os 3 blocos são montados a partir do catálogo real (nenhum
 * exercício específico está hardcoded como "o" treino híbrido).
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 *
 * @typedef {Object} MobilidadeItem
 * @property {string} nome
 * @property {number} duracaoSeg
 * @property {string[]} [musculosAlvo]
 *
 * @typedef {Object} TecnicaTag
 * @property {'biset'|'dropset'|'isometria'|'tempo'} tipo
 * @property {string} detalhe          Texto explicativo pro coach/aluno
 * @property {string} [parceiroNome]   Nome do outro exercício do bi-set (quando tipo==='biset')
 *
 * @typedef {Object} PostoHipertrofia
 * @property {string} par              Id do par antagonista
 * @property {string} parLabel         Ex.: 'Peito / Costas'
 * @property {Exercicio} a
 * @property {Exercicio} b
 * @property {number} series
 * @property {number} reps
 * @property {number} descansoSeg
 * @property {number} pctRM
 * @property {number} tempoSeg
 * @property {TecnicaTag|null} [tecnica]
 *
 * @typedef {Object} MovimentoWod
 * @property {string} nome
 * @property {'peso'|'corporal'|'monoestrutural'} grupo
 * @property {Padrao} padraoDominante
 * @property {string[]} equipamento
 * @property {string} prescricao
 *
 * @typedef {Object} BlocoWod
 * @property {'AMRAP'|'EMOM'|'For Time'|'Chipper'} formato
 * @property {string} descricaoFormato
 * @property {number} duracaoMin
 * @property {MovimentoWod[]} movimentos
 *
 * @typedef {Object} Hibrido
 * @property {Split} split
 * @property {string} splitLabel
 * @property {MobilidadeItem[]} mobilidade
 * @property {ItemHipertrofiaHibrido[]} hipertrofia
 * @property {BlocoWod} wod
 * @property {number} duracaoSeg
 * @property {{ok:boolean, nota:string}} viabilidade
 */
import { EXERCICIOS } from '../data/exercicios.js';
import { ALUNOS_POR_SESSAO, unidadesDe } from '../data/equipamentos.js';
import { verificarViabilidade, podeAdicionar } from './viabilidade.js';
import { calcularVolume } from './volume.js';
import { seriesAjustadas } from './periodizacao.js';
import {
  PARES_ANTAGONISTAS, calcularPostos, calcularSeries, prescricaoSemana, SERIE_SEG,
} from './hibrido-postos.js';

const NIVEL_ORDEM = { iniciante: 1, intermediario: 2, avancado: 3 };
const MOBILIDADE_SEG = 240;          // 4 min nas semanas 1–3
const MOBILIDADE_DELOAD_SEG = 720;   // 12 min na semana 4 — vira bloco de recuperação
const SERIES_BASE = 3;      // base de séries do bloco de hipertrofia (10-12 reps)
const REPS_HIPERTROFIA = '10–12 reps';
const DESCANSO_HIPERTROFIA_SEG = 60;

/** Os 4 padrões que a Hipertrofia percorre livremente (substituem o split de 2). */
export const PADROES_PRINCIPAIS = ['empurrar', 'puxar', 'quadriceps', 'posterior_gluteo'];

// -------- RNG determinístico (mesmo mulberry32 do resto do gerador) --------
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
/** Fisher–Yates com rng. @template T @param {T[]} arr @param {() => number} rng */
function embaralhar(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Bloco de mobilidade: mira nos músculos que os postos deste dia vão treinar
 * (mesmo princípio do `focoDoDia()` do motor genérico). Por isso roda DEPOIS da
 * montagem dos postos.
 *
 * Na semana de deload o bloco vai de 4 para 12 min: é o tempo que a Hipertrofia
 * devolveu ao cortar uma série, e ele volta como recuperação em vez de mais
 * esforço — do contrário o "deload" só trocaria a fadiga de lugar.
 * @param {PostoHipertrofia[]} postos @param {() => number} rng @param {boolean} ehDeload
 * @returns {MobilidadeItem[]}
 */
export function montarMobilidade(postos, rng, ehDeload = false) {
  const total = ehDeload ? MOBILIDADE_DELOAD_SEG : MOBILIDADE_SEG;
  const banco = EXERCICIOS.filter((e) => e.categorias.includes('mobilidade'));
  const alvo = new Set(['core']);
  for (const p of postos) {
    for (const ex of [p.a, p.b]) for (const m of ex.musculosPrimarios || []) alvo.add(m);
  }
  const bate = (e) => e.musculosPrimarios.some((m) => alvo.has(m));
  const prioritarios = embaralhar(banco.filter(bate), rng);
  const resto = embaralhar(banco.filter((e) => !bate(e)), rng);
  // Deload tem 3x mais tempo — cabe mais variedade sem virar 4 min por exercício.
  const nItens = ehDeload ? 6 : 3;
  const escolhidos = [...prioritarios, ...resto].slice(0, nItens);
  if (!escolhidos.length) return [];
  const duracaoSeg = Math.round(total / escolhidos.length);
  return escolhidos.map((ex) => ({
    nome: ex.nome, duracaoSeg, musculosAlvo: ex.musculosPrimarios,
  }));
}

/** Ids de core por plano de movimento — o catálogo não tem campo pra isso, e o par
 *  de core precisa juntar planos diferentes (não dois crunches seguidos). */
const CORE_FLEXAO = ['abdominal_supra', 'abdominal_infra', 'abdominal_remador', 'abdominal_monocross', 'abdominal_bicicleta'];
const CORE_ANTI = ['russian_twist', 'pallof_press', 'fallout_trx'];

/**
 * Pontua um candidato. Sem bônus de composto: o músculo do lado já decide se o
 * exercício é composto (peito/costas, pernas) ou isolado (braços, core), e o bônus
 * só distorceria os postos de braço, onde todo candidato é isolado.
 * @param {Exercicio} ex @param {Exercicio[]} usados @param {Set<string>} idsAnteriores
 * @param {number} nAlunos @param {number} slots @param {() => number} rng
 */
function pontuarPosto(ex, usados, idsAnteriores, nAlunos, slots, rng) {
  let s = 0;
  if (idsAnteriores.has(ex.id)) s -= 40;
  if (!podeAdicionar(usados, ex, nAlunos, slots)) s -= 1000;
  for (const equipId of ex.equipamento) {
    s -= usados.filter((u) => u.equipamento.includes(equipId)).length * 18;
  }
  return s + rng() * 10;
}

/**
 * Melhor candidato de um lado do par. Tenta primeiro o pool com teto de nível;
 * se não houver ninguém viável, reabre sem o teto (rede de segurança).
 * @returns {Exercicio|null}
 */
function escolherLado(musculos, ids, { pool, poolAmplo, usados, idsAnteriores, nAlunos, slots, rng }) {
  const tentar = (fonte) => fonte
    .filter((e) => musculos.some((m) => e.musculosPrimarios.includes(m)))
    .filter((e) => !ids || ids.includes(e.id))
    .filter((e) => !usados.some((u) => u.id === e.id))
    .map((e) => ({ e, score: pontuarPosto(e, usados, idsAnteriores, nAlunos, slots, rng) }))
    .filter((c) => c.score > -500)
    .sort((x, y) => y.score - x.score);
  return tentar(pool)[0]?.e ?? tentar(poolAmplo)[0]?.e ?? null;
}

/**
 * Monta os postos de bi-set antagonista. Quantos postos e quantas séries vêm do
 * tamanho da turma (`hibrido-postos.js`); reps/pausa/carga vêm da semana.
 * Se um lado ficar sem candidato, o posto é descartado e o bloco degrada com
 * menos postos — mesma tolerância que o gerador já tinha.
 * @param {{nivel:Nivel, semana:number, nAlunos:number, idsEvitar:string[], rng:() => number}} o
 * @returns {PostoHipertrofia[]}
 */
export function montarPostos({ nivel, semana, nAlunos, idsEvitar, rng }) {
  const nPostos = calcularPostos(nAlunos);
  const presc = prescricaoSemana(semana, nivel);
  const seriesBase = calcularSeries(nPostos);
  const series = presc.ehDeload ? Math.max(2, seriesBase - 1) : seriesBase;
  const slots = 2 * nPostos;
  const nivelAluno = NIVEL_ORDEM[nivel];

  const base = EXERCICIOS.filter((e) => e.categorias.includes('musculacao') && !e.ocupaTudo);
  const pool = base.filter((e) => NIVEL_ORDEM[e.nivel] <= nivelAluno);
  const idsAnteriores = new Set(idsEvitar);

  /** @type {Exercicio[]} */
  const usados = [];
  /** @type {PostoHipertrofia[]} */
  const postos = [];

  for (const par of PARES_ANTAGONISTAS.slice(0, nPostos)) {
    const ctx = { pool, poolAmplo: base, usados, idsAnteriores, nAlunos, slots, rng };
    // O par de core precisa de planos diferentes; os outros não têm restrição de id.
    const idsA = par.id === 'core' ? CORE_FLEXAO : null;
    const idsB = par.id === 'core' ? CORE_ANTI : null;
    const a = escolherLado(par.a, idsA, ctx);
    if (!a) continue;
    usados.push(a);
    const b = escolherLado(par.b, idsB, ctx);
    if (!b) { usados.pop(); continue; }
    usados.push(b);
    postos.push({
      par: par.id, parLabel: par.label, a, b,
      series, reps: presc.reps, descansoSeg: presc.descansoSeg, pctRM: presc.pctRM,
      tempoSeg: series * SERIE_SEG,
    });
  }
  return postos;
}

/** Grupo do movimento de WOD, derivado do equipamento real (sem banco à parte). */
function grupoWod(ex) {
  if (ex.equipamento.some((id) => ['air_bike', 'corrida', 'corda_naval'].includes(id))) return 'monoestrutural';
  if (ex.equipamento.length === 1 && ex.equipamento[0] === 'corporal') return 'corporal';
  return 'peso';
}
const FORMATOS_WOD = /** @type {const} */ (['AMRAP', 'EMOM', 'For Time', 'Chipper']);
const DESCRICAO_FORMATO = {
  'AMRAP': 'Máximo de rodadas possíveis no tempo — cronômetro corre até o fim.',
  'EMOM': 'A cada minuto, execute o bloco de movimentos e descanse o restante do minuto.',
  'For Time': 'Complete tudo o mais rápido possível — cronometra o tempo total.',
  'Chipper': 'Uma lista longa de movimentos, na ordem, sem repetir rodada (cada um só 1×).',
};
/** Prescrição textual por grupo (reps p/ peso/corporal, distância/tempo p/ monoestrutural). */
function prescricaoWod(ex, rng) {
  const g = grupoWod(ex);
  if (g === 'monoestrutural') return ['200m', '250m', '300m'][Math.floor(rng() * 3)];
  const reps = [10, 12, 15, 20][Math.floor(rng() * 4)];
  return `${reps} reps`;
}

/** Segue a MESMA onda de periodização que decide as séries (periodizacao.js) — não mais uma fração do tempo da Hipertrofia. */
export function duracaoWodPorSeries(series) {
  if (series <= 2) return 12; // deload
  if (series === 3) return 16; // semanas normais
  return 20; // pico (4 séries — só intermediário/avançado bate; ver periodizacao.js)
}

/**
 * WOD: formato sorteado; movimentos priorizam os padrões que a Hipertrofia NÃO
 * cobriu hoje (rede de segurança pro full body fechar no dia inteiro — substitui
 * a antiga prioridade por "padrão oposto ao split", que não existe mais).
 * Duração segue `duracaoWodPorSeries` — a mesma onda de periodização das séries.
 * @param {{padroesFaltantes:Set<Padrao>, series:number, nAlunos:number, rng:() => number}} o
 * @returns {BlocoWod}
 */
export function montarWod({ padroesFaltantes, series, nAlunos, rng }) {
  const formato = FORMATOS_WOD[Math.floor(rng() * FORMATOS_WOD.length)];
  const ehCross = (e) => e.categorias.includes('cross') || e.categorias.includes('wod');
  const wodPool = EXERCICIOS.filter((e) => ehCross(e) && e.equipamento.every((id) => unidadesDe(id) >= 1));

  const pontuar = (ex) => {
    let s = padroesFaltantes.has(ex.padrao) ? 40 : 0;
    if (grupoWod(ex) === 'monoestrutural') s += 15;
    const min = ex.equipamento.length ? Math.min(...ex.equipamento.map(unidadesDe)) : 99;
    s += min >= nAlunos ? 20 : min >= Math.ceil(nAlunos / 2) ? 8 : 0;
    return s + rng() * 15;
  };
  const ordenado = embaralhar(wodPool, rng).map((e) => ({ e, s: pontuar(e) })).sort((a, b) => b.s - a.s);
  const nMovs = 3 + Math.floor(rng() * 3);

  const escolhidos = [];
  for (const p of padroesFaltantes) {
    const cand = ordenado.find((c) => c.e.padrao === p && !escolhidos.includes(c));
    if (cand) escolhidos.push(cand);
  }
  for (const c of ordenado) {
    if (escolhidos.length >= nMovs) break;
    if (!escolhidos.includes(c)) escolhidos.push(c);
  }

  const movimentos = escolhidos.slice(0, nMovs).map(({ e }) => ({
    nome: e.nome, grupo: grupoWod(e), padraoDominante: e.padrao, equipamento: e.equipamento,
    prescricao: prescricaoWod(e, rng),
  }));

  return { formato, descricaoFormato: DESCRICAO_FORMATO[formato], duracaoMin: duracaoWodPorSeries(series), movimentos };
}

/** Tempo estimado do bloco de hipertrofia (mesma fórmula do motor genérico). */
function tempoHipertrofiaSeg(itens) {
  const TRANSICAO = 20;
  return itens.reduce((acc, i) => acc + i.series * (30 + i.descansoSeg) + TRANSICAO, 0);
}

/**
 * Gera o treino Híbrido completo (Mobilidade + Hipertrofia + WOD).
 * @param {{dia:string, semana:number, nivel:Nivel, nAlunos?:number, seed?:number, idsEvitar?:string[]}} opcoes
 * @returns {Hibrido}
 */
export function gerarHibrido(opcoes) {
  const { dia, semana, nivel, nAlunos = ALUNOS_POR_SESSAO, idsEvitar = [] } = opcoes;
  const seed = opcoes.seed ?? hashSeed(`hibrido-${dia}-${semana}-${nivel}`);
  const rng = mulberry32(seed);

  const split = escolherSplit(semana);
  const hipertrofia = montarHipertrofia({ nivel, semana, nAlunos, idsEvitar, rng });
  const mobilidade = montarMobilidade(hipertrofia, rng);
  for (const i of hipertrofia) i.tempoSeg = i.series * (30 + i.descansoSeg) + 20;
  const tHiper = tempoHipertrofiaSeg(hipertrofia);
  const cobertos = new Set(hipertrofia.map((i) => i.exercicio.padrao));
  const padroesFaltantes = new Set(PADROES_PRINCIPAIS.filter((p) => !cobertos.has(p)));
  const series = hipertrofia[0]?.series ?? 3;
  const wod = montarWod({ padroesFaltantes, series, nAlunos, rng });

  const viabilidade = verificarViabilidade(hipertrofia.map((i) => i.exercicio), nAlunos, hipertrofia.length);
  const duracaoSeg = MOBILIDADE_SEG + tHiper + wod.duracaoMin * 60 + 120; // +2min transição geral

  return {
    split, splitLabel: SPLIT_LABEL[split],
    mobilidade, hipertrofia, wod, duracaoSeg,
    viabilidade: {
      ok: viabilidade.ok,
      nota: viabilidade.ok
        ? `Foco de hoje: ${SPLIT_LABEL[split]}. WOD complementa com padrões opostos p/ não refadigar.`
        : `⚠ ${viabilidade.conflitos.join(' ')}`,
    },
  };
}

/**
 * Volume do treino Híbrido: REAL na hipertrofia (via calcularVolume) + crédito nominal
 * leve do WOD (reforça um pouco os padrões que ele de fato treina).
 * @param {ItemHipertrofiaHibrido[]} hipertrofia @param {BlocoWod} wod
 * @returns {import('./volume.js').Volume}
 */
export function volumeHibrido(hipertrofia, wod) {
  const real = calcularVolume(hipertrofia.map((i) => ({ exercicio: i.exercicio, series: i.series })));
  const CREDITO_WOD = 2.5;
  for (const m of wod.movimentos) {
    real.porPadrao[m.padraoDominante] = (real.porPadrao[m.padraoDominante] || 0) + CREDITO_WOD;
    real.totalSeries += CREDITO_WOD;
  }
  return real;
}
