// @ts-check
/**
 * SÉRIE EQUIVALENTE — a moeda única do volume.
 *
 * O box treina em cinco formatos, e cada um media esforço na sua própria unidade:
 * série (musculação), round de 20s (GAP e TABATA), repetição (Murph), estação
 * (Hyrox), rodada (WOD). Sem uma régua comum, a semana do aluno não fecha: um dia
 * de Hyrox aparecia como zero de perna.
 *
 * A régua tem DUAS constantes, e todo o resto sai delas por divisão. Recalibrar o
 * box é mexer num número só — antes eram seis, espalhados por cinco arquivos.
 */

/**
 * Quantos segundos de trabalho valem uma série.
 *
 * Não é número novo: o GAP já contava 1 round de 20s como 0,5 série
 * (`SERIES_POR_ROUND`), o que é exatamente 40s por série. A constante que já
 * estava certa virou a régua de todo mundo.
 */
export const SEGUNDOS_POR_SERIE = 40;

/** Quantas repetições valem uma série. É a régua que o Murph já usava. */
export const REPS_POR_SERIE = 20;

/** Número finito e positivo, senão 0. @param {unknown} v */
function positivo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Séries equivalentes de um tanto de trabalho por tempo. @param {number} segundos */
export function seriesPorTempo(segundos) {
  return positivo(segundos) / SEGUNDOS_POR_SERIE;
}

/** Séries equivalentes de um tanto de trabalho por repetição. @param {number} reps */
export function seriesPorReps(reps) {
  return positivo(reps) / REPS_POR_SERIE;
}

/**
 * Lê as repetições de uma prescrição escrita — `"12 reps"`, `"15 burpees"`, `"10"`.
 *
 * Devolve `null` quando o texto NÃO é repetição: distância (`"200m"`), tempo
 * (`"40s"`), ou coisa sem número (`"máximo de reps"`, vazio). Null não é falha —
 * é o sinal de que quem chamou deve cair no crédito por tempo do bloco. Inventar
 * um número aqui seria pior que não ter: o volume da semana passaria a mentir sem
 * ninguém perceber.
 *
 * O Híbrido só gera dois formatos (`prescricaoWod`): `"N reps"` e `"NNNm"`. O
 * Treino Livre aceita texto livre do coach, e é por ele que os outros casos entram.
 * @param {string} [texto]
 * @returns {number|null}
 */
export function repsDaPrescricao(texto) {
  const s = String(texto ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const unidade = m[2].trim();
  // Unidade de distância ou de tempo desqualifica: não são repetições.
  if (/^(m|km|metros?|s|seg|segundos?|min|minutos?)\b/.test(unidade)) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Séries equivalentes de UM movimento dentro de um bloco de WOD.
 *
 * Duas rotas, nesta ordem:
 *  1. **Reps × rodadas**, quando as duas coisas são conhecidas. É a conta certa,
 *     e só o For Time conhece as rodadas.
 *  2. **Tempo do bloco repartido** entre os movimentos. É o recuo para AMRAP,
 *     EMOM e Chipper, onde quem manda é o relógio e ninguém sabe quantas rodadas
 *     a turma vai fechar. Também cobre a prescrição em distância (`"200m"`) e o
 *     texto livre que o coach digita no Treino Livre.
 *
 * O que NÃO se faz: tratar "sem rodadas" como uma rodada. Um AMRAP de 12 minutos
 * não é uma volta — contá-lo assim jogaria fora quase todo o esforço do bloco.
 * @param {{prescricao?: string, rodadas?: number|null, duracaoMin?: number, nMovimentos?: number}} p
 */
export function seriesDoMovimentoWod({ prescricao, rodadas, duracaoMin, nMovimentos } = {}) {
  const reps = repsDaPrescricao(prescricao);
  const voltas = positivo(rodadas);
  if (reps && voltas) return seriesPorReps(reps * voltas);

  const n = positivo(nMovimentos) || 1;
  return seriesPorTempo((positivo(duracaoMin) * 60) / n);
}
