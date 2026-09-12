// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarGap, volumeGap } from './gap.js';
import { SERIES_POR_ROUND } from '../data/gap.js';

test('a regua do GAP e a mesma de sempre: meia serie por round', () => {
  assert.equal(SERIES_POR_ROUND, 0.5);
});

test('uma aula inteira mantem o total que o coach ja lia', () => {
  const vol = volumeGap(gerarGap({ seed: 42 }));
  // 9 musicas x 8 rounds = 72 rounds, com pesos de variacao entre 0,75 e 1,25
  assert.ok(vol.totalSeries >= 30 && vol.totalSeries <= 45, `total fora da faixa: ${vol.totalSeries}`);
  assert.ok(Object.keys(vol.porMusculo).length > 0, 'GAP tem que contar musculo');
});

test('o volume do GAP e estavel para a mesma seed', () => {
  const a = volumeGap(gerarGap({ seed: 7 }));
  const b = volumeGap(gerarGap({ seed: 7 }));
  assert.deepEqual(a, b);
});
