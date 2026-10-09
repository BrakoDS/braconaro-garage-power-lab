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
import { vencimentoNoMes } from '../../compartilhado/regras/cobranca.js?v=12';
import {
  MESES_FIN, brl, numMoney, statusFin, novoConsumo, comPagamento, contaDoMes,
  eventoPagamento, eventoPagamentoDesfeito, eventoLancamento,
} from './financeiro-aluno.js?v=12';

const ativo = (a) => (a.status || 'ativo') !== 'inativo';
/** A fatura é só a mensalidade — sem consumo e sem dependente? O lembrete e o recibo dizem "mensalidade" ou "conta". @param {any} conta */
const soMensalidadeDa = (conta) => !conta.dependentes.length && !(conta.propria.extras > 0);

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
  const { conta } = contaDoMes(a, mesId, todos);
  return { patch: { pagamentos: comPagamento(a.pagamentos, mesId, true) }, log: eventoPagamento(mesId, conta.total, soMensalidadeDa(conta)) };
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

/** @typedef {{ rotulo: string, valor: number }} ItemDaConta */

const centavos = (v) => Math.round(v * 100);
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/**
 * O extrato de uma conta do mês (a `conta` de `contaDoMes`), na ordem em que
 * se lê: a mensalidade, os consumos (o mesmo produto agrupado: "2x
 * Energético"), e depois o que é de cada dependente, com o nome dele:
 * "Mensalidade (Bia)". null quando a conta NÃO tem consumo — aí o lembrete
 * curto de sempre basta.
 *
 * Sai da mesma conta que dá o total: a soma dos itens é o valor cobrado.
 * @param {any} conta @returns {ItemDaConta[] | null}
 */
export function itensDaFatura(conta) {
  const partes = [conta.propria, ...conta.dependentes];
  if (!partes.some((p) => (p.consumos || []).some((c) => Number(c.preco) > 0))) return null;
  /** @type {ItemDaConta[]} */
  const itens = [];
  /** @param {any} parte @param {string} [de] o nome do dependente */
  const somar = (parte, de) => {
    const sufixo = de ? ` (${de})` : '';
    if (parte.mensalidade > 0) itens.push({ rotulo: `Mensalidade${sufixo}`, valor: parte.mensalidade });
    /** @type {Map<string, { n: number, c: number }>} */
    const porNome = new Map();
    for (const c of parte.consumos || []) {
      const preco = Number(c.preco) || 0;
      if (preco <= 0) continue;
      const nome = String(c.nome || '').trim() || 'Consumo';
      const g = porNome.get(nome) || { n: 0, c: 0 };
      porNome.set(nome, { n: g.n + 1, c: g.c + centavos(preco) });
    }
    for (const [nome, g] of porNome) itens.push({ rotulo: `${g.n}x ${nome}${sufixo}`, valor: g.c / 100 });
  };
  somar(conta.propria);
  for (const d of conta.dependentes) somar(d, primeiroNome(d.nome));
  return itens;
}

/** O extrato da conta de um aluno num mês. @param {any} a @param {string} mesId @param {any[]} todos */
export const itensDaConta = (a, mesId, todos) => itensDaFatura(contaDoMes(a, mesId, todos).conta);

/** Os itens somam exatamente `valor` (ao centavo)? @param {ItemDaConta[] | null} itens @param {number} valor */
export const itensFecham = (itens, valor) => !!itens && itens.reduce((t, i) => t + centavos(i.valor), 0) === centavos(Number(valor) || 0);

/** As linhas "- Item: R$ x" do extrato. @param {ItemDaConta[]} itens */
export const linhasDosItens = (itens) => itens.map((i) => `- ${i.rotulo}: ${brl(i.valor)}`).join('\n');

/**
 * O lembrete de WhatsApp de uma conta do mês — o MESMO texto no botão da tela
 * Cobranças e na Fila de mensagens. Quando a conta é só a mensalidade, o texto
 * fala "mensalidade"; com consumo ou dependente junto, fala "conta" — o valor é
 * o total, o mesmo que o Portal mostra para pagar. Com consumo (`itens`), o
 * texto traz o extrato antes do Pix.
 * @param {any} a @param {string} mesId @param {number} valor @param {number} dias diasAteVencimento
 * @param {boolean} [soMensalidade] a conta é só a mensalidade (padrão: sim)
 * @param {ItemDaConta[] | null} [itens] o extrato (`itensDaFatura`); só entra se fechar com `valor`
 */
export function msgCobranca(a, mesId, valor, dias, soMensalidade = true, itens = null) {
  const nome = primeiroNome(a.nome);
  const mesNome = MESES_FIN[Number(mesId.split('-')[1]) - 1];
  const quando = dias < 0 ? `venceu dia ${a.vencimento}` : dias === 0 ? 'vence hoje' : `vence dia ${a.vencimento}`;
  const pix = `Pra facilitar, o Pix é a chave CNPJ ${PIX.chave} (${PIX.nome}) — dá pra pagar direto pelo Portal do Aluno também. Qualquer dúvida é só chamar! 💪`;
  if (itens && itens.length && itensFecham(itens, valor)) {
    return `Olá, ${nome}! 😊 Passando pra lembrar da sua conta de ${mesNome} (${brl(valor)}), que ${quando}:\n${linhasDosItens(itens)}\n${pix}`;
  }
  return `Olá, ${nome}! 😊 Passando pra lembrar da sua ${soMensalidade ? 'mensalidade' : 'conta'} de ${mesNome} (${brl(valor)}), que ${quando}. ${pix}`;
}

/**
 * @typedef {{ a: any, dias: number, valor: number, soMensalidade: boolean, itens: ItemDaConta[] | null }} Cobranca
 *   valor: a FATURA do mês (mensalidade com parceria, consumos e dependentes)
 *   itens: o extrato da fatura quando há consumo (`itensDaFatura`), senão null
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
      return { a, dias: diasAteVencimento(a, mesId, hojeIso), valor: conta.total, soMensalidade: soMensalidadeDa(conta), itens: itensDaFatura(conta) };
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
