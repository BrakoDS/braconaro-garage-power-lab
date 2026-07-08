// @ts-check
/**
 * GERADOR DE AULA GAP (Glúteo · Abdômen · Perna) — protocolo TABATA, "Siga o Mestre".
 *
 * Estrutura fixa da metodologia (9 músicas / 72 rounds), com movimentos escolhidos
 * do banco (peso corporal) a cada geração — aula INÉDITA por seed:
 *  - Aquecimento: 1 música (trio de 3 movimentos dinâmicos).
 *  - Pernas: 3 músicas (variações OU unilateral D/E + bilateral).
 *  - Glúteo: 3 músicas (variações OU unilateral D/E + bilateral).
 *  - Abdômen: 2 músicas (trio, com ao menos 1 isométrico).
 * Cada música = 8 rounds com 3 exercícios cíclicos (1,2,3,1,2,3,1,2).
 *
 * @typedef {import('../data/gap.js').MovGap} MovGap
 * @typedef {import('./volume.js').Volume} Volume
 */
import { GAP_AQUECIMENTO, GAP_PERNAS, GAP_GLUTEO, GAP_ABDOMEN } from '../data/gap.js';
import { ALUNOS_POR_SESSAO } from '../data/equipamentos.js';

export const TABATA = { trabalhoSeg: 20, descansoSeg: 10, roundsPorMusica: 8 };
/** Distribuição cíclica dos 3 exercícios em 8 rounds: 1,2,3,1,2,3,1,2. */
const CICLO8 = [0, 1, 2, 0, 1, 2, 0, 1];
const DESCANSO_ENTRE_MUSICAS_SEG = 30;

// -------- RNG determinístico (mesmo mulberry32 dos outros geradores) --------
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

