// @ts-check
/**
 * Rodar: node --test compartilhado/regras/datas-treino.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateIdDe, mesIdDe, dataDe, diaSemanaDe, semanaDoMes, rotuloMes,
  segundaDaSemanaDe, faixaDaSemana,
} from './datas-treino.js';

test('dateId e mesId saem no horario local, sem pulo de fuso', () => {
  // 23h de 11/09 no Brasil já é 12/09 em UTC: `toISOString()` jogaria o treino
  // para o dia seguinte, e o coach veria o treino de ontem na data de hoje.
  const noite = new Date(2026, 8, 11, 23, 30);
  assert.equal(dateIdDe(noite), '2026-09-11');
  assert.equal(mesIdDe(noite), '2026-09');
  assert.equal(dateIdDe(new Date(2026, 0, 5)), '2026-01-05', 'mes e dia com zero a esquerda');
});

test('dataDe e dateIdDe sao ida e volta', () => {
  for (const id of ['2026-01-01', '2026-09-11', '2026-12-31']) {
    assert.equal(dateIdDe(dataDe(id)), id);
  }
  assert.equal(dataDe('2026-09-11').getHours(), 0, 'meia-noite local');
});

test('dia da semana e semana do mes', () => {
  assert.equal(diaSemanaDe('2026-09-11'), 'sex');
  assert.equal(diaSemanaDe('2026-09-13'), 'dom');
  assert.equal(semanaDoMes(new Date(2026, 8, 1)), 1);
  assert.equal(semanaDoMes(new Date(2026, 8, 8)), 2);
  assert.equal(semanaDoMes(new Date(2026, 8, 30)), 5);
  assert.equal(rotuloMes('2026-06'), 'Junho/2026');
});

test('a semana comeca na segunda, e o domingo fecha a de tras', () => {
  assert.equal(dateIdDe(segundaDaSemanaDe('2026-09-11')), '2026-09-07', 'sexta puxa a segunda da mesma semana');
  assert.equal(dateIdDe(segundaDaSemanaDe('2026-09-07')), '2026-09-07', 'segunda e a propria');
  assert.equal(dateIdDe(segundaDaSemanaDe('2026-09-13')), '2026-09-07', 'domingo fecha a semana que comecou dia 7');
});

test('a faixa da semana atravessa o mes', () => {
  // A semana de 31/08 a 06/09 é o caso que a divisão do histórico por mês tem
  // que suportar: dois documentos, uma semana só.
  assert.deepEqual(faixaDaSemana('2026-09-02'), { ini: '2026-08-31', fim: '2026-09-06' });
  assert.deepEqual(faixaDaSemana('2026-08-31'), { ini: '2026-08-31', fim: '2026-09-06' });
});
