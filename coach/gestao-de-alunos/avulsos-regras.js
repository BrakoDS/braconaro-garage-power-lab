// @ts-check
/**
 * O que entra no box sem ser mensalidade (Fase 1 · etapa 6.2, decisão 10): o
 * Day Pass (R$ 50 por treino, na lista do dia) e o CPF da aula experimental
 * (1 por CPF). E o caixa do mês: os avulsos (Day Pass pagos) e as devoluções
 * dos contratos encerrados antes do fim.
 *
 * Puro. O Day Pass e a aula experimental moram na mesma lista do dia
 * (`experimentais`, presenca-regras.js), com `tipo`. O CPF não é guardado: só
 * um código embaralhado dele (`codigoDoCpf`), no documento do box, para
 * conferir se já fez a aula.
 *
 * Etapa 6.4 (decisão 12): a VENDA A VISITANTE (sem ficha), paga na hora, mora
 * em `vendasAvulsas` no documento do box (dia → lista) — fora da lista do dia,
 * porque ali cada pessoa ocupa vaga numa turma. Ela entra nos avulsos do mês,
 * junto com o Day Pass. A compra paga na hora por um ALUNO fica na ficha dele
 * (`comprasNaHora`, financeiro-regras.js) e soma em "Vendas na hora".
 */
import { DAYPASS_VALOR } from '../../compartilhado/regras/planos.js';

