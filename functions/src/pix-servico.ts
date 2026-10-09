/**
 * Pix dinâmico — a orquestração das duas funções (`gerarPixCobranca` e
 * `webhookMercadoPago`), sem Firestore e sem HTTP: o banco e o Mercado Pago
 * entram por `RepoPix` e `ClienteMp` (`pix-firestore.ts` em produção; fakes em
 * memória no `checar-pix.ts`).
 *
 * POR QUE O WEBHOOK NÃO GRAVA NA FICHA
 *
 * A Gestão é local-first: lê a nuvem no login e depois só ENVIA, regravando a
 * ficha inteira a cada edição (db-firestore.js, `set` sem merge). Uma baixa que
 * o servidor escrevesse em `gestao/{uid}/alunos/{id}` seria apagada pela
 * próxima edição do coach naquele aluno num aparelho aberto antes do Pix — e o
 * aluno que pagou voltaria a dever.
 *
 * Então o webhook escreve num LIVRO-CAIXA, `gestao/{uid}/cobrancasPix/{paymentId}`
 * (só o servidor cria e aprova), e a Gestão, ao abrir e de tempos em tempos,
 * aplica cada Pix aprovado com o MESMO `darBaixa` da baixa manual
 * (coach/gestao-de-alunos/pix-baixa.js). Enquanto isso:
 *   - o aluno já vê "pago" no Portal — o webhook marca `portal/{email}`;
 *   - um segundo Pix do mesmo mês é recusado aqui — o livro-caixa já diz "pago".
 *
 * IDEMPOTÊNCIA
 *   - webhook repetido (o Mercado Pago reenvia até receber 200): a aprovação é
 *     uma TRANSAÇÃO que só muda a cobrança que ainda não estava aprovada; a
 *     segunda notificação não muda nada;
 *   - dois toques no "Gerar Pix": a mesma chave de idempotência no Mercado Pago
 *     (ver PIX_JANELA_MIN) e o QR ainda válido é devolvido de novo;
 *   - a baixa na Gestão é `darBaixa` (não paga duas vezes) com evento de id fixo.
 */
import { normalizarEmail } from './acesso';
import {
  contaDoMes, decidir, diaSaoPaulo, ehMesId, lerQr, lerReferencia, mesDaCobranca, montarPedidoPix, proximoMes,
  assinaturaValida, idDaNotificacao, ehNotificacaoDePagamento,
  PIX_VALOR_MAXIMO, type CobrancaPix, type Ficha, type PedidoPix,
} from './pix';

export type CodigoErro = 'unauthenticated' | 'permission-denied' | 'not-found' | 'failed-precondition' | 'invalid-argument' | 'unavailable';

/** Erro que vira `HttpsError` com a mensagem para o aluno (index.ts). */
export class ErroPix extends Error {
  constructor(readonly codigo: CodigoErro, mensagem: string) { super(mensagem); }
}

export interface AlunoNaGestao { uid: string; ficha: Ficha; todos: Ficha[] }

export interface RepoPix {
  /** O aluno com este e-mail na Gestão de algum coach, com o box inteiro (os dependentes entram na conta). */
  alunoPorEmail(email: string): Promise<AlunoNaGestao | null>;
  alunoPorId(uid: string, alunoId: string): Promise<AlunoNaGestao | null>;
  cobrancasDoAluno(uid: string, alunoId: string): Promise<CobrancaPix[]>;
  salvarCobranca(uid: string, c: CobrancaPix): Promise<void>;
  atualizarCobranca(uid: string, paymentId: string, campos: Partial<CobrancaPix>): Promise<void>;
  /**
   * Relê a cobrança DENTRO de uma transação, passa para `fn` e grava o que ela
   * devolver (null = nada a gravar). `fn` pode rodar mais de uma vez (a
   * transação refaz quando há disputa), então tem de ser pura.
   */
  transicionar(uid: string, paymentId: string, fn: (c: CobrancaPix) => Partial<CobrancaPix> | null):
    Promise<{ existe: boolean; mudou: boolean }>;
  /** `portal/{email}.pagamentos[mesId] = true` — o aluno vê "pago" sem esperar o coach. */
  marcarPagoNoPortal(email: string, mesId: string): Promise<void>;
}

