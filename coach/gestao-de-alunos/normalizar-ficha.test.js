// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/normalizar-ficha.test.js
 *
 * A arrumação da ficha ao salvar: a hora antiga (uma para a semana toda) vira
 * a hora de cada dia que não tem a sua, e a idade guardada sai quando há
 * nascimento. Sem nascimento, a idade é o único dado — fica.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarFicha } from './normalizar-ficha.js?v=23';

test('horários: o dia marcado sem hora própria recebe a hora antiga; o que já tem, fica', () => {
  const r = normalizarFicha({ diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00' }, freqHorario: '19 Horas' });
  assert.deepEqual(r.patch.horarios, { seg: '07:00', qua: '19:00', sex: '19:00' });
});

test('horários: nada a fazer — todos os dias com hora, sem hora antiga, ou hora que não se lê', () => {
  assert.deepEqual(normalizarFicha({ diasTreino: ['seg'], horarios: { seg: '07:00' }, freqHorario: '19h' }).patch, {});
  assert.deepEqual(normalizarFicha({ diasTreino: ['seg'], horarios: {} }).patch, {});
  assert.deepEqual(normalizarFicha({ diasTreino: ['seg'], freqHorario: 'de manhã' }).patch, {}, 'texto que não é hora não vira hora');
  assert.deepEqual(normalizarFicha({ freqHorario: '19h' }).patch, {}, 'sem dia marcado, não inventa dia');
});

test('horários: sem `horarios` na ficha, o mapa nasce com os dias marcados', () => {
  assert.deepEqual(normalizarFicha({ diasTreino: ['ter', 'qui'], freqHorario: '6:30' }).patch.horarios, { ter: '06:30', qui: '06:30' });
});

test('idade: sai quando há nascimento (é calculada); sem nascimento, fica', () => {
  assert.deepEqual(normalizarFicha({ nascimento: '1995-03-10', idade: '30' }).remover, ['idade']);
  assert.deepEqual(normalizarFicha({ idade: '30' }).remover, [], 'sem nascimento, a idade é o único dado');
  assert.deepEqual(normalizarFicha({ nascimento: '1995-03-10' }).remover, [], 'nada a tirar');
  assert.deepEqual(normalizarFicha({ nascimento: '  ', idade: '30' }).remover, []);
});

test('a ficha não é alterada (a arrumação só devolve o que fazer)', () => {
  const a = { diasTreino: ['seg'], freqHorario: '19h', nascimento: '2000-01-01', idade: '26' };
  const copia = structuredClone(a);
  normalizarFicha(a);
  assert.deepEqual(a, copia);
});
