/**
 * A CONTA DE EQUIPAMENTO DO HIIT — lógica pura, sem dependência do resto.
 *
 * Mora fora de `gerador-hiit.ts` porque a validação da semana (`semana-box.ts`)
 * e o gerador usam a MESMA conta, e o gerador já depende da semana: aqui não
 * há ciclo de import. Regras em `gerador-hiit.ts` (topo) e no README.
 */
import {
  ESTACOES_HIIT, RECURSO_HIIT_DO_EQUIPAMENTO, RECURSOS_HIIT, SLOTS_POR_ESTACAO,
  type AlertaHiit, type ItemCatalogo, type RecursoHiit,
} from './modelo-box';

/** Alunos que dividem uma estação: a turma se espalha pelas 4. */
export function alunosPorEstacao(alunosPorAula: number): number {
  return Math.max(1, Math.ceil(alunosPorAula / ESTACOES_HIIT.length));
}

/** Slots que um exercício ocupa numa estação. */
export function slotsDe(item: Pick<ItemCatalogo, 'unilateral'>): 1 | 2 {
  return item.unilateral ? 2 : 1;
}

/**
 * Unidades de cada recurso do HIIT que UM aluno usa: 1 de cada recurso que os
 * `equipamentos` tocam, a menos que `hiit.consumoPorAluno` diga outro número.
 * Zero sai da conta.
 */
export function consumoPorAluno(item: Pick<ItemCatalogo, 'equipamentos' | 'hiit'>): Partial<Record<RecursoHiit, number>> {
  const consumo: Partial<Record<RecursoHiit, number>> = {};
  for (const e of item.equipamentos) {
    const r = RECURSO_HIIT_DO_EQUIPAMENTO[e];
    if (r) consumo[r] = 1;
  }
  Object.assign(consumo, item.hiit?.consumoPorAluno);
  for (const r of RECURSOS_HIIT) if (consumo[r] === 0) delete consumo[r];
  return consumo;
}

/** O que um exercício exige numa estação: alunos da estação × consumo por aluno. */
export function demandaNaEstacao(
  consumo: Partial<Record<RecursoHiit, number>>,
  alunosEstacao: number,
): Partial<Record<RecursoHiit, number>> {
  const d: Partial<Record<RecursoHiit, number>> = {};
  for (const [r, n] of Object.entries(consumo) as [RecursoHiit, number][]) if (n > 0) d[r] = n * alunosEstacao;
  return d;
}

/**
 * A conta de equipamento de um HIIT montado — o gerado ou o que o coach editou.
 * Usa o `consumoPorAluno` gravado em cada slot (não relê o catálogo).
 *
 *  - `consumo`: o pico de cada recurso num mesmo slot, somando as estações.
 *  - `alertas`: exercício que sozinho passa do limite (`slot: null`, uma vez
 *    só, mesmo unilateral) e slot em que DOIS OU MAIS exercícios juntos passam.
 */
export function contarHiit(
  estacoes: readonly { slots: readonly { exercicioId: string; consumoPorAluno?: Partial<Record<RecursoHiit, number>> }[] }[],
  limites: Record<RecursoHiit, number>,
  alunosPorAula: number,
): { consumo: Partial<Record<RecursoHiit, number>>; alertas: AlertaHiit[] } {
  const porEstacao = alunosPorEstacao(alunosPorAula);
  const consumo: Partial<Record<RecursoHiit, number>> = {};
  const alertas: AlertaHiit[] = [];
  const sozinhos = new Set<string>();

  for (let s = 0; s < SLOTS_POR_ESTACAO; s++) {
    const uso: Partial<Record<RecursoHiit, { n: number; ids: string[] }>> = {};
    for (const e of estacoes) {
      const slot = e.slots[s];
      if (!slot?.exercicioId) continue;
      for (const [r, n] of Object.entries(demandaNaEstacao(slot.consumoPorAluno ?? {}, porEstacao)) as [RecursoHiit, number][]) {
        const u = (uso[r] ??= { n: 0, ids: [] });
        u.n += n;
        u.ids.push(slot.exercicioId);
        if (n > limites[r] && !sozinhos.has(`${slot.exercicioId}:${r}`)) {
          sozinhos.add(`${slot.exercicioId}:${r}`);
          alertas.push({ recurso: r, usado: n, limite: limites[r], slot: null, exercicios: [slot.exercicioId] });
        }
      }
    }
    for (const r of RECURSOS_HIIT) {
      const u = uso[r];
      if (!u) continue;
      consumo[r] = Math.max(consumo[r] ?? 0, u.n);
      if (u.n > limites[r] && u.ids.length > 1) {
        alertas.push({ recurso: r, usado: u.n, limite: limites[r], slot: s + 1, exercicios: u.ids });
      }
    }
  }
  return { consumo, alertas };
}
