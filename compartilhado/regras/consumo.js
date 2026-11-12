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
 * Desde 01/12/2026 (decisão 12 do ESCOPO, etapa 6.4): o consumo do mês INTEIRO
 * entra na fatura do mês seguinte. O que foi comprado de 1 a 31/12 vai para a
 * fatura de janeiro, que vence no dia 10/01, numa linha separada da mensalidade
 * de janeiro — é o que a mensagem do dia 1 mostra ("o consumo do mês que acabou
 * e a mensalidade do mês que começa").
 *
 * Antes disso, o corte era o dia do vencimento. Com vencimento no dia 10, o que
 * foi consumido até o dia 10 entrou na fatura daquele mês; do dia 11 em diante
 * caiu na do mês seguinte. A venda antiga já está carimbada, então nada muda nela.
 *
 * O ciclo é CARIMBADO na hora da venda (`mesId` fica gravado no consumo), e não
 * recalculado depois. Duas razões: a fatura de um mês fechado não pode mudar de
 * conteúdo quando alguém mexe no dia de vencimento do aluno, e o preço do
 * produto vai junto — energético que custava 10 continua valendo 10 na notinha
 * de agosto depois de virar 12.
 */
import { mensalidadeDoMes } from './planos.js';

/** O dia de vencimento válido para um mês (fevereiro não tem dia 31). */
function diaVencimentoNoMes(ano, mes, dia) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return Math.min(Math.max(1, parseInt(String(dia), 10) || 10), ultimoDia);
}

/** A venda deste dia em diante vai, com o mês inteiro, para a fatura seguinte (decisão 12). */
export const CORTE_MES_INTEIRO_DESDE = '2026-12-01';

/**
 * A fatura ('YYYY-MM') a que um consumo pertence, pela data.
 * @param {string} dataIso 'YYYY-MM-DD' da venda
 * @param {number|string} diaVencimento dia do mês em que a mensalidade vence (só a venda antiga usa)
 * @returns {string} 'YYYY-MM'
 */
