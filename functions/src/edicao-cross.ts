/**
 * EDIÇÃO MANUAL DO WOD E DO HYROX — lógica pura, sem Firestore e sem rede.
 *
 * Mesmo molde da troca do HIIT (`edicao-hiit.ts`): o servidor lista as opções
 * com os conflitos calculados pela MESMA conta do gerador, aplicada à semana
 * JÁ trocada; quem grava é `salvarSemanaBox`, que revalida tudo.
 *
 * ── WOD (callable `opcoesTrocaCrossBox`) ─────────────────────────────────────
 * O coach troca UM movimento; formato, tempo e a posição ficam. A prescrição
 * do movimento novo sai do catálogo (`movimentoCross`). BLOQUEIAM, sem
 * "manter" (nada disso é o WOD que o coach aprovou, ou não cabe no box):
 *  - já estar no WOD;
 *  - repetir o PADRÃO de outro movimento do WOD;
 *  - tirar o cardio do WOD (o único que ele tem);
 *  - tirar o último movimento que serve de foco da Técnica / Força;
 *  - equipamento acima do limite, pela regra mista (`contarCross`).
 * Só o rodízio (estava no Cross da semana anterior) é aviso contornável.
 *
 * ── Hyrox (callable `opcoesTrocaHyroxBox`) ───────────────────────────────────
 * A estação troca entre ela mesma e a SUBSTITUTA dela (`catalogo-hyrox.ts`);
 * bloqueia a que não cabe no inventário. O formato e as estações do formato
 * ficam: eles vêm do rodízio da prova.
 *
 * A troca vale para o conteúdo da semana: o WOD é o mesmo em todo dia que tem
 * Cross, o Hyrox em todo dia que tem Hyrox.
 */
import { cabeNoInventario, consumoCross, contarCross } from './conta-cross';
import { tecnicaDoWod } from './semana-box';
import { DADOS_ESTACAO_HYROX } from './catalogo-hyrox';
import {
  DIAS_SEMANA, NIVEIS_HYROX, RECURSOS_BOX,
  type DiaSemana, type EstacaoHyrox, type FormatoCross, type ItemCatalogo, type NivelHyrox, type PadraoCross,
  type RecursoBox, type RecursoCross, type TipoHyrox,
} from './modelo-box';

type Catalogo = ReadonlyMap<string, ItemCatalogo>;
type MovimentoCru = { exercicioId: string; nome?: string; padrao?: PadraoCross; consumoPorAluno?: Partial<Record<RecursoCross, number>> };
type WodCru = { formato: FormatoCross; movimentos: MovimentoCru[]; tecnica?: { exercicioId: string } | null };
type EstacaoHyroxCrua = { estacao: EstacaoHyrox; nome?: string; substituta?: boolean };

const diaDe = (dias: unknown, d: DiaSemana) => ((dias ?? {}) as Record<string, any>)[d] ?? null;

/* ───────────────────────────── comum ───────────────────────────── */

/** Os dias que têm o conteúdo gravado (`cross`: terça; `hyrox`: quinta). */
export function diasCom(dias: unknown, chave: 'cross' | 'hyrox'): DiaSemana[] {
  const lista = chave === 'cross' ? 'movimentos' : 'estacoes';
  return DIAS_SEMANA.filter((d) => Array.isArray(diaDe(dias, d)?.[chave]?.[lista]));
}

/**
 * Travado? ESPELHA a trava do bloco H e do HIIT: semana que já foi publicada
 * não muda num dia que já passou. Quem recusa de verdade é `salvarSemanaBox`
 * (`diasPassadosAlterados`, que também olha o WOD e o Hyrox).
 */
export function conteudoTravado(dias: unknown, chave: 'cross' | 'hyrox', datas: Record<DiaSemana, string>, hoje: string): boolean {
  return diasCom(dias, chave).some((d) => datas[d] < hoje);
}

/* ───────────────────────────── WOD ───────────────────────────── */

/** O WOD da semana (do primeiro dia que o tem), ou `null`. */
export function wodDaSemana(dias: unknown): WodCru | null {
  const d = diasCom(dias, 'cross')[0];
  return d ? (diaDe(dias, d).cross as WodCru) : null;
}

