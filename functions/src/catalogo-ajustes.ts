/**
 * CATÁLOGO DO COACH — a camada de AJUSTES por cima de `catalogoExercicios/`.
 *
 * Quem o gerador da semana, as trocas manuais e o volume do aluno leem é o
 * FIRESTORE (`carregarCatalogo` e `carregarCatalogoInteiro` em `index.ts`), não o
 * código: `catalogo-base.ts`, `catalogo-hiit.ts` e `catalogo-cross.ts` são só a
 * fonte do `seed-catalogo.ts`. Editar `catalogoExercicios/{id}` direto não serve —
 * o próximo seed reescreveria o item inteiro com o que está no código.
 *
 * Por isso a tela "Catálogo" do coach grava AO LADO, em `catalogoAjustes/{id}`,
 * e o servidor aplica por cima na leitura (`catalogoEfetivo`):
 *
 *   - `campos`: só o que o coach mudou num item do seed (nome, músculos,
 *     equipamentos, adaptações, unilateral). O que ele não tocou continua vindo do
 *     seed — uma revisão no código ainda chega ao box;
 *   - `criado: true`: exercício novo, que não existe no seed. `campos` é o item
 *     INTEIRO (com a instância, o `hiit` e/ou o `cross`), e o id começa com
 *     `coach_` para nunca colidir com um id que o seed venha a ter;
 *   - `ativo: false`: o gerador e as trocas deixam de oferecer o exercício
 *     (equipamento quebrado). Semana que já o usa continua válida, e o volume
 *     dele continua contando — desativar não apaga história.
 *
 * Ajuste torto nunca derruba o item do seed: se o resultado não passa no
 * `lerItemCatalogo`, vale o item do seed como está (e o id sai em `ignorados`).
 *
 * As regras do Firestore dão `write: if false` em `catalogoAjustes`; quem grava
 * é `salvarExercicioCatalogo` e `ativarExercicioCatalogo`, com o Admin SDK.
 */
import { DADOS_ESTACAO_HYROX, MUSCULOS_HYROX } from './catalogo-hyrox';
import {
  ADAPTACOES, EQUIPAMENTOS, ESTACOES_HIIT, ESTACOES_HYROX, INSTANCIAS, MATRIZ_H, MUSCULOS, PADROES_CROSS, SESSOES_H, UNIDADES_CROSS,
  type Adaptacao, type CategoriaFoco, type Equipamento, type EstacaoHiit, type EstacaoHyrox, type Instancia, type ItemCatalogo,
  type Musculo, type PadraoCross, type RecursoBox, type SessaoH, type UnidadeCross,
} from './modelo-box';
import { lerItemCatalogo } from './semana-box';

/** Os campos que a tela edita num item que já existe (do seed ou criado pelo coach). */
export const CAMPOS_EDITAVEIS = ['nome', 'musculoPrincipal', 'musculosSecundarios', 'equipamentos', 'adaptacoes', 'unilateral'] as const;
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

/** Prefixo do id de um exercício criado pelo coach. */
export const PREFIXO_CRIADO = 'coach_';
const EH_ID = /^[a-z0-9_]{1,60}$/;
const MAX_NOME = 100;

/** Um documento de `catalogoAjustes/{id}`, lido. */
export interface AjusteCatalogo {
  /** Item do seed: só os campos mudados. Criado pelo coach: o item inteiro. */
  campos: Record<string, unknown> | null;
  /** Ausente no documento = ativo. */
  ativo: boolean;
  criado: boolean;
}

