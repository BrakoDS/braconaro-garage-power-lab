/**
 * CONSOLIDAÇÃO DE VOLUME — parte pura, sem rede e sem Firebase.
 *
 * O Dashboard de Volume precisa de três números que ninguém quer calcular no
 * navegador a cada abertura: quanto de cada grupamento a semana prescreveu,
 * como o mês fechou contra a meta, e qual a fatia de cada implemento no ciclo.
 * Recalcular isso lendo todos os treinos do mês a cada visita seria uma leitura
 * do Firestore por treino, toda vez, para um número que só muda quando um
 * treino muda.
 *
 * Por isso a agregação é um TRIGGER (`aggregateVolumeMetrics` em `index.ts`):
 * escreveu treino, o servidor recalcula a semana e o mês daquele treino e grava
 * o consolidado. O dashboard lê dois documentos e desenha.
 *
 * ATENÇÃO — DUPLICAÇÃO DE VERDADE (mesmo caso de `pesquisa.ts` e `lousa.ts`):
 * `GRUPO_POR_ROTULO` abaixo é a composição de duas tabelas do site,
 * `compartilhado/config/musculos.js` (`MUSC_MAP`, chave → rótulo) com
 * `compartilhado/regras/grupos.js` (`GRUPO_POR_MUSCULO`, chave → grupo),
 * resolvida aqui em rótulo → grupo. A lousa devolve RÓTULO ('Quadríceps'),
 * enquanto o site agrega por CHAVE ('quadriceps') — sem esta ponte, o
 * dashboard do coach e o volume do Portal contariam o mesmo treino em grupos
 * diferentes. `checar.ts` compara as duas para que a divergência apareça no CI.
 */

import { completarGrupamentos, perfilDe, type TipoContagem } from './taxonomia.js';

/** Os sete grupos, na ordem da tela — cópia de `GRUPOS` em `compartilhado/regras/grupos.js`. */
export const GRUPOS = ['peito', 'costas', 'ombro', 'braco', 'perna', 'gluteo', 'core'] as const;
export type Grupo = (typeof GRUPOS)[number];

export const GRUPO_LABEL: Record<string, string> = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', braco: 'Braço',
  perna: 'Perna', gluteo: 'Glúteo', core: 'Core',
};

/** Rótulo de músculo (o que a lousa devolve) → grupo. Ver o cabeçalho. */
export const GRUPO_POR_ROTULO: Record<string, Grupo> = {
  'Peito': 'peito',
  'Costas': 'costas',
  'Trapézio': 'costas',
  'Ombro': 'ombro',
  'Bíceps': 'braco',
  'Tríceps': 'braco',
  'Antebraço': 'braco',
  'Quadríceps': 'perna',
  'Posterior de coxa': 'perna',
  'Panturrilha': 'perna',
  'Glúteo': 'gluteo',
  'Core/Abdômen': 'core',
  'Lombar': 'core',
  'Estabilizadores': 'core',
};

/**
 * Meta semanal de séries por grupo, para a TURMA.
 *
 * É o valor "comum" de hipertrofia em `META_SERIES_SEMANAIS`
 * (`compartilhado/regras/metas-aluno.js`) — o mesmo número que o aluno vê no
 * Portal. Usar outro aqui faria o coach e o aluno olharem a mesma semana e
 * lerem metas diferentes. O coach sobrescreve por grupo no documento
 * consolidado (`metas`), e a sobrescrita dele vale sobre esta tabela.
 */
export const META_SEMANAL_PADRAO = 10;

/** Semanas por mês, o mesmo 4,33 de `compartilhado/regras/volume.js` (`projetarMensal`). */
export const SEMANAS_POR_MES = 4.33;

export type TreinoParaVolume = {
  dateId: string;
  sistema: string;
  /**
   * `nome` existe para a REDE da taxonomia: quando o `grupamentos` gravado está
   * vazio, o grupo é deduzido do nome do exercício. Sem ele, a correção só
   * valeria para treino novo e todo o histórico do box continuaria fora do
   * gráfico até alguém reescrever cada lousa à mão.
   */
  exercicios: { nome?: string; series: number; grupamentos: string[]; implemento: string }[];
};

