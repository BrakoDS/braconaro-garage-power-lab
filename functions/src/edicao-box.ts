/**
 * EDIÇÃO MANUAL DA SEMANA DO BOX — lógica pura, sem Firestore e sem rede.
 *
 * O coach troca um exercício de uma SESSÃO (H1, H2, H3), não de um dia: o H1 da
 * segunda e o catch-up de terça são a mesma aula, e trocar só um deles faria o
 * outro aparecer como "repetido na semana" — o que é falso. A semana aqui é vista
 * como `blocos[sessao] = [ids na ordem das vagas]`.
 *
 * Quem decide é o servidor:
 *  - `opcoesDaVaga` (callable `opcoesTrocaBox`): todo o catálogo para uma vaga,
 *    cada opção já com os conflitos e, quando repete outra sessão, os melhores
 *    substitutos para o OUTRO lugar — na mesma ordem de preferência do gerador;
 *  - `avisosDeEdicao`: o que fica gravado na semana como nota (repetição entre
 *    sessões, rodízio quebrado) — informa, não bloqueia;
 *  - `diasPassadosAlterados`: semana que já foi publicada não muda em dia que
 *    passou (o aluno pode ter registrado a sessão com os exercícios antigos).
 *
 * O que BLOQUEIA continua onde sempre esteve: equipamento acima do limite não
 * publica (`problemasParaPublicar`), e exercício repetido dentro do mesmo bloco
 * não salva (`lerDias`). "Manter assim mesmo" só existe para repetição e rodízio.
 */
import { candidatosEmOrdem } from './gerador-box';
import {
  DIAS_SEMANA, MATRIZ_H, RECURSOS_INVENTARIO, SESSOES_H,
  type DiaSemana, type ExercicioCatalogo, type Instancia, type RecursoInventario, type SessaoH,
} from './modelo-box';
import { consumoDoDia, recursosDo } from './semana-box';
import { diasNoHiit } from './edicao-hiit';

type Blocos = Partial<Record<SessaoH, string[]>>;
type Catalogo = ReadonlyMap<string, ExercicioCatalogo>;

const diaDe = (dias: unknown, d: DiaSemana) => ((dias ?? {}) as Record<string, any>)[d] ?? null;

/** Os dias em que a sessão aparece, na ordem da semana (H1 → segunda e terça). */
export function diasDaSessao(dias: unknown, sessao: string): DiaSemana[] {
  return DIAS_SEMANA.filter((d) => diaDe(dias, d)?.sessaoForca?.sessao === sessao);
}

/** Os blocos da semana por sessão — do primeiro dia em que cada uma aparece. */
export function blocosDaSemana(dias: unknown): Blocos {
  const blocos: Blocos = {};
  for (const sessao of SESSOES_H) {
    const dia = diasDaSessao(dias, sessao)[0];
    const bloco = dia ? diaDe(dias, dia)?.blocoPrincipal : null;
    if (Array.isArray(bloco)) blocos[sessao] = bloco.map((e: any) => String(e?.exercicioId ?? ''));
  }
  return blocos;
}

/** Onde cada exercício aparece, por sessão — o catch-up não conta duas vezes. */
function usos(blocos: Blocos): Map<string, { sessao: SessaoH; posicao: number }[]> {
  const mapa = new Map<string, { sessao: SessaoH; posicao: number }[]>();
  for (const sessao of SESSOES_H) {
    (blocos[sessao] ?? []).forEach((id, i) => {
      if (!id) return;
      mapa.set(id, [...(mapa.get(id) ?? []), { sessao, posicao: i + 1 }]);
    });
  }
  return mapa;
}

const comTroca = (blocos: Blocos, sessao: SessaoH, posicao: number, id: string): Blocos => ({
  ...blocos,
  [sessao]: (blocos[sessao] ?? []).map((x, i) => (i === posicao - 1 ? id : x)),
});

