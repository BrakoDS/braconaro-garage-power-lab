// @ts-check
/**
 * O Pix dinâmico (Mercado Pago) chegando na Gestão: a baixa automática.
 *
 * O webhook do Mercado Pago (functions/src/pix-servico.ts) NÃO grava na ficha
 * — a Gestão é local-first e regravaria a ficha por cima da baixa. Ele anota
 * o Pix aprovado no livro-caixa `gestao/{uid}/cobrancasPix` com
 * `avisarGestao: true`, e é aqui que a baixa acontece, com o MESMO `darBaixa`
 * da baixa manual (aba Financeiro, tela Financeiro, Cobranças):
 *
 *   - aprovado → a ficha ganha o mês pago (e `pixPagos[mês] = paymentId`, o
 *     rastro de qual Pix pagou), a aba Registros ganha "Pagamento via Pix" e a
 *     Fila de mensagens sugere o recibo; a cobrança sai da Fila sozinha;
 *   - aprovado para um mês que JÁ estava pago (baixa manual antes, ou um QR
 *     antigo pago depois do novo) → não paga de novo: aviso na aba Registros
 *     para o coach conferir e devolver;
 *   - divergente (valor pago ≠ cobrado) ou estornado → só o aviso. Estorno não
 *     desfaz a baixa sozinho: quem decide é o coach.
 *
 * Idempotente: o evento do log tem id fixo (`pix-{paymentId}`), e o Pix que já
 * pagou o mês (`pixPagos`) não vira aviso falso se o tratamento rodar de novo
 * (a bandeira não desligou por falta de rede, por exemplo).
 *
 * A primeira metade é pura (testada em pix-baixa.test.js); `aplicarPixPendentes`
 * recebe o mundo por parâmetro.
 */
import { darBaixa } from './financeiro-regras.js?v=13';
import { brl, rotuloMesFin, contaDoMes } from './financeiro-aluno.js?v=13';

const cents = (v) => Math.round((Number(v) || 0) * 100);

/**
 * @typedef {{ paymentId: string, alunoId: string, alunoNome?: string, mesId: string, valor: number,
 *   valorPago?: number, soMensalidade?: boolean, status: string, motivo?: string }} CobrancaPix
 * @typedef {{ tipo: string, resumo: string, extra: Record<string, any>, dados?: Record<string, any> }} LinhaDoLog
 * @typedef {{ acao: 'baixa', patch: Record<string, any>, log: LinhaDoLog }
 *   | { acao: 'aviso', log: LinhaDoLog }
 *   | { acao: 'nada', motivo: string }} Plano
 */

/**
 * O que um Pix do livro-caixa faz nesta ficha.
 * @param {CobrancaPix} c @param {any} a a ficha (null: o aluno foi apagado) @param {any[]} todos
 * @returns {Plano}
 */
export function planoDoPix(c, a, todos) {
  if (!a) return { acao: 'nada', motivo: 'aluno não existe mais na Gestão' };
  const mes = rotuloMesFin(c.mesId);
  const pago = Number(c.valorPago ?? c.valor) || 0;
  const aviso = (resumo) => /** @type {Plano} */ ({
    acao: 'aviso', log: { tipo: 'pix-alerta', resumo, extra: { id: `pix-alerta-${c.paymentId}-${c.status}`, chave: `pix-alerta:${c.paymentId}:${c.status}` } },
  });

  if (c.status === 'divergente') {
    return aviso(`Pix com divergência · ${mes} · pago ${brl(pago)}, cobrado ${brl(c.valor)} — a baixa NÃO foi feita; confira no Mercado Pago`);
  }
  if (c.status === 'estornado') {
    return aviso(`Pix devolvido pelo Mercado Pago · ${mes} · ${brl(pago)} — a baixa do mês continua; desfaça na aba Financeiro se for o caso`);
  }
  if (c.status !== 'aprovado') return { acao: 'nada', motivo: `status ${c.status}` };

  // Este mesmo Pix já pagou o mês (o tratamento está rodando de novo): nada.
  if (a.pixPagos && a.pixPagos[c.mesId] === c.paymentId) return { acao: 'nada', motivo: 'este Pix já deu baixa' };

  const r = darBaixa(a, c.mesId, todos);
  if (!r) {
    return aviso(`Pix recebido para um mês que já estava pago · ${mes} · ${brl(pago)} — confira e devolva ao aluno se for o caso`);
  }
  const agora = contaDoMes(a, c.mesId, todos).conta.total;
  const diferenca = cents(agora) !== cents(pago) ? ` · a conta agora é ${brl(agora)}` : '';
  return {
    acao: 'baixa',
    patch: { ...r.patch, pixPagos: { ...(a.pixPagos || {}), [c.mesId]: c.paymentId } },
    log: {
      tipo: 'pagamento',
      resumo: `Pagamento via Pix (Mercado Pago) · ${mes} · ${brl(pago)}${diferenca}`,
      extra: { id: `pix-${c.paymentId}`, chave: `pix:${c.paymentId}` },
      // 'acao-registrada' leva o fato: a Fila de mensagens sugere o recibo.
      dados: { mesId: c.mesId, valor: pago, soMensalidade: c.soMensalidade !== false },
    },
  };
}

/**
 * Trata as cobranças com `avisarGestao`: aplica o plano de cada uma (gravar a
 * ficha, registrar no log) e SÓ DEPOIS desliga a bandeira na nuvem — se a rede
 * cair no meio, a próxima rodada trata de novo, e `planoDoPix` não duplica.
 *
 * @param {{
 *   listar: () => Promise<CobrancaPix[]>,
 *   marcarTratado: (paymentId: string, em: number) => Promise<void>,
 *   obter: (id: string) => any, todos: () => any[],
 *   atualizar: (id: string, patch: Record<string, any>) => any,
 *   registrar: (tipo: string, a: any, resumo: string, extra: Record<string, any>, dados?: Record<string, any>) => void,
 *   agora: () => number,
 *   avisar?: (msg: string, extra?: any) => void,
 * }} d
 * @returns {Promise<{ baixas: number, avisos: number }>}
 */
export async function aplicarPixPendentes(d) {
  const avisar = d.avisar || ((m, x) => console.warn(m, x ?? ''));
  const lista = (await d.listar()).slice().sort((x, y) => String(x.paymentId).localeCompare(String(y.paymentId)));
  let baixas = 0, avisos = 0;
  for (const c of lista) {
    const a = d.obter(c.alunoId);
    const plano = planoDoPix(c, a, d.todos());
    if (plano.acao === 'baixa') {
      d.atualizar(a.id, plano.patch);
      d.registrar(plano.log.tipo, a, plano.log.resumo, plano.log.extra, plano.log.dados);
      baixas++;
    } else if (plano.acao === 'aviso') {
      d.registrar(plano.log.tipo, a, plano.log.resumo, plano.log.extra);
      avisar(`[Gestão] ${plano.log.resumo}`, { aluno: a.nome, paymentId: c.paymentId });
      avisos++;
    } else if (plano.motivo === 'aluno não existe mais na Gestão') {
      avisar('[Gestão] Pix de um aluno que não está mais na Gestão.', { paymentId: c.paymentId, alunoId: c.alunoId });
    }
    try { await d.marcarTratado(c.paymentId, d.agora()); } catch (e) {
      avisar('[Gestão] Pix tratado, mas a nuvem não foi avisada — tenta de novo na próxima vez.', /** @type {any} */ (e)?.code || e);
    }
  }
  return { baixas, avisos };
}
