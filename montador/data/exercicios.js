// @ts-check
/**
 * CATÁLOGO DE EXERCÍCIOS — mapeado 1:1 ao inventário real do box.
 * Nenhum exercício referencia equipamento que o box não possui.
 *
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 *
 * @typedef {Object} Exercicio
 * @property {string} id
 * @property {string} nome
 * @property {string} descricao
 * @property {Padrao} padrao                  Padrão principal de movimento
 * @property {string[]} musculosPrimarios
 * @property {string[]} musculosSecundarios
 * @property {Array<'forca'|'hipertrofia'|'hiit'|'hyrox'|'hibrido'|'gap'|'mobilidade'|'tecnica'|'wod'>} categorias
 * @property {string[]} equipamento           IDs de equipamentos.js
 * @property {'iniciante'|'intermediario'|'avancado'} nivel
 * @property {number} tempoMedioSeg           Tempo médio de execução de 1 série/rodada
 * @property {string} [obs]
 */

/** @type {Exercicio[]} */
export const EXERCICIOS = [
  // ===================== EMPURRAR =====================
  {
    id: 'supino_smith', nome: 'Supino reto no Smith',
    descricao: 'Empurrar horizontal na barra guiada, deitado no banco reto.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
    categorias: ['forca', 'hipertrofia'], equipamento: ['smith', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'supino_inclinado_halter', nome: 'Supino inclinado com halteres',
    descricao: 'Banco a 30–45°, empurrar halteres para cima.',
    padrao: 'empurrar', musculosPrimarios: ['peito', 'ombro'], musculosSecundarios: ['triceps'],
    categorias: ['hipertrofia'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'desenvolvimento_smith', nome: 'Desenvolvimento militar no Smith',
    descricao: 'Empurrar vertical na barra guiada, em pé ou sentado.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: ['triceps'],
    categorias: ['forca', 'hipertrofia'], equipamento: ['smith'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'desenvolvimento_halter', nome: 'Desenvolvimento com halteres',
    descricao: 'Empurrar halteres acima da cabeça, sentado no banco.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: ['triceps'],
    categorias: ['hipertrofia', 'hibrido'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'landmine_press', nome: 'Landmine press (barra no cavalinho)',
    descricao: 'Empurrar a barra apoiada no suporte de cavalinho, unilateral.',
    padrao: 'empurrar', musculosPrimarios: ['ombro', 'peito'], musculosSecundarios: ['triceps', 'core'],
    categorias: ['forca', 'hipertrofia', 'hyrox'], equipamento: ['cavalinho', 'barra_livre'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'flexao', nome: 'Flexão de braço',
    descricao: 'Empurrar o peso do corpo no solo. Escala: joelhos ou no caixote.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro', 'core'],
    categorias: ['hiit', 'hyrox', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'thruster_wallball', nome: 'Thruster com wall ball',
    descricao: 'Agachamento seguido de arremesso/empurrar a bola acima da cabeça.',
    padrao: 'empurrar', musculosPrimarios: ['ombro', 'quadriceps'], musculosSecundarios: ['gluteo', 'triceps'],
    categorias: ['hiit', 'hyrox', 'wod'], equipamento: ['wall_ball'],
    nivel: 'intermediario', tempoMedioSeg: 30,
  },

  // ===================== PUXAR =====================
  {
    id: 'remada_cavalinho', nome: 'Remada cavalinho',
    descricao: 'Barra no suporte de cavalinho, puxar com pegada neutra.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['forca', 'hipertrofia'], equipamento: ['cavalinho', 'barra_livre'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'puxada_alta_monocross', nome: 'Puxada alta no monocross',
    descricao: 'Puxar a barra de 1,20 m de cima para baixo na polia.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'],
    categorias: ['hipertrofia'], equipamento: ['monocross'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_baixa_monocross', nome: 'Remada baixa no monocross (triângulo)',
    descricao: 'Puxar o triângulo em direção ao abdômen, sentado.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['hipertrofia', 'forca', 'hiit', 'hyrox'], equipamento: ['monocross'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_halter_unilateral', nome: 'Remada unilateral com halter',
    descricao: 'Apoio no banco, puxar halter ao lado do tronco.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'core'],
    categorias: ['hipertrofia', 'hibrido', 'hiit', 'hyrox'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'remada_curvada_barra', nome: 'Remada curvada com barra',
    descricao: 'Tronco inclinado, puxar a barra livre em direção ao abdômen.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'posterior_coxa'],
    categorias: ['forca', 'hipertrofia'], equipamento: ['barra_livre'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'face_pull_monocross', nome: 'Face pull na corda (monocross)',
    descricao: 'Puxar a corda em direção ao rosto, foco em deltoide posterior.',
    padrao: 'puxar', musculosPrimarios: ['ombro', 'costas'], musculosSecundarios: ['estabilizadores'],
    categorias: ['hipertrofia', 'mobilidade'], equipamento: ['monocross'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },

  // ===================== QUADRÍCEPS =====================
  {
    id: 'agachamento_smith', nome: 'Agachamento no Smith',
    descricao: 'Agachamento guiado, profundidade controlada.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo', 'posterior_coxa'],
    categorias: ['forca', 'hipertrofia'], equipamento: ['smith'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'goblet_squat', nome: 'Agachamento goblet (kettlebell)',
    descricao: 'Segurar KB junto ao peito e agachar.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['hipertrofia', 'hiit', 'hibrido', 'gap'], equipamento: ['kettlebell'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'afundo_halter', nome: 'Afundo com halteres',
    descricao: 'Passada à frente/trás segurando halteres.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['posterior_coxa'],
    categorias: ['forca', 'hipertrofia', 'hyrox', 'hibrido', 'gap'], equipamento: ['halter'],
    nivel: 'intermediario', tempoMedioSeg: 40,
  },
  {
    id: 'bulgaro_caixote', nome: 'Agachamento búlgaro no caixote',
    descricao: 'Pé de trás apoiado no caixote, agachar unilateral.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['estabilizadores'],
    categorias: ['hipertrofia'], equipamento: ['caixote', 'halter'],
    nivel: 'avancado', tempoMedioSeg: 45,
  },
  {
    id: 'box_step_up', nome: 'Step-up no caixote',
    descricao: 'Subir no caixote de 30 cm alternando as pernas, com ou sem carga.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['panturrilha'],
    categorias: ['hiit', 'hyrox', 'wod', 'gap'], equipamento: ['caixote'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'agachamento_livre', nome: 'Agachamento livre (peso corporal)',
    descricao: 'Air squat — usado em circuitos e aquecimento.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'],
    categorias: ['hiit', 'wod', 'mobilidade', 'gap'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },

  // ===================== POSTERIOR / GLÚTEO =====================
  {
    id: 'rdl_smith', nome: 'Levantamento terra romeno (Smith)',
    descricao: 'Quadril para trás, barra desce rente às pernas.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['costas'],
    categorias: ['forca', 'hipertrofia'], equipamento: ['smith'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'terra_barra_livre', nome: 'Levantamento terra (barra livre)',
    descricao: 'Levantar a barra do chão, dobradiça de quadril.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa', 'gluteo', 'costas'], musculosSecundarios: ['core', 'antebraco'],
    categorias: ['forca'], equipamento: ['barra_livre'],
    nivel: 'avancado', tempoMedioSeg: 45,
  },
  {
    id: 'kb_swing', nome: 'Kettlebell swing',
    descricao: 'Dobradiça de quadril explosiva levando a KB à altura dos ombros.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo', 'posterior_coxa'], musculosSecundarios: ['core', 'ombro'],
    categorias: ['hiit', 'hyrox', 'wod', 'hibrido', 'gap'], equipamento: ['kettlebell'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'elevacao_pelvica', nome: 'Elevação pélvica (hip thrust)',
    descricao: 'Ombros no banco, empurrar o quadril com carga sobre o quadril.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo'], musculosSecundarios: ['posterior_coxa'],
    categorias: ['hipertrofia', 'gap'], equipamento: ['banco', 'anilhas'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'good_morning_barra', nome: 'Good morning (barra)',
    descricao: 'Barra nas costas, flexão de tronco com joelhos semi.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['forca', 'hipertrofia', 'tecnica'], equipamento: ['barra_livre'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },

  // ===================== CORE =====================
  {
    id: 'prancha', nome: 'Prancha isométrica',
    descricao: 'Manter alinhamento corpo-reto apoiado nos antebraços.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['ombro'],
    categorias: ['hiit', 'mobilidade', 'wod', 'gap'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'pallof_press', nome: 'Pallof press (monocross)',
    descricao: 'Anti-rotação: empurrar a polia à frente resistindo à rotação.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['estabilizadores'],
    categorias: ['hipertrofia', 'tecnica'], equipamento: ['monocross'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'russian_twist', nome: 'Russian twist (anilha)',
    descricao: 'Sentado, rotação de tronco segurando anilha.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: [],
    categorias: ['hiit', 'wod', 'gap'], equipamento: ['anilhas', 'colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'dead_bug', nome: 'Dead bug',
    descricao: 'Deitado, estender braço e perna opostos mantendo lombar neutra.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['estabilizadores'],
    categorias: ['mobilidade', 'tecnica', 'gap'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },

  // ===================== ESTABILIZADORES =====================
  {
    id: 'farmer_carry', nome: 'Farmer carry (KB/halteres)',
    descricao: 'Caminhar segurando carga pesada nas duas mãos.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores', 'antebraco'], musculosSecundarios: ['core', 'costas'],
    categorias: ['hyrox', 'hibrido', 'wod'], equipamento: ['kettlebell'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'suitcase_carry', nome: 'Suitcase carry (unilateral)',
    descricao: 'Caminhar com carga em uma mão só — anti-flexão lateral.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores', 'core'], musculosSecundarios: ['antebraco'],
    categorias: ['hyrox', 'wod'], equipamento: ['kettlebell'],
    nivel: 'intermediario', tempoMedioSeg: 40,
  },
  {
    id: 'prancha_lateral', nome: 'Prancha lateral',
    descricao: 'Apoio lateral no antebraço, estabilizar quadril.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores', 'core'], musculosSecundarios: [],
    categorias: ['mobilidade', 'hiit'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'bird_dog', nome: 'Bird dog',
    descricao: 'Quatro apoios, estender braço e perna opostos.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores'], musculosSecundarios: ['core', 'gluteo'],
    categorias: ['mobilidade', 'tecnica'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'turkish_get_up', nome: 'Turkish get-up (kettlebell)',
    descricao: 'Levantar do solo até em pé mantendo a KB acima da cabeça.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores', 'ombro'], musculosSecundarios: ['core'],
    categorias: ['tecnica', 'hyrox'], equipamento: ['kettlebell'],
    nivel: 'avancado', tempoMedioSeg: 50,
  },

  // ===================== CARDIO / CONDICIONAMENTO (Hyrox/HIIT/WOD) =====================
  {
    id: 'air_bike_sprint', nome: 'Air bike (sprint/cals)',
    descricao: 'Tiro de calorias na bike de ar.',
    padrao: 'estabilizadores', musculosPrimarios: ['quadriceps', 'core'], musculosSecundarios: ['ombro', 'costas'],
    categorias: ['hiit', 'hyrox', 'wod'], equipamento: ['air_bike'],
    nivel: 'iniciante', tempoMedioSeg: 30, obs: 'Só 2 bikes — no máximo 1 estação de bike por treino.',
  },
  {
    id: 'corrida_100m', nome: 'Corrida 100 m (rua)',
    descricao: 'Trecho de corrida intercalado entre estações (estilo Hyrox).',
    padrao: 'estabilizadores', musculosPrimarios: ['quadriceps', 'posterior_coxa'], musculosSecundarios: ['panturrilha', 'gluteo'],
    categorias: ['hyrox', 'hiit'], equipamento: ['corrida'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'corda_naval', nome: 'Battle ropes (corda naval)',
    descricao: 'Ondas alternadas/duplas para condicionamento de ombro e core.',
    padrao: 'estabilizadores', musculosPrimarios: ['ombro', 'core'], musculosSecundarios: ['antebraco'],
    categorias: ['hiit', 'wod'], equipamento: ['corda_naval'],
    nivel: 'iniciante', tempoMedioSeg: 30, obs: 'Só 2 — gargalo de estação.',
  },
  {
    id: 'burpee', nome: 'Burpee',
    descricao: 'Flexão + salto, corpo inteiro. Clássico de WOD.',
    padrao: 'empurrar', musculosPrimarios: ['peito', 'quadriceps'], musculosSecundarios: ['core', 'ombro'],
    categorias: ['hiit', 'hyrox', 'wod'], equipamento: ['corporal'],
    nivel: 'intermediario', tempoMedioSeg: 30,
  },
  {
    id: 'wall_ball_shot', nome: 'Wall ball shot',
    descricao: 'Agachar e arremessar a bola no alvo da parede.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'ombro'], musculosSecundarios: ['gluteo'],
    categorias: ['hiit', 'hyrox', 'wod', 'gap'], equipamento: ['wall_ball'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },

  // ===================== MOBILIDADE / AQUECIMENTO =====================
  {
    id: 'mob_ombro_elastico', nome: 'Mobilidade de ombro com elástico',
    descricao: 'Passadas e aberturas com elástico para aquecer o ombro.',
    padrao: 'estabilizadores', musculosPrimarios: ['ombro'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['elastico'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
  {
    id: 'mob_bastao', nome: 'Mobilidade torácica com bastão',
    descricao: 'Rotações e overhead com o bastão.',
    padrao: 'estabilizadores', musculosPrimarios: ['core', 'ombro'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['bastao'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
];

/** @type {Record<string, Exercicio>} */
export const EXERCICIO_POR_ID = Object.fromEntries(EXERCICIOS.map((e) => [e.id, e]));

/**
 * Catálogo BASE (imutável) — os 40 exercícios reais do box, com o schema completo
 * (padrão de movimento, nível, tempo, músculos primários/secundários). Serve de
 * fallback offline e de fonte desses campos para o catálogo efetivo (ver ui/catalogo.js).
 * @type {Exercicio[]}
 */
export const EXERCICIOS_BASE = EXERCICIOS.slice();
/** @type {Record<string, Exercicio>} */
export const EXERCICIO_BASE_POR_ID = { ...EXERCICIO_POR_ID };

/**
 * Substitui o catálogo em uso (em memória) pelo `lista`, mantendo as MESMAS
 * referências de `EXERCICIOS` e `EXERCICIO_POR_ID` — assim quem já importou esses
 * bindings (gerador.js, ui/app.js) passa a enxergar o catálogo novo sem re-importar.
 * Passar lista vazia/inválida restaura o catálogo base (segurança offline).
 * @param {Exercicio[]} lista
 */
export function aplicarCatalogo(lista) {
  const fonte = Array.isArray(lista) && lista.length ? lista : EXERCICIOS_BASE;
  EXERCICIOS.length = 0;
  EXERCICIOS.push(...fonte);
  for (const k of Object.keys(EXERCICIO_POR_ID)) delete EXERCICIO_POR_ID[k];
  for (const e of EXERCICIOS) EXERCICIO_POR_ID[e.id] = e;
}
