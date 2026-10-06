/**
 * EDIÇÃO MANUAL DO HIIT — lógica pura, sem Firestore e sem rede.
 *
 * O coach troca um EXERCÍCIO de uma estação (o unilateral é um exercício só,
 * em dois slots), e a troca vale para o HIIT da semana inteira: é o mesmo na
 * sexta e no sábado. Quem decide é o servidor (callable `opcoesTrocaHiitBox`),
 * com a MESMA conta do gerador (`contarHiit`) aplicada à semana JÁ trocada.
 *
 * Regras do coach (06/10/2026):
 *  - só exercício da estação (o servidor recusa outro ao salvar, `lerHiit`);
 *  - só do MESMO TAMANHO: bilateral por bilateral (1 slot), unilateral por
 *    unilateral (2 slots) — trocar o tamanho deixaria a estação com 3 ou 5;
 *  - BLOQUEIA (sem "manter"): já estar no HIIT, tamanho diferente, equipamento
 *    acima do limite (sozinho, somando o slot, ou recurso fixo como o TRX em
 *    outra estação) e estar no bloco de força do mesmo dia (o H3). Nada disso
 *    publicaria — não faz sentido deixar escolher;
 *  - só o rodízio (estava no HIIT da semana anterior) é aviso contornável.
 */
import { consumoPorAluno, contarHiit, slotsDe } from './conta-hiit';
import {
  DIAS_SEMANA,
  type DiaSemana, type EstacaoHiit, type ItemCatalogo, type RecursoHiit, type SessaoH,
} from './modelo-box';

type Catalogo = ReadonlyMap<string, ItemCatalogo>;
type SlotCru = { exercicioId: string; nome?: string; lado?: 'D' | 'E' | null; consumoPorAluno?: Partial<Record<RecursoHiit, number>> };
type EstacaoCrua = { estacao: EstacaoHiit; nome?: string; slots: SlotCru[] };

const diaDe = (dias: unknown, d: DiaSemana) => ((dias ?? {}) as Record<string, any>)[d] ?? null;

/** Os dias que têm as estações do HIIT gravadas (sexta e sábado). */
export function diasDoHiit(dias: unknown): DiaSemana[] {
  return DIAS_SEMANA.filter((d) => Array.isArray(diaDe(dias, d)?.hiit?.estacoes));
}

/** As estações do HIIT da semana (do primeiro dia que as tem), ou `null`. */
export function estacoesDaSemana(dias: unknown): EstacaoCrua[] | null {
  const d = diasDoHiit(dias)[0];
  return d ? (diaDe(dias, d).hiit.estacoes as EstacaoCrua[]) : null;
}

/**
 * O HIIT travado? ESPELHA a trava do bloco H (`sessoesTravadas`): semana que já
 * foi publicada não muda num dia que já passou — e o HIIT está na sexta E no
 * sábado, então basta um deles ter passado. Quem recusa de verdade é
 * `salvarSemanaBox` (`diasPassadosAlterados`, que também olha o HIIT).
 */
export function hiitTravado(dias: unknown, datas: Record<DiaSemana, string>, hoje: string): boolean {
  return diasDoHiit(dias).some((d) => datas[d] < hoje);
}

/**
 * O exercício da estação que começa (ou passa) no slot `slot` (1 a 4): o
 * unilateral responde pelo D e pelo E. `null` se a vaga não existe.
 */
export function vagaDoHiit(estacoes: readonly EstacaoCrua[], estacao: string, slot: number): {
  e: EstacaoCrua; inicio: number; tamanho: 1 | 2; exercicioId: string;
} | null {
  const e = estacoes.find((x) => x?.estacao === estacao);
  const x = e?.slots?.[slot - 1];
  if (!e || !x?.exercicioId) return null;
  const inicio = x.lado === 'E' && e.slots[slot - 2]?.exercicioId === x.exercicioId ? slot - 1 : slot;
  const tamanho = e.slots[inicio - 1]?.lado === 'D' && e.slots[inicio]?.exercicioId === x.exercicioId ? 2 : 1;
  return { e, inicio, tamanho, exercicioId: x.exercicioId };
}

/**
 * As estações com a troca aplicada — ids crus, no formato que `salvarSemanaBox`
 * recebe. O novo exercício ocupa EXATAMENTE os slots do antigo (mesmo tamanho).
 */
