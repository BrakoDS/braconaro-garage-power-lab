/**
 * REGRAS DA SEMANA DO BOX — lógica pura, sem Firestore e sem rede.
 *
 * Os callables de `index.ts` só leem, chamam o que está aqui e gravam. Tudo o
 * que DECIDE alguma coisa (o que é uma semana válida, quanto equipamento um dia
 * ocupa, quanto volume uma sessão soma) mora neste arquivo, para o
 * `checar-box.ts` provar sem subir nada. Ver o modelo em `modelo-box.ts`.
 */
import { chaveSemana } from './volume-agregado';
import {
  ADAPTACOES, ALUNOS_POR_AULA_MAX, ALUNOS_POR_AULA_PADRAO, CADENCIA_PADRAO, DIAS_SEMANA, EQUIPAMENTOS, ESTACOES_HIIT,
  EXERCICIOS_POR_BLOCO, FORMATO_METABOLICO, INSTANCIAS, INVENTARIO_HIIT_PADRAO, INVENTARIO_PADRAO, MATRIZ_H, MODALIDADES,
  MUSCULOS, OBSERVACAO_PADRAO, PESO_PRINCIPAL, PESO_SECUNDARIO, PRESCRICAO_FORCA, RECURSO_DO_EQUIPAMENTO, RECURSOS_BOX,
  NOME_ESTACAO_HIIT, PROTOCOLO_HIIT, RECURSOS_HIIT, RECURSOS_INVENTARIO, SESSOES_H, SESSOES_METABOLICAS, SLOTS_POR_ESTACAO,
  type AlertaEquipamento, type AlertaHiitDaSemana, type DadosHiit, type DiaProgramado, type DiaSemana,
  type EstacaoHiit, type EstacaoProgramada, type ExercicioCatalogo, type HiitProgramado, type SlotHiit,
  type ExercicioProgramado, type FeedbackExercicio, type ItemCatalogo, type Modalidade, type Musculo, type PapelSessao,
  type RecursoBox, type RecursoHiit, type RecursoInventario, type SessaoH, type SessaoMetabolica, type StatusRecurso,
} from './modelo-box';
import { alunosPorEstacao, consumoPorAluno, contarHiit } from './conta-hiit';

/** O box fica em São Paulo, que não tem horário de verão desde 2019. */
const OFFSET_BOX_MS = -3 * 3600_000;
const DIA_MS = 864e5;

const EH_SEMANA = /^\d{4}-W\d{2}$/;
const EH_CADENCIA = /^[0-9X]{4}$/;

/** Lista fechada → type guard. */
function em<T extends string>(lista: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (lista as readonly string[]).includes(v);
}

