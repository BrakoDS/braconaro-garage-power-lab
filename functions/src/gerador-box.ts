/**
 * GERADOR DA MATRIZ SEMANAL DO BOX — lógica pura, sem Firestore e sem rede.
 *
 * Substitui, para a semana do box, a montagem que o navegador fazia em
 * `coach/montador-de-treino/core/gerador.js`. Quem chama é `gerarMatrizSemanalBox`
 * (`index.ts`), que só lê o catálogo, o inventário e a semana anterior, chama
 * `gerarSemana` e grava o rascunho.
 *
 * ── Os três passos, por sessão H ─────────────────────────────────────────────
 *  1. SORTEIO por vaga: cada instância de `MATRIZ_H` recebe um exercício do
 *     catálogo com aquela instância, numa ordem embaralhada pelo RNG da semana.
 *  2. RODÍZIO: o exercício exato da semana anterior fica por último na fila. Só
 *     volta se a instância não tiver mais nenhuma opção — e aí vira aviso.
 *     Dentro da mesma semana, H1/H2/H3 também evitam repetir entre si, mas com
 *     prioridade menor que a semana anterior.
 *  3. TRAVA DE EQUIPAMENTO: com o bloco montado, enquanto algum recurso passar
 *     do limite ativo do inventário, o exercício conflitante MAIS PARA O FIM do
 *     bloco é re-sorteado entre os da mesma instância que não usam aquele
 *     recurso (nem estouram outro). Sem troca possível, o alerta fica e a
 *     semana não publica.
 *
 * Determinístico: a mesma semana, com a mesma semana anterior, o mesmo catálogo
 * e o mesmo inventário, sai igual. `variacao` muda o sorteio.
 */
import {
  ALUNOS_POR_AULA_PADRAO, DESCANSO_COMPOSTO_PESADO_SEG, DESCANSO_POR_INSTANCIA, DIAS_SEMANA, GRADE_SEMANAL,
  INVENTARIO_HIIT_PADRAO, MATRIZ_H, PRESCRICAO_FORCA, RECURSOS_INVENTARIO, SESSOES_H, VAGAS_COMPOSTO_PESADO,
  type AlertaEquipamento, type AlertaHiitDaSemana, type DiaProgramado, type DiaSemana, type ExercicioCatalogo,
  type ForaPorEquipamento, type Instancia, type ItemCatalogo, type RecursoHiit, type RecursoInventario, type SessaoH,
  type TrocaEquipamento,
} from './modelo-box';
import { alertasDaSemana, alertasHiitDaSemana, consumoDoDia, lerDias } from './semana-box';
import { embaralhar, hashSeed, mulberry32 } from './sorteio';
import { gerarHiit } from './gerador-hiit';

/**
 * Descanso entre séries de uma vaga do bloco (`posicao` começa em 1).
 * A instância vence a posição: core descansa 45 s onde estiver; depois, as
 * duas primeiras vagas do H1 e do H2 (compostos pesados) descansam 120 s; o
 * resto fica no padrão de `PRESCRICAO_FORCA`.
 */
export function descansoDaVaga(sessao: SessaoH, posicao: number, instancia: Instancia): number {
  const porInstancia = DESCANSO_POR_INSTANCIA[instancia];
  if (porInstancia !== undefined) return porInstancia;
  if (VAGAS_COMPOSTO_PESADO[sessao].includes(posicao)) return DESCANSO_COMPOSTO_PESADO_SEG;
  return PRESCRICAO_FORCA.descansos.entreSeriesSeg;
}

/** Teto de trocas por bloco: 6 vagas × recursos já sobra; é freio contra laço, não regra. */
const MAX_TROCAS_POR_BLOCO = 30;


/** Os ids de exercício usados nos blocos de uma semana gravada (formato tolerante). */
export function idsDaSemana(dias: unknown): Set<string> {
  const ids = new Set<string>();
  const d = (dias ?? {}) as Record<string, { blocoPrincipal?: unknown } | undefined>;
  for (const dia of DIAS_SEMANA) {
    const bloco = d[dia]?.blocoPrincipal;
    if (!Array.isArray(bloco)) continue;
    for (const x of bloco) {
      const id = (x as { exercicioId?: unknown } | null)?.exercicioId;
      if (typeof id === 'string' && id) ids.add(id);
    }
  }
  return ids;
}