export function estacoesComTroca(
  estacoes: readonly EstacaoCrua[], estacao: string, inicio: number, tamanho: 1 | 2, novo: string,
): { estacao: EstacaoHiit; slots: { exercicioId: string }[] }[] {
  return estacoes.map((e) => ({
    estacao: e.estacao,
    slots: (e.slots ?? []).map((x, i) => ({
      exercicioId: e.estacao === estacao && i + 1 >= inicio && i + 1 < inicio + tamanho ? novo : x.exercicioId,
    })),
  }));
}

export interface ConflitosHiit {
  /** Já está no HIIT (em qualquer estação) — o servidor não salva. */
  noHiit: boolean;
  /** Ocupa outro número de slots que o atual (1 × 2). */
  tamanhoDiferente: boolean;
  /** Equipamento acima do limite com a troca: sozinho (`slot: null`) ou somando o slot. */
  equipamento: { recurso: RecursoHiit; usado: number; limite: number; slot: number | null }[];
  /** Recurso fixo no espaço (o TRX) que já está em outra estação. */
  fixoEmOutraEstacao: { recurso: RecursoHiit; estacoes: EstacaoHiit[] }[];
  /** Está no bloco de força de um dia que tem este HIIT (o H3 da sexta e do sábado). */
  noBlocoDoDia: { sessao: SessaoH; dias: DiaSemana[] }[];
  /** Estava no HIIT da semana anterior — quebra o rodízio (aviso contornável). */
  semanaAnterior: boolean;
}

/** Algum conflito que impede escolher (tudo, menos o rodízio). */
export const bloqueia = (c: ConflitosHiit): boolean =>
  c.noHiit || c.tamanhoDiferente || c.equipamento.length > 0 || c.fixoEmOutraEstacao.length > 0 || c.noBlocoDoDia.length > 0;

/**
 * Os conflitos de pôr `exercicioId` no lugar do exercício da vaga. A conta de
 * equipamento é a do gerador, sobre o HIIT JÁ trocado: só entram os alertas
 * em que o exercício novo está.
 */
export function conflitosDoHiit(o: {
  dias: unknown; estacao: string; slot: number; exercicioId: string;
  catalogo: Catalogo; limites: Record<RecursoHiit, number>; alunosPorAula: number; semanaPassada: ReadonlySet<string>;
}): ConflitosHiit | null {
  const estacoes = estacoesDaSemana(o.dias);
  const vaga = estacoes ? vagaDoHiit(estacoes, o.estacao, o.slot) : null;
  const item = o.catalogo.get(o.exercicioId);
  if (!estacoes || !vaga || !item) return null;

  const tamanho = slotsDe(item);
  const noHiit = estacoes.some((e) => (e.slots ?? []).some((x, i) => x.exercicioId === o.exercicioId
    && !(e.estacao === o.estacao && i + 1 >= vaga.inicio && i + 1 < vaga.inicio + vaga.tamanho)));

  // A conta só faz sentido com o mesmo tamanho (senão a estação nem fecha).
  let equipamento: ConflitosHiit['equipamento'] = [];
  let fixoEmOutraEstacao: ConflitosHiit['fixoEmOutraEstacao'] = [];
  if (tamanho === vaga.tamanho) {
    const consumo = consumoPorAluno(item);
    const trocado = estacoes.map((e) => ({
      estacao: e.estacao,
      slots: (e.slots ?? []).map((x, i) => (e.estacao === o.estacao && i + 1 >= vaga.inicio && i + 1 < vaga.inicio + vaga.tamanho
        ? { exercicioId: o.exercicioId, consumoPorAluno: consumo }
        : { exercicioId: x.exercicioId, consumoPorAluno: x.consumoPorAluno ?? (o.catalogo.get(x.exercicioId) ? consumoPorAluno(o.catalogo.get(x.exercicioId)!) : {}) })),
    }));
    const alertas = contarHiit(trocado, o.limites, o.alunosPorAula).alertas.filter((a) => a.exercicios.includes(o.exercicioId));
    equipamento = alertas.filter((a) => !a.estacoes)
      .map((a) => ({ recurso: a.recurso, usado: a.usado, limite: a.limite, slot: a.slot }));
    fixoEmOutraEstacao = alertas.filter((a) => a.estacoes)
      .map((a) => ({ recurso: a.recurso, estacoes: a.estacoes!.filter((e) => e !== o.estacao) }));
  }

  const noBlocoDoDia: ConflitosHiit['noBlocoDoDia'] = [];
  for (const d of diasDoHiit(o.dias)) {
    const dia = diaDe(o.dias, d);
    const sessao = dia?.sessaoForca?.sessao as SessaoH | undefined;
    const noBloco = Array.isArray(dia?.blocoPrincipal) && dia.blocoPrincipal.some((b: any) => b?.exercicioId === o.exercicioId);
    if (!sessao || !noBloco) continue;
    const ja = noBlocoDoDia.find((x) => x.sessao === sessao);
    if (ja) ja.dias.push(d);
    else noBlocoDoDia.push({ sessao, dias: [d] });
  }

  return {
    noHiit,
    tamanhoDiferente: tamanho !== vaga.tamanho,
    equipamento,
    fixoEmOutraEstacao,
    noBlocoDoDia,
    semanaAnterior: o.semanaPassada.has(o.exercicioId),
  };
}