/** Embaralha (Fisher–Yates) sem mutar. @template T @param {T[]} arr @param {() => number} rng */
function embaralhar(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Monta os 3 slots de uma música (variações de 1 base) → labels dos 3 exercícios. @param {MovGap} base */
function slotsVariacoes(base) {
  const dinamica = base.salto ? `${base.nome} com salto` : base.nome;
  return [dinamica, `${base.nome} com 3 quicadas`, `${base.nome} isométrico (segura)`];
}
/** Slots de bloco unilateral: D, E, terceiro bilateral. @param {MovGap} uni @param {MovGap} terceiro */
function slotsUnilateral(uni, terceiro) {
  const t = terceiro.soIsometrico ? `${terceiro.nome}` : (terceiro.quicada ? `${terceiro.nome} com 3 quicadas` : terceiro.nome);
  return [`${uni.nome} — Lado Direito`, `${uni.nome} — Lado Esquerdo`, t];
}
/** Slots de trio: 3 movimentos distintos. @param {MovGap[]} tres */
function slotsTrio(tres) { return tres.map((m) => m.nome); }

/** Expande 3 slots em 8 rounds cíclicos. @param {string} titulo @param {string} tipo @param {string[]} slots */
function musica(titulo, tipo, slots) {
  return { titulo, tipo, rounds: CICLO8.map((idx, i) => ({ n: i + 1, nome: slots[idx] })) };
}

/**
 * Monta 1 música para uma parte com foco em membro (Pernas/Glúteo), alternando entre
 * bloco de VARIAÇÕES e bloco UNILATERAL, sem repetir movimento-base na mesma aula.
 * @param {MovGap[]} banco @param {() => number} rng @param {Set<string>} usados @param {number} indice
 */
function musicaMembro(banco, rng, usados, indice) {
  const disp = embaralhar(banco.filter((m) => !usados.has(m.id)), rng);
  const variaveis = disp.filter((m) => m.quicada && m.isometrico && !m.unilateral);
  const unilaterais = disp.filter((m) => m.unilateral);
  const preferUnilateral = indice % 2 === 1; // alterna o padrão entre as músicas

  const usarUnilateral = (preferUnilateral && unilaterais.length) || !variaveis.length;
  if (usarUnilateral && unilaterais.length) {
    const uni = unilaterais[0];
    // terceiro: um bilateral (estático de preferência) que não seja unilateral e ainda não usado
    const terceiro = disp.find((m) => !m.unilateral && m.id !== uni.id && (m.soIsometrico || m.quicada))
      || disp.find((m) => !m.unilateral && m.id !== uni.id) || uni;
    usados.add(uni.id); if (terceiro.id !== uni.id) usados.add(terceiro.id);
    return musica(uni.nome, 'unilateral', slotsUnilateral(uni, terceiro));
  }
  const base = variaveis[0] || disp[0];
  usados.add(base.id);
  return musica(base.nome, 'variacoes', slotsVariacoes(base));
}

/** Monta 1 música de trio (aquecimento/abdômen). @param {MovGap[]} banco @param {() => number} rng @param {Set<string>} usados @param {string} titulo @param {boolean} [exigirIso] */
function musicaTrio(banco, rng, usados, titulo, exigirIso = false) {
  const disp = embaralhar(banco.filter((m) => !usados.has(m.id)), rng);
  const escolhidos = [];
  if (exigirIso) { const iso = disp.find((m) => m.soIsometrico); if (iso) escolhidos.push(iso); }
  for (const m of disp) { if (escolhidos.length >= 3) break; if (!escolhidos.includes(m)) escolhidos.push(m); }
  escolhidos.forEach((m) => usados.add(m.id));
  return musica(titulo, 'trio', slotsTrio(embaralhar(escolhidos, rng).slice(0, 3)));
}

/**
 * Gera a aula GAP completa.
 * @param {{ seed?: number, nAlunos?: number }} [opcoes]
 */
export function gerarGap(opcoes = {}) {
  const nAlunos = opcoes.nAlunos ?? ALUNOS_POR_SESSAO;
  const rng = mulberry32(opcoes.seed ?? hashSeed('gap-' + Date.now()));

  const usadosPernas = new Set(); const usadosGluteo = new Set();
  const usadosAquec = new Set(); const usadosAbd = new Set();

  const partes = [
    { nome: 'Aquecimento', musicas: [musicaTrio(GAP_AQUECIMENTO, rng, usadosAquec, 'Ativação geral')] },
    { nome: 'Pernas', musicas: [0, 1, 2].map((i) => musicaMembro(GAP_PERNAS, rng, usadosPernas, i)) },
    { nome: 'Glúteo', musicas: [0, 1, 2].map((i) => musicaMembro(GAP_GLUTEO, rng, usadosGluteo, i)) },
    { nome: 'Abdômen', musicas: [0, 1].map((i) => musicaTrio(GAP_ABDOMEN, rng, usadosAbd, `Abdômen ${i + 1}`, true)) },
  ];

  return {
    protocolo: TABATA,
    partes,
    totalMusicas: partes.reduce((a, p) => a + p.musicas.length, 0),
    totalRounds: partes.reduce((a, p) => a + p.musicas.length * TABATA.roundsPorMusica, 0),
    duracaoSeg: estimarDuracaoSeg(),
    viabilidade: {
      ok: true,
      nota: `Aula de peso corporal — turma de até ${nAlunos} acompanha o professor (Siga o Mestre). Não depende de equipamento.`,
    },
  };
}

/** Duração: 9 músicas × 8 rounds × (20+10)s + descanso entre músicas. */
export function estimarDuracaoSeg() {
  const musicas = 9;
  const trabalho = musicas * TABATA.roundsPorMusica * (TABATA.trabalhoSeg + TABATA.descansoSeg);
  return trabalho + (musicas - 1) * DESCANSO_ENTRE_MUSICAS_SEG;
}

/**
 * Volume nominal (condicionamento) p/ manter cenários/mesociclo válidos quando o GAP
 * entra na grade (ou substitui o HIIT no mesociclo). Cobre trem inferior + core.
 * @returns {Volume}
 */
export function volumeGap() {
  return {
    porMusculo: {},
    porPadrao: { quadriceps: 9, posterior_gluteo: 9, core: 8, empurrar: 2 },
    totalSeries: 28,
  };
}
