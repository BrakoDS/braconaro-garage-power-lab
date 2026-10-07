/**
 * VOLUME DO CROSS E DO HYROX — "séries equivalentes" por exercício, que entram
 * na MESMA conta da força (`volumeDaSessao`: 1,0 por músculo principal, 0,5
 * por secundário). Lógica pura, sem Firestore. Decisão do coach, 06/10/2026.
 *
 * Um BLOCO é uma execução de um movimento na aula; o fator (`FATOR_VOLUME`)
 * diz quanto ele vale perto de uma série de força:
 *  - Técnica / Força: as séries equivalentes do catálogo (força 5, técnica 3),
 *    ou menos, se o aluno disser — × 1,0;
 *  - WOD: blocos por movimento × 0,5 (cardio: × 0,25). For Time e EMOM:
 *    rodadas/voltas completas, até o prescrito; AMRAP: rodadas completas, até
 *    minutos ÷ 2 ("como prescrito" = minutos ÷ 3); Chipper: 2 blocos por
 *    movimento feito (o fator 2 das repetições);
 *  - Hyrox: cada estação feita × 1,0 × `fatorEstacao` (metade no
 *    compromised); a corrida antes dela × 0,25 × `fatorCorrida`.
 *
 * RX e Scaled contam igual. Conta o que o aluno FEZ: a substituta do Hyrox
 * (gravada na semana), a air bike no lugar da corrida e a adaptação do
 * catálogo (`adaptacoes` do movimento — só as cadastradas pelo coach).
 *
 * "Fiz como prescrito" (`comoPrescrito: true`) é o padrão de um toque; o
 * detalhe (até onde foi, adaptações) é opcional.
 */
import { MUSCULOS_CORRIDA_HYROX, MUSCULOS_HYROX, type MusculosHyrox } from './catalogo-hyrox';
import {
  FATOR_VOLUME, MINUTOS_MINIMOS_POR_RODADA_AMRAP, MINUTOS_POR_RODADA_AMRAP, REGRA_FORMATO_HYROX, SERIES_TECNICA_PADRAO,
  type HyroxProgramado, type ItemCatalogo, type RegistroCrossLido, type RegistroHyroxLido, type WodProgramado,
} from './modelo-box';