/** Os ids de exercício do HIIT de uma semana gravada (formato tolerante) — o rodízio do HIIT. */
export function idsDoHiit(dias: unknown): Set<string> {
  const ids = new Set<string>();
  const d = (dias ?? {}) as Record<string, { hiit?: { estacoes?: unknown } | null } | undefined>;
  for (const dia of DIAS_SEMANA) {
    const estacoes = d[dia]?.hiit?.estacoes;
    if (!Array.isArray(estacoes)) continue;
    for (const e of estacoes) {
      const slots = (e as { slots?: unknown } | null)?.slots;
      if (!Array.isArray(slots)) continue;
      for (const x of slots) {
        const id = (x as { exercicioId?: unknown } | null)?.exercicioId;
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
  }
  return ids;
}

export interface ContextoBloco {
  catalogo: ReadonlyMap<string, ExercicioCatalogo>;
  limites: Record<RecursoInventario, number>;
  /** Ids da semana anterior — o rodízio. */
  semanaPassada: ReadonlySet<string>;
  /** Ids já escolhidos nesta semana, por outra sessão H. */
  usadosNaSemana: ReadonlySet<string>;
  rng: () => number;
}

/**
 * Prioridade de um candidato: menor é melhor. A semana anterior pesa MAIS que
 * a repetição dentro da semana — o rodízio entre semanas é o que o coach pediu;
 * variar entre H1, H2 e H3 é bônus.
 */
function camada(id: string, ctx: ContextoBloco): number {
  return (ctx.semanaPassada.has(id) ? 2 : 0) + (ctx.usadosNaSemana.has(id) ? 1 : 0);
}

/** Candidatos de uma instância em ordem de preferência (camada, depois o sorteio). */
function filaDaInstancia(instancia: Instancia, ctx: ContextoBloco): string[] {
  const ids = [...ctx.catalogo.entries()].filter(([, e]) => e.instancia === instancia).map(([id]) => id).sort();
  const sorteados = embaralhar(ids, ctx.rng);
  // `sort` é estável: dentro da mesma camada, vale a ordem do sorteio.
  return sorteados.sort((a, b) => camada(a, ctx) - camada(b, ctx));
}

/**
 * A MESMA ordem de preferência do gerador, para quem sugere troca fora dele
 * (`edicao-box.ts`): fora da semana anterior primeiro, depois fora da semana
 * atual, sorteio estável pela `semente`. Um segundo critério de "melhor
 * substituto" faria a edição manual e o sorteio discordarem sobre o mesmo box.
 */
export function candidatosEmOrdem(
  instancia: Instancia,
  o: { catalogo: ReadonlyMap<string, ExercicioCatalogo>; semanaPassada: ReadonlySet<string>; usadosNaSemana: ReadonlySet<string>; semente: string },
): string[] {
  return filaDaInstancia(instancia, {
    catalogo: o.catalogo, semanaPassada: o.semanaPassada, usadosNaSemana: o.usadosNaSemana,
    limites: {} as Record<RecursoInventario, number>, rng: mulberry32(hashSeed(o.semente)),
  });
}

/** Recursos acima do limite num bloco (na ordem de `RECURSOS_INVENTARIO`) e quantas unidades sobram ao todo. */
function excedentes(ids: string[], ctx: ContextoBloco): { recursos: RecursoInventario[]; sobra: number } {
  const consumo = consumoDoDia(ids.map((exercicioId) => ({ exercicioId })), ctx.catalogo);
  const recursos = RECURSOS_INVENTARIO.filter((r) => (consumo[r] ?? 0) > ctx.limites[r]);
  return { recursos, sobra: recursos.reduce((s, r) => s + (consumo[r] ?? 0) - ctx.limites[r], 0) };
}

const usa = (id: string, r: RecursoInventario, ctx: ContextoBloco): boolean =>
  consumoDoDia([{ exercicioId: id }], ctx.catalogo)[r] === 1;

export interface BlocoGerado {
  ids: string[];
  trocas: Omit<TrocaEquipamento, 'sessao'>[];
  avisos: string[];
}

/**
 * Monta o bloco de uma sessão H: sorteio por vaga, rodízio e trava de equipamento.
 * Exportado separado de `gerarSemana` para o teste poder forçar catálogo e
 * inventário sem montar a semana inteira.
 */
export function montarBloco(instancias: readonly Instancia[], ctx: ContextoBloco): BlocoGerado {
  const avisos: string[] = [];
  const ids: string[] = [];

  // 1 + 2: sorteio por vaga, com o rodízio na ordem da fila.
  for (const [i, instancia] of instancias.entries()) {
    const id = filaDaInstancia(instancia, ctx).find((c) => !ids.includes(c));
    if (!id) {
      avisos.push(`Vaga ${i + 1} (${instancia}): o catálogo não tem exercício livre para essa instância.`);
      continue;
    }
    if (ctx.semanaPassada.has(id)) {
      avisos.push(`${ctx.catalogo.get(id)!.nome} repete a semana anterior: é a única opção de ${instancia} no catálogo.`);
    }
    ids.push(id);
  }

  // 3: trava de equipamento. Troca o conflitante mais para o fim do bloco por
  // um da MESMA instância que não use o recurso. A troca só vale se a sobra
  // total cair e nenhum recurso que estava dentro do limite passar a estourar.
  const trocas: BlocoGerado['trocas'] = [];
  for (let n = 0; n < MAX_TROCAS_POR_BLOCO; n++) {
    const antes = excedentes(ids, ctx);
    if (!antes.recursos.length) break;
    let trocou = false;
    for (const recurso of antes.recursos) {
      for (let pos = ids.length - 1; pos >= 0 && !trocou; pos--) {
        if (!usa(ids[pos], recurso, ctx)) continue;
        const para = filaDaInstancia(ctx.catalogo.get(ids[pos])!.instancia, ctx).find((c) => {
          if (ids.includes(c) || usa(c, recurso, ctx)) return false;
          const depois = excedentes(ids.map((id, i) => (i === pos ? c : id)), ctx);
          return depois.sobra < antes.sobra && depois.recursos.every((r) => antes.recursos.includes(r));
        });
        if (!para) continue;
        trocas.push({
          posicao: pos + 1, de: ids[pos], para, recurso,
          deNome: ctx.catalogo.get(ids[pos])!.nome, paraNome: ctx.catalogo.get(para)!.nome,
        });
        ids[pos] = para;
        trocou = true;
      }
      if (trocou) break;
    }
    if (!trocou) {
      avisos.push(`Sem troca possível para ${antes.recursos.join(', ')}: as instâncias conflitantes não têm opção sem esse equipamento.`);
      break;
    }
  }
  return { ids, trocas, avisos };
}

export interface ResultadoGerador {
  dias: Record<DiaSemana, DiaProgramado>;
  alertas: AlertaEquipamento[];
  trocas: TrocaEquipamento[];
  /** Do bloco H (com a sessão na frente) e do HIIT ('HIIT: …'). */
  avisos: string[];
  alertasHiit: AlertaHiitDaSemana[];
  hiitFora: ForaPorEquipamento[];
}

/**
 * A semana inteira: um bloco por sessão H (H1, H2, H3, nesta ordem), colocado
 * em todo dia da `GRADE_SEMANAL` que tem aquela sessão — a terça repete o H1 da
 * segunda, o sábado repete o H3 da sexta. Mesmo bloco, mesma trava: o limite é
 * por dia, e o consumo de um bloco não muda de um dia para o outro.
 *
 * Depois dos blocos H, o HIIT (`gerador-hiit.ts`): UM por semana, nos dias da
 * grade que têm HIIT (sexta e sábado), sem repetir o bloco de força desses dias
 * e com rodízio contra o HIIT da semana anterior.
 *
 * O resultado passa por `lerDias`, a MESMA validação de `salvarSemanaBox`: o
 * gerador não tem um segundo formato de semana.
 *
 * `catalogo` é o catálogo inteiro (força e só HIIT); `limites` sem os recursos
 * do HIIT usa os de fábrica, e `alunosPorAula` ausente é a turma padrão.
 */
export function gerarSemana(entrada: {
  semanaId: string;
  catalogo: ReadonlyMap<string, ItemCatalogo>;
  limites: Record<RecursoInventario, number> & Partial<Record<RecursoHiit, number>>;
  diasDaSemanaAnterior: unknown;
  variacao?: number;
  alunosPorAula?: number;
}): ResultadoGerador {
  const forca = new Map(
    [...entrada.catalogo].filter((par): par is [string, ExercicioCatalogo] => par[1].instancia !== null),
  );
  const semanaPassada = idsDaSemana(entrada.diasDaSemanaAnterior);
  const usadosNaSemana = new Set<string>();
  const blocos = {} as Record<SessaoH, string[]>;
  const trocas: TrocaEquipamento[] = [];
  const avisos: string[] = [];

  for (const sessao of SESSOES_H) {
    const rng = mulberry32(hashSeed(`${entrada.semanaId}:${sessao}:${entrada.variacao ?? 0}`));
    const b = montarBloco(MATRIZ_H[sessao].instancias, {
      catalogo: forca, limites: entrada.limites, semanaPassada, usadosNaSemana, rng,
    });
    blocos[sessao] = b.ids;
    b.ids.forEach((id) => usadosNaSemana.add(id));
    trocas.push(...b.trocas.map((t) => ({ sessao, ...t })));
    avisos.push(...b.avisos.map((a) => `${sessao}: ${a}`));
  }

  // O HIIT da semana. Proibidos: o bloco de força dos dias que têm HIIT.
  const sessaoDoDia = (dia: DiaSemana) => GRADE_SEMANAL[dia].find((t): t is SessaoH => (SESSOES_H as readonly string[]).includes(t));
  const diasHiit = DIAS_SEMANA.filter((dia) => GRADE_SEMANAL[dia].includes('HIIT'));
  const alunosPorAula = entrada.alunosPorAula ?? ALUNOS_POR_AULA_PADRAO;
  const limitesHiit = { ...INVENTARIO_HIIT_PADRAO, ...entrada.limites } as Record<RecursoHiit, number>;
  const hiit = diasHiit.length ? gerarHiit({
    catalogo: entrada.catalogo, limites: limitesHiit, alunosPorAula,
    proibidos: new Set(diasHiit.flatMap((dia) => { const h = sessaoDoDia(dia); return h ? blocos[h] : []; })),
    semanaPassada: idsDoHiit(entrada.diasDaSemanaAnterior),
    semente: `${entrada.semanaId}:HIIT:${entrada.variacao ?? 0}`,
  }) : null;
  if (hiit) avisos.push(...hiit.avisos.map((a) => `HIIT: ${a}`));
  const hiitCru = hiit && {
    estacoes: hiit.estacoes.map((e) => ({ estacao: e.estacao, slots: e.slots.map((x) => ({ exercicioId: x.exercicioId })) })),
  };

  const crus: Record<string, unknown> = {};
  for (const dia of DIAS_SEMANA) {
    const treinos = GRADE_SEMANAL[dia];
    const h = sessaoDoDia(dia);
    crus[dia] = {
      treinos: [...treinos],
      blocoPrincipal: h ? blocos[h].map((exercicioId, i) => ({
        exercicioId, series: PRESCRICAO_FORCA.series, repeticoes: PRESCRICAO_FORCA.repeticoes,
        descansoSeg: descansoDaVaga(h, i + 1, forca.get(exercicioId)!.instancia),
      })) : [],
      cadencia: PRESCRICAO_FORCA.cadencia,
      descansos: { ...PRESCRICAO_FORCA.descansos },
      hiit: treinos.includes('HIIT') ? hiitCru : null,
    };
  }

  const lido = lerDias(crus, entrada.catalogo);
  // Só acontece se a matriz ou a grade quebrarem a regra de `lerDias` — erro de
  // programação, não de entrada. Falhar alto é melhor que gravar semana torta.
  if ('erro' in lido) throw new Error(`Gerador montou uma semana inválida: ${lido.erro}`);
  return {
    dias: lido.dias, alertas: alertasDaSemana(lido.dias, entrada.limites), trocas, avisos,
    alertasHiit: alertasHiitDaSemana(lido.dias, limitesHiit, alunosPorAula),
    hiitFora: hiit?.foraPorEquipamento ?? [],
  };
}
