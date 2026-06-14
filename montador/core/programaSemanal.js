// @ts-check
/**
 * PROGRAMA SEMANAL DO BOX — um treino por dia (seg–sex), IGUAL para todos os alunos.
 *
 * A frequência (3/4/5×) não muda o treino: define apenas QUANTOS dias o aluno pega.
 * Como cada dia é full body, qualquer combinação de dias soma sessões completas.
 * Este módulo gera a semana e calcula os CENÁRIOS de frequência, provando que:
 *   - quem vem 3 dias (pior combinação) atinge o MÍNIMO para bons resultados;
 *   - quem vem 4–5 dias fica acima do mínimo (resultado melhor).
 *
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 * @typedef {import('../config/frequencias.js').Dia} Dia
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 */
import { gerarTreino } from './gerador.js';
import { MINIMO_SEMANAL, ORDEM_DIAS, combosPorFrequencia } from '../config/frequencias.js';

/** Grade padrão da semana (o coach pode reconfigurar). */
export const GRADE_PADRAO = /** @type {Record<Dia, ModalidadeId>} */ ({
  seg: 'forca', ter: 'hipertrofia', qua: 'hiit', qui: 'hyrox', sex: 'hibrido',
});

/**
 * @param {Object} opcoes
 * @param {Partial<Record<Dia, ModalidadeId>>} [opcoes.grade]  Modalidade de cada dia
 * @param {'iniciante'|'intermediario'|'avancado'} [opcoes.nivelRef]  Nível de referência da turma
 * @param {number} [opcoes.semana]
 * @param {Partial<Record<Dia, string[]>>} [opcoes.evitarPorDia]  IDs de exercícios a evitar por dia
 *        (ex.: os da semana anterior do mês), para variar o estímulo entre semanas.
 * @param {number} [opcoes.seed]
 */
export function gerarProgramaSemanal(opcoes) {
  const { grade = GRADE_PADRAO, nivelRef = 'intermediario', semana = 1, evitarPorDia = {}, seed } = opcoes;

  // dias de treino, em ordem da semana
  const dias = ORDEM_DIAS.filter((d) => grade[d]);
  const nDias = dias.length;

  // alvo proporcional ao tamanho da semana (só para equilibrar padrões entre dias)
  const alvo = Object.fromEntries(
    Object.entries(MINIMO_SEMANAL).map(([p, v]) => [p, (v * nDias) / 3])
  );

  const treinos = [];
  /** @type {Record<string, number>} volume por padrão acumulado na semana */
  const acumulado = Object.fromEntries(Object.keys(MINIMO_SEMANAL).map((p) => [p, 0]));
  /** @type {import('./tipos.js').Treino|null} */
  let anterior = null;

  dias.forEach((dia, i) => {
    const restantes = nDias - i;
    const deficits = Object.fromEntries(
      Object.entries(alvo).map(([p, a]) => [p, (a - acumulado[p]) / restantes])
    );
    const mediaDef = Object.values(deficits).reduce((s, v) => s + v, 0) / Object.keys(deficits).length;
    const viesPadrao = {};
    for (const [p, d] of Object.entries(deficits)) {
      viesPadrao[p] = Math.max(-60, Math.min(60, (d - mediaDef) * 12));
    }

    const treino = gerarTreino({
      modalidade: /** @type {ModalidadeId} */ (grade[dia]),
      nivel: nivelRef, dia, semana, treinoAnterior: anterior, viesPadrao,
      idsEvitar: evitarPorDia[dia] || [],
      seed: seed != null ? seed + i : undefined,
    });
    treinos.push(treino);
    anterior = treino;
    for (const [p, v] of Object.entries(treino.volume.porPadrao)) acumulado[p] = (acumulado[p] || 0) + v;
  });

  // volume por padrão de cada dia (para somar por combinação)
  const volPorDia = Object.fromEntries(
    dias.map((d, i) => [d, treinos[i].volume.porPadrao])
  );

  const cenarios = calcularCenarios(dias, volPorDia);

  return { grade, nivelRef, semana, dias, treinos, volPorDia, cenarios, minimo: MINIMO_SEMANAL };
}

/**
 * Para cada frequência (3/4/5), soma o volume das combinações de dias possíveis
 * e reporta o PIOR caso (mínimo entre combos) vs o mínimo semanal alvo.
 * @param {Dia[]} diasDisponiveis
 * @param {Record<string, Record<string, number>>} volPorDia
 */
function calcularCenarios(diasDisponiveis, volPorDia) {
  const padroes = Object.keys(MINIMO_SEMANAL);
  /** @type {Record<number, any>} */
  const out = {};

  for (const freq of /** @type {(3|4|5)[]} */ ([3, 4, 5])) {
    // combos cujos dias existem na grade atual
    const combos = combosPorFrequencia(freq).filter((c) => c.dias.every((d) => diasDisponiveis.includes(d)));
    if (!combos.length) continue;

    const somasPorCombo = combos.map((c) => {
      const soma = Object.fromEntries(padroes.map((p) => [p, 0]));
      for (const d of c.dias) for (const p of padroes) soma[p] += Math.round((volPorDia[d]?.[p] || 0));
      return { combo: c, soma, total: Object.values(soma).reduce((a, b) => a + b, 0) };
    });

    // pior caso por padrão (o que um aluno azarado nessa frequência pega de mínimo)
    const pior = Object.fromEntries(
      padroes.map((p) => [p, Math.min(...somasPorCombo.map((s) => s.soma[p]))])
    );
    const aderencia = Object.fromEntries(
      padroes.map((p) => [p, { volume: pior[p], minimo: MINIMO_SEMANAL[p], ok: pior[p] >= MINIMO_SEMANAL[p] }])
    );
    out[freq] = {
      combos: somasPorCombo,
      pior,
      aderencia,
      atingeMinimo: padroes.every((p) => pior[p] >= MINIMO_SEMANAL[p]),
      totalPior: Math.min(...somasPorCombo.map((s) => s.total)),
      totalMelhor: Math.max(...somasPorCombo.map((s) => s.total)),
    };
  }
  return out;
}
