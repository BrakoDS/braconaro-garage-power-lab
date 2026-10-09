// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/pix-baixa.test.js
 *
 * O Pix do Mercado Pago chegando na Gestão: o plano puro de cada cobrança do
 * livro-caixa (aprovado, mês já pago, divergente, estornado), e a rodada de
 * verdade — db.js real sobre um localStorage em memória, o log da aba
 * Registros e a Fila de mensagens — com a nuvem (o livro-caixa) em memória.
 * O que importa: a baixa é a do `darBaixa`, a cobrança sai da Fila, e rodar de
 * novo (a bandeira não desligou) não paga nem avisa duas vezes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

const db = await import('./db.js?v=13');
const eventos = await import('./eventos.js?v=13');
const { reg } = await import('./registro.js?v=13');
const { planoDoPix, aplicarPixPendentes } = await import('./pix-baixa.js?v=13');
const { iniciarAutomacao, mensagens } = await import('./automacao.js?v=13');
const { TIPOS } = await import('./registros-ui.js?v=13');

const NB = (s) => String(s).replace(/ /g, ' ');
const OUT = '2026-10', SET = '2026-09';
const HOJE = '2026-10-09';
const AGORA = Date.UTC(2026, 9, 9, 15);
iniciarAutomacao({ hoje: () => HOJE, agora: () => AGORA, nuvem: { ler: async () => null, gravar: async () => {}, apagar: async () => {} } });

/** Uma cobrança do livro-caixa, como o webhook deixa. */
const pix = (paymentId, alunoId, mesId, valor, extra = {}) => ({
  paymentId, alunoId, alunoNome: '', mesId, valor, valorPago: valor, soMensalidade: true, status: 'aprovado', ...extra,
});

/* ---------- o plano (puro) ---------- */

const ana = { id: 'Ana', nome: 'Ana Lima', mensalidade: '150', vencimento: '5',
  consumos: [{ id: 'c1', nome: 'Gel', preco: 10, data: '2026-10-02', mesId: OUT }] };
const bia = { id: 'Bia', nome: 'Bia', mensalidade: '120', vencimento: '5', pagoPor: { id: 'Ana', escopo: 'tudo' } };
const box = [ana, bia];

test('plano: Pix aprovado vira a baixa do darBaixa, com o rastro do Pix e o log "Pagamento via Pix" (recibo na Fila)', () => {
  const p = planoDoPix(pix('900', 'Ana', OUT, 280, { soMensalidade: false }), ana, box);
  assert.equal(p.acao, 'baixa');
  if (p.acao !== 'baixa') return;
  assert.deepEqual(p.patch, { pagamentos: { [OUT]: true }, pixPagos: { [OUT]: '900' } });
  assert.equal(p.log.tipo, 'pagamento');
  assert.equal(NB(p.log.resumo), 'Pagamento via Pix (Mercado Pago) · Outubro / 2026 · R$ 280,00');
  assert.deepEqual(p.log.extra, { id: 'pix-900', chave: 'pix:900' }, 'id fixo: rodar de novo regrava a mesma linha');
  assert.deepEqual(p.log.dados, { mesId: OUT, valor: 280, soMensalidade: false }, 'o fato vai para a Fila (recibo)');
});

test('plano: a conta mudou depois do QR — a baixa entra, e o log diz quanto a conta é agora', () => {
  const p = planoDoPix(pix('901', 'Ana', OUT, 270), ana, box);
  assert.equal(p.acao, 'baixa');
  assert.match(NB(p.acao === 'baixa' ? p.log.resumo : ''), /R\$ 270,00 · a conta agora é R\$ 280,00$/);
});

test('plano: mês que já estava pago não paga de novo — vira aviso para o coach devolver', () => {
  const p = planoDoPix(pix('902', 'Ana', SET, 150), { ...ana, pagamentos: { [SET]: true } }, box);
  assert.equal(p.acao, 'aviso');
  if (p.acao !== 'aviso') return;
  assert.equal(p.log.tipo, 'pix-alerta');
  assert.match(NB(p.log.resumo), /^Pix recebido para um mês que já estava pago · Setembro \/ 2026 · R\$ 150,00 — confira e devolva/);
  assert.ok(TIPOS['pix-alerta'], 'o aviso tem ícone e filtro na aba Registros');
});

