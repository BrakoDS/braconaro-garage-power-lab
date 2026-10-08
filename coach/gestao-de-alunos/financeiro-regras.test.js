// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/financeiro-regras.test.js
 *
 * As regras de dinheiro do box, sem tela e sem banco. Mês de referência:
 * outubro/2026; "hoje" é 07/10/2026 (quarta). Vencimento padrão dia 10.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  darBaixa, desfazerBaixa, lancarConsumo, removerConsumo, mesDoBox, cobrancasDoMes, diasAteVencimento, msgCobranca, PIX,
} from './financeiro-regras.js?v=11';

const OUT = '2026-10', SET = '2026-09', NOV = '2026-11';
const HOJE = '2026-10-07';
const NB = (s) => s.replace(/ /g, ' ');

/** O box, novo a cada teste. */
function box() {
  return {
    ana: { id: 'Ana', nome: 'Ana Lima', mensalidade: '150', vencimento: '10', pagamentos: { [SET]: true },
      consumos: [{ id: 'c1', nome: 'Água', preco: 5, data: '2026-10-02', mesId: OUT }] },
    bia: { id: 'Bia', nome: 'Bia Souza', mensalidade: '120', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' },
      consumos: [{ id: 'c2', nome: 'Barra', preco: 8, data: '2026-10-03', mesId: OUT }] },
    caio: { id: 'Caio', nome: 'Caio', mensalidade: '150', vencimento: '5', status: 'inativo' },
    duda: { id: 'Duda', nome: 'Duda Reis', mensalidade: '150', vencimento: '5', parceria: { nome: 'Atleta', percentual: 100 } },
    edu: { id: 'Edu', nome: 'Edu', mensalidade: '200', vencimento: '5', parceria: { nome: 'Clínica', percentual: 50 } },
    fab: { id: 'Fab', nome: 'Fab', mensalidade: '90', vencimento: '20', pagoPor: { id: 'Saiu', escopo: 'tudo' } },
  };
}
const todos = (b) => Object.values(b);

/* ---------- dar baixa ---------- */

test('baixa: marca o mês e registra o valor da fatura NA HORA — com consumo e dependente', () => {
  const b = box();
  const r = darBaixa(b.ana, OUT, todos(b));
  assert.ok(r);
  assert.deepEqual(r.patch, { pagamentos: { [SET]: true, [OUT]: true } });
  // 150 da Ana + 5 de água + a conta da Bia (120 + 8 de barra).
  assert.deepEqual({ ...r.log, resumo: NB(r.log?.resumo || '') }, { tipo: 'pagamento', resumo: 'Pagamento registrado · Outubro / 2026 · R$ 283,00' });
});

test('baixa: um segundo clique no mês já pago não registra outro pagamento', () => {
  const b = box();
  assert.equal(darBaixa(b.ana, SET, todos(b)), null);
});

test('baixa: parceria entra no valor; responsável que saiu devolve a conta ao aluno', () => {
  const b = box();
  assert.match(NB(darBaixa(b.edu, OUT, todos(b))?.log?.resumo || ''), /R\$ 100,00$/, 'parceria de 50%');
  assert.match(NB(darBaixa(b.fab, OUT, todos(b))?.log?.resumo || ''), /R\$ 90,00$/, 'vínculo órfão: paga a própria');
});

test('desfazer baixa: o mês volta a ficar em aberto; sem baixa, nada a desfazer', () => {
  const b = box();
  const r = desfazerBaixa(b.ana, SET);
  assert.deepEqual(r, { patch: { pagamentos: {} }, log: { tipo: 'pagamento-desfeito', resumo: 'Pagamento desfeito · Setembro / 2026' } });
  assert.equal(desfazerBaixa(b.ana, OUT), null);
});

/* ---------- consumos ---------- */