const inteiro = (v: unknown, min: number, max: number): number | null =>
  (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

const somar = (series: Record<string, number>, id: string, n: number) => {
  if (n > 0) series[id] = (series[id] ?? 0) + n;
};

/** As séries equivalentes da Técnica / Força do foco: as do catálogo, ou o padrão do tipo. */
export function seriesDaTecnica(wod: Pick<WodProgramado, 'tecnica'>, catalogo: ReadonlyMap<string, ItemCatalogo>): number {
  const t = wod.tecnica;
  if (!t) return 0;
  return catalogo.get(t.exercicioId)?.cross?.tecnica?.seriesEquivalentes ?? SERIES_TECNICA_PADRAO[t.tipo] ?? 0;
}

/** Os blocos de cada movimento que "fiz como prescrito" vale, e o máximo que o aluno pode informar. */
export function blocosDoWod(wod: Pick<WodProgramado, 'formato' | 'minutos' | 'rodadas'>): { prescrito: number; maximo: number } {
  if (wod.formato === 'AMRAP') {
    const maximo = Math.max(1, Math.floor(wod.minutos / MINUTOS_MINIMOS_POR_RODADA_AMRAP));
    return { prescrito: Math.min(maximo, Math.max(1, Math.floor(wod.minutos / MINUTOS_POR_RODADA_AMRAP))), maximo };
  }
  if (wod.formato === 'Chipper') return { prescrito: 2, maximo: 2 };
  const r = Math.max(1, wod.rodadas ?? 1);
  return { prescrito: r, maximo: r };
}

/**
 * O registro do Cross: `{ comoPrescrito: true }` ou o detalhe —
 * `{ tecnicaSeries?, rodadas?, chipperAte?, adaptacoes?: { movimento: exercicio } }`.
 * Devolve as séries equivalentes por exercício (o da adaptação no lugar do
 * movimento) e o registro LIDO, que fica na presença.
 */
export function lerRegistroCross(
  entrada: unknown,
  wod: WodProgramado,
  catalogo: ReadonlyMap<string, ItemCatalogo>,
): { series: Record<string, number>; registro: RegistroCrossLido } | { erro: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  if (typeof entrada !== 'object' || entrada === null) return { erro: 'Mande o registro do Cross.' };
  const comoPrescrito = e.comoPrescrito === true;
  const maxTecnica = seriesDaTecnica(wod, catalogo);
  const { prescrito, maximo } = blocosDoWod(wod);

  let tecnicaSeries = maxTecnica;
  let blocos = prescrito;
  let chipperAte: number | null = wod.formato === 'Chipper' ? wod.movimentos.length : null;
  const adaptacoes: Record<string, string> = {};

  if (!comoPrescrito) {
    if (e.tecnicaSeries !== undefined) {
      const n = inteiro(e.tecnicaSeries, 0, 50);
      if (n === null) return { erro: 'Séries da Técnica / Força: um inteiro.' };
      tecnicaSeries = Math.min(n, maxTecnica);
    }
    if (wod.formato === 'Chipper') {
      if (e.chipperAte !== undefined) {
        const n = inteiro(e.chipperAte, 0, wod.movimentos.length);
        if (n === null) return { erro: `Chipper: até qual movimento chegou (0 a ${wod.movimentos.length}).` };
        chipperAte = n;
      }
    } else if (e.rodadas !== undefined) {
      const n = inteiro(e.rodadas, 0, 100);
      if (n === null) return { erro: 'Rodadas: um inteiro.' };
      blocos = Math.min(n, maximo); // acima do prescrito (ou do teto do AMRAP) é cortado, como as séries da força
    }
    const pedidas = (e.adaptacoes ?? {}) as Record<string, unknown>;
    if (typeof pedidas !== 'object' || Array.isArray(pedidas)) return { erro: 'Adaptações: movimento → exercício.' };
    for (const [mov, alvo] of Object.entries(pedidas)) {
      const m = wod.movimentos.find((x) => x.exercicioId === mov);
      if (!m) return { erro: `"${mov}" não é movimento do WOD desse dia.` };
      const cadastradas = Object.values(catalogo.get(mov)?.adaptacoes ?? {});
      if (typeof alvo !== 'string' || !cadastradas.includes(alvo)) {
        return { erro: `${m.nome}: só as adaptações cadastradas pelo coach no catálogo.` };
      }
      adaptacoes[mov] = alvo;
    }
  }

  const series: Record<string, number> = {};
  if (wod.tecnica) somar(series, wod.tecnica.exercicioId, tecnicaSeries * FATOR_VOLUME.forca);
  wod.movimentos.forEach((m, i) => {
    const feitos = wod.formato === 'Chipper' ? (i < (chipperAte ?? 0) ? 2 : 0) : blocos;
    // O fator é o do movimento PROGRAMADO: a corrida trocada pela bike continua cardio.
    const fator = m.padrao === 'cardio' ? FATOR_VOLUME.cardio : FATOR_VOLUME.wod;
    somar(series, adaptacoes[m.exercicioId] ?? m.exercicioId, feitos * fator);
  });
  return { series, registro: { tipo: 'cross', comoPrescrito, tecnicaSeries, blocos, chipperAte, adaptacoes } };
}

/** As chaves do Hyrox nas séries da presença ('hyrox:sled_push', 'hyrox:sled_pull:substituta', 'hyrox:corrida'). */
const chaveEstacao = (estacao: string, substituta: boolean) => `hyrox:${estacao}${substituta ? ':substituta' : ''}`;

/** Os músculos de cada chave do Hyrox, no formato do catálogo — para `volumeDaSessao`. */
export function catalogoDoHyrox(): Map<string, MusculosHyrox> {
  const mapa = new Map<string, MusculosHyrox>();
  for (const [estacao, m] of Object.entries(MUSCULOS_HYROX)) {
    mapa.set(chaveEstacao(estacao, false), m.estacao);
    if (m.substituta) mapa.set(chaveEstacao(estacao, true), m.substituta);
  }
  mapa.set('hyrox:corrida', MUSCULOS_CORRIDA_HYROX.corrida);
  mapa.set('hyrox:air_bike', MUSCULOS_CORRIDA_HYROX.bike);
  return mapa;
}

/**
 * O registro do Hyrox: `{ comoPrescrito: true }` ou `{ estacoesFeitas?, corridaNaBike? }`.
 * As estações contam na ordem (rodada após rodada); cada uma traz a corrida de antes dela.
 */
export function lerRegistroHyrox(
  entrada: unknown,
  hyrox: HyroxProgramado,
): { series: Record<string, number>; registro: RegistroHyroxLido } | { erro: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  if (typeof entrada !== 'object' || entrada === null) return { erro: 'Mande o registro do Hyrox.' };
  const comoPrescrito = e.comoPrescrito === true;
  const regra = REGRA_FORMATO_HYROX[hyrox.formato];
  const total = hyrox.estacoes.length * Math.max(1, hyrox.rodadas);

  let estacoesFeitas = total;
  let corridaNaBike = false;
  if (!comoPrescrito) {
    if (e.estacoesFeitas !== undefined) {
      const n = inteiro(e.estacoesFeitas, 0, 100);
      if (n === null) return { erro: 'Estações feitas: um inteiro.' };
      estacoesFeitas = Math.min(n, total);
    }
    if (e.corridaNaBike !== undefined && typeof e.corridaNaBike !== 'boolean') return { erro: 'Corrida na bike: sim ou não.' };
    corridaNaBike = e.corridaNaBike === true;
  }

  const series: Record<string, number> = {};
  for (let k = 0; k < estacoesFeitas; k++) {
    const est = hyrox.estacoes[k % hyrox.estacoes.length];
    somar(series, chaveEstacao(est.estacao, est.substituta), FATOR_VOLUME.estacaoHyrox * (regra?.fatorEstacao ?? 1));
    somar(series, corridaNaBike ? 'hyrox:air_bike' : 'hyrox:corrida', FATOR_VOLUME.cardio * (regra?.fatorCorrida ?? 1));
  }
  return { series, registro: { tipo: 'hyrox', comoPrescrito, estacoesFeitas, corridaNaBike } };
}
