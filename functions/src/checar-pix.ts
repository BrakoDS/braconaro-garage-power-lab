/**
 * Confere o Pix dinâmico sem rede e sem gastar um centavo:
 *
 *     npm run checar:pix
 *
 *  1. A CONTA: o porte em TypeScript (`pix.ts`) contra o código de verdade da
 *     Gestão (`contaDoMes` em financeiro-aluno.js) e do Portal (`mesDaCobranca`
 *     em compartilhado/regras/cobranca.js), lado a lado, em milhares de boxes
 *     sorteados (semente fixa). Se a Gestão mudar a regra e o porte não, falha.
 *  2. A ASSINATURA do webhook, com o HMAC recalculado aqui.
 *  3. GERAR o Pix, com o banco e o Mercado Pago em memória: quem pode, quanto,
 *     reuso do QR, dois toques, conta que mudou, mês já pago.
 *  4. O WEBHOOK: aprovação, retentativas do Mercado Pago, notificações ao mesmo
 *     tempo, transação refeita, divergência, estorno, pagamento de fora.
 */
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assinaturaValida, contaDoMes, dataMp, decidir, diaSaoPaulo, lerReferencia, mesDaCobranca, montarPedidoPix,
  PIX_JANELA_MIN, PIX_VALIDADE_MIN, type CobrancaPix, type Ficha, type PedidoPix,
} from './pix';
import { ErroPix, gerarPix, processarWebhook, type ClienteMp, type RepoPix } from './pix-servico';
import { normalizarEmail } from './acesso';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`);
  }
}
const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Gerador com semente (mulberry32): a mesma semente, a mesma sequência. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `import()` de verdade (o tsc em commonjs trocaria por `require`). */
const importar = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, any>>;
const RAIZ = join(__dirname, '..', '..');
const js = (rel: string) => importar(pathToFileURL(join(RAIZ, rel)).href);

/* ================================================================== */

async function conta(): Promise<void> {
  console.log('\n1. A conta do Pix é a conta da Gestão (porte × original)');
  const fin = await js('coach/gestao-de-alunos/financeiro-aluno.js');
  const cob = await js('compartilhado/regras/cobranca.js');
  const portal = await js('coach/gestao-de-alunos/portal-sync.js');
  const r = mulberry32(2026);
  const pick = <T>(l: T[]): T => l[Math.floor(r() * l.length)];
  const MESES = ['2026-09', '2026-10', '2026-11'];
  let casos = 0, divergencias = 0, comDependente = 0, comParceria = 0, comConsumo = 0, mesesComparados = 0, primeira = '';
  for (let i = 0; i < 3000; i++) {
    const n = 1 + Math.floor(r() * 6);
    const todos: Ficha[] = Array.from({ length: n }, (_, k) => {
      const f: Ficha = { id: 'A' + k, nome: 'Aluno ' + k, email: `a${k}@box.com`,
        mensalidade: pick(['150', '120', '89,91', '', '200.5', 'abc', 0]), vencimento: pick(['5', '10', '20', '', '31']) };
      if (r() < 0.3) f.parceria = { nome: 'P', percentual: pick([10, 25, 50, 100, '50', 0]) };
      if (r() < 0.15) f.status = 'inativo';
      if (r() < 0.3) f.pagamentos = { [pick(MESES)]: true };
      f.consumos = Array.from({ length: Math.floor(r() * 4) }, (_, j) => ({ id: 'c' + j, nome: pick(['Gel', 'Água']), preco: pick([9.99, 5, '10', 60, 0]), data: `2026-10-0${1 + j}`, mesId: pick(MESES) }));
      return f;
    });
    for (const f of todos) if (r() < 0.35) f.pagoPor = { id: pick([...todos.map((x) => x.id), 'Saiu']), escopo: pick(['tudo', 'plano', '']) };
    for (const f of todos) {
      for (const mesId of MESES) {
        casos++;
        const a = contaDoMes(f, mesId, todos);
        const b = fin.contaDoMes(f, mesId, todos);
        const esperado = { total: b.conta.total, soMensalidade: !b.conta.dependentes.length && !(b.conta.propria.extras > 0), resp: b.resp ? b.resp.id : null };
        const obtido = { total: a.total, soMensalidade: a.soMensalidade, resp: a.responsavel ? a.responsavel.id : null };
        if (!igual(obtido, esperado)) { divergencias++; primeira ||= `${JSON.stringify(f)} ${mesId}: ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`; }
        if (b.conta.dependentes.length) comDependente++;
        if (f.parceria) comParceria++;
        if (b.conta.propria.extras > 0) comConsumo++;
      }
      // O mês que o aluno paga: o porte × o Portal, onde os dois veem o mesmo box
      // (sem vínculo órfão, sem inativo, escopo válido — fora disso a fatia do
      // Portal e a Gestão já divergem, ver functions/README.md).
      const limpo = todos.every((x) => (x.status || 'ativo') !== 'inativo'
        && (!x.pagoPor || (todos.some((y) => y.id === x.pagoPor!.id) && (x.pagoPor.escopo === 'tudo' || x.pagoPor.escopo === 'plano'))));
      if (limpo) {
        for (const hoje of ['2026-10-05', '2026-10-27', '2026-10-28', '2026-10-31']) {
          mesesComparados++;
          const a = mesDaCobranca(f, hoje, todos);
          const b = cob.mesDaCobranca(portal.fatia(f, todos), hoje);
          if (a !== b) { divergencias++; primeira ||= `mesDaCobranca ${f.id} ${hoje}: ${a} ≠ ${b}`; }
        }
      }
    }
  }
  ok(divergencias === 0, `${casos} contas e ${mesesComparados} meses de cobrança idênticos ao código da Gestão e do Portal`, primeira);
  ok(comDependente > 500 && comParceria > 1000 && comConsumo > 1000 && mesesComparados > 500,
    `cobertura: ${comDependente} com dependente, ${comParceria} com parceria, ${comConsumo} com consumo`);
  ok(diaSaoPaulo(new Date('2026-10-10T02:30:00Z')) === '2026-10-09', 'o dia é o de São Paulo (02:30 UTC ainda é dia 9 lá)');
}

/* ================================================================== */

const SEGREDO = 'segredo-de-teste';
function assinar(dataId: string | null, requestId: string | null, ts: string, segredo = SEGREDO): string {
  let m = '';
  if (dataId) m += `id:${dataId.toLowerCase()};`;
  if (requestId) m += `request-id:${requestId};`;
  m += `ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', segredo).update(m).digest('hex')}`;
}

