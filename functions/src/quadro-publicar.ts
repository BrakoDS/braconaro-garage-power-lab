/**
 * PUBLICAR O QUADRO — a semana que o coach escreveu na aba Quadro vira a semana
 * que o aluno lê (Portal, app e Lousa leem `coaches/{uid}/semanas/{AAAA-Www}`).
 * Lógica pura, sem Firestore: `publicarQuadroBox` (index.ts) só lê, chama e grava.
 *
 * Decisão do coach, 07/11/2026: o coach monta a semana à mão e o sistema
 * respeita o que ele escreveu. Diferente de `lerDias` (a semana do gerador):
 *  - a quantidade do WOD é a ESCRITA, não a do catálogo × formato;
 *  - o H aceita qualquer exercício do catálogo (acessório inclusive), até `MAX_EXERCICIOS_QUADRO`;
 *  - o HIIT tem as estações que o coach escreveu (1 a 4), cada uma com até 4 vagas;
 *  - aviso de equipamento NÃO impede publicar (a aba Quadro já mostra, e o coach marca "adaptado");
 *  - Mobilidade, Aquecimento, a Força do Cross… vão como texto (`blocosTexto`), do jeito que foram escritos.
 * O Hyrox continua pela tabela (`montarHyrox`), como o Quadro mostra.
 *
 * O navegador (coach/semana-do-box/core/publicar-quadro.js) lê o texto e manda
 * os ids; aqui se confere cada id contra o catálogo e se CALCULA o resto (nome,
 * vaga, recursos, consumo) — o aluno nunca recebe nome que o catálogo não tem.
 */
import {
  CADENCIA_PADRAO, DIAS_SEMANA, ESTACOES_HIIT, FORMATO_METABOLICO, FORMATOS_CROSS, MATRIZ_H, MODALIDADES,
  NOME_ESTACAO_HIIT, PRESCRICAO_FORCA, PROTOCOLO_HIIT, REGRA_FORMATO_CROSS, SESSOES_H, SESSOES_METABOLICAS, SLOTS_POR_ESTACAO,
  UNIDADES_CROSS,
  type DiaProgramado, type DiaSemana, type EstacaoHiit, type EstacaoProgramada, type ExercicioProgramado, type FormatoCross,
  type HiitProgramado, type HyroxProgramado, type Instancia, type ItemCatalogo, type Modalidade, type MovimentoCross,
  type PadraoCross, type PapelSessao, type SessaoH, type SessaoMetabolica, type SlotHiit, type UnidadeCross, type WodProgramado,
} from './modelo-box';
import { consumoDoDia, lerAviso, lerHyrox, lerRir, recursosDo } from './semana-box';
import { consumoPorAluno } from './conta-hiit';
import { consumoCross } from './conta-cross';

/** O H do quadro: os 7 da regra, com folga para o acessório que o coach acrescenta. */
export const MAX_EXERCICIOS_QUADRO = 12;
/** Movimentos de um WOD escrito à mão. */
export const MAX_MOVIMENTOS_QUADRO = 12;
/** Blocos de texto de um dia (Mobilidade, Aquecimento, Força…), somando as duas aulas. */
export const MAX_BLOCOS_TEXTO = 10;
export const MAX_LINHAS_BLOCO = 20;
export const MAX_TEXTO_LINHA = 120;
export const MAX_TITULO_BLOCO = 60;
/** Opções escritas na mesma linha do WOD ("Corrida / Remo / Air bike"). */
export const MAX_ALTERNATIVAS = 3;
/** Minutos e rodadas de um WOD escrito à mão (o coach decide; isto só barra o absurdo). */
export const MINUTOS_WOD_QUADRO = { min: 1, max: 60 } as const;
export const RODADAS_WOD_QUADRO = { min: 1, max: 20 } as const;

/**
 * Um bloco de texto do dia, como o coach escreveu. `aula` diz de qual aula ele
 * é ('H1', 'Cross'…; 'GAP'/'Murph' para a aula do mês) — o aluno vê o bloco
 * junto da aula dele.
 */
export interface BlocoTexto {
  aula: string;
  titulo: string;
  linhas: string[];
}

/** O dia como o aluno lê, mais os blocos de texto. */
export interface DiaDoQuadro extends DiaProgramado {
  blocosTexto: BlocoTexto[];
}

