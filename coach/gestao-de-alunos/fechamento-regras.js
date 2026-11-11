// @ts-check
/**
 * O FECHAMENTO DO MÊS — o retrato gravado da cobrança (Fase 1 · etapa 4,
 * PLANO-FASE1-ETAPA4.md). Puro: recebe as fichas, o mês e o relógio, e devolve
 * o retrato, os totais, as divergências e o que gravar. Não lê nem grava nada.
 *
 * Por que existe: a conta de um mês é CALCULADA na hora a partir da ficha
 * (`contaDoMes`). Mudar a mensalidade ou a parceria de um aluno mudaria também
 * os meses que já passaram. O coach fecha o mês (com a prévia na tela
 * Financeiro), aprova, e a partir daí o mês é desenhado pelo RETRATO, gravado em
 * `gestao/{uid}/fechamentos/{AAAA-MM}`.
 *
 * O que o retrato guarda de cada aluno: os itens da fatura como a Gestão os
 * desenhava na hora (mensalidade, consumos, contas dos dependentes), o total, o
 * vencimento, a situação NA HORA DE FECHAR e o registro do pagamento (etapa 3).
 * Um pagamento que chega depois não reescreve o retrato: a fatura fechada mostra
 * "pago depois", a partir da ficha.
 *
 * Decisões de 10/11/2026 (ESCOPO.md, decisão 7): começa por outubro de 2026;
 * cortesia paga o consumo (como a conta já faz); o mês fechado pode ser reaberto,
 * com motivo, e a versão anterior fica guardada.
 */
import { contaDoMes, faturaDoAluno, rotuloMesFin, brl, mesesDoHistorico } from './financeiro-aluno.js?v=37';
import { parteCoberta } from '../../compartilhado/regras/consumo.js';
import { mensalidadeDoMes } from '../../compartilhado/regras/planos.js';

/** O primeiro mês que pode ser fechado (julho a setembro ficam de fora: sem data de início, apareceriam dívidas que não existem). */
export const FECHAMENTO_DESDE = '2026-10';

const centavos = (/** @type {number} */ v) => Math.round((Number(v) || 0) * 100);
const reais = (/** @type {number} */ c) => c / 100;
const ativo = (/** @type {any} */ a) => (a.status || 'ativo') !== 'inativo';

/**
 * @typedef {import('./financeiro-aluno.js').Fatura} Fatura
 * @typedef {import('./financeiro-aluno.js').Recebimento} Recebimento
 * @typedef {{
 *   nome: string, itens: Fatura['itens'], total: number, vencimento: string,
 *   situacao: Fatura['status'], pagavel: boolean, responsavel: { alunoId: string, nome: string } | null,
 *   mensalidadeCheia: number, desconto: number, parceria: { nome: string, percentual: number } | null,
 *   consumo: number, dependentes: { alunoId: string, nome: string, total: number }[],
 *   recebimento: Recebimento | null, investimento?: number,
 * }} LinhaDoRetrato
 *   investimento: o que o box banca (etapa 6.1); retrato antigo não tem e usa o `desconto`
 * @typedef {{ previsto: number, recebido: number, emAberto: number, consumo: number, bancadoPeloBox: number }} TotaisDoRetrato
 * @typedef {{ tipo: 'em-aberto'|'valor-diferente'|'sem-registro', alunoId: string, nome: string, total: number, valor?: number }} Divergencia
 * @typedef {{ mesId: string, linhas: Record<string, LinhaDoRetrato>, totais: TotaisDoRetrato, divergencias: Divergencia[] }} Retrato
 * @typedef {Retrato & { situacao: 'aprovado'|'reaberto', aprovadoEm: number, aprovadoPor: 'coach',
 *   reabertoEm?: number, motivoReabertura?: string, versoes: any[] }} Fechamento
 */

/** O mês já acabou e está na faixa que se fecha? @param {string} mesId @param {string} hojeIso */
export function podeFechar(mesId, hojeIso) {
  return /^\d{4}-\d{2}$/.test(mesId) && mesId >= FECHAMENTO_DESDE && mesId < hojeIso.slice(0, 7);
}