export interface ClienteMp {
  criarPix(p: PedidoPix): Promise<unknown>;
  buscarPagamento(id: string): Promise<Record<string, unknown>>;
  cancelarPagamento(id: string): Promise<void>;
}

export interface Log { info(msg: string, extra?: object): void; warn(msg: string, extra?: object): void }
const SEM_LOG: Log = { info() {}, warn() {} };

/* ================================================================== *
 * gerarPixCobranca
 * ================================================================== */

export interface RespostaPix {
  paymentId: string;
  mesId: string;
  valor: number;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiraEm: number;
  /** O QR já existia e ainda vale (dois toques, ou a tela reaberta). */
  reutilizado: boolean;
}

/** Quanto um QR ainda precisa valer para ser devolvido de novo, em vez de gerar outro. */
export const MARGEM_REUSO_MS = 10 * 60_000;

const cents = (v: number): number => Math.round(v * 100);
const resposta = (c: CobrancaPix, reutilizado: boolean): RespostaPix => ({
  paymentId: c.paymentId, mesId: c.mesId, valor: c.valor, qrCode: c.qrCode, qrCodeBase64: c.qrCodeBase64,
  ticketUrl: c.ticketUrl, expiraEm: c.expiraEm, reutilizado,
});

/**
 * Gera (ou devolve) o Pix da conta do mês.
 *
 * Quem pede: o ALUNO, pelo e-mail da conta dele (só a própria conta), ou o
 * COACH, com `alunoId`. O valor sai da ficha, aqui; o pedido só escolhe o mês
 * (opcional — sem ele, o mês que o Portal mostra).
 */
