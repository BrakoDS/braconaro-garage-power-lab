// @ts-check
/**
 * As regras de dinheiro do box — puras: recebem a ficha (e todos os alunos, e
 * o dia, quando importa) e DEVOLVEM o resultado. Não gravam, não registram,
 * não desenham e não alteram o que recebem.
 *
 * Duas partes:
 *
 *   AS AÇÕES — dar baixa, desfazer, lançar e remover consumo. Cada uma devolve
 *   `{ patch, log }`: o que gravar na ficha e a linha da aba Registros (ou
 *   `log: null` quando a ação não deixa trilha), ou `null` quando não há o que
 *   fazer. A baixa existia em três telas (aba Financeiro do aluno, tela
 *   Financeiro do box, Cobranças); agora as três chamam `darBaixa`, e o valor
 *   registrado é sempre o da fatura NA HORA da baixa.
 *
 *   AS CONTAS DO BOX — o mês da tela Financeiro (quem cobra de quem, o selo de
 *   cada linha, os totais) e a lista das Cobranças.
 *
 * As contas de UM aluno (a fatura do mês, o histórico, o resumo do plano)
 * ficam em financeiro-aluno.js; as regras compartilhadas com o Portal e o app,
 * em compartilhado/regras/consumo.js e cobranca.js.
 *
 * @typedef {import('./financeiro-aluno.js').EventoFinanceiro} EventoFinanceiro
 * @typedef {{ patch: Record<string, any>, log: EventoFinanceiro | null }} Mudanca
 */
import { mesIdParaLancar, totalConsumos } from '../../compartilhado/regras/consumo.js';
import { vencimentoNoMes } from '../../compartilhado/regras/cobranca.js';
import {
  MESES_FIN, brl, numMoney, statusFin, novoConsumo, comPagamento, contaDoMes,
  eventoPagamento, eventoPagamentoDesfeito, eventoLancamento,
} from './financeiro-aluno.js';

const ativo = (a) => (a.status || 'ativo') !== 'inativo';

/* ============================================================
   As ações
   ============================================================ */

/**
 * DAR BAIXA — a fatura do mês foi paga. O valor que vai para o log é o da
 * fatura agora (com consumos e dependentes), e não o de quando a tela abriu.
 * null: o mês já está pago (um segundo clique não registra outro pagamento).
 * @param {any} a @param {string} mesId @param {any[]} todos todos os alunos
 * @returns {Mudanca | null}
 */
export function darBaixa(a, mesId, todos) {
  if (a.pagamentos && a.pagamentos[mesId]) return null;
  const total = contaDoMes(a, mesId, todos).conta.total;
  return { patch: { pagamentos: comPagamento(a.pagamentos, mesId, true) }, log: eventoPagamento(mesId, total) };
}

/**
 * DESFAZER A BAIXA — a fatura volta a ficar em aberto (também no Portal).
 * null: o mês não estava pago.
 * @param {any} a @param {string} mesId
 * @returns {Mudanca | null}
 */
export function desfazerBaixa(a, mesId) {
  if (!(a.pagamentos && a.pagamentos[mesId])) return null;
  return { patch: { pagamentos: comPagamento(a.pagamentos, mesId, false) }, log: eventoPagamentoDesfeito(mesId) };
}

/**
 * LANÇAR CONSUMO — do catálogo (com `produtoId`) ou avulso. O consumo leva
 * nome, preço e fatura do dia (ver `novoConsumo`). Só o avulso deixa trilha:
 * do catálogo, o produto e o preço já dizem tudo.
 * @param {any} a
 * @param {{ nome: string, preco: number|string, produtoId?: string }} item
 * @param {string} dataIso 'AAAA-MM-DD' da venda
 * @param {string} [id] o id do consumo (os testes fixam; a tela deixa gerar)
 * @returns {Mudanca & { consumo: any }}
 */
