/**
 * Pix dinâmico (Mercado Pago) — as regras puras: a conta do mês, o pedido de
 * pagamento, a leitura do QR, a assinatura do webhook e o que fazer com cada
 * pagamento que o Mercado Pago devolve.
 *
 * Nada aqui fala com rede ou banco: o `checar-pix.ts` prova tudo sem internet.
 * A orquestração está em `pix-servico.ts`; o Firestore e o HTTP, em
 * `pix-firestore.ts`.
 *
 * A CONTA É A DA GESTÃO
 *
 * O valor do Pix é a mesma conta que a tela Cobranças mostra e que a baixa
 * registra: `contaDoMes` (coach/gestao-de-alunos/financeiro-aluno.js), com
 * parceria, consumos do mês e os dependentes que o aluno acerta. As funções
 * abaixo são PORTE fiel daquele código — o `checar-pix` roda as duas versões
 * lado a lado sobre milhares de boxes sorteados e falha se divergirem. O valor
 * NUNCA vem do cliente: o pedido diz quem paga e (opcionalmente) o mês; o
 * quanto sai daqui.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/* ================================================================== *
 * A conta do mês (porte de consumo.js + financeiro-aluno.js)
 * ================================================================== */

export interface Consumo { id?: string; nome?: string; preco?: unknown; data?: string; mesId?: string }
export interface Ficha {
  id: string;
  nome?: string;
  email?: string;
  status?: string;
  mensalidade?: unknown;
  vencimento?: unknown;
  parceria?: { nome?: string; percentual?: unknown } | null;
  pagoPor?: { id?: string; escopo?: string } | null;
  pagamentos?: Record<string, unknown>;
  consumos?: Consumo[];
}

interface Parte { mensalidade: number; consumos: Consumo[]; extras: number; total: number }

/** Arredonda para centavos — 171 × 25% dá 42,75 e não 42,749999. */
const centavos = (v: number): number => Math.round(v * 100) / 100;
const dinheiro = (v: unknown): number => Number(String(v ?? '').replace(',', '.')) || 0;

function consumosDoMes(consumos: Consumo[] | undefined, mesId: string): Consumo[] {
  return (consumos || []).filter((c) => c && c.mesId === mesId)
    .slice().sort((x, y) => (String(x.data) < String(y.data) ? -1 : String(x.data) > String(y.data) ? 1 : 0));
}

function faturaDoMes(a: Ficha, mesId: string): Parte {
  const cheia = dinheiro(a?.mensalidade);
  const pct = Number(a?.parceria?.percentual) || 0;
  const desconto = pct ? Math.min(centavos(cheia * pct / 100), cheia) : 0;
  const mensalidade = centavos(cheia - desconto);
  const consumos = consumosDoMes(a?.consumos, mesId);
  const extras = centavos(consumos.reduce((s, c) => s + (Number(c.preco) || 0), 0));
  return { mensalidade, consumos, extras, total: centavos(mensalidade + extras) };
}

function parteCoberta(a: Ficha, mesId: string, escopo: string): Parte {
  if (!escopo) return { mensalidade: 0, consumos: [], extras: 0, total: 0 };
  const f = faturaDoMes(a, mesId);
  if (escopo === 'tudo') return f;
  return { mensalidade: f.mensalidade, consumos: [], extras: 0, total: f.mensalidade };
}

function faturaPropria(a: Ficha, mesId: string): Parte {
  const f = faturaDoMes(a, mesId);
  const esc = a?.pagoPor?.escopo;
  if (!esc) return f;
  if (esc === 'tudo') return { mensalidade: 0, consumos: [], extras: 0, total: 0 };
  return { mensalidade: 0, consumos: f.consumos, extras: f.extras, total: f.extras };
}

const ativo = (a: Ficha): boolean => (a.status || 'ativo') !== 'inativo';

export interface ContaDoMes {
  total: number;
  /** A conta é só a mensalidade (sem consumo nem dependente)? O texto diz "mensalidade" ou "conta". */
  soMensalidade: boolean;
  /** Quem acerta a conta deste aluno (ele mesmo não paga nada), ou null. */
  responsavel: Ficha | null;
}

