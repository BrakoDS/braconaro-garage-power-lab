/**
 * O Pix dinâmico pelas portas de verdade, sem internet e sem Firebase:
 *
 *     npm run checar:pix        # roda este e o checar-pix
 *
 * O `checar-pix` prova a REGRA com o banco e o Mercado Pago de mentira. Este
 * prova a FIAÇÃO, com as peças reais conversando:
 *
 *   - um EXPRESS de verdade (express 4 + qs, o par do runtime das Functions)
 *     servindo `responderWebhook` — POSTs HTTP reais, com assinatura válida,
 *     inválida e ausente, id na query e no corpo, GET, retentativas, rajada;
 *   - o CLIENTE REAL do Mercado Pago (`clienteMercadoPago`) falando HTTP com um
 *     Mercado Pago falso local — caminhos, Bearer, X-Idempotency-Key, erro 500,
 *     tempo esgotado, e o token nunca no erro;
 *   - o ADAPTADOR REAL do Firestore (`repoFirestore`) sobre um Firestore em
 *     memória com transação serializada e `FieldPath` — caminhos, v1+v2,
 *     Portal inexistente.
 *
 * O emulador do Firestore (que precisa de Java) testaria o Firestore em si;
 * aqui o que se prova é que o nosso código usa a API dele do jeito certo.
 */
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import express = require('express');
import { FieldPath } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { COACH_UIDS, ehCoachPorUid } from './acesso';
import { executarGerarPix, responderWebhook, type DepsPix } from './pix-http';
import { clienteMercadoPago, repoFirestore } from './pix-firestore';
import type { CobrancaPix } from './pix';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}

const UID = COACH_UIDS[0];
const TOKEN = 'APP_USR-token-de-teste-NAO-VAZAR';
const SEGREDO = 'segredo-do-webhook';
const AGORA = Date.UTC(2026, 9, 9, 15);

/* ================================================================== *
 * Um Firestore em memória — só a parte da API que o adaptador usa
 * ================================================================== */

type Dados = Record<string, any>;
const naoAchou = () => Object.assign(new Error('5 NOT_FOUND: No document to update'), { code: 5 });

class MemDb {
  docs = new Map<string, Dados>();
  transacoes = 0;
  private fila: Promise<unknown> = Promise.resolve();

  private snap(path: string) {
    const d = this.docs.get(path);
    return { id: path.split('/').pop()!, exists: d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)) };
  }
  private atualizar(path: string, a: unknown, b?: unknown) {
    const atual = this.docs.get(path);
    if (atual === undefined) throw naoAchou();
    const novo = structuredClone(atual);
    if (a instanceof FieldPath) {
      const seg = (a as unknown as { segments: string[] }).segments;
      let alvo = novo;
      for (const s of seg.slice(0, -1)) alvo = (alvo[s] ??= {});
      alvo[seg[seg.length - 1]] = b;
    } else {
      for (const [k, v] of Object.entries(a as Dados)) {
        if (k.includes('.')) throw new Error(`campo com ponto num update de objeto: ${k}`);
        novo[k] = v;
      }
    }
    this.docs.set(path, novo);
  }
  doc(path: string): any {
    const db = this;
    return {
      path, id: path.split('/').pop(),
      get: async () => db.snap(path),
      set: async (d: Dados) => { db.docs.set(path, structuredClone(d)); },
      update: async (a: unknown, b?: unknown) => db.atualizar(path, a, b),
      collection: (nome: string) => db.collection(`${path}/${nome}`),
    };
  }
  collection(path: string): any {
    const db = this;
    const filhos = () => [...db.docs.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'));
    const consulta = (filtro: (d: Dados) => boolean) => ({
      get: async () => ({ docs: filhos().map((k) => db.snap(k)).filter((s) => filtro(s.data()!)) }),
    });
    return {
      doc: (id: string) => db.doc(`${path}/${id}`),
      where: (campo: string, op: string, v: unknown) => {
        if (op !== '==') throw new Error('só igualdade');
        return consulta((d) => d[campo] === v);
      },
      get: consulta(() => true).get,
    };
  }
  /** Serializa as transações, como o Firestore garante para o mesmo documento. */
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const vez = this.fila.then(async () => {
      this.transacoes++;
      const escritas: (() => void)[] = [];
      const tx = {
        get: async (ref: { path: string }) => this.snap(ref.path),
        update: (ref: { path: string }, d: Dados) => { escritas.push(() => this.atualizar(ref.path, d)); },
      };
      await new Promise((r) => setTimeout(r, 1));
      const r = await fn(tx);
      for (const w of escritas) w();
      return r;
    });
    this.fila = vez.catch(() => undefined);
    return vez;
  }
}

