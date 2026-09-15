// @ts-check
/**
 * A semente da Academia passou a separar primário e secundário. Este teste prova
 * que a separação é fiel ao catálogo base — é a garantia de que os 136 exercícios
 * semeados não mudam de número quando a Academia começar a mandar na separação.
 *
 * Rodar: node --test coach/academia/data/seed.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from './seed.js';
import { EXERCICIO_BASE_POR_ID } from '../../../compartilhado/dados/exercicios.js';
import { MUSC_MAP } from '../../../compartilhado/config/musculos.js';
import { musculosParaMontador } from '../../../compartilhado/regras/musculos-exercicio.js';

const CHAVE_DO_ROTULO = Object.fromEntries(Object.entries(MUSC_MAP).map(([k, v]) => [v, k]));

test('todo exercicio semeado sai com primario e secundario separados', () => {
  for (const x of seedData().exercicios) {
    assert.ok(Array.isArray(x.musculosPrimarios), `${x.id} sem musculosPrimarios`);
    assert.ok(Array.isArray(x.musculosSecundarios), `${x.id} sem musculosSecundarios`);
  }
});

test('a separacao da semente devolve exatamente os musculos do catalogo base', () => {
  for (const x of seedData().exercicios) {
    const base = EXERCICIO_BASE_POR_ID[x.id];
    const lido = musculosParaMontador(x, undefined, CHAVE_DO_ROTULO);
    assert.deepEqual(lido.musculosPrimarios, base.musculosPrimarios, `${x.id}: primarios`);
    assert.deepEqual(lido.musculosSecundarios, base.musculosSecundarios, `${x.id}: secundarios`);
  }
});

test('musculos continua sendo a uniao, na mesma ordem de antes', () => {
  for (const x of seedData().exercicios) {
    const base = EXERCICIO_BASE_POR_ID[x.id];
    const antes = [...new Set([...(base.musculosPrimarios || []), ...(base.musculosSecundarios || [])]
      .map((m) => MUSC_MAP[m]).filter(Boolean))];
    assert.deepEqual(x.musculos, antes, x.id);
  }
});
