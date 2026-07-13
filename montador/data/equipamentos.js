// @ts-check
/**
 * INVENTÁRIO REAL DO BOX — Braconaro Garage Power Lab
 * ---------------------------------------------------
 * Cada equipamento tem `unidades` = quantas estações simultâneas ele permite.
 * O algoritmo usa isso para garantir que um treino de 8 alunos seja viável.
 *
 * Regra do box: 8 alunos por sessão. Em um circuito de K exercícios, os 8
 * alunos se dividem em K estações (~2 por estação). Um exercício "compartilhável
 * em dupla" consome 1 unidade para cada 2 alunos; caso contrário 1 por aluno.
 *
 * @typedef {Object} Equipamento
 * @property {string} id            Identificador usado pelos exercícios
 * @property {string} nome          Nome legível
 * @property {'cardio'|'estacao'|'peso_livre'|'acessorio'|'corporal'} categoria
 * @property {number} unidades      Quantas estações simultâneas suporta
 * @property {boolean} compartilhavelDupla  2 alunos podem usar 1 unidade?
 * @property {number[]} [cargasKg]  Pesos disponíveis (quando aplicável)
 * @property {string} [obs]
 */

/** @type {Equipamento[]} */
export const EQUIPAMENTOS = [
  // ---------------- CARDIO ----------------
  {
    id: 'air_bike',
    nome: 'Air Bike',
    categoria: 'cardio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Cardio de corpo inteiro. Gargalo: só 2 — evitar 2 estações de bike no mesmo treino.',
  },

  // ---------------- ESTAÇÕES GUIADAS ----------------
  {
    id: 'smith',
    nome: 'Smith / Barra guiada',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: true, // 2 alunos revezam na mesma barra guiada
    obs: 'Agachamento, supino, desenvolvimento, remada guiada, RDL.',
  },
  {
    id: 'monocross',
    nome: 'Monocross (polia/crossover)',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Puxadores: 2 cordas, 2 triângulos, 2 barras 40cm, 2 barras 1,20m, 2 caneleiras, 1 puxador aberto neutro.',
  },
  {
    id: 'cavalinho',
    nome: 'Suporte de remada cavalinho (landmine)',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Remada cavalinho, landmine press, meadows.',
  },
  {
    id: 'banco',
    nome: 'Banco regulável 0°–90°',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Supino reto/inclinado, apoio para remada, desenvolvimento sentado.',
  },

  // ---------------- PESO LIVRE ----------------
  {
    id: 'halter',
    nome: 'Halteres (torres 1–10 kg)',
    categoria: 'peso_livre',
    unidades: 4, // 2 torres atendem confortavelmente ~4 pares simultâneos
    compartilhavelDupla: false,
    cargasKg: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    obs: 'Faixa leve/média farta. Bom para movimentos unilaterais e acessórios.',
  },
  {
    id: 'halter_pesado',
    nome: 'Halteres pesados (12,5 / 15 / 17,5 kg)',
    categoria: 'peso_livre',
    unidades: 1, // 1 par de cada peso — APARELHO ÚNICO, deve ser limitado
    compartilhavelDupla: true,
    cargasKg: [12.5, 15, 17.5],
    obs: 'Só 1 par de cada. Exercício que exige carga pesada de halter é limitado a 1 estação.',
  },
  {
    id: 'kettlebell',
    nome: 'Kettlebells',
    categoria: 'peso_livre',
    unidades: 6, // 10 KBs no total, várias faixas — atende bem estações de 2
    compartilhavelDupla: false,
    cargasKg: [8, 10, 10, 12, 12, 16, 16, 18, 20, 22],
    obs: 'Swing, goblet, clean, snatch, carry. Pares iguais disponíveis em 10/12/16.',
  },
  {
    id: 'barra_livre',
    nome: 'Barras de ferro soltas (1,5 m e 2,0 m)',
    categoria: 'peso_livre',
    unidades: 4, // 2x1,5m + 2x2,0m
    compartilhavelDupla: true,
    obs: 'Usadas com anilhas. Sem rack fixo — levantamentos do chão/apoio.',
  },
  {
    id: 'wall_ball',
    nome: 'Wall Balls (14 lb e 10 lb)',
    categoria: 'peso_livre',
    unidades: 4, // 2x14lb + 2x10lb
    compartilhavelDupla: false,
    cargasKg: [6.4, 6.4, 4.5, 4.5],
    obs: 'Wall ball shots, thruster, agachamento com arremesso.',
  },

  // ---------------- PLIOMETRIA / DEGRAUS ----------------
  {
    id: 'caixote',
    nome: 'Caixotes de madeira 30 cm',
    categoria: 'estacao',
    unidades: 4,
    compartilhavelDupla: true,
    obs: 'Box step-up, box jump, búlgaro, dips assistido.',
  },
  {
    id: 'step',
    nome: 'Steps de EVA (20 cm e 10 cm)',
    categoria: 'acessorio',
    unidades: 6, // 4x20cm + 2x10cm
    compartilhavelDupla: true,
    obs: 'Step-up leve, elevação de quadril apoiada, drills de aquecimento.',
  },

  // ---------------- FUNCIONAL / HYROX ----------------
  {
    id: 'sled',
    nome: 'Trenó (Sled)',
    categoria: 'estacao',
    unidades: 1,
    compartilhavelDupla: false,
    obs: 'Sled push/pull no turf. Só 1 — gargalo, organizar rodízio.',
  },
  {
    id: 'turf',
    nome: 'Turf 5 m (grama de treino)',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Faixa de 5 m para sled push/pull, arrastos e deslocamentos.',
  },
  {
    id: 'anilha_olimpica_15',
    nome: 'Anilhas olímpicas 15 kg',
    categoria: 'peso_livre',
    unidades: 3,
    compartilhavelDupla: true,
    cargasKg: [15, 15, 15],
    obs: 'Carga do trenó (1 a 3 anilhas = 15 / 30 / 45 kg).',
  },
  {
    id: 'sandbag',
    nome: 'Sandbag 20 kg',
    categoria: 'peso_livre',
    unidades: 1,
    compartilhavelDupla: false,
    cargasKg: [20],
    obs: 'Carregada, agachamento, clean, avanço. Só 1 — gargalo.',
  },

  // ---------------- ACESSÓRIOS / CORPORAL ----------------
  {
    id: 'corda_naval',
    nome: 'Cordas navais (battle ropes)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Condicionamento de ombro/core. Gargalo: só 2.',
  },
  {
    id: 'corda_naval_4m',
    nome: 'Corda naval 4 m (sled pull)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Corda grossa de 4 m para puxar o trenó (Sled Pull).',
  },
  {
    id: 'elastico',
    nome: 'Elásticos / mini bands',
    categoria: 'acessorio',
    unidades: 4,
    compartilhavelDupla: false,
    obs: 'Mobilidade de ombro, ativação de glúteo, assistência.',
  },
  {
    id: 'bastao',
    nome: 'Cabos de vassoura / bastão',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Mobilidade de ombro, técnica de levantamento, apoios.',
  },
  {
    id: 'hand_grip',
    nome: 'Hand grips ajustáveis 5–60 kg',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Pegada / antebraço (acessório).',
  },
  {
    id: 'colchonete',
    nome: 'Colchonetes',
    categoria: 'acessorio',
    unidades: 7,
    compartilhavelDupla: false,
    obs: 'Core, mobilidade, exercícios de solo.',
  },
  {
    id: 'corporal',
    nome: 'Peso corporal',
    categoria: 'corporal',
    unidades: 99,
    compartilhavelDupla: false,
    obs: 'Flexão, prancha, agachamento livre, afundo, burpee.',
  },
  {
    id: 'corrida',
    nome: 'Corrida na rua (trechos de ~100 m)',
    categoria: 'corporal',
    unidades: 99,
    compartilhavelDupla: false,
    obs: 'Condicionamento Hyrox/HIIT. Variação típica de 100 m.',
  },

  // ---------------- ANILHAS (carga para barras/cavalinho) ----------------
  {
    id: 'anilhas',
    nome: 'Anilhas',
    categoria: 'peso_livre',
    unidades: 99,
    compartilhavelDupla: true,
    cargasKg: [1, 2, 3, 4, 5, 10, 15, 20],
    obs: 'Estoque: 1kg×4, 2kg×4, 3kg×5, 4kg×4, 5kg×10, 10kg×9, 15kg×2, 20kg×2. Carga total ~190 kg.',
  },
];

