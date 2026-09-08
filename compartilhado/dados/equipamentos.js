// @ts-check
/**
 * INVENTÁRIO REAL DO BOX — Garage Power Lab
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
    obs: 'As 2 torres fixas de polia. Os acessórios são itens próprios do inventário (barras 1,5 m e 60 cm, cordas, triângulos, neutro, tornozeleiras, manoplas). ATENÇÃO: o crossover ocupa as 2 torres de uma vez.',
  },
  {
    id: 'monocross_movel',
    nome: 'Monocross móvel (Hyrox)',
    categoria: 'estacao',
    unidades: 1,
    compartilhavelDupla: false,
    obs: '3º monocross, móvel. Uso exclusivo do dia de Hyrox (Rowing) — não entra no rodízio das outras modalidades.',
  },
  {
    id: 'trx',
    nome: 'TRX (fitas de suspensão)',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Treino suspenso: dificuldade regulada pelo ângulo do corpo. Libera monocross/halteres no rodízio.',
  },
  {
    id: 'banco_scott',
    nome: 'Banco Scott (apoio de rosca)',
    categoria: 'estacao',
    unidades: 1,
    compartilhavelDupla: false,
    obs: 'Apoio inclinado para rosca Scott. Só 1 — organizar rodízio.',
  },
  {
    id: 'mesa_flexora',
    nome: 'Mesa flexora',
    categoria: 'estacao',
    unidades: 1,
    compartilhavelDupla: false,
    obs: 'Isolamento de posterior de coxa (flexão de joelho). Só 1 — organizar rodízio.',
  },
  {
    id: 'cadeira_extensora',
    nome: 'Cadeira extensora',
    categoria: 'estacao',
    unidades: 1,
    compartilhavelDupla: false,
    obs: 'Isolamento de quadríceps (extensão de joelho). Só 1 — organizar rodízio.',
  },
  {
    id: 'cavalinho',
    nome: 'Suporte de remada cavalinho (landmine)',
    categoria: 'estacao',
    unidades: 2,
    compartilhavelDupla: true,
    obs: '2 suportes de cavalinho (landmine). Puxadores próprios: ver "Puxadores de cavalinho".',
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
    nome: 'Barras maciças soltas (2× 2,0 m + 2× 1,5 m)',
    categoria: 'peso_livre',
    unidades: 4, // 2x2,0m + 2x1,5m
    compartilhavelDupla: true,
    obs: 'Usadas com anilhas. Sem rack fixo — levantamentos do chão/apoio.',
  },
  {
    id: 'wall_ball',
    nome: 'Wall balls (2× 14 lb + 2× 10 lb)',
    categoria: 'peso_livre',
    unidades: 4, // 2x 14lb (6,35 kg) + 2x 10lb (4,53 kg)
    compartilhavelDupla: false,
    cargasKg: [6.35, 6.35, 4.53, 4.53],
    obs: 'Wall ball shots, thruster, agachamento com arremesso. Item único de propósito: '
      + 'os exercícios servem com qualquer um dos dois pesos, e o modelo de equipamento exige '
      + 'TODOS os itens listados (E, não OU) — separar por peso obrigaria a bola errada.',
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

  // ---------------- PUXADORES (acessórios de polia) ----------------
  // Cada puxador é um item próprio: dois exercícios que exigem o MESMO puxador não
  // podem rodar em paralelo, mesmo havendo torre de monocross livre.
  {
    id: 'pux_barra_15',
    nome: 'Puxador barra 1,5 m (monocross)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Puxada/remada aberta (pronada e supinada), puxada com braço estendido.',
  },
  {
    id: 'pux_barra_60',
    nome: 'Puxador barra 60 cm (monocross)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Tríceps barra e rosca no monocross.',
  },
  {
    id: 'pux_corda',
    nome: 'Puxador corda (monocross)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Tríceps corda/testa, face pull, abdominal no cabo.',
  },
  {
    id: 'pux_triangulo',
    nome: 'Puxador triângulo (monocross)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: true,
    obs: 'Puxada e remada fechadas (pegada neutra estreita).',
  },
  {
    id: 'pux_neutro',
    nome: 'Puxador aberto neutro (monocross)',
    categoria: 'acessorio',
    unidades: 1,
    compartilhavelDupla: false,
    obs: 'Só 1 — puxada e remada abertas neutras disputam o mesmo puxador.',
  },
  {
    id: 'pux_tornozeleira',
    nome: 'Tornozeleiras de polia (monocross)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Coice de glúteo e abdução de quadril no monocross.',
  },
  {
    id: 'pux_manopla',
    nome: 'Manoplas estribo de nylon (monocross)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Crossover, elevação lateral, tríceps coice e Pallof press. O crossover usa as 2 de uma vez.',
  },
  {
    id: 'pux_cavalinho',
    nome: 'Puxadores de remada cavalinho (aberto e fechado)',
    categoria: 'acessorio',
    unidades: 2,
    compartilhavelDupla: false,
    obs: 'Um de pegada aberta e um de pegada fechada, usados no suporte de cavalinho.',
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

/**
 * Equipamentos que permitem CARGA EXTERNA PROGRESSIVA — os que dá para levar a
 * 80–95% de 1RM. É o que separa o dia de Força do de Hipertrofia dentro da mesma
 * lista de musculação: flexão no TRX e ponte de glúteo são compostos legítimos,
 * mas peso corporal não escala para força máxima.
 *
 * Ficam de fora de propósito: corporal, trx, colchonete, caixote, step, banco,
 * banco_scott, elástico, bastão, hand grip, cordas navais, corrida, turf e air bike
 * (apoios, acessórios ou peso corporal — nenhum deles é a carga em si). Os puxadores
 * `pux_*` também ficam de fora porque quem carrega é o monocross, que o exercício
 * já lista junto.
 * @type {Set<string>}
 */
export const EQUIP_COM_CARGA = new Set([
  'smith', 'barra_livre', 'anilhas', 'halter', 'halter_pesado', 'kettlebell',
  'monocross', 'monocross_movel', 'cavalinho', 'mesa_flexora', 'cadeira_extensora',
  'sandbag', 'sled', 'anilha_olimpica_15', 'wall_ball',
]);

/**
 * Fusões/remoções de itens do inventário do coach, aplicadas uma vez por versão de
 * semente (ver `academia/db.js`). Casa por id OU por nome (o id de um equipamento
 * criado na Academia é o slug do nome). `somarQuantidade` junta o estoque dos dois
 * itens no de destino; `para: null` remove. Exercícios que apontavam para o id
 * antigo são repontados para o novo.
 * @type {Array<{de: string[], para: string|null, somarQuantidade?: boolean}>}
 */
export const MIGRACOES_INVENTARIO = [
  // As duas entradas de wall ball eram o MESMO estoque partido por peso (2× 14 lb no
  // item criado pelo coach + 2× 10 lb no do catálogo). Viram um item de 4 unidades:
  // os exercícios servem com qualquer um dos pesos, e `equipamento` é uma lista E —
  // separado por peso, um exercício acabaria exigindo as duas bolas ao mesmo tempo.
  { de: ['wall_ball_14_lb_6_35_kg', 'Wall ball 14 Lb (6,35 Kg)'], para: 'wall_ball', somarQuantidade: true },
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
