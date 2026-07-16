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
 * @typedef {'superiores'|'inferiores'} Split
 *
 * @typedef {Object} MobilidadeItem
 * @property {string} nome
 * @property {number} duracaoSeg
 *
 * @typedef {Object} TecnicaTag
 * @property {'biset'|'dropset'|'isometria'|'tempo'} tipo
 * @property {string} detalhe          Texto explicativo pro coach/aluno
 * @property {string} [parceiroNome]   Nome do outro exercício do bi-set (quando tipo==='biset')
 *
 * @typedef {Object} ItemHipertrofiaHibrido
 * @property {Exercicio} exercicio
 * @property {number} series
 * @property {string} reps
 * @property {number} descansoSeg
 * @property {number} tempoSeg
 * @property {TecnicaTag|null} tecnica
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

const NIVEL_ORDEM = { iniciante: 1, intermediario: 2, avancado: 3 };
const MOBILIDADE_SEG = 360; // 6 min fixos
const SERIES_BASE = 3;      // base de séries do bloco de hipertrofia (10-12 reps)
const REPS_HIPERTROFIA = '10–12 reps';
const DESCANSO_HIPERTROFIA_SEG = 60;

export const SPLIT_LABEL = { superiores: 'Superiores', inferiores: 'Inferiores' };
/** @type {Record<Split, Padrao[]>} */
const SPLIT_PADROES = { superiores: ['empurrar', 'puxar'], inferiores: ['quadriceps', 'posterior_gluteo'] };
/** Músculos-alvo pra priorizar a mobilidade do split (aproxima quadril/tornozelo via músculos já existentes). */
const SPLIT_MUSCULOS_MOBILIDADE = {
  superiores: ['ombro', 'core'],
  inferiores: ['gluteo', 'quadriceps', 'panturrilha', 'core'],
};

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
 * Split do dia — alterna por semana (ímpar=Superiores, par=Inferiores). Determinístico:
 * a mesma semana sempre gera o mesmo split, mas o mesociclo inteiro varia o foco.
 * @param {number} semana
 * @returns {Split}
 */
export function escolherSplit(semana) {
  const s = ((Math.max(1, semana) - 1) % 4) + 1;
  return s % 2 === 1 ? 'superiores' : 'inferiores';
}

/**
 * Bloco de mobilidade (6 min): prioriza exercícios cujas articulações/músculos batem
 * com o split do dia; completa com o restante do banco de mobilidade se faltar.
 * @param {Split} split @param {() => number} rng
 * @returns {MobilidadeItem[]}
 */
export function montarMobilidade(split, rng) {
  const banco = EXERCICIOS.filter((e) => e.categorias.includes('mobilidade'));
  const alvo = new Set(SPLIT_MUSCULOS_MOBILIDADE[split]);
  const bate = (e) => e.musculosPrimarios.some((m) => alvo.has(m));
  const prioritarios = embaralhar(banco.filter(bate), rng);
  const resto = embaralhar(banco.filter((e) => !bate(e)), rng);
  const escolhidos = [...prioritarios, ...resto].slice(0, 3);
  if (!escolhidos.length) return [];
  const duracaoSeg = Math.round(MOBILIDADE_SEG / escolhidos.length);
  return escolhidos.map((ex) => ({ nome: ex.nome, duracaoSeg }));
}

/**
 * Pontua um candidato de hipertrofia: prioriza padrão do split ainda descoberto,
 * variedade de equipamento, viabilidade p/ 8 alunos, e evita repetir a semana anterior.
 */
function pontuarHipertrofia(ex, selecionados, faltantes, idsAnteriores, nAlunos, nExercicios, rng) {
  let s = 0;
  if (faltantes.has(ex.padrao)) s += 100;
  if (idsAnteriores.has(ex.id)) s -= 40;
  if (!podeAdicionar(selecionados.map((i) => i.exercicio), ex, nAlunos, nExercicios)) s -= 1000;
  for (const equipId of ex.equipamento) {
    const usos = selecionados.filter((i) => i.exercicio.equipamento.includes(equipId)).length;
    s -= usos * 18;
  }
  s += rng() * 10;
  return s;
}

