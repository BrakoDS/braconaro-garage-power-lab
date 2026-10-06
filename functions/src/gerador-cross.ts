/**
 * GERADOR DO WOD DO CROSS — lógica pura, sem Firestore e sem rede.
 *
 * Substitui, no servidor, o `montarWod` de `coach/montador-de-treino/core/hibrido.js`.
 *
 * ── Regras do coach (06/10/2026) ─────────────────────────────────────────────
 *  1. FORMATO sorteado entre AMRAP, EMOM, For Time e Chipper, sem repetir o do
 *     Cross da semana anterior.
 *  2. MOVIMENTOS: a quantidade do formato (`REGRA_FORMATO_CROSS`), sem repetir
 *     padrão dominante (dois hinges no mesmo WOD acabam com a lombar) e com
 *     um `cardio` (monoestrutural) — que abre o WOD.
 *  3. RODÍZIO: primeiro sem nenhum movimento do Cross da semana anterior; sem
 *     combinação nova, repete o MÍNIMO possível (e cada repetição vira aviso).
 *     O caso real: no EMOM com turma de 6, a corrida é o único cardio que
 *     cabe. O H1 da terça NÃO entra: é alternativa, de outra turma.
 *  4. EQUIPAMENTO, regra mista (`conta-cross.ts`): no EMOM a turma toda faz o
 *     mesmo movimento no mesmo minuto; nos outros ela se espalha pelo WOD e os
 *     movimentos somam.
 *  5. PRESCRIÇÃO: RX = RX-base do catálogo × fator do formato; Scaled = −30%
 *     (`movimentoCross` em `semana-box.ts`).
 *  6. TÉCNICA / FORÇA antes do WOD: todo WOD tem ao menos um movimento que
 *     serve de foco (`cross.tecnica` no catálogo), e o foco é o de categoria
 *     mais à frente (olímpico > barra > kettlebell > ginástica) que CABE no
 *     inventário com a turma em duplas revezando. Com o bloco antes, o WOD
 *     fica em até `MINUTOS_MAX_WOD` (15 min) — a aula tem 60.
 *
 * ── Como monta ───────────────────────────────────────────────────────────────
 * Sorteia uma ORDEM de padrões (o cardio sempre na frente) e procura, em
 * profundidade, a primeira combinação que cabe — os candidatos vêm na ordem
 * dos padrões e, dentro do padrão, na do sorteio. Assim o padrão do WOD varia
 * de semana a semana, e não fica preso ao padrão com mais exercícios no catálogo.
 * Sem combinação dentro do inventário, monta ignorando o equipamento e devolve
 * os alertas (o rascunho existe, a semana não publica), como o HIIT.
 *
 * Determinístico: mesma `semente`, mesmo catálogo e mesmo inventário → mesmo WOD.
 */
import {
  CATEGORIAS_FOCO, FORMATOS_CROSS, MINUTOS_MAX_WOD, PADROES_CROSS, REGRA_FORMATO_CROSS,
  type AlertaCross, type DadosCross, type FormatoCross, type ItemCatalogo, type PadraoCross, type RecursoCross,
  type WodProgramado,
} from './modelo-box';
import { embaralhar, hashSeed, mulberry32 } from './sorteio';
import { alunosPorMovimento, consumoCross, contarCross, demandaDoMovimento, unidadesNaTecnica } from './conta-cross';
import { movimentoCross, tecnicaDoWod } from './semana-box';

/** Teto da busca. Com o catálogo real, um WOD gasta poucas dezenas de nós. */
const MAX_NOS = 200_000;

/** Duração do AMRAP, em minutos — até o teto do WOD. */
const MINUTOS_AMRAP = [12, 13, 14, MINUTOS_MAX_WOD] as const;
/** Rodadas do For Time; o time cap é 4 min por rodada, até o teto (4 rodadas = 15, como a aula de 06/10). */
const RODADAS_FOR_TIME = [3, 4] as const;
const MINUTOS_POR_RODADA_FOR_TIME = 4;
/** O EMOM fica entre estes minutos (movimentos × rodadas). */
const EMOM_MINUTOS = { min: 12, max: MINUTOS_MAX_WOD } as const;
const MINUTOS_CHIPPER = MINUTOS_MAX_WOD;

