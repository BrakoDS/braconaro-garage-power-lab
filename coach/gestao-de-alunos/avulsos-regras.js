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
 * Os avulsos de um mês: os Day Pass pagos nas listas dos dias daquele mês.
 * @param {Record<string, any[]>|undefined} experimentais dia → lista @param {string} mesId
 * @returns {{ itens: { dia: string, nome: string, valor: number, meio: string }[], total: number }}
 */
export function avulsosDoMes(experimentais, mesId) {
  const itens = [];
  for (const [dia, lista] of Object.entries(experimentais || {})) {
    if (dia.slice(0, 7) !== mesId || !Array.isArray(lista)) continue;
    for (const x of lista) {
      if (!x || x.tipo !== 'daypass' || !x.pagamento || x.status === 'cancelada') continue;
      itens.push({ dia, nome: String(x.nome || ''), valor: Number(x.pagamento.valor) || 0, meio: String(x.pagamento.meio || '') });
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