export async function gerarPix(
  pedido: { uid?: string; email?: unknown; alunoId?: unknown; mesId?: unknown },
  deps: { repo: RepoPix; mp: ClienteMp; agora: number; ehCoach: (uid: string) => boolean; log?: Log },
): Promise<RespostaPix> {
  const { repo, mp, agora } = deps;
  const log = deps.log || SEM_LOG;
  if (!pedido.uid) throw new ErroPix('unauthenticated', 'Entre na sua conta para pagar.');

  let alvo: AlunoNaGestao | null;
  if (deps.ehCoach(pedido.uid) && pedido.alunoId !== undefined) {
    if (typeof pedido.alunoId !== 'string' || !pedido.alunoId) throw new ErroPix('invalid-argument', 'Aluno inválido.');
    alvo = await repo.alunoPorId(pedido.uid, pedido.alunoId);
  } else {
    const email = normalizarEmail(pedido.email);
    if (!email) throw new ErroPix('permission-denied', 'Sua conta não tem e-mail.');
    alvo = await repo.alunoPorEmail(email);
    // O aluno só paga a própria conta: um alunoId de outra pessoa é recusado, não ignorado.
    if (alvo && pedido.alunoId !== undefined && pedido.alunoId !== alvo.ficha.id) {
      throw new ErroPix('permission-denied', 'Você só pode pagar a sua conta.');
    }
  }
  if (!alvo) throw new ErroPix('not-found', 'Não achamos sua ficha no box. Fale com o coach.');
  const { uid, ficha, todos } = alvo;
  if ((ficha.status || 'ativo') === 'inativo') throw new ErroPix('failed-precondition', 'Esta matrícula está inativa. Fale com o coach.');

  const hoje = diaSaoPaulo(new Date(agora));
  const mesId = pedido.mesId === undefined ? mesDaCobranca(ficha, hoje, todos) : pedido.mesId;
  if (!ehMesId(mesId)) throw new ErroPix('invalid-argument', 'Mês inválido.');
  if (mesId > proximoMes(hoje.slice(0, 7))) throw new ErroPix('invalid-argument', 'Essa conta ainda não abriu.');

  const conta = contaDoMes(ficha, mesId, todos);
  if (conta.responsavel && conta.total === 0) {
    throw new ErroPix('failed-precondition', `Sua conta é acertada por ${conta.responsavel.nome || 'outro aluno'}.`);
  }
  if (ficha.pagamentos && ficha.pagamentos[mesId]) throw new ErroPix('failed-precondition', 'Esta conta já está paga.');
  const doMes = (await repo.cobrancasDoAluno(uid, ficha.id)).filter((c) => c.mesId === mesId);
  if (doMes.some((c) => c.status === 'aprovado' || c.status === 'estornado')) {
    throw new ErroPix('failed-precondition', 'Esta conta já foi paga por Pix.');
  }
  if (!(conta.total > 0)) throw new ErroPix('failed-precondition', 'Não há nada a pagar neste mês.');
  if (conta.total > PIX_VALOR_MAXIMO) throw new ErroPix('failed-precondition', 'O valor desta conta precisa ser conferido pelo coach.');
  const email = normalizarEmail(ficha.email);
  if (!email) throw new ErroPix('failed-precondition', 'A ficha não tem e-mail — o Pix precisa de um e-mail de pagador.');

  // O QR que ainda vale, para o mesmo valor, volta igual.
  const vale = doMes.find((c) => c.status === 'pendente' && cents(c.valor) === cents(conta.total) && c.expiraEm - agora >= MARGEM_REUSO_MS);
  if (vale) return resposta(vale, true);

  const pedidoMp = montarPedidoPix({ uid, alunoId: ficha.id, mesId, valor: conta.total, email, soMensalidade: conta.soMensalidade, agora });
  let qr;
  try {
    qr = lerQr(await mp.criarPix(pedidoMp));
  } catch (e) {
    log.warn('Mercado Pago recusou o Pix.', { alunoId: ficha.id, mesId, erro: String((e as Error)?.message || e) });
    throw new ErroPix('unavailable', 'Não foi possível gerar o Pix agora. Tente de novo em instantes.');
  }
  if (!qr) throw new ErroPix('unavailable', 'O Mercado Pago não devolveu o QR do Pix. Tente de novo.');

  // A mesma chave de idempotência devolve o mesmo pagamento: já registrado, só devolve.
  const jaTinha = doMes.find((c) => c.paymentId === qr.paymentId);
  if (jaTinha) return resposta(jaTinha, true);

  const nova: CobrancaPix = {
    paymentId: qr.paymentId, alunoId: ficha.id, alunoNome: ficha.nome || '', email, mesId,
    valor: cents(conta.total) / 100, soMensalidade: conta.soMensalidade, status: 'pendente',
    criadoEm: agora, expiraEm: pedidoMp.expiraEm, qrCode: qr.qrCode, qrCodeBase64: qr.qrCodeBase64, ticketUrl: qr.ticketUrl,
  };
  await repo.salvarCobranca(uid, nova);

  // A conta mudou (um consumo novo) ou o QR venceu: o QR antigo do mês é
  // cancelado no Mercado Pago, para o aluno não pagar o valor velho. Se o
  // cancelamento falhar e ele pagar mesmo assim, o webhook registra e a Gestão
  // avisa o coach (Pix para mês já pago).
  for (const velha of doMes.filter((c) => c.status === 'pendente')) {
    try { await mp.cancelarPagamento(velha.paymentId); } catch (e) {
      log.warn('Não deu para cancelar o Pix antigo.', { paymentId: velha.paymentId, erro: String((e as Error)?.message || e) });
    }
    await repo.atualizarCobranca(uid, velha.paymentId, { status: 'substituida' });
  }
  log.info('Pix gerado.', { alunoId: ficha.id, mesId, paymentId: nova.paymentId });
  return resposta(nova, false);
}

/* ================================================================== *
 * webhookMercadoPago
 * ================================================================== */

export interface ResultadoWebhook { status: number; resultado: string }

/**
 * Uma notificação do Mercado Pago. 200 quando não há nada a refazer (inclusive
 * "não é nosso" — senão o Mercado Pago reenvia para sempre); 401 sem assinatura
 * válida; o erro de rede ao consultar o pagamento SOBE (vira 500 e o Mercado
 * Pago tenta de novo mais tarde).
 *
 * A notificação é só um aviso: o que vale é o pagamento como a API do Mercado
 * Pago o devolve, consultado com o nosso token.
 */
