/**
 * GERADOR DO HIIT DO BOX — lógica pura, sem Firestore e sem rede.
 *
 * Separado do gerador da matriz H (`gerador-box.ts`) de propósito: o H sorteia
 * uma vaga por instância de movimento; o HIIT preenche estações por tempo.
 * Substitui, no servidor, o `coach/montador-de-treino/core/hiitTabata.js`.
 *
 * ── Regras do coach (05/10/2026) ─────────────────────────────────────────────
 *  1. 4 estações — Pernas, Core, Superiores, Cardio — numa ordem sorteada.
 *  2. Cada estação tem EXATAMENTE 4 slots. Exercício unilateral ocupa 2 (lado
 *     direito, depois esquerdo, em slots seguidos); bilateral ocupa 1.
 *  3. Protocolo de toda estação: `PROTOCOLO_HIIT`.
 *  4. Nenhum exercício repete no mesmo dia: nem entre as estações, nem com o
 *     bloco de força do dia (`proibidos`: o H3 da sexta e do sábado).
 *  5. Equipamento: a turma (`alunosPorAula`, padrão 6) se divide entre as 4
 *     estações, que rodam AO MESMO TEMPO, na mesma música. Então:
 *       - alunos por estação = alunos por aula ÷ 4, para cima (6 → 2);
 *       - um exercício precisa de alunos por estação × consumo por aluno de
 *         cada recurso (sandbag para 2 alunos = 2 sandbags; o box tem 1 →
 *         o exercício fica fora);
 *       - no round N toda estação está no MESMO slot, então o slot N das 4
 *         estações somado também não pode passar do limite (agachamento no TRX
 *         em Pernas e remada no TRX em Superiores no mesmo slot = 4 TRX).
 *
 * ── Como monta ───────────────────────────────────────────────────────────────
 * Busca em profundidade, estação por estação e slot por slot, com os
 * candidatos em ordem de preferência (fora do HIIT da semana anterior primeiro,
 * depois o sorteio da semana). A primeira combinação que fecha os 16 slots
 * dentro do inventário é a escolhida. O catálogo é pequeno (~10 por estação) e
 * a conta de equipamento corta cedo, então a busca acaba rápido; o teto de
 * nós é freio contra laço, não regra.
 *
 * Se NÃO existe combinação dentro do inventário, monta de novo ignorando o
 * equipamento (só slots e repetição) e devolve os alertas — como o bloco H:
 * o rascunho existe, a semana não publica. Se nem assim fecha (catálogo pobre),
 * a estação fica incompleta e vira aviso.
 *
 * Determinístico: mesma `semente`, mesmo catálogo e mesmo inventário → mesmo HIIT.
 */
import {
  ESTACOES_HIIT, NOME_ESTACAO_HIIT, PROTOCOLO_HIIT, RECURSOS_HIIT, SLOTS_POR_ESTACAO,
  type AlertaHiit, type EstacaoHiit, type EstacaoProgramada, type ForaPorEquipamento, type ItemCatalogo,
  type RecursoHiit, type SlotHiit,
} from './modelo-box';
import { embaralhar, hashSeed, mulberry32 } from './sorteio';
import { alunosPorEstacao, consumoPorAluno, contarHiit, demandaNaEstacao, slotsDe } from './conta-hiit';

// A conta mora em `conta-hiit.ts` (a validação da semana usa a mesma); quem
// testa o gerador encontra tudo por aqui.
export { alunosPorEstacao, consumoPorAluno, contarHiit, demandaNaEstacao, slotsDe };
export type { ForaPorEquipamento };

/** Teto da busca. Com o catálogo real, uma semana gasta algumas dezenas de nós. */
const MAX_NOS = 200_000;

export interface ContextoHiit {
  catalogo: ReadonlyMap<string, ItemCatalogo>;
  limites: Record<RecursoHiit, number>;
  alunosPorAula: number;
  /** Ids que já estão no dia (o bloco de força do H3) — não podem repetir. */
  proibidos?: ReadonlySet<string>;
  /** Ids do HIIT da semana anterior — vão para o fim da fila (rodízio). */
  semanaPassada?: ReadonlySet<string>;
  /** Semente do sorteio: `${semanaId}:HIIT:${variacao}`. */
  semente: string;
}

export interface HiitGerado {
  /** Na ordem sorteada. */
  estacoes: EstacaoProgramada[];
  alunosPorEstacao: number;
  consumo: Partial<Record<RecursoHiit, number>>;
  /** Vazio quando o HIIT cabe no inventário. */
  alertas: AlertaHiit[];
  avisos: string[];
  /** Exercícios que ficaram fora do sorteio porque nem sozinhos cabem. */
  foraPorEquipamento: ForaPorEquipamento[];
}