test('plano: o mesmo Pix de novo (a bandeira não desligou) não vira aviso falso', () => {
  const p = planoDoPix(pix('903', 'Ana', OUT, 280), { ...ana, pagamentos: { [OUT]: true }, pixPagos: { [OUT]: '903' } }, box);
  assert.deepEqual(p, { acao: 'nada', motivo: 'este Pix já deu baixa' });
});

test('plano: o coach desfez a baixa do Pix — rodar de novo NÃO refaz contra a vontade dele', () => {
  // desfazerBaixa tira o mês de `pagamentos`, mas o rastro do Pix fica.
  const p = planoDoPix(pix('904', 'Ana', OUT, 280), { ...ana, pagamentos: {}, pixPagos: { [OUT]: '904' } }, box);
  assert.equal(p.acao, 'nada');
});

test('plano: divergente e estornado só avisam; pendente, cancelado e aluno apagado não fazem nada', () => {
  const div = planoDoPix(pix('905', 'Ana', OUT, 280, { status: 'divergente', valorPago: 279 }), ana, box);
  assert.equal(div.acao, 'aviso');
  assert.match(NB(div.acao === 'aviso' ? div.log.resumo : ''), /pago R\$ 279,00, cobrado R\$ 280,00 — a baixa NÃO foi feita/);
  const est = planoDoPix(pix('906', 'Ana', OUT, 280, { status: 'estornado' }), ana, box);
  assert.match(NB(est.acao === 'aviso' ? est.log.resumo : ''), /^Pix devolvido pelo Mercado Pago · Outubro \/ 2026 · R\$ 280,00 — a baixa do mês continua/);
  assert.equal(planoDoPix(pix('907', 'Ana', OUT, 280, { status: 'pendente' }), ana, box).acao, 'nada');
  assert.equal(planoDoPix(pix('908', 'Ana', OUT, 280, { status: 'cancelado' }), ana, box).acao, 'nada');
  assert.deepEqual(planoDoPix(pix('909', 'Saiu', OUT, 280), null, box), { acao: 'nada', motivo: 'aluno não existe mais na Gestão' });
});

test('plano: não altera o que recebe', () => {
  const a = structuredClone(ana), c = pix('910', 'Ana', OUT, 280);
  const antes = JSON.stringify([a, c]);
  planoDoPix(c, a, [a, bia]);
  assert.equal(JSON.stringify([a, c]), antes);
});

/* ---------- a rodada de verdade ---------- */

db.criar({ id: 'Eva01', nome: 'Eva Nunes', email: 'eva@box.com', telefone: '14988881234', mensalidade: '130', vencimento: '5' });
db.criar({ id: 'Rui02', nome: 'Rui Paz', email: 'rui@box.com', telefone: '14977770000', mensalidade: '90', vencimento: '5' });

/** O livro-caixa em memória: a nuvem que o webhook preenche. */
function livroCaixa(cobrancas) {
  const docs = new Map(cobrancas.map((c) => [c.paymentId, { ...c, avisarGestao: true }]));
  let falharMarcar = false;
  const marcados = [];
  return {
    docs, marcados,
    falhar: (v) => { falharMarcar = v; },
    deps: () => ({
      listar: async () => [...docs.values()].filter((c) => c.avisarGestao).map((c) => ({ ...c })),
      marcarTratado: async (id, em) => {
        if (falharMarcar) throw Object.assign(new Error('rede'), { code: 'unavailable' });
        marcados.push(id);
        docs.set(id, { ...docs.get(id), avisarGestao: false, aplicadaEm: em });
      },
      obter: db.obter, todos: db.listar, atualizar: db.atualizar, registrar: reg, agora: () => AGORA,
      avisar: () => {},
    }),
  };
}

