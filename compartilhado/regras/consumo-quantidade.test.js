// @ts-check
/**
 * Etapa 6.4 (decisão 12): o corte do mês inteiro desde 01/12/2026, a quantidade
 * (`preco` é o total da linha) e a notinha que agrupa os itens iguais do dia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORTE_MES_INTEIRO_DESDE, mesIdDoConsumo, mesIdParaLancar, qtdDoConsumo, unitarioDoConsumo, nomeComQtd, linhasDaNotinha,
  faturaDoMes, totalConsumos,
} from './consumo.js';

test('o corte novo começa em 01/12/2026', () => {
  assert.equal(CORTE_MES_INTEIRO_DESDE, '2026-12-01');
});

test('a venda até 30/11 segue o corte de hoje (dia do vencimento)', () => {
  assert.equal(mesIdDoConsumo('2026-11-10', 10), '2026-11');
  assert.equal(mesIdDoConsumo('2026-11-11', 10), '2026-12');
  assert.equal(mesIdDoConsumo('2026-11-30', 10), '2026-12');
});

test('de 01/12 em diante, o mês inteiro vai para a fatura seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-12-01', 10), '2027-01');
  assert.equal(mesIdDoConsumo('2026-12-10', 10), '2027-01', 'o dia 10 já não fica no próprio mês');
  assert.equal(mesIdDoConsumo('2026-12-31', 10), '2027-01');
  assert.equal(mesIdDoConsumo('2027-01-05', 15), '2027-02', 'o vencimento no dia 15 não muda o corte');
});

test('a fatura seguinte já paga empurra o consumo para a próxima', () => {
  assert.equal(mesIdParaLancar('2026-12-05', 10, { '2027-01': true }), '2027-02');
});

test('a quantidade: o lançamento antigo é 1; o unitário sai do gravado ou do total', () => {
  assert.equal(qtdDoConsumo({ preco: 10 }), 1);
  assert.equal(qtdDoConsumo({ preco: 120, qtd: 12 }), 12);
  assert.equal(unitarioDoConsumo({ preco: 120, qtd: 12, unitario: 10 }), 10);
  assert.equal(unitarioDoConsumo({ preco: 25, qtd: 2 }), 12.5);
  assert.equal(nomeComQtd({ nome: 'Energético', qtd: 12 }), '12 × Energético');
  assert.equal(nomeComQtd({ nome: 'Água' }), 'Água');
});

test('quem só soma `preco` chega no total certo com a quantidade', () => {
  const consumos = [
    { id: 'a', nome: 'Energético', preco: 120, qtd: 12, unitario: 10, data: '2026-12-02', mesId: '2027-01' },
    { id: 'b', nome: 'Água', preco: 5, data: '2026-12-03', mesId: '2027-01' },
  ];
  assert.equal(totalConsumos(consumos, '2027-01'), 125);
  assert.equal(faturaDoMes({ mensalidade: '130', consumos }, '2027-01').extras, 125);
});

test('a notinha junta os 12 lançamentos antigos do mesmo produto no mesmo dia', () => {
  const doze = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, nome: 'Energético', preco: 10, data: '2026-11-05', mesId: '2026-11' }));
  const linhas = linhasDaNotinha([...doze, { id: 'x', nome: 'Água', preco: 5, data: '2026-11-05', mesId: '2026-11' }]);
  assert.equal(linhas.length, 2);
  assert.deepEqual(
    { nome: linhas[0].nome, qtd: linhas[0].qtd, unitario: linhas[0].unitario, total: linhas[0].total, ids: linhas[0].ids.length },
    { nome: 'Energético', qtd: 12, unitario: 10, total: 120, ids: 12 },
  );
  assert.equal(linhas[1].nome, 'Água');
});

test('a notinha não junta dia diferente nem preço diferente', () => {
  const linhas = linhasDaNotinha([
    { id: 'a', nome: 'Energético', preco: 10, data: '2026-11-05' },
    { id: 'b', nome: 'Energético', preco: 10, data: '2026-11-06' },
    { id: 'c', nome: 'Energético', preco: 12, data: '2026-11-06' },
    { id: 'd', nome: 'Energético', preco: 20, qtd: 2, unitario: 10, data: '2026-11-06' },
  ]);
  assert.deepEqual(linhas.map((l) => [l.data, l.unitario, l.qtd, l.total]), [
    ['2026-11-05', 10, 1, 10], ['2026-11-06', 10, 3, 30], ['2026-11-06', 12, 1, 12],
  ]);
});
