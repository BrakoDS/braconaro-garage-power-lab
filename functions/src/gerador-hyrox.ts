/**
 * GERADOR DO HYROX — lógica pura, sem Firestore e sem rede.
 *
 * Substitui, no servidor, o `gerarHyrox` de `coach/montador-de-treino/core/hyrox.js`,
 * que repetia a prova inteira toda semana.
 *
 * ── Regras do coach (06/10/2026) ─────────────────────────────────────────────
 *  1. FORMATO em rodízio (`REGRA_FORMATO_HYROX`): prova completa, metade A,
 *     metade B ou compromised running — sem repetir o da semana anterior.
 *  2. ESTAÇÕES: as do formato, na ordem da prova. O compromised sorteia 4 das
 *     8, preferindo as que NÃO estiveram no Hyrox da semana anterior.
 *  3. NÍVEIS: Iniciante, Intermediário, Avançado e Competição — a prescrição
 *     de cada estação e a corrida (com a air bike como alternativa) por nível.
 *  4. EQUIPAMENTO: for time em rodízio, então a estação só precisa das unidades
 *     dela ATIVAS (`conta-cross.ts`). Sem elas (sled em manutenção), entra a
 *     substituta da estação; sem substituta que caiba, a estação fica e vira
 *     alerta — o rascunho existe, a semana não publica.
 *
 * Determinístico: mesma `semente` e mesmo inventário → mesmo Hyrox.
 */
import {
  ESTACOES_HYROX, FORMATOS_HYROX, REGRA_FORMATO_HYROX,
  type AlertaHyrox, type EstacaoHyrox, type FormatoHyrox, type HyroxProgramado, type RecursoBox,
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

  const formato = embaralhar(FORMATOS_HYROX, rng).sort((a, b) => Number(a === passada.formato) - Number(b === passada.formato))[0];
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

  const hyrox = montarHyrox(formato, escolhas);
  return { hyrox, cru: { formato, estacoes: escolhas }, alertas: alertasDoHyrox(hyrox, ctx.limites), avisos };
}