test('consumo do catálogo: entra na fatura do dia, com nome e preço copiados, sem trilha', () => {
  const b = box();
  const r = lancarConsumo(b.ana, { produtoId: 'agua', nome: 'Água', preco: '5,50' }, HOJE, 'k1');
  assert.deepEqual(r.consumo, { id: 'k1', produtoId: 'agua', nome: 'Água', preco: 5.5, data: HOJE, mesId: OUT });
  assert.equal(r.patch.consumos.length, 2);
  assert.deepEqual(r.patch.consumos.at(-1), r.consumo);
  assert.equal(r.log, null, 'do catálogo, o produto já diz tudo');
});

test('consumo avulso: deixa trilha com a fatura — e fatura paga empurra para a seguinte', () => {
  const b = box();
  const paga = { ...b.ana, pagamentos: { [OUT]: true } };
  const r = lancarConsumo(paga, { nome: 'Camiseta', preco: 60 }, HOJE, 'k2');
  assert.equal(r.consumo.mesId, NOV, 'outubro já pago: cai em novembro');
  assert.deepEqual({ ...r.log, resumo: NB(r.log?.resumo || '') }, { tipo: 'lancamento', resumo: 'Lançamento avulso · Camiseta · R$ 60,00 · fatura de Novembro / 2026' });
});

test('remover consumo: tira só aquele; id que não existe, nada a fazer', () => {
  const b = box();
  assert.deepEqual(removerConsumo(b.ana, 'c1'), { patch: { consumos: [] }, log: null });
  assert.equal(removerConsumo(b.ana, 'nao-existe'), null);
});

/* ---------- o mês do box ---------- */

test('mês do box: inativo fora; dependente aparece sem contar duas vezes', () => {
  const b = box();
  const { linhas, totais } = mesDoBox(todos(b), OUT, HOJE);
  assert.deepEqual(linhas.map((l) => l.a.id), ['Ana', 'Bia', 'Duda', 'Edu', 'Fab']);
  const bia = linhas.find((l) => l.a.id === 'Bia');
  assert.equal(bia?.conta.total, 0, 'a conta da Bia está na da Ana');
  assert.equal(bia?.resp?.id, 'Ana');
  // Previsto: Ana 283 (com a Bia) + Edu 100 + Fab 90. A Duda (cortesia) não cobra nada.
  assert.equal(totais.previsto, 473);
  assert.equal(totais.recebido, 0);
  assert.equal(totais.extras, 13, 'água da Ana + barra da Bia, cada um na sua linha');
  assert.equal(totais.investido, 250, 'Duda 150 + Edu 100: o que o box banca');
});

test('mês do box: selo de cada linha — vencido, cortesia, e o dependente espelha o responsável', () => {
  const b = box();
  const rot = (bx, mes, hoje) => Object.fromEntries(mesDoBox(todos(bx), mes, hoje).linhas.map((l) => [l.a.id, l.rotulo]));
  assert.deepEqual(rot(b, OUT, HOJE), { Ana: 'Pendente', Bia: 'Pendente', Duda: 'Cortesia', Edu: 'Vencido', Fab: 'Pendente' });
  b.ana.pagamentos[OUT] = true;
  const pago = mesDoBox(todos(b), OUT, HOJE);
  assert.equal(pago.linhas.find((l) => l.a.id === 'Bia')?.rotulo, 'Pago', 'a Ana pagou: a Bia aparece paga');
  assert.equal(pago.totais.recebido, 283);
});

