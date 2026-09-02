// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesIdDoConsumo, mesIdParaLancar, consumosDoMes, totalConsumos, faturaDoMes } from './consumo.js';

const c = (data, mesId, preco, nome = 'Energético') => ({ id: data + nome, nome, preco, data, mesId });

/* ---------- O corte é o dia do vencimento ---------- */

test('até o dia do vencimento, o consumo entra na fatura do próprio mês', () => {
  assert.equal(mesIdDoConsumo('2026-09-01', 10), '2026-09');
  assert.equal(mesIdDoConsumo('2026-09-09', 10), '2026-09');
});

test('no PRÓPRIO dia do vencimento ainda entra na fatura daquele mês', () => {
  assert.equal(mesIdDoConsumo('2026-09-10', 10), '2026-09');
});

test('depois do vencimento já soma na fatura seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-09-11', 10), '2026-10');
  assert.equal(mesIdDoConsumo('2026-08-25', 10), '2026-09');
  assert.equal(mesIdDoConsumo('2026-08-31', 10), '2026-09');
});

test('o exemplo do box: 25/08 e 31/08 caem juntos na fatura de setembro', () => {
  assert.equal(mesIdDoConsumo('2026-08-25', 10), '2026-09');
  assert.equal(mesIdDoConsumo('2026-08-31', 10), '2026-09');
});

test('dezembro vira janeiro do ano seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-12-20', 10), '2027-01');
});

test('vencimento no dia 31 não quebra em fevereiro — vale o último dia do mês', () => {
  // Fevereiro de 2026 tem 28 dias: o corte é 28, e o dia 28 ainda entra.
  assert.equal(mesIdDoConsumo('2026-02-28', 31), '2026-02');
  assert.equal(mesIdDoConsumo('2026-02-27', 31), '2026-02');
});

test('vencimento no dia 1: só o dia 1 fica no mês, o resto vai pro seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-09-01', 1), '2026-09');
  assert.equal(mesIdDoConsumo('2026-09-02', 1), '2026-10');
});

/* ---------- Fatura já paga: o consumo pula para a seguinte ---------- */

test('sem nada pago, lança na fatura que a data manda', () => {
  assert.equal(mesIdParaLancar('2026-08-25', 10, {}), '2026-09');
});

test('quem já pagou setembro no dia 5 vê a compra do dia 8 em outubro', () => {
  // Sem isto, a compra entraria numa conta que o aluno já fechou.
  assert.equal(mesIdParaLancar('2026-09-08', 10, { '2026-09': true }), '2026-10');
});

test('pula quantas faturas pagas houver seguidas', () => {
  assert.equal(mesIdParaLancar('2026-09-08', 10, { '2026-09': true, '2026-10': true }), '2026-11');
});

test('fatura paga mais adiante não interfere na atual', () => {
  assert.equal(mesIdParaLancar('2026-09-08', 10, { '2026-11': true }), '2026-09');
});

/* ---------- Leitura da fatura ---------- */

test('os consumos saem na ordem em que foram comprados', () => {
  const lista = [c('2026-08-31', '2026-09', 3, 'Dose'), c('2026-08-25', '2026-09', 10)];
  assert.deepEqual(consumosDoMes(lista, '2026-09').map((x) => x.data), ['2026-08-25', '2026-08-31']);
});

test('consumo de outra fatura não entra na conta', () => {
  const lista = [c('2026-08-25', '2026-09', 10), c('2026-09-20', '2026-10', 3, 'Dose')];
  assert.equal(totalConsumos(lista, '2026-09'), 10);
  assert.equal(totalConsumos(lista, '2026-10'), 3);
});

test('sem consumo nenhum a conta é só a mensalidade', () => {
  assert.equal(totalConsumos(undefined, '2026-09'), 0);
  assert.deepEqual(faturaDoMes({ mensalidade: '150' }, '2026-09'),
    { mensalidade: 150, consumos: [], extras: 0, total: 150 });
});

test('a fatura soma mensalidade e consumíveis', () => {
  const aluno = { mensalidade: '150', consumos: [c('2026-08-25', '2026-09', 10), c('2026-08-31', '2026-09', 3, 'Dose')] };
  const f = faturaDoMes(aluno, '2026-09');
  assert.equal(f.mensalidade, 150);
  assert.equal(f.extras, 13);
  assert.equal(f.total, 163);
  assert.equal(f.consumos.length, 2);
});

test('meia dose entra com centavos e a soma fecha certo', () => {
  const aluno = { mensalidade: '150', consumos: [c('2026-09-02', '2026-09', 1.5, '1/2 Dose'), c('2026-09-03', '2026-09', 1.5, '1/2 Dose')] };
  assert.equal(faturaDoMes(aluno, '2026-09').total, 153);
});

test('mensalidade com vírgula é lida como número', () => {
  assert.equal(faturaDoMes({ mensalidade: '150,50' }, '2026-09').total, 150.5);
});

test('aluno sem mensalidade cadastrada ainda soma os consumíveis', () => {
  const aluno = { consumos: [c('2026-09-02', '2026-09', 10)] };
  assert.equal(faturaDoMes(aluno, '2026-09').total, 10);
});
