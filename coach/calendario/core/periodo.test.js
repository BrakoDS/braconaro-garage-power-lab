// @ts-check
/** Rodar: node --test coach/calendario/core/periodo.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDias, diaDaSemana, segundaDe, datasDoPeriodo, gradeDoMes, navegar, rotuloPeriodo, relogioLocal, isoLocal } from './periodo.js';

test('datas: somar dias atravessa mês e ano', () => {
  assert.equal(addDias('2026-11-30', 1), '2026-12-01');
  assert.equal(addDias('2026-12-31', 1), '2027-01-01');
  assert.equal(addDias('2026-03-01', -1), '2026-02-28');
});

test('semana: de segunda a domingo, a partir de qualquer dia dela', () => {
  assert.equal(diaDaSemana('2026-11-02'), 1, '02/11/2026 é segunda');
  assert.equal(segundaDe('2026-11-04'), '2026-11-02');
  assert.equal(segundaDe('2026-11-08'), '2026-11-02', 'domingo pertence à semana que começou na segunda anterior');
  assert.deepEqual(datasDoPeriodo('semana', '2026-11-04'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(datasDoPeriodo('semana', '2026-12-31')[0], '2026-12-28', 'virada de ano');
});

test('mês e dia: as datas do período', () => {
  const nov = datasDoPeriodo('mes', '2026-11-17');
  assert.equal(nov.length, 30);
  assert.equal(nov[0], '2026-11-01');
  assert.equal(nov.at(-1), '2026-11-30');
  assert.deepEqual(datasDoPeriodo('dia', '2026-11-30'), ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
});

test('gradeDoMes: semanas de domingo a sábado cobrindo o mês inteiro', () => {
  const nov = gradeDoMes('2026-11-10');
  assert.equal(nov.length, 5);
  assert.equal(nov[0][0], '2026-11-01', '01/11/2026 é domingo');
  assert.equal(nov[4][6], '2026-12-05');
  const fev = gradeDoMes('2026-02-01');
  assert.equal(fev.length, 4, 'fev/2026 começa num domingo e tem 28 dias');
  assert.ok(gradeDoMes('2026-08-15').every((s) => s.length === 7));
});

test('navegar: semana anda 7 dias, mês cai no dia 1, dia anda 1', () => {
  assert.equal(navegar('semana', '2026-11-04', 1), '2026-11-11');
  assert.equal(navegar('mes', '2026-01-31', -1), '2025-12-01');
  assert.equal(navegar('mes', '2026-12-15', 1), '2027-01-01');
  assert.equal(navegar('dia', '2026-11-30', 1), '2026-12-01');
});

test('rótulos: semana de segunda a sábado, mês e dia por extenso', () => {
  assert.equal(rotuloPeriodo('semana', '2026-11-04'), '2 – 7 NOV 2026');
  assert.equal(rotuloPeriodo('semana', '2026-11-30'), '30 NOV – 5 DEZ 2026');
  assert.equal(rotuloPeriodo('semana', '2026-12-29'), '28 DEZ 2026 – 2 JAN 2027');
  assert.equal(rotuloPeriodo('mes', '2026-11-04'), 'NOVEMBRO 2026');
  assert.equal(rotuloPeriodo('dia', '2026-11-02'), 'SEGUNDA · 02/11/2026');
});

test('relógio: hoje no fuso local, mesmo às 21h30 (onde o UTC já virou o dia em UTC-3)', () => {
  const d = new Date(2026, 10, 2, 21, 30);
  assert.deepEqual(relogioLocal(d), { hoje: '2026-11-02', agora: '21:30' });
  assert.equal(isoLocal(new Date(2026, 0, 5)), '2026-01-05');
});
