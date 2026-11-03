// @ts-check
/**
 * As datas do Calendário — puro, sem DOM e sem rede.
 *
 * Tudo em 'AAAA-MM-DD' no fuso LOCAL do aparelho. `toISOString()` é UTC: em
 * UTC-3 ele vira o dia seguinte a partir das 21h, e o calendário mostraria a
 * semana errada de noite. Por isso as contas usam `new Date(ano, mes, dia)`.
 */

export const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = MESES.map((m) => m.slice(0, 3).toUpperCase());

/** @typedef {'semana'|'mes'|'dia'} Visao */
/** @type {readonly Visao[]} */
export const VISOES = Object.freeze(['semana', 'mes', 'dia']);

const dois = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** @param {Date} d */
export function isoLocal(d) { return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; }

/** @param {string} iso */
function dataDe(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }

/** @param {string} iso @param {number} n */
export function addDias(iso, n) { const d = dataDe(iso); d.setDate(d.getDate() + n); return isoLocal(d); }

/** 0 = domingo … 6 = sábado. @param {string} iso */
export function diaDaSemana(iso) { return dataDe(iso).getDay(); }

/** A segunda-feira da semana de `iso` (o domingo é o fim da semana, como no box). @param {string} iso */
export function segundaDe(iso) { return addDias(iso, -((diaDaSemana(iso) + 6) % 7)); }

/** @param {string} iso */
const primeiroDoMes = (iso) => iso.slice(0, 8) + '01';
/** @param {string} iso */
const diasNoMes = (iso) => { const [a, m] = iso.split('-').map(Number); return new Date(a, m, 0).getDate(); };

/**
 * As datas que o período mostra. Semana: segunda a domingo (a tela tira o
 * domingo sem turma). Mês: todos os dias. Dia: o dia e os 6 seguintes — a
 * linha do tempo é só do primeiro; os outros alimentam "nos próximos dias".
 * @param {Visao} visao @param {string} ancora @returns {string[]}
 */
export function datasDoPeriodo(visao, ancora) {
  if (visao === 'semana') { const seg = segundaDe(ancora); return Array.from({ length: 7 }, (_, i) => addDias(seg, i)); }
  if (visao === 'mes') { const p = primeiroDoMes(ancora); return Array.from({ length: diasNoMes(ancora) }, (_, i) => addDias(p, i)); }
  return Array.from({ length: 7 }, (_, i) => addDias(ancora, i));
}

/** As semanas (domingo a sábado) que cobrem o mês de `ancora`. @param {string} ancora @returns {string[][]} */
export function gradeDoMes(ancora) {
  const p = primeiroDoMes(ancora);
  const ultimo = addDias(p, diasNoMes(ancora) - 1);
  const semanas = [];
  for (let ini = addDias(p, -diaDaSemana(p)); ini <= ultimo; ini = addDias(ini, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => addDias(ini, i)));
  }
  return semanas;
}

/** O período seguinte (passo 1) ou anterior (−1). O mês cai sempre no dia 1. @param {Visao} visao @param {string} ancora @param {number} passo */
export function navegar(visao, ancora, passo) {
  if (visao === 'semana') return addDias(ancora, 7 * passo);
  if (visao === 'dia') return addDias(ancora, passo);
  const [a, m] = ancora.split('-').map(Number);
  return isoLocal(new Date(a, m - 1 + passo, 1));
}

/** O título do período: '2 – 7 NOV 2026', 'NOVEMBRO 2026', 'SEGUNDA · 02/11/2026'. @param {Visao} visao @param {string} ancora */
export function rotuloPeriodo(visao, ancora) {
  const [a, m, d] = ancora.split('-').map(Number);
  if (visao === 'mes') return `${MESES[m - 1].toUpperCase()} ${a}`;
  if (visao === 'dia') return `${DIAS_LONGO[diaDaSemana(ancora)].toUpperCase()} · ${dois(d)}/${dois(m)}/${a}`;
  const ini = segundaDe(ancora), fim = addDias(ini, 5);
  const [ai, mi, di] = ini.split('-').map(Number);
  const [af, mf, df] = fim.split('-').map(Number);
  if (ai !== af) return `${di} ${MESES_CURTO[mi - 1]} ${ai} – ${df} ${MESES_CURTO[mf - 1]} ${af}`;
  if (mi !== mf) return `${di} ${MESES_CURTO[mi - 1]} – ${df} ${MESES_CURTO[mf - 1]} ${af}`;
  return `${di} – ${df} ${MESES_CURTO[mf - 1]} ${af}`;
}

/** Hoje e a hora de agora, no fuso do aparelho. @param {Date} [d] */
export function relogioLocal(d = new Date()) {
  return { hoje: isoLocal(d), agora: `${dois(d.getHours())}:${dois(d.getMinutes())}` };
}