function assinatura(): void {
  console.log('\n2. A assinatura do webhook (x-signature)');
  const ok1 = assinaturaValida({ xSignature: assinar('123', 'req-1', '1742505638683'), xRequestId: 'req-1', dataId: '123', segredo: SEGREDO });
  ok(ok1, 'a assinatura certa passa (manifesto id:…;request-id:…;ts:…;)');
  ok(assinaturaValida({ xSignature: assinar('123', null, '9'), xRequestId: undefined, dataId: '123', segredo: SEGREDO }), 'sem x-request-id, a chave sai do manifesto');
  ok(assinaturaValida({ xSignature: assinar('123', 'r', '9').toUpperCase().replace('TS=', 'ts=').replace('V1=', 'v1='), xRequestId: 'r', dataId: '123', segredo: SEGREDO }), 'hash em maiúsculas também vale');
  ok(assinaturaValida({ xSignature: ` ts=9 , v1=${assinar('123', 'r', '9').split('v1=')[1]} `, xRequestId: 'r', dataId: '123', segredo: SEGREDO }), 'espaços em volta das partes não atrapalham');
  const negar: [string, Parameters<typeof assinaturaValida>[0]][] = [
    ['outro pagamento', { xSignature: assinar('123', 'r', '9'), xRequestId: 'r', dataId: '124', segredo: SEGREDO }],
    ['outro request-id', { xSignature: assinar('123', 'r', '9'), xRequestId: 'x', dataId: '123', segredo: SEGREDO }],
    ['outra chave secreta', { xSignature: assinar('123', 'r', '9', 'outra'), xRequestId: 'r', dataId: '123', segredo: SEGREDO }],
    ['ts trocado', { xSignature: assinar('123', 'r', '9').replace('ts=9', 'ts=10'), xRequestId: 'r', dataId: '123', segredo: SEGREDO }],
    ['sem cabeçalho', { xSignature: undefined, xRequestId: 'r', dataId: '123', segredo: SEGREDO }],
    ['cabeçalho lixo', { xSignature: 'ts=,v1=zz', xRequestId: 'r', dataId: '123', segredo: SEGREDO }],
    ['hash curto', { xSignature: 'ts=9,v1=abcd', xRequestId: 'r', dataId: '123', segredo: SEGREDO }],
    ['segredo não configurado', { xSignature: assinar('123', 'r', '9', ''), xRequestId: 'r', dataId: '123', segredo: '' }],
  ];
  for (const [nome, p] of negar) ok(!assinaturaValida(p), `recusa: ${nome}`);
}

/* ================================================================== */