/** O documento é de um mês FECHADO (aprovado e não reaberto)? @param {any} doc */
export const estaFechado = (doc) => !!doc && doc.situacao === 'aprovado';

/**
 * Quem entra no retrato do mês: o aluno ativo com conta no mês e, também, quem
 * saiu mas teve movimento nele (pagou ou consumiu).
 * @param {any} a @param {string} mesId
 */
export function entraNoRetrato(a, mesId) {
  if (ativo(a)) return true;
  return !!((a.pagamentos || {})[mesId]) || (a.consumos || []).some((/** @type {any} */ c) => c && c.mesId === mesId);
}

/**
 * A linha de um aluno no retrato, ou null quando ele não tem conta no mês.
 * @param {any} a @param {string} mesId @param {any[]} todos @param {string} hojeIso
 * @returns {LinhaDoRetrato | null}
 */
export function linhaDoRetrato(a, mesId, todos, hojeIso) {
  if (!entraNoRetrato(a, mesId)) return null;
  // Quem saiu também precisa da própria conta (contaDoMes só olha os ativos para os vínculos).
  const fatura = faturaDoAluno(a, mesId, todos, hojeIso);
  if (!fatura) return null;
  const { resp, deps, propria } = contaDoMes(a, mesId, todos);
  const dependentes = deps.map((d) => {
    const escopo = (d.pagoPor && d.pagoPor.escopo) || 'tudo';
    return { alunoId: String(d.id), nome: String(d.nome || ''), total: parteCoberta(d, mesId, escopo).total };
  }).filter((d) => d.total > 0);
  return {
    nome: String(a.nome || ''),
    itens: fatura.itens.map((i) => ({ ...i })),
    total: fatura.total,
    vencimento: fatura.vencimento,
    situacao: fatura.status,
    pagavel: fatura.pagavel,
    responsavel: resp ? { alunoId: String(resp.id), nome: String(resp.nome || resp.id) } : null,
    mensalidadeCheia: propria.mensalidadeCheia,
    desconto: propria.desconto,
    investimento: mensalidadeDoMes(a, mesId).investimento,
    parceria: propria.parceria ? { nome: propria.parceria.nome, percentual: propria.parceria.percentual } : null,
    consumo: propria.extras,
    dependentes,
    recebimento: fatura.status === 'pago' ? (((a.recebimentos || {})[mesId]) || null) : null,
  };
}

/** Os totais do retrato. @param {Record<string, LinhaDoRetrato>} linhas @returns {TotaisDoRetrato} */
export function totaisDoRetrato(linhas) {
  let previsto = 0, recebido = 0, consumo = 0, banca = 0;
  for (const l of Object.values(linhas)) {
    if (l.pagavel) previsto += centavos(l.total);
    if (l.pagavel && l.situacao === 'pago') recebido += centavos(l.total);
    consumo += centavos(l.consumo);
    // Retrato aprovado antes da etapa 6.1 não tem `investimento`: o desconto era só a parceria.
    banca += centavos(typeof l.investimento === 'number' ? l.investimento : l.desconto);
  }
  return { previsto: reais(previsto), recebido: reais(recebido), emAberto: reais(previsto - recebido), consumo: reais(consumo), bancadoPeloBox: reais(banca) };
}

/**
 * O que o coach confere antes de aprovar: quem está em aberto, quem pagou um
 * valor diferente da conta e quem está pago sem o registro detalhado.
 * @param {Record<string, LinhaDoRetrato>} linhas @returns {Divergencia[]}
 */