export interface ConflitosTroca {
  /** Já está em OUTRA vaga da mesma sessão — o servidor não salva (`lerDias`). */
  mesmoBloco: boolean;
  /** O mesmo exercício em outra sessão da semana, e em que dias ela cai. */
  repeticoes: { sessao: SessaoH; posicao: number; dias: DiaSemana[] }[];
  /** Foi usado na semana anterior — quebra o rodízio. */
  semanaAnterior: boolean;
  /** Recursos que ESTE exercício usa e que passariam do limite ativo na sessão. Bloqueia a publicação. */
  equipamento: { recurso: RecursoInventario; usado: number; limite: number }[];
  /** Não é da instância da vaga (troca livre — permitida, mas a matriz do H muda). */
  instanciaDiferente: boolean;
  /**
   * Os dias desta sessão em que o exercício já está no HIIT (o H3 divide a sexta
   * e o sábado com ele). O dia não repete exercício: não publica. Bloqueia.
   */
  noHiit: DiaSemana[];
}

/** Os conflitos de pôr `exercicioId` na vaga `posicao` (1 a 6) da `sessao`. */
export function conflitosDaTroca(o: {
  dias: unknown; sessao: SessaoH; posicao: number; exercicioId: string;
  catalogo: Catalogo; limites: Record<RecursoInventario, number>; semanaPassada: ReadonlySet<string>;
}): ConflitosTroca {
  const blocos = blocosDaSemana(o.dias);
  const bloco = blocos[o.sessao] ?? [];
  const atual = bloco[o.posicao - 1];
  const novo = comTroca(blocos, o.sessao, o.posicao, o.exercicioId)[o.sessao] ?? [];

  const item = o.catalogo.get(o.exercicioId);
  const consumo = consumoDoDia(novo.map((exercicioId) => ({ exercicioId })), o.catalogo);
  const usaRecursos = new Set(item ? recursosDo(item) : []);

  return {
    mesmoBloco: bloco.some((id, i) => i !== o.posicao - 1 && id === o.exercicioId),
    repeticoes: (usos(blocos).get(o.exercicioId) ?? [])
      .filter((u) => u.sessao !== o.sessao)
      .map((u) => ({ ...u, dias: diasDaSessao(o.dias, u.sessao) })),
    semanaAnterior: o.semanaPassada.has(o.exercicioId),
    equipamento: RECURSOS_INVENTARIO
      .filter((r) => usaRecursos.has(r) && (consumo[r] ?? 0) > o.limites[r])
      .map((r) => ({ recurso: r, usado: consumo[r] ?? 0, limite: o.limites[r] })),
    instanciaDiferente: !!atual && !!item && o.catalogo.get(atual)?.instancia !== item.instancia,
    noHiit: diasNoHiit(o.dias, o.sessao, o.exercicioId),
  };
}

/**
 * Os melhores substitutos para uma vaga, na ordem do gerador. Ficam de fora: o
 * que está proibido (o exercício que acabou de ir para a outra sessão), o que já
 * está no bloco, e o que estouraria um recurso da sessão.
 */
export function sugestoesPara(o: {
  blocos: Blocos; sessao: SessaoH; posicao: number; proibidos: ReadonlySet<string>;
  catalogo: Catalogo; limites: Record<RecursoInventario, number>; semanaPassada: ReadonlySet<string>;
  semente: string; max?: number;
}): string[] {
  const bloco = o.blocos[o.sessao] ?? [];
  const atual = bloco[o.posicao - 1];
  const instancia: Instancia | undefined = o.catalogo.get(atual)?.instancia ?? MATRIZ_H[o.sessao].instancias[o.posicao - 1];
  if (!instancia) return [];
  const usadosNaSemana = new Set(Object.values(o.blocos).flat());
  return candidatosEmOrdem(instancia, { catalogo: o.catalogo, semanaPassada: o.semanaPassada, usadosNaSemana, semente: o.semente })
    .filter((id) => {
      if (o.proibidos.has(id) || bloco.some((x, i) => x === id && i !== o.posicao - 1)) return false;
      const consumo = consumoDoDia(bloco.map((x, i) => ({ exercicioId: i === o.posicao - 1 ? id : x })), o.catalogo);
      const item = o.catalogo.get(id);
      return !(item ? recursosDo(item) : []).some((r) => (consumo[r] ?? 0) > o.limites[r]);
    })
    .slice(0, o.max ?? 3);
}

