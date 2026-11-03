// @ts-check
/**
 * Camada Feriados: a lista é lei (compartilhado/regras/feriados.js); a decisão
 * "o box abriu?" é do coach (meta.feriados: false = não abriu, true = abriu,
 * ausente = ainda não decidiu — e aí o dia conta presença normalmente).
 */
import { feriadoEm } from '../../../compartilhado/regras/feriados.js';

/** 'Natal — feriado nacional (lei)' → 'Natal'. @param {string} nome */
export function nomeCurtoDoFeriado(nome) { return String(nome || '').split('—')[0].split('(')[0].trim(); }

/** @type {import('../core/camadas.js').Camada} */
export const camadaFeriados = {
  id: 'feriados', nome: 'Feriados', cor: '--bad',
  itens(ctx, datas) {
    const out = [];
    for (const data of datas) {
      const f = feriadoEm(data);
      if (!f) continue;
      const v = (ctx.meta.feriados || {})[data];
      const decisao = v === false ? 'fechado' : v === true ? 'aberto' : 'decidir';
      out.push({ data, tipo: 'feriado', titulo: nomeCurtoDoFeriado(f.nome), dados: { nome: f.nome, tipoFeriado: f.tipo, decisao } });
    }
    return out;
  },
};
