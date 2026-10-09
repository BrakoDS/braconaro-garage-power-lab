// @ts-check
/**
 * O financeiro de UM aluno — puro, sem DOM e sem banco.
 *
 * Usado pela tela Financeiro do box (ui-tela-financeiro.js, um mês, todos os alunos) e pela
 * aba Financeiro do perfil (ui-tab-financeiro.js, um aluno, vários meses). As
 * regras de dinheiro de verdade continuam onde sempre estiveram, compartilhadas
 * com o Portal e o app mobile:
 *
 *   compartilhado/regras/consumo.js   fatura do mês, parceria, quem paga quem,
 *                                     em que fatura um consumo cai;
 *   compartilhado/regras/cobranca.js  pago / pendente / vencido / próximo mês.
 *
 * O MODELO (não muda aqui):
 *   - a mensalidade NÃO é um lançamento gravado: sai da ficha (`mensalidade`,
 *     `parceria`) a cada mês;
 *   - o consumo é um item gravado em `consumos[]`, carimbado com a fatura
 *     (`mesId`) e o preço do dia;
 *   - o pagamento é da FATURA do mês inteira: `pagamentos['AAAA-MM'] = true`.
 *     O Portal e o Pix cobram o total do mês, então não existe baixa por item.
 */
import { faturaDoMes, faturaComDependentes, mesIdParaLancar } from '../../compartilhado/regras/consumo.js';
import { statusDaCobranca, vencimentoNoMes } from '../../compartilhado/regras/cobranca.js?v=13';

