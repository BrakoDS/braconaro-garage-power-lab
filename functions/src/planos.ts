/**
 * O valor da mensalidade de cada mês (Fase 1 · etapa 6.1) — PORTE fiel de
 * `compartilhado/regras/planos.js`, a regra da Gestão. O `checar-pix` roda as
 * duas versões lado a lado em milhares de fichas sorteadas (plano, tabela,
 * bônus, cortesia, pausa, início, semanas) e falha se divergirem.
 *
 * Só a parte que o Pix precisa: o valor (`mensalidadeDoMes`). Os textos e as
 * ações do coach ficam na Gestão.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type FichaPlano = any;

export const VIGENCIA_2027 = '2027-01';
export const SEMANAS_DESDE = '2026-12';
export const TETO_BONUS = 30;

export const TABELAS: Record<'fundador' | 'regular', Record<string, number>> = {
  fundador: {
    '2x-mensal': 150,
    '3x-mensal': 190, '3x-trimestral': 180, '3x-semestral': 170,
    '4x-mensal': 220, '4x-semestral': 195,
    'ilimitado-mensal': 250,
  },
  regular: {
    '3x-mensal': 260, '3x-trimestral': 240, '3x-semestral': 220,
    '4x-mensal': 310, '4x-trimestral': 290, '4x-semestral': 270,
    'ilimitado-mensal': 350,
  },
};

export const BONUS_PCT = { dupla: 10, instagram: 5, parceriaInicio: 10, parceria: 5, indicacao: 30 };

const dinheiro = (v: unknown): number => Number(String(v ?? '').replace(',', '.')) || 0;
const centavos = (v: number): number => Math.round(v * 100) / 100;

const utc = (d: string): number => { const [a, m, dia] = d.split('-').map(Number); return Date.UTC(a, m - 1, dia); };
const somarDiasIso = (d: string, n: number): string => new Date(utc(d) + n * 86400000).toISOString().slice(0, 10);
const diaDaSemana = (d: string): number => new Date(utc(d)).getUTCDay();
function ultimoDiaDoMes(mesId: string): string {
  const [a, m] = mesId.split('-').map(Number);
  return `${mesId}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
function mesAnterior(mesId: string): string {
  const [a, m] = mesId.split('-').map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

function chaveDoPlano(plano: any): string {
  const prazo = (plano && plano.prazo) || 'mensal';
  const v = plano && plano.vezes;
  if (v === 'ilimitado') return `ilimitado-${prazo}`;
  const n = Number(v);
  return n === 2 || n === 3 || n === 4 ? `${n}x-${prazo}` : '';
}

const ehFundador = (a: FichaPlano): boolean => !!a && a.fundador === true;
const tabelaDoAluno = (a: FichaPlano): 'fundador' | 'regular' => (ehFundador(a) ? 'fundador' : 'regular');

function precoDaTabela(a: FichaPlano, mesId: string): number | null {
  if (mesId < VIGENCIA_2027) return null;
  const p = TABELAS[tabelaDoAluno(a)][chaveDoPlano(a && a.plano)];
  return typeof p === 'number' ? p : null;
}

function vezesDoPlano(a: FichaPlano): number {
  const v = a && a.plano && a.plano.vezes;
  if (v === 'ilimitado') return 5;
  return Number(v) || Number(a && a.freqVezes) || 0;
}

function pausaNoDia1(a: FichaPlano, mesId: string): any {
  const d1 = `${mesId}-01`;
  return ((a && a.pausas) || []).find((p: any) => p && p.desde && p.desde <= d1 && (!p.ate || p.ate > d1)) || null;
}

function semanasDesde(mesId: string, desde: string, vezes: number, presencas: unknown[] = []): { semanas: number; quebrada: boolean } {
  const ult = ultimoDiaDoMes(mesId);
  let segundas = 0;
  for (let d = desde; d <= ult; d = somarDiasIso(d, 1)) if (diaDaSemana(d) === 1) segundas++;
  let quebrada = false;
  const dow = diaDaSemana(desde);
  if (dow !== 1) {
    const segunda = somarDiasIso(desde, -((dow + 6) % 7));
    if (segunda.slice(0, 7) === mesId) {
      const domingo = somarDiasIso(segunda, 6);
      const feitas = new Set((presencas || []).filter((p) => typeof p === 'string' && p >= desde && p <= domingo)).size;
      quebrada = vezes > 0 && feitas >= vezes;
    }
  }
  return { semanas: Math.min(4, segundas + (quebrada ? 1 : 0)), quebrada };
}

function semanasDoMes(a: FichaPlano, mesId: string): { semanas: number; zero: '' | 'pausado' | 'antes-do-inicio' } {
  const ult = ultimoDiaDoMes(mesId);
  const d1 = `${mesId}-01`;
  let zero: '' | 'pausado' | 'antes-do-inicio' = '';
  let desde = '';
  const p = pausaNoDia1(a, mesId);
  if (p) {
    if (!p.ate || p.ate > ult) zero = 'pausado';
    else desde = p.ate;
  }
  const inicio = a && typeof a.inicio === 'string' ? a.inicio : '';
  if (!zero && inicio && mesId >= SEMANAS_DESDE) {
    if (inicio > ult) zero = 'antes-do-inicio';
    else if (inicio > d1 && inicio > desde) desde = inicio;
  }
  const aj = a && a.semanasAjuste ? a.semanasAjuste[mesId] : undefined;
  const n = aj === '' || aj == null ? NaN : Number(aj);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return { semanas: n, zero: '' };
  if (zero) return { semanas: 0, zero };
  if (!desde) return { semanas: 4, zero: '' };
  return { semanas: semanasDesde(mesId, desde, vezesDoPlano(a), a && a.presencas).semanas, zero: '' };
}

function pctDosBonus(a: FichaPlano, mesId: string): number {
  if (mesId < VIGENCIA_2027 || !a) return 0;
  let soma = 0;
  if (a.dupla && a.dupla.id) soma += BONUS_PCT.dupla;
  if (Array.isArray(a.instagram) && a.instagram.includes(mesAnterior(mesId))) soma += BONUS_PCT.instagram;
  const pl = a.parceriaLocal;
  if (pl && pl.desde && mesId >= pl.desde) soma += mesId === pl.desde ? BONUS_PCT.parceriaInicio : BONUS_PCT.parceria;
  if (a.indicadoPor && a.indicadoPor.mes === mesId) soma += BONUS_PCT.indicacao;
  for (const i of Array.isArray(a.indicacoes) ? a.indicacoes : []) if (i && i.mes === mesId) soma += BONUS_PCT.indicacao;
  return soma;
}

export interface MensalidadeDoMes {
  cheia: number;
  desconto: number;
  valor: number;
  parceria: { nome: string; percentual: number; valor: number } | null;
}

/** O valor da mensalidade de um mês — o mesmo de `mensalidadeDoMes` (planos.js). */
export function mensalidadeDoMes(a: FichaPlano, mesId: string): MensalidadeDoMes {
  const tabelado = precoDaTabela(a, mesId);
  const cheia = tabelado != null ? tabelado : dinheiro(a && a.mensalidade);
  const pctLegado = Number(a && a.parceria && a.parceria.percentual) || 0;
  const cortesia = !!(a && a.cortesia) || pctLegado >= 100;
  const parceria = pctLegado > 0 && (pctLegado >= 100 || mesId < VIGENCIA_2027)
    ? { nome: String((a as any).parceria.nome || '').trim(), percentual: pctLegado, valor: centavos(cheia * pctLegado / 100) }
    : null;
  if (cortesia) return { cheia, desconto: cheia, valor: 0, parceria };
  const s = semanasDoMes(a, mesId);
  if (s.zero) return { cheia, desconto: cheia, valor: 0, parceria };
  const pctBonus = Math.min(pctDosBonus(a, mesId), TETO_BONUS);
  const descontoPlano = parceria ? Math.min(parceria.valor, cheia) : Math.min(centavos(cheia * pctBonus / 100), cheia);
  const liquido = centavos(cheia - descontoPlano);
  if (s.semanas >= 4) return { cheia, desconto: descontoPlano, valor: liquido, parceria };
  const valor = centavos(liquido * s.semanas / 4);
  return { cheia, desconto: centavos(cheia - valor), valor, parceria };
}