export type Consolidado = {
  /** 'YYYY-Www' ou 'YYYY-MM'. */
  chave: string;
  periodo: 'semana' | 'mes';
  inicio: string;
  fim: string;
  treinos: number;
  totalSeries: number;
  /** grupo → séries prescritas no período. */
  porGrupo: Record<string, number>;
  /** grupo → meta do período (semanal, ou semanal × 4,33 no mês). */
  metas: Record<string, number>;
  /** implemento → nº de exercícios em que apareceu. */
  porImplemento: Record<string, number>;
  /** implemento → % de uso no período, arredondado a uma casa. */
  percentualImplemento: Record<string, number>;
  /** sistema (HIIT/GAP/...) → nº de treinos. */
  porSistema: Record<string, number>;
  /**
   * Como as séries do período se medem: tonelagem (kg), peso corporal ou
   * metcon. Existe para a tela poder explicar um treino sem kg em vez de deixar
   * o coach achando que faltou digitar carga. `indefinido` é o que a taxonomia
   * não conhece — e é também o alarme de que a tabela precisa crescer.
   */
  porTipoContagem: Record<string, number>;
  atualizadoEm: string;
};

/** Meio-dia UTC: evita que fuso negativo jogue 'YYYY-MM-DD' para o dia anterior. */
function dataDe(dateId: string): Date | null {
  const t = Date.parse(`${dateId}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Chave ISO-8601 da semana ('2026-W38').
 *
 * ISO e não "semana do mês" porque o mês quebra a semana ao meio: um treino de
 * quarta, 1º de outubro, e o de segunda, 29 de setembro, são a MESMA semana de
 * treino e cairiam em consolidados diferentes numa contagem por mês. A semana
 * ISO começa na segunda, que é como o box lê a grade.
 */
export function chaveSemana(dateId: string): string {
  const d = dataDe(dateId);
  if (!d) return '';
  const alvo = new Date(d.getTime());
  // Quinta-feira da mesma semana define o ano ISO (regra da própria norma).
  const diaIso = (alvo.getUTCDay() + 6) % 7; // segunda = 0
  alvo.setUTCDate(alvo.getUTCDate() - diaIso + 3);
  const ano = alvo.getUTCFullYear();
  const primeiraQuinta = new Date(Date.UTC(ano, 0, 4));
  const diaIsoPrimeira = (primeiraQuinta.getUTCDay() + 6) % 7;
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - diaIsoPrimeira + 3);
  const semana = 1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * 864e5));
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}

/** 'YYYY-MM' — a mesma chave de mês que `mesIdDe` usa no site. */
export function chaveMes(dateId: string): string {
  return String(dateId || '').slice(0, 7);
}

/** Segunda e domingo da semana de `dateId`, como 'YYYY-MM-DD'. */
export function faixaDaSemana(dateId: string): { inicio: string; fim: string } {
  const d = dataDe(dateId);
  if (!d) return { inicio: '', fim: '' };
  const diaIso = (d.getUTCDay() + 6) % 7;
  const segunda = new Date(d.getTime());
  segunda.setUTCDate(segunda.getUTCDate() - diaIso);
  const domingo = new Date(segunda.getTime());
  domingo.setUTCDate(domingo.getUTCDate() + 6);
  return { inicio: iso(segunda), fim: iso(domingo) };
}

/** Primeiro e último dia do mês de `dateId`. */
export function faixaDoMes(dateId: string): { inicio: string; fim: string } {
  const mes = chaveMes(dateId);
  if (mes.length !== 7) return { inicio: '', fim: '' };
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * A consolidação em si.
 *
 * Convenção de crédito: uma série conta INTEIRA para cada grupamento que a
 * lousa marcou no exercício. É diferente do 1,0/0,5 de
 * `compartilhado/regras/volume.js`, e de propósito: lá existe a distinção entre
 * primário e secundário, porque o catálogo da Academia a carrega; aqui a lousa
 * escrita à mão não distingue — o coach escreve "costas, bíceps" e as duas são
 * intenção dele. Inventar um peso 0,5 para a segunda seria precisão falsa.
 *
 * O efeito é que `totalSeries` (séries reais prescritas) NÃO é a soma de
 * `porGrupo` (séries por grupamento, que um exercício multiarticular credita
 * mais de uma vez). Os dois números respondem perguntas diferentes e o
 * dashboard mostra cada um no seu lugar.
 */
export function consolidar(
  treinos: TreinoParaVolume[],
  periodo: 'semana' | 'mes',
  chave: string,
  faixa: { inicio: string; fim: string },
  metasDoCoach: Record<string, number> = {},
): Consolidado {
  const porGrupo: Record<string, number> = {};
  const porImplemento: Record<string, number> = {};
  const porSistema: Record<string, number> = {};
  const porTipoContagem: Record<string, number> = {};
  let totalSeries = 0;

  for (const t of treinos) {
    const sistema = t.sistema || 'Indefinido';
    porSistema[sistema] = (porSistema[sistema] || 0) + 1;

    for (const ex of t.exercicios || []) {
      const series = Number(ex.series) || 0;
      totalSeries += series;

      // A REDE: exercício gravado sem grupamento (o caso do Burpee e do Wall
      // Ball, que o prompt manda a IA deixar vazio na dúvida) recupera os
      // grupos pelo NOME. Carga não entra nesta conta — nunca entrou: série com
      // 0 kg conta igual a série com 100 kg, porque a pergunta aqui é quanto
      // ESTÍMULO o grupo levou, não quanto peso subiu.
      const rotulos = completarGrupamentos(ex.nome || '', ex.grupamentos);
      for (const rotulo of rotulos) {
        const g = GRUPO_POR_ROTULO[rotulo];
        if (!g) continue; // rótulo fora do vocabulário: some do grupo, não do total
        porGrupo[g] = (porGrupo[g] || 0) + series;
      }

      const tipo: TipoContagem | 'indefinido' = perfilDe(ex.nome || '')?.tipoContagem ?? 'indefinido';
      porTipoContagem[tipo] = (porTipoContagem[tipo] || 0) + series;

      const imp = (ex.implemento || '').trim();
      if (imp) porImplemento[imp] = (porImplemento[imp] || 0) + 1;
    }
  }

  const totalImplementos = Object.values(porImplemento).reduce((a, b) => a + b, 0);
  const percentualImplemento: Record<string, number> = {};
  for (const [k, n] of Object.entries(porImplemento)) {
    percentualImplemento[k] = totalImplementos ? Math.round((n / totalImplementos) * 1000) / 10 : 0;
  }

  const fator = periodo === 'mes' ? SEMANAS_POR_MES : 1;
  const metas: Record<string, number> = {};
  for (const g of GRUPOS) {
    const semanal = Number.isFinite(Number(metasDoCoach[g])) && Number(metasDoCoach[g]) > 0
      ? Number(metasDoCoach[g])
      : META_SEMANAL_PADRAO;
    metas[g] = Math.round(semanal * fator);
  }

  return {
    chave,
    periodo,
    inicio: faixa.inicio,
    fim: faixa.fim,
    treinos: treinos.length,
    totalSeries,
    porGrupo,
    metas,
    porImplemento,
    percentualImplemento,
    porSistema,
    porTipoContagem,
    atualizadoEm: new Date().toISOString(),
  };
}

/** Saldo por grupo (prescrito − meta): negativo é o que falta na semana. */
export function saldoPorGrupo(c: Consolidado): Record<string, number> {
  const saldo: Record<string, number> = {};
  for (const g of GRUPOS) saldo[g] = (c.porGrupo[g] || 0) - (c.metas[g] || 0);
  return saldo;
}