/**
 * A conta de um aluno num mês, com quem paga quem resolvido — PORTE de
 * `contaDoMes` (financeiro-aluno.js). Responsável inativo ou que saiu devolve a
 * conta ao aluno; dependente inativo não soma.
 */
export function contaDoMes(a: Ficha, mesId: string, todos: Ficha[]): ContaDoMes {
  const ativos = todos.filter(ativo);
  const deps = ativos.filter((x) => x.pagoPor && x.pagoPor.id === a.id);
  const resp = a.pagoPor && a.pagoPor.id ? ativos.find((x) => x.id === a.pagoPor!.id) || null : null;
  const efetivo: Ficha = (a.pagoPor && !resp) ? { ...a, pagoPor: null } : a;
  const propria = faturaPropria(efetivo, mesId);
  const cobertos = deps.map((d) => parteCoberta(d, mesId, (d.pagoPor && d.pagoPor.escopo) || 'tudo'))
    .filter((d) => d.total > 0 || d.consumos.length);
  const total = centavos(propria.total + cobertos.reduce((s, d) => s + d.total, 0));
  return { total, soMensalidade: !cobertos.length && !(propria.extras > 0), responsavel: resp };
}

/** O mês seguinte a 'YYYY-MM'. */
export function proximoMes(mesId: string): string {
  const [a, m] = mesId.split('-').map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** A partir deste dia do mês, a conta em tela é a do mês seguinte (cobranca.js). */
export const DIA_VIRADA = 28;

const pago = (a: Ficha, mesId: string): boolean => !!(a.pagamentos && a.pagamentos[mesId]);

/**
 * O mês da conta que o aluno paga hoje — a regra do Portal (`mesDaCobranca`,
 * compartilhado/regras/cobranca.js): até o dia 27, o mês atual; do dia 28 em
 * diante, o mês seguinte — a não ser que o atual ainda esteja em aberto, que aí
 * continua sendo ele (a virada não esconde dívida).
 */
export function mesDaCobranca(a: Ficha, hoje: string, todos: Ficha[]): string {
  const atual = hoje.slice(0, 7);
  if (Number(hoje.slice(8, 10)) < DIA_VIRADA) return atual;
  const deveAtual = !pago(a, atual) && contaDoMes(a, atual, todos).total > 0;
  return deveAtual ? atual : proximoMes(atual);
}

/** 'YYYY-MM-DD' no fuso do box. */
export function diaSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** "Outubro / 2026" — o mesmo rótulo da Gestão (`rotuloMesFin`). */
export function rotuloMes(mesId: string): string {
  const [a, m] = mesId.split('-').map(Number);
  return `${MESES[m - 1]} / ${a}`;
}

export const ehMesId = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/* ================================================================== *
 * O pedido ao Mercado Pago
 * ================================================================== */

/** Validade de cada QR. O Mercado Pago aceita de 30 min a 30 dias. */
export const PIX_VALIDADE_MIN = 60;
/**
 * Janela da chave de idempotência: dois toques no "Gerar Pix" dentro dela caem
 * na MESMA chave e no mesmo corpo — o Mercado Pago devolve o mesmo pagamento em
 * vez de criar dois. Por isso a validade é contada do COMEÇO da janela (corpo
 * idêntico), e a janela é menor que a validade (o QR sempre dura 30+ min).
 */
export const PIX_JANELA_MIN = 30;
/** Teto de sanidade: conta acima disto é erro de cadastro, não mensalidade. */
export const PIX_VALOR_MAXIMO = 5000;

/** O prefixo das referências deste sistema — o webhook ignora pagamento sem ele. */
const PREFIXO_REF = 'gpl-pix';

/** `gpl-pix|{uid}|{alunoId}|{mesId}` — o que liga o pagamento do Mercado Pago à cobrança. */
export function referenciaDe(uid: string, alunoId: string, mesId: string): string {
  return [PREFIXO_REF, uid, alunoId, mesId].join('|');
}

export function lerReferencia(ref: unknown): { uid: string; alunoId: string; mesId: string } | null {
  if (typeof ref !== 'string') return null;
  const p = ref.split('|');
  if (p.length !== 4 || p[0] !== PREFIXO_REF || !p[1] || !p[2] || !ehMesId(p[3])) return null;
  return { uid: p[1], alunoId: p[2], mesId: p[3] };
}

/** A data no formato que o Mercado Pago pede (`2026-10-09T15:00:00.000-03:00`), no fuso de Brasília. */
export function dataMp(ms: number): string {
  const brt = new Date(ms - 3 * 3600_000);
  return brt.toISOString().replace('Z', '-03:00');
}

export interface PedidoPix {
  chaveIdempotencia: string;
  corpo: {
    transaction_amount: number;
    description: string;
    payment_method_id: 'pix';
    payer: { email: string };
    external_reference: string;
    date_of_expiration: string;
  };
  expiraEm: number;
}

/**
 * O pedido de pagamento Pix. A URL de notificação NÃO vai no pedido: ela é a
 * cadastrada no painel do Mercado Pago ("Suas integrações" → Webhooks), que é a
 * única garantida com a assinatura `x-signature` — e o webhook exige a assinatura.
 */
export function montarPedidoPix(p: {
  uid: string; alunoId: string; mesId: string; valor: number; email: string; soMensalidade: boolean; agora: number;
}): PedidoPix {
  const janela = PIX_JANELA_MIN * 60_000;
  const inicio = Math.floor(p.agora / janela) * janela;
  const expiraEm = inicio + PIX_VALIDADE_MIN * 60_000;
  const cents = Math.round(p.valor * 100);
  return {
    chaveIdempotencia: `${PREFIXO_REF}-${p.uid}-${p.alunoId}-${p.mesId}-${cents}-${inicio}`,
    corpo: {
      transaction_amount: cents / 100,
      description: `Garage Power Lab · ${p.soMensalidade ? 'Mensalidade' : 'Conta'} de ${rotuloMes(p.mesId)}`,
      payment_method_id: 'pix',
      payer: { email: p.email },
      external_reference: referenciaDe(p.uid, p.alunoId, p.mesId),
      date_of_expiration: dataMp(expiraEm),
    },
    expiraEm,
  };
}

export interface QrPix { paymentId: string; qrCode: string; qrCodeBase64: string; ticketUrl: string }

/** O QR da resposta do Mercado Pago, ou null se ela não tiver o que precisamos. */
export function lerQr(resp: unknown): QrPix | null {
  const r = resp as { id?: unknown; point_of_interaction?: { transaction_data?: Record<string, unknown> } } | null;
  const td = r?.point_of_interaction?.transaction_data;
  const id = r?.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || !td) return null;
  const qrCode = typeof td.qr_code === 'string' ? td.qr_code : '';
  const qrCodeBase64 = typeof td.qr_code_base64 === 'string' ? td.qr_code_base64 : '';
  if (!qrCode || !qrCodeBase64) return null;
  return { paymentId: String(id), qrCode, qrCodeBase64, ticketUrl: typeof td.ticket_url === 'string' ? td.ticket_url : '' };
}