function inteiro(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/* ───────────────────────────── datas ───────────────────────────── */

export interface IntervaloSemana {
  /** Segunda 00:00 no fuso do box, em ms UTC. */
  inicioMs: number;
  /** Sábado 23:59:59.999 no fuso do box, em ms UTC. */
  fimMs: number;
  anoMes: string;
  /** 'AAAA-MM-DD' de cada dia, segunda a sábado. */
  datas: Record<DiaSemana, string>;
}

/**
 * Datas de uma chave ISO 'AAAA-Www', ou `null` se a chave não existe.
 *
 * Confere de volta com `chaveSemana` (a mesma do volume agregado): '2026-W53'
 * tem formato válido mas não existe, e ida-e-volta é o jeito de recusar sem
 * reescrever a regra da norma aqui.
 */
export function intervaloDaSemana(semanaId: unknown): IntervaloSemana | null {
  if (typeof semanaId !== 'string' || !EH_SEMANA.test(semanaId)) return null;
  const ano = Number(semanaId.slice(0, 4));
  const semana = Number(semanaId.slice(6));
  // 4 de janeiro está sempre na semana 1 ISO.
  const quatroJan = Date.UTC(ano, 0, 4);
  const diaIso = (new Date(quatroJan).getUTCDay() + 6) % 7;
  const segunda = quatroJan - diaIso * DIA_MS + (semana - 1) * 7 * DIA_MS;
  const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  if (chaveSemana(isoDe(segunda)) !== semanaId) return null;

  const datas = {} as Record<DiaSemana, string>;
  DIAS_SEMANA.forEach((d, i) => { datas[d] = isoDe(segunda + i * DIA_MS); });
  return {
    inicioMs: segunda - OFFSET_BOX_MS,
    fimMs: segunda + 6 * DIA_MS - 1 - OFFSET_BOX_MS,
    anoMes: datas.segunda.slice(0, 7),
    datas,
  };
}

/**
 * A chave da semana a partir de `semanaId` OU de qualquer data 'AAAA-MM-DD'
 * dela — o que o cliente tiver à mão. `null` se nenhum dos dois serve.
 */
export function semanaDoPedido(pedido: { semanaId?: unknown; data?: unknown } | null | undefined): string | null {
  if (intervaloDaSemana(pedido?.semanaId)) return pedido!.semanaId as string;
  const data = pedido?.data;
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const chave = chaveSemana(data);
  // `Date.parse` aceita 2026-02-30 virando março: confere que a data existe.
  return chave && intervaloDaSemana(chave) && new Date(`${data}T12:00:00Z`).toISOString().startsWith(data) ? chave : null;
}

/** A chave ISO da semana anterior ('2026-W42' → '2026-W41', '2027-W01' → '2026-W53'). */
export function semanaAnterior(semanaId: string): string | null {
  const i = intervaloDaSemana(semanaId);
  if (!i) return null;
  const segunda = Date.parse(`${i.datas.segunda}T12:00:00Z`);
  return chaveSemana(new Date(segunda - 7 * DIA_MS).toISOString().slice(0, 10)) || null;
}

/* ───────────────────────────── inventário ───────────────────────────── */

export interface InventarioLido {
  equipamentos: Record<RecursoBox, StatusRecurso>;
  limitesAtivos: Record<RecursoBox, number>;
  alunosPorAula: number;
}

/** Unidades de fábrica de qualquer recurso do inventário (bloco H ou HIIT). */
const PADRAO_BOX: Readonly<Record<RecursoBox, number>> = { ...INVENTARIO_PADRAO, ...INVENTARIO_HIIT_PADRAO };

/**
 * O inventário gravado, completado com `INVENTARIO_PADRAO` / `INVENTARIO_HIIT_PADRAO`
 * no que faltar. Documento inexistente ou torto vira o padrão — a semana nunca
 * fica sem limite. Um inventário gravado ANTES do HIIT (só os 5 recursos do H)
 * ganha os recursos do HIIT com os números de fábrica.
 */
export function lerInventario(doc: unknown): InventarioLido {
  const d = (doc ?? {}) as { equipamentos?: unknown; alunosPorAula?: unknown };
  const gravado = (d.equipamentos ?? {}) as Record<string, unknown>;
  const equipamentos = {} as Record<RecursoBox, StatusRecurso>;
  for (const r of RECURSOS_BOX) {
    const g = (gravado[r] ?? {}) as Record<string, unknown>;
    const total = inteiro(g.total, 0, 50) ?? PADRAO_BOX[r];
    const emManutencao = Math.min(inteiro(g.emManutencao, 0, 50) ?? 0, total);
    const observacao = g.observacao === undefined ? OBSERVACAO_PADRAO[r] ?? '' : texto(g.observacao, 200);
    equipamentos[r] = { total, emManutencao, observacao };
  }
  const alunosPorAula = inteiro(d.alunosPorAula, 1, ALUNOS_POR_AULA_MAX) ?? ALUNOS_POR_AULA_PADRAO;
  return { equipamentos, limitesAtivos: limitesDe(equipamentos), alunosPorAula };
}

function limitesDe(equipamentos: Record<RecursoBox, StatusRecurso>): Record<RecursoBox, number> {
  const limites = {} as Record<RecursoBox, number>;
  for (const r of RECURSOS_BOX) limites[r] = equipamentos[r].total - equipamentos[r].emManutencao;
  return limites;
}

/**
 * O que o coach mandou para `salvarInventarioBox`, validado. Recurso ausente
 * mantém o valor atual; valor inválido é ERRO (e não "ignora"), porque um
 * inventário salvo em silêncio com o número errado trava ou libera a semana
 * sem o coach saber por quê.
 */
export function aplicarInventario(
  atual: InventarioLido,
  entrada: unknown,
  alunosPorAulaPedido?: unknown,
): { inventario: InventarioLido } | { erro: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const equipamentos = { ...atual.equipamentos };
  for (const [chave, valor] of Object.entries(e)) {
    if (!em(RECURSOS_BOX, chave)) return { erro: `Equipamento desconhecido no inventário: ${chave}.` };
    const v = (valor ?? {}) as Record<string, unknown>;
    const total = v.total === undefined ? equipamentos[chave].total : inteiro(v.total, 0, 50);
    const emManutencao = v.emManutencao === undefined ? equipamentos[chave].emManutencao : inteiro(v.emManutencao, 0, 50);
    if (total === null) return { erro: `${chave}: total precisa ser um inteiro de 0 a 50.` };
    if (emManutencao === null) return { erro: `${chave}: emManutencao precisa ser um inteiro de 0 a 50.` };
    if (emManutencao > total) return { erro: `${chave}: não dá para ter mais unidades em manutenção do que o total.` };
    const observacao = v.observacao === undefined ? equipamentos[chave].observacao : texto(v.observacao, 200);
    equipamentos[chave] = { total, emManutencao, observacao };
  }
  const alunosPorAula = alunosPorAulaPedido === undefined
    ? atual.alunosPorAula : inteiro(alunosPorAulaPedido, 1, ALUNOS_POR_AULA_MAX);
  if (alunosPorAula === null) return { erro: `Alunos por aula precisa ser um inteiro de 1 a ${ALUNOS_POR_AULA_MAX}.` };
  return { inventario: { equipamentos, limitesAtivos: limitesDe(equipamentos), alunosPorAula } };
}

/* ───────────────────────────── catálogo ───────────────────────────── */

/**
 * Um documento de `catalogoExercicios/` lido do Firestore, ou `null` se estiver
 * torto. Item torto é TRATADO COMO INEXISTENTE: a semana que o usa é recusada,
 * em vez de entrar com equipamento ou músculo inventado.
 */
export function lerExercicioCatalogo(doc: unknown): ExercicioCatalogo | null {
  const item = lerItemCatalogo(doc);
  return item && item.instancia !== null ? item : null;
}

const lista = <T extends string>(v: unknown, fechada: readonly T[]): T[] | null =>
  Array.isArray(v) && v.every((x) => em(fechada, x)) ? [...new Set(v as T[])] : null;

/**
 * Qualquer documento do catálogo: de força (com `instancia`) ou só de HIIT
 * (`instancia: null` e `hiit`). Quem monta o bloco H usa `lerExercicioCatalogo`,
 * que descarta os só-HIIT; o gerador do HIIT usa este.
 *
 * `hiit` torto (estação desconhecida, consumo que não é inteiro) torna o item
 * INTEIRO torto, como no resto da leitura.
 */
export function lerItemCatalogo(doc: unknown): ItemCatalogo | null {
  const d = (doc ?? null) as Record<string, unknown> | null;
  if (!d) return null;
  const nome = texto(d.nome, 100);
  const musculoPrincipal = lista(d.musculoPrincipal, MUSCULOS);
  const musculosSecundarios = lista(d.musculosSecundarios, MUSCULOS);
  const equipamentos = lista(d.equipamentos, EQUIPAMENTOS);
  if (!nome || !musculoPrincipal?.length || !musculosSecundarios || !equipamentos?.length) return null;
  if (d.unilateral !== undefined && typeof d.unilateral !== 'boolean') return null;
  const hiit = d.hiit === undefined ? undefined : lerDadosHiit(d.hiit);
  if (hiit === null) return null;

  const adaptacoes: ExercicioCatalogo['adaptacoes'] = {};
  const a = (d.adaptacoes ?? {}) as Record<string, unknown>;
  for (const k of ADAPTACOES) if (typeof a[k] === 'string' && a[k]) adaptacoes[k] = a[k] as string;
  const base = {
    nome, musculoPrincipal, musculosSecundarios, equipamentos, adaptacoes,
    ...(d.unilateral ? { unilateral: true } : {}),
  };
  if (em(INSTANCIAS, d.instancia)) return { ...base, instancia: d.instancia, ...(hiit ? { hiit } : {}) };
  // Sem instância só vale se for de HIIT: senão o exercício não serve a nada.
  return (d.instancia === null || d.instancia === undefined) && hiit ? { ...base, instancia: null, hiit } : null;
}

function lerDadosHiit(v: unknown): DadosHiit | null {
  const h = (v ?? null) as Record<string, unknown> | null;
  const estacoes = lista(h?.estacoes, ESTACOES_HIIT);
  if (!estacoes?.length) return null;
  if (h!.consumoPorAluno === undefined) return { estacoes };
  const c = h!.consumoPorAluno as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return null;
  const consumoPorAluno: Partial<Record<RecursoHiit, number>> = {};
  for (const [r, n] of Object.entries(c)) {
    const q = inteiro(n, 0, 10);
    if (!em(RECURSOS_HIIT, r) || q === null) return null;
    consumoPorAluno[r] = q;
  }
  return { estacoes, consumoPorAluno };
}

/* ───────────────────────────── a semana ───────────────────────────── */

/** Unidades de cada recurso que o bloco ocupa: cada exercício é uma estação. */
export function consumoDoDia(
  bloco: readonly { exercicioId: string }[],
  catalogo: ReadonlyMap<string, Pick<ItemCatalogo, 'equipamentos'>>,
): Partial<Record<RecursoInventario, number>> {
  const consumo: Partial<Record<RecursoInventario, number>> = {};
  for (const ex of bloco) {
    const item = catalogo.get(ex.exercicioId);
    if (!item) continue;
    for (const r of recursosDo(item)) consumo[r] = (consumo[r] ?? 0) + 1;
  }
  return consumo;
}

/**
 * Os recursos limitados que um exercício ocupa, sem repetir: um exercício que
 * use flexora E extensora ainda ocupa UMA `maquinaLegs`.
 */
export function recursosDo(item: Pick<ItemCatalogo, 'equipamentos'>): RecursoInventario[] {
  const recursos = new Set<RecursoInventario>();
  for (const e of item.equipamentos) {
    const r = RECURSO_DO_EQUIPAMENTO[e];
    if (r) recursos.add(r);
  }
  return RECURSOS_INVENTARIO.filter((r) => recursos.has(r));
}

/** O que passa do limite ativo, dia a dia, na ordem da semana. */
export function alertasDaSemana(
  dias: Record<DiaSemana, DiaProgramado>,
  limites: Record<RecursoInventario, number>,
): AlertaEquipamento[] {
  const alertas: AlertaEquipamento[] = [];
  for (const dia of DIAS_SEMANA) {
    for (const r of RECURSOS_INVENTARIO) {
      const usado = dias[dia].consumoEquipamentos[r] ?? 0;
      if (usado > limites[r]) alertas.push({ dia, recurso: r, usado, limite: limites[r] });
    }
  }
  return alertas;
}

/**
 * Os `dias` que o coach mandou, validados e com o que o servidor calcula
 * (nome do exercício, consumo). Erro de formato devolve a PRIMEIRA mensagem —
 * a tela mostra uma coisa por vez.
 *
 * O rascunho aceita bloco incompleto (o coach monta aos poucos); quem exige os
 * seis exercícios é `problemasParaPublicar`.
 *
 * `catalogo` pode trazer os exercícios só de HIIT: o bloco de força os recusa,
 * o `hiit` do dia os usa. Dia sem `hiit` (ou `null`) fica sem estações.
 */
export function lerDias(
  entrada: unknown,
  catalogo: ReadonlyMap<string, ItemCatalogo>,
): { dias: Record<DiaSemana, DiaProgramado> } | { erro: string } {
  if (!entrada || typeof entrada !== 'object') return { erro: 'Mande os dias da semana.' };
  const e = entrada as Record<string, unknown>;
  for (const k of Object.keys(e)) if (!em(DIAS_SEMANA, k)) return { erro: `Dia desconhecido: ${k}. Use segunda a sábado.` };

  const dias = {} as Record<DiaSemana, DiaProgramado>;
  for (const dia of DIAS_SEMANA) {
    const d = (e[dia] ?? {}) as Record<string, unknown>;

    const treinosCru = d.treinos ?? [];
    if (!Array.isArray(treinosCru) || !treinosCru.every((t) => em(MODALIDADES, t))) {
      return { erro: `${dia}: treinos aceitos são ${MODALIDADES.join(', ')}.` };
    }
    const treinos = [...new Set(treinosCru as Modalidade[])];
    const papel = (t: Modalidade): PapelSessao => (treinos[0] === t ? 'principal' : 'alternativa');
    const hs = treinos.filter((t): t is SessaoH => em(SESSOES_H, t));
    if (hs.length > 1) return { erro: `${dia}: um dia tem no máximo uma sessão H (veio ${hs.join(' e ')}).` };
    const sessaoForca = hs.length ? { sessao: hs[0], papel: papel(hs[0]), nome: MATRIZ_H[hs[0]].nome } : null;
    const blocosMetabolicos = treinos
      .filter((t): t is SessaoMetabolica => em(SESSOES_METABOLICAS, t))
      .map((t) => ({ modalidade: t, papel: papel(t), ...FORMATO_METABOLICO[t] }));

    const blocoCru = d.blocoPrincipal ?? [];
    if (!Array.isArray(blocoCru)) return { erro: `${dia}: blocoPrincipal precisa ser uma lista.` };
    if (blocoCru.length > EXERCICIOS_POR_BLOCO) {
      return { erro: `${dia}: o bloco principal tem ${EXERCICIOS_POR_BLOCO} exercícios, não ${blocoCru.length}.` };
    }
    if (!sessaoForca && blocoCru.length) return { erro: `${dia}: só dia com sessão H (H1, H2, H3) tem bloco principal.` };

    // Descansos ANTES do bloco: o descanso do dia é o padrão de cada exercício.
    const desc = (d.descansos ?? {}) as Record<string, unknown>;
    const entreSeriesSeg = desc.entreSeriesSeg === undefined
      ? PRESCRICAO_FORCA.descansos.entreSeriesSeg : inteiro(desc.entreSeriesSeg, 0, 600);
    const entreExerciciosSeg = desc.entreExerciciosSeg === undefined
      ? PRESCRICAO_FORCA.descansos.entreExerciciosSeg : inteiro(desc.entreExerciciosSeg, 0, 600);
    if (entreSeriesSeg === null || entreExerciciosSeg === null) {
      return { erro: `${dia}: descansos são inteiros de 0 a 600 segundos.` };
    }

    const bloco: ExercicioProgramado[] = [];
    for (const [i, cru] of blocoCru.entries()) {
      const x = (cru ?? {}) as Record<string, unknown>;
      const id = texto(x.exercicioId, 100);
      const item = catalogo.get(id);
      if (!item) return { erro: `${dia}, exercício ${i + 1}: "${id || '(vazio)'}" não está no catálogo.` };
      if (item.instancia === null) return { erro: `${dia}: ${item.nome} é só de HIIT e não entra no bloco de força.` };
      if (bloco.some((b) => b.exercicioId === id)) return { erro: `${dia}: ${item.nome} aparece duas vezes no bloco.` };
      const series = inteiro(x.series, 1, 10);
      if (series === null) return { erro: `${dia}, ${item.nome}: séries precisa ser um inteiro de 1 a 10.` };
      const repeticoes = texto(x.repeticoes, 20);
      if (!repeticoes) return { erro: `${dia}, ${item.nome}: escreva as repetições.` };
      const descansoSeg = x.descansoSeg === undefined ? entreSeriesSeg : inteiro(x.descansoSeg, 0, 600);
      if (descansoSeg === null) return { erro: `${dia}, ${item.nome}: descanso é um inteiro de 0 a 600 segundos.` };
      bloco.push({
        exercicioId: id, nome: item.nome, series, repeticoes, descansoSeg,
        instancia: item.instancia, recursos: recursosDo(item),
      });
    }

    const cadencia = d.cadencia === undefined ? CADENCIA_PADRAO : texto(d.cadencia, 4).toUpperCase();
    if (!EH_CADENCIA.test(cadencia)) return { erro: `${dia}: cadência são 4 dígitos (ex.: 3010).` };

    let hiit: HiitProgramado | null = null;
    if (d.hiit !== undefined && d.hiit !== null) {
      if (!treinos.includes('HIIT')) return { erro: `${dia}: só dia com HIIT na grade tem estações de HIIT.` };
      const h = lerHiit(d.hiit, catalogo, dia);
      if ('erro' in h) return h;
      hiit = h.hiit;
    }

    dias[dia] = {
      treinos,
      blocoPrincipal: bloco,
      sessaoForca,
      blocosMetabolicos,
      cadencia,
      descansos: { entreSeriesSeg, entreExerciciosSeg },
      consumoEquipamentos: consumoDoDia(bloco, catalogo),
      hiit,
    };
  }
  return { dias };
}

/**
 * As estações de HIIT de um dia, validadas, com o que o servidor calcula (nome,
 * protocolo, lado, consumo por aluno). O pedido manda só
 * `{ estacoes: [{ estacao, slots: [{ exercicioId }] }] }`.
 *
 * Unilateral vem em DOIS slots seguidos com o mesmo id; o servidor marca D e E.
 * As 4 estações são obrigatórias; slots incompletos passam no rascunho (quem
 * exige os 4 é `problemasParaPublicar`).
 */
export function lerHiit(
  entrada: unknown,
  catalogo: ReadonlyMap<string, ItemCatalogo>,
  dia: string,
): { hiit: HiitProgramado } | { erro: string } {
  const h = (entrada ?? null) as { estacoes?: unknown } | null;
  if (!h || typeof h !== 'object' || !Array.isArray(h.estacoes)) return { erro: `${dia}: o HIIT precisa da lista de estações.` };
  if (h.estacoes.length !== ESTACOES_HIIT.length) {
    return { erro: `${dia}: o HIIT tem ${ESTACOES_HIIT.length} estações (${ESTACOES_HIIT.map((e) => NOME_ESTACAO_HIIT[e]).join(', ')}).` };
  }
  const vistas = new Set<EstacaoHiit>();
  const noHiit = new Set<string>();
  const estacoes: EstacaoProgramada[] = [];
  for (const cru of h.estacoes) {
    const x = (cru ?? {}) as Record<string, unknown>;
    if (!em(ESTACOES_HIIT, x.estacao)) return { erro: `${dia}: estação de HIIT desconhecida: ${String(x.estacao)}.` };
    const estacao = x.estacao;
    const nomeEstacao = NOME_ESTACAO_HIIT[estacao];
    if (vistas.has(estacao)) return { erro: `${dia}: a estação ${nomeEstacao} aparece duas vezes no HIIT.` };
    vistas.add(estacao);
    const slotsCru = x.slots ?? [];
    if (!Array.isArray(slotsCru) || slotsCru.length > SLOTS_POR_ESTACAO) {
      return { erro: `${dia}, ${nomeEstacao}: a estação tem até ${SLOTS_POR_ESTACAO} slots.` };
    }
    const ids = slotsCru.map((y) => texto((y as { exercicioId?: unknown } | null)?.exercicioId, 100));
    const slots: SlotHiit[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const item = catalogo.get(id);
      if (!item?.hiit) return { erro: `${dia}, ${nomeEstacao}: "${id || '(vazio)'}" não é exercício de HIIT do catálogo.` };
      if (!item.hiit.estacoes.includes(estacao)) return { erro: `${dia}: ${item.nome} não é da estação ${nomeEstacao}.` };
      if (noHiit.has(id)) return { erro: `${dia}: ${item.nome} aparece duas vezes no HIIT.` };
      noHiit.add(id);
      const base = { exercicioId: id, nome: item.nome, consumoPorAluno: consumoPorAluno(item) };
      if (item.unilateral) {
        if (ids[i + 1] !== id) {
          return { erro: `${dia}, ${nomeEstacao}: ${item.nome} é unilateral e ocupa 2 slots seguidos (lado D e lado E).` };
        }
        slots.push({ ...base, lado: 'D' }, { ...base, lado: 'E' });
        i++;
      } else {
        slots.push({ ...base, lado: null });
      }
    }
    estacoes.push({ estacao, nome: nomeEstacao, protocolo: PROTOCOLO_HIIT, slots });
  }
  return { hiit: { estacoes } };
}

/**
 * Dias de um pedido de `salvarSemanaBox` com o HIIT GRAVADO onde o pedido não
 * fala dele (`hiit` ausente). A troca manual do bloco H manda só o bloco: sem
 * isso, trocar um exercício do H3 apagaria as estações do HIIT da sexta e do
 * sábado. `hiit: null` no pedido apaga de propósito.
 */
export function diasComHiitGravado(pedido: unknown, gravados: unknown): unknown {
  if (!pedido || typeof pedido !== 'object') return pedido;
  const g = (gravados ?? {}) as Record<string, { hiit?: unknown } | undefined>;
  const dias: Record<string, unknown> = {};
  for (const [dia, d] of Object.entries(pedido as Record<string, unknown>)) {
    dias[dia] = d && typeof d === 'object' && !('hiit' in d) && g[dia]?.hiit ? { ...d, hiit: g[dia]!.hiit } : d;
  }
  return dias;
}

/**
 * Equipamento do HIIT acima do limite, na semana. O MESMO HIIT na sexta e no
 * sábado sai UMA vez, com os dois dias — a conta é a mesma.
 *
 * `limites` sem os recursos do HIIT usa os de fábrica (semana conferida contra
 * um inventário de antes do HIIT).
 */
export function alertasHiitDaSemana(
  dias: Record<DiaSemana, DiaProgramado>,
  limites: Partial<Record<RecursoBox, number>>,
  alunosPorAula: number,
): AlertaHiitDaSemana[] {
  const lim = { ...INVENTARIO_HIIT_PADRAO, ...limites } as Record<RecursoHiit, number>;
  const grupos = new Map<string, { hiit: HiitProgramado; dias: DiaSemana[] }>();
  for (const dia of DIAS_SEMANA) {
    const h = dias[dia].hiit;
    if (!h) continue;
    const chave = JSON.stringify(h.estacoes.map((e) => e.slots.map((x) => [x.exercicioId, x.consumoPorAluno])));
    const g = grupos.get(chave);
    if (g) g.dias.push(dia);
    else grupos.set(chave, { hiit: h, dias: [dia] });
  }
  return [...grupos.values()].flatMap((g) => contarHiit(g.hiit.estacoes, lim, alunosPorAula).alertas.map((a) => ({ ...a, dias: g.dias })));
}

/** 'sexta e sábado' */
function rotuloDias(dias: readonly DiaSemana[]): string {
  const nome = (d: DiaSemana) => ({ terca: 'terça', sabado: 'sábado' } as Partial<Record<DiaSemana, string>>)[d] ?? d;
  return dias.length > 1 ? `${dias.slice(0, -1).map(nome).join(', ')} e ${nome(dias[dias.length - 1])}` : nome(dias[0]);
}

/** Por que a semana NÃO pode ser publicada. Lista vazia = pode. */
export function problemasParaPublicar(
  dias: Record<DiaSemana, DiaProgramado>,
  alertas: AlertaEquipamento[],
  alertasHiit: AlertaHiitDaSemana[] = [],
  alunosPorAula: number = ALUNOS_POR_AULA_PADRAO,
): string[] {
  const problemas: string[] = [];
  const nomes = new Map<string, string>();
  for (const dia of DIAS_SEMANA) {
    const d = dias[dia];
    if (d.sessaoForca && d.blocoPrincipal.length !== EXERCICIOS_POR_BLOCO) {
      problemas.push(`${dia}: o bloco do ${d.sessaoForca.sessao} tem ${d.blocoPrincipal.length} de ${EXERCICIOS_POR_BLOCO} exercícios.`);
    }
    // Dia de HIIT SEM estações (semana de antes do gerador) não trava: o dia
    // só sinaliza o HIIT, como sempre foi. Estação começada e não fechada trava.
    for (const e of d.hiit?.estacoes ?? []) {
      e.slots.forEach((x) => nomes.set(x.exercicioId, x.nome));
      if (e.slots.length !== SLOTS_POR_ESTACAO) {
        problemas.push(`${dia}: a estação ${e.nome} do HIIT tem ${e.slots.length} de ${SLOTS_POR_ESTACAO} slots.`);
      }
    }
    const doBloco = new Set(d.blocoPrincipal.map((b) => b.exercicioId));
    const repetidos = new Set<string>();
    for (const x of (d.hiit?.estacoes ?? []).flatMap((e) => e.slots)) {
      if (!doBloco.has(x.exercicioId) || repetidos.has(x.exercicioId)) continue;
      repetidos.add(x.exercicioId);
      problemas.push(`${dia}: ${x.nome} está no bloco do ${d.sessaoForca?.sessao ?? 'dia'} e no HIIT — o dia não repete exercício.`);
    }
  }
  for (const a of alertas) {
    problemas.push(`${a.dia}: ${a.usado} estações de ${a.recurso}, e o box tem ${a.limite} ativa(s).`);
  }
  const porEstacao = alunosPorEstacao(alunosPorAula);
  for (const a of alertasHiit) {
    const quem = a.exercicios.map((id) => nomes.get(id) ?? id).join(' + ');
    if (a.estacoes?.length) {
      problemas.push(`${rotuloDias(a.dias)}: no HIIT, o ${a.recurso} fica fixo e serve a UMA estação, mas está em ${a.estacoes.map((e) => NOME_ESTACAO_HIIT[e]).join(' e ')} (${quem}).`);
      continue;
    }
    problemas.push(a.slot === null
      ? `${rotuloDias(a.dias)}: no HIIT, ${quem} precisa de ${a.usado} ${a.recurso} (${porEstacao} alunos por estação), e o box tem ${a.limite} ativo(s).`
      : `${rotuloDias(a.dias)}: no slot ${a.slot} do HIIT, ${quem} usam ${a.usado} ${a.recurso} ao mesmo tempo, e o box tem ${a.limite} ativo(s).`);
  }
  if (DIAS_SEMANA.every((dia) => !dias[dia].treinos.length)) problemas.push('A semana não tem nenhum treino.');
  return problemas;
}

/**
 * Uma semana JÁ GRAVADA conferida contra limites novos — o que `salvarInventarioBox`
 * faz com as semanas que ainda não terminaram quando um smith entra em manutenção.
 *
 * Usa o `consumoEquipamentos` que cada dia já guarda (e o `consumoPorAluno` de
 * cada slot do HIIT): o consumo não muda com o inventário, só o limite e a turma. Não relê o catálogo nem refaz o bloco, e
 * NÃO decide status — semana publicada continua publicada; quem resolve é o coach.
 *
 * `null` quando o documento não tem a forma de uma semana (não há o que conferir).
 */
export function reconferirSemana(
  doc: unknown,
  limites: Record<RecursoInventario, number> & Partial<Record<RecursoHiit, number>>,
  alunosPorAula: number = ALUNOS_POR_AULA_PADRAO,
): { alertas: AlertaEquipamento[]; alertasHiit: AlertaHiitDaSemana[]; problemasParaPublicar: string[] } | null {
  const brutos = (doc as { dias?: unknown } | null)?.dias;
  if (!brutos || typeof brutos !== 'object') return null;
  const dias = {} as Record<DiaSemana, DiaProgramado>;
  for (const dia of DIAS_SEMANA) {
    const d = ((brutos as Record<string, unknown>)[dia] ?? {}) as Partial<DiaProgramado>;
    dias[dia] = {
      treinos: Array.isArray(d.treinos) ? d.treinos : [],
      blocoPrincipal: Array.isArray(d.blocoPrincipal) ? d.blocoPrincipal : [],
      sessaoForca: d.sessaoForca ?? null,
      blocosMetabolicos: Array.isArray(d.blocosMetabolicos) ? d.blocosMetabolicos : [],
      cadencia: typeof d.cadencia === 'string' ? d.cadencia : CADENCIA_PADRAO,
      descansos: d.descansos ?? { entreSeriesSeg: 0, entreExerciciosSeg: 0 },
      consumoEquipamentos: d.consumoEquipamentos && typeof d.consumoEquipamentos === 'object' ? d.consumoEquipamentos : {},
      hiit: d.hiit && Array.isArray(d.hiit.estacoes) ? d.hiit : null,
    };
  }
  const alertas = alertasDaSemana(dias, limites);
  const alertasHiit = alertasHiitDaSemana(dias, limites, alunosPorAula);
  return { alertas, alertasHiit, problemasParaPublicar: problemasParaPublicar(dias, alertas, alertasHiit, alunosPorAula) };
}

/* ───────────────────────────── o aluno ───────────────────────────── */

/**
 * Volume de uma sessão por músculo: cada série válida soma `PESO_PRINCIPAL`
 * (1,0) a cada músculo principal e `PESO_SECUNDARIO` (0,5) a cada secundário.
 *
 * Músculo que aparece nas duas listas conta como principal — e uma vez só.
 *
 * ATENÇÃO: o dashboard do coach (`volume-agregado.ts`) credita a série INTEIRA
 * ao secundário. Os dois números não batem de propósito; ver o README.
 */
export function volumeDaSessao(
  series: Record<string, number>,
  catalogo: ReadonlyMap<string, Pick<ItemCatalogo, 'musculoPrincipal' | 'musculosSecundarios'>>,
): Partial<Record<Musculo, number>> {
  const volume: Partial<Record<Musculo, number>> = {};
  const somar = (m: Musculo, v: number) => { volume[m] = (volume[m] ?? 0) + v; };
  for (const [id, n] of Object.entries(series)) {
    const item = catalogo.get(id);
    if (!item || !(n > 0)) continue;
    const principais = new Set(item.musculoPrincipal);
    for (const m of principais) somar(m, n * PESO_PRINCIPAL);
    for (const m of new Set(item.musculosSecundarios)) if (!principais.has(m)) somar(m, n * PESO_SECUNDARIO);
  }
  return volume;
}

export interface SessaoLida {
  series: Record<string, number>;
  feedbacks: Omit<FeedbackExercicio, 'sessaoId' | 'data'>[];
}

/**
 * O que o aluno mandou sobre UMA sessão, conferido contra o dia publicado.
 *
 * Séries válidas acima do prescrito são CORTADAS no prescrito (o aluno que fez
 * uma série a mais não ganha volume que o coach não programou); exercício que
 * não está no bloco do dia é erro.
 */
export function lerSessaoAluno(entrada: unknown, dia: DiaProgramado): SessaoLida | { erro: string } {
  const lista = (entrada as { exercicios?: unknown } | null)?.exercicios;
  if (!Array.isArray(lista) || !lista.length) return { erro: 'Mande ao menos um exercício da sessão.' };
  const prescrito = new Map(dia.blocoPrincipal.map((e) => [e.exercicioId, e]));
  const series: Record<string, number> = {};
  const feedbacks: SessaoLida['feedbacks'] = [];
  for (const cru of lista) {
    const x = (cru ?? {}) as Record<string, unknown>;
    const id = texto(x.exercicioId, 100);
    const p = prescrito.get(id);
    if (!p) return { erro: `"${id || '(vazio)'}" não faz parte do treino desse dia.` };
    if (id in series) return { erro: `${p.nome} veio duas vezes.` };
    const feitas = inteiro(x.seriesValidas, 0, 50);
    if (feitas === null) return { erro: `${p.nome}: séries válidas precisa ser um inteiro.` };
    series[id] = Math.min(feitas, p.series);

    const pse = x.pse === undefined || x.pse === null ? null : inteiro(x.pse, 0, 10);
    const rir = x.rirReportado === undefined || x.rirReportado === null ? null : inteiro(x.rirReportado, 0, 10);
    if (pse === null && x.pse != null) return { erro: `${p.nome}: PSE vai de 0 a 10.` };
    if (rir === null && x.rirReportado != null) return { erro: `${p.nome}: RIR vai de 0 a 10.` };
    const comentario = texto(x.comentario, 500);
    if (pse !== null || rir !== null || comentario) {
      feedbacks.push({ exercicioId: id, pse, rirReportado: rir, comentario });
    }
  }
  return { series, feedbacks };
}

/** Soma por músculo — `volumeAcumulado` é sempre RECALCULADO das presenças. */
export function somarVolumes(volumes: Partial<Record<Musculo, number>>[]): Partial<Record<Musculo, number>> {
  const total: Partial<Record<Musculo, number>> = {};
  for (const v of volumes) {
    for (const [m, n] of Object.entries(v) as [Musculo, number][]) {
      if (typeof n === 'number' && n > 0) total[m] = (total[m] ?? 0) + n;
    }
  }
  return total;
}

/**
 * O histórico do mês com uma sessão registrada.
 *
 * A mesma sessão (`sessaoId`) registrada de novo SUBSTITUI a anterior — presença
 * e feedbacks — em vez de somar: um toque duplo ou uma correção do aluno não
 * pode dobrar o volume do mês. É por isso também que `volumeAcumulado` é
 * recalculado da lista, e não incrementado.
 */
export function historicoComSessao<P extends { sessaoId: string; volume: Partial<Record<Musculo, number>> }>(
  atual: { presencas?: unknown; feedbacks?: unknown } | null | undefined,
  presenca: P,
  feedbacks: FeedbackExercicio[],
): { presencas: P[]; feedbacks: FeedbackExercicio[]; volumeAcumulado: Partial<Record<Musculo, number>> } {
  const antes = (Array.isArray(atual?.presencas) ? atual!.presencas : []) as P[];
  const fbAntes = (Array.isArray(atual?.feedbacks) ? atual!.feedbacks : []) as FeedbackExercicio[];
  const presencas = [...antes.filter((p) => p?.sessaoId !== presenca.sessaoId), presenca];
  return {
    presencas,
    feedbacks: [...fbAntes.filter((f) => f?.sessaoId !== presenca.sessaoId), ...feedbacks],
    volumeAcumulado: somarVolumes(presencas.map((p) => p.volume ?? {})),
  };
}