test('mês do box: o investimento da parceria conta na linha de quem TEM a parceria, mesmo pago por outro', () => {
  const b = box();
  // Gil: dependente da Ana, com parceria de 50% e sem mensalidade cheia própria a cobrar dele.
  const gil = { id: 'Gil', nome: 'Gil', mensalidade: '100', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' }, parceria: { nome: 'Clube', percentual: 50 } };
  // Hel: dependente sem mensalidade (só aparece por causa do vínculo).
  const hel = { id: 'Hel', nome: 'Hel', mensalidade: '', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' } };
  const { linhas, totais } = mesDoBox([...todos(b), gil, hel], OUT, HOJE);
  assert.ok(linhas.some((l) => l.a.id === 'Hel'), 'o dependente aparece pelo vínculo, mesmo sem mensalidade');
  assert.equal(linhas.find((l) => l.a.id === 'Gil')?.propria.desconto, 50);
  assert.equal(totais.investido, 300, 'Duda 150 + Edu 100 + Gil 50 — o desconto do Gil não some por ele ser dependente');
  assert.equal(totais.previsto, 523, 'a Ana passa a cobrar também os 50 do Gil');
});

test('mês do box: consumo lançado numa fatura à frente fica avisado na linha', () => {
  const b = box();
  b.ana.pagamentos[OUT] = true; // outubro pago: o próximo lançamento vai para novembro
  b.ana.consumos.push({ id: 'c9', nome: 'Gel', preco: 12, data: HOJE, mesId: NOV });
  const ana = mesDoBox(todos(b), OUT, HOJE).linhas.find((l) => l.a.id === 'Ana');
  assert.equal(ana?.destino, NOV);
  assert.equal(ana?.adiante, 12);
});

/* ---------- cobranças ---------- */

test('vencimento: dias até o vencimento, dia limitado ao mês, padrão dia 10', () => {
  assert.equal(diasAteVencimento({ vencimento: '10' }, OUT, HOJE), 3);
  assert.equal(diasAteVencimento({ vencimento: '5' }, OUT, HOJE), -2);
  assert.equal(diasAteVencimento({}, OUT, HOJE), 3, 'sem vencimento: dia 10');
  assert.equal(diasAteVencimento({ vencimento: '31' }, '2026-02', '2026-02-20'), 8, 'fevereiro não tem 31: vence dia 28');
});

test('cobranças: grupos por urgência, cada um com o valor da FATURA do mês', () => {
  const b = box();
  const c = cobrancasDoMes(todos(b), OUT, HOJE);
  assert.deepEqual(c.vencidas.map((x) => [x.a.id, x.dias, x.valor]), [['Edu', -2, 100]], 'Edu: parceria de 50%');
  assert.deepEqual(c.emBreve.map((x) => [x.a.id, x.dias, x.valor]), [['Ana', 3, 283]], 'Ana: 150 + 5 de água + a conta da Bia (128)');
  assert.deepEqual(c.aVencer.map((x) => [x.a.id, x.dias, x.valor]), [['Fab', 13, 90]], 'Fab: responsável que saiu, paga a própria');
  assert.equal(c.totalAtraso, 100);
  assert.equal(c.totalPendente, 473, 'o mesmo "previsto" da tela Financeiro');
});

test('cobranças (regressão): cortesia e dependente coberto não recebem lembrete; responsável é cobrado da conta inteira', () => {
  // Antes, a lista usava a mensalidade cheia da ficha: Duda (100%) aparecia
  // devendo R$ 150, a Bia recebia lembrete dos R$ 120 que a Ana paga, e a Ana
  // era cobrada só dos R$ 150 dela.
  const b = box();
  const c = cobrancasDoMes(todos(b), OUT, HOJE);
  const ids = [...c.vencidas, ...c.emBreve, ...c.aVencer].map((x) => x.a.id);
  assert.ok(!ids.includes('Duda'), 'cortesia de 100% não deve nada');
  assert.ok(!ids.includes('Bia'), 'a conta da Bia está na da Ana');
  assert.equal(totaisDoBox(b), c.totalPendente, 'Cobranças e Financeiro dizem o mesmo valor');
  // Dependente "só o plano" com consumo próprio: é cobrado só do consumo dele.
  b.bia.pagoPor.escopo = 'plano';
  const bia = cobrancasDoMes(todos(b), OUT, HOJE).emBreve.find((x) => x.a.id === 'Bia');
  assert.equal(bia?.valor, 8);
  assert.equal(bia?.soMensalidade, false);
});

test('cobranças × Financeiro: em qualquer box, o "a receber" das duas telas é o mesmo (500 boxes sorteados)', () => {
  // Gerador determinístico (mulberry32): o mesmo box a cada execução.
  let s = 20261007;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pega = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let n = 0; n < 500; n++) {
    const ids = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => `X${i}`);
    const alunos = ids.map((id, i) => {
      const a = { id, nome: id, mensalidade: pega(['', '0', '99,90', '150']), vencimento: pega(['', '1', '7', '10', '31']),
        status: pega(['ativo', 'ativo', 'pendente', 'inativo']), pagamentos: rnd() < 0.3 ? { [OUT]: true } : {},
        consumos: rnd() < 0.5 ? [{ id: `${id}c`, nome: 'Gel', preco: pega([5, 12.5]), data: HOJE, mesId: pega([OUT, NOV]) }] : [] };
      if (rnd() < 0.3) a.parceria = { nome: '', percentual: pega([10, 25, 50, 100]) };
      if (i > 0 && rnd() < 0.3) a.pagoPor = { id: rnd() < 0.85 ? pega(ids.slice(0, i)) : 'Sumiu', escopo: pega(['tudo', 'plano']) };
      return a;
    });
    const fin = mesDoBox(alunos, OUT, HOJE).totais;
    const cob = cobrancasDoMes(alunos, OUT, HOJE);
    assert.ok(Math.abs((fin.previsto - fin.recebido) - cob.totalPendente) < 1e-9, `box ${n}: Financeiro ${fin.previsto - fin.recebido} × Cobranças ${cob.totalPendente}`);
    for (const x of [...cob.vencidas, ...cob.emBreve, ...cob.aVencer]) assert.ok(x.valor > 0 && (x.a.status || 'ativo') !== 'inativo');
  }
});

