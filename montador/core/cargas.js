// @ts-check
/**
 * SUGESTÃO DE CARGA INICIAL (kg) — ponto de partida, não prescrição.
 *
 * Cruza nível do aluno + intensidade da modalidade + os PESOS QUE EXISTEM NO BOX
 * (faz "snap" para a carga disponível). Para exercícios de peso corporal/cardio,
 * devolve orientação de esforço em vez de kg.
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 */
import { EQUIP_POR_ID } from '../data/equipamentos.js';

/** Carga-base por nível (kg) para cada tipo de implemento carregável. */
const BASE = {
  halter:        { iniciante: 6,  intermediario: 9,  avancado: 12 }, // por mão
  kettlebell:    { iniciante: 10, intermediario: 16, avancado: 20 },
  wall_ball:     { iniciante: 4.5, intermediario: 6.4, avancado: 6.4 },
  barra_livre:   { iniciante: 20, intermediario: 35, avancado: 50 }, // total
  smith:         { iniciante: 20, intermediario: 35, avancado: 50 }, // total na barra guiada
  anilhas:       { iniciante: 10, intermediario: 20, avancado: 30 }, // p/ hip thrust etc.
};

/** Multiplicador por modalidade (condicionamento usa carga menor). */
const MULT_MODALIDADE = { forca: 1.15, hipertrofia: 1.0, hibrido: 0.9, hyrox: 0.75, hiit: 0.7, gap: 0.55 };

/** Pesos de halteres realmente disponíveis no box (leves + pesados). */
const HALTERES_DISPONIVEIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12.5, 15, 17.5];

/** Snap para o valor mais próximo de uma lista. */
function maisProximo(alvo, lista) {
  return lista.reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a));
}

/**
 * @param {Exercicio} ex
 * @param {'iniciante'|'intermediario'|'avancado'} nivel
 * @param {ModalidadeId} modalidade
 * @returns {{ texto: string, kg: number|null, tipo: string }}
 */
export function sugerirCarga(ex, nivel, modalidade) {
  const mult = MULT_MODALIDADE[modalidade] ?? 1;

  // peso corporal / cardio → orientação de esforço
  const corporais = ['corporal', 'corrida', 'air_bike', 'corda_naval', 'colchonete',
    'elastico', 'bastao', 'caixote', 'step'];
  const ehSoCorporal = ex.equipamento.every((id) => corporais.includes(id));
  if (ehSoCorporal) {
    const esforco = { forca: 'controlado', hipertrofia: 'cadência 2-1-2', hibrido: 'forte',
      hyrox: 'ritmo sustentável', hiit: 'máximo no tempo', gap: 'TABATA — máximo no tempo' }[modalidade] || 'controlado';
    return { texto: `peso corporal · ${esforco}`, kg: null, tipo: 'corporal' };
  }

  // monocross (polia) → orientação qualitativa (pilha não quantificada no inventário)
  if (ex.equipamento.includes('monocross')) {
    const nivelTxt = { iniciante: 'leve', intermediario: 'moderada', avancado: 'alta' }[nivel];
    return { texto: `carga ${nivelTxt} (polia)`, kg: null, tipo: 'monocross' };
  }

  // escolhe o implemento carregável principal (ordem de prioridade)
  const ordem = ['kettlebell', 'barra_livre', 'smith', 'halter_pesado', 'halter', 'wall_ball', 'anilhas'];
  const equipId = ordem.find((id) => ex.equipamento.includes(id));
  if (!equipId) return { texto: '—', kg: null, tipo: 'na' };

  if (equipId === 'kettlebell') {
    const alvo = BASE.kettlebell[nivel] * mult;
    const kg = maisProximo(alvo, EQUIP_POR_ID.kettlebell.cargasKg || []);
    return { texto: `≈ ${kg} kg (kettlebell)`, kg, tipo: 'kettlebell' };
  }
  if (equipId === 'wall_ball') {
    const kg = maisProximo(BASE.wall_ball[nivel] * mult, [4.5, 6.4]);
    return { texto: `wall ball ${kg === 6.4 ? '14 lb' : '10 lb'}`, kg, tipo: 'wall_ball' };
  }
  if (equipId === 'halter' || equipId === 'halter_pesado') {
    const alvo = BASE.halter[nivel] * mult;
    const kg = maisProximo(alvo, HALTERES_DISPONIVEIS);
    return { texto: `≈ ${kg} kg por mão (halteres)`, kg, tipo: 'halter' };
  }
  if (equipId === 'barra_livre' || equipId === 'smith') {
    const alvo = Math.round((BASE[equipId][nivel] * mult) / 2.5) * 2.5; // múltiplo de 2,5
    return { texto: `≈ ${alvo} kg total na barra`, kg: alvo, tipo: equipId };
  }
  if (equipId === 'anilhas') {
    const alvo = Math.round(BASE.anilhas[nivel] * mult / 5) * 5;
    return { texto: `≈ ${alvo} kg (anilha)`, kg: alvo, tipo: 'anilhas' };
  }
  return { texto: '—', kg: null, tipo: 'na' };
}
