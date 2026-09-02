// @ts-check
/**
 * Testes da meta de água.
 * Rodar: node --test aluno/hidratacao.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaAgua, emLitros, emGarrafas, ML_POR_KG, ML_TREINO } from './hidratacao.js';

test('82 kg dá 2,85 L de base e 3,35 L no dia de treino', () => {
  const m = metaAgua(82);
  assert.equal(m.base, 2850);        // 82 × 35 = 2870, arredondado a 50
  assert.equal(m.comTreino, 3350);
});

test('o dia de treino é sempre 500 ml acima da base', () => {
  for (const peso of [45, 58, 70, 82, 96, 130]) {
    const m = metaAgua(peso);
    assert.equal(m.comTreino - m.base, ML_TREINO, `peso ${peso}`);
  }
});

test('a base fica na faixa de 30 a 40 ml por quilo', () => {
  for (const peso of [45, 58, 70, 82, 96, 130]) {
    const porKg = metaAgua(peso).base / peso;
    assert.ok(porKg >= 30 && porKg <= 40, `${peso} kg → ${porKg.toFixed(1)} ml/kg`);
  }
});

test('sempre múltiplo de 50 ml — o aluno mira com a garrafa, não com a régua', () => {
  for (const peso of [61.3, 74.7, 88.2, 102.9]) {
    assert.equal(metaAgua(peso).base % 50, 0, `peso ${peso}`);
  }
});

test('peso com vírgula é aceito', () => {
  assert.deepEqual(metaAgua('82,4').base, metaAgua(82.4).base);
});

test('sem peso não há meta — melhor não mostrar do que chutar', () => {
  assert.equal(metaAgua(null), null);
  assert.equal(metaAgua(''), null);
  assert.equal(metaAgua(0), null);
  assert.equal(metaAgua(-70), null);
  assert.equal(metaAgua('abc'), null);
});

test('o ml por kg é ajustável, e o padrão é 35', () => {
  assert.equal(ML_POR_KG, 35);
  assert.equal(metaAgua(100, { mlPorKg: 40 }).base, 4000);
});

test('litros com uma casa e vírgula', () => {
  assert.equal(emLitros(2850), '2,9');
  assert.equal(emLitros(3350), '3,4');
  assert.equal(emLitros(2000), '2,0');
});

test('garrafas arredondam para cima — o erro que importa é beber de menos', () => {
  assert.equal(emGarrafas(2850), 6);   // 5,7 garrafas de 500 ml
  assert.equal(emGarrafas(3000), 6);
  assert.equal(emGarrafas(3350), 7);
  assert.equal(emGarrafas(2850, 700), 5);
});

test('garrafas nunca é zero', () => {
  assert.equal(emGarrafas(0), 1);
  assert.equal(emGarrafas(100), 1);
});