export interface ConflitosCross {
  /** Já é outro movimento deste WOD. */
  noWod: boolean;
  /** Outro movimento do WOD já tem este padrão (o nome dele). */
  padraoRepetido: string | null;
  /** A troca deixaria o WOD sem cardio. */
  tiraOCardio: boolean;
  /** A troca deixaria o WOD sem movimento para a Técnica / Força (o foco é obrigatório). */
  tiraATecnica: boolean;
  /** Recursos que passam do limite com a troca (pela regra mista, e na Técnica / Força se ele vira o foco). */
  equipamento: RecursoCross[];
  /** Estava no Cross da semana anterior. O único que deixa "manter". */
  semanaAnterior: boolean;
  /** Só informa: com a troca, ele passa a ser o foco da Técnica / Força. */
  viraFoco: boolean;
}

/** Bloqueia a escolha: tudo menos o rodízio (e o aviso de foco). */
export function bloqueiaCross(c: ConflitosCross): boolean {
  return c.noWod || !!c.padraoRepetido || c.tiraOCardio || c.tiraATecnica || c.equipamento.length > 0;
}

/**
 * Os conflitos de pôr `exercicioId` na posição `posicao` (1…n) do WOD.
 * `null` se a semana não tem WOD, a posição não existe ou o item não é de Cross.
 */
export function conflitosDoCross(o: {
  dias: unknown; posicao: number; exercicioId: string;
  catalogo: Catalogo; limites: Record<RecursoCross, number>; alunosPorAula: number; semanaPassada: ReadonlySet<string>;
}): ConflitosCross | null {
  const wod = wodDaSemana(o.dias);
  const item = o.catalogo.get(o.exercicioId);
  if (!wod || !item?.cross || o.posicao < 1 || o.posicao > wod.movimentos.length) return null;
  const outros = wod.movimentos.filter((_, i) => i !== o.posicao - 1);
  const padraoDe = (m: MovimentoCru) => m.padrao ?? o.catalogo.get(m.exercicioId)?.cross?.padrao;

  const igual = outros.find((m) => padraoDe(m) === item.cross!.padrao);
  const tinhaCardio = wod.movimentos.some((m) => padraoDe(m) === 'cardio');
  const trocado = wod.movimentos.map((m, i) => (i === o.posicao - 1
    ? { exercicioId: o.exercicioId, consumoPorAluno: consumoCross(item) }
    : m));
  // A Técnica / Força depois da troca: o foco de hoje fica se continuar no WOD;
  // senão o servidor escolhe outro — a mesma regra de quando salva (`lerCross`).
  const focoAtual = wod.tecnica?.exercicioId;
  const tecnica = tecnicaDoWod(trocado.map((m) => m.exercicioId), o.catalogo, focoAtual);
  const alertas = contarCross({ formato: wod.formato, movimentos: trocado, tecnica }, o.limites, o.alunosPorAula).alertas;
  const tinhaFoco = wod.movimentos.some((m) => !!o.catalogo.get(m.exercicioId)?.cross?.tecnica);
  return {
    noWod: outros.some((m) => m.exercicioId === o.exercicioId),
    padraoRepetido: igual ? String(igual.nome ?? o.catalogo.get(igual.exercicioId)?.nome ?? igual.exercicioId) : null,
    tiraOCardio: tinhaCardio && item.cross.padrao !== 'cardio' && !outros.some((m) => padraoDe(m) === 'cardio'),
    tiraATecnica: tinhaFoco && !tecnica,
    equipamento: [...new Set(alertas.filter((a) => a.exercicios.includes(o.exercicioId)).map((a) => a.recurso))],
    semanaAnterior: o.semanaPassada.has(o.exercicioId),
    viraFoco: tecnica?.exercicioId === o.exercicioId && focoAtual !== o.exercicioId,
  };
}

export interface OpcaoDoCross {
  exercicioId: string;
  nome: string;
  padrao: PadraoCross;
  conflitos: ConflitosCross;
  bloqueada: boolean;
}

export interface OpcoesDoCross {
  vaga: {
    posicao: number; formato: FormatoCross; dias: DiaSemana[];
    atual: { exercicioId: string; nome: string; padrao: PadraoCross | null };
  };
  opcoes: OpcaoDoCross[];
}

/**
 * Os movimentos do Cross para uma posição do WOD, cada um com os conflitos.
 * Ordem: livres, depois os que quebram o rodízio, depois os bloqueados; o
 * padrão da vaga primeiro dentro de cada grupo, e por nome. `null` se a
 * semana não tem WOD ou a posição não existe.
 */