/** Os meios de pagamento do Day Pass (na hora). */
export const MEIOS_DAYPASS = Object.freeze({ 'pix-chave': 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' });

/** Só os dígitos. @param {unknown} cpf */
export const digitosDoCpf = (cpf) => String(cpf ?? '').replace(/\D/g, '');

/**
 * O CPF é válido (11 dígitos, dígitos verificadores certos, não repetido)?
 * @param {unknown} cpf
 */
export function cpfValido(cpf) {
  const d = digitosDoCpf(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (/** @type {number} */ n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/**
 * O código do CPF: os 16 primeiros caracteres do SHA-256 dele. É o que fica
 * guardado — dá para conferir um CPF digitado, sem guardar o número.
 * @param {unknown} cpf @returns {Promise<string>}
 */
export async function codigoDoCpf(cpf) {
  const dados = new TextEncoder().encode(`garage-power-lab:${digitosDoCpf(cpf)}`);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * O dia em que esse CPF fez aula experimental, ou ''.
 * @param {Record<string, string>|undefined} registro código → dia @param {string} codigo
 */
export const experimentalJaFeita = (registro, codigo) => (registro && registro[codigo]) || '';

/**
 * O registro com o CPF de uma aula experimental marcada.
 * @param {Record<string, string>|undefined} registro @param {string} codigo @param {string} dia
 */
export const comCpf = (registro, codigo, dia) => ({ ...(registro || {}), [codigo]: dia });

/**
 * O Day Pass na lista do dia: nome, telefone e o pagamento na hora.
 * @param {{ nome: string, telefone?: string, meio: string, valor?: number, em: number }} d
 * @returns {{ dados: { nome: string, telefone: string, tipo: 'daypass', pagamento: { meio: string, valor: number, em: number } } } | { recusa: string }}
 */
export function dadosDoDayPass({ nome, telefone = '', meio, valor = DAYPASS_VALOR, em }) {
  const n = String(nome || '').trim();
  if (!n) return { recusa: 'Escreva o nome do visitante' };
  if (!MEIOS_DAYPASS[/** @type {'pix-chave'} */ (meio)]) return { recusa: 'Escolha como ele pagou o Day Pass' };
  const v = Number(valor);
  if (!(v > 0)) return { recusa: 'Valor do Day Pass inválido' };
  return { dados: { nome: n, telefone: String(telefone || '').trim(), tipo: 'daypass', pagamento: { meio, valor: v, em } } };
}

/**
 * O que a ficha nova guarda do Day Pass ("Virar aluno"): o dia e o valor, para
 * abater na 1ª mensalidade (planos.js).
 * @param {{ pagamento?: { valor?: number } }} x o Day Pass da lista @param {string} dia
 */
export const dayPassDaFicha = (x, dia) => ({ dia, valor: Number(x && x.pagamento && x.pagamento.valor) || DAYPASS_VALOR });

/**
 * Os avulsos de um mês: os Day Pass pagos nas listas dos dias daquele mês e,
 * desde a etapa 6.4, as vendas a visitantes (`vendas`, dia → lista).
 * @param {Record<string, any[]>|undefined} experimentais dia → lista @param {string} mesId
 * @param {Record<string, any[]>|undefined} [vendas] as vendas a visitantes, dia → lista
 * @returns {{ itens: { dia: string, nome: string, valor: number, meio: string, tipo: 'daypass'|'venda' }[], total: number }}
 */
export function avulsosDoMes(experimentais, mesId, vendas = {}) {
  /** @type {{ dia: string, nome: string, valor: number, meio: string, tipo: 'daypass'|'venda' }[]} */
  const itens = [];
  for (const [dia, lista] of Object.entries(experimentais || {})) {
    if (dia.slice(0, 7) !== mesId || !Array.isArray(lista)) continue;
    for (const x of lista) {
      if (!x || x.tipo !== 'daypass' || !x.pagamento || x.status === 'cancelada') continue;
      itens.push({ dia, nome: String(x.nome || ''), valor: Number(x.pagamento.valor) || 0, meio: String(x.pagamento.meio || ''), tipo: 'daypass' });
    }
  }
  for (const [dia, lista] of Object.entries(vendas || {})) {
    if (dia.slice(0, 7) !== mesId || !Array.isArray(lista)) continue;
    for (const v of lista) {
      if (!v || !(Number(v.valor) > 0)) continue;
      itens.push({ dia, nome: `${String(v.visitante || 'Visitante')} · ${qtdNome(v)}`, valor: Number(v.valor) || 0, meio: String(v.meio || ''), tipo: 'venda' });
    }
  }
  itens.sort((x, y) => (x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : 0));
  return { itens, total: Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
}

/**
 * As devoluções de contrato registradas num mês (pelo dia da devolução).
 * @param {any[]} fichas @param {string} mesId
 * @returns {{ itens: { alunoId: string, nome: string, valor: number, data: string, meio: string }[], total: number }}
 */
export function devolucoesDoMes(fichas, mesId) {
  const itens = [];
  for (const f of fichas || []) {
    for (const c of Array.isArray(f && f.contratos) ? f.contratos : []) {
      const d = c && c.devolucao;
      if (!d || typeof d.data !== 'string' || d.data.slice(0, 7) !== mesId) continue;
      itens.push({ alunoId: String(f.id), nome: String(f.nome || ''), valor: Number(d.valor) || 0, data: d.data, meio: String(d.meio || '') });
    }
  }
  return { itens, total: Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
}

/* ============================================================
   Etapa 6.4: a venda a visitante e as vendas na hora do mês
   ============================================================ */

/** "2 × Água" (ou só "Água"). @param {{ nome?: string, qtd?: number }} v */
const qtdNome = (v) => ((Number(v.qtd) || 1) > 1 ? `${Number(v.qtd)} × ${String(v.nome || 'Produto')}` : String(v.nome || 'Produto'));

/** Por quantos dias a venda a visitante fica no documento do box (o teto dele é 1 MB). */
export const DIAS_DE_VENDAS_AVULSAS = 400;

/**
 * A venda a um visitante, paga na hora: quem comprou, o produto, a quantidade e
 * o meio. O preço do item é o da unidade; o valor é o total.
 * @param {{ visitante: string, item: { nome: string, preco: number|string, produtoId?: string, qtd?: number|string }, meio: string, em: number, id: string }} d
 * @returns {{ dados: { id: string, visitante: string, nome: string, qtd: number, unitario: number, valor: number, meio: string, em: number, produtoId?: string } } | { recusa: string }}
 */
export function dadosDaVendaAvulsa({ visitante, item, meio, em, id }) {
  const quem = String(visitante || '').trim();
  if (!quem) return { recusa: 'Escreva o nome do visitante' };
  if (!MEIOS_DAYPASS[/** @type {'pix-chave'} */ (meio)]) return { recusa: 'Escolha como ele pagou' };
  const nome = String((item && item.nome) || '').trim();
  const unitario = Math.round((parseFloat(String(item && item.preco != null ? item.preco : '').replace(',', '.')) || 0) * 100) / 100;
  if (!nome || !(unitario > 0)) return { recusa: 'Escolha o produto' };
  const q = parseInt(String(item && item.qtd != null ? item.qtd : 1), 10);
  const qtd = Number.isFinite(q) ? Math.min(99, Math.max(1, q)) : 1;
  return {
    dados: {
      id, visitante: quem, nome, qtd, unitario, valor: Math.round(unitario * qtd * 100) / 100, meio, em,
      ...(item.produtoId ? { produtoId: item.produtoId } : {}),
    },
  };
}

/**
 * As vendas a visitantes com uma a mais no dia, sem os dias velhos.
 * @param {Record<string, any[]>|undefined} vendas @param {string} dia @param {any} venda @param {string} hojeIso
 * @returns {Record<string, any[]>}
 */
export function comVendaAvulsa(vendas, dia, venda, hojeIso) {
  const limite = diaMenos(hojeIso, DIAS_DE_VENDAS_AVULSAS);
  /** @type {Record<string, any[]>} */ const out = {};
  for (const [d, lista] of Object.entries(vendas || {})) if (d >= limite && Array.isArray(lista)) out[d] = lista;
  out[dia] = [...(out[dia] || []), venda];
  return out;
}

/**
 * As vendas a visitantes sem a venda `id` do dia. null: não há essa venda.
 * @param {Record<string, any[]>|undefined} vendas @param {string} dia @param {string} id
 * @returns {Record<string, any[]> | null}
 */
export function semVendaAvulsa(vendas, dia, id) {
  const lista = (vendas || {})[dia];
  if (!Array.isArray(lista) || !lista.some((v) => v && v.id === id)) return null;
  const resto = lista.filter((v) => !(v && v.id === id));
  /** @type {Record<string, any[]>} */ const out = { ...(vendas || {}) };
  if (resto.length) out[dia] = resto; else delete out[dia];
  return out;
}

/** 'AAAA-MM-DD' menos n dias. @param {string} iso @param {number} n */
function diaMenos(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

/**
 * As compras pagas na hora pelos ALUNOS num mês (pela data da compra) — a
 * linha "Vendas na hora" do Financeiro e do retrato.
 * @param {any[]} fichas @param {string} mesId
 * @returns {{ itens: { alunoId: string, nome: string, descricao: string, valor: number, meio: string, data: string }[], total: number }}
 */
export function comprasNaHoraDoMes(fichas, mesId) {
  const itens = [];
  for (const f of fichas || []) {
    for (const c of Array.isArray(f && f.comprasNaHora) ? f.comprasNaHora : []) {
      if (!c || typeof c.data !== 'string' || c.data.slice(0, 7) !== mesId) continue;
      itens.push({ alunoId: String(f.id), nome: String(f.nome || ''), descricao: qtdNome(c), valor: Number(c.valor) || 0, meio: String(c.meio || ''), data: c.data });
    }
  }
  itens.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
  return { itens, total: Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
}
