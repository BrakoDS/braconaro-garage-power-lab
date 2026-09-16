// @ts-check
/**
 * Rodar: node --test compartilhado/firebase/treinos-por-mes.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mesDe, assinatura, agruparPorMes, juntarMeses, precisaMigrar,
  fundirTreinos, fatiaDoDoc, temConteudo, mesesQueMudaram,
} from './treinos-por-mes.js';

const treino = (/** @type {string} */ n) => ({ dia: 'seg', modalidade: n, volPorPadrao: { empurrar: 6 } });

test('agrupa por mes e volta inteiro', () => {
  const treinos = { '2026-07-20': treino('a'), '2026-08-03': treino('b'), '2026-08-05': treino('c') };
  const meses = agruparPorMes(treinos);
  assert.deepEqual(Object.keys(meses).sort(), ['2026-07', '2026-08']);
  assert.deepEqual(Object.keys(meses['2026-08']), ['2026-08-03', '2026-08-05']);
  assert.deepEqual(juntarMeses(meses), treinos, 'ida e volta nao pode perder nem inventar treino');
  assert.equal(mesDe('2026-12-31'), '2026-12');
});

test('assinatura ignora a ordem das chaves, e so a ordem', () => {
  assert.equal(assinatura({ a: 1, b: [1, { x: 1, y: 2 }] }), assinatura({ b: [1, { y: 2, x: 1 }], a: 1 }));
  assert.notEqual(assinatura({ a: 1 }), assinatura({ a: 2 }));
  assert.notEqual(assinatura([1, 2]), assinatura([2, 1]), 'ordem de lista e conteudo, nao arrumacao');
  assert.notEqual(assinatura({ a: 1 }), assinatura({ a: 1, b: undefined }) , 'campo a mais e diferenca');
});

test('precisaMigrar so acusa formato antigo com conteudo', () => {
  assert.equal(precisaMigrar(null), false);
  assert.equal(precisaMigrar({ alunos: [], config: {} }), false);
  assert.equal(precisaMigrar({ treinos: {}, programas: {} }), false, 'campo vazio nao e migracao pendente');
  assert.equal(precisaMigrar({ treinos: { '2026-08-03': treino('b') } }), true);
  assert.equal(precisaMigrar({ programas: { s1: {} } }), true, 'so os programas antigos ja pedem o arquivo');
});

test('na fusao o legado do documento do coach ganha do mes', () => {
  // Aba velha salvou de novo o dia 03 depois da migração: o que ela gravou é o
  // que o coach acabou de fazer lá, e não pode ser descartado.
  const dosMeses = { '2026-08-03': treino('mes'), '2026-08-05': treino('so-no-mes') };
  const doLegado = { '2026-08-03': treino('legado'), '2026-08-10': treino('so-no-legado') };
  const r = fundirTreinos(dosMeses, doLegado);
  assert.equal(r['2026-08-03'].modalidade, 'legado');
  assert.equal(r['2026-08-05'].modalidade, 'so-no-mes', 'o que so existe no mes continua');
  assert.equal(r['2026-08-10'].modalidade, 'so-no-legado');
});

test('a fatia do documento leva so os campos pedidos', () => {
  const est = { alunos: [{ id: 'a1' }], config: { meta: 12 }, treinos: { '2026-08-03': treino('b') }, programas: { s1: {} } };
  assert.deepEqual(fatiaDoDoc(est, ['alunos', 'config']), { alunos: [{ id: 'a1' }], config: { meta: 12 } });
  assert.deepEqual(fatiaDoDoc(est, ['config']), { config: { meta: 12 } }, 'o app novo guarda so config: alunos vem da Gestao');
  assert.deepEqual(fatiaDoDoc(null, ['alunos', 'config']), {});
  assert.deepEqual(fatiaDoDoc({ config: {} }, ['alunos', 'config']), { config: {} }, 'campo ausente nao vira campo vazio no documento');
});

test('temConteudo decide entre adotar a nuvem e semear com o local', () => {
  assert.equal(temConteudo(null, ['config']), false);
  assert.equal(temConteudo({ treinos: {}, config: {}, alunos: [] }, ['alunos', 'config']), false, 'tudo vazio nao e conteudo');
  assert.equal(temConteudo({ treinos: { '2026-08-03': treino('b') } }, ['config']), true);
  assert.equal(temConteudo({ config: { meta: 12 } }, ['config']), true);
  assert.equal(temConteudo({ programas: { s1: {} } }, ['config']), true, 'so o legado ja conta, senao o login o apagaria');
  assert.equal(temConteudo({ alunos: [{ id: 'a1' }] }, ['config']), false, 'campo fora da lista do app nao conta');
});

test('so reenvia o mes que mudou', () => {
  const antes = agruparPorMes({ '2026-07-20': treino('a'), '2026-08-03': treino('b') });
  const agora = agruparPorMes({ '2026-07-20': treino('a'), '2026-08-03': treino('B!'), '2026-09-01': treino('c') });
  assert.deepEqual(mesesQueMudaram(antes, agora), ['2026-08', '2026-09']);
  assert.deepEqual(mesesQueMudaram(antes, antes), [], 'estado intocado nao manda nada');
});

test('mes que ficou sem treino entra na lista, para esvaziar o documento', () => {
  // Sem isso, o treino apagado volta no próximo login: o documento do mês continua
  // na nuvem com o conteúdo velho, e ninguém reescreve.
  const antes = agruparPorMes({ '2026-07-20': treino('a'), '2026-08-03': treino('b') });
  const agora = agruparPorMes({ '2026-08-03': treino('b') });
  assert.deepEqual(mesesQueMudaram(antes, agora), ['2026-07']);
});
