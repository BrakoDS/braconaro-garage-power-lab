// @ts-check
/**
 * MODALIDADES — cada uma altera nº de exercícios, esquema de séries/reps,
 * descanso, intensidade, tipo de estímulo e se há finalizador.
 *
 * @typedef {'forca'|'hipertrofia'|'hiit'|'hyrox'|'gap'|'hibrido'|'murph'} ModalidadeId
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
 * @property {import('./padroes.js').Padrao[]} [padroesAlvo]  Se definido, o treino NÃO é
 *           full body: foca só nestes padrões (ex.: GAP = trem inferior + core).
 */

/** @type {Record<ModalidadeId, Modalidade>} */
export const MODALIDADES = {
  forca: {
    id: 'forca',
    nome: 'Força',
    faixaExercicios: [4, 5],
    series: 4,
    reps: '1–6 reps',
    descansoSeg: 150, // 2–3 min (ressíntese de ATP-CP / recuperação do SNC)
    intensidadePctRM: [80, 95],
    segPorRepMedia: 5,
    formato: 'estacoes',
    finalizador: false,
    estimulo: 'Cargas altas (RPE 8–10), poucas reps, descanso longo (2–3 min). Foco em força máxima.',
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
    reps: 'TABATA 20s on / 10s off',
    descansoSeg: 10,
    intensidadePctRM: [50, 65],
    segPorRepMedia: 0, // baseado em tempo
    formato: 'circuito',
    finalizador: false,
    estimulo: '4 estações TABATA (Inferiores · Core · Superiores · Cardio), 16 rounds cada.',
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
  gap: {
    id: 'gap',
    nome: 'GAP (Glúteo/Abdômen/Perna)',
    faixaExercicios: [5, 6],
    series: 4, // rodadas
    reps: 'TABATA 20s on / 10s off',
    descansoSeg: 10,
    intensidadePctRM: [40, 55],
    segPorRepMedia: 0, // baseado em tempo
    formato: 'circuito',
    finalizador: false,
    estimulo: 'Aula TABATA "Siga o Mestre": Aquecimento + Pernas, Glúteo e Abdômen (9 músicas).',
    padroesAlvo: ['quadriceps', 'posterior_gluteo', 'core'],
  },
  hibrido: {
    id: 'hibrido',
    nome: 'Híbrido (Hipertrofia + Cross WOD)',
    faixaExercicios: [4, 5],
    series: 3,
    reps: '8–12 reps + WOD final',
    descansoSeg: 60,
    intensidadePctRM: [65, 75],
    segPorRepMedia: 3,
    formato: 'blocos',
    finalizador: true,
    estimulo: 'Mobilidade (4min, 12min na semana de deload) + Hipertrofia em postos de bi-set antagonista (8-12 reps, técnicas avançadas) + WOD (12-20min conforme a semana).',
  },
  murph: {
    id: 'murph',
    nome: 'Murph (desafio)',
    faixaExercicios: [3, 3],
    series: 1, // for time: não há séries, o treino é um bloco só
    reps: '100 puxadas + 200 flexões + 300 agachamentos',
    descansoSeg: 0, // o descanso é escolha do aluno dentro do cronômetro
    intensidadePctRM: [0, 0], // peso corporal e puxada leve — a carga não é a variável
    segPorRepMedia: 2,
    formato: 'circuito',
    finalizador: false,
    estimulo: 'Desafio for time: corrida + 600 repetições + corrida. O nível decide a distância da corrida e se as repetições podem ser fracionadas.',
  },
};

export const MODALIDADE_IDS = /** @type {ModalidadeId[]} */ (Object.keys(MODALIDADES));