export function mesIdDoConsumo(dataIso, diaVencimento) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  if (dataIso >= CORTE_MES_INTEIRO_DESDE) return proximoMes(`${ano}-${String(mes).padStart(2, '0')}`);
  const corte = diaVencimentoNoMes(ano, mes, diaVencimento);
  if (dia <= corte) return `${ano}-${String(mes).padStart(2, '0')}`;
  const d = new Date(ano, mes, 1); // mes é 1-based, então isto já é o mês seguinte
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** O mês seguinte a um 'YYYY-MM'. */
export function proximoMes(mesId) {
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

/*
 * QUANTIDADE (etapa 6.4). Um lançamento pode ter várias unidades: `qtd` e
 * `unitario`, e `preco` é o TOTAL da linha (qtd × unitario). Quem só soma
 * `preco` — o app que ainda não recebeu a atualização, o Pix, o retrato — chega
 * no valor certo sem saber da quantidade. O lançamento antigo não tem `qtd`: é 1.
 */

/** Quantas unidades o lançamento tem. @param {any} c */
export const qtdDoConsumo = (c) => Math.max(1, parseInt(c && c.qtd, 10) || 1);

/** O preço de uma unidade: o gravado, ou o total ÷ a quantidade. @param {any} c */
export function unitarioDoConsumo(c) {
  const u = Number(c && c.unitario);
  return u > 0 ? u : Math.round(((Number(c && c.preco) || 0) / qtdDoConsumo(c)) * 100) / 100;
}

/** "12 × Energético" (ou só "Energético"). @param {any} c */
export function nomeComQtd(c) {
  const q = qtdDoConsumo(c), nome = String((c && c.nome) || 'Consumo');
  return q > 1 ? `${q} × ${nome}` : nome;
}

/**
 * A notinha do aluno: os itens IGUAIS (mesmo nome, mesmo preço da unidade e
 * mesmo dia) numa linha só — os 12 energéticos lançados um a um antes da
 * quantidade viram "12 × Energético". Só agrupa na tela: nada é regravado.
 * @param {any[]} [consumos] os de uma fatura (consumosDoMes)
 * @returns {{ chave: string, nome: string, data: string, qtd: number, unitario: number, total: number, ids: string[] }[]}
 */
export function linhasDaNotinha(consumos) {
  /** @type {Map<string, { chave: string, nome: string, data: string, qtd: number, unitario: number, total: number, ids: string[] }>} */
  const por = new Map();
  for (const c of consumos || []) {
    if (!c) continue;
    const nome = String(c.nome || 'Consumo'), data = String(c.data || ''), unitario = unitarioDoConsumo(c);
    const chave = `${data}|${nome}|${Math.round(unitario * 100)}`;
    const l = por.get(chave);
    if (l) {
      l.qtd += qtdDoConsumo(c);
      l.total = centavos(l.total + (Number(c.preco) || 0));
      if (c.id) l.ids.push(String(c.id));
    } else {
      por.set(chave, { chave, nome, data, qtd: qtdDoConsumo(c), unitario, total: centavos(Number(c.preco) || 0), ids: c.id ? [String(c.id)] : [] });
    }
  }
  return [...por.values()];
}

/** Os descontos de parceria que o box oferece. */
export const PERCENTUAIS_PARCERIA = [10, 25, 50, 100];

/** Arredonda para centavos — 171 × 25% dá 42,75 e não 42,749999. */
const centavos = (v) => Math.round(v * 100) / 100;

/**
 * O desconto de parceria de um aluno, em reais.
 *
 * A mensalidade CHEIA continua cadastrada na ficha: zerar o valor daria a conta
 * certa e apagaria a informação: o box deixaria de saber quanto investe em cada
 * parceria. O desconto é derivado do percentual, então mudar o preço do plano
 * recalcula o investimento sozinho.
 *
 * @param {any} aluno @returns {{nome:string, percentual:number, valor:number}|null}
 */
export function descontoParceria(aluno) {
  const p = aluno && aluno.parceria;
  const pct = Number(p && p.percentual) || 0;
  if (!pct) return null;
  const cheia = Number(String(aluno?.mensalidade ?? '').replace(',', '.')) || 0;
  return { nome: (p.nome || '').trim(), percentual: pct, valor: centavos(cheia * pct / 100) };
}

/**
 * A conta fechada de uma fatura: a mensalidade do mês mais os consumíveis.
 *
 * O valor da mensalidade sai do plano (`mensalidadeDoMes`, planos.js): a tabela
 * de 2027, a parceria antiga, os bônus, a cortesia, a pausa e a regra das
 * semanas. Ficha sem nada disso dá o mesmo de sempre: a mensalidade dela, menos
 * a parceria. `mensalidadeCheia` é o preço do plano no mês; `desconto`, a
 * diferença até o que ele paga.
 *
 * O desconto vale só sobre o PLANO. Consumível é mercadoria comprada no balcão —
 * a parceria dá acesso ao treino, não energético de graça.
 *
 * @param {any} aluno a ficha (ou a fatia do Portal) @param {string} mesId
 * @returns {{mensalidadeCheia:number, desconto:number, parceria:any, mensalidade:number,
 *            consumos:any[], extras:number, total:number}}
 */
export function faturaDoMes(aluno, mesId) {
  const m = mensalidadeDoMes(aluno, mesId);
  const consumos = consumosDoMes(aluno?.consumos, mesId);
  const extras = centavos(consumos.reduce((s, c) => s + (Number(c.preco) || 0), 0));
  return {
    mensalidadeCheia: m.cheia, desconto: m.desconto, parceria: m.parceria, mensalidade: m.valor,
    consumos, extras, total: centavos(m.valor + extras),
  };
}

/* ============================================================
   Quem paga a conta de quem

   Um aluno pode ter a conta acertada por outro — o pai que paga a mensalidade do
   filho, o casal em que um resolve os dois. O vínculo mora na ficha do DEPENDENTE
   (`pagoPor: { id, escopo }`), e não na do responsável: um responsável pode ter
   vários dependentes, e cada dependente tem no máximo um pagador. Guardando do
   lado de cá, a lista nunca fica com duas versões da verdade.

   O escopo decide o que o responsável cobre:
     'plano'  só a mensalidade — o que o dependente consumir no box é dele.
     'tudo'   mensalidade e consumíveis.
   ============================================================ */

/**
 * O pedaço da conta de um aluno que o responsável assume.
 * @param {any} aluno @param {string} mesId
 * @param {'plano'|'tudo'|''} [escopo] o do próprio aluno, quando não informado
 * @returns {{mensalidade:number, consumos:any[], extras:number, total:number}}
 */
export function parteCoberta(aluno, mesId, escopo) {
  const esc = escopo !== undefined ? escopo : (aluno && aluno.pagoPor && aluno.pagoPor.escopo);
  const vazia = { mensalidade: 0, consumos: [], extras: 0, total: 0 };
  if (!esc) return vazia;
  const f = faturaDoMes(aluno, mesId);
  if (esc === 'tudo') return f;
  return { mensalidade: f.mensalidade, consumos: [], extras: 0, total: f.mensalidade };
}

/**
 * O que o próprio aluno ainda deve, já descontado o que o responsável cobre.
 * Sem responsável, é a conta inteira.
 * @param {any} aluno @param {string} mesId
 */
export function faturaPropria(aluno, mesId) {
  const f = faturaDoMes(aluno, mesId);
  const esc = aluno && aluno.pagoPor && aluno.pagoPor.escopo;
  if (!esc) return f;
  if (esc === 'tudo') return { mensalidade: 0, consumos: [], extras: 0, total: 0 };
  // 'plano': a mensalidade é do responsável, o consumo continua sendo dele.
  return { mensalidade: 0, consumos: f.consumos, extras: f.extras, total: f.extras };
}

/**
 * A conta fechada de um responsável: a dele mais o que cobre dos dependentes.
 *
 * `dependentes` chega pronto dos dois lados — no painel do coach vem da lista de
 * alunos, no Portal vem publicado na fatia do responsável, porque lá ele não tem
 * acesso à ficha de mais ninguém.
 *
 * @param {any} aluno @param {string} mesId
 * @param {any[]} [dependentes] fichas (ou fatias) de quem ele paga
 */
export function faturaComDependentes(aluno, mesId, dependentes = []) {
  const propria = faturaPropria(aluno, mesId);
  const cobertos = dependentes.map((d) => {
    const escopo = (d.pagoPor && d.pagoPor.escopo) || d.escopo || 'tudo';
    return { nome: d.nome || '', escopo, ...parteCoberta(d, mesId, escopo) };
  }).filter((d) => d.total > 0 || d.consumos.length);
  return {
    propria, dependentes: cobertos,
    // Somar valores já arredondados reintroduz o erro do ponto flutuante
    // (89,91 + 9,99 = 99,899999…). Este total vai para o Pix, então volta ao
    // centavo aqui em vez de depender do toFixed lá na ponta.
    total: centavos(propria.total + cobertos.reduce((s, d) => s + d.total, 0)),
  };
}