export interface OpcaoDaVaga {
  exercicioId: string;
  nome: string;
  instancia: Instancia;
  mesmaInstancia: boolean;
  conflitos: ConflitosTroca;
  /** Para cada repetição: os substitutos sugeridos para o OUTRO lugar. */
  substitutos: { sessao: SessaoH; posicao: number; dias: DiaSemana[]; opcoes: { exercicioId: string; nome: string }[] }[];
}

export interface OpcoesDaVaga {
  vaga: { sessao: SessaoH; posicao: number; instancia: Instancia; dias: DiaSemana[]; atual: { exercicioId: string; nome: string } };
  opcoes: OpcaoDaVaga[];
}

const peso = (c: ConflitosTroca) =>
  (c.mesmoBloco ? 100 : 0) + (c.equipamento.length || c.noHiit.length ? 10 : 0) + (c.repeticoes.length ? 2 : 0) + (c.semanaAnterior ? 1 : 0);

/**
 * Todo o catálogo para uma vaga, com os conflitos já calculados — a lista que o
 * coach vê ao tocar em "trocar". Ordem: a instância da vaga primeiro, sem
 * conflito antes de com conflito, e por nome. `null` se a vaga não existe.
 */
export function opcoesDaVaga(o: {
  dias: unknown; sessao: SessaoH; posicao: number;
  catalogo: Catalogo; limites: Record<RecursoInventario, number>; semanaPassada: ReadonlySet<string>; semente: string;
}): OpcoesDaVaga | null {
  const blocos = blocosDaSemana(o.dias);
  const bloco = blocos[o.sessao];
  if (!bloco || o.posicao < 1 || o.posicao > bloco.length) return null;
  const atual = bloco[o.posicao - 1];
  const instancia = o.catalogo.get(atual)?.instancia ?? MATRIZ_H[o.sessao].instancias[o.posicao - 1];
  const dia0 = diasDaSessao(o.dias, o.sessao)[0];
  const nomeAtual = String(diaDe(o.dias, dia0)?.blocoPrincipal?.[o.posicao - 1]?.nome ?? o.catalogo.get(atual)?.nome ?? atual);

  const opcoes: OpcaoDaVaga[] = [...o.catalogo.entries()]
    .filter(([id]) => id !== atual)
    .map(([id, item]) => {
      const conflitos = conflitosDaTroca({ ...o, exercicioId: id });
      const depois = comTroca(blocos, o.sessao, o.posicao, id);
      return {
        exercicioId: id,
        nome: item.nome,
        instancia: item.instancia,
        mesmaInstancia: item.instancia === instancia,
        conflitos,
        substitutos: conflitos.repeticoes.map((r) => ({
          ...r,
          opcoes: sugestoesPara({
            blocos: depois, sessao: r.sessao, posicao: r.posicao, proibidos: new Set([id]),
            catalogo: o.catalogo, limites: o.limites, semanaPassada: o.semanaPassada, semente: `${o.semente}:${r.sessao}:${r.posicao}`,
          }).map((x) => ({ exercicioId: x, nome: o.catalogo.get(x)?.nome ?? x })),
        })),
      };
    })
    .sort((a, b) => Number(b.mesmaInstancia) - Number(a.mesmaInstancia)
      || peso(a.conflitos) - peso(b.conflitos)
      || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    vaga: { sessao: o.sessao, posicao: o.posicao, instancia, dias: diasDaSessao(o.dias, o.sessao), atual: { exercicioId: atual, nome: nomeAtual } },
    opcoes,
  };
}

export type AvisoEdicao =
  | { tipo: 'repeticao'; exercicioId: string; nome: string; lugares: { sessao: SessaoH; posicao: number }[] }
  | { tipo: 'semanaAnterior'; exercicioId: string; nome: string; sessao: SessaoH; posicao: number };

