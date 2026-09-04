// @ts-check
/**
 * Testes de quem já apareceu na semana.
 * Rodar: node --test montador/core/usados.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idsUsadosEm } from './usados.js';

test('sem treinos, ninguém foi usado', () => {
  assert.equal(idsUsadosEm([]).size, 0);
  assert.equal(idsUsadosEm(undefined).size, 0);
});

test('pega os exercícios do formato plano (Automático e Manual em blocos)', () => {
  const ids = idsUsadosEm([
    { dateId: '2026-09-01', exercicios: [{ id: 'supino_smith' }, { id: 'remada_curvada' }] },
  ]);
  assert.deepEqual([...ids].sort(), ['remada_curvada', 'supino_smith']);
});

test('pega os exercícios de dentro dos blocos do Treino Livre', () => {
  const ids = idsUsadosEm([
    { dateId: '2026-09-01', livre: { blocos: [
      { nome: 'Principal', exercicios: [{ id: 'agachamento_livre' }] },
      { nome: 'WOD', exercicios: [{ id: 'burpee' }] },
    ] } },
  ]);
  assert.deepEqual([...ids].sort(), ['agachamento_livre', 'burpee']);
});

test('um dia pode ter os dois formatos e os dois contam', () => {
  const ids = idsUsadosEm([
    { dateId: '2026-09-01', exercicios: [{ id: 'supino_smith' }],
      livre: { blocos: [{ exercicios: [{ id: 'burpee' }] }] } },
  ]);
  assert.deepEqual([...ids].sort(), ['burpee', 'supino_smith']);
});

test('o próprio dia é excluído — senão o coach veria o aviso pelo que ele acabou de montar', () => {
  const treinos = [
    { dateId: '2026-09-01', exercicios: [{ id: 'supino_smith' }] },
    { dateId: '2026-09-02', exercicios: [{ id: 'remada_curvada' }] },
  ];
  assert.deepEqual([...idsUsadosEm(treinos, '2026-09-02')], ['supino_smith']);
});

test('sem dia a excluir, conta todos', () => {
  const treinos = [
    { dateId: '2026-09-01', exercicios: [{ id: 'supino_smith' }] },
    { dateId: '2026-09-02', exercicios: [{ id: 'remada_curvada' }] },
  ];
  assert.equal(idsUsadosEm(treinos).size, 2);
});

test('id repetido em dias diferentes aparece uma vez só', () => {
  const ids = idsUsadosEm([
    { dateId: '2026-09-01', exercicios: [{ id: 'burpee' }] },
    { dateId: '2026-09-02', livre: { blocos: [{ exercicios: [{ id: 'burpee' }] }] } },
  ]);
  assert.deepEqual([...ids], ['burpee']);
});

test('movimento de bloco de WOD conta como usado na semana', () => {
  // O bloco de WOD guarda os movimentos em `exercicios` com `id`, exatamente como
  // o bloco de séries — é por isso que este módulo não precisou de UMA linha nova
  // para enxergar o WOD do Treino Livre. Se alguém renomear aquela lista, este
  // teste cai, e o aviso "já na semana" fica cego para o WOD sem ninguém notar.
  const ids = idsUsadosEm([
    { dateId: '2026-09-01', livre: { blocos: [
      { tipo: 'series', exercicios: [{ id: 'supino' }] },
      { tipo: 'wod', formato: 'EMOM', exercicios: [{ id: 'burpee' }, { id: 'box_jump' }] },
    ] } },
  ]);
  assert.deepEqual([...ids].sort(), ['box_jump', 'burpee', 'supino']);
});

test('entrada malformada não quebra', () => {
  const ids = idsUsadosEm([
    { dateId: '2026-09-01', exercicios: [null, { nome: 'sem id' }, { id: '' }] },
    { dateId: '2026-09-02', livre: { blocos: null } },
    { dateId: '2026-09-03' },
  ]);
  assert.equal(ids.size, 0);
});
