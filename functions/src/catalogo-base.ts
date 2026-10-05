/**
 * CATÁLOGO BASE — o que o `seed-catalogo.ts` grava em `catalogoExercicios/`.
 *
 * Os ids, nomes, músculos e equipamentos vêm do catálogo REAL do box
 * (`compartilhado/dados/exercicios.js`), traduzidos para o vocabulário de
 * `modelo-box.ts`: `halter` → `halteres`, `barra_livre` → `barra`,
 * `mesa_flexora` → `flexora`, `cadeira_extensora` → `extensora`, `corporal` →
 * `peso_corporal`. Os acessórios de polia (`pux_*`) ficam de fora: eles não
 * limitam a semana, quem limita é a torre do monocross.
 *
 * A `instancia` e as `adaptacoes` são novas — o catálogo antigo só tinha
 * `padrao` (empurrar/puxar, sem horizontal × vertical). As adaptações apontam
 * para OUTRO id desta lista, e o `checar-box.ts` confere que todos existem.
 * São um ponto de partida para o coach revisar, não prescrição clínica.
 */
import type { ExercicioCatalogo } from './modelo-box';

export const CATALOGO_BASE: Readonly<Record<string, ExercicioCatalogo>> = {
  /* ───────────── empurrar horizontal ───────────── */
  supino_smith: {
    nome: 'Supino reto no Smith', instancia: 'empurrar_horizontal',
    musculoPrincipal: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
    equipamentos: ['smith', 'banco'],
    adaptacoes: { ombro: 'supino_halter' },
  },
  supino_halter: {
    nome: 'Supino reto com halteres', instancia: 'empurrar_horizontal',
    musculoPrincipal: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
    equipamentos: ['halteres', 'banco'],
    adaptacoes: { ombro: 'flexao_trx' },
  },
  supino_inclinado_halter: {
    nome: 'Supino inclinado com halteres', instancia: 'empurrar_horizontal',
    musculoPrincipal: ['peito', 'ombro'], musculosSecundarios: ['triceps'],
    equipamentos: ['halteres', 'banco'],
    adaptacoes: { ombro: 'supino_halter' },
  },
  flexao_trx: {
    nome: 'Flexão no TRX', instancia: 'empurrar_horizontal',
    musculoPrincipal: ['peito'], musculosSecundarios: ['triceps', 'ombro', 'core'],
    equipamentos: ['trx'],
    adaptacoes: {},
  },
  crucifixo_crossover_medial: {
    nome: 'Crucifixo no crossover medial', instancia: 'empurrar_horizontal',
    musculoPrincipal: ['peito'], musculosSecundarios: [],
    equipamentos: ['monocross'],
    adaptacoes: { ombro: 'supino_halter' },
  },

  /* ───────────── empurrar vertical ───────────── */
  desenvolvimento_smith: {
    nome: 'Desenvolvimento militar no Smith', instancia: 'empurrar_vertical',
    musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps'],
    equipamentos: ['smith'],
    adaptacoes: { ombro: 'landmine_press', lombar: 'desenvolvimento_halter', mobilidade: 'landmine_press' },
  },
  desenvolvimento_halter: {
    nome: 'Desenvolvimento militar com halteres', instancia: 'empurrar_vertical',
    musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps'],
    equipamentos: ['halteres', 'banco'],
    adaptacoes: { ombro: 'landmine_press', mobilidade: 'landmine_press' },
  },
  landmine_press: {
    nome: 'Landmine press (cavalinho)', instancia: 'empurrar_vertical',
    musculoPrincipal: ['ombro', 'peito'], musculosSecundarios: ['triceps', 'core'],
    equipamentos: ['cavalinho', 'barra'],
    adaptacoes: { lombar: 'desenvolvimento_halter' },
  },
  elevacao_lateral_halter: {
    nome: 'Elevação lateral com halteres', instancia: 'empurrar_vertical',
    musculoPrincipal: ['ombro'], musculosSecundarios: [],
    equipamentos: ['halteres'],
    adaptacoes: { ombro: 'elevacao_lateral_monocross' },
  },
  elevacao_lateral_monocross: {
    nome: 'Elevação lateral no monocross', instancia: 'empurrar_vertical',
    musculoPrincipal: ['ombro'], musculosSecundarios: [],
    equipamentos: ['monocross'],
    adaptacoes: {},
  },

  /* ───────────── puxar horizontal ───────────── */
  remada_cavalinho_fechada: {
    nome: 'Remada cavalinho pegada fechada', instancia: 'puxar_horizontal',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    equipamentos: ['cavalinho', 'barra'],
    adaptacoes: { lombar: 'remada_aberta_neutra' },
  },
  remada_aberta_neutra: {
    nome: 'Remada aberta neutra (monocross)', instancia: 'puxar_horizontal',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    equipamentos: ['monocross'],
    adaptacoes: {},
  },
  remada_halter_unilateral: {
    nome: 'Remada unilateral com halter', instancia: 'puxar_horizontal',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'core'],
    equipamentos: ['halteres', 'banco'],
    adaptacoes: {},
  },
  remada_curvada_barra: {
    nome: 'Remada curvada com barra', instancia: 'puxar_horizontal',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'posterior_coxa'],
    equipamentos: ['barra', 'anilhas'],
    adaptacoes: { lombar: 'remada_halter_unilateral' },
  },
  remada_trx: {
    nome: 'Remada no TRX', instancia: 'puxar_horizontal',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'core'],
    equipamentos: ['trx'],
    adaptacoes: {},
  },
  face_pull_monocross: {
    nome: 'Face pull na corda', instancia: 'puxar_horizontal',
    musculoPrincipal: ['ombro', 'costas'], musculosSecundarios: [],
    equipamentos: ['monocross'],
    adaptacoes: {},
  },

  /* ───────────── puxar vertical ───────────── */
  puxada_aberta_pronada: {
    nome: 'Puxada aberta pronada (monocross)', instancia: 'puxar_vertical',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps'],
    equipamentos: ['monocross'],
    adaptacoes: { ombro: 'puxada_aberta_neutra', mobilidade: 'puxada_fechada_triangulo' },
  },
  puxada_aberta_neutra: {
    nome: 'Puxada aberta neutra (monocross)', instancia: 'puxar_vertical',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps'],
    equipamentos: ['monocross'],
    adaptacoes: {},
  },
  puxada_fechada_triangulo: {
    nome: 'Puxada fechada triângulo (monocross)', instancia: 'puxar_vertical',
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps'],
    equipamentos: ['monocross'],
    adaptacoes: {},
  },
  puxada_braco_estendido: {
    nome: 'Puxada com braço estendido no monocross', instancia: 'puxar_vertical',
    musculoPrincipal: ['costas'], musculosSecundarios: [],
    equipamentos: ['monocross'],
    adaptacoes: { ombro: 'puxada_aberta_neutra' },
  },

  /* ───────────── agachar ───────────── */
  agachamento_smith: {
    nome: 'Agachamento no Smith', instancia: 'agachar',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo', 'posterior_coxa'],
    equipamentos: ['smith'],
    adaptacoes: { joelho: 'elevacao_pelvica', lombar: 'leg_press_vertical_smith', mobilidade: 'agachamento_trx' },
  },
  agachamento_frontal: {
    nome: 'Agachamento frontal', instancia: 'agachar',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    equipamentos: ['barra', 'anilhas'],
    adaptacoes: {
      joelho: 'elevacao_pelvica', lombar: 'leg_press_vertical_smith',
      ombro: 'bulgaro_caixote', mobilidade: 'agachamento_trx',
    },
  },
  bulgaro_caixote: {
    nome: 'Agachamento búlgaro no caixote', instancia: 'agachar',
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: [],
    equipamentos: ['caixote', 'halteres'],
    adaptacoes: { joelho: 'elevacao_pelvica', mobilidade: 'afundo_trx' },
  },
  leg_press_vertical_smith: {
    nome: 'Vertical Leg Press no Smith', instancia: 'agachar',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo'],
    equipamentos: ['smith'],
    adaptacoes: { joelho: 'elevacao_pelvica' },
  },
  cadeira_extensora: {
    nome: 'Cadeira extensora', instancia: 'agachar',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: [],
    equipamentos: ['extensora'],
    adaptacoes: { joelho: 'ponte_gluteo' },
  },
  afundo_halter: {
    nome: 'Afundo com halteres', instancia: 'agachar',
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['posterior_coxa'],
    equipamentos: ['halteres'],
    adaptacoes: { joelho: 'elevacao_pelvica', mobilidade: 'afundo_trx' },
  },
  box_step_up: {
    nome: 'Step-up no caixote', instancia: 'agachar',
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['panturrilha'],
    equipamentos: ['caixote'],
    adaptacoes: { joelho: 'ponte_gluteo' },
  },
  agachamento_trx: {
    nome: 'Agachamento no TRX', instancia: 'agachar',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    equipamentos: ['trx'],
    adaptacoes: { joelho: 'ponte_gluteo' },
  },
  afundo_trx: {
    nome: 'Afundo no TRX', instancia: 'agachar',
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: [],
    equipamentos: ['trx'],
    adaptacoes: { joelho: 'ponte_gluteo' },
  },

  /* ───────────── estender quadril ───────────── */
  terra_barra_livre: {
    nome: 'Levantamento terra (barra livre)', instancia: 'estender_quadril',
    musculoPrincipal: ['posterior_coxa', 'gluteo', 'costas'], musculosSecundarios: ['core', 'antebraco'],
    equipamentos: ['barra', 'anilhas'],
    adaptacoes: { lombar: 'elevacao_pelvica', mobilidade: 'rdl_halter' },
  },
  rdl_smith: {
    nome: 'Levantamento terra romeno no Smith', instancia: 'estender_quadril',
    musculoPrincipal: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['costas'],
    equipamentos: ['smith'],
    adaptacoes: { lombar: 'elevacao_pelvica' },
  },
  rdl_halter: {
    nome: 'Levantamento terra romeno com halteres', instancia: 'estender_quadril',
    musculoPrincipal: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['costas'],
    equipamentos: ['halteres'],
    adaptacoes: { lombar: 'elevacao_pelvica', mobilidade: 'ponte_gluteo' },
  },
  good_morning_barra: {
    nome: 'Good morning (barra)', instancia: 'estender_quadril',
    musculoPrincipal: ['posterior_coxa'], musculosSecundarios: ['gluteo', 'core'],
    equipamentos: ['barra'],
    adaptacoes: { lombar: 'mesa_flexora', ombro: 'rdl_halter' },
  },
  mesa_flexora: {
    nome: 'Mesa flexora', instancia: 'estender_quadril',
    musculoPrincipal: ['posterior_coxa'], musculosSecundarios: [],
    equipamentos: ['flexora'],
    adaptacoes: { joelho: 'ponte_gluteo' },
  },
  elevacao_pelvica: {
    nome: 'Elevação pélvica (hip thrust)', instancia: 'estender_quadril',
    musculoPrincipal: ['gluteo'], musculosSecundarios: ['posterior_coxa'],
    equipamentos: ['banco', 'halteres'],
    adaptacoes: { lombar: 'ponte_gluteo' },
  },
  ponte_gluteo: {
    nome: 'Ponte de glúteo no chão', instancia: 'estender_quadril',
    musculoPrincipal: ['gluteo'], musculosSecundarios: ['posterior_coxa', 'core'],
    equipamentos: ['colchonete'],
    adaptacoes: {},
  },
  coice_gluteo_monocross: {
    nome: 'Coice de glúteo no monocross', instancia: 'estender_quadril',
    musculoPrincipal: ['gluteo'], musculosSecundarios: ['posterior_coxa'],
    equipamentos: ['monocross'],
    adaptacoes: { lombar: 'ponte_gluteo' },
  },

  /* ───────────── estabilizar tronco ───────────── */
  pallof_press: {
    nome: 'Pallof press', instancia: 'estabilizar_tronco',
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['monocross'],
    adaptacoes: {},
  },
  fallout_trx: {
    nome: 'Fallout no TRX', instancia: 'estabilizar_tronco',
    musculoPrincipal: ['core'], musculosSecundarios: ['ombro'],
    equipamentos: ['trx'],
    adaptacoes: { lombar: 'pallof_press', ombro: 'pallof_press' },
  },
  abdominal_monocross: {
    nome: 'Abdominal no monocross (cable crunch)', instancia: 'estabilizar_tronco',
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['monocross'],
    adaptacoes: { lombar: 'pallof_press' },
  },
  abdominal_infra: {
    nome: 'Abdominal Infra (Elevação de pernas)', instancia: 'estabilizar_tronco',
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['colchonete'],
    adaptacoes: { lombar: 'pallof_press' },
  },
  russian_twist: {
    nome: 'Russian twist', instancia: 'estabilizar_tronco',
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['anilhas', 'colchonete'],
    adaptacoes: { lombar: 'pallof_press' },
  },
};
