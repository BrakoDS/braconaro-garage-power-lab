// @ts-check
/**
 * Os contratos trimestral e semestral (Fase 1 · etapa 6.2, decisão 10):
 * fechar, trancar, encerrar antes, registrar a devolução, renovar e passar
 * para o mensal.
 *
 * Puro, como o cadastro-regras.js: devolve o que gravar (`patch`) e a linha do
 * log, ou `{ recusa }`. O valor de cada mês sai do compartilhado/regras/planos.js.
 *
 *   contratos  [{ id, prazo, vezes, inicio: 'AAAA-MM', valorMensal, pctBonus, total,
 *                 saida?: { ultimoMes, mesesQueFaltam, valorQueFalta, multa, devolucao, motivo, em },
 *                 devolucao?: { valor, data, meio, registradoEm } }]
 *   O trancamento é uma pausa (`pausas`) com `contrato: id` — a mesma da 6.1:
 *   sai das turmas, congela os créditos, e o Voltar fecha.
 */
import {
  PRAZO_MESES, LIMITE_TRANCAMENTO, MULTA_SAIDA_PCT, VIGENCIA_2027,
  contratosDe, contratoNoMes, fimDoContrato, diasTrancados, precoDoContrato, somarMeses, pausaAtual, mesCurto,
  ultimoDiaDoMes, somarDiasIso,
} from '../../compartilhado/regras/planos.js';
import { pausar } from './cadastro-regras.js?v=37';

