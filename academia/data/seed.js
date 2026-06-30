// @ts-check
/**
 * SEMENTE (dados iniciais) da Academia.
 *
 * Transforma o inventário e o catálogo REAIS do montador
 * (montador/data/*.js) no formato editável usado por este app. Roda apenas
 * na primeira vez (quando não há dados locais nem na nuvem). A partir daí, a
 * fonte da verdade é o que você editar aqui (Firestore).
 */
import { EQUIPAMENTOS } from '../../montador/data/equipamentos.js';
import { EXERCICIOS } from '../../montador/data/exercicios.js';

/** Categorias do montador → rótulos do inventário desta app. */
const CAT_MAP = {
  peso_livre: 'Peso livre',
  estacao: 'Máquina',
  cardio: 'Cardio',
  acessorio: 'Acessório',
  corporal: 'Corporal',
};

/** Músculos internos do montador → rótulos legíveis desta app. */
const MUSC_MAP = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', trapezio: 'Trapézio',
  biceps: 'Bíceps', triceps: 'Tríceps', antebraco: 'Antebraço',
  core: 'Core/Abdômen', lombar: 'Lombar',
  quadriceps: 'Quadríceps', posterior_coxa: 'Posterior de coxa',
  gluteo: 'Glúteo', panturrilha: 'Panturrilha', estabilizadores: 'Estabilizadores',
};

/** Categorias do montador → tags de treino desta app (HYROX, GAP, FORÇA, HIPERTROFIA, CARDIO). */
const TAG_MAP = {
  forca: 'FORÇA',
  hipertrofia: 'HIPERTROFIA',
  hyrox: 'HYROX',
  gap: 'GAP',
  hiit: 'CARDIO',
  wod: 'CARDIO',
  cardio: 'CARDIO',
  // mobilidade, tecnica, hibrido → sem tag direta (ficam sem tag até o coach classificar)
};

/** @returns {{inventario: any[], exercicios: any[]}} */
export function seedData() {
  const inventario = EQUIPAMENTOS.map((e) => ({
    id: e.id,
    nome: e.nome,
    categoria: CAT_MAP[e.categoria] || 'Acessório',
    quantidade: Number.isFinite(e.unidades) ? e.unidades : 1,
    area: '',
    obs: e.obs || '',
  }));

  const exercicios = EXERCICIOS.map((x) => ({
    id: x.id,
    nome: x.nome,
    equipamentoIds: Array.isArray(x.equipamento) ? x.equipamento.slice() : [],
    tags: [...new Set((x.categorias || []).map((c) => TAG_MAP[c]).filter(Boolean))],
    musculos: [...new Set([...(x.musculosPrimarios || []), ...(x.musculosSecundarios || [])].map((m) => MUSC_MAP[m]).filter(Boolean))],
    obs: x.descricao || '',
  }));

  return { inventario, exercicios };
}
