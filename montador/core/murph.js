// @ts-check
/**
 * TEMPLATE MURPH — versão do box, adaptada.
 *
 * Homenagem ao Tenente Michael Murphy. O original é 1 milha de corrida, 100
 * pull-ups, 200 flexões, 300 agachamentos e mais 1 milha. Aqui o miolo é o mesmo
 * para todos (600 repetições); o que muda por nível é a distância do cardio e se
 * o aluno PODE ou NÃO fracionar as repetições.
 *
 * DUAS ADAPTAÇÕES do box:
 *  - Não há barra fixa: o pull-up vira Puxada Aberta Pronada no monocross, que
 *    cobre o mesmo padrão de puxada vertical.
 *  - Quem não pode impacto (ou dia sem rua) troca a corrida por airbike.
 *
 * NÃO há checagem de equipamento aqui, de propósito: o professor organiza o
 * rodízio na hora (um grupo corre primeiro, outro começa pelas puxadas). A
 * viabilidade automática pressupõe circuito de estações simultâneas, que não é
 * como este treino roda.
 *
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 * @typedef {import('./volume.js').Volume} Volume
 */
import { ALUNOS_POR_SESSAO } from '../data/equipamentos.js';

/**
 * Os três blocos. As repetições são IGUAIS em todos os níveis — o Murph é o
 * mesmo trabalho para todo mundo; o nível decide como você chega lá.
 * @typedef {Object} BlocoMurph
 * @property {number} n
 * @property {string} nome           Nome no box
 * @property {string} base           Movimento equivalente no Murph original
 * @property {string} exercicioId    Id no catálogo (data/exercicios.js)
 * @property {number} reps
 * @property {import('../config/padroes.js').Padrao} padrao
 * @property {string[]} equipamento
 * @property {string} [nota]
 */

/** @type {BlocoMurph[]} */
export const MURPH_BLOCOS = [
  {
    n: 1, nome: 'Puxada Aberta Pronada', base: 'Pull-up', exercicioId: 'puxada_aberta_pronada',
    reps: 100, padrao: 'puxar', equipamento: ['monocross', 'pux_barra_15'],
    nota: 'Substitui o pull-up: o box não tem barra fixa, e a puxada cobre o mesmo padrão de puxada vertical.',
  },
  {
    n: 2, nome: 'Flexão de Braço', base: 'Push-up', exercicioId: 'flexao',
    reps: 200, padrao: 'empurrar', equipamento: ['corporal'],
    nota: 'Peito ao chão, corpo em prancha. Joelhos apoiados é a regressão.',
  },
  {
    n: 3, nome: 'Agachamento Livre', base: 'Air Squat', exercicioId: 'agachamento_livre',
    reps: 300, padrao: 'quadriceps', equipamento: ['corporal'],
    nota: 'Quadril abaixo do joelho, peito aberto, calcanhar no chão.',
  },
];

/** Total de repetições do miolo — 600. */
export const MURPH_TOTAL_REPS = MURPH_BLOCOS.reduce((a, b) => a + b.reps, 0);

/**
 * Cardio de abertura E de fechamento (a distância vale para CADA ponta).
 *
 * O avançado escolhe: 1,6 km em cada ponta é o Murph de verdade (1 milha na ida,
 * 1 milha na volta); `alternativa` é a saída para o dia em que isso não cabe.
 *
 * `bikeMin` é a MESMA ponta feita na airbike, para aluno sem liberação para
 * impacto ou dia sem rua. O ritmo aqui (~160 m/min) é mais lento que o do Hyrox
 * de propósito: o Murph é uma prova longa, e ninguém pedala 10 min no ritmo de
 * um tiro de 300 m.
 */
export const MURPH_CARDIO = {
  iniciante:     { metros: 500, bikeMin: 3 },
  intermediario: { metros: 800, bikeMin: 5 },
  avancado:      { metros: 1600, bikeMin: 10, alternativa: { metros: 800, bikeMin: 5 } },
};

/**
 * Como cada nível executa as 600 repetições. É AQUI que está a progressão — não
 * no volume. O particionamento do iniciante é proteção, não facilitação: 20
 * rounds curtos distribuem a fadiga e mantêm a técnica de pé até o fim.
 */
export const MURPH_EXECUCAO = {
  iniciante: {
    id: 'cindy',
    rotulo: 'Particionado — formato Cindy',
    detalhe: '20 rounds de 5 Puxadas + 10 Flexões + 15 Agachamentos. Não é permitido fazer os exercícios de forma contínua.',
    obrigatorio: true,
  },
  intermediario: {
    id: 'livre',
    rotulo: 'Livre escolha',
    detalhe: 'Particionado com qualquer estratégia, ou inteiro (todas as repetições de um exercício antes de passar ao próximo).',
    obrigatorio: false,
  },
  avancado: {
    id: 'inteiro',
    rotulo: 'Inteiro — unbroken',
    detalhe: 'As 100 Puxadas, depois as 200 Flexões, depois os 300 Agachamentos, nessa ordem, sem particionar.',
    obrigatorio: true,
  },
};