/** Grade de trabalho: [estação][slot] → id (ou null, vazio). */
type Grade = (string | null)[][];

/**
 * Monta o HIIT da semana. Ver as regras no topo do arquivo.
 */
export function gerarHiit(ctx: ContextoHiit): HiitGerado {
  const rng = mulberry32(hashSeed(ctx.semente));
  const porEstacao = alunosPorEstacao(ctx.alunosPorAula);
  const proibidos = ctx.proibidos ?? new Set<string>();
  const passada = ctx.semanaPassada ?? new Set<string>();

  // Quem nem sozinho cabe sai antes da busca — e fica registrado.
  const foraPorEquipamento: ForaPorEquipamento[] = [];
  const demanda = new Map<string, Partial<Record<RecursoHiit, number>>>();
  for (const [id, item] of [...ctx.catalogo.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!item.hiit) continue;
    const d = demandaNaEstacao(consumoPorAluno(item), porEstacao);
    const estoura = RECURSOS_HIIT.find((r) => (d[r] ?? 0) > ctx.limites[r]);
    if (estoura) {
      foraPorEquipamento.push({ exercicioId: id, nome: item.nome, recurso: estoura, precisa: d[estoura]!, limite: ctx.limites[estoura] });
    }
    demanda.set(id, d);
  }

  // Fila de cada estação: rodízio primeiro, sorteio dentro da mesma camada.
  // Um sorteio por estação, sempre na ordem de ESTACOES_HIIT: a fila de uma
  // estação não muda quando o catálogo de outra muda.
  const filas = {} as Record<EstacaoHiit, string[]>;
  for (const estacao of ESTACOES_HIIT) {
    const ids = [...demanda.keys()].filter((id) => ctx.catalogo.get(id)!.hiit!.estacoes.includes(estacao) && !proibidos.has(id));
    filas[estacao] = embaralhar(ids, rng).sort((a, b) => Number(passada.has(a)) - Number(passada.has(b)));
  }
  const ordem = embaralhar(ESTACOES_HIIT, rng);

  const fora = new Set(foraPorEquipamento.map((f) => f.exercicioId));
  const avisos: string[] = [];
  // Rodízio primeiro como REGRA, e não só como ordem da fila: a busca escolhe
  // slot a slot, e "novo, novo, novo + repetido" sairia antes de "novo, novo,
  // unilateral novo". Só sem combinação nova é que a semana anterior volta.
  let grade = buscar(filas, demanda, ctx, (id) => !fora.has(id) && !passada.has(id), true)
    ?? buscar(filas, demanda, ctx, (id) => !fora.has(id), true);
  if (!grade) {
    // Sem combinação dentro do inventário: monta pela regra dos slots e alerta.
    grade = buscar(filas, demanda, ctx, () => true, false);
    avisos.push('Não há combinação de exercícios que caiba no inventário: o HIIT saiu com alerta de equipamento.');
  }
  if (!grade) {
    grade = preencherAteOndeDer(filas, ctx);
    for (const [i, estacao] of ESTACOES_HIIT.entries()) {
      const vazios = grade[i].filter((x) => x === null).length;
      if (vazios) {
        avisos.push(`${NOME_ESTACAO_HIIT[estacao]}: o catálogo não fecha os ${SLOTS_POR_ESTACAO} slots (faltam ${vazios}).`);
      }
    }
  }

  const estacoes = ordem.map((estacao) => estacaoProgramada(estacao, grade![ESTACOES_HIIT.indexOf(estacao)], ctx.catalogo));
  for (const id of new Set(grade.flat())) {
    if (id && passada.has(id)) avisos.push(`${ctx.catalogo.get(id)!.nome} repete o HIIT da semana anterior: faltou opção na estação.`);
  }
  const conta = contarHiit(estacoes, ctx.limites, ctx.alunosPorAula);
  return { estacoes, alunosPorEstacao: porEstacao, consumo: conta.consumo, alertas: conta.alertas, avisos, foraPorEquipamento };
}

/**
 * A busca. `comEquipamento` liga a conta do inventário (por exercício e por
 * slot somando as estações). Devolve a grade completa ou `null`.
 */