/** O "a receber" da tela Financeiro para o mesmo box. @param {any} b */
function totaisDoBox(b) { const t = mesDoBox(todos(b), OUT, HOJE).totais; return t.previsto - t.recebido; }

test('cobranças: os limites dos grupos — vence hoje e em 5 dias é "em breve"; 6 dias, "a vencer"', () => {
  const m = (id, vencimento) => ({ id, nome: id, mensalidade: '100', vencimento });
  const c = cobrancasDoMes([m('ontem', '6'), m('hoje', '7'), m('cinco', '12'), m('seis', '13')], OUT, HOJE);
  assert.deepEqual(c.vencidas.map((x) => x.a.id), ['ontem']);
  assert.deepEqual(c.emBreve.map((x) => [x.a.id, x.dias]), [['hoje', 0], ['cinco', 5]]);
  assert.deepEqual(c.aVencer.map((x) => [x.a.id, x.dias]), [['seis', 6]]);
  assert.equal(c.totalAtraso, 100);
  assert.equal(c.totalPendente, 400);
});

test('lembrete: primeiro nome, mês, valor, prazo e a chave Pix', () => {
  const t = NB(msgCobranca({ nome: 'Ana Lima', vencimento: '10' }, OUT, 150, 3));
  assert.match(t, /^Olá, Ana! 😊 Passando pra lembrar da mensalidade de Outubro \(R\$ 150,00\), que vence dia 10\./);
  assert.ok(t.includes(PIX.chave));
  assert.match(NB(msgCobranca({ nome: 'Edu', vencimento: '5' }, OUT, 100, -2)), /que venceu dia 5\./);
  assert.match(NB(msgCobranca({ nome: 'X', vencimento: '7' }, OUT, 1, 0)), /que vence hoje\./);
  assert.match(NB(msgCobranca({ nome: 'Ana', vencimento: '10' }, OUT, 283, 3, false)), /lembrar da conta de Outubro \(R\$ 283,00\)/,
    'com consumo ou dependente junto, é a "conta", não a mensalidade');
});

/* ---------- pureza ---------- */

test('puro: nenhuma regra altera o que recebe', () => {
  /** @param {any} o */
  const congelar = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
  const b = congelar(box());
  const copia = JSON.stringify(b);
  darBaixa(b.ana, OUT, todos(b)); desfazerBaixa(b.ana, SET);
  lancarConsumo(b.ana, { nome: 'X', preco: 1 }, HOJE, 'z'); removerConsumo(b.ana, 'c1');
  mesDoBox(todos(b), OUT, HOJE); cobrancasDoMes(todos(b), OUT, HOJE);
  assert.equal(JSON.stringify(b), copia);
});
