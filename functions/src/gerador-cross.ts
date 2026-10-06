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
  FORMATOS_CROSS, PADROES_CROSS, REGRA_FORMATO_CROSS,
  type AlertaCross, type DadosCross, type FormatoCross, type ItemCatalogo, type PadraoCross, type RecursoCross,
  type WodProgramado,
} from './modelo-box';
import { embaralhar, hashSeed, mulberry32 } from './sorteio';
import { alunosPorMovimento, consumoCross, contarCross, demandaDoMovimento } from './conta-cross';
import { movimentoCross } from './semana-box';

/** Teto da busca. Com o catálogo real, um WOD gasta poucas dezenas de nós. */
const MAX_NOS = 200_000;

/** Duração do AMRAP, em minutos. */
const MINUTOS_AMRAP = [12, 14, 16, 18, 20] as const;
/** Rodadas do For Time; o time cap é 4 min por rodada. */
const RODADAS_FOR_TIME = [3, 4, 5] as const;
const MINUTOS_POR_RODADA_FOR_TIME = 4;
/** O EMOM fica entre estes minutos (movimentos × rodadas). */
const EMOM_MINUTOS = { min: 12, max: 20 } as const;
const MINUTOS_CHIPPER = 20;

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
  cru: { formato: FormatoCross; minutos: number; rodadas: number | null; movimentos: { exercicioId: string }[] };
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
  // Rodízio como REGRA: primeiro nenhum movimento da semana anterior, depois
  // no máximo 1, 2… — o WOD repete o MÍNIMO que o inventário obriga (no EMOM
  // com a turma toda, às vezes só a corrida cabe como cardio).
  const procurar = (comEquipamento: boolean): string[] | null => {
    for (let repetidos = 0; repetidos <= quantos; repetidos++) {
      const achou = buscar(fila, itens, formato, quantos, ctx, passada.ids, repetidos, comEquipamento);
      if (achou) return achou;
    }
    return null;
  };
  let ids = procurar(true);
  if (!ids) {
    ids = procurar(false);
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
    minutos = rodadas * MINUTOS_POR_RODADA_FOR_TIME;
  } else if (formato === 'EMOM') {
    const n = Math.max(1, ids.length);
    const opcoes: number[] = [];
    for (let r = 1; r * n <= EMOM_MINUTOS.max; r++) if (r * n >= EMOM_MINUTOS.min) opcoes.push(r);
    rodadas = opcoes.length ? opcoes[Math.floor(rng() * opcoes.length)] : Math.max(1, Math.round(EMOM_MINUTOS.min / n));
    minutos = rodadas * ids.length;
  } else {
    minutos = MINUTOS_CHIPPER;
  }

  const movimentos = ids.map((id) => movimentoCross(id, itens.get(id)!, formato));
  const wod: WodProgramado = { formato, descricao: REGRA_FORMATO_CROSS[formato].descricao, minutos, rodadas, movimentos };
  const conta = contarCross(wod, ctx.limites, ctx.alunosPorAula);
  return {
    wod, cru: { formato, minutos, rodadas, movimentos: ids.map((exercicioId) => ({ exercicioId })) },
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
): string[] | null {
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
    if (escolhidos.length === quantos) return true;
    for (let i = desde; i < fila.length; i++) {
      const id = fila[i];
      const padrao = itens.get(id)!.cross.padrao;
      if (escolhidos.length === 0 && padrao !== 'cardio') return false; // o cardio abre o WOD
      const repete = passada.has(id) ? 1 : 0;
      if (padroes.has(padrao) || repetidos + repete > maxRepetidos || !cabe(id)) continue;
      escolhidos.push(id);
      padroes.add(padrao);
      repetidos += repete;
      marcar(id, 1);
      if (passo(i + 1)) return true;
      marcar(id, -1);
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
