// @ts-check
/**
 * MODALIDADES — cada uma altera nº de exercícios, esquema de séries/reps,
 * descanso, intensidade, tipo de estímulo e se há finalizador.
 *
 * @typedef {'forca'|'hipertrofia'|'hiit'|'hyrox'|'hibrido'} ModalidadeId
 *
 * @typedef {Object} Modalidade
 * @property {ModalidadeId} id
 * @property {string} nome
 * @property {[number,number]} faixaExercicios  [min, max] exercícios principais
 * @property {number} series
 * @property {string} reps               Texto do esquema (reps ou tempo)
 * @property {number} descansoSeg        Descanso entre séries (s)
 * @property {[number,number]} intensidadePctRM  Faixa de % de 1RM alvo
 * @property {number} segPorRepMedia     Tempo médio de execução por rep (s)
 * @property {'estacoes'|'circuito'|'blocos'} formato
 * @property {boolean} finalizador       Tem finalizador (WOD/condicionamento)?
 * @property {string} estimulo
 */

/** @type {Record<ModalidadeId, Modalidade>} */
export const MODALIDADES = {
  forca: {
    id: 'forca',
    nome: 'Força',
    faixaExercicios: [4, 5],
    series: 4,
    reps: '3–5 reps',
    descansoSeg: 120,
    intensidadePctRM: [80, 90],
    segPorRepMedia: 4,
    formato: 'estacoes',
    finalizador: false,
    estimulo: 'Cargas altas, poucas reps, descanso longo. Foco em força máxima.',
  },
  hipertrofia: {
    id: 'hipertrofia',
    nome: 'Hipertrofia',
    faixaExercicios: [5, 6],
    series: 4,
    reps: '8–12 reps',
    descansoSeg: 75,
    intensidadePctRM: [65, 75],
    segPorRepMedia: 3,
    formato: 'estacoes',
    finalizador: false,
    estimulo: 'Volume moderado-alto, tempo sob tensão. Foco em massa muscular.',
  },
  hiit: {
    id: 'hiit',
    nome: 'HIIT',
    faixaExercicios: [5, 6],
    series: 4, // rounds
    reps: '30s on / 15s off',
    descansoSeg: 15,
    intensidadePctRM: [50, 65],
    segPorRepMedia: 0, // baseado em tempo
    formato: 'circuito',
    finalizador: false,
    estimulo: 'Intervalado de alta intensidade. Cardiovascular + resistência muscular.',
  },
  hyrox: {
    id: 'hyrox',
    nome: 'Hyrox',
    faixaExercicios: [5, 6],
    series: 3,
    reps: 'estações funcionais + corrida 100 m',
    descansoSeg: 30,
    intensidadePctRM: [55, 70],
    segPorRepMedia: 2,
    formato: 'circuito',
    finalizador: true,
    estimulo: 'Resistência híbrida: corrida intercalada com estações funcionais (carries, sled-like, swings).',
  },
  hibrido: {
    id: 'hibrido',
    nome: 'Híbrido (Hipertrofia + WOD)',
    faixaExercicios: [4, 5],
    series: 3,
    reps: '8–12 reps + WOD final',
    descansoSeg: 60,
    intensidadePctRM: [65, 75],
    segPorRepMedia: 3,
    formato: 'blocos',
    finalizador: true,
    estimulo: 'Bloco de hipertrofia seguido de WOD curto (AMRAP/EMOM).',
  },
};

export const MODALIDADE_IDS = /** @type {ModalidadeId[]} */ (Object.keys(MODALIDADES));
