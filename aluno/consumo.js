// @ts-check
/**
 * Consumíveis do box — energético, dose de pré-treino, o que mais vier.
 *
 * Módulo puro: sem DOM e sem Firebase, para poder ser testado direto no Node
 * (veja consumo.test.js). Usado dos dois lados: o coach lança o consumo no
 * Financeiro, e o Portal monta a notinha do aluno com os mesmos números.
 *
 * A QUAL FATURA UM CONSUMO PERTENCE
 *
 * O corte é o dia do vencimento. Com vencimento no dia 10, o que for consumido
 * até o dia 10 entra na fatura daquele mês; do dia 11 em diante já cai na do mês
 * seguinte. Uma dose comprada em 25/08 e outra em 31/08 aparecem juntas na
 * fatura de setembro, que vence em 10/09.
 *
 * O ciclo é CARIMBADO na hora da venda (`mesId` fica gravado no consumo), e não
 * recalculado depois. Duas razões: a fatura de um mês fechado não pode mudar de
 * conteúdo quando alguém mexe no dia de vencimento do aluno, e o preço do
 * produto vai junto — energético que custava 10 continua valendo 10 na notinha
 * de agosto depois de virar 12.
 */

/** O dia de vencimento válido para um mês (fevereiro não tem dia 31). */
function diaVencimentoNoMes(ano, mes, dia) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return Math.min(Math.max(1, parseInt(String(dia), 10) || 10), ultimoDia);
}

/**
 * A fatura ('YYYY-MM') a que um consumo pertence, pela data.
 * @param {string} dataIso 'YYYY-MM-DD' da venda
 * @param {number|string} diaVencimento dia do mês em que a mensalidade vence
 * @returns {string} 'YYYY-MM'
 */
export function mesIdDoConsumo(dataIso, diaVencimento) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const corte = diaVencimentoNoMes(ano, mes, diaVencimento);
  if (dia <= corte) return `${ano}-${String(mes).padStart(2, '0')}`;
  const d = new Date(ano, mes, 1); // mes é 1-based, então isto já é o mês seguinte
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** O mês seguinte a um 'YYYY-MM'. */
function proximoMes(mesId) {
  const [a, m] = mesId.split('-').map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * A fatura em que um consumo deve ser LANÇADO agora.
 *
 * Sai da regra da data e, se essa fatura já estiver quitada, pula para a
 * seguinte: o aluno que pagou no dia 5 e comprou um energético no dia 8 não pode
 * ver a compra dentro de uma conta que ele já fechou.
 *
 * @param {string} dataIso @param {number|string} diaVencimento
 * @param {Record<string,any>} [pagamentos] mapa 'YYYY-MM' → true
 * @returns {string} 'YYYY-MM'
 */
export function mesIdParaLancar(dataIso, diaVencimento, pagamentos = {}) {
  let mesId = mesIdDoConsumo(dataIso, diaVencimento);
  // 24 é folga de sobra: só roda enquanto houver faturas seguidas já pagas.
  for (let i = 0; i < 24 && pagamentos[mesId]; i++) mesId = proximoMes(mesId);
  return mesId;
}

/**
 * Os consumos de uma fatura, do mais antigo para o mais novo.
 * @param {any[]} [consumos] @param {string} mesId
 */
export function consumosDoMes(consumos, mesId) {
  return (consumos || [])
    .filter((c) => c && c.mesId === mesId)
    .slice()
    .sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
}

/** Quanto os consumos de uma fatura somam. @param {any[]} [consumos] @param {string} mesId */
export function totalConsumos(consumos, mesId) {
  return consumosDoMes(consumos, mesId).reduce((s, c) => s + (Number(c.preco) || 0), 0);
}

/**
 * A conta fechada de uma fatura: mensalidade + consumíveis.
 * @param {{mensalidade?:any, consumos?:any[]}} aluno @param {string} mesId
 * @returns {{mensalidade:number, consumos:any[], extras:number, total:number}}
 */
export function faturaDoMes(aluno, mesId) {
  const mensalidade = Number(String(aluno?.mensalidade ?? '').replace(',', '.')) || 0;
  const consumos = consumosDoMes(aluno?.consumos, mesId);
  const extras = consumos.reduce((s, c) => s + (Number(c.preco) || 0), 0);
  return { mensalidade, consumos, extras, total: mensalidade + extras };
}