export const MESES_FIN = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Reais no formato brasileiro. @param {unknown} v */
export const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Valor digitado (aceita vírgula), 0 se não der. @param {unknown} v */
export const numMoney = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** 'AAAA-MM' de uma data (local). @param {Date} [d] */
export function mesIdAtual(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
/** 'Outubro / 2026'. @param {string} mesId */
export function rotuloMesFin(mesId) { const [a, m] = mesId.split('-').map(Number); return `${MESES_FIN[m - 1]} / ${a}`; }
/** O mês `n` meses depois (ou antes). @param {string} mesId @param {number} n */
export function addMesFin(mesId, n) { const [a, m] = mesId.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

/**
 * 'pago' | 'vencido' | 'pendente' de um aluno num mês — a regra da tela
 * Financeiro do box (o mês em tela, sem "próximo mês").
 * @param {any} a @param {string} mesId @param {string} hojeIso 'AAAA-MM-DD'
 */
export function statusFin(a, mesId, hojeIso) {
  if (a.pagamentos && a.pagamentos[mesId]) return 'pago';
  return hojeIso > vencimentoNoMes(mesId, a.vencimento) ? 'vencido' : 'pendente';
}

/* ============================================================
   Gravações (devolvem o valor novo; quem grava é a tela)
   ============================================================ */

/**
 * Um consumo pronto para entrar em `consumos[]`.
 *
 * Nome e preço são COPIADOS agora: a notinha de agosto não pode se reescrever
 * quando o energético subir de preço. A fatura também é carimbada agora (ver
 * consumo.js) — a data manda, e fatura já quitada empurra para a seguinte.
 * Consumo avulso (camiseta, uma aula experimental) não tem `produtoId`; o
 * Portal e o app só leem nome, preço, data e fatura.
 * @param {any} a o aluno
 * @param {{ nome: string, preco: number|string, produtoId?: string }} item
 * @param {string} dataIso 'AAAA-MM-DD' da venda
 * @param {string} [id]
 */
export function novoConsumo(a, item, dataIso, id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`) {
  const c = {
    id, nome: String(item.nome || '').trim(), preco: numMoney(item.preco),
    data: dataIso, mesId: mesIdParaLancar(dataIso, a.vencimento, a.pagamentos || {}),
  };
  return item.produtoId ? { id, produtoId: item.produtoId, ...c } : c;
}

/** O mapa de pagamentos com o mês marcado (ou desmarcado). @param {Record<string, any>|undefined} pagamentos @param {string} mesId @param {boolean} pago */
export function comPagamento(pagamentos, mesId, pago) {
  const pg = { ...(pagamentos || {}) };
  if (pago) pg[mesId] = true; else delete pg[mesId];
  return pg;
}

/* ============================================================
   A conta do aluno num mês, e o histórico
   ============================================================ */

/**
 * A conta de um aluno num mês, com quem paga quem resolvido.
 *
 * Vínculo órfão (o responsável saiu, ou está inativo) não zera a conta de
 * ninguém: sem responsável ativo, o aluno volta a pagar a própria — a mesma
 * regra da tela Financeiro do box.
 * @param {any} a @param {string} mesId @param {any[]} todos todos os alunos
 */
export function contaDoMes(a, mesId, todos) {
  const ativos = todos.filter((x) => (x.status || 'ativo') !== 'inativo');
  const deps = ativos.filter((x) => x.pagoPor && x.pagoPor.id === a.id);
  const resp = a.pagoPor && a.pagoPor.id ? ativos.find((x) => x.id === a.pagoPor.id) || null : null;
  const efetivo = (a.pagoPor && !resp) ? { ...a, pagoPor: null } : a;
  return { resp, deps, conta: faturaComDependentes(efetivo, mesId, deps), propria: faturaDoMes(a, mesId) };
}

/**
 * Os meses que entram no histórico, do mais novo para o mais antigo.
 *
 * Começa no PRIMEIRO registro financeiro do aluno (um pagamento, um consumo) —
 * nunca antes: o box passou a marcar pagamento na Gestão num certo dia, e os
 * meses de antes apareceriam todos como "atrasado" sem ninguém dever nada. Sem
 * registro nenhum, só o mês atual. Termina no mês atual, ou na fatura mais à
 * frente que já tenha consumo lançado.
 * @param {any} a @param {string} hojeIso @param {number} [max]
 */
export function mesesDoHistorico(a, hojeIso, max = 12) {
  const atual = hojeIso.slice(0, 7);
  const marcados = [
    ...Object.keys(a.pagamentos || {}).filter((m) => /^\d{4}-\d{2}$/.test(m)),
    ...(a.consumos || []).map((c) => c && c.mesId).filter((m) => /^\d{4}-\d{2}$/.test(m || '')),
  ];
  const inicio = [atual, ...marcados].sort()[0];
  const fim = [atual, ...marcados].sort().slice(-1)[0];
  const meses = [];
  for (let m = fim; m >= inicio; m = addMesFin(m, -1)) meses.push(m);
  return { meses: meses.slice(0, max), temMais: meses.length > max };
}

/**
 * @typedef {{ tipo: 'mensalidade'|'consumo'|'dependente', descricao: string, valor: number,
 *   detalhe?: string, consumoId?: string, coberto?: boolean }} Item
 * @typedef {{ mesId: string, rotulo: string, vencimento: string, itens: Item[], total: number,
 *   status: 'pago'|'pendente'|'vencido'|'proximo'|'cortesia'|'coberto',
 *   pagavel: boolean, responsavel?: string }} Fatura
 */

/**
 * Uma fatura do aluno, pronta para a tela. null quando o mês não tem nada.
 * @param {any} a @param {string} mesId @param {any[]} todos @param {string} hojeIso
 * @returns {Fatura|null}
 */
export function faturaDoAluno(a, mesId, todos, hojeIso) {
  const { resp, conta, propria } = contaDoMes(a, mesId, todos);
  const escopo = resp ? (a.pagoPor.escopo === 'plano' ? 'plano' : 'tudo') : '';
  /** @type {Item[]} */ const itens = [];
  if (propria.mensalidadeCheia > 0) {
    itens.push({
      tipo: 'mensalidade', descricao: 'Mensalidade', valor: propria.mensalidade,
      detalhe: propria.desconto > 0 ? `${brl(propria.mensalidadeCheia)} − parceria ${propria.parceria.percentual}%` : '',
      coberto: !!escopo,
    });
  }
  for (const c of propria.consumos) {
    itens.push({ tipo: 'consumo', descricao: c.nome || 'Consumo', valor: Number(c.preco) || 0, detalhe: c.data || '', consumoId: c.id, coberto: escopo === 'tudo' });
  }
  for (const d of conta.dependentes) {
    itens.push({ tipo: 'dependente', descricao: `Conta de ${d.nome || 'dependente'}`, valor: d.total, detalhe: d.escopo === 'plano' ? 'só o plano' : 'plano e consumíveis' });
  }
  if (!itens.length) return null;

  const base = { mesId, rotulo: rotuloMesFin(mesId), vencimento: vencimentoNoMes(mesId, a.vencimento), itens, total: conta.total };
  if (resp && conta.total === 0) {
    return { ...base, status: 'coberto', pagavel: false, responsavel: resp.nome || resp.id };
  }
  if (conta.total === 0) return { ...base, status: 'cortesia', pagavel: false };
  return { ...base, status: statusDaCobranca(a, mesId, hojeIso), pagavel: true, ...(resp ? { responsavel: resp.nome || resp.id } : {}) };
}

/**
 * O histórico de faturas do aluno, do mês mais novo para o mais antigo.
 * @param {any} a @param {any[]} todos @param {string} hojeIso @param {number} [max]
 */
export function historicoFinanceiro(a, todos, hojeIso, max = 12) {
  const { meses, temMais } = mesesDoHistorico(a, hojeIso, max);
  const faturas = /** @type {Fatura[]} */ (meses.map((m) => faturaDoAluno(a, m, todos, hojeIso)).filter(Boolean));
  const emAberto = faturas.filter((f) => f.status === 'vencido' || f.status === 'pendente').reduce((s, f) => s + f.total, 0);
  const atrasado = faturas.filter((f) => f.status === 'vencido').reduce((s, f) => s + f.total, 0);
  return { faturas, temMais, emAberto: Math.round(emAberto * 100) / 100, atrasado: Math.round(atrasado * 100) / 100 };
}

/**
 * O resumo do plano, para o card do topo.
 * @param {any} a @param {any[]} todos @param {string} hojeIso
 */
export function resumoDoPlano(a, todos, hojeIso) {
  const { resp, deps, propria } = contaDoMes(a, hojeIso.slice(0, 7), todos);
  const vezes = parseInt(a.freqVezes, 10);
  return {
    plano: vezes ? `${vezes}x por semana` : '',
    mensalidadeCheia: propria.mensalidadeCheia,
    mensalidade: propria.mensalidade,
    parceria: propria.parceria,
    desconto: propria.desconto,
    vencimento: parseInt(a.vencimento, 10) || 10,
    vencimentoDefinido: !!parseInt(a.vencimento, 10),
    responsavel: resp ? { nome: resp.nome || resp.id, escopo: a.pagoPor.escopo === 'plano' ? 'plano' : 'tudo' } : null,
    dependentes: deps.map((d) => d.nome || d.id),
  };
}

/* ============================================================
   Auditoria: o texto dos eventos da aba Registros
   ============================================================
   A tela grava o evento (registro.js) DEPOIS da gravação no banco — o log é
   testemunha da ação, não condição. Aqui só o texto, para ser o mesmo venha a
   baixa da aba do aluno, da tela Financeiro do box ou das Cobranças. */

/**
 * @typedef {{ tipo: 'pagamento'|'pagamento-desfeito'|'lancamento', resumo: string,
 *   dados?: { mesId: string, valor?: number, soMensalidade?: boolean } }} EventoFinanceiro
 *   dados: o fato em campos (o mês, o valor) para quem ouve o barramento — a
 *   automação monta o recibo com eles. Não vai para o log: lá fica o resumo.
 */

/**
 * Baixa de uma fatura, com o valor que ela tinha na hora.
 * @param {string} mesId @param {number} total
 * @param {boolean} [soMensalidade] a fatura é só a mensalidade (sem consumo nem dependente)
 * @returns {EventoFinanceiro}
 */
export function eventoPagamento(mesId, total, soMensalidade = true) {
  return { tipo: 'pagamento', resumo: `Pagamento registrado · ${rotuloMesFin(mesId)} · ${brl(total)}`, dados: { mesId, valor: total, soMensalidade } };
}

/** Baixa desfeita. @param {string} mesId @returns {EventoFinanceiro} */
export function eventoPagamentoDesfeito(mesId) {
  return { tipo: 'pagamento-desfeito', resumo: `Pagamento desfeito · ${rotuloMesFin(mesId)}`, dados: { mesId } };
}

/**
 * Lançamento fora do catálogo (camiseta, aula experimental), já com a fatura
 * em que caiu — o coach que lançou no dia 25 entende por que não está no mês.
 * @param {{ nome: string, preco: number, mesId: string }} consumo @returns {EventoFinanceiro}
 */
export function eventoLancamento(consumo) {
  return { tipo: 'lancamento', resumo: `Lançamento avulso · ${consumo.nome} · ${brl(consumo.preco)} · fatura de ${rotuloMesFin(consumo.mesId)}` };
}
