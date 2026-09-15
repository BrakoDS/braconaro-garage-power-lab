// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarHiitTabata, volumeHiit } from './hiitTabata.js';

test('cada slot continua valendo 2 series equivalentes', () => {
  const { estacoes } = gerarHiitTabata({ seed: 42 });
  const slots = estacoes.reduce((n, e) => n + e.slots.length, 0);
  const vol = volumeHiit(estacoes);
  assert.equal(vol.totalSeries, slots * 2);
});

test('o HIIT passa a contar musculo', () => {
  const { estacoes } = gerarHiitTabata({ seed: 42 });
  const vol = volumeHiit(estacoes);
  assert.ok(Object.keys(vol.porMusculo).length > 0, 'porMusculo nao pode mais vir vazio');
});

test('musculo primario conta o dobro do secundario', () => {
  // Estacao realista de 4 slots (o tamanho fixo de toda estacao de HIIT), os 4 com
  // flexao: musculosPrimarios=['peito'], musculosSecundarios=['triceps','ombro','core']
  // (compartilhado/dados/exercicios.js). Aritmetica: 16 rounds / 4 slots = 4 rounds
  // por slot x 20s = 80s de trabalho = 2 series por slot (regua de 40s/serie).
  // peito (primario)      = 4 slots x 2 series x 1,0 = 8
  // triceps/ombro/core (secundarios) = 4 slots x 2 series x 0,5 = 4 cada
  const estacoes = [{ slots: [{ id: 'flexao' }, { id: 'flexao' }, { id: 'flexao' }, { id: 'flexao' }] }];
  const vol = volumeHiit(estacoes);
  assert.equal(vol.porMusculo.peito, 8, 'primario: 4 slots x 2 series x 1,0');
  assert.equal(vol.porMusculo.triceps, 4, 'secundario: 4 slots x 2 series x 0,5');
  assert.equal(vol.porMusculo.ombro, 4, 'secundario: 4 slots x 2 series x 0,5');
  assert.equal(vol.porMusculo.core, 4, 'secundario: 4 slots x 2 series x 0,5');
  assert.equal(vol.porMusculo.peito, vol.porMusculo.triceps * 2, 'primario conta o dobro do secundario');
});

test('slot com id desconhecido nao quebra nem conta', () => {
  const vol = volumeHiit([{ slots: [{ id: 'nao_existe' }] }]);
  assert.equal(vol.totalSeries, 0);
  assert.deepEqual(vol.porMusculo, {});
});