export interface OpcaoDoHiit {
  exercicioId: string;
  nome: string;
  unilateral: boolean;
  conflitos: ConflitosHiit;
  /** Não dá para escolher (ver `bloqueia`). */
  bloqueada: boolean;
}

export interface OpcoesDoHiit {
  vaga: {
    estacao: EstacaoHiit; nome: string; slots: number[]; unilateral: boolean; dias: DiaSemana[];
    atual: { exercicioId: string; nome: string };
  };
  opcoes: OpcaoDoHiit[];
}

/**
 * Os exercícios da estação para uma vaga do HIIT, cada um com os conflitos.
 * Ordem: livres, depois os que quebram o rodízio, depois os bloqueados; por
 * nome dentro de cada grupo. `null` se a semana não tem HIIT ou a vaga não existe.
 */
export function opcoesDoHiit(o: {
  dias: unknown; estacao: string; slot: number;
  catalogo: Catalogo; limites: Record<RecursoHiit, number>; alunosPorAula: number; semanaPassada: ReadonlySet<string>;
}): OpcoesDoHiit | null {
  const estacoes = estacoesDaSemana(o.dias);
  const vaga = estacoes ? vagaDoHiit(estacoes, o.estacao, o.slot) : null;
  if (!estacoes || !vaga) return null;
  const slotAtual = vaga.e.slots[vaga.inicio - 1];

  const grupo = (x: OpcaoDoHiit) => (x.bloqueada ? 2 : x.conflitos.semanaAnterior ? 1 : 0);
  const opcoes: OpcaoDoHiit[] = [...o.catalogo.entries()]
    .filter(([id, item]) => id !== vaga.exercicioId && item.hiit?.estacoes.includes(vaga.e.estacao))
    .map(([id, item]) => {
      const conflitos = conflitosDoHiit({ ...o, slot: vaga.inicio, exercicioId: id })!;
      return { exercicioId: id, nome: item.nome, unilateral: !!item.unilateral, conflitos, bloqueada: bloqueia(conflitos) };
    })
    .sort((a, b) => grupo(a) - grupo(b) || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    vaga: {
      estacao: vaga.e.estacao,
      nome: vaga.e.nome ?? vaga.e.estacao,
      slots: Array.from({ length: vaga.tamanho }, (_, i) => vaga.inicio + i),
      unilateral: vaga.tamanho === 2,
      dias: diasDoHiit(o.dias),
      atual: { exercicioId: vaga.exercicioId, nome: String(slotAtual?.nome ?? o.catalogo.get(vaga.exercicioId)?.nome ?? vaga.exercicioId) },
    },
    opcoes,
  };
}

/**
 * Os dias da sessão H em que `exercicioId` está no HIIT — o conflito "no HIIT"
 * da troca do bloco de força (o H3 divide a sexta e o sábado com o HIIT). Vazio
 * quando a sessão não cai num dia de HIIT.
 */
export function diasNoHiit(dias: unknown, sessao: string, exercicioId: string): DiaSemana[] {
  return diasDoHiit(dias).filter((d) => {
    const dia = diaDe(dias, d);
    return dia?.sessaoForca?.sessao === sessao
      && (dia.hiit.estacoes as EstacaoCrua[]).some((e) => (e.slots ?? []).some((x) => x.exercicioId === exercicioId));
  });
}