/** @type {Record<string, Equipamento>} */
export const EQUIP_POR_ID = Object.fromEntries(EQUIPAMENTOS.map((e) => [e.id, e]));

export const ALUNOS_POR_SESSAO = 8;

/**
 * Unidades de um equipamento necessárias para atender `nAlunos` na mesma estação.
 * @param {string} equipId
 * @param {number} nAlunos
 * @returns {number}
 */
export function unidadesNecessarias(equipId, nAlunos) {
  const eq = EQUIP_POR_ID[equipId];
  if (!eq) return Infinity;
  return eq.compartilhavelDupla ? Math.ceil(nAlunos / 2) : nAlunos;
}

/* ------------------------------------------------------------------
   Disponibilidade dinâmica (inventário da Academia).
   Por padrão usamos as `unidades` deste catálogo. Quando o app de Academia
   estiver conectado, `aplicarDisponibilidade()` sobrescreve as quantidades
   com o inventário real do coach — assim o gerador só monta o que existe.
   ------------------------------------------------------------------ */
/** @type {Record<string, number>|null} */
let _disponibilidade = null;

/**
 * Define as quantidades disponíveis por equipamento (id → unidades).
 * Passe `null` para voltar ao catálogo estático. IDs ausentes no mapa são
 * tratados como indisponíveis (0 unidades).
 * @param {Record<string, number>|null} map
 */
export function aplicarDisponibilidade(map) {
  _disponibilidade = map && typeof map === 'object' ? map : null;
}

/** Unidades disponíveis de um equipamento (respeita o inventário, se aplicado). @param {string} equipId */
export function unidadesDe(equipId) {
  if (_disponibilidade) return Math.max(0, Number(_disponibilidade[equipId]) || 0);
  const eq = EQUIP_POR_ID[equipId];
  return eq ? eq.unidades : 0;
}