/* ================================================================== *
 * O webhook
 * ================================================================== */

/** O id do pagamento numa notificação (query `data.id` ou corpo `data.id`), só dígitos — ou null. */
export function idDaNotificacao(query: Record<string, unknown>, corpo: unknown): string | null {
  const b = corpo as { data?: { id?: unknown }; type?: unknown } | null;
  const bruto = query['data.id'] ?? b?.data?.id;
  const id = typeof bruto === 'number' ? String(bruto) : typeof bruto === 'string' ? bruto.trim() : '';
  return /^\d{1,20}$/.test(id) ? id : null;
}

/**
 * É notificação de pagamento? O tipo declarado (`type`/`topic`, na query ou no
 * corpo) manda; só quando ele falta vale o `action: payment.*`.
 */
export function ehNotificacaoDePagamento(query: Record<string, unknown>, corpo: unknown): boolean {
  const b = corpo as { type?: unknown; action?: unknown } | null;
  const tipo = query.type ?? query.topic ?? b?.type;
  if (tipo !== undefined && tipo !== null && tipo !== '') return tipo === 'payment';
  return typeof b?.action === 'string' && b.action.startsWith('payment.');
}

/**
 * Confere a assinatura `x-signature` (`ts=…,v1=…`) do Mercado Pago:
 * HMAC-SHA256, em hexadecimal, do manifesto `id:{data.id};request-id:{x-request-id};ts:{ts};`
 * com a chave secreta do webhook. Chave do manifesto sem valor sai do manifesto
 * (é o que a documentação manda). Comparação em tempo constante.
 */
