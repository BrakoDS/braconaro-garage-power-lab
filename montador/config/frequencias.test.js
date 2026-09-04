// @ts-check
/**
 * Testes das combinações de dias.
 * Rodar: node --test montador/config/frequencias.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBINACOES, COMBINACAO_POR_ID, ORDEM_DIAS, combosPorFrequencia, diasConsecutivos } from './frequencias.js';

test('a semana do box vai de segunda a sábado', () => {
  assert.deepEqual(ORDEM_DIAS, ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
});

test('existe a combinação de 6x, SEG a SÁB', () => {
  const c = COMBINACAO_POR_ID['6x-seg-sab'];
  assert.ok(c, 'a combinação 6x precisa existir');
  assert.equal(c.frequencia, 6);
  assert.deepEqual(c.dias, ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
});

test('combosPorFrequencia acha a de 6', () => {
  const seis = combosPorFrequencia(6);
  assert.equal(seis.length, 1);
  assert.equal(seis[0].id, '6x-seg-sab');
});

test('toda combinação tem tantos dias quanto sua frequência, sem repetir', () => {
  for (const c of COMBINACOES) {
    assert.equal(c.dias.length, c.frequencia, `${c.id} promete ${c.frequencia} dias`);
    assert.equal(new Set(c.dias).size, c.dias.length, `${c.id} repete dia`);
  }
});

test('toda combinação só usa dias que existem na semana do box', () => {
  for (const c of COMBINACOES) {
    for (const d of c.dias) assert.ok(ORDEM_DIAS.includes(d), `${c.id} usa "${d}", fora da semana`);
  }
});

test('sexta e sábado passam a ser consecutivos', () => {
  assert.equal(diasConsecutivos('sex', 'sab'), true);
  assert.equal(diasConsecutivos('sab', 'sex'), true);
});

test('dias distantes não são consecutivos', () => {
  assert.equal(diasConsecutivos('seg', 'qua'), false);
  assert.equal(diasConsecutivos('seg', 'sab'), false);
});
