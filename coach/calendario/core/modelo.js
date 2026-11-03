// @ts-check
/**
 * O que a tela desenha, montado a partir das camadas — puro. Os render-*.js só
 * transformam isto em HTML; o app só junta os dados e chama.
 */
import { rodarCamadas } from './camadas.js';
import { datasDoPeriodo, gradeDoMes, rotuloPeriodo, diaDaSemana, DIAS_CURTO } from './periodo.js';

/**
 * @typedef {import('./camadas.js').Item} Item
 * @typedef {{ iso: string, dow: number, rotulo: string, numero: string, hoje: boolean, fechado: boolean, semAula: boolean, total: number, temTurma: boolean, doDia: Item[], porHora: Record<string, Item[]>, grade: string[] }} DiaModelo
 * @typedef {{ hora: string, foraDaGrade: boolean }} LinhaModelo
 * @typedef {{ visao: import('./periodo.js').Visao, ancora: string, rotulo: string, dias: DiaModelo[], horas: LinhaModelo[], hoje: string, agora: string, semanas: string[][] | null }} Modelo
 */

/** 'HH:MM' em ordem; '' (sem horário na ficha) por último. @param {string} x @param {string} y */
export const ordemHora = (x, y) => (x === y ? 0 : x === '' ? 1 : y === '' ? -1 : x < y ? -1 : 1);

/**
 * @param {{ camadas: import('./camadas.js').Camada[], ctx: import('./camadas.js').Contexto,
 *   visao: import('./periodo.js').Visao, ancora: string, ligadas: Set<string>, gradeDoDia: (iso: string) => string[] }} o
 * @returns {Modelo}
 */
export function montarModelo({ camadas, ctx, visao, ancora, ligadas, gradeDoDia }) {
  const datas = datasDoPeriodo(visao, ancora);
  const res = rodarCamadas(camadas, ctx, datas, ligadas);
  const fechados = new Set(ctx.fechados);
  /** @type {DiaModelo[]} */
  const dias = datas.map((iso) => {
    const r = res[iso];
    const turmas = Object.values(r.porHora).flat().filter((i) => i.tipo === 'turma');
    const dow = diaDaSemana(iso);
    const grade = gradeDoDia(iso);
    const fechado = fechados.has(iso);
    return {
      iso, dow, rotulo: DIAS_CURTO[dow], numero: iso.slice(8, 10), hoje: iso === ctx.hoje, fechado,
      total: turmas.reduce((s, t) => s + ((t.dados && t.dados.vem) || []).length, 0), temTurma: turmas.length > 0,
      // "Sem aula" = o box não abre neste dia (grade vazia, ninguém marcado) e não é feriado
      // fechado: o domingo, por exemplo. A Semana mostra os 7 dias; o domingo aparece apagado.
      semAula: !fechado && grade.length === 0 && turmas.length === 0,
      doDia: r.doDia, porHora: r.porHora, grade,
    };
  });
  const comLinhas = visao === 'dia' ? dias.slice(0, 1) : dias;
  const vistas = new Set(comLinhas.flatMap((d) => Object.keys(d.porHora)));
  const naGrade = new Set(comLinhas.flatMap((d) => d.grade));
  const horas = [...vistas].sort(ordemHora).map((hora) => ({ hora, foraDaGrade: hora === '' || !naGrade.has(hora) }));
  return {
    visao, ancora, rotulo: rotuloPeriodo(visao, ancora), dias, horas, hoje: ctx.hoje, agora: ctx.agora,
    semanas: visao === 'semana' ? null : gradeDoMes(ancora),
  };
}