function pedido(): void {
  console.log('\n3a. O pedido ao Mercado Pago');
  const base = Date.UTC(2026, 9, 9, 15, 0, 0);
  const p = (agora: number, valor = 270) => montarPedidoPix({ uid: 'C1', alunoId: 'Ana01', mesId: '2026-10', valor, email: 'ana@box.com', soMensalidade: false, agora });
  const a = p(base), b = p(base + 29 * 60_000), c = p(base + 30 * 60_000);
  ok(a.chaveIdempotencia === b.chaveIdempotencia && igual(a.corpo, b.corpo), 'dois toques na mesma janela: mesma chave e mesmo corpo (o Mercado Pago devolve o mesmo pagamento)');
  ok(a.chaveIdempotencia !== c.chaveIdempotencia, 'janela seguinte: chave nova');
  ok(a.chaveIdempotencia !== p(base, 280).chaveIdempotencia, 'valor diferente: chave nova');
  let minimo = Infinity;
  for (let t = base; t < base + PIX_JANELA_MIN * 60_000; t += 60_000) minimo = Math.min(minimo, p(t).expiraEm - t);
  ok(minimo >= 30 * 60_000 && minimo <= PIX_VALIDADE_MIN * 60_000, `o QR vale no mínimo 30 min em qualquer ponto da janela (${minimo / 60_000} min)`);
  ok(a.corpo.transaction_amount === 270 && a.corpo.payment_method_id === 'pix' && a.corpo.payer.email === 'ana@box.com', 'valor, Pix e pagador');
  ok(a.corpo.description === 'Garage Power Lab · Conta de Outubro / 2026', `descrição (${a.corpo.description})`);
  ok(!('notification_url' in a.corpo), 'sem notification_url: o webhook é o do painel, o único com assinatura garantida');
  ok(igual(lerReferencia(a.corpo.external_reference), { uid: 'C1', alunoId: 'Ana01', mesId: '2026-10' }), 'a referência volta inteira');
  ok(lerReferencia('outra-coisa') === null && lerReferencia('gpl-pix|C1|A|2026-13') === null && lerReferencia(42) === null, 'referência de fora (ou mês inválido) não é nossa');
  ok(p(base, 89.905).corpo.transaction_amount === 89.91 || p(base, 89.905).corpo.transaction_amount === 89.9, 'valor em centavos (nunca 3 casas)');
  ok(dataMp(Date.UTC(2026, 9, 9, 18, 0, 0)) === '2026-10-09T15:00:00.000-03:00', 'a data no formato do Mercado Pago, em Brasília');
}

function decisoes(): void {
  console.log('\n3b. O que fazer com cada pagamento');
  const c: CobrancaPix = { paymentId: '1', alunoId: 'A', alunoNome: 'A', email: 'a@b.c', mesId: '2026-10', valor: 150, soMensalidade: true,
    status: 'pendente', criadoEm: 0, expiraEm: 0, qrCode: 'q', qrCodeBase64: 'b', ticketUrl: '' };
  ok(igual(decidir({ status: 'approved', transaction_amount: 150, currency_id: 'BRL' }, c), { acao: 'aprovar', valorPago: 150 }), 'aprovado com o valor certo: aprova');
  ok(decidir({ status: 'approved', transaction_amount: 150 }, { ...c, status: 'aprovado' }).acao === 'ja-aprovado', 'já aprovado: nada de novo');
  ok(decidir({ status: 'approved', transaction_amount: 149.99 }, c).acao === 'divergente', 'um centavo a menos: divergente');
  ok(decidir({ status: 'approved', transaction_amount: 150, currency_id: 'USD' }, c).acao === 'divergente', 'outra moeda: divergente');
  ok(decidir({ status: 'approved', transaction_amount: 150 }, { ...c, status: 'substituida' }).acao === 'aprovar', 'QR antigo pago mesmo assim: o dinheiro entrou, aprova (a Gestão avisa se o mês já estava pago)');
  ok(decidir({ status: 'pending' }, c).acao === 'nada', 'pendente: espera');
  ok(decidir({ status: 'refunded' }, { ...c, status: 'aprovado' }).acao === 'estornar', 'devolvido depois de aprovado: estorno');
  ok(decidir({ status: 'refunded' }, c).acao === 'nada', 'devolvido sem nunca ter aprovado: nada');
  ok(igual(decidir({ status: 'cancelled' }, c), { acao: 'encerrar', status: 'cancelado' }), 'cancelado/expirado: encerra');
  ok(decidir({ status: 'cancelled' }, { ...c, status: 'aprovado' }).acao === 'nada', 'cancelamento atrasado não desfaz aprovação');
}

/* ================================================================== */

