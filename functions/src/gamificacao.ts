/*
 * CÓPIA FIEL de `app-mobile/src/core/gamificacao.ts` (que é o porte de
 * `compartilhado/regras/gamificacao.js` do site). Não edite aqui sem editar lá:
 * `npm run checar:conquistas` compara esta cópia com o original do site.
 *
 * Está copiada, e não importada, porque o deploy das functions só envia a pasta
 * `functions/`. Ver "Código compartilhado" no README das functions.
 */
/**
 * Gamificação — porte fiel de `teste-hibrido/compartilhado/regras/gamificacao.js`, mais a medalha do app.
 *
 * Mesma regra do [antropometria.ts]: as medalhas precisam ser idênticas às do
 * Portal web, senão o aluno conquista algo no navegador que some no celular.
 * `npm run checar` importa o original no Node e compara.
 *
 * A única diferença deliberada é a medalha "1ª vez no app", que só existe aqui —
 * o portal não tem como saber que o aluno instalou o aplicativo.
 */

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Segunda-feira (ISO) da semana de uma data ISO. */
function segundaDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return isoLocal(d);
}

function semanaAnterior(isoSeg: string): string {
  const d = new Date(isoSeg + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  return isoLocal(d);
}

export interface Gasto {
  data?: string;
  calorias?: unknown;
}

/** Dias de treino (únicos, ordenados): presenças do coach + treinos registrados no Portal. */
export function diasTreino(
  presencas: string[] | null | undefined,
  gastos: Gasto[] | null | undefined,
): string[] {
  const set = new Set<string>();
  (presencas || []).forEach((d) => d && set.add(d));
  (gastos || []).forEach((g) => g && g.data && set.add(g.data));
  return [...set].sort();
}

/**
 * Semanas consecutivas com pelo menos `meta` treinos.
 *
 * A semana em curso conta se já bateu a meta, mas não quebra a sequência se
 * ainda não — senão toda segunda-feira o aluno perderia o streak.
 */
export function streakSemanas(dias: string[], meta = 1): number {
  if (!dias.length) return 0;
  const porSemana = new Map<string, number>();
  dias.forEach((d) => {
    const s = segundaDe(d);
    porSemana.set(s, (porSemana.get(s) || 0) + 1);
  });
  let cursor = segundaDe(isoLocal(new Date()));
  let streak = 0;
  if ((porSemana.get(cursor) || 0) >= meta) streak++;
  cursor = semanaAnterior(cursor);
  while ((porSemana.get(cursor) || 0) >= meta) {
    streak++;
    cursor = semanaAnterior(cursor);
  }
  return streak;
}

export interface Contadores {
  semana: number;
  mes: number;
  total: number;
}

export function contadores(dias: string[]): Contadores {
  const hoje = new Date();
  const seg = segundaDe(isoLocal(hoje));
  const mesPrefix = isoLocal(hoje).slice(0, 7);
  return {
    semana: dias.filter((d) => segundaDe(d) === seg).length,
    mes: dias.filter((d) => d.slice(0, 7) === mesPrefix).length,
    total: dias.length,
  };
}

export interface Recorde {
  key: string;
  label: string;
  un: string;
  ic: string;
  valor: number;
  quando: string | null;
}

/** Recordes pessoais a partir dos testes físicos das avaliações. */
export function recordes(
  avaliacoes: Array<{ testes?: Record<string, unknown>; dataRealizada?: string }> | null | undefined,
): Recorde[] {
  const testes = [
    { key: 'flexoes', label: 'Flexões', un: '', ic: '💪' },
    { key: 'prancha', label: 'Prancha', un: 's', ic: '🧘' },
    { key: 'agachamentos', label: 'Agachamentos (1 min)', un: '', ic: '🦵' },
    { key: 'abdominais', label: 'Abdominais (1 min)', un: '', ic: '🔥' },
  ];
  const achados: Recorde[] = [];
  for (const t of testes) {
    let melhor: number | null = null;
    let quando: string | null = null;
    for (const av of avaliacoes || []) {
      const v = num(av.testes?.[t.key]);
      if (v != null && (melhor == null || v > melhor)) {
        melhor = v;
        quando = av.dataRealizada ?? null;
      }
    }
    if (melhor != null) achados.push({ ...t, valor: melhor, quando });
  }
  return achados;
}

/** Meses completos desde um timestamp (ms). */
export function mesesDesde(ts: number | null | undefined): number {
  if (!ts) return 0;
  const d = new Date(ts);
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m--;
  return Math.max(0, m);
}

/** Maior gasto calórico num único treino registrado. */
export function maxCaloriasTreino(gastos: Gasto[] | null | undefined): number {
  let max = 0;
  (gastos || []).forEach((g) => {
    const c = num(g.calorias);
    if (c != null && c > max) max = c;
  });
  return max;
}

/** Maior soma de calorias numa mesma semana (seg–dom). */
export function maxCaloriasSemana(gastos: Gasto[] | null | undefined): number {
  const porSemana = new Map<string, number>();
  (gastos || []).forEach((g) => {
    const c = num(g.calorias);
    if (c != null && g.data) {
      const s = segundaDe(g.data);
      porSemana.set(s, (porSemana.get(s) || 0) + c);
    }
  });
  let max = 0;
  porSemana.forEach((v) => {
    if (v > max) max = v;
  });
  return max;
}

export interface ContextoMedalhas {
  total?: number;
  mes?: number;
  semana?: number;
  streak?: number;
  nAvaliacoes?: number;
  desafios?: number;
  desAgua?: number;
  desAcucar?: number;
  meses?: number;
  calMaxTreino?: number;
  calMaxSemana?: number;
  feedbacks?: number;
  /** Exclusiva do app: o aluno já abriu o Garage App alguma vez. */
  usouApp?: boolean;
}

export interface Medalha {
  id: string;
  ic: string;
  nome: string;
  desc: string;
  ok: boolean;
}

/**
 * Catálogo de medalhas com estado.
 *
 * Tudo vem dos dados que o aluno já gera nos apps: treinos (presenças +
 * gastoTreinos), avaliações, calorias, desafios e feedbacks.
 */
export function medalhas(ctx: ContextoMedalhas): Medalha[] {
  const g = (v: number | undefined) => v || 0;
  return [
    // exclusiva do app — o portal não sabe que o aluno instalou o aplicativo
    { id: 'appPrimeiraVez', ic: '📱', nome: '1ª vez no app', desc: 'Entrou no Garage App', ok: ctx.usouApp === true },

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

/** Id da medalha que só o app concede — usado no teste de paridade com o portal. */
export const MEDALHA_DO_APP = 'appPrimeiraVez';