const ehMes = (/** @type {any} */ m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const ehDia = (/** @type {any} */ d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const centavos = (/** @type {number} */ v) => Math.round(v * 100) / 100;
const brl = (/** @type {number} */ v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const ddmm = (/** @type {string} */ d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Meses de `de` até `ate` (ate − de). @param {string} de @param {string} ate */
function mesesEntre(de, ate) {
  const [a1, m1] = de.split('-').map(Number), [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** O contrato que cobre (ou começa) num mês, ou null. @param {any} a @param {string} mesId */
export function contratoEmCurso(a, mesId) {
  const cm = contratoNoMes(a, mesId);
  return cm && cm.papel !== 'extensao' ? cm.c : null;
}

/**
 * Fecha um contrato: o prazo e o 1º mês (sempre a fatura de um mês inteiro).
 * @param {any} a @param {{ prazo: 'trimestral'|'semestral', inicio: string, id: string, hojeIso: string }} o
 */
export function fecharContrato(a, { prazo, inicio, id, hojeIso }) {
  if (!PRAZO_MESES[prazo]) return { recusa: 'Escolha trimestral ou semestral.' };
  if (!ehMes(inicio)) return { recusa: 'Escolha o 1º mês do contrato.' };
  if (inicio < VIGENCIA_2027) return { recusa: `Os contratos começam a partir de ${mesCurto(VIGENCIA_2027)}, com as tabelas novas.` };
  if (inicio < hojeIso.slice(0, 7)) return { recusa: 'O contrato não pode começar num mês que já passou.' };
  if (!a.plano) return { recusa: 'Defina o plano do aluno (as vezes por semana) antes do contrato.' };
  const preco = precoDoContrato(a, prazo, inicio);
  if (!preco) return { recusa: `A tabela ${a.fundador === true ? 'de fundadores' : 'regular'} não tem esse plano no ${prazo}.` };
  const meses = PRAZO_MESES[prazo];
  for (let i = 0; i < meses; i++) {
    const outro = contratoEmCurso(a, somarMeses(inicio, i));
    if (outro) return { recusa: `Já há um contrato ${outro.prazo} cobrindo ${mesCurto(somarMeses(inicio, i))}.` };
  }
  const c = { id, prazo, vezes: a.plano.vezes, inicio, ...preco };
  const fim = somarMeses(inicio, meses - 1);
  return {
    patch: { contratos: [...contratosDe(a), c], plano: { ...a.plano, prazo } },
    log: { tipo: 'contrato', resumo: `Contrato ${prazo} de ${mesCurto(inicio)} a ${mesCurto(fim)}: ${brl(preco.total)} de uma vez${preco.pctBonus ? ` (bônus ${preco.pctBonus}%)` : ''}` },
  };
}

/**
 * O que ainda dá para trancar no contrato.
 * @param {any} a @param {any} c
 * @returns {{ periodosUsados: number, periodos: number, diasPorPeriodo: number, diasUsados: number }}
 */
export function trancamentoDoContrato(a, c) {
  const lim = LIMITE_TRANCAMENTO[/** @type {'trimestral'} */ (c.prazo)];
  const usados = ((a.pausas) || []).filter((/** @type {any} */ p) => p && p.contrato === c.id).length;
  return { periodosUsados: usados, periodos: lim.periodos, diasPorPeriodo: lim.dias, diasUsados: diasTrancados(a, c) };
}

/**
 * Tranca o contrato em curso a partir de `desde`: uma pausa ligada a ele.
 * Cada período estica o contrato em até 15 dias; o que passar disso é pausa sem esticar.
 * @param {any} a @param {{ desde: string, motivo?: string }} o
 */
export function trancar(a, { desde, motivo = '' }) {
  if (!ehDia(desde)) return { recusa: 'Escolha o dia em que o trancamento começa.' };
  const c = contratoEmCurso(a, desde.slice(0, 7));
  if (!c) return { recusa: 'Não há contrato cobrindo esse mês: use Pausar.' };
  const t = trancamentoDoContrato(a, c);
  if (t.periodosUsados >= t.periodos) return { recusa: `O contrato ${c.prazo} já usou ${t.periodos === 1 ? 'o trancamento' : `os ${t.periodos} trancamentos`}.` };
  const r = pausar(a, { desde, motivo });
  if ('recusa' in r) return r;
  const pausas = r.patch.pausas.map((/** @type {any} */ p, /** @type {number} */ i) => (i === r.patch.pausas.length - 1 ? { ...p, contrato: c.id } : p));
  return {
    patch: { ...r.patch, pausas },
    log: { tipo: 'pausa', resumo: `Contrato ${c.prazo} trancado desde ${ddmm(desde)} (até ${t.diasPorPeriodo} dias esticam o contrato)`, extra: r.log.extra },
  };
}

/**
 * A conta da saída antes do fim: os meses depois do último que faltam, a multa
 * (20%) e a devolução (80%), pelo que ele pagou por mês.
 * @param {any} c @param {string} ultimoMes
 */
export function contaDaSaida(c, ultimoMes) {
  const meses = PRAZO_MESES[/** @type {'trimestral'} */ (c.prazo)];
  const fimNominal = somarMeses(c.inicio, meses - 1);
  const mesesQueFaltam = Math.max(0, mesesEntre(ultimoMes, fimNominal));
  const porMes = (Number(c.total) || 0) / meses;
  const valorQueFalta = centavos(porMes * mesesQueFaltam);
  const multa = centavos(valorQueFalta * MULTA_SAIDA_PCT / 100);
  return { mesesQueFaltam, valorQueFalta, multa, devolucao: centavos(valorQueFalta - multa) };
}

/**
 * Encerra o contrato antes do fim: o último mês que ele usa e o motivo.
 * @param {any} a @param {string} contratoId @param {{ ultimoMes: string, motivo: string, em: number }} o
 */
export function encerrarAntes(a, contratoId, { ultimoMes, motivo, em }) {
  const lista = contratosDe(a);
  const c = lista.find((x) => x.id === contratoId);
  if (!c) return { recusa: 'Contrato não encontrado.' };
  if (c.saida) return { recusa: 'Esse contrato já foi encerrado.' };
  if (!ehMes(ultimoMes) || ultimoMes < c.inicio) return { recusa: 'Escolha o último mês que ele usa (do início do contrato em diante).' };
  const fimNominal = somarMeses(c.inicio, PRAZO_MESES[/** @type {'trimestral'} */ (c.prazo)] - 1);
  if (ultimoMes >= fimNominal) return { recusa: 'Esse já é o fim do contrato: não há saída antecipada.' };
  const m = String(motivo || '').trim();
  if (!m) return { recusa: 'Escreva o motivo da saída.' };
  const conta = contaDaSaida(c, ultimoMes);
  const saida = { ultimoMes, ...conta, motivo: m, em };
  return {
    patch: { contratos: lista.map((x) => (x.id === contratoId ? { ...x, saida } : x)), plano: { ...a.plano, prazo: 'mensal' } },
    log: {
      tipo: 'contrato',
      resumo: `Contrato ${c.prazo} encerrado em ${mesCurto(ultimoMes)}: faltavam ${conta.mesesQueFaltam} ${conta.mesesQueFaltam === 1 ? 'mês' : 'meses'} (${brl(conta.valorQueFalta)}), multa ${brl(conta.multa)}, devolver ${brl(conta.devolucao)}`,
      extra: { motivo: m },
    },
  };
}

/** Os meios da devolução. */
export const MEIOS_DEVOLUCAO = Object.freeze({ 'pix-chave': 'Pix', cartao: 'Estorno no cartão', dinheiro: 'Dinheiro' });

/**
 * Registra a devolução que o coach fez por fora.
 * @param {any} a @param {string} contratoId @param {{ data: string, meio: string, em: number }} o
 */
export function registrarDevolucao(a, contratoId, { data, meio, em }) {
  const lista = contratosDe(a);
  const c = lista.find((x) => x.id === contratoId);
  if (!c || !c.saida) return { recusa: 'Esse contrato não tem saída com devolução.' };
  if (c.devolucao) return { recusa: 'A devolução já foi registrada.' };
  if (!ehDia(data)) return { recusa: 'Escolha o dia da devolução.' };
  if (!MEIOS_DEVOLUCAO[/** @type {'pix-chave'} */ (meio)]) return { recusa: 'Escolha como devolveu.' };
  const devolucao = { valor: c.saida.devolucao, data, meio, registradoEm: em };
  return {
    patch: { contratos: lista.map((x) => (x.id === contratoId ? { ...x, devolucao } : x)) },
    log: { tipo: 'devolucao', resumo: `Devolução do contrato ${c.prazo}: ${brl(devolucao.valor)} em ${ddmm(data)} (${MEIOS_DEVOLUCAO[/** @type {'pix-chave'} */ (meio)]})` },
  };
}

/**
 * O aviso de fim: a partir de 30 dias antes do último dia coberto (com o
 * trancamento), enquanto não há outro contrato depois nem saída.
 * @param {any} a @param {string} hojeIso
 * @returns {{ c: any, ultimoDia: string, proximoMes: string } | null}
 */
export function avisoDeFim(a, hojeIso) {
  for (const c of contratosDe(a)) {
    if (c.saida) continue;
    const fim = fimDoContrato(c);
    const ultimoDia = somarDiasIso(ultimoDiaDoMes(fim), diasTrancados(a, c));
    if (hojeIso > ultimoDia || hojeIso < somarDiasIso(ultimoDia, -30)) continue;
    // O próximo contrato começa no 1º mês inteiro fora deste (o mês que o trancamento cobriu em parte fica no mensal).
    const proximoMes = somarMeses(ultimoDia.slice(0, 7), 1);
    if (contratosDe(a).some((x) => x !== c && x.inicio > c.inicio)) continue;
    return { c, ultimoDia, proximoMes };
  }
  return null;
}

/**
 * Renova igual: um contrato do mesmo prazo, no 1º mês inteiro depois do fim
 * (com o trancamento, o mês que ele cobriu em parte fica no mensal por semanas).
 * @param {any} a @param {{ id: string, hojeIso: string }} o
 */
export function renovar(a, { id, hojeIso }) {
  const aviso = avisoDeFim(a, hojeIso);
  if (!aviso) return { recusa: 'Não há contrato perto do fim para renovar.' };
  return fecharContrato(a, { prazo: aviso.c.prazo, inicio: aviso.proximoMes, id, hojeIso });
}

/**
 * Passa para o mensal no fim do contrato (o plano da ficha volta a `mensal`).
 * @param {any} a
 */
export function passarParaMensal(a) {
  if (!a.plano || a.plano.prazo === 'mensal') return { recusa: 'O plano já é mensal.' };
  return {
    patch: { plano: { ...a.plano, prazo: 'mensal' } },
    log: { tipo: 'contrato', resumo: 'No fim do contrato, o plano volta para o mensal' },
  };
}

/** O trancamento em curso pertence a um contrato? @param {any} a */
export const trancamentoEmCurso = (a) => { const p = pausaAtual(a); return p && p.contrato ? p : null; };
