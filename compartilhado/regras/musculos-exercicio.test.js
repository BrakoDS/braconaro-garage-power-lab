// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarSeparacao, temSeparacao, precisaRevisaoMusculos, musculosParaMontador,
} from './musculos-exercicio.js';

const CHAVE = { 'Peito': 'peito', 'Tríceps': 'triceps', 'Ombro': 'ombro', 'Bíceps': 'biceps', 'Costas': 'costas' };

test('normalizarSeparacao tira repeticao, e o secundario que ja e primario some', () => {
  const r = normalizarSeparacao({ primarios: ['Peito', 'Peito'], secundarios: ['Tríceps', 'Peito', 'Tríceps'] });
  assert.deepEqual(r.musculosPrimarios, ['Peito']);
  assert.deepEqual(r.musculosSecundarios, ['Tríceps']);
});

test('normalizarSeparacao junta em musculos com os primarios primeiro', () => {
  const r = normalizarSeparacao({ primarios: ['Costas'], secundarios: ['Bíceps', 'Ombro'] });
  assert.deepEqual(r.musculos, ['Costas', 'Bíceps', 'Ombro']);
});

test('normalizarSeparacao aceita entrada torta sem quebrar', () => {
  assert.deepEqual(normalizarSeparacao({ primarios: null, secundarios: 'Peito' }),
    { musculosPrimarios: [], musculosSecundarios: [], musculos: [] });
  assert.deepEqual(normalizarSeparacao({ primarios: ['Peito', '', 3] }).musculosPrimarios, ['Peito']);
  assert.deepEqual(normalizarSeparacao().musculos, []);
});

test('precisaRevisaoMusculos so acusa exercicio com musculo e sem separacao', () => {
  assert.equal(precisaRevisaoMusculos({ musculos: ['Peito'] }), true);
  assert.equal(precisaRevisaoMusculos({ musculos: ['Peito'], musculosPrimarios: ['Peito'] }), false);
  assert.equal(precisaRevisaoMusculos({ musculos: [] }), false);
  assert.equal(precisaRevisaoMusculos(null), false);
  assert.equal(temSeparacao({ musculosPrimarios: [] }), true);
});

test('musculosParaMontador: a separacao gravada na Academia vence o catalogo base', () => {
  const base = { musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro'] };
  const editado = { musculosPrimarios: ['Peito', 'Tríceps'], musculosSecundarios: ['Ombro'] };
  assert.deepEqual(musculosParaMontador(editado, base, CHAVE),
    { musculosPrimarios: ['peito', 'triceps'], musculosSecundarios: ['ombro'] });
});

test('musculosParaMontador: primario vence o secundario repetido, e rotulo desconhecido some', () => {
  const a = { musculosPrimarios: ['Costas', 'Deltoide inventado'], musculosSecundarios: ['Costas', 'Bíceps'] };
  assert.deepEqual(musculosParaMontador(a, undefined, CHAVE),
    { musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'] });
});

test('musculosParaMontador: sem separacao e com catalogo base, vale o base', () => {
  const base = { musculosPrimarios: ['peito'], musculosSecundarios: ['triceps'] };
  const r = musculosParaMontador({ musculos: ['Peito', 'Tríceps'] }, base, CHAVE);
  assert.deepEqual(r, { musculosPrimarios: ['peito'], musculosSecundarios: ['triceps'] });
  r.musculosPrimarios.push('x');
  assert.deepEqual(base.musculosPrimarios, ['peito'], 'devolve copia, nao o array do catalogo');
});

test('musculosParaMontador: sem separacao e sem base, tudo vira primario', () => {
  assert.deepEqual(musculosParaMontador({ musculos: ['Peito', 'Tríceps'] }, undefined, CHAVE),
    { musculosPrimarios: ['peito', 'triceps'], musculosSecundarios: [] });
});