function em<T extends string>(lista: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (lista as readonly string[]).includes(v);
}
function inteiro(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
const lista = (v: unknown): unknown[] | null => (v === undefined || v === null ? [] : Array.isArray(v) ? v : null);

/** Os ids do catálogo que o pedido cita (para carregar só esses). */
export function idsDoPedidoQuadro(dias: unknown): string[] {
  const ids = new Set<string>();
  if (!dias || typeof dias !== 'object') return [];
  for (const d of Object.values(dias as Record<string, unknown>)) {
    const x = (d ?? {}) as Record<string, any>;
    for (const e of lista(x.forca?.exercicios) ?? []) if (typeof (e as any)?.exercicioId === 'string') ids.add((e as any).exercicioId);
    for (const m of lista(x.cross?.movimentos) ?? []) if (typeof (m as any)?.exercicioId === 'string') ids.add((m as any).exercicioId);
    for (const e of lista(x.hiit?.estacoes) ?? []) {
      for (const s of lista((e as any)?.slots) ?? []) if (typeof (s as any)?.exercicioId === 'string') ids.add((s as any).exercicioId);
    }
  }
  return [...ids];
}

/** O padrão do movimento no WOD: o do Cross no catálogo; senão, pelo HIIT (cardio, core) ou "corpo todo". */
function padraoDe(item: ItemCatalogo): PadraoCross {
  if (item.cross) return item.cross.padrao;
  const est = item.hiit?.estacoes ?? [];
  if (est.includes('cardio')) return 'cardio';
  if (est.includes('core')) return 'core';
  if (est.includes('pernas')) return 'agachar';
  if (est.includes('superiores')) return 'empurrar';
  return 'corpo_todo';
}

function lerBlocosTexto(v: unknown, dia: string): { blocos: BlocoTexto[] } | { erro: string } {
  const cru = lista(v);
  if (!cru || cru.length > MAX_BLOCOS_TEXTO) return { erro: `${dia}: até ${MAX_BLOCOS_TEXTO} blocos de texto por dia.` };
  const blocos: BlocoTexto[] = [];
  for (const b of cru) {
    const x = (b ?? {}) as Record<string, unknown>;
    const linhasCru = lista(x.linhas);
    if (!linhasCru || linhasCru.length > MAX_LINHAS_BLOCO) return { erro: `${dia}: um bloco de texto tem até ${MAX_LINHAS_BLOCO} linhas.` };
    const linhas = linhasCru.map((l) => texto(l, MAX_TEXTO_LINHA)).filter(Boolean);
    const titulo = texto(x.titulo, MAX_TITULO_BLOCO);
    if (!titulo && !linhas.length) continue;
    blocos.push({ aula: texto(x.aula, 10), titulo, linhas });
  }
  return { blocos };
}

function lerForca(
  v: unknown, sessao: SessaoH, catalogo: ReadonlyMap<string, ItemCatalogo>, dia: string,
): { bloco: ExercicioProgramado[] } | { erro: string } {
  const f = (v ?? null) as Record<string, unknown> | null;
  const cru = lista(f?.exercicios);
  if (!cru || !cru.length) return { erro: `${dia}: o ${sessao} não tem exercício.` };
  if (cru.length > MAX_EXERCICIOS_QUADRO) return { erro: `${dia}: o ${sessao} tem até ${MAX_EXERCICIOS_QUADRO} exercícios.` };
  const bloco: ExercicioProgramado[] = [];
  for (const [i, e] of cru.entries()) {
    const x = (e ?? {}) as Record<string, unknown>;
    const id = texto(x.exercicioId, 100);
    const item = catalogo.get(id);
    if (!item) return { erro: `${dia}, ${sessao}, exercício ${i + 1}: "${id || '(vazio)'}" não está no catálogo.` };
    if (bloco.some((b) => b.exercicioId === id)) return { erro: `${dia}: ${item.nome} aparece duas vezes no ${sessao}.` };
    const series = inteiro(x.series, 1, 10);
    if (series === null) return { erro: `${dia}, ${item.nome}: séries é um inteiro de 1 a 10.` };
    const repeticoes = texto(x.repeticoes, 20);
    if (!repeticoes) return { erro: `${dia}, ${item.nome}: escreva as repetições.` };
    const descansoSeg = x.descansoSeg === undefined || x.descansoSeg === null
      ? PRESCRICAO_FORCA.descansos.entreSeriesSeg : inteiro(x.descansoSeg, 0, 600);
    if (descansoSeg === null) return { erro: `${dia}, ${item.nome}: descanso é um inteiro de 0 a 600 segundos.` };
    const rir = x.rir === undefined || x.rir === null || x.rir === '' ? undefined : lerRir(x.rir);
    if (rir === null) return { erro: `${dia}, ${item.nome}: RIR é um número ou uma faixa de 0 a 10 (ex.: 0-3).` };
    bloco.push({
      exercicioId: id, nome: item.nome, series, repeticoes, descansoSeg, ...(rir ? { rir } : {}),
      // Acessório não tem vaga: grava null (o aluno não lê a vaga; a tela do coach mostra "acessório").
      instancia: item.instancia as Instancia, recursos: recursosDo(item),
    });
  }
  return { bloco };
}

function lerWod(v: unknown, catalogo: ReadonlyMap<string, ItemCatalogo>, dia: string): { cross: WodProgramado } | { erro: string } {
  const c = (v ?? null) as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return { erro: `${dia}: o WOD precisa de formato e movimentos.` };
  if (!em(FORMATOS_CROSS, c.formato)) return { erro: `${dia}: escreva o formato do WOD (${FORMATOS_CROSS.join(', ')}).` };
  const formato: FormatoCross = c.formato;
  const cru = lista(c.movimentos);
  if (!cru || !cru.length) return { erro: `${dia}: o WOD não tem movimento.` };
  if (cru.length > MAX_MOVIMENTOS_QUADRO) return { erro: `${dia}: o WOD tem até ${MAX_MOVIMENTOS_QUADRO} movimentos.` };
  const movimentos: MovimentoCross[] = [];
  for (const m of cru) {
    const x = (m ?? {}) as Record<string, unknown>;
    const id = texto(x.exercicioId, 100);
    const item = catalogo.get(id);
    if (!item) return { erro: `${dia}: "${id || '(vazio)'}" do WOD não está no catálogo.` };
    if (movimentos.some((y) => y.exercicioId === id)) return { erro: `${dia}: ${item.nome} aparece duas vezes no WOD.` };
    if (!em(UNIDADES_CROSS, x.unidade)) return { erro: `${dia}, ${item.nome}: unidade é ${UNIDADES_CROSS.join(', ')}.` };
    const unidade: UnidadeCross = x.unidade;
    const n = typeof x.quantidade === 'number' && Number.isFinite(x.quantidade) && x.quantidade > 0 && x.quantidade <= 10_000
      ? Math.round(x.quantidade * 10) / 10 : null;
    if (n === null) return { erro: `${dia}: escreva a quantidade de ${item.nome} no WOD (ex.: "12x", "200m", "10 cal").` };
    const alts = (lista(x.alternativas) ?? []).map((a) => texto(a, 40)).filter(Boolean).slice(0, MAX_ALTERNATIVAS);
    movimentos.push({
      exercicioId: id, nome: [item.nome, ...alts].join(' / '), padrao: padraoDe(item), unidade,
      // O coach escreve UMA quantidade: é o RX e o Scaled (ele adapta na aula).
      rx: n, scaled: n, porLado: !!item.unilateral,
      carga: item.cross?.carga ? { rx: item.cross.carga.rx, scaled: item.cross.carga.scaled } : null,
      consumoPorAluno: consumoCross(item),
    });
  }
  let rodadas: number | null = null;
  if (c.rodadas !== undefined && c.rodadas !== null) {
    rodadas = inteiro(c.rodadas, RODADAS_WOD_QUADRO.min, RODADAS_WOD_QUADRO.max);
    if (rodadas === null) return { erro: `${dia}: rodadas do WOD é um inteiro de ${RODADAS_WOD_QUADRO.min} a ${RODADAS_WOD_QUADRO.max}.` };
  }
  if (formato === 'For Time' || formato === 'EMOM') rodadas = rodadas ?? 1;
  else rodadas = null;
  let minutos: number | null = null;
  if (c.minutos !== undefined && c.minutos !== null) {
    minutos = inteiro(c.minutos, MINUTOS_WOD_QUADRO.min, MINUTOS_WOD_QUADRO.max);
    if (minutos === null) return { erro: `${dia}: minutos do WOD é um inteiro de ${MINUTOS_WOD_QUADRO.min} a ${MINUTOS_WOD_QUADRO.max}.` };
  }
  if (minutos === null && formato === 'EMOM') minutos = movimentos.length * (rodadas ?? 1);
  if (minutos === null) return { erro: `${dia}: escreva os minutos do ${formato} (ex.: "AMRAP 18 min", "time cap 20").` };
  return {
    cross: {
      formato, descricao: REGRA_FORMATO_CROSS[formato].descricao, minutos, rodadas, movimentos,
      // A Força do Cross escrita pelo coach vai como bloco de texto; o foco automático do gerador não entra.
      tecnica: null, estrategia: null,
    },
  };
}

function lerHiitDoQuadro(v: unknown, catalogo: ReadonlyMap<string, ItemCatalogo>, dia: string): { hiit: HiitProgramado } | { erro: string } {
  const h = (v ?? null) as Record<string, unknown> | null;
  const cru = lista(h?.estacoes);
  if (!cru || !cru.length || cru.length > ESTACOES_HIIT.length) return { erro: `${dia}: o HIIT tem de 1 a ${ESTACOES_HIIT.length} estações.` };
  const vistas = new Set<EstacaoHiit>();
  const estacoes: EstacaoProgramada[] = [];
  for (const e of cru) {
    const x = (e ?? {}) as Record<string, unknown>;
    if (!em(ESTACOES_HIIT, x.estacao)) return { erro: `${dia}: estação de HIIT desconhecida: ${String(x.estacao)}.` };
    const estacao: EstacaoHiit = x.estacao;
    const nomeEstacao = NOME_ESTACAO_HIIT[estacao];
    if (vistas.has(estacao)) return { erro: `${dia}: a estação ${nomeEstacao} aparece duas vezes no HIIT.` };
    vistas.add(estacao);
    const ids = (lista(x.slots) ?? []).map((s) => texto((s as { exercicioId?: unknown } | null)?.exercicioId, 100));
    const slots: SlotHiit[] = [];
    for (let i = 0; i < ids.length; i++) {
      const item = catalogo.get(ids[i]);
      if (!item) return { erro: `${dia}, ${nomeEstacao}: "${ids[i] || '(vazio)'}" não está no catálogo.` };
      const base = { exercicioId: ids[i], nome: item.nome, consumoPorAluno: consumoPorAluno(item) };
      // Unilateral ocupa 2 vagas (D e E), escrito uma vez ou duas seguidas.
      if (item.unilateral) {
        slots.push({ ...base, lado: 'D' }, { ...base, lado: 'E' });
        if (ids[i + 1] === ids[i]) i++;
      } else {
        slots.push({ ...base, lado: null });
      }
    }
    if (!slots.length) return { erro: `${dia}: a estação ${nomeEstacao} do HIIT está vazia.` };
    if (slots.length > SLOTS_POR_ESTACAO) {
      return { erro: `${dia}: a estação ${nomeEstacao} tem ${SLOTS_POR_ESTACAO} vagas (unilateral ocupa 2), e veio ${slots.length}.` };
    }
    estacoes.push({ estacao, nome: nomeEstacao, protocolo: PROTOCOLO_HIIT, slots });
  }
  return { hiit: { estacoes } };
}

/** Um dia do pedido, conferido e calculado. */
export function lerDiaQuadro(
  entrada: unknown,
  dia: DiaSemana,
  catalogo: ReadonlyMap<string, ItemCatalogo>,
): { dia: DiaDoQuadro } | { erro: string } {
  const d = (entrada ?? {}) as Record<string, unknown>;
  const treinosCru = lista(d.treinos);
  if (!treinosCru || !treinosCru.every((t) => em(MODALIDADES, t))) return { erro: `${dia}: treinos aceitos são ${MODALIDADES.join(', ')}.` };
  const treinos = [...new Set(treinosCru as Modalidade[])];
  const papel = (t: Modalidade): PapelSessao => (treinos[0] === t ? 'principal' : 'alternativa');
  const hs = treinos.filter((t): t is SessaoH => em(SESSOES_H, t));
  if (hs.length > 1) return { erro: `${dia}: um dia tem no máximo uma sessão H (veio ${hs.join(' e ')}).` };

  let bloco: ExercicioProgramado[] = [];
  if (hs.length) {
    const f = lerForca(d.forca, hs[0], catalogo, dia);
    if ('erro' in f) return f;
    bloco = f.bloco;
  } else if (d.forca) {
    return { erro: `${dia}: só dia com H1, H2 ou H3 tem bloco de força.` };
  }

  const tem = (t: SessaoMetabolica) => treinos.includes(t);
  let cross: WodProgramado | null = null;
  if (tem('Cross')) {
    const c = lerWod(d.cross, catalogo, dia);
    if ('erro' in c) return c;
    cross = c.cross;
  } else if (d.cross) return { erro: `${dia}: só dia com Cross tem WOD.` };

  let hyrox: HyroxProgramado | null = null;
  if (tem('Hyrox')) {
    // A quinta é sempre a prova completa: as 8 estações, na ordem (decisão do coach, 15/10/2026).
    const estacoes = (lista((d.hyrox as { estacoes?: unknown } | null)?.estacoes) ?? []);
    const h = lerHyrox({ formato: 'prova', estacoes }, dia);
    if ('erro' in h) return { erro: `${h.erro} Escreva as 8 estações do Hyrox, na ordem da prova.` };
    hyrox = h.hyrox;
  } else if (d.hyrox) return { erro: `${dia}: só dia com Hyrox tem estações de Hyrox.` };

  let hiit: HiitProgramado | null = null;
  if (tem('HIIT')) {
    const h = lerHiitDoQuadro(d.hiit, catalogo, dia);
    if ('erro' in h) return h;
    hiit = h.hiit;
  } else if (d.hiit) return { erro: `${dia}: só dia com HIIT tem estações de HIIT.` };

  const b = lerBlocosTexto(d.blocosTexto, dia);
  if ('erro' in b) return b;

  const a = lerAviso(d.aviso, dia);
  if (a && 'erro' in a) return a;
  const aviso = a?.aviso ?? null;
  if (aviso && treinos.length) return { erro: `${dia}: o aviso de dia sem aula é só de dia sem treino.` };
  if (!aviso && !treinos.length) return { erro: `${dia}: dia sem aula precisa do motivo (feriado, recesso ou evento).` };

  return {
    dia: {
      treinos,
      blocoPrincipal: bloco,
      sessaoForca: hs.length ? { sessao: hs[0], papel: papel(hs[0]), nome: MATRIZ_H[hs[0]].nome } : null,
      blocosMetabolicos: treinos
        .filter((t): t is SessaoMetabolica => em(SESSOES_METABOLICAS, t))
        .map((t) => ({ modalidade: t, papel: papel(t), ...FORMATO_METABOLICO[t] })),
      cadencia: CADENCIA_PADRAO,
      descansos: { ...PRESCRICAO_FORCA.descansos },
      consumoEquipamentos: consumoDoDia(bloco, catalogo),
      hiit, cross, hyrox, aviso,
      blocosTexto: treinos.length ? b.blocos : [],
    },
  };
}

/** A semana inteira do pedido (segunda a sábado; dia ausente = erro, para não publicar meia semana). */
export function lerSemanaQuadro(
  entrada: unknown,
  catalogo: ReadonlyMap<string, ItemCatalogo>,
): { dias: Record<DiaSemana, DiaDoQuadro> } | { erro: string } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { erro: 'Mande os dias da semana.' };
  const e = entrada as Record<string, unknown>;
  for (const k of Object.keys(e)) if (!em(DIAS_SEMANA, k)) return { erro: `Dia desconhecido: ${k}. Use segunda a sábado.` };
  const dias = {} as Record<DiaSemana, DiaDoQuadro>;
  for (const dia of DIAS_SEMANA) {
    if (!(dia in e)) return { erro: `Falta a ${dia} no pedido.` };
    const r = lerDiaQuadro(e[dia], dia, catalogo);
    if ('erro' in r) return r;
    dias[dia] = r.dia;
  }
  if (DIAS_SEMANA.every((d) => !dias[d].treinos.length)) return { erro: 'A semana não tem nenhum treino.' };
  return { dias };
}

/**
 * Semana já publicada: o dia que já passou fica como estava (o aluno pode ter
 * registrado a sessão). Devolve os dias finais e quais ficaram como estavam.
 */
export function manterDiasPassados<T>(
  novos: Record<DiaSemana, T>,
  gravados: unknown,
  passados: readonly DiaSemana[],
): { dias: Record<DiaSemana, T>; mantidos: DiaSemana[] } {
  const antes = (gravados && typeof gravados === 'object' ? gravados : {}) as Record<string, T | undefined>;
  const dias = { ...novos };
  const mantidos: DiaSemana[] = [];
  for (const d of passados) {
    const g = antes[d];
    if (g === undefined) continue;
    dias[d] = g;
    mantidos.push(d);
  }
  return { dias, mantidos };
}