/* ================================================================== *
 * Um Mercado Pago falso, por HTTP
 * ================================================================== */

interface ChamadaMp { metodo: string; caminho: string; auth: string; chave: string; corpo: any }

function mercadoPagoFalso() {
  const pagamentos = new Map<string, Dados>();
  const porChave = new Map<string, string>();
  const chamadas: ChamadaMp[] = [];
  const modo = { erro500: false, atrasoMs: 0 };
  let seq = 7000;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let bruto = '';
    req.on('data', (c) => { bruto += c; });
    req.on('end', async () => {
      const corpo = bruto ? JSON.parse(bruto) : undefined;
      const caminho = (req.url || '').split('?')[0];
      chamadas.push({ metodo: req.method || '', caminho, auth: String(req.headers.authorization || ''), chave: String(req.headers['x-idempotency-key'] || ''), corpo });
      if (modo.atrasoMs) await new Promise((r) => setTimeout(r, modo.atrasoMs));
      const responder = (status: number, json: unknown) => { if (res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return responder(401, { message: 'invalid access token' });
      if (modo.erro500) return responder(500, { message: 'internal_error' });
      const m = /^\/v1\/payments(?:\/(\d+))?$/.exec(caminho);
      if (!m) return responder(404, { message: 'not found' });
      if (req.method === 'POST' && !m[1]) {
        const chave = String(req.headers['x-idempotency-key'] || '');
        if (!chave) return responder(400, { message: 'X-Idempotency-Key obrigatório' });
        let id = porChave.get(chave);
        if (!id) {
          id = String(++seq);
          porChave.set(chave, id);
          pagamentos.set(id, { id: Number(id), status: 'pending', transaction_amount: corpo.transaction_amount, currency_id: 'BRL', external_reference: corpo.external_reference });
        }
        return responder(201, { id: Number(id), status: 'pending', point_of_interaction: { transaction_data: { qr_code: `00020126-${id}`, qr_code_base64: `iVBORw0KG-${id}`, ticket_url: `https://mp.test/${id}` } } });
      }
      const p = m[1] ? pagamentos.get(m[1]) : undefined;
      if (!p) return responder(404, { message: 'Payment not found' });
      if (req.method === 'GET') return responder(200, p);
      if (req.method === 'PUT') { if (corpo?.status === 'cancelled') p.status = 'cancelled'; return responder(200, p); }
      return responder(405, {});
    });
  });
  return { server, pagamentos, chamadas, modo };
}

const ouvir = (s: Server): Promise<string> => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
const fechar = (s: Server): Promise<void> => new Promise((r) => s.close(() => r()));

function assinar(dataId: string, requestId: string, ts: string, segredo = SEGREDO): string {
  return `ts=${ts},v1=${createHmac('sha256', segredo).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')}`;
}

/* ================================================================== */

