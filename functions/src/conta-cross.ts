/**
 * A CONTA DE EQUIPAMENTO DO CROSS E DO HYROX — lógica pura, sem dependência do resto.
 *
 * Mora fora dos geradores pelo mesmo motivo do `conta-hiit.ts`: a validação da
 * semana (`semana-box.ts`) e os geradores usam a MESMA conta, e os geradores já
 * dependem da semana.
 *
 * ── Cross: regra MISTA (decisão do coach, 06/10/2026) ───────────────────────
 *  - EMOM (estrito): no mesmo minuto a turma INTEIRA faz o mesmo movimento.
 *    Cada movimento precisa de alunos por aula × consumo por aluno, e os
 *    movimentos não somam entre si (são minutos diferentes).
 *  - AMRAP, For Time, Chipper (escalonado): a turma se espalha pelo WOD, cada
 *    aluno num ponto. Cada movimento tem alunos por aula ÷ nº de movimentos
 *    (para cima) ao mesmo tempo, e os movimentos SOMAM: dois movimentos de
 *    barra no mesmo AMRAP disputam as mesmas barras.
 *
 * ── Hyrox ────────────────────────────────────────────────────────────────────
 * For time em rodízio: a turma passa pelas estações uma de cada vez, então
 * basta a estação ter as unidades que ela pede ATIVAS (1 sled, 1 sandbag). O
 * gargalo de fila é do coach organizar, como sempre foi.
 */
import {
  ALUNOS_POR_EQUIPAMENTO_TECNICA, RECURSO_CROSS_DO_EQUIPAMENTO, RECURSOS_BOX, RECURSOS_CROSS, REGRA_FORMATO_CROSS,
  type AlertaCross, type AlertaHyrox, type FormatoCross, type ItemCatalogo, type RecursoBox, type RecursoCross,
} from './modelo-box';

/**
 * Unidades de cada recurso do Cross que UM aluno usa: 1 de cada recurso que os
 * `equipamentos` tocam, a menos que `cross.consumoPorAluno` (ou, sem ele, o
 * `hiit.consumoPorAluno` — é o mesmo movimento) diga outro número. Zero sai da conta.
 */
export function consumoCross(item: Pick<ItemCatalogo, 'equipamentos' | 'hiit' | 'cross'>): Partial<Record<RecursoCross, number>> {
  const consumo: Partial<Record<RecursoCross, number>> = {};
  for (const e of item.equipamentos) {
    const r = RECURSO_CROSS_DO_EQUIPAMENTO[e];
    if (r) consumo[r] = 1;
  }
  Object.assign(consumo, item.cross?.consumoPorAluno ?? item.hiit?.consumoPorAluno);
  for (const r of RECURSOS_CROSS) if (consumo[r] === 0) delete consumo[r];
  return consumo;
}

/** Alunos fazendo CADA movimento ao mesmo tempo, no formato. */
export function alunosPorMovimento(formato: FormatoCross, alunosPorAula: number, movimentos: number): number {
  if (!REGRA_FORMATO_CROSS[formato].escalonado) return Math.max(1, alunosPorAula);
  return Math.max(1, Math.ceil(alunosPorAula / Math.max(1, movimentos)));
}

/** O que um movimento exige: alunos no movimento × consumo por aluno. */
export function demandaDoMovimento(
  consumo: Partial<Record<RecursoCross, number>>,
  alunos: number,
): Partial<Record<RecursoCross, number>> {
  const d: Partial<Record<RecursoCross, number>> = {};
  for (const [r, n] of Object.entries(consumo) as [RecursoCross, number][]) if (n > 0) d[r] = n * alunos;
  return d;
}

/** Alunos por unidade na Técnica / Força: duplas revezando, então turma ÷ 2 (para cima) unidades. */
export function unidadesNaTecnica(alunosPorAula: number): number {
  return Math.max(1, Math.ceil(alunosPorAula / ALUNOS_POR_EQUIPAMENTO_TECNICA));
}