export async function processarWebhook(
  req: { headers: Record<string, unknown>; query: Record<string, unknown>; corpo: unknown },
  deps: { repo: RepoPix; mp: ClienteMp; segredo: string; agora: number; ehCoach: (uid: string) => boolean; log?: Log },
): Promise<ResultadoWebhook> {
  const log = deps.log || SEM_LOG;
  const b = req.corpo as { data?: { id?: unknown } } | null;
  const idBruto = req.query['data.id'] ?? b?.data?.id;
  const idAssinado = typeof idBruto === 'string' || typeof idBruto === 'number' ? String(idBruto) : null;
  if (!assinaturaValida({ xSignature: req.headers['x-signature'], xRequestId: req.headers['x-request-id'], dataId: idAssinado, segredo: deps.segredo })) {
    log.warn('Webhook do Mercado Pago com assinatura inválida.', { temAssinatura: typeof req.headers['x-signature'] === 'string' });
    return { status: 401, resultado: 'assinatura inválida' };
  }
  if (!ehNotificacaoDePagamento(req.query, req.corpo)) return { status: 200, resultado: 'ignorado: não é pagamento' };
  const id = idDaNotificacao(req.query, req.corpo);
  if (!id) return { status: 200, resultado: 'ignorado: sem id de pagamento' };

  const pg = await deps.mp.buscarPagamento(id);
  const ref = lerReferencia(pg.external_reference);
  if (!ref || !deps.ehCoach(ref.uid)) return { status: 200, resultado: 'ignorado: pagamento de fora deste sistema' };

  let decisao = '';
  let cobranca: CobrancaPix | null = null;
  const r = await deps.repo.transicionar(ref.uid, id, (c) => {
    cobranca = c;
    if (c.alunoId !== ref.alunoId || c.mesId !== ref.mesId) {
      decisao = 'divergente';
      return c.status === 'divergente' ? null : { status: 'divergente', motivo: 'referência não confere com a cobrança', statusMp: String(pg.status ?? ''), avisarGestao: true };
    }
    const d = decidir(pg, c);
    decisao = d.acao;
    switch (d.acao) {
      case 'aprovar': return { status: 'aprovado', aprovadoEm: deps.agora, valorPago: d.valorPago, statusMp: 'approved', avisarGestao: true };
      case 'divergente': return c.status === 'divergente' ? null : { status: 'divergente', motivo: d.motivo, statusMp: String(pg.status ?? ''), valorPago: Number(pg.transaction_amount) || 0, avisarGestao: true };
      case 'estornar': return { status: 'estornado', statusMp: String(pg.status ?? ''), avisarGestao: true };
      case 'encerrar': return { status: d.status, statusMp: String(pg.status ?? '') };
      default: return null;
    }
  });
  if (!r.existe) {
    log.warn('Pagamento do Mercado Pago sem cobrança registrada.', { paymentId: id });
    return { status: 200, resultado: 'ignorado: cobrança desconhecida' };
  }
  const c = cobranca as CobrancaPix | null;
  if (decisao === 'aprovar' && r.mudou && c) {
    try { await deps.repo.marcarPagoNoPortal(c.email, c.mesId); } catch (e) {
      // O livro-caixa já diz "pago"; a Gestão republica o Portal ao aplicar a baixa.
      log.warn('Pix aprovado, mas o Portal não foi marcado agora.', { paymentId: id, erro: String((e as Error)?.message || e) });
    }
    log.info('Pix aprovado.', { paymentId: id, alunoId: c.alunoId, mesId: c.mesId });
    return { status: 200, resultado: 'aprovado' };
  }
  if (decisao === 'estornar' && r.mudou) log.warn('Pix ESTORNADO depois de aprovado — conferir na Gestão.', { paymentId: id });
  if (decisao === 'divergente' && r.mudou) log.warn('Pix com divergência — não aplicado.', { paymentId: id });
  return { status: 200, resultado: r.mudou ? decisao : `sem mudança (${decisao || 'nada'})` };
}
