// @ts-check
/**
 * O registro dos meses pagos ANTES da etapa 3 (PLANO-FASE1-ETAPA3.md, Parte D).
 *
 * Até 10/11/2026 o "pago" era só `pagamentos['AAAA-MM'] = true`. Para os meses
 * que têm de onde tirar o dado, a migração preenche `recebimentos[mês]`:
 *
 *   1. PIX DO PORTAL — `pixPagos[mês]` aponta o `paymentId`, e o livro
 *      `cobrancasPix` tem o valor pago e a hora da aprovação;
 *   2. REGISTRO DE PAGAMENTO — a linha "Pagamento registrado · mês · R$ X" da
 *      aba Registros (existe desde 09/10/2026): o valor e o dia da BAIXA (o dia
 *      em que o aluno pagou não foi guardado), meio não informado;
 *   3. sem nada — o mês fica sem registro, e a tela diz "antes do registro
 *      detalhado".
 *
 * Nunca sobrescreve um registro que já existe. Todo registro daqui leva
 * `origem: 'historico'`. Puro (testado em recebimentos-historico.test.js); quem
 * lê o banco e grava é functions/scripts/preencher-recebimentos.cjs.
 */
import { MESES_FIN, diaDoBoxEm } from './financeiro-aluno.js?v=31';

/** 'Novembro / 2026' (o texto do Registro) → '2026-11'. @param {string} texto */
function mesDoTexto(texto) {
  const m = String(texto).match(new RegExp(`(${MESES_FIN.join('|')}) / (\\d{4})`, 'i'));
  if (!m) return null;
  const i = MESES_FIN.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}

/** O primeiro valor em reais do texto ('R$ 1.234,56' → 1234.56), ou null. @param {string} texto */
function valorDoTexto(texto) {
  const m = String(texto).match(/R\$[\s ]*([\d.]+,\d{2})/);
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

/** O mês de uma linha dos Registros: o campo `dados.mesId`, ou o texto. @param {any} e */
const mesDoEvento = (e) => (e && e.dados && typeof e.dados.mesId === 'string' ? e.dados.mesId : mesDoTexto(e && e.resumo));

/**
 * @typedef {import('./financeiro-aluno.js').Recebimento} Recebimento
 * @typedef {{ mes: string, rec: Recebimento, fonte: 'pix'|'registro' }} Preenchimento
 */

/**
 * Os registros que a migração grava nesta ficha.
 * @param {any} ficha
 * @param {{ eventos: any[], cobrancas: Record<string, any> }} fontes
 *   eventos: as linhas dos Registros (de todos os alunos; só as desta ficha contam);
 *   cobrancas: o livro `cobrancasPix`, por `paymentId`
 * @returns {Preenchimento[]}
 */
export function recebimentosDoHistorico(ficha, { eventos, cobrancas }) {
  const id = String(ficha && ficha.id);
  const meus = (eventos || []).filter((e) => e && String(e.alunoId) === id);
  /** @type {Preenchimento[]} */
  const out = [];
  for (const [mes, pago] of Object.entries(ficha.pagamentos || {})) {
    if (!pago || !/^\d{4}-\d{2}$/.test(mes)) continue;
    if ((ficha.recebimentos || {})[mes]) continue; // nunca sobrescreve

    // 1. Pix do Portal: o Mercado Pago conferiu.
    const paymentId = (ficha.pixPagos || {})[mes];
    const c = paymentId ? (cobrancas || {})[String(paymentId)] : null;
    if (c && c.status === 'aprovado') {
      const aprovadoEm = Number(c.aprovadoEm) || 0;
      out.push({
        mes, fonte: 'pix',
        rec: {
          valor: Number(c.valorPago ?? c.valor) || 0, data: aprovadoEm ? diaDoBoxEm(aprovadoEm) : '', meio: 'pix-portal',
          comprovante: null, conferidoPor: 'mercado-pago', paymentId: String(paymentId), registradoEm: aprovadoEm, origem: 'historico',
        },
      });
      continue;
    }

    // 2. A linha "Pagamento registrado" mais recente do mês — e só se nenhuma
    //    "Pagamento desfeito" veio depois dela (aí a baixa que vale não deixou linha).
    const doMes = meus.filter((e) => (e.tipo === 'pagamento' || e.tipo === 'pagamento-desfeito') && mesDoEvento(e) === mes)
      .sort((x, y) => (Number(x.em) || 0) - (Number(y.em) || 0));
    const ultima = doMes[doMes.length - 1];
    if (!ultima || ultima.tipo !== 'pagamento') continue;
    const valor = ultima.dados && ultima.dados.valor != null ? Number(ultima.dados.valor) : valorDoTexto(ultima.resumo);
    const em = Number(ultima.em) || 0;
    if (!(valor != null && Number.isFinite(valor)) || !em) continue;
    out.push({
      mes, fonte: 'registro',
      rec: {
        valor, data: diaDoBoxEm(em), meio: 'nao-informado',
        comprovante: null, conferidoPor: 'coach', paymentId: null, registradoEm: em, origem: 'historico',
      },
    });
  }
  return out.sort((x, y) => x.mes.localeCompare(y.mes));
}
