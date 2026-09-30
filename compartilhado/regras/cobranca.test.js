// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIA_VIRADA, mesDaCobranca, statusDaCobranca, vencimentoNoMes } from './cobranca.js';

const ALUNO = { mensalidade: '190', vencimento: '10', pagamentos: {}, consumos: [] };
const al = (x = {}) => ({ ...ALUNO, ...x });
/** O mês e o status como o Portal os mostra num dia. */
const ver = (x, hoje) => {
  const a = al(x);
  const mes = mesDaCobranca(a, hoje);
  return { mes, st: statusDaCobranca(a, mes, hoje) };
};

/* ---------- O ciclo: 1 ao 10 pendente, 11 ao 27 vencido ---------- */

test('do dia 1 ao vencimento, a conta do mês está pendente', () => {
  assert.deepEqual(ver({}, '2026-09-01'), { mes: '2026-09', st: 'pendente' });
  assert.deepEqual(ver({}, '2026-09-10'), { mes: '2026-09', st: 'pendente' });
});

test('do dia seguinte ao vencimento até o 27, sem pagamento, está vencida', () => {
  assert.deepEqual(ver({}, '2026-09-11'), { mes: '2026-09', st: 'vencido' });
  assert.deepEqual(ver({}, '2026-09-27'), { mes: '2026-09', st: 'vencido' });
});

test('mês pago antes do dia 28: pago', () => {
  assert.deepEqual(ver({ pagamentos: { '2026-09': true } }, '2026-09-15'), { mes: '2026-09', st: 'pago' });
});

test('o corte segue o vencimento da ficha', () => {
  assert.equal(ver({ vencimento: '5' }, '2026-09-06').st, 'vencido');
  assert.equal(vencimentoNoMes('2026-02', '31'), '2026-02-28');
  assert.equal(vencimentoNoMes('2026-08', ''), '2026-08-10');
});

/* ---------- A virada do dia 28 ---------- */

test(`a partir do dia ${DIA_VIRADA}, com o mês pago, já é a conta do mês seguinte`, () => {
  assert.deepEqual(ver({ pagamentos: { '2026-09': true } }, '2026-09-28'), { mes: '2026-10', st: 'proximo' });
  assert.deepEqual(ver({ pagamentos: { '2026-09': true } }, '2026-09-30'), { mes: '2026-10', st: 'proximo' });
});

test('a virada não esconde dívida: com o mês em aberto, ele continua na tela', () => {
  assert.deepEqual(ver({}, '2026-09-28'), { mes: '2026-09', st: 'vencido' });
});

test('o consumo em aberto também segura a virada', () => {
  const consumos = [{ id: 'c', nome: 'Energético', preco: 10, data: '2026-09-05', mesId: '2026-09' }];
  // Sem mensalidade, mas com consumo de setembro por pagar.
  assert.equal(mesDaCobranca(al({ mensalidade: '', consumos }), '2026-09-28'), '2026-09');
});

test('sem nada a dever no mês, o dia 28 vira do mesmo jeito', () => {
  assert.equal(mesDaCobranca(al({ mensalidade: '' }), '2026-09-28'), '2026-10');
});

test('dependente com a conta acertada pelo responsável não segura a virada', () => {
  assert.equal(mesDaCobranca(al({ pagoPor: { nome: 'Pai', escopo: 'tudo' } }), '2026-09-28'), '2026-10');
});

test('a conta de um dependente em aberto segura a virada do responsável', () => {
  const dependentes = [{ nome: 'Filho', escopo: 'tudo', mensalidade: '150', consumos: [] }];
  assert.equal(mesDaCobranca(al({ mensalidade: '', dependentes }), '2026-09-28'), '2026-09');
});

test('mês seguinte pago adiantado: pago', () => {
  assert.deepEqual(ver({ pagamentos: { '2026-09': true, '2026-10': true } }, '2026-09-29'), { mes: '2026-10', st: 'pago' });
});

test('dia 28 de dezembro já é a conta de janeiro', () => {
  assert.deepEqual(ver({ pagamentos: { '2026-12': true } }, '2026-12-28'), { mes: '2027-01', st: 'proximo' });
});

test('no dia 1 a mesma conta passa a pendente', () => {
  assert.deepEqual(ver({ pagamentos: { '2026-09': true } }, '2026-10-01'), { mes: '2026-10', st: 'pendente' });
});

test('fevereiro: a virada é no dia 28 mesmo sendo o último dia', () => {
  assert.equal(mesDaCobranca(al({ pagamentos: { '2026-02': true } }), '2026-02-28'), '2026-03');
  assert.equal(mesDaCobranca(al({ pagamentos: { '2026-02': true } }), '2026-02-27'), '2026-02');
});