export function divergenciasDoRetrato(linhas) {
  /** @type {Divergencia[]} */ const out = [];
  for (const [alunoId, l] of Object.entries(linhas)) {
    if (!l.pagavel) continue;
    if (l.situacao !== 'pago') out.push({ tipo: 'em-aberto', alunoId, nome: l.nome, total: l.total });
    else if (!l.recebimento) out.push({ tipo: 'sem-registro', alunoId, nome: l.nome, total: l.total });
    else if (centavos(l.recebimento.valor) !== centavos(l.total)) out.push({ tipo: 'valor-diferente', alunoId, nome: l.nome, total: l.total, valor: l.recebimento.valor });
  }
  const ordem = { 'em-aberto': 0, 'valor-diferente': 1, 'sem-registro': 2 };
  return out.sort((x, y) => ordem[x.tipo] - ordem[y.tipo] || x.nome.localeCompare(y.nome, 'pt-BR'));
}

/**
 * O retrato do mês — a prévia que a tela mostra antes da aprovação.
 * @param {any[]} todos @param {string} mesId @param {string} hojeIso
 * @param {{ avulsos: { itens: any[], total: number }, devolucoes: { itens: any[], total: number } } | null} [extras]
 *   os avulsos (Day Pass) e as devoluções do mês (avulsos-regras.js), etapa 6.2
 * @returns {Retrato}
 */
export function retratoDoMes(todos, mesId, hojeIso, extras = null) {
  /** @type {Record<string, LinhaDoRetrato>} */ const linhas = {};
  for (const a of todos) {
    const l = linhaDoRetrato(a, mesId, todos, hojeIso);
    if (l) linhas[String(a.id)] = l;
  }
  const retrato = { mesId, linhas, totais: totaisDoRetrato(linhas), divergencias: divergenciasDoRetrato(linhas) };
  // Etapa 6.2: o Day Pass pago (avulsos) e as devoluções de contrato do mês, fora das linhas dos alunos.
  if (!extras) return retrato;
  return {
    ...retrato,
    avulsos: extras.avulsos.itens, devolucoes: extras.devolucoes.itens,
    totais: { ...retrato.totais, avulsos: extras.avulsos.total, devolucoes: extras.devolucoes.total },
  };
}

/**
 * APROVAR — o documento a gravar e a linha dos Registros. As versões de uma
 * reabertura anterior seguem junto.
 * @param {Retrato} retrato @param {any} anterior o documento que já existia (reaberto), ou null
 * @param {number} agora
 * @returns {{ doc: Fechamento, log: { tipo: 'fechamento', resumo: string } }}
 */
export function aprovarFechamento(retrato, anterior, agora) {
  const t = retrato.totais;
  return {
    doc: {
      ...retrato, situacao: 'aprovado', aprovadoEm: agora, aprovadoPor: 'coach',
      versoes: Array.isArray(anterior && anterior.versoes) ? anterior.versoes : [],
    },
    log: {
      tipo: 'fechamento',
      resumo: `Fechamento de ${rotuloMesFin(retrato.mesId)} aprovado · previsto ${brl(t.previsto)} · recebido ${brl(t.recebido)} · em aberto ${brl(t.emAberto)}`,
    },
  };
}

/**
 * REABRIR — com motivo. A aprovação de agora vai para `versoes` (com as linhas
 * e os totais), e o mês volta a ser calculado pela ficha até a próxima
 * aprovação. null: o mês não está fechado, ou o motivo está vazio.
 * @param {any} doc @param {string} motivo @param {number} agora
 * @returns {{ doc: Fechamento, log: { tipo: 'fechamento', resumo: string } } | null}
 */
export function reabrirFechamento(doc, motivo, agora) {
  const m = String(motivo || '').trim();
  if (!estaFechado(doc) || !m) return null;
  const versao = { aprovadoEm: doc.aprovadoEm, reabertoEm: agora, motivo: m, totais: doc.totais, linhas: doc.linhas };
  return {
    doc: { ...doc, situacao: 'reaberto', reabertoEm: agora, motivoReabertura: m, versoes: [...(Array.isArray(doc.versoes) ? doc.versoes : []), versao] },
    log: { tipo: 'fechamento', resumo: `Fechamento de ${rotuloMesFin(doc.mesId)} reaberto · ${m}` },
  };
}