export function opcoesDoCross(o: {
  dias: unknown; posicao: number;
  catalogo: Catalogo; limites: Record<RecursoCross, number>; alunosPorAula: number; semanaPassada: ReadonlySet<string>;
}): OpcoesDoCross | null {
  const wod = wodDaSemana(o.dias);
  const atual = wod?.movimentos[o.posicao - 1];
  if (!wod || !atual || o.posicao < 1) return null;
  const padraoAtual = atual.padrao ?? o.catalogo.get(atual.exercicioId)?.cross?.padrao ?? null;

  const grupo = (x: OpcaoDoCross) => (x.bloqueada ? 2 : x.conflitos.semanaAnterior ? 1 : 0);
  const opcoes: OpcaoDoCross[] = [...o.catalogo.entries()]
    .filter(([id, item]) => id !== atual.exercicioId && item.cross)
    .map(([id, item]) => {
      const conflitos = conflitosDoCross({ ...o, exercicioId: id })!;
      return { exercicioId: id, nome: item.nome, padrao: item.cross!.padrao, conflitos, bloqueada: bloqueiaCross(conflitos) };
    })
    .sort((a, b) => grupo(a) - grupo(b)
      || Number(b.padrao === padraoAtual) - Number(a.padrao === padraoAtual)
      || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    vaga: {
      posicao: o.posicao, formato: wod.formato, dias: diasCom(o.dias, 'cross'),
      atual: { exercicioId: atual.exercicioId, nome: String(atual.nome ?? o.catalogo.get(atual.exercicioId)?.nome ?? atual.exercicioId), padrao: padraoAtual },
    },
    opcoes,
  };
}

/* ───────────────────────────── Hyrox ───────────────────────────── */

export interface OpcaoDoHyrox {
  /** `true` = a substituta da estação; `false` = a estação da prova. */
  substituta: boolean;
  nome: string;
  tipo: TipoHyrox;
  prescricao: Record<NivelHyrox, number>;
  carga: string;
  /** Recursos que a variante pede e o box não tem ativos. */
  equipamento: RecursoBox[];
  bloqueada: boolean;
}

export interface OpcoesDoHyrox {
  vaga: {
    estacao: EstacaoHyrox; n: number; base: string; dias: DiaSemana[];
    atual: { nome: string; substituta: boolean };
  };
  /** A variante que NÃO está em uso (a estação da prova ou a substituta). Vazio = a estação não tem substituta. */
  opcoes: OpcaoDoHyrox[];
}

/**
 * A troca de uma estação do Hyrox: a outra variante dela, com o equipamento
 * conferido. A prescrição mostrada é a de prova (sem o fator do formato): o
 * servidor aplica o formato ao salvar. `null` se a semana não tem Hyrox ou a
 * estação não está nele.
 */
export function opcoesDoHyrox(o: {
  dias: unknown; estacao: string; limites: Partial<Record<RecursoBox, number>>;
}): OpcoesDoHyrox | null {
  const d = diasCom(o.dias, 'hyrox')[0];
  const estacoes = d ? (diaDe(o.dias, d).hyrox.estacoes as EstacaoHyroxCrua[]) : [];
  const atual = estacoes.find((e) => e?.estacao === o.estacao);
  const dados = atual ? DADOS_ESTACAO_HYROX[atual.estacao] : undefined;
  if (!atual || !dados) return null;

  const usaSubstituta = !!atual.substituta;
  const outra = usaSubstituta ? dados : dados.substituta;
  const opcoes: OpcaoDoHyrox[] = [];
  if (outra) {
    const equipamento = RECURSOS_BOX.filter((r) => !cabeNoInventario({ [r]: outra.recursos[r] ?? 0 }, o.limites));
    opcoes.push({
      substituta: !usaSubstituta, nome: outra.nome, tipo: outra.tipo,
      prescricao: Object.fromEntries(NIVEIS_HYROX.map((n) => [n, outra.prescricao[n]])) as Record<NivelHyrox, number>,
      carga: outra.carga, equipamento, bloqueada: equipamento.length > 0,
    });
  }
  return {
    vaga: {
      estacao: atual.estacao, n: dados.n, base: dados.base, dias: diasCom(o.dias, 'hyrox'),
      atual: { nome: String(atual.nome ?? (usaSubstituta ? dados.substituta?.nome : dados.nome)), substituta: usaSubstituta },
    },
    opcoes,
  };
}
