// @ts-check
/**
 * Rodar: node --test compartilhado/config/objetivos.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJETIVOS, OBJETIVO_IDS, OBJETIVO_LABELS, objetivoDe } from './objetivos.js';

test('todo objetivo tem id igual a chave e rotulo', () => {
  for (const id of OBJETIVO_IDS) {
    assert.equal(OBJETIVOS[id].id, id);
    assert.ok(OBJETIVOS[id].label, `${id} sem rotulo`);
  }
  assert.equal(OBJETIVO_LABELS.length, OBJETIVO_IDS.length);
});

test('a ordem dos rotulos e a que a ficha da Gestao sempre mostrou', () => {
  // A lista saiu de dentro da Gestão; mudar a ordem aqui mexeria na caixa de
  // seleção que o coach usa há meses, sem ninguém ter pedido.
  assert.deepEqual(OBJETIVO_LABELS, ['Emagrecimento', 'Hipertrofia', 'Condicionamento', 'Saúde / qualidade de vida', 'Outro']);
});

test('a prescricao esta completa em quem tem, e ausente em "Outro"', () => {
  for (const id of OBJETIVO_IDS) {
    const o = OBJETIVOS[id];
    if (id === 'outro') { assert.equal(o.reps, undefined, '"Outro" vale o que o coach digitou'); continue; }
    assert.ok(o.reps, `${id} sem faixa de repeticoes`);
    assert.equal(o.descansoSeg?.length, 2, `${id}: descanso tem que ser [min, max]`);
    assert.ok(o.descansoSeg[0] <= o.descansoSeg[1], `${id}: descanso invertido`);
    assert.equal(o.cargaPct?.length, 2, `${id}: carga tem que ser [min, max]`);
    assert.ok(o.cargaPct[0] <= o.cargaPct[1], `${id}: carga invertida`);
  }
  assert.equal(OBJETIVOS.saude.tecnica, undefined, 'saude nao sugere tecnica avancada');
});

test('o rotulo salvo na ficha resolve para o objetivo, com ou sem acento', () => {
  // A ficha guarda o rótulo desde sempre, digitado por humano e migrado por anos.
  assert.equal(objetivoDe('Saúde / qualidade de vida')?.id, 'saude');
  assert.equal(objetivoDe('saude / qualidade de vida')?.id, 'saude', 'sem acento tambem resolve');
  assert.equal(objetivoDe('  Hipertrofia  ')?.id, 'hipertrofia');
  assert.equal(objetivoDe('hipertrofia')?.id, 'hipertrofia', 'a chave tambem vale');
});

test('ficha sem objetivo, ou com objetivo que ninguem conhece, nao quebra', () => {
  // É o estado da maioria das fichas. Um erro aqui derrubaria a turma inteira.
  assert.equal(objetivoDe(''), null);
  assert.equal(objetivoDe(undefined), null);
  assert.equal(objetivoDe('Reabilitação de ombro'), null);
});
