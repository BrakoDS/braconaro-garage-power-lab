// @ts-check
/**
 * Rodar: node --test compartilhado/regras/metas-aluno.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metasDoAluno, saldoPorGrupo, focoDe, META_SERIES_SEMANAIS, META_PADRAO } from './metas-aluno.js';
import { GRUPOS } from './grupos.js';

test('o foco levanta a meta so do grupo em foco', () => {
  const metas = metasDoAluno({ objetivo: 'Hipertrofia', foco: ['perna'] });
  assert.equal(metas.perna, META_SERIES_SEMANAIS.hipertrofia[1]);
  assert.equal(metas.peito, META_SERIES_SEMANAIS.hipertrofia[0]);
  assert.deepEqual(Object.keys(metas).sort(), [...GRUPOS].sort(), 'todo grupo tem meta');
});

test('sem objetivo, a meta e a padrao — e nao a ausencia de meta', () => {
  // Sem número, a redistribuição por foco não teria como escolher de onde tirar.
  const metas = metasDoAluno({});
  assert.equal(metas.peito, META_PADRAO[0]);
  assert.equal(metasDoAluno({ objetivo: 'Reabilitação' }).peito, META_PADRAO[0]);
  assert.equal(metasDoAluno(null).peito, META_PADRAO[0]);
});

test('o foco vale no maximo dois grupos, e so grupo que existe', () => {
  assert.deepEqual(focoDe({ foco: ['perna', 'braco', 'peito'] }), ['perna', 'braco']);
  assert.deepEqual(focoDe({ foco: ['panturrilha', 'costas'] }), ['costas'], 'panturrilha nao e um dos sete');
  assert.deepEqual(focoDe({}), []);
  assert.deepEqual(focoDe({ foco: 'perna' }), [], 'texto solto nao vira foco');
});

test('a meta escrita na ficha vence a da tabela', () => {
  const metas = metasDoAluno({ objetivo: 'Hipertrofia', foco: ['perna'], metas: { peito: 14, perna: 20 } });
  assert.equal(metas.peito, 14);
  assert.equal(metas.perna, 20, 'a sobrescrita vence ate a meta de foco');
});

test('sobrescrita invalida e ignorada, sem derrubar as outras', () => {
  const metas = metasDoAluno({ objetivo: 'Hipertrofia', metas: { peito: 0, costas: -3, ombro: 'muito', inventado: 12, braco: 11 } });
  assert.equal(metas.peito, META_SERIES_SEMANAIS.hipertrofia[0], 'zero nao e meta');
  assert.equal(metas.costas, META_SERIES_SEMANAIS.hipertrofia[0]);
  assert.equal(metas.ombro, META_SERIES_SEMANAIS.hipertrofia[0]);
  assert.equal(metas.braco, 11);
  assert.ok(!('inventado' in metas), 'grupo que nao existe nao entra na conta');
});

test('o saldo diz quem esta acima e quem esta abaixo da meta', () => {
  const perfil = { objetivo: 'Hipertrofia', foco: ['perna'] }; // comum 10, foco 16
  const saldo = saldoPorGrupo({ peito: 14, perna: 6 }, perfil);
  assert.equal(saldo.peito, 4, 'peito passou da meta: candidato a ceder serie');
  assert.equal(saldo.perna, -10);
  assert.equal(saldo.costas, -10, 'grupo ainda nao treinado entra negativo');
});

test('cada objetivo da tabela tem meta comum menor que a de foco', () => {
  for (const [id, [comum, foco]] of Object.entries(META_SERIES_SEMANAIS)) {
    assert.ok(comum > 0 && foco > comum, `${id}: meta de foco tem que ser maior que a comum`);
  }
});