export function lancarConsumo(a, item, dataIso, id) {
  const consumo = id === undefined ? novoConsumo(a, item, dataIso) : novoConsumo(a, item, dataIso, id);
  return {
    consumo,
    patch: { consumos: [...(a.consumos || []), consumo] },
    log: item.produtoId ? null : eventoLancamento(consumo),
  };
}

/**
 * REMOVER CONSUMO. null: não há consumo com esse id.
 * @param {any} a @param {string} consumoId
 * @returns {Mudanca | null}
 */
export function removerConsumo(a, consumoId) {
  const consumos = a.consumos || [];
  if (!consumos.some((c) => c.id === consumoId)) return null;
  return { patch: { consumos: consumos.filter((c) => c.id !== consumoId) }, log: null };
}

/* ============================================================
   O mês da tela Financeiro do box
   ============================================================ */

/**
 * @typedef {{
 *   a: any, deps: any[], resp: any, conta: any, propria: any,
 *   status: 'pago'|'vencido'|'pendente', statusExibido: 'pago'|'vencido'|'pendente',
 *   cortesia: boolean, rotulo: string, destino: string, adiante: number,
 * }} LinhaDoMes
 */

/**
 * Quem cobra de quem no mês, e o que a tela mostra em cada linha.
 *
 * Cada aluno ativo vira uma linha, mas nem toda linha é uma COBRANÇA: o
 * dependente com a conta inteira no responsável aparece para o coach ver, sem
 * entrar nos totais. Contar duas vezes o mesmo dinheiro é o erro fácil aqui — o
 * pai somando o filho e o filho somando sozinho.
 *
 * Totais:
 *   previsto   o que é cobrável no mês (contas com valor);
 *   recebido   a parte já paga;
 *   extras     os consumíveis do mês (contados na linha de quem consumiu);
 *   investido  o desconto das parcerias — o que o box banca —, contado na
 *              linha de quem TEM a parceria, e não na de quem paga a conta.
 * @param {any[]} todos @param {string} mesId @param {string} hojeIso
 */
export function mesDoBox(todos, mesId, hojeIso) {
  const totais = { previsto: 0, recebido: 0, extras: 0, investido: 0 };
  /** @type {LinhaDoMes[]} */
  const linhas = todos.filter(ativo).map((a) => {
    const { deps, resp, conta, propria } = contaDoMes(a, mesId, todos);
    const status = /** @type {'pago'|'vencido'|'pendente'} */ (statusFin(a, mesId, hojeIso));
    // O dependente sem nada próprio a pagar espelha a situação do responsável:
    // ele não tem conta, então não pode ficar "vencido" por conta nenhuma.
    const statusExibido = (resp && conta.total === 0) ? /** @type {any} */ (statusFin(resp, mesId, hojeIso)) : status;
    // Quem não deve nada não pode aparecer vencido. Sem responsável e sem conta,
    // o motivo é a parceria — e é isso que o selo tem que dizer.
    const cortesia = !resp && conta.total === 0 && propria.desconto > 0;
    const rotulo = cortesia ? 'Cortesia' : statusExibido === 'pago' ? 'Pago' : statusExibido === 'vencido' ? 'Vencido' : 'Pendente';
    // Consumo lançado numa fatura à frente não aparece na linha do mês em tela;
    // sem o aviso, o dinheiro fica invisível até alguém navegar de mês.
    const destino = mesIdParaLancar(hojeIso, a.vencimento, a.pagamentos);
    const adiante = destino !== mesId ? totalConsumos(a.consumos, destino) : 0;
    return { a, deps, resp, conta, propria, status, statusExibido, cortesia, rotulo, destino, adiante };
  }).filter((l) => l.conta.total > 0 || l.resp || numMoney(l.a.mensalidade) > 0);
  for (const l of linhas) {
    totais.extras += l.propria.extras;
    totais.investido += l.propria.desconto;
    if (l.conta.total > 0) {
      totais.previsto += l.conta.total;
      if (l.status === 'pago') totais.recebido += l.conta.total;
    }
  }
  return { linhas, totais };
}