/**
 * Bloco de Hipertrofia: 4–6 exercícios do split do dia, 10–12 reps, misturando
 * multiarticulares e isolados. Volume real (via calcularVolume) — não nominal.
 * @param {{split:Split, nivel:Nivel, semana:number, nAlunos:number, idsEvitar:string[], rng:() => number}} o
 * @returns {ItemHipertrofiaHibrido[]}
 */
export function montarHipertrofia({ split, nivel, semana, nAlunos, idsEvitar, rng }) {
  const nivelAluno = NIVEL_ORDEM[nivel];
  const padroesDoSplit = SPLIT_PADROES[split];
  // Exclui exercícios SÓ de mobilidade (isometria/prep articular) — não são hipertrofia de
  // verdade, mesmo quando padrao bate (mesmo filtro que o motor genérico usa).
  const naoMobilidadePura = (e) => !(e.categorias.length === 1 && e.categorias[0] === 'mobilidade');
  // O bloco 2 é HIPERTROFIA — só exercícios marcados como hipertrofia/força entram. Sem
  // isto, movimentos de cross/WOD (thruster, burpee, sled, kb swing, wall ball, sandbag
  // lunges...) cujo padrão bate com o split vazavam pra cá. O cross fica no bloco 3 (WOD),
  // montado à parte por `montarWod` (categorias 'wod').
  const ehHipertrofia = (e) => e.categorias.includes('hipertrofia') || e.categorias.includes('forca');
  const elegivel = (e) => padroesDoSplit.includes(e.padrao) && NIVEL_ORDEM[e.nivel] <= nivelAluno && naoMobilidadePura(e) && ehHipertrofia(e);
  const pool = EXERCICIOS.filter(elegivel);
  const poolAmplo = EXERCICIOS.filter((e) => padroesDoSplit.includes(e.padrao) && naoMobilidadePura(e) && ehHipertrofia(e)); // sem teto de nível — rede de segurança

  const nExercicios = 4 + Math.floor(rng() * 3); // 4..6
  const idsAnteriores = new Set(idsEvitar);
  /** @type {ItemHipertrofiaHibrido[]} */
  const selecionados = [];
  const seriesBase = seriesAjustadas(SERIES_BASE, semana, nivel);

  const empacotar = (ex) => ({ exercicio: ex, series: seriesBase, reps: REPS_HIPERTROFIA, descansoSeg: DESCANSO_HIPERTROFIA_SEG, tempoSeg: 0, tecnica: null });
  const candidatos = (fonte, faltantes) => fonte
    .filter((e) => !selecionados.some((i) => i.exercicio.id === e.id))
    .map((e) => ({ e, score: pontuarHipertrofia(e, selecionados, faltantes, idsAnteriores, nAlunos, nExercicios, rng) }))
    .sort((a, b) => b.score - a.score);
  const viavel = (c) => c.length && c[0].score > -500;

  // 1) garante os 2 padrões do split (ex.: pelo menos 1 empurrar + 1 puxar)
  for (const padrao of padroesDoSplit) {
    const faltantes = new Set(padroesDoSplit.filter((p) => !selecionados.some((i) => i.exercicio.padrao === p)));
    let cs = candidatos(pool.filter((e) => e.padrao === padrao), faltantes);
    if (!viavel(cs)) cs = candidatos(poolAmplo.filter((e) => e.padrao === padrao), faltantes);
    if (viavel(cs)) selecionados.push(empacotar(cs[0].e));
  }
  // 2) completa até nExercicios, alternando padrão pra equilibrar volume dentro do split
  while (selecionados.length < nExercicios) {
    const porPadrao = Object.fromEntries(padroesDoSplit.map((p) => [p, 0]));
    for (const i of selecionados) porPadrao[i.exercicio.padrao] = (porPadrao[i.exercicio.padrao] || 0) + 1;
    const faltantes = new Set([...padroesDoSplit].sort((a, b) => porPadrao[a] - porPadrao[b]));
    let cs = candidatos(pool, faltantes);
    if (!viavel(cs)) cs = candidatos(poolAmplo, faltantes);
    if (!viavel(cs)) break;
    selecionados.push(empacotar(cs[0].e));
  }

  garantirIsolado(selecionados, pool, poolAmplo, padroesDoSplit, nAlunos, rng);
  return atribuirTecnicas(selecionados, split, rng);
}

