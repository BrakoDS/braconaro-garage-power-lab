// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVolume, somarVolumes, projetarMensal, CREDITO_WOD } from './volume.js';

const supino = {
  id: 'supino', nome: 'Supino', padrao: 'empurrar',
  musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
};

test('primario conta 1,0 e secundario 0,5 por serie', () => {
  const v = calcularVolume([{ exercicio: supino, series: 4 }]);
  assert.equal(v.porMusculo.peito, 4);
  assert.equal(v.porMusculo.triceps, 2);
  assert.equal(v.porMusculo.ombro, 2);
  assert.equal(v.porPadrao.empurrar, 4);
  assert.equal(v.totalSeries, 4);
});

test('serie fracionada e aceita — e o que as estruturas por tempo produzem', () => {
  const v = calcularVolume([{ exercicio: supino, series: 0.5 }]);
  assert.equal(v.porMusculo.peito, 0.5);
  assert.equal(v.porMusculo.triceps, 0.25);
});

test('um objeto simples serve de exercicio: so padrao e os dois musculos', () => {
  const estacao = { padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'] };
  const v = calcularVolume([{ exercicio: estacao, series: 3 }]);
  assert.equal(v.porMusculo.quadriceps, 3);
  assert.equal(v.porMusculo.gluteo, 1.5);
});

test('o mesmo exercicio duas vezes soma', () => {
  const v = calcularVolume([{ exercicio: supino, series: 3 }, { exercicio: supino, series: 2 }]);
  assert.equal(v.porMusculo.peito, 5);
  assert.equal(v.totalSeries, 5);
});

test('lista vazia da zeros, nao quebra', () => {
  const v = calcularVolume([]);
  assert.deepEqual(v.porMusculo, {});
  assert.equal(v.totalSeries, 0);
});

test('somarVolumes junta musculo, padrao e total', () => {
  const a = calcularVolume([{ exercicio: supino, series: 3 }]);
  const b = calcularVolume([{ exercicio: supino, series: 2 }]);
  const s = somarVolumes([a, b]);
  assert.equal(s.porMusculo.peito, 5);
  assert.equal(s.porPadrao.empurrar, 5);
  assert.equal(s.totalSeries, 5);
});

test('projetarMensal escala por 4,33 e arredonda', () => {
  const m = projetarMensal(calcularVolume([{ exercicio: supino, series: 3 }]));
  assert.equal(m.porMusculo.peito, 13); // 3 * 4,33 = 12,99
});

test('CREDITO_WOD continua valendo 2,5 para quem ainda o usa', () => {
  assert.equal(CREDITO_WOD, 2.5);
});

test('exercicio sem musculosSecundarios nao derruba a conta', () => {
  const v = calcularVolume([{ exercicio: { padrao: 'empurrar', musculosPrimarios: ['peito'] }, series: 2 }]);
  assert.equal(v.porMusculo.peito, 2);
  assert.equal(v.totalSeries, 2);
});

test('exercicio sem musculosPrimarios nao derruba a conta', () => {
  const v = calcularVolume([{ exercicio: { padrao: 'puxar', musculosSecundarios: ['biceps'] }, series: 4 }]);
  assert.equal(v.porMusculo.biceps, 2); // secundário: 0,5 × 4
  assert.equal(v.porPadrao.puxar, 4);
});

test('exercicio sem padrao conta no total e no musculo, mas nao cria a chave "undefined"', () => {
  const v = calcularVolume([{ exercicio: { musculosPrimarios: ['core'], musculosSecundarios: [] }, series: 3 }]);
  assert.equal(v.totalSeries, 3);
  assert.equal(v.porMusculo.core, 3);
  assert.deepEqual(Object.keys(v.porPadrao), []);
});