/** O catálogo que o servidor usa: seed + ajustes. */
export interface CatalogoEfetivo {
  /** TODOS os itens válidos, ativos ou não — semana gravada, salvar e volume leem este. */
  itens: Map<string, ItemCatalogo>;
  /** Desativados pelo coach: o gerador e as trocas não oferecem. */
  inativos: Set<string>;
  /** Item do seed com algum campo mudado pelo coach. */
  editados: Set<string>;
  /** Criados pelo coach (sem item no seed). */
  criados: Set<string>;
  /** O item do seed como está no Firestore (para a tela mostrar o original e restaurar). */
  doSeed: Map<string, ItemCatalogo>;
  /** Ajustes que não deram item válido e foram deixados de lado. */
  ignorados: string[];
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function em<T extends string>(lista: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (lista as readonly string[]).includes(v);
}

/** Um `catalogoAjustes/{id}` cru → ajuste, ou `null` se a forma não fecha. */
export function lerAjuste(doc: unknown): AjusteCatalogo | null {
  if (!ehObjeto(doc)) return null;
  if (doc.campos !== undefined && doc.campos !== null && !ehObjeto(doc.campos)) return null;
  if (doc.ativo !== undefined && typeof doc.ativo !== 'boolean') return null;
  const campos = ehObjeto(doc.campos) ? doc.campos : null;
  const criado = doc.criado === true;
  // Item do seed só aceita os campos editáveis: o coach não muda instância nem a parte do HIIT/Cross.
  if (campos && !criado && Object.keys(campos).some((k) => !em(CAMPOS_EDITAVEIS, k))) return null;
  return { campos, ativo: doc.ativo !== false, criado };
}

/**
 * Seed + ajustes → o catálogo que o servidor usa. Recebe os documentos CRUS
 * (`catalogoExercicios` e `catalogoAjustes`), para a mesma função servir à
 * leitura do Firestore e aos testes.
 */
export function catalogoEfetivo(
  bases: Iterable<readonly [string, unknown]>,
  ajustes: Iterable<readonly [string, unknown]>,
): CatalogoEfetivo {
  const r: CatalogoEfetivo = {
    itens: new Map(), inativos: new Set(), editados: new Set(), criados: new Set(), doSeed: new Map(), ignorados: [],
  };
  for (const [id, doc] of bases) {
    const item = lerItemCatalogo(doc);
    if (item) { r.itens.set(id, item); r.doSeed.set(id, item); }
  }
  for (const [id, doc] of ajustes) {
    const ajuste = lerAjuste(doc);
    if (!ajuste) { r.ignorados.push(id); continue; }
    const base = r.doSeed.get(id);
    if (ajuste.campos) {
      // Criado pelo coach com um id que o seed passou a ter: vale o seed (o ajuste vira só edição se for refeito).
      const item = ajuste.criado ? (base ? null : lerItemCatalogo(ajuste.campos))
        : base ? lerItemCatalogo({ ...base, ...ajuste.campos }) : null;
      if (item) {
        r.itens.set(id, item);
        (ajuste.criado ? r.criados : r.editados).add(id);
      } else {
        r.ignorados.push(id);
      }
    }
    if (!ajuste.ativo && r.itens.has(id)) r.inativos.add(id);
  }
  return r;
}

/** Só os ativos — o que o gerador sorteia. */
export function ativosDe(c: Pick<CatalogoEfetivo, 'itens' | 'inativos'>): Map<string, ItemCatalogo> {
  return new Map([...c.itens].filter(([id]) => !c.inativos.has(id)));
}

/**
 * Tira os desativados das OPÇÕES de uma troca manual (`opcoesTrocaBox`,
 * `opcoesTrocaHiitBox`, `opcoesTrocaCrossBox`). As trocas recebem o catálogo
 * inteiro de propósito: o conflito de equipamento é calculado com o que já está
 * na semana, e isso pode incluir um exercício desativado depois de sorteado.
 */
export function semInativos<T extends { opcoes: { exercicioId: string; substitutos?: { opcoes: { exercicioId: string }[] }[] }[] }>(
  resultado: T, inativos: ReadonlySet<string>,
): T {
  if (!inativos.size) return resultado;
  return {
    ...resultado,
    opcoes: resultado.opcoes
      .filter((o) => !inativos.has(o.exercicioId))
      .map((o) => (o.substitutos
        ? { ...o, substitutos: o.substitutos.map((s) => ({ ...s, opcoes: s.opcoes.filter((x) => !inativos.has(x.exercicioId)) })) }
        : o)),
  };
}

/* ───────────────────────────── desativar ───────────────────────────── */

/**
 * O que acontece se `id` sair do sorteio. `erro`: a semana não teria como ser
 * gerada (uma vaga do H sem nenhum exercício ativo — o gerador montaria um bloco
 * com menos de 6). `avisos`: dá para gerar, mas com menos variedade.
 */
export function efeitoDeDesativar(c: Pick<CatalogoEfetivo, 'itens' | 'inativos'>, id: string): { erro: string | null; avisos: string[] } {
  const item = c.itens.get(id);
  if (!item) return { erro: 'Esse exercício não está no catálogo.', avisos: [] };
  const restantes = ativosDe({ itens: c.itens, inativos: new Set([...c.inativos, id]) });
  const avisos: string[] = [];

  if (item.instancia) {
    const iguais = [...restantes.values()].filter((e) => e.instancia === item.instancia).length;
    const sessoes = sessoesDaInstancia(item.instancia);
    if (!iguais) {
      return {
        erro: `${item.nome} é o último exercício ativo de ${item.instancia.replace(/_/g, ' ')}: ${sessoes.join(', ')} ${sessoes.length > 1 ? 'ficariam' : 'ficaria'} sem exercício nessa vaga. Ative ou crie outro antes.`,
        avisos,
      };
    }
    // 2 vagas da mesma instância na semana (H1, H2, H3 têm agachar) com 1 opção = repetir toda semana.
    if (iguais < sessoes.length) avisos.push(`${iguais === 1 ? 'Sobra 1 exercício' : `Sobram ${iguais} exercícios`} de ${item.instancia.replace(/_/g, ' ')} para ${sessoes.length} sessões: o rodízio vai repetir.`);
  }
  for (const estacao of item.hiit?.estacoes ?? []) {
    const n = [...restantes.values()].filter((e) => e.hiit?.estacoes.includes(estacao)).length;
    if (n < 4) avisos.push(`HIIT ${estacao}: sobram ${n} exercício(s) para 4 slots — a estação pode sair incompleta e a semana não publica.`);
  }
  if (item.cross) {
    const doPadrao = [...restantes.values()].filter((e) => e.cross?.padrao === item.cross!.padrao).length;
    if (!doPadrao) avisos.push(`Cross: nenhum movimento ativo de padrão ${item.cross.padrao} — o WOD sorteia sem ele.`);
    if (item.cross.tecnica && ![...restantes.values()].some((e) => e.cross?.tecnica)) {
      avisos.push('Cross: nenhum movimento ativo serve de foco da Técnica / Força — a semana não publica.');
    }
  }
  return { erro: null, avisos };
}

/** As sessões H que têm uma vaga dessa instância. */
export function sessoesDaInstancia(instancia: Instancia): SessaoH[] {
  return SESSOES_H.filter((s) => MATRIZ_H[s].instancias.includes(instancia));
}

/* ───────────────────────────── criar e editar ───────────────────────────── */

/** Comparação de nome que ignora caixa, acento e espaço repetido. */
export const nomeComparavel = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** O id de um exercício novo: `coach_` + o nome em snake_case, com sufixo se já existir. */
export function idNovo(nome: string, existentes: ReadonlySet<string>): string {
  const base = PREFIXO_CRIADO + (nomeComparavel(nome).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'exercicio');
  if (!existentes.has(base)) return base;
  for (let n = 2; ; n++) if (!existentes.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Lista fechada do pedido, sem repetir; `null` se tiver valor fora da lista. */
function listaDoPedido<T extends string>(v: unknown, fechada: readonly T[]): T[] | null {
  if (!Array.isArray(v) || !v.every((x) => em(fechada, x))) return null;
  return [...new Set(v as T[])];
}

/** O pedido de `salvarExercicioCatalogo`. */
export interface PedidoExercicio {
  /** Ausente = criar. */
  id?: unknown;
  /** Volta o item do seed ao que está no código (apaga os `campos`). */
  restaurar?: unknown;
  nome?: unknown;
  musculoPrincipal?: unknown;
  musculosSecundarios?: unknown;
  equipamentos?: unknown;
  adaptacoes?: unknown;
  unilateral?: unknown;
  /** Só ao criar: força (`instancia`), HIIT (`hiit.estacoes`) e/ou Cross (`cross`). */
  instancia?: unknown;
  hiit?: unknown;
  cross?: unknown;
}

/** O que gravar em `catalogoAjustes/{id}`: `campos: null` = sem edição (só o ativo, se houver). */
export interface AjusteParaGravar {
  id: string;
  campos: Record<string, unknown> | null;
  criado: boolean;
  item: ItemCatalogo;
}

/**
 * Valida o pedido da tela e devolve o ajuste a gravar — ou o erro, já escrito
 * para o coach. O servidor confere tudo de novo: a tela é só uma forma de pedir.
 */
export function lerPedidoExercicio(p: PedidoExercicio, c: CatalogoEfetivo): AjusteParaGravar | { erro: string } {
  if (!ehObjeto(p)) return { erro: 'Pedido vazio.' };
  const editando = p.id !== undefined;
  const id = editando ? (typeof p.id === 'string' && EH_ID.test(p.id) ? p.id : '') : '';
  if (editando && (!id || !c.itens.has(id))) return { erro: 'Esse exercício não está no catálogo.' };
  const atual = editando ? c.itens.get(id)! : null;
  const doSeed = editando ? c.doSeed.get(id) ?? null : null;

  if (p.restaurar === true) {
    if (!doSeed) return { erro: 'Só exercício do catálogo base volta ao original.' };
    return { id, campos: null, criado: false, item: doSeed };
  }

  const nome = typeof p.nome === 'string' ? p.nome.trim().replace(/\s+/g, ' ').slice(0, MAX_NOME) : '';
  if (nome.length < 3) return { erro: 'Dê um nome ao exercício (3 letras ou mais).' };
  const repetido = [...c.itens].find(([outro, e]) => outro !== id && nomeComparavel(e.nome) === nomeComparavel(nome));
  if (repetido) return { erro: `Já existe "${repetido[1].nome}" no catálogo.` };

  const musculoPrincipal = listaDoPedido(p.musculoPrincipal, MUSCULOS);
  if (!musculoPrincipal?.length) return { erro: 'Escolha ao menos um músculo principal.' };
  const musculosSecundarios = listaDoPedido(p.musculosSecundarios ?? [], MUSCULOS);
  if (!musculosSecundarios) return { erro: 'Músculo secundário desconhecido.' };
  const nosDois = musculosSecundarios.filter((m) => musculoPrincipal.includes(m));
  if (nosDois.length) return { erro: `${nosDois.join(', ')} está como principal E secundário — escolha um dos dois.` };
  const equipamentos = listaDoPedido(p.equipamentos, EQUIPAMENTOS);
  if (!equipamentos?.length) return { erro: 'Escolha ao menos um equipamento (peso corporal conta).' };
  if (p.unilateral !== undefined && typeof p.unilateral !== 'boolean') return { erro: 'unilateral é sim ou não.' };

  const adaptacoes: Partial<Record<Adaptacao, string>> = {};
  if (p.adaptacoes !== undefined) {
    if (!ehObjeto(p.adaptacoes)) return { erro: 'Adaptações inválidas.' };
    for (const [k, v] of Object.entries(p.adaptacoes)) {
      if (v === '' || v === null) continue;
      if (!em(ADAPTACOES, k)) return { erro: `Adaptação desconhecida: ${k}.` };
      if (typeof v !== 'string' || !c.itens.has(v)) return { erro: `A adaptação de ${k} aponta para um exercício que não está no catálogo.` };
      if (v === id) return { erro: `A adaptação de ${k} não pode ser o próprio exercício.` };
      adaptacoes[k] = v;
    }
  }
  const editaveis: Record<CampoEditavel, unknown> = {
    nome, musculoPrincipal, musculosSecundarios, equipamentos, adaptacoes, unilateral: p.unilateral === true,
  };

  if (atual) {
    const proposto = lerItemCatalogo({ ...atual, ...editaveis });
    if (!proposto) return { erro: 'O exercício editado não fecha — confira os campos.' };
    if (c.criados.has(id)) return { id, campos: { ...proposto }, criado: true, item: proposto };
    // Item do seed: grava só o que difere do seed, para uma revisão no código ainda chegar nos outros campos.
    const campos: Record<string, unknown> = {};
    for (const k of CAMPOS_EDITAVEIS) {
      const doBase = k === 'unilateral' ? doSeed?.unilateral === true : doSeed?.[k];
      if (JSON.stringify(normalizado(editaveis[k])) !== JSON.stringify(normalizado(doBase))) campos[k] = editaveis[k];
    }
    return { id, campos: Object.keys(campos).length ? campos : null, criado: false, item: proposto };
  }

  // Criar: ao menos uma modalidade.
  const instancia = p.instancia === undefined || p.instancia === null || p.instancia === '' ? null : p.instancia;
  if (instancia !== null && !em(INSTANCIAS, instancia)) return { erro: 'Vaga de força desconhecida.' };
  let hiit: { estacoes: EstacaoHiit[] } | undefined;
  if (p.hiit !== undefined && p.hiit !== null) {
    const estacoes = listaDoPedido((p.hiit as { estacoes?: unknown })?.estacoes, ESTACOES_HIIT);
    if (!estacoes?.length) return { erro: 'Para o HIIT, escolha ao menos uma estação.' };
    hiit = { estacoes };
  }
  let cross: { padrao: PadraoCross; unidade: UnidadeCross; rx: number; carga?: { rx: string; scaled: string } } | undefined;
  if (p.cross !== undefined && p.cross !== null) {
    const x = (ehObjeto(p.cross) ? p.cross : {}) as Record<string, unknown>;
    if (!em(PADROES_CROSS, x.padrao)) return { erro: 'Para o Cross, escolha o padrão do movimento.' };
    if (!em(UNIDADES_CROSS, x.unidade)) return { erro: 'Para o Cross, escolha a unidade (reps, metros, calorias, segundos).' };
    const rx = typeof x.rx === 'number' && Number.isInteger(x.rx) && x.rx >= 1 && x.rx <= 5000 ? x.rx : null;
    if (rx === null) return { erro: 'Para o Cross, o RX de uma rodada é um inteiro de 1 a 5000.' };
    cross = { padrao: x.padrao, unidade: x.unidade, rx };
    const k = ehObjeto(x.carga) ? x.carga : null;
    const cargaRx = typeof k?.rx === 'string' ? k.rx.trim().slice(0, 60) : '';
    const cargaScaled = typeof k?.scaled === 'string' ? k.scaled.trim().slice(0, 60) : '';
    if (cargaRx || cargaScaled) {
      if (!cargaRx || !cargaScaled) return { erro: 'Carga do Cross: preencha RX e Scaled, ou deixe as duas em branco.' };
      cross.carga = { rx: cargaRx, scaled: cargaScaled };
    }
  }
  if (!instancia && !hiit && !cross) return { erro: 'Escolha onde o exercício entra: Força (vaga do H), HIIT e/ou Cross.' };

  const campos: Record<string, unknown> = {
    ...editaveis, instancia,
    ...(hiit ? { hiit } : {}),
    ...(cross ? { cross } : {}),
  };
  if (!campos.unilateral) delete campos.unilateral;
  const item = lerItemCatalogo(campos);
  if (!item) return { erro: 'O exercício novo não fecha — confira os campos.' };
  const novoId = idNovo(nome, new Set([...c.itens.keys(), ...c.doSeed.keys()]));
  return { id: novoId, campos: { ...item }, criado: true, item };
}

/** Lista em ordem estável e objeto sem chave vazia: `['b','a']` e `['a','b']` não são edição. */
function normalizado(v: unknown): unknown {
  if (Array.isArray(v)) return [...v].sort();
  if (ehObjeto(v)) return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== '').sort(([a], [b]) => a.localeCompare(b)));
  return v ?? null;
}

/* ───────────────────────────── a tela ───────────────────────────── */

/** Um exercício como a tela "Catálogo" mostra. */
export interface LinhaCatalogo {
  id: string;
  nome: string;
  ativo: boolean;
  origem: 'seed' | 'coach';
  /** Item do seed com campo mudado pelo coach. */
  editado: boolean;
  instancia: Instancia | null;
  /** As sessões H que têm a vaga dessa instância. */
  sessoes: SessaoH[];
  hiit: EstacaoHiit[] | null;
  cross: { padrao: PadraoCross; unidade: UnidadeCross; rx: number; carga: { rx: string; scaled: string } | null; foco: CategoriaFoco | null } | null;
  musculoPrincipal: Musculo[];
  musculosSecundarios: Musculo[];
  equipamentos: Equipamento[];
  unilateral: boolean;
  adaptacoes: { adaptacao: Adaptacao; exercicioId: string; nome: string }[];
  /** O item do seed, quando o coach editou — a tela mostra "era" e oferece restaurar. */
  original: Pick<ItemCatalogo, 'nome' | 'musculoPrincipal' | 'musculosSecundarios' | 'equipamentos'> | null;
}

/** Uma estação do Hyrox (fora do `catalogoExercicios/`, só leitura na tela). */
export interface LinhaHyrox {
  estacao: EstacaoHyrox;
  n: number;
  nome: string;
  recursos: Partial<Record<RecursoBox, number>>;
  musculoPrincipal: Musculo[];
  musculosSecundarios: Musculo[];
  substituta: { nome: string; musculoPrincipal: Musculo[]; musculosSecundarios: Musculo[] } | null;
}

/** O catálogo inteiro para a tela, em ordem de nome, com o vocabulário que o servidor aceita. */
export function linhasDoCatalogo(c: CatalogoEfetivo): {
  exercicios: LinhaCatalogo[]; hyrox: LinhaHyrox[];
  vocabulario: {
    musculos: readonly Musculo[]; equipamentos: readonly Equipamento[]; instancias: readonly Instancia[]; adaptacoes: readonly Adaptacao[];
    estacoesHiit: readonly EstacaoHiit[]; padroesCross: readonly PadraoCross[]; unidadesCross: readonly UnidadeCross[];
  };
} {
  const exercicios = [...c.itens].map(([id, e]): LinhaCatalogo => {
    const doSeed = c.doSeed.get(id);
    return {
      id, nome: e.nome, ativo: !c.inativos.has(id),
      origem: c.criados.has(id) ? 'coach' : 'seed',
      editado: c.editados.has(id),
      instancia: e.instancia, sessoes: e.instancia ? sessoesDaInstancia(e.instancia) : [],
      hiit: e.hiit ? [...e.hiit.estacoes] : null,
      cross: e.cross ? {
        padrao: e.cross.padrao, unidade: e.cross.unidade, rx: e.cross.rx,
        carga: e.cross.carga ?? null, foco: e.cross.tecnica?.categoria ?? null,
      } : null,
      musculoPrincipal: [...e.musculoPrincipal], musculosSecundarios: [...e.musculosSecundarios],
      equipamentos: [...e.equipamentos], unilateral: e.unilateral === true,
      adaptacoes: ADAPTACOES.filter((a) => e.adaptacoes[a]).map((a) => ({
        adaptacao: a, exercicioId: e.adaptacoes[a]!, nome: c.itens.get(e.adaptacoes[a]!)?.nome ?? e.adaptacoes[a]!,
      })),
      original: c.editados.has(id) && doSeed ? {
        nome: doSeed.nome, musculoPrincipal: [...doSeed.musculoPrincipal],
        musculosSecundarios: [...doSeed.musculosSecundarios], equipamentos: [...doSeed.equipamentos],
      } : null,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const hyrox = ESTACOES_HYROX.map((estacao): LinhaHyrox => {
    const d = DADOS_ESTACAO_HYROX[estacao];
    const m = MUSCULOS_HYROX[estacao];
    return {
      estacao, n: d.n, nome: d.nome, recursos: { ...d.recursos },
      musculoPrincipal: [...m.estacao.musculoPrincipal], musculosSecundarios: [...m.estacao.musculosSecundarios],
      substituta: d.substituta && m.substituta ? {
        nome: d.substituta.nome, musculoPrincipal: [...m.substituta.musculoPrincipal], musculosSecundarios: [...m.substituta.musculosSecundarios],
      } : null,
    };
  });

  return {
    exercicios, hyrox,
    vocabulario: {
      musculos: MUSCULOS, equipamentos: EQUIPAMENTOS, instancias: INSTANCIAS, adaptacoes: ADAPTACOES,
      estacoesHiit: ESTACOES_HIIT, padroesCross: PADROES_CROSS, unidadesCross: UNIDADES_CROSS,
    },
  };
}