/* ============================================================
   As Cobranças
   ============================================================ */

/** Dias de hoje até o vencimento do mês (negativo = atrasado). @param {any} a @param {string} mesId @param {string} hojeIso */
export function diasAteVencimento(a, mesId, hojeIso) {
  const venc = new Date(vencimentoNoMes(mesId, a.vencimento) + 'T00:00:00');
  const hoje = new Date(hojeIso + 'T00:00:00');
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000);
}

/** A chave Pix e o nome que vão no lembrete. */
export const PIX = Object.freeze({ chave: '66.567.011/0001-66', nome: 'Guilherme Braconaro' });

/**
 * O lembrete de WhatsApp de uma conta do mês. Quando a conta é só a
 * mensalidade, o texto fala "mensalidade"; com consumo ou dependente junto, fala
 * "conta" — o valor é o total, o mesmo que o Portal mostra para pagar.
 * @param {any} a @param {string} mesId @param {number} valor @param {number} dias diasAteVencimento
 * @param {boolean} [soMensalidade] a conta é só a mensalidade (padrão: sim)
 */
export function msgCobranca(a, mesId, valor, dias, soMensalidade = true) {
  const nome = (a.nome || '').trim().split(/\s+/)[0] || '';
  const mesNome = MESES_FIN[Number(mesId.split('-')[1]) - 1];
  const quando = dias < 0 ? `venceu dia ${a.vencimento}` : dias === 0 ? 'vence hoje' : `vence dia ${a.vencimento}`;
  return `Olá, ${nome}! 😊 Passando pra lembrar da ${soMensalidade ? 'mensalidade' : 'conta'} de ${mesNome} (${brl(valor)}), que ${quando}. Pra facilitar, o Pix é a chave CNPJ ${PIX.chave} (${PIX.nome}) — dá pra pagar direto pelo Portal do Aluno também. Qualquer dúvida é só chamar! 💪`;
}

/**
 * @typedef {{ a: any, dias: number, valor: number, soMensalidade: boolean }} Cobranca
 *   valor: a FATURA do mês (mensalidade com parceria, consumos e dependentes)
 */

/**
 * Quem ainda deve a conta do mês, do mais atrasado ao mais folgado, em três
 * grupos (vencidas, em até 5 dias, a vencer) e com os totais.
 *
 * Quem deve e quanto é a MESMA conta da tela Financeiro e do Portal
 * (`contaDoMes`). Antes, esta lista usava a mensalidade cheia da ficha: a
 * cortesia de 100% aparecia devendo a mensalidade inteira, o dependente com a
 * conta no responsável recebia lembrete da própria, e o responsável era cobrado
 * só da dele — sem os consumos e sem os dependentes que ele acerta.
 * @param {any[]} todos @param {string} mesId @param {string} hojeIso
 */
export function cobrancasDoMes(todos, mesId, hojeIso) {
  /** @type {Cobranca[]} */
  const pendentes = todos
    .filter((a) => ativo(a) && statusFin(a, mesId, hojeIso) !== 'pago')
    .map((a) => {
      const { conta } = contaDoMes(a, mesId, todos);
      const soMensalidade = !conta.dependentes.length && !(conta.propria.extras > 0);
      return { a, dias: diasAteVencimento(a, mesId, hojeIso), valor: conta.total, soMensalidade };
    })
    .filter((x) => x.valor > 0)
    .sort((x, y) => x.dias - y.dias);
  const vencidas = pendentes.filter((x) => x.dias < 0);
  return {
    vencidas,
    emBreve: pendentes.filter((x) => x.dias >= 0 && x.dias <= 5),
    aVencer: pendentes.filter((x) => x.dias > 5),
    totalAtraso: vencidas.reduce((s, x) => s + x.valor, 0),
    totalPendente: pendentes.reduce((s, x) => s + x.valor, 0),
  };
}
