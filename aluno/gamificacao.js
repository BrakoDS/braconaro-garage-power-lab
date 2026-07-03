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

/** Meses completos desde um timestamp (ms). */
export function mesesDesde(ts) {
  if (!ts) return 0;
  const d = new Date(ts), now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m--;
  return Math.max(0, m);
}
/** Maior gasto calórico num único treino registrado. */
export function maxCaloriasTreino(gastos) {
  let max = 0; (gastos || []).forEach((g) => { const c = num(g.calorias); if (c != null && c > max) max = c; }); return max;
}
/** Maior soma de calorias numa mesma semana (Seg-Dom). */
export function maxCaloriasSemana(gastos) {
  const porSemana = new Map();
  (gastos || []).forEach((g) => { const c = num(g.calorias); if (c != null && g.data) { const s = segundaDe(g.data); porSemana.set(s, (porSemana.get(s) || 0) + c); } });
  let max = 0; porSemana.forEach((v) => { if (v > max) max = v; }); return max;
}

/**
 * Catálogo de medalhas com estado (conquistada ou não). Tudo vem dos dados do
 * aluno nos apps: treinos (presenças+gastoTreinos), avaliações, calorias,
 * desafios (por categoria) e feedbacks.
 */
export function medalhas(ctx) {
  const g = (v) => v || 0;
  return [
    { id: 'primeiro', ic: '🎯', nome: 'Começou!', desc: '1º treino registrado', ok: g(ctx.total) >= 1 },
    { id: 'aval1', ic: '📋', nome: 'Ponto de partida', desc: '1ª avaliação feita', ok: g(ctx.nAvaliacoes) >= 1 },
    // tempo de treino
    { id: 'mes1', ic: '📅', nome: '1 mês de treino', desc: '1 mês de casa', ok: g(ctx.meses) >= 1 },
    { id: 'mes3', ic: '📅', nome: '3 meses de treino', desc: '3 meses de casa', ok: g(ctx.meses) >= 3 },
    { id: 'mes6', ic: '🗓️', nome: '6 meses de treino', desc: '6 meses de casa', ok: g(ctx.meses) >= 6 },
    { id: 'mes12', ic: '🎂', nome: '1 ano de treino!', desc: '12 meses de casa', ok: g(ctx.meses) >= 12 },
    // calorias num treino
    { id: 'cal500', ic: '🔥', nome: 'Forno ligado', desc: '500 kcal num treino', ok: g(ctx.calMaxTreino) >= 500 },
    { id: 'cal1000', ic: '🌋', nome: 'Caldeira', desc: '1000 kcal num treino', ok: g(ctx.calMaxTreino) >= 1000 },
    // calorias na semana
    { id: 'sem1000', ic: '⚡', nome: '1000 na semana', desc: '1000 kcal numa semana', ok: g(ctx.calMaxSemana) >= 1000 },
    { id: 'sem2000', ic: '⚡', nome: '2000 na semana', desc: '2000 kcal numa semana', ok: g(ctx.calMaxSemana) >= 2000 },
    { id: 'sem3000', ic: '🚀', nome: '3000 na semana', desc: '3000 kcal numa semana', ok: g(ctx.calMaxSemana) >= 3000 },
    // desafios
    { id: 'agua', ic: '💧', nome: 'Hidratação em dia', desc: '1 semana batendo a meta de água', ok: g(ctx.desAgua) >= 1 },
    { id: 'acucar', ic: '🚫', nome: 'Sem açúcar', desc: '1 semana sem açúcar', ok: g(ctx.desAcucar) >= 1 },
    { id: 'desafio1', ic: '🎖️', nome: 'Desafio aceito', desc: '1 desafio concluído', ok: g(ctx.desafios) >= 1 },
    { id: 'desafio5', ic: '🏅', nome: 'Disciplina', desc: '5 desafios concluídos', ok: g(ctx.desafios) >= 5 },
    // constância / volume de treino
    { id: 'semana3', ic: '⚡', nome: 'Ritmo bom', desc: '3 treinos numa semana', ok: g(ctx.semana) >= 3 },
    { id: 'semana5', ic: '💪', nome: 'Semana cheia', desc: '5 treinos numa semana', ok: g(ctx.semana) >= 5 },
    { id: 'mes10', ic: '📆', nome: '10 no mês', desc: '10 treinos no mês', ok: g(ctx.mes) >= 10 },
    { id: 'streak4', ic: '🔥', nome: 'Em chamas', desc: '4 semanas seguidas', ok: g(ctx.streak) >= 4 },
    { id: 'streak8', ic: '💎', nome: 'Constância', desc: '8 semanas seguidas', ok: g(ctx.streak) >= 8 },
    { id: 'treinos50', ic: '🏋️', nome: 'Meio caminho', desc: '50 treinos no total', ok: g(ctx.total) >= 50 },
    { id: 'treinos100', ic: '🏆', nome: 'Centurião', desc: '100 treinos no total', ok: g(ctx.total) >= 100 },
    { id: 'aval3', ic: '📊', nome: 'De olho na evolução', desc: '3 avaliações feitas', ok: g(ctx.nAvaliacoes) >= 3 },
    // feedbacks
    { id: 'fb1', ic: '💬', nome: 'Deu retorno', desc: '1º feedback enviado', ok: g(ctx.feedbacks) >= 1 },
    { id: 'fb10', ic: '🗣️', nome: 'Voz ativa', desc: '10 feedbacks enviados', ok: g(ctx.feedbacks) >= 10 },
  ];
}