test('rodada: o Pix aprovado dá baixa na ficha, registra, tira a cobrança da Fila e sugere o recibo', async () => {
  assert.ok(mensagens().some((m) => m.chave === 'cobranca-vencida:Eva01:2026-10'), 'antes: a Eva está na Fila de cobrança');
  const caixa = livroCaixa([pix('5001', 'Eva01', OUT, 130)]);
  const antes = eventos.pendentes().length;
  const r = await aplicarPixPendentes(caixa.deps());
  assert.deepEqual(r, { baixas: 1, avisos: 0 });
  const eva = db.obter('Eva01');
  assert.equal(eva.pagamentos[OUT], true);
  assert.equal(eva.pixPagos[OUT], '5001');
  const novos = eventos.pendentes().slice(antes);
  assert.deepEqual(novos.map((e) => [e.id, e.tipo, e.alunoId, NB(e.resumo)]),
    [['pix-5001', 'pagamento', 'Eva01', 'Pagamento via Pix (Mercado Pago) · Outubro / 2026 · R$ 130,00']]);
  assert.deepEqual(caixa.marcados, ['5001'], 'só depois de aplicar, a bandeira desliga');
  const fila = mensagens().map((m) => m.chave);
  assert.ok(!fila.includes('cobranca-vencida:Eva01:2026-10'), 'a cobrança saiu da Fila');
  assert.ok(fila.includes('recibo:Eva01:2026-10'), 'e o recibo entrou');
});

test('rodada: a nuvem não recebeu o "tratado" — a próxima rodada não paga nem avisa de novo', async () => {
  db.criar({ id: 'Lia03', nome: 'Lia Mota', email: 'lia@box.com', mensalidade: '100', vencimento: '5' });
  const caixa = livroCaixa([pix('5002', 'Lia03', OUT, 100)]);
  caixa.falhar(true);
  const r1 = await aplicarPixPendentes(caixa.deps());
  assert.deepEqual(r1, { baixas: 1, avisos: 0 });
  assert.equal(caixa.docs.get('5002').avisarGestao, true, 'a bandeira ficou ligada');
  const eventosAntes = eventos.pendentes().length;
  caixa.falhar(false);
  const r2 = await aplicarPixPendentes(caixa.deps());
  assert.deepEqual(r2, { baixas: 0, avisos: 0 }, 'nada de novo: este Pix já deu baixa');
  assert.equal(eventos.pendentes().length, eventosAntes, 'nenhum evento novo');
  assert.equal(caixa.docs.get('5002').avisarGestao, false, 'agora sim a bandeira desliga');
});

test('rodada: dois Pix do mesmo mês (o QR antigo também foi pago) — uma baixa e um aviso para devolver', async () => {
  const caixa = livroCaixa([pix('5003', 'Rui02', OUT, 90), pix('5004', 'Rui02', OUT, 90)]);
  const antes = eventos.pendentes().length;
  const r = await aplicarPixPendentes(caixa.deps());
  assert.deepEqual(r, { baixas: 1, avisos: 1 });
  const novos = eventos.pendentes().slice(antes).map((e) => [e.id, e.tipo]);
  assert.deepEqual(novos, [['pix-5003', 'pagamento'], ['pix-alerta-5004-aprovado', 'pix-alerta']]);
  assert.equal(db.obter('Rui02').pixPagos[OUT], '5003', 'o rastro é do Pix que deu a baixa');
  // Repetir a rodada (a nuvem reenviou as duas): o aviso tem id fixo, a linha é regravada, não duplicada.
  for (const c of caixa.docs.values()) c.avisarGestao = true;
  await aplicarPixPendentes(caixa.deps());
  const ids = eventos.pendentes().map((e) => e.id);
  assert.equal(ids.filter((id) => id === 'pix-alerta-5004-aprovado').length, 1);
  assert.equal(ids.filter((id) => id === 'pix-5003').length, 1);
});

test('rodada: Pix de aluno apagado — não quebra, desliga a bandeira e avisa no console', async () => {
  const caixa = livroCaixa([pix('5005', 'NaoExiste', OUT, 50)]);
  const avisos = [];
  const r = await aplicarPixPendentes({ ...caixa.deps(), avisar: (m) => avisos.push(m) });
  assert.deepEqual(r, { baixas: 0, avisos: 0 });
  assert.deepEqual(caixa.marcados, ['5005']);
  assert.match(avisos[0], /não está mais na Gestão/);
});
