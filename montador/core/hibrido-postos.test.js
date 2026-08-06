import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARES_ANTAGONISTAS, calcularPostos, calcularSeries, SERIE_SEG } from './hibrido-postos.js';

test('os 4 pares vêm na ordem de prioridade do spec', () => {
  assert.deepEqual(PARES_ANTAGONISTAS.map((p) => p.id),
    ['peito_costas', 'quadriceps_posterior', 'bracos', 'core']);
});

test('cada par declara os músculos dos dois lados', () => {
  const pernas = PARES_ANTAGONISTAS.find((p) => p.id === 'quadriceps_posterior');
  assert.deepEqual(pernas.a, ['quadriceps']);
  assert.deepEqual(pernas.b, ['posterior_coxa', 'gluteo']);
});

test('postos = alunas / 2, arredondando pra cima, teto de 4', () => {
  assert.equal(calcularPostos(6), 3);   // a aula real do coach
  assert.equal(calcularPostos(7), 4);   // ímpar arredonda pra cima (gera um trio)
  assert.equal(calcularPostos(8), 4);
  assert.equal(calcularPostos(12), 4);  // teto
  assert.equal(calcularPostos(1), 1);   // piso
});

test('séries seguram o bloco em 24 min: postos x séries = 12', () => {
  assert.equal(calcularSeries(3), 4);
  assert.equal(calcularSeries(4), 3);
  assert.equal(3 * calcularSeries(3) * SERIE_SEG, 24 * 60);
  assert.equal(4 * calcularSeries(4) * SERIE_SEG, 24 * 60);
});

test('turma minúscula não explode as séries (clamp em 4)', () => {
  assert.equal(calcularSeries(1), 4);
  assert.equal(calcularSeries(2), 4);
});
