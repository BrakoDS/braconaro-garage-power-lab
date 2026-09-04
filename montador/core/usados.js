// @ts-check
/**
 * Quem já apareceu nos treinos de uma semana.
 *
 * Serve ao aviso "· já na semana" que o coach vê ao escolher um exercício. É só
 * marcação: repetir é decisão dele, e há dia em que repetir é o certo.
 *
 * Mora em `core/` e não lê o store de propósito: quem conversa com o store é a
 * UI, que passa os treinos já carregados. Assim a regra tem teste sem precisar
 * de navegador nem de dado salvo.
 *
 * Os treinos têm formatos diferentes conforme a aba que os montou. Aqui olhamos
 * os dois que guardam exercício de musculação: `exercicios` (Automático e
 * Treino Manual em blocos) e `livre.blocos[].exercicios` (Treino Livre). Hyrox,
 * HIIT e GAP guardam em estruturas próprias e nunca entraram nesta contagem —
 * mantido como está, para não mudar em silêncio um aviso que o coach já leu de
 * um jeito por meses.
 */

/**
 * IDs de exercício usados nos treinos dados.
 * @param {any[]} [treinos]
 * @param {string} [dateIdExcluido]  Dia a ignorar — normalmente o que está sendo montado
 * @returns {Set<string>}
 */
export function idsUsadosEm(treinos, dateIdExcluido) {
  const ids = new Set();
  for (const t of treinos || []) {
    if (!t || (dateIdExcluido && t.dateId === dateIdExcluido)) continue;
    for (const e of t.exercicios || []) if (e && e.id) ids.add(e.id);
    for (const b of (t.livre && t.livre.blocos) || []) {
      for (const e of (b && b.exercicios) || []) if (e && e.id) ids.add(e.id);
    }
  }
  return ids;
}
