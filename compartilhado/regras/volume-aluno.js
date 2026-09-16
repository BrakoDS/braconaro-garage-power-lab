// @ts-check
/**
 * O VOLUME DA SEMANA DE UM ALUNO — só os dias que são dele.
 *
 * O box treina um treino por dia, mas cada aluno vai em dias diferentes. Somar a
 * semana inteira do box daria a todos o mesmo número, e o número estaria errado
 * para todo mundo: quem treina 3x não fez o volume de quem treina 5x.
 *
 * Duas leituras da mesma semana, e a diferença importa (spec, "Prospectivo ×
 * retrospectivo"):
 *
 * - **Antes da aula**, montando o mês: vale o dia PREVISTO no plano
 *   (`diasTreino`). É o que a tela do coach usa para decidir a redistribuição.
 * - **Depois da aula**: vale a presença REAL. É o que o Portal mostra ao aluno —
 *   faltou segunda, a segunda sai da conta. Isso chega aqui por `presencas`, e
 *   quem resolve remarcação e atestado é `semana.js`, na Etapa 5.
 *
 * Puro: recebe os treinos já lidos por quem chamou. A regra não vai ao banco.
 */
import { faixaDaSemana, diaSemanaDe } from './datas-treino.js';
import { GRUPOS } from './grupos.js';

/**
 * Os treinos da semana de `dateId` que são do aluno.
 * @param {any[]} treinos          treinos salvos (cada um com `dateId` e `volPorGrupo`)
 * @param {string} dateId          o dia de referência
 * @param {Object} [opcoes]
 * @param {string[]} [opcoes.diasTreino]   dias previstos do aluno ('seg'...)
 * @param {Record<string, boolean>} [opcoes.presencas]  presença real por dateId
 * @param {boolean} [opcoes.incluirODia]   incluir o próprio `dateId` (padrão: não)
 */
export function diasDoAluno(treinos, dateId, { diasTreino, presencas, incluirODia = false } = {}) {
  const { ini, fim } = faixaDaSemana(dateId);
  return (treinos || []).filter((t) => {
    if (!t?.dateId || t.dateId < ini || t.dateId > fim) return false;
    if (!incluirODia && t.dateId === dateId) return false;
    // Presença real manda quando existe: é o registro do que aconteceu. Dia sem
    // registro nenhum não conta como presença — o padrão é não inventar treino.
    if (presencas) return !!presencas[t.dateId];
    // Sem presença, vale o plano. Aluno sem dias marcados na ficha conta todos os
    // dias do box: é o que o coach vê hoje, e some-lo da conta seria pior — ele
    // apareceria zerado na turma sem ninguém entender por quê.
    if (!diasTreino || !diasTreino.length) return true;
    return diasTreino.includes(diaSemanaDe(t.dateId));
  });
}

/**
 * Quanto o aluno já fez de cada grupo nesta semana, antes do dia de `dateId`.
 * @param {any[]} treinos
 * @param {string} dateId
 * @param {Parameters<typeof diasDoAluno>[2]} [opcoes]
 * @returns {Record<string, number>}
 */
export function volumeDaSemanaDoAluno(treinos, dateId, opcoes) {
  /** @type {Record<string, number>} */
  const porGrupo = {};
  for (const g of GRUPOS) porGrupo[g] = 0;
  for (const t of diasDoAluno(treinos, dateId, opcoes)) {
    for (const [g, v] of Object.entries(t.volPorGrupo || {})) {
      if (g in porGrupo) porGrupo[g] += Number(v) || 0;
    }
  }
  return porGrupo;
}