/**
 * A conta de equipamento do Cross montado — o gerado ou o editado. Usa o
 * `consumoPorAluno` gravado em cada movimento (não relê o catálogo).
 *
 *  - `consumo`: o pico de cada recurso NO WOD (soma no escalonado, maior no EMOM);
 *  - `alertas`: no EMOM, um por movimento que sozinho passa; no escalonado, um
 *    por recurso cuja SOMA passa, com todos os movimentos que o usam;
 *  - e a Técnica / Força, que acontece ANTES (não soma com o WOD): duplas
 *    revezando, turma ÷ 2 × consumo do foco. Passou: alerta com `bloco: 'tecnica'`.
 */
export function contarCross(
  wod: {
    formato: FormatoCross;
    movimentos: readonly { exercicioId: string; consumoPorAluno?: Partial<Record<RecursoCross, number>> }[];
    tecnica?: { exercicioId: string; consumoPorAluno?: Partial<Record<RecursoCross, number>> } | null;
  },
  limites: Record<RecursoCross, number>,
  alunosPorAula: number,
): { consumo: Partial<Record<RecursoCross, number>>; alertas: AlertaCross[] } {
  const alunos = alunosPorMovimento(wod.formato, alunosPorAula, wod.movimentos.length);
  const escalonado = REGRA_FORMATO_CROSS[wod.formato].escalonado;
  const consumo: Partial<Record<RecursoCross, number>> = {};
  const alertas: AlertaCross[] = [];
  const quem: Partial<Record<RecursoCross, string[]>> = {};

  for (const m of wod.movimentos) {
    for (const [r, n] of Object.entries(demandaDoMovimento(m.consumoPorAluno ?? {}, alunos)) as [RecursoCross, number][]) {
      (quem[r] ??= []).push(m.exercicioId);
      if (escalonado) {
        consumo[r] = (consumo[r] ?? 0) + n;
      } else {
        consumo[r] = Math.max(consumo[r] ?? 0, n);
        if (n > limites[r]) alertas.push({ recurso: r, usado: n, limite: limites[r], exercicios: [m.exercicioId] });
      }
    }
  }
  if (escalonado) {
    for (const r of RECURSOS_CROSS) {
      if ((consumo[r] ?? 0) > limites[r]) alertas.push({ recurso: r, usado: consumo[r]!, limite: limites[r], exercicios: quem[r]! });
    }
  }
  if (wod.tecnica) {
    const d = demandaDoMovimento(wod.tecnica.consumoPorAluno ?? {}, unidadesNaTecnica(alunosPorAula));
    for (const [r, n] of Object.entries(d) as [RecursoCross, number][]) {
      if (n > limites[r]) alertas.push({ recurso: r, usado: n, limite: limites[r], exercicios: [wod.tecnica.exercicioId], bloco: 'tecnica' });
    }
  }
  return { consumo, alertas };
}

/** Cada recurso pedido está ativo no inventário (estação ou substituta do Hyrox). */
export function cabeNoInventario(
  recursos: Partial<Record<RecursoBox, number>>,
  limites: Partial<Record<RecursoBox, number>>,
): boolean {
  return (Object.entries(recursos) as [RecursoBox, number][]).every(([r, n]) => n <= (limites[r] ?? 0));
}

/**
 * As estações do Hyrox sem o equipamento que pedem. `temSubstituta` vem de
 * quem chama: a estação não está na substituta, e a substituta CABE no
 * inventário — é a troca que a tela pode oferecer.
 */
export function contarHyrox(
  estacoes: readonly { estacao: AlertaHyrox['estacao']; recursos: Partial<Record<RecursoBox, number>>; temSubstituta?: boolean }[],
  limites: Partial<Record<RecursoBox, number>>,
): AlertaHyrox[] {
  const alertas: AlertaHyrox[] = [];
  for (const e of estacoes) {
    for (const r of RECURSOS_BOX) {
      const precisa = e.recursos[r] ?? 0;
      const limite = limites[r] ?? 0;
      if (precisa > 0 && precisa > limite) alertas.push({ estacao: e.estacao, recurso: r, precisa, limite, temSubstituta: !!e.temSubstituta });
    }
  }
  return alertas;
}
