// @ts-check
/**
 * Qual conta o aluno vê hoje, e em que situação ela está.
 *
 * Módulo puro: sem DOM e sem Firebase, testado direto no Node (veja
 * cobranca.test.js). O app mobile tem o mesmo ciclo em
 * `app-mobile/src/core/cobranca.ts` — os dois precisam dizer a mesma coisa no
 * mesmo dia, senão o aluno vê "Vencido" no navegador e "Próximo mês" no celular.
 *
 * O CICLO, PELO CALENDÁRIO
 *
 *   dia 1 ao vencimento (10, salvo outro na ficha)  → a conta do mês, "Pendente"
 *   do dia seguinte ao vencimento até o dia 27       → sem pagamento, "Vencido"
 *   do dia 28 em diante                              → já é a conta do MÊS SEGUINTE,
 *                                                      "Próximo mês"
 *
 * A conta do mês seguinte, vista no dia 28, é a mensalidade dele mais o consumo
 * que ficou em aberto no mês atual: o consumo feito depois do vencimento já é
 * carimbado na fatura seguinte (ver consumo.js), então aqui só se escolhe o mês.
 *
 * A VIRADA NÃO ESCONDE DÍVIDA
 *
 * Se a conta do mês atual ainda está em aberto no dia 28, é ela que continua na
 * tela, "Vencido": mostrar a de outubro para quem não pagou setembro faria o
 * aluno pagar a conta errada, e o coach dar baixa no mês errado.
 */
import { faturaComDependentes, proximoMes } from './consumo.js';

/** A partir deste dia do mês, a conta em tela é a do mês seguinte. */
export const DIA_VIRADA = 28;

/**
 * 'YYYY-MM-DD' do vencimento num mês: o dia da ficha, preso ao último dia do
 * mês — quem vence dia 31 vence dia 28 em fevereiro, não some. Sem dia, 10.
 * @param {string} mesId 'YYYY-MM' @param {any} vencimento
 */
export function vencimentoNoMes(mesId, vencimento) {
  const [ano, m] = mesId.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(1, parseInt(String(vencimento), 10) || 10), ultimoDia);
  return `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const pago = (aluno, mesId) => !!(aluno && aluno.pagamentos && aluno.pagamentos[mesId]);

/**
 * O mês ('YYYY-MM') da conta que o aluno vê hoje.
 * @param {any} aluno a fatia do Portal (mensalidade, pagamentos, consumos, dependentes…)
 * @param {string} hoje 'YYYY-MM-DD', no fuso local
 */
export function mesDaCobranca(aluno, hoje) {
  const atual = hoje.slice(0, 7);
  if (Number(hoje.slice(8, 10)) < DIA_VIRADA) return atual;
  const deveAtual = !pago(aluno, atual)
    && faturaComDependentes(aluno, atual, (aluno && aluno.dependentes) || []).total > 0;
  return deveAtual ? atual : proximoMes(atual);
}

/**
 * A situação de uma conta que TEM valor a pagar.
 * @param {any} aluno @param {string} mesId @param {string} hoje 'YYYY-MM-DD'
 * @returns {'pago'|'proximo'|'vencido'|'pendente'}
 */
export function statusDaCobranca(aluno, mesId, hoje) {
  if (pago(aluno, mesId)) return 'pago';
  if (mesId > hoje.slice(0, 7)) return 'proximo';
  return hoje > vencimentoNoMes(mesId, aluno && aluno.vencimento) ? 'vencido' : 'pendente';
}
