// @ts-check
/** Os eventos da agenda (compartilhado/regras/agenda.js) que caem nas datas do período. */
import { eventosDoMes } from '../../../compartilhado/regras/agenda.js';

/**
 * @param {any[]} fichas @param {string[]} datas @param {'aniv'|'reav'} tipo
 * @returns {{ data: string, ev: import('../../../compartilhado/regras/agenda.js').EventoAgenda }[]}
 */
export function eventosNasDatas(fichas, datas, tipo) {
  /** @type {Map<string, ReturnType<typeof eventosDoMes>>} */
  const porMes = new Map();
  const out = [];
  for (const data of datas) {
    const chave = data.slice(0, 7);
    if (!porMes.has(chave)) { const [a, m] = chave.split('-').map(Number); porMes.set(chave, eventosDoMes(fichas, a, m)); }
    const doDia = /** @type {any} */ (porMes.get(chave))[Number(data.slice(8, 10))] || [];
    for (const ev of doDia) if (ev.tipo === tipo) out.push({ data, ev });
  }
  return out;
}
