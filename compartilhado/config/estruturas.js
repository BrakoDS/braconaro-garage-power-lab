// @ts-check
/**
 * ESTRUTURAS DO TREINO — o formato que organiza os blocos e diz como o volume
 * daquele bloco é contado.
 *
 * Decisão do coach, registrada no spec do Montador v2: *"quero escrever os
 * exercícios, porém quero poder selecionar uma estrutura"*. A estrutura NÃO
 * escolhe exercício nenhum — ela dá os blocos de partida e a régua da contagem, e
 * o coach digita o que vai rodar.
 *
 * Por que no compartilhado, e não dentro do app: a tela do aluno (Etapa 5) mostra
 * o mesmo dia, e precisa saber ler um bloco de tempo do mesmo jeito que o coach.
 * Duas cópias da régua é como o volume começa a divergir entre as duas telas.
 *
 * @typedef {'musculacao'|'hiit'|'gap'|'hyrox'|'cross'} EstruturaId
 * @typedef {'series'|'tempo'} Contagem
 *
 * @typedef {Object} Estrutura
 * @property {EstruturaId} id
 * @property {string} label
 * @property {string} desc         uma linha, mostrada abaixo do seletor
 * @property {Contagem} contagem   como o volume do bloco vira série equivalente
 * @property {boolean} densidadeWod aplica `FATOR_DENSIDADE_WOD` (só na rota do tempo)
 * @property {{nome: string, tipo: string}[]} blocos  blocos de partida
 * @property {Record<string, any>} linhaPadrao  campos iniciais de uma linha nova
 */

/**
 * Um round de TABATA, como o GAP já roda hoje (`gap.js:20`). Repetir o número
 * aqui seria criar uma segunda verdade; ele fica num lugar só e as estruturas de
 * tempo apontam para ele.
 */
export const ROUND_TABATA = { trabalhoSeg: 20, descansoSeg: 10, rounds: 8 };

/** Linha de musculação: o que o coach mais digita, já preenchido. */
const LINHA_MUSCULACAO = { series: 3, reps: '8–12', descansoSeg: 75 };

/** @type {Record<EstruturaId, Estrutura>} */
export const ESTRUTURAS = {
  musculacao: {
    id: 'musculacao',
    label: 'Musculação',
    desc: 'Blocos de séries e repetições. O volume conta série por série.',
    contagem: 'series',
    densidadeWod: false,
    blocos: [{ nome: 'Principal', tipo: 'principal' }],
    linhaPadrao: { ...LINHA_MUSCULACAO },
  },
  hiit: {
    id: 'hiit',
    label: 'HIIT / TABATA',
    desc: 'Estações por tempo. O volume conta pelo relógio, não por série.',
    contagem: 'tempo',
    densidadeWod: false,
    blocos: [{ nome: 'Estações', tipo: 'estacoes' }],
    linhaPadrao: { ...ROUND_TABATA },
  },
  gap: {
    id: 'gap',
    label: 'GAP',
    desc: 'Uma música por bloco, em rounds de 20s por 10s.',
    contagem: 'tempo',
    densidadeWod: false,
    blocos: [{ nome: 'Música 1', tipo: 'musica' }],
    linhaPadrao: { ...ROUND_TABATA },
  },
  hyrox: {
    id: 'hyrox',
    label: 'Hyrox',
    desc: 'Estações e corrida. Tudo por tempo, como na prova.',
    contagem: 'tempo',
    densidadeWod: false,
    blocos: [{ nome: 'Estações', tipo: 'estacoes' }],
    linhaPadrao: { duracaoSeg: 240 },
  },
  cross: {
    id: 'cross',
    label: 'Cross training / WOD',
    desc: 'Rodadas em bloco. O relógio conta com desconto de densidade.',
    contagem: 'tempo',
    densidadeWod: true,
    blocos: [{ nome: 'WOD', tipo: 'wod' }],
    linhaPadrao: { duracaoSeg: 600, rodadas: 5 },
  },
};

/** @type {EstruturaId[]} */
export const ESTRUTURA_IDS = /** @type {EstruturaId[]} */ (Object.keys(ESTRUTURAS));

/** A estrutura padrão de um dia novo — é o que o box mais roda. */
export const ESTRUTURA_PADRAO = 'musculacao';

/**
 * A estrutura pedida, ou a padrão. Nunca `undefined`: um dia salvo com estrutura
 * que não existe mais (renomeada, removida) tem que abrir mesmo assim, com o
 * coach vendo os exercícios dele, e não uma tela quebrada.
 * @param {string} [id]
 * @returns {Estrutura}
 */
export function estruturaDe(id) {
  return ESTRUTURAS[/** @type {EstruturaId} */ (id)] || ESTRUTURAS[ESTRUTURA_PADRAO];
}

/** Blocos de partida de uma estrutura, em cópia (o chamador vai editá-los). @param {string} [id] */
export function blocosIniciais(id) {
  return estruturaDe(id).blocos.map((b) => ({ ...b }));
}

/** Campos iniciais de uma linha nova, em cópia. @param {string} [id] */
export function linhaPadrao(id) {
  return { ...estruturaDe(id).linhaPadrao };
}

/** O volume deste bloco sai do relógio? @param {string} [id] */
export function contaPorTempo(id) {
  return estruturaDe(id).contagem === 'tempo';
}