/**
 * O briefing pede a mistura de multiarticulares E isolados — a pontuação (que
 * favorece viabilidade/variedade) nem sempre puxa um isolado sozinha. Se a lista
 * saiu 100% composta, troca o ÚLTIMO exercício de um padrão com mais de 1 opção
 * selecionada por um isolado viável do mesmo padrão (não mexe se isso descobrir
 * algum dos 2 padrões obrigatórios do split).
 */
function garantirIsolado(selecionados, pool, poolAmplo, padroesDoSplit, nAlunos, rng) {
  if (selecionados.some((i) => i.exercicio.multiarticular === false)) return;
  const isolados = embaralhar([...pool, ...poolAmplo].filter((e) => e.multiarticular === false), rng);
  for (const iso of isolados) {
    const idx = selecionados.map((i) => i.exercicio.padrao).lastIndexOf(iso.padrao);
    if (idx < 0) continue;
    const restante = selecionados.filter((_, i) => i !== idx).map((i) => i.exercicio);
    const cobreAindaOsPadroes = padroesDoSplit.every((p) => restante.some((e) => e.padrao === p) || iso.padrao === p);
    if (!cobreAindaOsPadroes) continue;
    if (!podeAdicionar(restante, iso, nAlunos, selecionados.length)) continue;
    selecionados[idx] = { ...selecionados[idx], exercicio: iso };
    return;
  }
}

/**
 * Distribui as técnicas avançadas por CRITÉRIO LÓGICO (não aleatório puro):
 *  - Bi-set: um par que cobre os 2 padrões do split (agonista/antagonista natural).
 *  - Drop-set: no último multiarticular (drop-set clássico fecha num composto).
 *  - Isometria 1-2s no pico: numa isolada (fallback: qualquer exercício restante).
 *  - Tempo 2-1-2: no que sobrar, se sobrar.
 * @param {ItemHipertrofiaHibrido[]} itens @param {Split} split @param {() => number} rng
 */