/**
 * O que a semana tem de "consciente" — repetição entre sessões e exercício da
 * semana anterior. Gravado na semana como NOTA: o coach que escolheu "manter
 * assim mesmo" continua vendo, e quem abre a semana depois entende por quê.
 */
export function avisosDeEdicao(dias: unknown, semanaPassada: ReadonlySet<string>): AvisoEdicao[] {
  const blocos = blocosDaSemana(dias);
  const nomeDe = (sessao: SessaoH, posicao: number) =>
    String(diaDe(dias, diasDaSessao(dias, sessao)[0])?.blocoPrincipal?.[posicao - 1]?.nome ?? '');
  const avisos: AvisoEdicao[] = [];
  for (const [id, lugares] of usos(blocos)) {
    if (new Set(lugares.map((l) => l.sessao)).size > 1) {
      avisos.push({ tipo: 'repeticao', exercicioId: id, nome: nomeDe(lugares[0].sessao, lugares[0].posicao), lugares });
    }
  }
  for (const sessao of SESSOES_H) {
    (blocos[sessao] ?? []).forEach((id, i) => {
      if (semanaPassada.has(id)) avisos.push({ tipo: 'semanaAnterior', exercicioId: id, nome: nomeDe(sessao, i + 1), sessao, posicao: i + 1 });
    });
  }
  return avisos;
}

/** O que importa de um dia para saber se ele mudou. */
function retrato(d: any): string {
  return JSON.stringify({
    treinos: Array.isArray(d?.treinos) ? d.treinos : [],
    bloco: (Array.isArray(d?.blocoPrincipal) ? d.blocoPrincipal : [])
      .map((e: any) => [e?.exercicioId, e?.series, e?.repeticoes, e?.descansoSeg]),
    cadencia: d?.cadencia ?? '',
    descansos: [d?.descansos?.entreSeriesSeg ?? null, d?.descansos?.entreExerciciosSeg ?? null],
    // Ausente (semana de antes do HIIT) e `null` têm o mesmo retrato: nada mudou.
    hiit: (Array.isArray(d?.hiit?.estacoes) ? d.hiit.estacoes : [])
      .map((e: any) => [e?.estacao, (Array.isArray(e?.slots) ? e.slots : []).map((x: any) => x?.exercicioId)]),
    // Idem para o WOD e o Hyrox (semana de antes deles).
    cross: Array.isArray(d?.cross?.movimentos)
      ? [d.cross.formato, d.cross.minutos ?? null, d.cross.rodadas ?? null, d.cross.movimentos.map((m: any) => m?.exercicioId),
        d.cross.tecnica?.exercicioId ?? null]
      : null,
    hyrox: Array.isArray(d?.hyrox?.estacoes)
      ? [d.hyrox.formato, d.hyrox.estacoes.map((e: any) => [e?.estacao, !!e?.substituta])]
      : null,
    // Ausente (semana de antes do aviso) e `null` também têm o mesmo retrato.
    aviso: d?.aviso ? [d.aviso.tipo ?? null, d.aviso.texto ?? ''] : null,
  });
}

/**
 * Os dias que JÁ PASSARAM e que a versão nova muda. Numa semana que já foi
 * publicada, qualquer um deles impede salvar: o aluno pode ter registrado a
 * sessão daquele dia com os exercícios de antes. Hoje NÃO conta como passado.
 */
export function diasPassadosAlterados(antes: unknown, depois: unknown, datas: Record<DiaSemana, string>, hoje: string): DiaSemana[] {
  return DIAS_SEMANA.filter((d) => datas[d] < hoje && retrato(diaDe(antes, d)) !== retrato(diaDe(depois, d)));
}

/** As sessões que têm algum dia já passado — numa semana publicada, não se editam. */
export function sessoesTravadas(dias: unknown, datas: Record<DiaSemana, string>, hoje: string): SessaoH[] {
  return SESSOES_H.filter((s) => diasDaSessao(dias, s).some((d) => datas[d] < hoje));
}
