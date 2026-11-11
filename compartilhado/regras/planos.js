// @ts-check
/**
 * Planos e preços do box: o valor da mensalidade de cada mês (Fase 1 · etapa
 * 6.1, decisão 9 do ESCOPO.md, a partir do PDF de precificação de 2027).
 *
 * Módulo puro: sem DOM e sem Firebase. Roda na Gestão (pela fatura de
 * `consumo.js`), no servidor das caixas (cópia em functions/lib/gestao) e tem
 * porte no app (`app-mobile/src/core/planos.ts`, conferido pela paridade) e no
 * Pix (`functions/src/planos.ts`, conferido pelo `checar-pix`). Mudar uma
 * regra aqui é mudar nos quatro.
 *
 * O VALOR DE UM MÊS (`mensalidadeDoMes`), nesta ordem:
 *   1. Cortesia (`cortesia`, ou a parceria antiga de 100%): zero. O consumo
 *      continua sendo cobrado (decisão 7).
 *   2. O preço: da fatura de janeiro/2027 em diante, a tabela (fundadores ou
 *      regular) do plano da ficha; antes disso, ou sem plano, o valor que a
 *      ficha já guardava (`mensalidade`).
 *   3. Menos os bônus (só de jan/2027 em diante), somados e limitados a 30%
 *      do preço. Antes de 2027 vale a parceria antiga de 10/25/50%.
 *   4. Vezes as semanas ÷ 4, quando o aluno volta da pausa ou começa no meio
 *      do mês. Pausado no dia 1 e sem volta no mês: zero.
 *
 * O MÊS TEM SEMPRE 4 SEMANAS. A semana vai de segunda a domingo e é do mês em
 * que cai a segunda. Quem volta (ou começa) no dia D paga as segundas que
 * faltam de D até o fim do mês, mais a semana quebrada de D se treinou nela as
 * vezes do plano — no máximo 4. Mês de 5 semanas não acrescenta nada.
 *
 * O MÊS EM QUE PAUSA é cobrado inteiro (o que já foi pago fica); a pausa zera
 * a mensalidade a partir do mês seguinte. Pausa que começa no dia 1 já zera o
 * próprio mês.
 */

/** A primeira fatura das tabelas novas (o PDF: vigência em 04/01/2027). */
export const VIGENCIA_2027 = '2027-01';

/**
 * Desde esta fatura a data de início conta: antes dela, zero; no mês dela, por
 * semana. Os meses anteriores ficam como sempre foram (sem refazer conta antiga).
 */
export const SEMANAS_DESDE = '2026-12';

/** Quem começou até este dia é fundador (decisão 9). */
export const FUNDADOR_ATE = '2026-12-31';

/** Os bônus somam no máximo isto, em % do preço da tabela. */
export const TETO_BONUS = 30;

/** Os planos que o coach escolhe hoje. Trimestral e semestral entram na 6.2. */
export const PRAZOS_ESCOLHIVEIS = Object.freeze(['mensal']);

/** As vezes por semana de cada plano. O Ilimitado (5–6x) conta como 5 na semana quebrada. */
export const VEZES_DOS_PLANOS = Object.freeze([2, 3, 4, 'ilimitado']);

/** As tabelas do PDF, em reais por mês, pela chave `${vezes}-${prazo}`. */
export const TABELAS = Object.freeze({
  fundador: Object.freeze({
    '2x-mensal': 150, // 2x Legado: só para quem já fazia 2x
    '3x-mensal': 190, '3x-trimestral': 180, '3x-semestral': 170,
    '4x-mensal': 220, '4x-semestral': 195,
    'ilimitado-mensal': 250,
  }),
  regular: Object.freeze({
    '3x-mensal': 260, '3x-trimestral': 240, '3x-semestral': 220,
    '4x-mensal': 310, '4x-trimestral': 290, '4x-semestral': 270,
    'ilimitado-mensal': 350,
  }),
});

/** O percentual de cada bônus. */
export const BONUS_PCT = Object.freeze({ dupla: 10, instagram: 5, parceriaInicio: 10, parceria: 5, indicacao: 30 });

const dinheiro = (/** @type {any} */ v) => Number(String(v ?? '').replace(',', '.')) || 0;
/** Arredonda para centavos. @param {number} v */
const centavos = (v) => Math.round(v * 100) / 100;

