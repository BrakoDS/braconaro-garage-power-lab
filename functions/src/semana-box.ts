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
  ADAPTACOES, CADENCIA_PADRAO, DIAS_SEMANA, EQUIPAMENTOS, EXERCICIOS_POR_BLOCO, FORMATO_METABOLICO, INSTANCIAS,
  INVENTARIO_PADRAO, MATRIZ_H, MODALIDADES, MUSCULOS, PESO_PRINCIPAL, PESO_SECUNDARIO, PRESCRICAO_FORCA,
  RECURSO_DO_EQUIPAMENTO, RECURSOS_INVENTARIO, SESSOES_H, SESSOES_METABOLICAS,
  type AlertaEquipamento, type DiaProgramado, type DiaSemana, type ExercicioCatalogo,
  type ExercicioProgramado, type FeedbackExercicio, type Modalidade, type Musculo, type PapelSessao,
  type RecursoInventario, type SessaoH, type SessaoMetabolica, type StatusRecurso,
} from './modelo-box';

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
  equipamentos: Record<RecursoInventario, StatusRecurso>;
  limitesAtivos: Record<RecursoInventario, number>;
}

/**
 * O inventário gravado, completado com `INVENTARIO_PADRAO` no que faltar.
 * Documento inexistente ou torto vira o padrão — a semana nunca fica sem limite.
 */
export function lerInventario(doc: unknown): InventarioLido {
  const gravado = ((doc as { equipamentos?: unknown } | null)?.equipamentos ?? {}) as Record<string, unknown>;
  const equipamentos = {} as Record<RecursoInventario, StatusRecurso>;
  const limitesAtivos = {} as Record<RecursoInventario, number>;
  for (const r of RECURSOS_INVENTARIO) {
    const g = (gravado[r] ?? {}) as Record<string, unknown>;
    const total = inteiro(g.total, 0, 50) ?? INVENTARIO_PADRAO[r];
    const emManutencao = Math.min(inteiro(g.emManutencao, 0, 50) ?? 0, total);
    equipamentos[r] = { total, emManutencao, observacao: texto(g.observacao, 200) };
    limitesAtivos[r] = total - emManutencao;
  }
  return { equipamentos, limitesAtivos };
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
): { inventario: InventarioLido } | { erro: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const equipamentos = { ...atual.equipamentos };
  for (const [chave, valor] of Object.entries(e)) {
    if (!em(RECURSOS_INVENTARIO, chave)) return { erro: `Equipamento desconhecido no inventário: ${chave}.` };
    const v = (valor ?? {}) as Record<string, unknown>;
    const total = v.total === undefined ? equipamentos[chave].total : inteiro(v.total, 0, 50);
    const emManutencao = v.emManutencao === undefined ? equipamentos[chave].emManutencao : inteiro(v.emManutencao, 0, 50);
    if (total === null) return { erro: `${chave}: total precisa ser um inteiro de 0 a 50.` };
    if (emManutencao === null) return { erro: `${chave}: emManutencao precisa ser um inteiro de 0 a 50.` };
    if (emManutencao > total) return { erro: `${chave}: não dá para ter mais unidades em manutenção do que o total.` };
    const observacao = v.observacao === undefined ? equipamentos[chave].observacao : texto(v.observacao, 200);
    equipamentos[chave] = { total, emManutencao, observacao };
  }
  const limitesAtivos = {} as Record<RecursoInventario, number>;
  for (const r of RECURSOS_INVENTARIO) limitesAtivos[r] = equipamentos[r].total - equipamentos[r].emManutencao;
  return { inventario: { equipamentos, limitesAtivos } };
}

/* ───────────────────────────── catálogo ───────────────────────────── */

/**
 * Um documento de `catalogoExercicios/` lido do Firestore, ou `null` se estiver
 * torto. Item torto é TRATADO COMO INEXISTENTE: a semana que o usa é recusada,
 * em vez de entrar com equipamento ou músculo inventado.
 */
export function lerExercicioCatalogo(doc: unknown): ExercicioCatalogo | null {
  const d = (doc ?? null) as Record<string, unknown> | null;
  if (!d) return null;
  const nome = texto(d.nome, 100);
  const lista = <T extends string>(v: unknown, fechada: readonly T[]): T[] | null =>
    Array.isArray(v) && v.every((x) => em(fechada, x)) ? [...new Set(v as T[])] : null;
  const musculoPrincipal = lista(d.musculoPrincipal, MUSCULOS);
  const musculosSecundarios = lista(d.musculosSecundarios, MUSCULOS);
  const equipamentos = lista(d.equipamentos, EQUIPAMENTOS);
  if (!nome || !em(INSTANCIAS, d.instancia) || !musculoPrincipal?.length || !musculosSecundarios || !equipamentos?.length) {
    return null;
  }
  const adaptacoes: ExercicioCatalogo['adaptacoes'] = {};
  const a = (d.adaptacoes ?? {}) as Record<string, unknown>;
  for (const k of ADAPTACOES) if (typeof a[k] === 'string' && a[k]) adaptacoes[k] = a[k] as string;
  return { nome, instancia: d.instancia, musculoPrincipal, musculosSecundarios, equipamentos, adaptacoes };
}

/* ───────────────────────────── a semana ───────────────────────────── */

/** Unidades de cada recurso que o bloco ocupa: cada exercício é uma estação. */
export function consumoDoDia(
  bloco: readonly { exercicioId: string }[],
  catalogo: ReadonlyMap<string, ExercicioCatalogo>,
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
export function recursosDo(item: ExercicioCatalogo): RecursoInventario[] {
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
 */
export function lerDias(
  entrada: unknown,
  catalogo: ReadonlyMap<string, ExercicioCatalogo>,
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

    dias[dia] = {
      treinos,
      blocoPrincipal: bloco,
      sessaoForca,
      blocosMetabolicos,
      cadencia,
      descansos: { entreSeriesSeg, entreExerciciosSeg },
      consumoEquipamentos: consumoDoDia(bloco, catalogo),
    };
  }
  return { dias };
}

/** Por que a semana NÃO pode ser publicada. Lista vazia = pode. */
export function problemasParaPublicar(
  dias: Record<DiaSemana, DiaProgramado>,
  alertas: AlertaEquipamento[],
): string[] {
  const problemas: string[] = [];
  for (const dia of DIAS_SEMANA) {
    const d = dias[dia];
    if (d.sessaoForca && d.blocoPrincipal.length !== EXERCICIOS_POR_BLOCO) {
      problemas.push(`${dia}: o bloco do ${d.sessaoForca.sessao} tem ${d.blocoPrincipal.length} de ${EXERCICIOS_POR_BLOCO} exercícios.`);
    }
  }
  for (const a of alertas) {
    problemas.push(`${a.dia}: ${a.usado} estações de ${a.recurso}, e o box tem ${a.limite} ativa(s).`);
  }
  if (DIAS_SEMANA.every((dia) => !dias[dia].treinos.length)) problemas.push('A semana não tem nenhum treino.');
  return problemas;
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
  catalogo: ReadonlyMap<string, ExercicioCatalogo>,
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