/** O banco em memória: o mesmo contrato do Firestore, com transação serializada. */
function bancoFalso(todos: Ficha[], opcoes: { refazerTransacao?: boolean } = {}) {
  const UID = 'C1';
  const cobrancas = new Map<string, CobrancaPix>();
  /** Cobranças guardadas sob OUTRO uid (gestao/{outro}/cobrancasPix): o servidor nunca deve tocá-las. */
  const deOutroUid = new Map<string, Map<string, CobrancaPix>>();
  const doUid = (uid: string) => (uid === UID ? cobrancas : (deOutroUid.get(uid) || new Map<string, CobrancaPix>()));
  const portal = new Map<string, Record<string, boolean>>();
  const escritasPortal: string[] = [];
  let fila: Promise<unknown> = Promise.resolve();
  const repo: RepoPix = {
    async alunoPorEmail(email) {
      const ficha = todos.find((f) => normalizarEmail(f.email) === email);
      return ficha ? { uid: UID, ficha: structuredClone(ficha), todos: structuredClone(todos) } : null;
    },
    async alunoPorId(uid, id) {
      const ficha = uid === UID ? todos.find((f) => f.id === id) : undefined;
      return ficha ? { uid, ficha: structuredClone(ficha), todos: structuredClone(todos) } : null;
    },
    async cobrancasDoAluno(uid, alunoId) { return [...doUid(uid).values()].filter((c) => c.alunoId === alunoId).map((c) => structuredClone(c)); },
    async salvarCobranca(uid, c) { doUid(uid).set(c.paymentId, structuredClone(c)); },
    async atualizarCobranca(uid, id, campos) { const m = doUid(uid); const c = m.get(id); if (c) m.set(id, { ...c, ...campos }); },
    transicionar(uid, id, fn) {
      const vez = fila.then(async () => {
        await new Promise((r) => setTimeout(r, 0));
        const m = doUid(uid);
        const c = m.get(id);
        if (!c) return { existe: false, mudou: false };
        // Disputa simulada: o Firestore pode rodar a função de novo.
        if (opcoes.refazerTransacao) fn(structuredClone(c));
        const patch = fn(structuredClone(c));
        if (!patch) return { existe: true, mudou: false };
        m.set(id, { ...c, ...patch });
        return { existe: true, mudou: true };
      });
      fila = vez.catch(() => undefined);
      return vez;
    },
    async marcarPagoNoPortal(email, mesId) {
      escritasPortal.push(`${email}:${mesId}`);
      portal.set(email, { ...(portal.get(email) || {}), [mesId]: true });
    },
  };
  return { repo, cobrancas, deOutroUid, portal, escritasPortal, UID };
}

/** O Mercado Pago em memória, com a idempotência pela chave. */
function mercadoPagoFalso() {
  const pagamentos = new Map<string, Record<string, unknown>>();
  const porChave = new Map<string, string>();
  const chamadas: string[] = [];
  let seq = 1000, falharCriar = false, falharBuscar = false;
  const mp: ClienteMp = {
    async criarPix(p: PedidoPix) {
      chamadas.push(`criar:${p.corpo.transaction_amount}`);
      if (falharCriar) throw new Error('Mercado Pago POST /v1/payments → 500: fora');
      const ja = porChave.get(p.chaveIdempotencia);
      const id = ja || String(++seq);
      if (!ja) {
        porChave.set(p.chaveIdempotencia, id);
        pagamentos.set(id, { id: Number(id), status: 'pending', transaction_amount: p.corpo.transaction_amount, currency_id: 'BRL', external_reference: p.corpo.external_reference });
      }
      return { id: Number(id), status: 'pending', point_of_interaction: { transaction_data: { qr_code: `000201-${id}`, qr_code_base64: `iVBOR-${id}`, ticket_url: `https://mp/${id}` } } };
    },
    async buscarPagamento(id) {
      chamadas.push(`buscar:${id}`);
      if (falharBuscar) throw new Error('Mercado Pago GET → 503');
      const p = pagamentos.get(id);
      if (!p) throw new Error('Mercado Pago GET → 404');
      return { ...p };
    },
    async cancelarPagamento(id) { chamadas.push(`cancelar:${id}`); const p = pagamentos.get(id); if (p) p.status = 'cancelled'; },
  };
  return {
    mp, pagamentos, chamadas,
    falhar: (o: { criar?: boolean; buscar?: boolean }) => { falharCriar = !!o.criar; falharBuscar = !!o.buscar; },
    pagar: (id: string, valor?: number) => { const p = pagamentos.get(id)!; p.status = 'approved'; if (valor !== undefined) p.transaction_amount = valor; },
  };
}

