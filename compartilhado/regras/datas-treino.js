// @ts-check
/**
 * DATAS DE TREINO — o vocabulário de data que os montadores usam: `dateId`
 * ('YYYY-MM-DD'), `mesId` ('YYYY-MM') e a semana que começa na segunda.
 *
 * Morava dentro do store do montador atual. Saiu para cá quando o montador
 * individual precisou das mesmas contas: duas cópias destas funções é a falha
 * mais cara deste projeto — uma delas conserta o fuso, a outra não, e os dois
 * apps passam a discordar sobre em que dia o treino aconteceu.
 *
 * Tudo em horário LOCAL, de propósito. `toISOString()` converte para UTC e, à
 * noite no Brasil, joga o treino para o dia seguinte.
 */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Chave do dia da semana, na ordem do `Date.getDay()` (0 = domingo). */
const DOW_KEY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/** 'YYYY-MM-DD' de uma data (local, sem pulo de fuso). @param {Date} [d] */
export function dateIdDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM' de uma data. @param {Date} [d] */
export function mesIdDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Date (meia-noite local) a partir de 'YYYY-MM-DD'. @param {string} dateId */
export function dataDe(dateId) {
  const [a, m, d] = String(dateId).split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Chave 'seg'..'dom' de um dateId. @param {string} dateId */
export function diaSemanaDe(dateId) { return DOW_KEY[dataDe(dateId).getDay()]; }

/** Semana do mês (1..5) de uma data. @param {Date} [d] */
export function semanaDoMes(d = new Date()) { return Math.ceil(d.getDate() / 7); }

/** Rótulo legível 'Junho/2026'. @param {string} mesId */
export function rotuloMes(mesId) {
  const [ano, m] = String(mesId).split('-').map(Number);
  return `${MESES[m - 1]}/${ano}`;
}

/**
 * Segunda-feira da semana de um dateId. A semana do box começa na segunda, e é
 * ela que a meta de volume e o aviso de repetição usam.
 * @param {string} dateId @returns {Date}
 */
export function segundaDaSemanaDe(dateId) {
  const d = dataDe(dateId);
  const dow = d.getDay(); // 0=dom..6=sab
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

/**
 * Primeiro e último dateId da semana (segunda a domingo) de um dateId.
 * @param {string} dateId @returns {{ini: string, fim: string}}
 */
export function faixaDaSemana(dateId) {
  const seg = segundaDaSemanaDe(dateId);
  const dom = new Date(seg);
  dom.setDate(dom.getDate() + 6);
  return { ini: dateIdDe(seg), fim: dateIdDe(dom) };
}
