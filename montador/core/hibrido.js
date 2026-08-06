// @ts-check
/**
 * GERADOR DE TREINO HÍBRIDO — Mobilidade → Hipertrofia (bi-sets) → WOD.
 *
 * A Hipertrofia roda em POSTOS, cada posto um bi-set de músculos ANTAGONISTAS
 * (peito/costas, quadríceps/posterior-glúteo, bíceps/tríceps, abdominal/abdominal).
 * Cada posto comporta 1 dupla: uma aluna no lado A, a outra no B, trocando a cada
 * série. É o bi-set que divide a turma — por isso cada exercício só precisa de 1
 * unidade de aparelho, e por isso ninguém fica na fila: o intervalo de cada uma é
 * descanso ativo do grupo que a outra acabou de trabalhar.
 *
 * Quantos postos e quantas séries vêm do tamanho da turma (`hibrido-postos.js`,
 * que trava `postos × séries = 12` para segurar o bloco em 24 min). A onda de
 * periodização não mexe nas séries — se expressa em reps, pausa e carga.
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
 * @property {'dropset'|'isometria'|'tempo'} tipo
 * @property {string} detalhe          Texto explicativo pro coach/aluno
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
 * @property {MobilidadeItem[]} mobilidade
 * @property {PostoHipertrofia[]} hipertrofia
 * @property {BlocoWod} wod
 * @property {number} duracaoSeg
 * @property {string} semanaRotulo
 * @property {{ok:boolean, nota:string}} viabilidade
 */
import { EXERCICIOS } from '../data/exercicios.js';
import { ALUNOS_POR_SESSAO, unidadesDe } from '../data/equipamentos.js';
import { verificarViabilidade, podeAdicionar } from './viabilidade.js';
import { calcularVolume } from './volume.js';
import {
  PARES_ANTAGONISTAS, calcularPostos, calcularSeries, prescricaoSemana, SERIE_SEG, duracaoWodPorSemana,
} from './hibrido-postos.js';