/** Um box pequeno, em 09/10/2026: Ana paga a conta da Bia; Gil sem e-mail; Duda cortesia. */
function boxDeTeste(): Ficha[] {
  return [
    { id: 'Ana01', nome: 'Ana Lima', email: 'Ana@Box.com', mensalidade: '150', vencimento: '5',
      consumos: [{ id: 'c1', nome: 'Gel', preco: 10, data: '2026-10-02', mesId: '2026-10' }] },
    { id: 'Bia02', nome: 'Bia Souza', email: 'bia@box.com', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana01', escopo: 'tudo' } },
    { id: 'Gil03', nome: 'Gil', mensalidade: '100', vencimento: '5' },
    { id: 'Duda04', nome: 'Duda', email: 'duda@box.com', mensalidade: '150', parceria: { nome: 'Atleta', percentual: 100 } },
    { id: 'Edu05', nome: 'Edu', email: 'edu@box.com', mensalidade: '200', vencimento: '20', pagamentos: { '2026-10': true } },
    { id: 'Caio06', nome: 'Caio', email: 'caio@box.com', mensalidade: '90', status: 'inativo' },
  ];
}

const AGORA = Date.UTC(2026, 9, 9, 15, 0, 0); // 09/10/2026, 12h em Brasília
const ehCoach = (uid: string) => uid === 'C1';
async function erro(p: Promise<unknown>): Promise<string> {
  try { await p; return 'sem erro'; } catch (e) { return e instanceof ErroPix ? `${e.codigo}: ${e.message}` : `inesperado: ${String(e)}`; }
}

async function gerar(): Promise<void> {
  console.log('\n3c. Gerar o Pix (gerarPixCobranca)');
  const todos = boxDeTeste();
  const banco = bancoFalso(todos);
  const mpf = mercadoPagoFalso();
  const deps = (agora = AGORA) => ({ repo: banco.repo, mp: mpf.mp, agora, ehCoach });
  const aluno = (email: string, extra: object = {}) => ({ uid: 'U-' + email, email, ...extra });

  const r1 = await gerarPix(aluno('ana@box.com'), deps());
  ok(r1.valor === 280 && r1.mesId === '2026-10' && !r1.reutilizado, `Ana paga a conta dela + a da Bia + o gel: R$ ${r1.valor} de ${r1.mesId}`);
  ok(r1.qrCode.startsWith('000201') && r1.qrCodeBase64.startsWith('iVBOR'), 'devolve o qr_code e o qr_code_base64');
  const salva = banco.cobrancas.get(r1.paymentId);
  ok(salva?.status === 'pendente' && salva.alunoId === 'Ana01' && salva.email === 'ana@box.com' && salva.valor === 280, 'a cobrança fica no livro-caixa, pendente');

  const r2 = await gerarPix(aluno('ana@box.com'), deps(AGORA + 5 * 60_000));
  ok(r2.paymentId === r1.paymentId && r2.reutilizado && mpf.chamadas.filter((c) => c.startsWith('criar')).length === 1, 'reabrir a tela: o mesmo QR, sem chamar o Mercado Pago de novo');

  const [r3, r4] = await Promise.all([gerarPix(aluno('bia@box.com'), deps()).catch((e) => e), gerarPix(aluno('bia@box.com'), deps()).catch((e) => e)]);
  ok(r3 instanceof ErroPix && r4 instanceof ErroPix && /acertada por Ana Lima/.test(r3.message), `dependente: "${(r3 as Error).message}"`);

  // Dois toques AO MESMO TEMPO, para quem paga a própria conta.
  todos.push({ id: 'Rui07', nome: 'Rui', email: 'rui@box.com', mensalidade: '90', vencimento: '15' });
  const [x, y] = await Promise.all([gerarPix(aluno('rui@box.com'), deps()), gerarPix(aluno('rui@box.com'), deps())]);
  ok(x.paymentId === y.paymentId && [...banco.cobrancas.values()].filter((c) => c.alunoId === 'Rui07').length === 1,
    'dois toques simultâneos: a chave de idempotência dá o MESMO pagamento, uma cobrança só');

  // Um consumo novo muda a conta: QR novo, e o antigo é cancelado no Mercado Pago.
  todos[0].consumos!.push({ id: 'c2', nome: 'Água', preco: 5, data: '2026-10-08', mesId: '2026-10' });
  const r5 = await gerarPix(aluno('ana@box.com'), deps(AGORA + 6 * 60_000));
  ok(r5.valor === 285 && r5.paymentId !== r1.paymentId, `conta mudou: QR novo de R$ ${r5.valor}`);
  ok(banco.cobrancas.get(r1.paymentId)?.status === 'substituida' && mpf.pagamentos.get(r1.paymentId)?.status === 'cancelled', 'o QR antigo é cancelado no Mercado Pago e fica "substituída"');

  // O QR venceu: outro.
  const r6 = await gerarPix(aluno('ana@box.com'), deps(AGORA + 3 * 3600_000));
  ok(r6.paymentId !== r5.paymentId && !r6.reutilizado && banco.cobrancas.get(r5.paymentId)?.status === 'substituida', 'QR vencido: um novo, e o vencido sai de cena');

  ok(/already|já está paga/.test(await erro(gerarPix(aluno('edu@box.com'), deps()))), 'mês já pago na ficha: recusado');
  ok(/nada a pagar/.test(await erro(gerarPix(aluno('duda@box.com'), deps()))), 'cortesia de 100%: nada a pagar');
  ok(/inativa/.test(await erro(gerarPix(aluno('caio@box.com'), deps()))), 'matrícula inativa: recusado');
  ok(/^not-found/.test(await erro(gerarPix(aluno('ninguem@box.com'), deps()))), 'e-mail fora da Gestão: not-found');
  ok(/^unauthenticated/.test(await erro(gerarPix({ email: 'ana@box.com' }, deps()))), 'sem login: unauthenticated');
  ok(/^permission-denied/.test(await erro(gerarPix(aluno('ana@box.com', { alunoId: 'Rui07' }), deps()))), 'aluno pedindo a conta de OUTRO aluno: permission-denied');
  ok(/^invalid-argument/.test(await erro(gerarPix(aluno('ana@box.com', { mesId: '2026-13' }), deps()))), 'mês inválido: recusado');
  ok(/ainda não abriu/.test(await erro(gerarPix(aluno('ana@box.com', { mesId: '2027-01' }), deps()))), 'mês do futuro: recusado');
  const set = await gerarPix(aluno('ana@box.com', { mesId: '2026-09' }), deps());
  ok(set.mesId === '2026-09' && set.valor === 270, `mês anterior em aberto pode ser pago (R$ ${set.valor})`);

  // O coach gera para um aluno; e para quem não tem e-mail, o Mercado Pago não aceita.
  const coach = await gerarPix({ uid: 'C1', alunoId: 'Rui07' }, deps());
  ok(coach.paymentId === x.paymentId && coach.reutilizado, 'o coach, com alunoId, recebe o mesmo QR válido do aluno');
  ok(/e-mail/.test(await erro(gerarPix({ uid: 'C1', alunoId: 'Gil03' }, deps()))), 'ficha sem e-mail: o coach é avisado');
  ok(/^not-found/.test(await erro(gerarPix({ uid: 'C1', alunoId: 'NaoExiste' }, deps()))), 'coach, aluno que não existe: not-found');

  // Do dia 28 em diante, com o mês pago, o Pix é do mês seguinte.
  todos.push({ id: 'Lia08', nome: 'Lia', email: 'lia@box.com', mensalidade: '100', vencimento: '10', pagamentos: { '2026-10': true } });
  const lia = await gerarPix(aluno('lia@box.com'), deps(Date.UTC(2026, 9, 28, 15)));
  ok(lia.mesId === '2026-11', `dia 28 com outubro pago: o Pix é de ${lia.mesId}`);

  // Mercado Pago fora do ar: erro claro, nada gravado.
  const antes = banco.cobrancas.size;
  mpf.falhar({ criar: true });
  todos.push({ id: 'Tom09', nome: 'Tom', email: 'tom@box.com', mensalidade: '100', vencimento: '10' });
  ok(/^unavailable/.test(await erro(gerarPix(aluno('tom@box.com'), deps()))) && banco.cobrancas.size === antes, 'Mercado Pago fora: "tente de novo", nada no livro-caixa');
  mpf.falhar({});

  todos.push({ id: 'Max10', nome: 'Max', email: 'max@box.com', mensalidade: '9999', vencimento: '10' });
  ok(/conferido pelo coach/.test(await erro(gerarPix(aluno('max@box.com'), deps()))), 'valor absurdo (cadastro errado): não gera');
}

async function webhook(): Promise<void> {
  console.log('\n4. O webhook (webhookMercadoPago)');
  const todos = boxDeTeste();
  const banco = bancoFalso(todos);
  const mpf = mercadoPagoFalso();
  const gDeps = { repo: banco.repo, mp: mpf.mp, agora: AGORA, ehCoach };
  const wDeps = (extra: object = {}) => ({ repo: banco.repo, mp: mpf.mp, segredo: SEGREDO, agora: AGORA + 60_000, ehCoach, ...extra });
  let req = 0;
  const notificar = (id: string, o: { assinatura?: string | null; viaCorpo?: boolean; tipo?: string } = {}) => {
    const rid = `req-${++req}`;
    const sig = o.assinatura === undefined ? assinar(id, rid, String(1700000000 + req)) : o.assinatura;
    return {
      headers: { 'x-request-id': rid, ...(sig === null ? {} : { 'x-signature': sig }) } as Record<string, unknown>,
      query: (o.viaCorpo ? {} : { 'data.id': id, type: o.tipo ?? 'payment' }) as Record<string, unknown>,
      corpo: { action: `${o.tipo ?? 'payment'}.updated`, type: o.tipo ?? 'payment', data: { id } },
    };
  };

  const pix = await gerarPix({ uid: 'U', email: 'ana@box.com' }, gDeps);
  const id = pix.paymentId;

  const semAss = await processarWebhook(notificar(id, { assinatura: null }), wDeps());
  const errada = await processarWebhook(notificar(id, { assinatura: assinar(id, 'outra', '1', 'chave-errada') }), wDeps());
  ok(semAss.status === 401 && errada.status === 401 && !mpf.chamadas.some((c) => c.startsWith('buscar')), 'sem assinatura ou assinatura falsa: 401, e o Mercado Pago nem é consultado');

  const pend = await processarWebhook(notificar(id), wDeps());
  ok(pend.status === 200 && banco.cobrancas.get(id)?.status === 'pendente', 'aviso de "pagamento criado" (ainda pendente): nada muda');

  mpf.pagar(id);
  const aprov = await processarWebhook(notificar(id), wDeps());
  const c = banco.cobrancas.get(id)!;
  ok(aprov.status === 200 && aprov.resultado === 'aprovado' && c.status === 'aprovado' && c.aprovadoEm === AGORA + 60_000 && c.valorPago === 280 && c.avisarGestao === true,
    `aprovado: o livro-caixa registra (${aprov.resultado}, R$ ${c.valorPago})`);
  ok(igual(banco.portal.get('ana@box.com'), { '2026-10': true }), 'e o Portal da Ana já mostra outubro pago');

  // As retentativas do Mercado Pago (ele reenvia até receber 200 — e às vezes depois).
  const retry = [];
  for (let i = 0; i < 3; i++) retry.push(await processarWebhook(notificar(id), wDeps({ agora: AGORA + 3600_000 })));
  ok(retry.every((r) => r.status === 200 && r.resultado.startsWith('sem mudança')), 'três retentativas: 200, "sem mudança"');
  ok(banco.cobrancas.get(id)!.aprovadoEm === AGORA + 60_000 && banco.escritasPortal.length === 1, 'a aprovação não é regravada nem o Portal marcado de novo');

  // Cinco notificações AO MESMO TEMPO para um pagamento novo.
  todos.push({ id: 'Rui07', nome: 'Rui', email: 'rui@box.com', mensalidade: '90', vencimento: '15' });
  const rui = await gerarPix({ uid: 'U', email: 'rui@box.com' }, gDeps);
  mpf.pagar(rui.paymentId);
  const juntos = await Promise.all(Array.from({ length: 5 }, () => processarWebhook(notificar(rui.paymentId), wDeps())));
  ok(juntos.filter((r) => r.resultado === 'aprovado').length === 1 && juntos.every((r) => r.status === 200), 'cinco notificações simultâneas: UMA aprovação, todas 200');

  // A transação refeita pelo Firestore (disputa) não aprova duas vezes.
  const banco2 = bancoFalso(todos, { refazerTransacao: true });
  const mp2 = mercadoPagoFalso();
  const p2 = await gerarPix({ uid: 'U', email: 'rui@box.com' }, { ...gDeps, repo: banco2.repo, mp: mp2.mp });
  mp2.pagar(p2.paymentId);
  const t1 = await processarWebhook(notificar(p2.paymentId), { ...wDeps(), repo: banco2.repo, mp: mp2.mp });
  const t2 = await processarWebhook(notificar(p2.paymentId), { ...wDeps(), repo: banco2.repo, mp: mp2.mp });
  ok(t1.resultado === 'aprovado' && t2.resultado.startsWith('sem mudança') && banco2.escritasPortal.length === 1, 'transação refeita: a função é pura, uma aprovação só');

  // Depois de pago por Pix, o mesmo mês não gera outro Pix (mesmo antes de o coach abrir a Gestão).
  ok(/já foi paga por Pix/.test(await erro(gerarPix({ uid: 'U', email: 'ana@box.com' }, gDeps))), 'mês pago por Pix: um segundo Pix é recusado');

  // Corpo sem query (o id só no corpo) também funciona — e a assinatura usa esse id.
  todos.push({ id: 'Val08', nome: 'Val', email: 'val@box.com', mensalidade: '70', vencimento: '15' });
  const val = await gerarPix({ uid: 'U', email: 'val@box.com' }, gDeps);
  mpf.pagar(val.paymentId);
  ok((await processarWebhook(notificar(val.paymentId, { viaCorpo: true }), wDeps())).resultado === 'aprovado', 'id só no corpo da notificação: aprovado');

  // Valor diferente do cobrado: não aplica, marca para o coach.
  todos.push({ id: 'Div09', nome: 'Div', email: 'div@box.com', mensalidade: '100', vencimento: '15' });
  const div = await gerarPix({ uid: 'U', email: 'div@box.com' }, gDeps);
  mpf.pagar(div.paymentId, 99.99);
  const rdiv = await processarWebhook(notificar(div.paymentId), wDeps());
  ok(banco.cobrancas.get(div.paymentId)?.status === 'divergente' && banco.cobrancas.get(div.paymentId)?.avisarGestao === true && !banco.portal.has('div@box.com') && rdiv.status === 200, 'valor pago ≠ cobrado: "divergente", sem baixa e sem Portal');

  // Estorno depois de aprovado.
  mpf.pagamentos.get(id)!.status = 'refunded';
  await processarWebhook(notificar(id), wDeps());
  ok(banco.cobrancas.get(id)?.status === 'estornado' && banco.cobrancas.get(id)?.avisarGestao === true, 'devolvido depois de aprovado: "estornado" (o coach decide na Gestão)');

  // Expirou sem pagar.
  todos.push({ id: 'Exp10', nome: 'Exp', email: 'exp@box.com', mensalidade: '100', vencimento: '15' });
  const exp = await gerarPix({ uid: 'U', email: 'exp@box.com' }, gDeps);
  mpf.pagamentos.get(exp.paymentId)!.status = 'cancelled';
  await processarWebhook(notificar(exp.paymentId), wDeps());
  ok(banco.cobrancas.get(exp.paymentId)?.status === 'cancelado' && !banco.cobrancas.get(exp.paymentId)?.avisarGestao, 'expirado/cancelado: "cancelado"');

  // De fora: outro sistema, outro coach, cobrança que não conhecemos.
  mpf.pagamentos.set('777', { id: 777, status: 'approved', transaction_amount: 10, external_reference: 'loja-123' });
  mpf.pagamentos.set('778', { id: 778, status: 'approved', transaction_amount: 10, external_reference: 'gpl-pix|INTRUSO|Ana01|2026-10' });
  mpf.pagamentos.set('779', { id: 779, status: 'approved', transaction_amount: 10, external_reference: 'gpl-pix|C1|Ana01|2026-10' });
  const fora = await Promise.all(['777', '778', '779'].map((x) => processarWebhook(notificar(x), wDeps())));
  ok(fora.every((r) => r.status === 200 && r.resultado.startsWith('ignorado')) && !banco.cobrancas.has('777') && !banco.cobrancas.has('779'),
    'pagamento de outro sistema, de outro "coach" ou sem cobrança registrada: 200 e ignorado');

  const intrusa: CobrancaPix = { paymentId: '780', alunoId: 'Ana01', alunoNome: 'Ana', email: 'ana@box.com', mesId: '2026-10', valor: 10,
    soMensalidade: true, status: 'pendente', criadoEm: 0, expiraEm: 0, qrCode: 'q', qrCodeBase64: 'b', ticketUrl: '' };
  banco.deOutroUid.set('INTRUSO', new Map([['780', intrusa]]));
  mpf.pagamentos.set('780', { id: 780, status: 'approved', transaction_amount: 10, currency_id: 'BRL', external_reference: 'gpl-pix|INTRUSO|Ana01|2026-10' });
  const rIntrusa = await processarWebhook(notificar('780'), wDeps());
  ok(rIntrusa.resultado.startsWith('ignorado') && banco.deOutroUid.get('INTRUSO')!.get('780')!.status === 'pendente' && banco.escritasPortal.length === 3,
    'referência com uid que não é de coach: ignorada, mesmo que exista uma cobrança naquele caminho');

  const outroTipo = await processarWebhook(notificar('555', { tipo: 'merchant_order' }), wDeps());
  ok(outroTipo.status === 200 && outroTipo.resultado.includes('não é pagamento'), 'notificação de outro tipo, assinada: 200 e ignorada');
  // O tipo declarado manda, mesmo com um action que pareça de pagamento.
  const misturado = notificar('556', { tipo: 'merchant_order' });
  (misturado.corpo as { action: string }).action = 'payment.updated';
  ok((await processarWebhook(misturado, wDeps())).resultado.includes('não é pagamento'), 'type=merchant_order com action payment.*: o type manda');

  mpf.falhar({ buscar: true });
  let subiu = false;
  try { await processarWebhook(notificar(val.paymentId), wDeps()); } catch { subiu = true; }
  ok(subiu, 'Mercado Pago fora ao consultar: o erro sobe (500) e o Mercado Pago reenvia depois');
}

/* ================================================================== */

(async () => {
  console.log('Pix dinâmico (Mercado Pago)');
  await conta();
  assinatura();
  pedido();
  decisoes();
  await gerar();
  await webhook();
  console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ Pix dinâmico conferido.');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