export function assinaturaValida(p: { xSignature: unknown; xRequestId: unknown; dataId: string | null; segredo: string }): boolean {
  if (!p.segredo || typeof p.xSignature !== 'string') return false;
  const partes = Object.fromEntries(p.xSignature.split(',').map((s) => {
    const i = s.indexOf('=');
    return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  }));
  const ts = partes.ts, v1 = partes.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  let manifesto = '';
  if (p.dataId) manifesto += `id:${p.dataId.toLowerCase()};`;
  if (typeof p.xRequestId === 'string' && p.xRequestId) manifesto += `request-id:${p.xRequestId};`;
  manifesto += `ts:${ts};`;
  const esperado = createHmac('sha256', p.segredo).update(manifesto).digest();
  const recebido = Buffer.from(v1, 'hex');
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export type StatusCobranca = 'pendente' | 'aprovado' | 'cancelado' | 'substituida' | 'divergente' | 'estornado';

/** O registro de cada Pix gerado — `gestao/{uid}/cobrancasPix/{paymentId}`. */
export interface CobrancaPix {
  paymentId: string;
  alunoId: string;
  alunoNome: string;
  email: string;
  mesId: string;
  valor: number;
  soMensalidade: boolean;
  status: StatusCobranca;
  criadoEm: number;
  expiraEm: number;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  /** Quando o webhook confirmou o pagamento (é por este campo que a Gestão procura o que aplicar). */
  aprovadoEm?: number;
  valorPago?: number;
  statusMp?: string;
  /**
   * Há algo para a Gestão do coach tratar (aprovado → baixa; divergente ou
   * estornado → aviso). O webhook liga, a Gestão desliga depois de tratar — é
   * por este campo (igualdade, sem índice composto) que ela procura.
   */
  avisarGestao?: boolean;
  /** Quando a Gestão tratou (aplicou a baixa, ou registrou o aviso). */
  aplicadaEm?: number;
  /** Por que a cobrança não foi aprovada automaticamente. */
  motivo?: string;
}

export type Decisao =
  | { acao: 'aprovar'; valorPago: number }
  | { acao: 'ja-aprovado' }
  | { acao: 'divergente'; motivo: string }
  | { acao: 'estornar' }
  | { acao: 'encerrar'; status: 'cancelado' }
  | { acao: 'nada'; motivo: string };

/**
 * O que fazer com a cobrança diante do pagamento como o Mercado Pago o devolve
 * (GET /v1/payments/{id} — nunca o corpo da notificação).
 */
export function decidir(pg: Record<string, unknown>, c: CobrancaPix): Decisao {
  const status = String(pg.status ?? '');
  const valor = Number(pg.transaction_amount);
  if (status === 'approved') {
    if (c.status === 'aprovado' || c.status === 'estornado') return { acao: 'ja-aprovado' };
    if (pg.currency_id !== undefined && pg.currency_id !== 'BRL') return { acao: 'divergente', motivo: `moeda ${String(pg.currency_id)}` };
    if (!Number.isFinite(valor) || Math.round(valor * 100) !== Math.round(c.valor * 100)) {
      return { acao: 'divergente', motivo: `valor pago ${valor} ≠ cobrado ${c.valor}` };
    }
    return { acao: 'aprovar', valorPago: valor };
  }
  if (status === 'refunded' || status === 'charged_back') {
    return c.status === 'aprovado' ? { acao: 'estornar' } : { acao: 'nada', motivo: `${status} sem aprovação antes` };
  }
  if (status === 'cancelled' || status === 'rejected' || status === 'expired') {
    return c.status === 'pendente' || c.status === 'substituida' ? { acao: 'encerrar', status: 'cancelado' } : { acao: 'nada', motivo: status };
  }
  return { acao: 'nada', motivo: status || 'sem status' };
}
