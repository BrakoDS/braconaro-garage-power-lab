// @ts-check
/**
 * OBJETIVOS DO ALUNO e a prescrição de cada um.
 *
 * A lista morava em `coach/gestao-de-alunos/app.js` como cinco rótulos soltos, e
 * a ficha guarda o RÓTULO ('Saúde / qualidade de vida'), não uma chave. Quando a
 * regra de perfil precisou da mesma lista, copiá-la criaria a segunda lista
 * paralela do projeto: a Gestão acrescentaria "Reabilitação" e a regra nunca
 * ficaria sabendo. Agora é uma só, e a Gestão importa daqui.
 *
 * A prescrição é a tabela do spec do Montador v2 (seção "Objetivo → prescrição").
 * Ela desloca o que o coach digitou no treino base DENTRO da faixa do objetivo —
 * não substitui o julgamento dele, e não vale para linha travada no cadeado.
 *
 * @typedef {'hipertrofia'|'emagrecimento'|'condicionamento'|'saude'|'outro'} ObjetivoId
 *
 * @typedef {Object} Objetivo
 * @property {ObjetivoId} id
 * @property {string} label            exatamente como está salvo nas fichas
 * @property {string} [reps]           faixa de repetições
 * @property {number[]} [descansoSeg]  [mínimo, máximo]
 * @property {number[]} [cargaPct]     [mínimo, máximo] de 1RM
 * @property {string} [tecnica]        técnica sugerida, em texto
 */

/** @type {Record<ObjetivoId, Objetivo>} */
export const OBJETIVOS = {
  emagrecimento: {
    id: 'emagrecimento', label: 'Emagrecimento',
    reps: '15–20', descansoSeg: [30, 45], cargaPct: [50, 60],
    tecnica: 'bi-set, descanso curto',
  },
  hipertrofia: {
    id: 'hipertrofia', label: 'Hipertrofia',
    reps: '8–12', descansoSeg: [60, 90], cargaPct: [70, 80],
    tecnica: 'drop-set ou rest-pause na última série',
  },
  condicionamento: {
    id: 'condicionamento', label: 'Condicionamento',
    reps: '12–15', descansoSeg: [45, 60], cargaPct: [60, 70],
  },
  saude: {
    id: 'saude', label: 'Saúde / qualidade de vida',
    reps: '10–15', descansoSeg: [60, 60], cargaPct: [50, 65],
    // Sem técnica avançada de propósito: quem treina por saúde não precisa de
    // falha assistida para ter resultado, e o risco não compensa.
  },
  outro: {
    id: 'outro', label: 'Outro',
    // Sem prescrição: vale o que o coach digitou no treino base. "Outro" é
    // justamente o caso que a tabela não sabe descrever.
  },
};

/** Os rótulos, na MESMA ordem em que a ficha da Gestão sempre os mostrou. */
export const OBJETIVO_LABELS = Object.values(OBJETIVOS).map((o) => o.label);

/** @type {ObjetivoId[]} */
export const OBJETIVO_IDS = /** @type {ObjetivoId[]} */ (Object.keys(OBJETIVOS));

const POR_LABEL = new Map(Object.values(OBJETIVOS).map((o) => [chave(o.label), o]));

/** Comparação tolerante a acento, caixa e espaço — a ficha é texto digitado há anos. */
function chave(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');
}

/**
 * O objetivo de um aluno, a partir do que está salvo na ficha (rótulo ou chave).
 *
 * Devolve `null` para vazio ou desconhecido, e quem chama trata isso como "sem
 * deslocamento". Nunca lança: a maioria das fichas de hoje não tem objetivo, e
 * um erro aqui derrubaria a montagem do treino da turma inteira.
 * @param {string} [valor]
 * @returns {Objetivo|null}
 */
export function objetivoDe(valor) {
  if (!valor) return null;
  const k = chave(valor);
  return OBJETIVOS[/** @type {ObjetivoId} */ (k)] || POR_LABEL.get(k) || null;
}