/** O round do Cindy, derivado do miolo — 20 rounds fecham exatamente as 600 reps. */
export const CINDY_ROUNDS = 20;
export const CINDY_ROUND = MURPH_BLOCOS.map((b) => ({ nome: b.nome, reps: b.reps / CINDY_ROUNDS }));

// -------- estimativa de duração (segundos) --------
/** Mesmo ritmo de corrida do Hyrox: ~10,5 km/h com penalidade de tiros curtos. */
const SEG_POR_METRO_CORRIDA = 0.34;
/** Segundos por repetição, por bloco. A puxada é mais lenta (carga + troca no aparelho). */
const SEG_POR_REP = { 1: 3, 2: 1.6, 3: 1.4 };
/** Transição por round do Cindy (trocar de exercício 3× em 20 rounds). */
const TRANSICAO_CINDY_SEG = 12;
/**
 * Pênalti do unbroken. Fazer 200 flexões seguidas é MUITO mais lento por
 * repetição que fazer 10 séries de 20 — a fadiga não perdoa. Sem este fator a
 * conta diria que o avançado termina antes do iniciante, o que é falso.
 */
const FATOR_UNBROKEN = 1.45;

/**
 * Duração estimada de um Murph para um nível.
 * @param {Nivel} nivel
 * @param {{usarAlternativa?: boolean}} [opcoes]  Avançado com a ponta curta (800 m).
 */
export function estimarDuracaoSeg(nivel, opcoes = {}) {
  const c = MURPH_CARDIO[nivel];
  const ponta = (opcoes.usarAlternativa && c.alternativa) ? c.alternativa : c;
  const cardio = ponta.metros * 2 * SEG_POR_METRO_CORRIDA; // abertura + fechamento

  const trabalho = MURPH_BLOCOS.reduce((a, b) => a + b.reps * SEG_POR_REP[b.n], 0);
  const exec = MURPH_EXECUCAO[nivel].id;
  const miolo = exec === 'cindy'
    ? trabalho + CINDY_ROUNDS * TRANSICAO_CINDY_SEG
    : exec === 'inteiro'
      ? trabalho * FATOR_UNBROKEN
      : trabalho * 1.15; // livre: fica no meio, quase todo mundo particiona um pouco

  return Math.round(cardio + miolo);
}

/**
 * Volume do Murph — nominal, mas ancorado nas repetições reais.
 *
 * 20 repetições de peso corporal valem 1 série equivalente. É uma ESTIMATIVA de
 * treino, não uma medida: 600 reps de resistência não somam o mesmo estímulo que
 * 30 séries de musculação com carga, e contar 1 série a cada 10 reps faria um
 * único Murph estourar o mínimo semanal inteiro sozinho.
 * @returns {Volume}
 */
const REPS_POR_SERIE_EQUIV = 20;

export function volumeMurph() {
  /** @type {Record<string, number>} */
  const porPadrao = {};
  /** @type {Record<string, number>} */
  const porMusculo = {};
  let totalSeries = 0;

  // Músculos primários de cada bloco, na convenção de volume.js (o 1º é primário).
  const MUSCULOS = { 1: ['costas', 'biceps'], 2: ['peito', 'triceps'], 3: ['quadriceps', 'gluteo'] };

  for (const b of MURPH_BLOCOS) {
    const series = b.reps / REPS_POR_SERIE_EQUIV;
    totalSeries += series;
    porPadrao[b.padrao] = (porPadrao[b.padrao] || 0) + series;
    MUSCULOS[b.n].forEach((m, i) => {
      porMusculo[m] = (porMusculo[m] || 0) + series * (i === 0 ? 1 : 0.5);
    });
  }
  return { porMusculo, porPadrao, totalSeries };
}

/**
 * Gera a sessão Murph.
 *
 * A viabilidade é sempre `ok`: quem organiza o rodízio é o professor, na hora
 * (um grupo corre primeiro, outro abre pelas puxadas). O checador automático
 * modela circuito de estações simultâneas e reprovaria o treino por causa do
 * monocross — o que não corresponde a como ele roda na aula.
 * @param {{ nAlunos?: number }} [opcoes]
 */
export function gerarMurph(opcoes = {}) {
  const nAlunos = opcoes.nAlunos ?? ALUNOS_POR_SESSAO;
  return {
    blocos: MURPH_BLOCOS,
    totalReps: MURPH_TOTAL_REPS,
    cardio: MURPH_CARDIO,
    execucao: MURPH_EXECUCAO,
    cindy: { rounds: CINDY_ROUNDS, round: CINDY_ROUND },
    duracaoSeg: {
      iniciante: estimarDuracaoSeg('iniciante'),
      intermediario: estimarDuracaoSeg('intermediario'),
      avancado: estimarDuracaoSeg('avancado'),
    },
    viabilidade: {
      ok: true,
      formato: 'for-time',
      nota: `For time, turma de até ${nAlunos}. O rodízio é organizado pelo professor na hora — um grupo abre pela corrida, outro pelas puxadas.`,
    },
  };
}