function buscar(
  filas: Record<EstacaoHiit, string[]>,
  demanda: ReadonlyMap<string, Partial<Record<RecursoHiit, number>>>,
  ctx: ContextoHiit,
  permitido: (id: string) => boolean,
  comEquipamento: boolean,
): Grade | null {
  const grade: Grade = ESTACOES_HIIT.map(() => Array<string | null>(SLOTS_POR_ESTACAO).fill(null));
  // Uso de cada recurso em cada slot, somando as estações.
  const uso: Partial<Record<RecursoHiit, number>>[] = Array.from({ length: SLOTS_POR_ESTACAO }, () => ({}));
  const usados = new Set<string>();
  let nos = 0;

  const cabe = (id: string, slots: number[]): boolean => {
    if (!comEquipamento) return true;
    const d = demanda.get(id)!;
    return slots.every((s) => (Object.entries(d) as [RecursoHiit, number][])
      .every(([r, n]) => (uso[s][r] ?? 0) + n <= ctx.limites[r]));
  };
  const marcar = (id: string, slots: number[], sinal: 1 | -1): void => {
    for (const s of slots) {
      for (const [r, n] of Object.entries(demanda.get(id)!) as [RecursoHiit, number][]) uso[s][r] = (uso[s][r] ?? 0) + sinal * n;
    }
  };

  /** Preenche a estação `e` a partir do slot `s`; ao fechar, pergunta a `aoFechar`. Sempre desfaz. */
  const encher = (e: number, s: number, aoFechar: () => boolean): boolean => {
    if (++nos > MAX_NOS) return false;
    if (s === SLOTS_POR_ESTACAO) return aoFechar();
    for (const id of filas[ESTACOES_HIIT[e]]) {
      if (usados.has(id) || !permitido(id)) continue;
      const n = slotsDe(ctx.catalogo.get(id)!);
      if (s + n > SLOTS_POR_ESTACAO) continue; // unilateral não cabe no último slot
      const slots = n === 2 ? [s, s + 1] : [s];
      if (!cabe(id, slots)) continue;
      usados.add(id);
      marcar(id, slots, 1);
      for (const x of slots) grade[e][x] = id;
      const fechou = encher(e, s + n, aoFechar);
      for (const x of slots) grade[e][x] = null;
      marcar(id, slots, -1);
      usados.delete(id);
      if (fechou) return true;
    }
    return false;
  };

  // Estação por estação. Ao fechar uma, confere ANTES se cada uma das
  // seguintes ainda fecha sozinha com o que já está ocupado: sem isso, um
  // conflito que só aparece na última estação faria a busca permutar à toa as
  // do meio (o Core, que não usa equipamento) até estourar o teto.
  let resultado: Grade | null = null;
  const estacao = (e: number): boolean => {
    if (e === ESTACOES_HIIT.length) {
      resultado = grade.map((linha) => [...linha]);
      return true;
    }
    return encher(e, 0, () => {
      for (let seguinte = e + 1; seguinte < ESTACOES_HIIT.length; seguinte++) {
        if (!encher(seguinte, 0, () => true)) return false;
      }
      return estacao(e + 1);
    });
  };
  estacao(0);
  return resultado;
}

/** Último recurso: guloso, sem equipamento, até onde o catálogo deixar. */
function preencherAteOndeDer(filas: Record<EstacaoHiit, string[]>, ctx: ContextoHiit): Grade {
  const usados = new Set<string>();
  return ESTACOES_HIIT.map((estacao) => {
    const slots: (string | null)[] = [];
    for (const id of filas[estacao]) {
      const n = slotsDe(ctx.catalogo.get(id)!);
      if (usados.has(id) || slots.length + n > SLOTS_POR_ESTACAO) continue;
      usados.add(id);
      for (let i = 0; i < n; i++) slots.push(id);
    }
    while (slots.length < SLOTS_POR_ESTACAO) slots.push(null);
    return slots;
  });
}

function estacaoProgramada(estacao: EstacaoHiit, linha: (string | null)[], catalogo: ReadonlyMap<string, ItemCatalogo>): EstacaoProgramada {
  const slots: SlotHiit[] = [];
  for (let s = 0; s < linha.length; s++) {
    const id = linha[s];
    if (!id) continue;
    const item = catalogo.get(id)!;
    const base = { exercicioId: id, nome: item.nome, consumoPorAluno: consumoPorAluno(item) };
    if (item.unilateral) {
      slots.push({ ...base, lado: 'D' }, { ...base, lado: 'E' });
      s++;
    } else {
      slots.push({ ...base, lado: null });
    }
  }
  return { estacao, nome: NOME_ESTACAO_HIIT[estacao], protocolo: PROTOCOLO_HIIT, slots };
}
