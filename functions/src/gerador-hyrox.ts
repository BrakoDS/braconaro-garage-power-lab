/**
 * GERADOR DO HYROX — lógica pura, sem Firestore e sem rede.
 *
 * Substitui, no servidor, o `gerarHyrox` de `coach/montador-de-treino/core/hyrox.js`,
 * que repetia a prova inteira toda semana.
 *
 * ── Regras do coach (06/10/2026) ─────────────────────────────────────────────
 *  1. FORMATO: Hyrox na QUINTA é sempre a prova completa, com as 8 estações
 *     (`DIA_HYROX_COMPLETO`, decisão de 15/10/2026). Fora da quinta, rodízio
 *     (`REGRA_FORMATO_HYROX`): prova completa, metade A, metade B ou
 *     compromised running — sem repetir o da semana anterior.
 *  2. ESTAÇÕES: as do formato, na ordem da prova. O compromised sorteia 4 das
 *     8, preferindo as que NÃO estiveram no Hyrox da semana anterior.
 *  3. NÍVEIS: Iniciante, Intermediário, Avançado e Competição — a prescrição
 *     de cada estação e a corrida (com a air bike como alternativa) por nível.
 *  4. EQUIPAMENTO: for time em rodízio, então a estação só precisa das unidades
 *     dela ATIVAS (`conta-cross.ts`). O SkiErg (2 monocross) comporta 2 alunos
 *     por vez: com a turma maior, o transbordo vai para a corda naval — aviso,
 *     não troca (`transbordoDoSkierg`). Sem elas (sled em manutenção), entra a
 *     substituta da estação; sem substituta que caiba, a estação fica e vira
 *     alerta — o rascunho existe, a semana não publica.
 *
 * Determinístico: mesma `semente` e mesmo inventário → mesmo Hyrox.
 */
import {
  CAPACIDADE_SKIERG, DIA_HYROX_COMPLETO, ESTACOES_HYROX, FORMATOS_HYROX, REGRA_FORMATO_HYROX,
  type AlertaHyrox, type DiaSemana, type EstacaoHyrox, type FormatoHyrox, type HyroxProgramado, type RecursoBox,
} from './modelo-box';
import { DADOS_ESTACAO_HYROX } from './catalogo-hyrox';
import { embaralhar, hashSeed, mulberry32 } from './sorteio';
import { cabeNoInventario } from './conta-cross';
import { alertasDoHyrox, montarHyrox } from './semana-box';

export interface ContextoHyrox {
  limites: Partial<Record<RecursoBox, number>>;
  /** O Hyrox da semana anterior: o formato e as estações — o rodízio. */
  semanaPassada?: { formato: FormatoHyrox | null; estacoes: ReadonlySet<EstacaoHyrox> };
  /** Semente do sorteio: `${semanaId}:Hyrox:${variacao}`. */
  semente: string;
  /** Os dias da semana com o Hyrox. Com a quinta, é a prova completa (sem rodízio). */
  dias?: readonly DiaSemana[];
  /** A turma: com mais alunos que vagas no SkiErg, o aviso do transbordo para a corda naval. */
  alunosPorAula?: number;
}

/**
 * O transbordo do SkiErg: até `CAPACIDADE_SKIERG` alunos por vez nos monocross
 * ATIVOS; com a turma maior, quem chega com eles ocupados faz a corda naval (a
 * substituta). `null` sem transbordo — turma que cabe, ou nenhum monocross
 * ativo (aí a estação inteira já vai para a substituta). `semCorda`: não há
 * corda naval ativa para o transbordo.
 */
export function transbordoDoSkierg(
  limites: Partial<Record<RecursoBox, number>>,
  alunosPorAula: number,
): { vagas: number; naCorda: number; semCorda: boolean } | null {
  const vagas = Math.min(CAPACIDADE_SKIERG, limites.monocross ?? 0);
  if (vagas <= 0) return null;
  const naCorda = Math.max(0, alunosPorAula - vagas);
  return naCorda ? { vagas, naCorda, semCorda: (limites.cordaNaval ?? 0) < 1 } : null;
}

export interface HyroxGerado {
  hyrox: HyroxProgramado;
  /** O que o pedido de salvar mandaria. */
  cru: { formato: FormatoHyrox; estacoes: { estacao: EstacaoHyrox; substituta: boolean }[] };
  alertas: AlertaHyrox[];
  avisos: string[];
}

/** Monta o Hyrox da semana. Ver as regras no topo do arquivo. */
export function gerarHyrox(ctx: ContextoHyrox): HyroxGerado {
  const rng = mulberry32(hashSeed(ctx.semente));
  const passada = ctx.semanaPassada ?? { formato: null, estacoes: new Set<EstacaoHyrox>() };

  // O sorteio do rodízio roda sempre: assim a quinta não mexe na sequência do rng (estações, substitutas).
  const sorteado = embaralhar(FORMATOS_HYROX, rng).sort((a, b) => Number(a === passada.formato) - Number(b === passada.formato))[0];
  const formato: FormatoHyrox = ctx.dias?.includes(DIA_HYROX_COMPLETO) ? 'prova' : sorteado;
  const regra = REGRA_FORMATO_HYROX[formato];
  const fixas = regra.estacoes;
  const estacoes: EstacaoHyrox[] = typeof fixas === 'number'
    ? embaralhar(ESTACOES_HYROX, rng)
      .sort((a, b) => Number(passada.estacoes.has(a)) - Number(passada.estacoes.has(b)))
      .slice(0, fixas)
      .sort((a, b) => DADOS_ESTACAO_HYROX[a].n - DADOS_ESTACAO_HYROX[b].n)
    : [...fixas];

  const avisos: string[] = [];
  const escolhas = estacoes.map((estacao) => {
    const dados = DADOS_ESTACAO_HYROX[estacao];
    if (cabeNoInventario(dados.recursos, ctx.limites)) return { estacao, substituta: false };
    if (dados.substituta && cabeNoInventario(dados.substituta.recursos, ctx.limites)) {
      avisos.push(`${dados.nome}: falta equipamento ativo — entrou a substituta (${dados.substituta.nome}).`);
      return { estacao, substituta: true };
    }
    avisos.push(`${dados.nome}: falta equipamento ativo e não há substituta que caiba.`);
    return { estacao, substituta: false };
  });

  const skierg = escolhas.find((e) => e.estacao === 'skierg');
  const transbordo = skierg && !skierg.substituta && ctx.alunosPorAula ? transbordoDoSkierg(ctx.limites, ctx.alunosPorAula) : null;
  if (transbordo) {
    avisos.push(`SkiErg: ${transbordo.vagas} ${transbordo.vagas === 1 ? 'aluno' : 'alunos'} por vez nos monocross; com a turma de ${ctx.alunosPorAula}, `
      + `quem chegar com eles ocupados faz a corda naval (até ${transbordo.naCorda} ao mesmo tempo).`
      + (transbordo.semCorda ? ' Sem corda naval ativa: escalone a largada.' : ''));
  }

  const hyrox = montarHyrox(formato, escolhas);
  return { hyrox, cru: { formato, estacoes: escolhas }, alertas: alertasDoHyrox(hyrox, ctx.limites), avisos };
}
