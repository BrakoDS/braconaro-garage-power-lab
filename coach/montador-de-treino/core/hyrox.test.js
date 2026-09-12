// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYROX_ESTACOES, volumeHyrox } from './hyrox.js';

test('toda estacao declara ao menos um musculo primario', () => {
  for (const e of HYROX_ESTACOES) {
    assert.ok(Array.isArray(e.musculos) && e.musculos.length > 0, `estacao sem musculo: ${e.nome}`);
  }
});

test('o Hyrox passa a contar musculo', () => {
  const vol = volumeHyrox();
  assert.ok(Object.keys(vol.porMusculo).length > 0, 'porMusculo nao pode mais vir vazio');
});

test('a prova inteira continua distribuida entre os padroes', () => {
  const vol = volumeHyrox();
  assert.ok(vol.porPadrao.puxar > 0);
  assert.ok(vol.porPadrao.quadriceps > 0);
  assert.ok(vol.totalSeries > 0);
});

test('nivel mais alto da mais volume — a prescricao escala', () => {
  const ini = volumeHyrox(HYROX_ESTACOES, 'iniciante');
  const comp = volumeHyrox(HYROX_ESTACOES, 'competitivo');
  assert.ok(comp.totalSeries > ini.totalSeries);
});

test('subconjunto de estacoes conta menos que a prova inteira', () => {
  const parcial = volumeHyrox(HYROX_ESTACOES.slice(0, 3));
  const inteira = volumeHyrox();
  assert.ok(parcial.totalSeries < inteira.totalSeries);
});