async function main(): Promise<void> {
  console.log('Pix dinâmico — fiação (Express, HTTP, adaptador do Firestore)');

  const db = new MemDb();
  // A Gestão v2 (meta + subcoleção), com uma ficha que só existe no blob v1 do meta.
  db.docs.set(`gestao/${UID}`, { schema: 2, alunos: [{ id: 'Leg09', nome: 'Legado', email: 'legado@box.com', mensalidade: '80', vencimento: '10' }] });
  db.docs.set(`gestao/${UID}/alunos/Ana01`, { nome: 'Ana Lima', email: 'Ana@Box.com', mensalidade: '150', vencimento: '5',
    consumos: [{ id: 'c1', nome: 'Gel', preco: 10, data: '2026-10-02', mesId: '2026-10' }] });
  db.docs.set(`gestao/${UID}/alunos/Bia02`, { nome: 'Bia', email: 'bia@box.com', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana01', escopo: 'tudo' } });
  db.docs.set(`gestao/${UID}/alunos/Rui03`, { nome: 'Rui', email: 'rui@box.com', mensalidade: '90', vencimento: '15' });
  db.docs.set('portal/ana@box.com', { nome: 'Ana Lima', pagamentos: { '2026-09': true } });

  const fichaAnaAntes = JSON.stringify(db.docs.get(`gestao/${UID}/alunos/Ana01`));
  const mp = mercadoPagoFalso();
  const baseMp = await ouvir(mp.server);
  const erros: string[] = [];
  const log = { info() {}, warn() {}, error(msg: string, extra?: object) { erros.push(`${msg} ${JSON.stringify(extra ?? {})}`); } };
  const deps = (o: { timeoutMs?: number } = {}): DepsPix => ({
    repo: repoFirestore(db as any), mp: clienteMercadoPago(TOKEN, { base: baseMp, timeoutMs: o.timeoutMs ?? 2000 }),
    agora: AGORA, ehCoach: ehCoachPorUid, log,
  });
  const comoAluno = (email: string, data: object = {}) => ({ auth: { uid: 'uid-' + email, token: { email } }, data });
  const codigo = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof HttpsError ? `${e.code}: ${e.message}` : `cru: ${String(e)}`; } };

  /* ---------- gerar: callable → serviço → Firestore + Mercado Pago (HTTP) ---------- */
  console.log('\n1. gerarPixCobranca pelas portas de verdade');
  const pix = await executarGerarPix(comoAluno('ana@box.com'), () => deps());
  const post = mp.chamadas.find((c) => c.metodo === 'POST')!;
  ok(pix.valor === 280 && pix.qrCode === `00020126-${pix.paymentId}` && pix.qrCodeBase64.startsWith('iVBOR'), `o QR volta do Mercado Pago (R$ ${pix.valor})`);
  ok(post.caminho === '/v1/payments' && post.auth === `Bearer ${TOKEN}` && post.chave.startsWith('gpl-pix-'), 'POST /v1/payments com Bearer e X-Idempotency-Key');
  ok(post.corpo.transaction_amount === 280 && post.corpo.payment_method_id === 'pix' && post.corpo.payer.email === 'ana@box.com'
    && post.corpo.external_reference === `gpl-pix|${UID}|Ana01|2026-10`, 'o corpo leva valor, Pix, pagador e a referência');
  const doc = db.docs.get(`gestao/${UID}/cobrancasPix/${pix.paymentId}`) as CobrancaPix | undefined;
  ok(doc?.status === 'pendente' && doc.alunoId === 'Ana01' && doc.valor === 280, 'o livro-caixa fica em gestao/{uid}/cobrancasPix/{paymentId}');

  const de_novo = await executarGerarPix(comoAluno('ana@box.com'), () => deps());
  ok(de_novo.reutilizado && de_novo.paymentId === pix.paymentId && mp.chamadas.filter((c) => c.metodo === 'POST').length === 1, 'segundo pedido: o mesmo QR, lido do Firestore (where alunoId ==)');

  const leg = await executarGerarPix(comoAluno('legado@box.com'), () => deps());
  ok(leg.valor === 80, 'ficha que só existe no blob v1 do meta também paga (v2 + v1)');

  ok((await codigo(executarGerarPix({ data: {} }, () => deps()))) .startsWith('unauthenticated'), 'sem login: HttpsError unauthenticated');
  ok((await codigo(executarGerarPix(comoAluno('bia@box.com'), () => deps()))).startsWith('failed-precondition: Sua conta é acertada por Ana Lima'), 'dependente: HttpsError com a mensagem para o aluno');

  mp.modo.erro500 = true;
  const fora = await codigo(executarGerarPix(comoAluno('rui@box.com'), () => deps()));
  mp.modo.erro500 = false;
  ok(fora.startsWith('unavailable') && !fora.includes(TOKEN), `Mercado Pago com 500: "${fora}"`);
  ok(![...db.docs.keys()].some((k) => k.includes('cobrancasPix') && (db.docs.get(k) as CobrancaPix).alunoId === 'Rui03'), 'e nada foi para o livro-caixa');

  const quebrado = await codigo(executarGerarPix(comoAluno('rui@box.com'), () => ({ ...deps(), repo: { ...deps().repo, alunoPorEmail: async () => { throw new Error(`falhou com ${TOKEN}`); } } })));
  ok(quebrado === 'internal: Não foi possível gerar o Pix agora.', 'erro inesperado: "internal" genérico para o aluno');
  ok(erros.some((e) => e.includes('gerarPixCobranca falhou')), 'e o detalhe vai só para o log');

  /* ---------- webhook: Express de verdade, HTTP de verdade ---------- */
  console.log('\n2. webhookMercadoPago por HTTP (Express 4 + qs)');
  const app = express();
  app.use(express.json());
  let depsWebhook = () => ({ ...deps(), segredo: SEGREDO });
  app.all('/webhookMercadoPago', (req, res) => responderWebhook(
    { method: req.method, headers: req.headers as Record<string, unknown>, query: req.query as Record<string, unknown>, body: req.body }, res, () => depsWebhook()));
  const servidor = createServer(app);
  const base = await ouvir(servidor);
  let rid = 0;
  const notificar = async (id: string, o: { assinatura?: string | null; soNoCorpo?: boolean; metodo?: string } = {}) => {
    const requestId = `req-${++rid}`;
    const ts = String(1760000000000 + rid);
    const sig = o.assinatura === undefined ? assinar(id, requestId, ts) : o.assinatura;
    const r = await fetch(`${base}/webhookMercadoPago${o.soNoCorpo ? '' : `?data.id=${id}&type=payment`}`, {
      method: o.metodo ?? 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, ...(sig === null ? {} : { 'x-signature': sig }) },
      body: o.metodo === 'GET' ? undefined : JSON.stringify({ action: 'payment.updated', api_version: 'v1', type: 'payment', data: { id }, live_mode: true }),
    });
    return { status: r.status, texto: await r.text() };
  };
  const cob = () => db.docs.get(`gestao/${UID}/cobrancasPix/${pix.paymentId}`) as CobrancaPix;

  const get = await notificar(pix.paymentId, { metodo: 'GET' });
  ok(get.status === 405, 'GET: 405');
  const sem = await notificar(pix.paymentId, { assinatura: null });
  const falsa = await notificar(pix.paymentId, { assinatura: assinar(pix.paymentId, 'outro', '1', 'segredo-errado') });
  const reaproveitada = await notificar(pix.paymentId, { assinatura: assinar('999', 'req-x', '1') });
  ok(sem.status === 401 && falsa.status === 401 && reaproveitada.status === 401, 'sem assinatura, assinatura falsa ou de outra notificação: 401');
  ok(!mp.chamadas.some((c) => c.metodo === 'GET'), 'e o Mercado Pago nem foi consultado');

  const pendente = await notificar(pix.paymentId);
  ok(pendente.status === 200 && pendente.texto.startsWith('sem mudança') && cob().status === 'pendente', 'assinado, pagamento ainda pendente: 200, nada muda');
  ok(mp.chamadas.some((c) => c.metodo === 'GET' && c.caminho === `/v1/payments/${pix.paymentId}` && c.auth === `Bearer ${TOKEN}`), 'o pagamento é relido no GET /v1/payments/{id}, com o nosso token');

  mp.pagamentos.get(pix.paymentId)!.status = 'approved';
  const aprov = await notificar(pix.paymentId);
  ok(aprov.status === 200 && aprov.texto === 'aprovado', `aprovado: 200 "${aprov.texto}"`);
  ok(cob().status === 'aprovado' && cob().avisarGestao === true && cob().valorPago === 280 && cob().aprovadoEm === AGORA, 'o livro-caixa aprova e liga avisarGestao (pela transação)');
  ok(JSON.stringify(db.docs.get('portal/ana@box.com')!.pagamentos) === JSON.stringify({ '2026-09': true, '2026-10': true }),
    'o Portal ganha outubro sem perder setembro (FieldPath, não o mapa inteiro)');
  ok(JSON.stringify(db.docs.get(`gestao/${UID}/alunos/Ana01`)) === fichaAnaAntes, 'a ficha da Ana NÃO foi tocada (a Gestão é local-first)');

  const retry = await Promise.all([notificar(pix.paymentId), notificar(pix.paymentId), notificar(pix.paymentId)]);
  ok(retry.every((r) => r.status === 200 && r.texto.startsWith('sem mudança')), 'três retentativas simultâneas: 200 "sem mudança"');

  // Rajada sobre um pagamento novo: cinco notificações ao mesmo tempo.
  const rui = await executarGerarPix(comoAluno('rui@box.com'), () => deps());
  mp.pagamentos.get(rui.paymentId)!.status = 'approved';
  const rajada = await Promise.all(Array.from({ length: 5 }, () => notificar(rui.paymentId)));
  ok(rajada.filter((r) => r.texto === 'aprovado').length === 1 && rajada.every((r) => r.status === 200), 'cinco notificações ao mesmo tempo: UMA aprovação (transação), todas 200');

  // Id só no corpo (sem query).
  const leg2 = db.docs.get(`gestao/${UID}/cobrancasPix/${leg.paymentId}`) as CobrancaPix;
  mp.pagamentos.get(leg.paymentId)!.status = 'approved';
  const soCorpo = await notificar(leg.paymentId, { soNoCorpo: true });
  ok(soCorpo.texto === 'aprovado' && leg2 !== undefined, 'id só no corpo da notificação: aprovado');
  ok(!db.docs.has('portal/legado@box.com'), 'aluno sem Portal publicado: aprova assim mesmo (NOT_FOUND engolido)');

  // O formato aninhado da query (parser com pontos) ainda acha o id.
  let respondido = { status: 0, corpo: '' };
  const resFalsa = { status: (s: number) => ({ send: (c: string) => { respondido = { status: s, corpo: c }; } }) };
  await responderWebhook({ method: 'POST', headers: { 'x-signature': assinar(rui.paymentId, 'rq', '5'), 'x-request-id': 'rq' }, query: { data: { id: rui.paymentId }, type: 'payment' }, body: {} }, resFalsa, () => depsWebhook());
  ok(respondido.status === 200 && respondido.corpo.startsWith('sem mudança'), 'query aninhada ({ data: { id } }): o id não se perde');

  // Mercado Pago fora ao consultar: 500 (ele reenvia depois), e o token não vaza no log.
  mp.modo.erro500 = true;
  const cai = await notificar(rui.paymentId);
  mp.modo.erro500 = false;
  ok(cai.status === 500 && cai.texto === 'erro ao processar', 'Mercado Pago com 500 na consulta: 500 para o Mercado Pago reenviar');
  const doWebhook = erros.filter((e) => e.startsWith('webhookMercadoPago falhou'));
  ok(doWebhook.length > 0 && doWebhook.every((e) => !e.includes(TOKEN) && e.includes('→ 500')), 'o erro do cliente HTTP diz o status, nunca o token', doWebhook.join(' | '));

  // Tempo esgotado na consulta.
  mp.modo.atrasoMs = 500;
  depsWebhook = () => ({ ...deps({ timeoutMs: 100 }), segredo: SEGREDO });
  const lento = await notificar(rui.paymentId);
  mp.modo.atrasoMs = 0;
  ok(lento.status === 500, 'Mercado Pago lento (passou do tempo): 500, sem pendurar a função');

  // Segredo não configurado no servidor: tudo 401 (nunca aceitar sem conferir).
  depsWebhook = () => ({ ...deps(), segredo: '' });
  ok((await notificar(rui.paymentId)).status === 401, 'segredo do webhook vazio no servidor: 401 para tudo');

  ok(db.transacoes >= 9, `as aprovações passaram por transação (${db.transacoes})`);

  await fechar(servidor);
  await fechar(mp.server);
  console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ Fiação do Pix conferida.');
  process.exitCode = falhas ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