export interface ContextoCross {
  catalogo: ReadonlyMap<string, ItemCatalogo>;
  limites: Record<RecursoCross, number>;
  alunosPorAula: number;
  /** O Cross da semana anterior: o formato e os movimentos — o rodízio. */
  semanaPassada?: { formato: FormatoCross | null; ids: ReadonlySet<string> };
  /** Semente do sorteio: `${semanaId}:Cross:${variacao}`. */
  semente: string;
}

export interface CrossGerado {
  wod: WodProgramado;
  /** O que o pedido de salvar mandaria: é o que a semana grava, depois de `lerDias`. */
  cru: {
    formato: FormatoCross; minutos: number; rodadas: number | null; movimentos: { exercicioId: string }[];
    tecnica: { exercicioId: string } | null;
  };
  consumo: Partial<Record<RecursoCross, number>>;
  /** Vazio quando o WOD cabe no inventário. */
  alertas: AlertaCross[];
  avisos: string[];
}

type ItemCross = ItemCatalogo & { cross: DadosCross };

/** Monta o WOD da semana. Ver as regras no topo do arquivo. */
export function gerarCross(ctx: ContextoCross): CrossGerado {
  const rng = mulberry32(hashSeed(ctx.semente));
  const passada = ctx.semanaPassada ?? { formato: null, ids: new Set<string>() };

  // 1. Formato: sorteio, com o da semana anterior por último.
  const formato = embaralhar(FORMATOS_CROSS, rng).sort((a, b) => Number(a === passada.formato) - Number(b === passada.formato))[0];
  const [min, max] = REGRA_FORMATO_CROSS[formato].movimentos;
  const quantos = min + Math.floor(rng() * (max - min + 1));

  // 2. A ordem dos padrões da semana: cardio na frente, o resto sorteado.
  const ordemPadroes: PadraoCross[] = ['cardio', ...embaralhar(PADROES_CROSS.filter((p) => p !== 'cardio'), rng)];
  const rank = (p: PadraoCross) => ordemPadroes.indexOf(p);
  const itens = new Map<string, ItemCross>();
  for (const [id, item] of [...ctx.catalogo.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (item.cross) itens.set(id, item as ItemCross);
  }
  // Fila: padrão (na ordem da semana); dentro do padrão, os fora da semana
  // anterior primeiro; depois o sorteio (`sort` é estável). Quando o rodízio
  // não fecha e algo PRECISA repetir, só repete o que precisa.
  const fila = embaralhar([...itens.keys()], rng).sort((a, b) =>
    rank(itens.get(a)!.cross.padrao) - rank(itens.get(b)!.cross.padrao)
    || Number(passada.ids.has(a)) - Number(passada.ids.has(b)));

  const avisos: string[] = [];
  // O movimento serve de foco da Técnica / Força? Com equipamento, também
  // tem de caber com a turma em duplas revezando.
  const serveDeFoco = (id: string, comEquipamento: boolean): boolean => {
    const item = itens.get(id)!;
    if (!item.cross.tecnica) return false;
    if (!comEquipamento) return true;
    return (Object.entries(demandaDoMovimento(consumoCross(item), unidadesNaTecnica(ctx.alunosPorAula))) as [RecursoCross, number][])
      .every(([r, n]) => n <= ctx.limites[r]);
  };
  // Rodízio como REGRA: primeiro nenhum movimento da semana anterior, depois
  // no máximo 1, 2… — o WOD repete o MÍNIMO que o inventário obriga. O foco
  // da Técnica / Força vem antes do rodízio: é obrigatório (decisão do coach).
  const procurar = (comEquipamento: boolean, exigirFoco: boolean): string[] | null => {
    const foco = exigirFoco ? (id: string) => serveDeFoco(id, comEquipamento) : null;
    for (let repetidos = 0; repetidos <= quantos; repetidos++) {
      const achou = buscar(fila, itens, formato, quantos, ctx, passada.ids, repetidos, comEquipamento, foco);
      if (achou) return achou;
    }
    return null;
  };
  let ids = procurar(true, true);
  let semFoco = false;
  if (!ids) {
    ids = procurar(true, false);
    semFoco = !!ids;
  }
  if (!ids) {
    ids = procurar(false, true) ?? procurar(false, false);
    if (ids) avisos.push('Não há combinação de movimentos que caiba no inventário: o WOD saiu com alerta de equipamento.');
  }
  if (!ids) {
    ids = preencherAteOndeDer(fila, itens, quantos);
    avisos.push(`O catálogo não fecha os ${quantos} movimentos do ${formato} com padrões diferentes e um cardio (saíram ${ids.length}).`);
  }
  for (const id of ids) {
    if (passada.ids.has(id)) avisos.push(`${itens.get(id)!.nome} repete o WOD da semana anterior: faltou opção.`);
  }

  // 3. Tempo e rodadas, com a quantidade de movimentos que de fato saiu.
  let minutos: number;
  let rodadas: number | null = null;
  if (formato === 'AMRAP') {
    minutos = MINUTOS_AMRAP[Math.floor(rng() * MINUTOS_AMRAP.length)];
  } else if (formato === 'For Time') {
    rodadas = RODADAS_FOR_TIME[Math.floor(rng() * RODADAS_FOR_TIME.length)];
    minutos = Math.min(MINUTOS_MAX_WOD, rodadas * MINUTOS_POR_RODADA_FOR_TIME);
  } else if (formato === 'EMOM') {
    const n = Math.max(1, ids.length);
    const opcoes: number[] = [];
    for (let r = 1; r * n <= EMOM_MINUTOS.max; r++) if (r * n >= EMOM_MINUTOS.min) opcoes.push(r);
    rodadas = opcoes.length ? opcoes[Math.floor(rng() * opcoes.length)] : Math.max(1, Math.round(EMOM_MINUTOS.min / n));
    minutos = rodadas * ids.length;
  } else {
    minutos = MINUTOS_CHIPPER;
  }

  // 4. O foco da Técnica / Força: a categoria mais à frente entre os que cabem
  // em duplas; se nenhum cabe, a mais à frente mesmo (e o alerta aparece).
  const rankFoco = (id: string) => CATEGORIAS_FOCO.indexOf(itens.get(id)!.cross.tecnica!.categoria);
  const focos = ids.filter((id) => serveDeFoco(id, false)).sort((a, b) => rankFoco(a) - rankFoco(b));
  const preferido = focos.find((id) => serveDeFoco(id, true)) ?? focos[0];
  const tecnica = tecnicaDoWod(ids, ctx.catalogo, preferido);
  if (!tecnica) {
    avisos.push('O WOD saiu sem movimento para a Técnica / Força (olímpico, barra, kettlebell ou ginástica): troque um movimento antes de publicar.');
  } else if (semFoco) {
    avisos.push(`${tecnica.nome} é o foco da Técnica / Força, mas não cabe no inventário com a turma em duplas.`);
  }

  const movimentos = ids.map((id) => movimentoCross(id, itens.get(id)!, formato));
  const wod: WodProgramado = { formato, descricao: REGRA_FORMATO_CROSS[formato].descricao, minutos, rodadas, movimentos, tecnica };
  const conta = contarCross(wod, ctx.limites, ctx.alunosPorAula);
  return {
    wod,
    cru: {
      formato, minutos, rodadas, movimentos: ids.map((exercicioId) => ({ exercicioId })),
      tecnica: tecnica ? { exercicioId: tecnica.exercicioId } : null,
    },
    consumo: conta.consumo, alertas: conta.alertas, avisos,
  };
}

/**
 * A busca: `quantos` movimentos de padrões diferentes, o primeiro sendo cardio,
 * na ordem da fila (combinação, não permutação), com no máximo `maxRepetidos`
 * da semana anterior. `comEquipamento` liga a conta do inventário. Devolve os
 * ids ou `null`.
 */
function buscar(
  fila: readonly string[],
  itens: ReadonlyMap<string, ItemCross>,
  formato: FormatoCross,
  quantos: number,
  ctx: ContextoCross,
  passada: ReadonlySet<string>,
  maxRepetidos: number,
  comEquipamento: boolean,
  foco: ((id: string) => boolean) | null,
): string[] | null {
  // Com `foco`, a combinação só fecha com um movimento que serve de foco da
  // Técnica / Força. `focoDaqui[i]`: ainda há algum na fila a partir de i (poda).
  const focoDaqui: boolean[] = Array(fila.length + 1).fill(false);
  if (foco) for (let i = fila.length - 1; i >= 0; i--) focoDaqui[i] = focoDaqui[i + 1] || foco(fila[i]);
  let temFoco = 0;
  const alunos = alunosPorMovimento(formato, ctx.alunosPorAula, quantos);
  const escalonado = REGRA_FORMATO_CROSS[formato].escalonado;
  const demanda = (id: string) => demandaDoMovimento(consumoCross(itens.get(id)!), alunos);
  const uso: Partial<Record<RecursoCross, number>> = {};
  const escolhidos: string[] = [];
  const padroes = new Set<PadraoCross>();
  let repetidos = 0;
  let nos = 0;

  const cabe = (id: string): boolean => {
    if (!comEquipamento) return true;
    // Escalonado: os movimentos SOMAM. EMOM: cada um sozinho, com a turma toda.
    return (Object.entries(demanda(id)) as [RecursoCross, number][])
      .every(([r, n]) => (escalonado ? (uso[r] ?? 0) + n : n) <= ctx.limites[r]);
  };
  const marcar = (id: string, sinal: 1 | -1): void => {
    for (const [r, n] of Object.entries(demanda(id)) as [RecursoCross, number][]) uso[r] = (uso[r] ?? 0) + sinal * n;
  };

  const passo = (desde: number): boolean => {
    if (++nos > MAX_NOS) return false;
    if (escolhidos.length === quantos) return !foco || temFoco > 0;
    if (foco && !temFoco && !focoDaqui[desde]) return false;
    for (let i = desde; i < fila.length; i++) {
      const id = fila[i];
      const padrao = itens.get(id)!.cross.padrao;
      if (escolhidos.length === 0 && padrao !== 'cardio') return false; // o cardio abre o WOD
      const repete = passada.has(id) ? 1 : 0;
      if (padroes.has(padrao) || repetidos + repete > maxRepetidos || !cabe(id)) continue;
      const ehFoco = foco && foco(id) ? 1 : 0;
      escolhidos.push(id);
      padroes.add(padrao);
      repetidos += repete;
      temFoco += ehFoco;
      marcar(id, 1);
      if (passo(i + 1)) return true;
      marcar(id, -1);
      temFoco -= ehFoco;
      repetidos -= repete;
      padroes.delete(padrao);
      escolhidos.pop();
    }
    return false;
  };
  return passo(0) ? [...escolhidos] : null;
}

/** Último recurso: guloso, sem equipamento e sem exigir cardio, padrões diferentes até onde der. */
function preencherAteOndeDer(fila: readonly string[], itens: ReadonlyMap<string, ItemCross>, quantos: number): string[] {
  const ids: string[] = [];
  const padroes = new Set<PadraoCross>();
  for (const id of fila) {
    if (ids.length === quantos) break;
    const p = itens.get(id)!.cross.padrao;
    if (padroes.has(p)) continue;
    padroes.add(p);
    ids.push(id);
  }
  return ids;
}