function atribuirTecnicas(itens, split, rng) {
  if (itens.length < 2) return itens;
  const [padA, padB] = SPLIT_PADROES[split];
  const marcados = new Set();

  // 1) bi-set: 1 exercício de cada padrão do split
  const deA = itens.filter((i) => i.exercicio.padrao === padA && !marcados.has(i));
  const deB = itens.filter((i) => i.exercicio.padrao === padB && !marcados.has(i));
  if (deA.length && deB.length) {
    const a = deA[Math.floor(rng() * deA.length)], b = deB[Math.floor(rng() * deB.length)];
    a.tecnica = { tipo: 'biset', detalhe: `Bi-set com ${b.exercicio.nome} — sem descanso entre os dois`, parceiroNome: b.exercicio.nome };
    b.tecnica = { tipo: 'biset', detalhe: `Bi-set com ${a.exercicio.nome} — sem descanso entre os dois`, parceiroNome: a.exercicio.nome };
    marcados.add(a); marcados.add(b);
  }

  const restantes = () => itens.filter((i) => !marcados.has(i) && !i.tecnica);
  const multiarticulares = () => restantes().filter((i) => i.exercicio.multiarticular !== false);
  const isolados = () => restantes().filter((i) => i.exercicio.multiarticular === false);

  // 2) drop-set no último multiarticular restante
  const mults = multiarticulares();
  if (mults.length) {
    const alvo = mults[mults.length - 1];
    alvo.tecnica = { tipo: 'dropset', detalhe: 'Drop-set na última série: reduza a carga e vá até a falha' };
    marcados.add(alvo);
  }

  // 3) isometria numa isolada (fallback: qualquer restante)
  const isos = isolados();
  const candidataIso = isos.length ? isos[Math.floor(rng() * isos.length)] : restantes()[0];
  if (candidataIso) {
    candidataIso.tecnica = { tipo: 'isometria', detalhe: 'Isometria de 1–2s no pico da contração, em toda série' };
    marcados.add(candidataIso);
  }

  // 4) tempo 2-1-2 no que sobrar
  const sobrou = restantes()[0];
  if (sobrou) sobrou.tecnica = { tipo: 'tempo', detalhe: 'Cadência 2-1-2 (2s descida · 1s pico · 2s subida)' };

  return itens;
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
 * WOD (10–20 min): formato sorteado; movimentos priorizam padrões OPOSTOS ao split
 * do dia (não refadiga o que a hipertrofia já carregou) sem excluir por completo.
 * Duração é função do tempo do bloco de hipertrofia — mantém o WOD perto de ~20% do
 * tempo total da sessão.
 * @param {{split:Split, tempoHipertrofiaSeg:number, nAlunos:number, rng:() => number}} o
 * @returns {BlocoWod}
 */
export function montarWod({ split, tempoHipertrofiaSeg, nAlunos, rng }) {
  const formato = FORMATOS_WOD[Math.floor(rng() * FORMATOS_WOD.length)];
  // Só exercícios de Cross/WOD: built-in carregam a tag 'wod'; exercícios que o coach
  // cria e classifica como CROSS na Academia chegam com 'cross'. Aceita os dois.
  const ehCross = (e) => e.categorias.includes('cross') || e.categorias.includes('wod');
  const wodPool = EXERCICIOS.filter((e) => ehCross(e) && e.equipamento.every((id) => unidadesDe(id) >= 1));
  const padroesOpostos = new Set(SPLIT_PADROES[split === 'superiores' ? 'inferiores' : 'superiores']);

  const pontuar = (ex) => {
    let s = padroesOpostos.has(ex.padrao) ? 40 : 0; // prioriza sem excluir
    if (grupoWod(ex) === 'monoestrutural') s += 15; // condicionamento sempre bem-vindo
    const min = ex.equipamento.length ? Math.min(...ex.equipamento.map(unidadesDe)) : 99;
    s += min >= nAlunos ? 20 : min >= Math.ceil(nAlunos / 2) ? 8 : 0;
    return s + rng() * 15;
  };
  const ordenado = embaralhar(wodPool, rng).map((e) => ({ e, s: pontuar(e) })).sort((a, b) => b.s - a.s);
  const nMovs = 3 + Math.floor(rng() * 3); // 3..5

  // Garante pelo menos 1 movimento de CADA padrão oposto ao split — sem isso, um
  // padrão com poucos exercícios 'wod' no catálogo (ex.: só 1 de posterior_gluteo)
  // podia nunca aparecer, e o mínimo semanal daquele padrão ficava sem cobertura
  // nas semanas em que o Híbrido é o único dia "de sobra" da combinação de 3 dias.
  const escolhidos = [];
  for (const p of padroesOpostos) {
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

  // duração ~ 1/4 do tempo de hipertrofia, clampada a 10-20min e arredondada a 5min
  const bruto = Math.round(tempoHipertrofiaSeg / 4 / 60);
  const duracaoMin = Math.min(20, Math.max(10, Math.round(bruto / 5) * 5));

  return { formato, descricaoFormato: DESCRICAO_FORMATO[formato], duracaoMin, movimentos };
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
  const mobilidade = montarMobilidade(split, rng);
  const hipertrofia = montarHipertrofia({ split, nivel, semana, nAlunos, idsEvitar, rng });
  for (const i of hipertrofia) i.tempoSeg = i.series * (30 + i.descansoSeg) + 20;
  const tHiper = tempoHipertrofiaSeg(hipertrofia);
  const wod = montarWod({ split, tempoHipertrofiaSeg: tHiper, nAlunos, rng });

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