const NIVEL_ORDEM = { iniciante: 1, intermediario: 2, avancado: 3 };
const MOBILIDADE_SEG = 240;          // 4 min nas semanas 1–3
const MOBILIDADE_DELOAD_SEG = 720;   // 12 min na semana 4 — vira bloco de recuperação

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
      reps: presc.reps, descansoSeg: presc.descansoSeg, pctRM: presc.pctRM,
      // series/tempoSeg entram depois, calculados sobre o Nº REAL de postos (abaixo).
      series: 0, tempoSeg: 0,
    });
  }

  // As séries seguram o relógio em 24 min (`postos × séries = 12`, ver
  // hibrido-postos.js) — mas calculadas sobre `nPostos` (o pretendido), a conta só
  // fecha quando NENHUM posto cai. Se um lado ficou sem candidato e um posto foi
  // descartado, recalcular aqui sobre `postos.length` (o Nº REAL que sobreviveu)
  // reparte as séries que sobraram entre os postos restantes, e o bloco volta a
  // fechar 24 min sempre que a aritmética permitir — em vez de encolher em silêncio.
  // `gerarHibrido` avisa o coach na nota quando isso acontece.
  if (postos.length) {
    const seriesBase = calcularSeries(postos.length);
    const series = presc.ehDeload ? Math.max(2, seriesBase - 1) : seriesBase;
    for (const p of postos) { p.series = series; p.tempoSeg = series * SERIE_SEG; }
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

/**
 * WOD: formato sorteado, exceto no deload — ali é EMOM fixo, o único dos quatro
 * cujo ritmo é imposto pela estrutura (executa o bloco, descansa o resto do
 * minuto) em vez de ficar a cargo de quanto a aluna decide se enterrar.
 *
 * A priorização por padrões faltantes continua, mas raramente dispara: com os
 * pares antagonistas o full body passa a ser garantido por construção. Fica como
 * rede de segurança pros casos degradados (turma minúscula, inventário curto).
 * @param {{padroesFaltantes:Set<Padrao>, semana:number, nAlunos:number, rng:() => number}} o
 * @returns {BlocoWod}
 */
export function montarWod({ padroesFaltantes, semana, nAlunos, rng }) {
  const presc = prescricaoSemana(semana, 'intermediario');
  const formato = presc.ehDeload ? 'EMOM' : FORMATOS_WOD[Math.floor(rng() * FORMATOS_WOD.length)];
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

  return {
    formato, descricaoFormato: DESCRICAO_FORMATO[formato],
    duracaoMin: duracaoWodPorSemana(semana), movimentos,
  };
}

/**
 * Técnicas avançadas, agora aplicadas ao POSTO inteiro (não a um exercício solto).
 * O bi-set saiu da lista: todo posto já é um bi-set por construção.
 * Suspensas no deload — é o corte de intensidade que faz a semana ser deload
 * de verdade, junto com a série a menos.
 * @param {PostoHipertrofia[]} postos @param {() => number} rng @param {boolean} ehDeload
 */
export function atribuirTecnicas(postos, rng, ehDeload = false) {
  if (ehDeload) {
    for (const p of postos) p.tecnica = null;
    return postos;
  }
  const compostos = postos.filter((p) => p.par === 'peito_costas' || p.par === 'quadriceps_posterior');
  const acessorios = postos.filter((p) => p.par === 'bracos' || p.par === 'core');

  if (compostos.length) {
    const alvo = compostos[Math.floor(rng() * compostos.length)];
    alvo.tecnica = { tipo: 'dropset', detalhe: 'Drop-set na última série de cada lado: reduza a carga e vá até a falha' };
  }
  if (acessorios.length) {
    const alvo = acessorios[Math.floor(rng() * acessorios.length)];
    alvo.tecnica = { tipo: 'isometria', detalhe: 'Isometria de 1–2s no pico da contração, em toda série' };
  }
  for (const p of postos) {
    if (!p.tecnica) p.tecnica = { tipo: 'tempo', detalhe: 'Cadência 2-1-2 (2s descida · 1s pico · 2s subida)' };
  }
  return postos;
}

/** Tempo do bloco de Hipertrofia — a soma dos postos (cada um `series × SERIE_SEG`). */
function tempoHipertrofiaSeg(postos) {
  return postos.reduce((acc, p) => acc + p.tempoSeg, 0);
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
  const presc = prescricaoSemana(semana, nivel);

  const postos = atribuirTecnicas(
    montarPostos({ nivel, semana, nAlunos, idsEvitar, rng }), rng, presc.ehDeload);
  const mobilidade = montarMobilidade(postos, rng, presc.ehDeload);

  const exercicios = postos.flatMap((p) => [p.a, p.b]);
  const cobertos = new Set(exercicios.map((e) => e.padrao));
  const padroesFaltantes = new Set(
    ['empurrar', 'puxar', 'quadriceps', 'posterior_gluteo', 'core'].filter((p) => !cobertos.has(p)));
  const wod = montarWod({ padroesFaltantes, semana, nAlunos, rng });

  // Mesmo denominador `slots = 2 × nPostos` (pretendido) que `montarPostos` já usou em
  // CADA chamada de `podeAdicionar` durante a seleção — não `exercicios.length` (Nº
  // real de postos que sobreviveram). Os dois só coincidem quando nenhum posto cai;
  // quando cai, checar com o real reabre uma conta mais apertada do que a que cada
  // candidato já passou, gerando conflito falso pra uma montagem que o próprio
  // seletor julgou viável (e apagando a lista de pares da nota). tamanhoGrupo só cai
  // pra 1 quando `nAlunos ≤ slots` (turmas de até 8); turmas maiores (o teto de 4
  // postos = 8 slots vale até 20 alunos, que a UI aceita) formam grupos maiores por
  // estação — isso é esperado, não um bug.
  const nPostosPretendido = calcularPostos(nAlunos);
  const slotsPretendidos = 2 * nPostosPretendido;
  const viabilidade = verificarViabilidade(exercicios, nAlunos, slotsPretendidos);
  const tHiper = tempoHipertrofiaSeg(postos);
  const mobSeg = mobilidade.reduce((a, m) => a + m.duracaoSeg, 0);
  const duracaoSeg = mobSeg + tHiper + wod.duracaoMin * 60 + 120; // +2min transição geral

  // Quando um posto cai, `montarPostos` já reparte as séries que sobraram entre os
  // que restaram (o bloco tenta voltar a 24 min sozinho) — mas o coach precisa saber
  // que a turma perdeu um bi-set, porque a aula real ainda rende menos exercício do
  // que o previsto (menos pares trabalhados, mesmo com o tempo recuperado).
  const postosPerdidos = nPostosPretendido - postos.length;
  const avisoPostos = postosPerdidos > 0
    ? ` ⚠ ${postosPerdidos} posto${postosPerdidos > 1 ? 's' : ''} de bi-set não coube${postosPerdidos > 1 ? 'ram' : ''} por falta de exercício viável — a Hipertrofia treina menos pares do que o previsto para essa turma.`
    : '';

  return {
    mobilidade, hipertrofia: postos, wod, duracaoSeg,
    semanaRotulo: presc.rotulo,
    viabilidade: {
      ok: viabilidade.ok,
      nota: viabilidade.ok
        ? `${presc.rotulo} · ${postos.length} postos de bi-set: ${postos.map((p) => p.parLabel).join(' · ')}.${avisoPostos}`
        : `⚠ ${viabilidade.conflitos.join(' ')}`,
    },
  };
}

/**
 * Volume do Híbrido: REAL nos dois lados de cada posto + crédito nominal leve do WOD.
 * @param {PostoHipertrofia[]} postos @param {BlocoWod} wod
 * @returns {import('./volume.js').Volume}
 */
export function volumeHibrido(postos, wod) {
  const itens = postos.flatMap((p) => [
    { exercicio: p.a, series: p.series },
    { exercicio: p.b, series: p.series },
  ]);
  const real = calcularVolume(itens);
  const CREDITO_WOD = 2.5;
  for (const m of wod.movimentos) {
    real.porPadrao[m.padraoDominante] = (real.porPadrao[m.padraoDominante] || 0) + CREDITO_WOD;
    real.totalSeries += CREDITO_WOD;
  }
  return real;
}
