// @ts-check
/**
 * Gamificação do Portal do Aluno — cálculos puros (sem DOM).
 * Usa os dados que já existem: presenças (check-in do coach) + treinos que o
 * aluno registra na Nutrição (gastoTreinos) + testes físicos das avaliações.
 */

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Segunda-feira (ISO) da semana de uma data ISO. */
function segundaDe(iso) {
  const d = new Date(iso + 'T00:00:00'); const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return isoLocal(d);
}
function semanaAnterior(isoSeg) { const d = new Date(isoSeg + 'T00:00:00'); d.setDate(d.getDate() - 7); return isoLocal(d); }

/** Dias de treino (únicos, ordenados): presenças + treinos registrados no Portal. */
export function diasTreino(presencas, gastos) {
  const set = new Set();
  (presencas || []).forEach((d) => d && set.add(d));
  (gastos || []).forEach((g) => g && g.data && set.add(g.data));
  return [...set].sort();
}

/** Streak: semanas consecutivas com ≥ meta treinos. Não quebra se a semana atual ainda está em curso. */
export function streakSemanas(dias, meta = 1) {
  if (!dias.length) return 0;
  const porSemana = new Map();
  dias.forEach((d) => { const s = segundaDe(d); porSemana.set(s, (porSemana.get(s) || 0) + 1); });
  let cursor = segundaDe(isoLocal(new Date()));
  let streak = 0;
  if ((porSemana.get(cursor) || 0) >= meta) streak++;      // semana atual conta se já bateu a meta
  cursor = semanaAnterior(cursor);                          // ...e seguimos para trás sem penalizar semana em curso
  while ((porSemana.get(cursor) || 0) >= meta) { streak++; cursor = semanaAnterior(cursor); }
  return streak;
}

/** Segunda a domingo (7 Date) da semana corrente — para os desafios. */
export function diasDaSemana() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dow = hoje.getDay();
  const mon = new Date(hoje); mon.setDate(hoje.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
export const isoDia = (d) => isoLocal(d);

/** Contadores de treino (semana atual, mês atual, total). */
export function contadores(dias) {
  const hoje = new Date();
  const seg = segundaDe(isoLocal(hoje));
  const mesPrefix = isoLocal(hoje).slice(0, 7);
  const semana = dias.filter((d) => segundaDe(d) === seg).length;
  const mes = dias.filter((d) => d.slice(0, 7) === mesPrefix).length;
  return { semana, mes, total: dias.length };
}

/** Recordes pessoais a partir dos testes físicos das avaliações (melhor marca + quando). */
export function recordes(avaliacoes) {
  const testes = [
    { key: 'flexoes', label: 'Flexões', un: '', ic: '💪' },
    { key: 'prancha', label: 'Prancha', un: 's', ic: '🧘' },
    { key: 'agachamentos', label: 'Agachamentos (1 min)', un: '', ic: '🦵' },
    { key: 'abdominais', label: 'Abdominais (1 min)', un: '', ic: '🔥' },
  ];
  return testes.map((t) => {
    let melhor = null, quando = null;
    (avaliacoes || []).forEach((av) => {
      const v = num(av.testes?.[t.key]);
      if (v != null && (melhor == null || v > melhor)) { melhor = v; quando = av.dataRealizada; }
    });
    return { ...t, valor: melhor, quando };
  }).filter((r) => r.valor != null);
}

/**
 * Catálogo de medalhas com estado (conquistada ou não).
 * @param {{total:number, mes:number, semana:number, streak:number, nAvaliacoes:number, desafios?:number}} ctx
 */
export function medalhas(ctx) {
  const defs = [
    { id: 'primeiro', ic: '🎯', nome: 'Começou!', desc: '1º treino registrado', ok: ctx.total >= 1 },
    { id: 'desafio1', ic: '🎖️', nome: 'Desafio aceito', desc: '1 desafio concluído', ok: (ctx.desafios || 0) >= 1 },
    { id: 'desafio5', ic: '🏅', nome: 'Disciplina', desc: '5 desafios concluídos', ok: (ctx.desafios || 0) >= 5 },
    { id: 'semana3', ic: '⚡', nome: 'Ritmo bom', desc: '3 treinos numa semana', ok: ctx.semana >= 3 },
    { id: 'semana5', ic: '🚀', nome: 'Semana cheia', desc: '5 treinos numa semana', ok: ctx.semana >= 5 },
    { id: 'mes10', ic: '📅', nome: '10 no mês', desc: '10 treinos no mês', ok: ctx.mes >= 10 },
    { id: 'streak4', ic: '🔥', nome: 'Em chamas', desc: '4 semanas seguidas', ok: ctx.streak >= 4 },
    { id: 'streak8', ic: '💎', nome: 'Constância', desc: '8 semanas seguidas', ok: ctx.streak >= 8 },
    { id: 'treinos50', ic: '🏋️', nome: 'Meio caminho', desc: '50 treinos no total', ok: ctx.total >= 50 },
    { id: 'treinos100', ic: '🏆', nome: 'Centurião', desc: '100 treinos no total', ok: ctx.total >= 100 },
    { id: 'aval3', ic: '📊', nome: 'De olho na evolução', desc: '3 avaliações feitas', ok: ctx.nAvaliacoes >= 3 },
  ];
  return defs;
}