/* ---------- datas 'AAAA-MM-DD', em UTC para não ter fuso no meio ---------- */

const utc = (/** @type {string} */ d) => { const [a, m, dia] = d.split('-').map(Number); return Date.UTC(a, m - 1, dia); };
/** @param {string} d @param {number} n */
export const somarDiasIso = (d, n) => new Date(utc(d) + n * 86400000).toISOString().slice(0, 10);
/** 0 = domingo, 1 = segunda. @param {string} d */
const diaDaSemana = (d) => new Date(utc(d)).getUTCDay();
/** O último dia de um mês, 'AAAA-MM-DD'. @param {string} mesId */
export function ultimoDiaDoMes(mesId) {
  const [a, m] = mesId.split('-').map(Number);
  return `${mesId}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
/** O mês anterior a 'AAAA-MM'. @param {string} mesId */
export function mesAnterior(mesId) {
  const [a, m] = mesId.split('-').map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

/* ---------- o plano ---------- */

/** `'3x-mensal'`, `'ilimitado-mensal'`, ou '' sem plano. @param {any} plano */
export function chaveDoPlano(plano) {
  const prazo = (plano && plano.prazo) || 'mensal';
  const v = plano && plano.vezes;
  if (v === 'ilimitado') return `ilimitado-${prazo}`;
  const n = Number(v);
  return n === 2 || n === 3 || n === 4 ? `${n}x-${prazo}` : '';
}

/** "3x por semana", "Ilimitado", "4x por semana · semestral". @param {any} plano */
export function rotuloDoPlano(plano) {
  const chave = chaveDoPlano(plano);
  if (!chave) return '';
  const prazo = (plano && plano.prazo) || 'mensal';
  const base = plano.vezes === 'ilimitado' ? 'Ilimitado' : `${Number(plano.vezes)}x por semana`;
  return prazo === 'mensal' ? base : `${base} · ${prazo}`;
}

/** @param {any} a */
export const ehFundador = (a) => !!a && a.fundador === true;

/** A tabela da ficha. @param {any} a @returns {'fundador'|'regular'} */
export const tabelaDoAluno = (a) => (ehFundador(a) ? 'fundador' : 'regular');

/**
 * O preço da tabela no mês, ou null (antes de 2027, sem plano, ou plano que a
 * tabela da ficha não tem — o 2x para quem não é fundador).
 * @param {any} a @param {string} mesId
 */
export function precoDaTabela(a, mesId) {
  if (mesId < VIGENCIA_2027) return null;
  // O mês avulso usa sempre o preço mensal; o trimestral e o semestral só valem
  // dentro de um contrato (etapa 6.2), com o preço guardado nele.
  const p = /** @type {Record<string, number>} */ (TABELAS[tabelaDoAluno(a)])[chaveDoPlano(a && a.plano ? { vezes: a.plano.vezes, prazo: 'mensal' } : null)];
  return typeof p === 'number' ? p : null;
}

/** As vezes por semana que contam na semana quebrada. @param {any} a */
export function vezesDoPlano(a) {
  const v = a && a.plano && a.plano.vezes;
  if (v === 'ilimitado') return 5;
  return Number(v) || Number(a && a.freqVezes) || 0;
}

/* ---------- status ---------- */

/** @param {any} a */
export const estaPausado = (a) => !!a && (a.status || 'ativo') === 'pausado';

/**
 * Fora das turmas, da chamada, dos créditos de feriado, da Fila e do ranking:
 * inativo ou pausado. A cobrança continua lendo o pausado (o consumo em aberto).
 * @param {any} a
 */
export const foraDoTreino = (a) => !a || (a.status || 'ativo') === 'inativo' || (a.status || 'ativo') === 'pausado';

/** A pausa em curso (sem volta), ou null. @param {any} a */
export const pausaAtual = (a) => ((a && a.pausas) || []).find((/** @type {any} */ p) => p && p.desde && !p.ate) || null;

/**
 * A pausa que cobre o dia 1 do mês, ou null. A pausa vai de `desde` (o 1º dia
 * pausado) até `ate` (o dia da volta, que já é dia de treino).
 * @param {any} a @param {string} mesId
 */
export function pausaNoDia1(a, mesId) {
  const d1 = `${mesId}-01`;
  return ((a && a.pausas) || []).find((/** @type {any} */ p) => p && p.desde && p.desde <= d1 && (!p.ate || p.ate > d1)) || null;
}

/* ---------- as semanas ---------- */

/**
 * As semanas cobradas de quem volta (ou começa) em `desde`, dentro de `mesId`.
 * @param {string} mesId @param {string} desde 'AAAA-MM-DD' dentro do mês
 * @param {number} vezes as do plano @param {string[]} [presencas] os dias em que veio
 * @returns {{ semanas: number, quebrada: boolean, segundas: number }}
 */
export function semanasDesde(mesId, desde, vezes, presencas = []) {
  const ult = ultimoDiaDoMes(mesId);
  let segundas = 0;
  for (let d = desde; d <= ult; d = somarDiasIso(d, 1)) if (diaDaSemana(d) === 1) segundas++;
  let quebrada = false;
  const dow = diaDaSemana(desde);
  if (dow !== 1) {
    const segunda = somarDiasIso(desde, -((dow + 6) % 7));
    // A semana quebrada é do mês da segunda dela: se a segunda é do mês
    // anterior, a semana já não é deste mês.
    if (segunda.slice(0, 7) === mesId) {
      const domingo = somarDiasIso(segunda, 6);
      const feitas = new Set((presencas || []).filter((p) => typeof p === 'string' && p >= desde && p <= domingo)).size;
      quebrada = vezes > 0 && feitas >= vezes;
    }
  }
  return { semanas: Math.min(4, segundas + (quebrada ? 1 : 0)), quebrada, segundas };
}

/**
 * Quantas semanas do mês a ficha paga, e por quê.
 * `semanasAjuste[mesId]` (0 a 4), quando o coach corrige à mão, manda.
 * @param {any} a @param {string} mesId
 * @returns {{ semanas: number, desde: string, porque: ''|'volta'|'inicio', quebrada: boolean, ajuste: boolean, zero: ''|'pausado'|'antes-do-inicio' }}
 */
export function semanasDoMes(a, mesId) {
  const ult = ultimoDiaDoMes(mesId);
  const d1 = `${mesId}-01`;
  /** @type {''|'pausado'|'antes-do-inicio'} */ let zero = '';
  let desde = '';
  /** @type {''|'volta'|'inicio'} */ let porque = '';
  const p = pausaNoDia1(a, mesId);
  if (p) {
    if (!p.ate || p.ate > ult) zero = 'pausado';
    else { desde = p.ate; porque = 'volta'; }
  }
  const inicio = a && typeof a.inicio === 'string' ? a.inicio : '';
  if (!zero && inicio && mesId >= SEMANAS_DESDE) {
    if (inicio > ult) zero = 'antes-do-inicio';
    else if (inicio > d1 && inicio > desde) { desde = inicio; porque = 'inicio'; }
  }
  const aj = a && a.semanasAjuste ? a.semanasAjuste[mesId] : undefined;
  const n = aj === '' || aj == null ? NaN : Number(aj);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return { semanas: n, desde, porque, quebrada: false, ajuste: true, zero: '' };
  if (zero) return { semanas: 0, desde: '', porque: '', quebrada: false, ajuste: false, zero };
  if (!desde) return { semanas: 4, desde: '', porque: '', quebrada: false, ajuste: false, zero: '' };
  const r = semanasDesde(mesId, desde, vezesDoPlano(a), a && a.presencas);
  return { semanas: r.semanas, desde, porque, quebrada: r.quebrada, ajuste: false, zero: '' };
}

/* ---------- os bônus ---------- */

/**
 * Os bônus que valem no mês (só de jan/2027 em diante). Cada um é um campo da
 * ficha, e não um objeto só: o card grava a parceria e a indicação, e os botões
 * gravam a dupla, o Instagram e as indicações dadas — gravando por campo, um
 * não apaga o outro.
 *   dupla          { id, nome }          10% enquanto a dupla estiver ligada
 *   instagram      ['AAAA-MM', …]        5% na fatura do mês seguinte a cada mês marcado
 *   parceriaLocal  { nome, desde }       10% na 1ª fatura (desde), 5% nas seguintes
 *   indicadoPor    { id, nome, mes }     30% na 1ª mensalidade do indicado
 *   indicacoes     [{ mes, id, nome }]   30% para quem indicou, no mês que o coach deu
 * @param {any} a @param {string} mesId
 * @returns {{ tipo: string, rotulo: string, pct: number }[]}
 */
export function bonusDoMes(a, mesId) {
  if (mesId < VIGENCIA_2027) return [];
  const b = {
    dupla: a && a.dupla, instagram: a && a.instagram, parceria: a && a.parceriaLocal,
    indicadoPor: a && a.indicadoPor, indicacoes: a && a.indicacoes,
  };
  const out = [];
  if (b.dupla && b.dupla.id) out.push({ tipo: 'dupla', rotulo: `Dupla com ${b.dupla.nome || 'parceiro'}`, pct: BONUS_PCT.dupla });
  if (Array.isArray(b.instagram) && b.instagram.includes(mesAnterior(mesId))) out.push({ tipo: 'instagram', rotulo: 'Instagram (4 stories)', pct: BONUS_PCT.instagram });
  if (b.parceria && b.parceria.desde && mesId >= b.parceria.desde) {
    const nome = String(b.parceria.nome || '').trim();
    out.push({ tipo: 'parceria', rotulo: nome ? `Parceria ${nome}` : 'Parceria', pct: mesId === b.parceria.desde ? BONUS_PCT.parceriaInicio : BONUS_PCT.parceria });
  }
  if (b.indicadoPor && b.indicadoPor.mes === mesId) out.push({ tipo: 'indicado', rotulo: `Indicado por ${b.indicadoPor.nome || 'um aluno'}`, pct: BONUS_PCT.indicacao });
  for (const i of Array.isArray(b.indicacoes) ? b.indicacoes : []) {
    if (i && i.mes === mesId) out.push({ tipo: 'indicacao', rotulo: `Indicou ${i.nome || 'um aluno'}`, pct: BONUS_PCT.indicacao });
  }
  return out;
}

/* ---------- o contrato (etapa 6.2) ---------- */

/** Os meses de cada contrato. */
export const PRAZO_MESES = Object.freeze({ trimestral: 3, semestral: 6 });

/** O trancamento de cada contrato: quantos períodos, e até quantos dias cada um. */
export const LIMITE_TRANCAMENTO = Object.freeze({ trimestral: Object.freeze({ periodos: 1, dias: 15 }), semestral: Object.freeze({ periodos: 2, dias: 15 }) });

/** A multa de quem sai antes do fim, em % das mensalidades que faltam (o box devolve o resto). */
export const MULTA_SAIDA_PCT = 20;

/** O Day Pass e a janela em que ele abate 100% da 1ª mensalidade. */
export const DAYPASS_VALOR = 50;
export const DAYPASS_JANELA_DIAS = 7;

/** 'AAAA-MM' somado de n meses. @param {string} mesId @param {number} n */
export function somarMeses(mesId, n) {
  const [a, m] = mesId.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Dias de `de` até `ate`. @param {string} de @param {string} ate */
const diasEntre = (de, ate) => Math.round((utc(ate) - utc(de)) / 86400000);

/** Um contrato válido? @param {any} c */
const ehContrato = (c) => !!c && typeof c.inicio === 'string' && /^\d{4}-\d{2}$/.test(c.inicio) && !!PRAZO_MESES[/** @type {'trimestral'} */ (c.prazo)];

/** Os contratos válidos da ficha. @param {any} a @returns {any[]} */
export const contratosDe = (a) => ((a && Array.isArray(a.contratos)) ? a.contratos.filter(ehContrato) : []);

/** O último mês do contrato, sem o trancamento (ou o da saída, se saiu antes). @param {any} c */
export function fimDoContrato(c) {
  const nominal = somarMeses(c.inicio, PRAZO_MESES[/** @type {'trimestral'} */ (c.prazo)] - 1);
  const saiu = c.saida && typeof c.saida.ultimoMes === 'string' ? c.saida.ultimoMes : '';
  return saiu && saiu < nominal ? saiu : nominal;
}

/**
 * Os dias de trancamento que esticam o contrato: as pausas fechadas ligadas a
 * ele, cada uma limitada ao máximo do período, até o número de períodos.
 * @param {any} a @param {any} c
 */
export function diasTrancados(a, c) {
  const lim = LIMITE_TRANCAMENTO[/** @type {'trimestral'} */ (c.prazo)];
  const pausas = ((a && a.pausas) || []).filter((/** @type {any} */ p) => p && p.contrato === c.id && p.desde && p.ate);
  return pausas.slice(0, lim.periodos).reduce((t, /** @type {any} */ p) => t + Math.max(0, Math.min(lim.dias, diasEntre(p.desde, p.ate))), 0);
}

/**
 * O papel do contrato num mês: o 1º mês (cobra o total), coberto (zero), ou o
 * mês depois do fim que o trancamento ainda cobre em parte (`voltaEm`: o 1º dia
 * fora do contrato). null fora de contrato.
 * @param {any} a @param {string} mesId
 * @returns {{ c: any, papel: 'inicio'|'coberto'|'extensao', voltaEm?: string } | null}
 */
export function contratoNoMes(a, mesId) {
  for (const c of contratosDe(a)) {
    if (mesId === c.inicio) return { c, papel: 'inicio' };
    const fim = fimDoContrato(c);
    if (mesId > c.inicio && mesId <= fim) return { c, papel: 'coberto' };
    if (c.saida || mesId <= fim) continue;
    const dias = diasTrancados(a, c);
    if (!dias) continue;
    const ultimoCoberto = somarDiasIso(ultimoDiaDoMes(fim), dias);
    if (ultimoCoberto >= ultimoDiaDoMes(mesId)) return { c, papel: 'coberto' };
    if (ultimoCoberto >= `${mesId}-01`) return { c, papel: 'extensao', voltaEm: somarDiasIso(ultimoCoberto, 1) };
  }
  return null;
}

/**
 * O preço do contrato no dia em que ele é feito: o valor mensal da tabela do
 * prazo, os bônus daquele dia (até 30%) e o total pago de uma vez.
 * @param {any} a @param {'trimestral'|'semestral'} prazo @param {string} inicio o 1º mês
 * @returns {{ valorMensal: number, pctBonus: number, total: number } | null} null quando a tabela não tem o plano
 */
export function precoDoContrato(a, prazo, inicio) {
  const v = a && a.plano && a.plano.vezes;
  const chave = v === 'ilimitado' ? `ilimitado-${prazo}` : `${Number(v)}x-${prazo}`;
  const valorMensal = /** @type {Record<string, number>} */ (TABELAS[tabelaDoAluno(a)])[chave];
  if (typeof valorMensal !== 'number' || inicio < VIGENCIA_2027) return null;
  // O Instagram é mês a mês e não vale no contrato pago de uma vez.
  const pctBonus = Math.min(bonusDoMes(a, inicio).filter((b) => b.tipo !== 'instagram').reduce((t, b) => t + b.pct, 0), TETO_BONUS);
  const meses = PRAZO_MESES[prazo];
  return { valorMensal, pctBonus, total: centavos(valorMensal * meses * (1 - pctBonus / 100)) };
}

/* ---------- o Day Pass (etapa 6.2) ---------- */

/**
 * Quanto do Day Pass abate neste mês: os R$ 50 na 1ª mensalidade (o mês do
 * início), se o início foi até 7 dias depois do treino.
 * @param {any} a @param {string} mesId @param {number} valor o que ele pagaria
 */
function abateDayPass(a, mesId, valor) {
  const dp = a && a.dayPass;
  const inicio = a && typeof a.inicio === 'string' ? a.inicio : '';
  if (!dp || typeof dp.dia !== 'string' || !inicio || inicio.slice(0, 7) !== mesId) return 0;
  const dias = diasEntre(dp.dia, inicio);
  if (dias < 0 || dias > DAYPASS_JANELA_DIAS) return 0;
  return Math.min(valor, Number(dp.valor) || DAYPASS_VALOR);
}

/* ---------- o valor do mês ---------- */

/**
 * @typedef {Object} MensalidadeDoMes
 * @property {'tabela'|'ficha'|'contrato'} origem  de onde veio o preço
 * @property {''|'fundador'|'regular'} tabela
 * @property {number} cheia      o preço do plano no mês, antes de qualquer desconto
 * @property {boolean} cortesia
 * @property {{ nome: string, percentual: number, valor: number } | null} parceria  a antiga (antes de 2027, ou a de 100%)
 * @property {{ tipo: string, rotulo: string, pct: number }[]} bonus
 * @property {number} pctBonus   o que vale dos bônus (no máximo o teto)
 * @property {boolean} teto      os bônus passaram do teto
 * @property {number} semanas    4 = o mês inteiro
 * @property {string} desde      a volta ou o início no meio do mês
 * @property {''|'volta'|'inicio'|'contrato'} porque
 * @property {boolean} quebrada  a semana da volta contou
 * @property {boolean} ajuste    as semanas foram corrigidas pelo coach
 * @property {''|'cortesia'|'pausado'|'antes-do-inicio'|'contrato'} zero  por que o mês é zero
 * @property {{ prazo: string, inicio: string, fim: string, papel: string } | null} contrato  o contrato do mês (etapa 6.2)
 * @property {number} dayPass    o Day Pass abatido neste mês
 * @property {number} desconto   cheia − valor
 * @property {number} investimento  o que o box banca: a cortesia, a parceria e os bônus
 *                    (proporcionais às semanas). A pausa, o início no meio do mês e o Day Pass não contam.
 * @property {number} valor      o que o aluno paga de mensalidade no mês
 */

/**
 * O valor da mensalidade de um mês.
 * @param {any} a a ficha (ou a fatia do Portal) @param {string} mesId 'AAAA-MM'
 * @returns {MensalidadeDoMes}
 */
export function mensalidadeDoMes(a, mesId) {
  const cm = contratoNoMes(a, mesId);
  const contrato = cm ? { prazo: cm.c.prazo, inicio: cm.c.inicio, fim: fimDoContrato(cm.c), papel: cm.papel } : null;
  const vazio = { semanas: 4, desde: '', porque: /** @type {''} */ (''), quebrada: false, ajuste: false, parceria: null, teto: false };

  // O 1º mês do contrato cobra o contrato inteiro, pago de uma vez.
  if (cm && cm.papel === 'inicio') {
    const meses = PRAZO_MESES[/** @type {'trimestral'} */ (cm.c.prazo)];
    const cheia = centavos((Number(cm.c.valorMensal) || 0) * meses);
    const total = centavos(Number(cm.c.total) || 0);
    const pct = Number(cm.c.pctBonus) || 0;
    const dp = abateDayPass(a, mesId, total);
    const valor = centavos(total - dp);
    return {
      ...vazio, origem: 'contrato', tabela: tabelaDoAluno(a), cheia, cortesia: false, contrato,
      bonus: pct ? [{ tipo: 'contrato', rotulo: 'Bônus do contrato', pct }] : [], pctBonus: pct,
      zero: '', dayPass: dp, desconto: centavos(cheia - valor), investimento: centavos(cheia - total), valor,
    };
  }
  // Os outros meses do contrato já foram pagos.
  if (cm && cm.papel === 'coberto') {
    const cheia = centavos(Number(cm.c.valorMensal) || 0);
    return {
      ...vazio, origem: 'contrato', tabela: tabelaDoAluno(a), cheia, cortesia: false, contrato,
      bonus: [], pctBonus: 0, zero: 'contrato', dayPass: 0, desconto: cheia, investimento: 0, valor: 0,
    };
  }

  const tabelado = precoDaTabela(a, mesId);
  const origem = tabelado != null ? 'tabela' : 'ficha';
  const cheia = tabelado != null ? tabelado : dinheiro(a && a.mensalidade);
  const pctLegado = Number(a && a.parceria && a.parceria.percentual) || 0;
  const cortesia = !!(a && a.cortesia) || pctLegado >= 100;
  // A parceria antiga só vale antes das tabelas novas (a de 100% é cortesia, sempre).
  const parceria = pctLegado > 0 && (pctLegado >= 100 || mesId < VIGENCIA_2027)
    ? { nome: String(a.parceria.nome || '').trim(), percentual: pctLegado, valor: centavos(cheia * pctLegado / 100) }
    : null;
  // O mês depois do fim de um contrato que o trancamento esticou: a "volta" é o
  // 1º dia fora do contrato, e vale a regra das semanas.
  const s = cm && cm.papel === 'extensao' && cm.voltaEm
    ? (() => { const r = semanasDesde(mesId, cm.voltaEm, vezesDoPlano(a), a && a.presencas); return { semanas: r.semanas, desde: cm.voltaEm, porque: /** @type {'contrato'} */ ('contrato'), quebrada: r.quebrada, ajuste: false, zero: /** @type {''} */ ('') }; })()
    : semanasDoMes(a, mesId);
  const bonus = cortesia ? [] : bonusDoMes(a, mesId);
  const soma = bonus.reduce((t, b) => t + b.pct, 0);
  const pctBonus = Math.min(soma, TETO_BONUS);
  const base = {
    origem, tabela: origem === 'tabela' ? tabelaDoAluno(a) : '', cheia, cortesia, parceria, contrato,
    bonus, pctBonus, teto: soma > TETO_BONUS,
    semanas: s.semanas, desde: s.desde, porque: s.porque, quebrada: s.quebrada, ajuste: s.ajuste,
  };
  if (cortesia) return { ...base, zero: 'cortesia', dayPass: 0, desconto: cheia, investimento: cheia, valor: 0 };
  if (s.zero) return { ...base, zero: s.zero, dayPass: 0, desconto: cheia, investimento: 0, valor: 0 };
  const descontoPlano = parceria ? Math.min(parceria.valor, cheia) : Math.min(centavos(cheia * pctBonus / 100), cheia);
  const liquido = centavos(cheia - descontoPlano);
  const semanal = s.semanas >= 4 ? liquido : centavos(liquido * s.semanas / 4);
  const investimento = s.semanas >= 4 ? descontoPlano : centavos(descontoPlano * s.semanas / 4);
  const dp = abateDayPass(a, mesId, semanal);
  const valor = centavos(semanal - dp);
  // Sem semanas a menos nem Day Pass, o desconto é o do plano (o valor de sempre, ao centavo).
  const desconto = s.semanas >= 4 && !dp ? descontoPlano : centavos(cheia - valor);
  return { ...base, zero: '', dayPass: dp, desconto, investimento, valor };
}

/* ---------- textos ---------- */

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} d */
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** 'AAAA-MM' → 'jan/2027'. @param {string} mesId */
export const mesCurto = (mesId) => `${MESES_CURTOS[Number(mesId.slice(5, 7)) - 1]}/${mesId.slice(0, 4)}`;
/** 12.5 → '12,50'. @param {number} v */
const reais = (v) => v.toFixed(2).replace('.', ',');

/**
 * As linhas que explicam o valor (a notinha do Portal e o card da Gestão).
 * Vazia quando o valor é o preço cheio do mês inteiro.
 * @param {MensalidadeDoMes} m
 * @returns {string[]}
 */
export function explicacaoDoValor(m) {
  if (m.zero === 'cortesia') return ['Cortesia: mensalidade zero'];
  if (m.zero === 'pausado') return ['Plano pausado: mensalidade zero'];
  if (m.zero === 'antes-do-inicio') return ['Antes do início do plano'];
  const c = m.contrato;
  if (m.zero === 'contrato' && c) return [`Coberto pelo contrato ${c.prazo} (${mesCurto(c.inicio)} a ${mesCurto(c.fim)})`];
  const out = [];
  if (c && c.papel === 'inicio') out.push(`Contrato ${c.prazo}: ${mesCurto(c.inicio)} a ${mesCurto(c.fim)}, pago de uma vez`);
  if (m.parceria) out.push(`Parceria ${m.parceria.percentual}%${m.parceria.nome ? ` · ${m.parceria.nome}` : ''}`);
  for (const b of m.bonus) out.push(`${b.rotulo}: ${b.pct}%`);
  if (m.teto) out.push(`Bônus limitados a ${TETO_BONUS}%`);
  if (m.semanas < 4) {
    const quando = m.desde
      ? (m.porque === 'volta' ? ` (volta em ${ddmm(m.desde)})` : m.porque === 'contrato' ? ` (o contrato cobriu até ${ddmm(somarDiasIso(m.desde, -1))})` : ` (início em ${ddmm(m.desde)})`)
      : '';
    out.push(`${m.semanas} de 4 semanas${quando}${m.ajuste ? ', ajustado pelo coach' : ''}`);
  }
  if (m.dayPass > 0) out.push(`Day Pass abatido: R$ ${reais(m.dayPass)}`);
  return out;
}