/**
 * A fatura de um aluno num mês FECHADO, desenhada pelo retrato — com o
 * pagamento de AGORA (a ficha): quem pagou depois aparece pago, com
 * `pagoDepois`. null: o mês não está fechado, ou o aluno não está no retrato.
 * @param {any} doc o fechamento @param {any} a a ficha
 * @returns {(Fatura & { fechadoEm: number, pagoDepois: boolean }) | null}
 */
export function faturaFechada(doc, a) {
  if (!estaFechado(doc) || !a) return null;
  const l = doc.linhas && doc.linhas[String(a.id)];
  if (!l) return null;
  const mesId = doc.mesId;
  const pagoAgora = !!((a.pagamentos || {})[mesId]);
  /** @type {Fatura['status']} */
  const status = !l.pagavel ? l.situacao : pagoAgora ? 'pago' : (l.situacao === 'pago' ? 'vencido' : l.situacao);
  return {
    mesId, rotulo: rotuloMesFin(mesId), vencimento: l.vencimento, itens: (l.itens || []).map((/** @type {any} */ i) => ({ ...i })),
    total: l.total, status, pagavel: !!l.pagavel,
    ...(l.responsavel ? { responsavel: l.responsavel.nome } : {}),
    ...(status === 'pago' ? { recebimento: ((a.recebimentos || {})[mesId]) || null } : {}),
    fechadoEm: doc.aprovadoEm, pagoDepois: pagoAgora && l.situacao !== 'pago',
  };
}

/**
 * A fatura do mês: pelo retrato, se o mês está fechado e o aluno está nele;
 * senão, calculada pela ficha, como sempre.
 * @param {any} a @param {string} mesId @param {any[]} todos @param {string} hojeIso
 * @param {Record<string, any>} [fechamentos] os documentos de fechamento, por mês
 */
export function faturaComFechamento(a, mesId, todos, hojeIso, fechamentos = {}) {
  return faturaFechada(fechamentos[mesId], a) || faturaDoAluno(a, mesId, todos, hojeIso);
}

/**
 * O histórico de faturas do aluno com os meses fechados pelo retrato — o mesmo
 * formato de `historicoFinanceiro`.
 * @param {any} a @param {any[]} todos @param {string} hojeIso @param {Record<string, any>} [fechamentos] @param {number} [max]
 */
export function historicoComFechamentos(a, todos, hojeIso, fechamentos = {}, max = 12) {
  const { meses, temMais } = mesesDoHistorico(a, hojeIso, max);
  const faturas = /** @type {Fatura[]} */ (meses.map((m) => faturaComFechamento(a, m, todos, hojeIso, fechamentos)).filter(Boolean));
  const emAberto = faturas.filter((f) => f.status === 'vencido' || f.status === 'pendente').reduce((s, f) => s + centavos(f.total), 0);
  const atrasado = faturas.filter((f) => f.status === 'vencido').reduce((s, f) => s + centavos(f.total), 0);
  return { faturas, temMais, emAberto: reais(emAberto), atrasado: reais(atrasado) };
}

/**
 * O mapa que o lançamento de consumo usa para pular faturas (`mesIdParaLancar`):
 * os meses pagos e, também, os meses FECHADOS — consumo com data num mês fechado
 * vai para a próxima fatura aberta, como já acontece com a fatura paga.
 * @param {any} a @param {Record<string, any>} [fechamentos]
 * @returns {Record<string, boolean>}
 */
export function pagamentosParaLancar(a, fechamentos = {}) {
  const out = { ...((a && a.pagamentos) || {}) };
  for (const [mesId, doc] of Object.entries(fechamentos)) if (estaFechado(doc)) out[mesId] = true;
  return out;
}

/**
 * O total que o Pix cobra de um mês FECHADO que estava em aberto: o do retrato.
 * null quando o mês não está fechado, o aluno não está no retrato ou a linha não
 * é pagável — aí vale a conta calculada, como sempre.
 * @param {any} doc o fechamento @param {string} alunoId
 */
export function totalDoMesFechado(doc, alunoId) {
  if (!estaFechado(doc)) return null;
  const l = doc.linhas && doc.linhas[String(alunoId)];
  return l && l.pagavel ? l.total : null;
}
