// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/portal-merge.test.js
 *
 * Cobre a união das presenças que o Garage App avisa pela caixa de entrada. É a
 * única parte do merge que mexe no REGISTRO DO COACH sem ele ter clicado em
 * nada, então a regra precisa ser à prova de caixa malformada: quem escreve a
 * caixa é o aparelho do aluno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mesclarPresencas } from './portal-merge.js';

test('acrescenta o dia novo mantendo os que já existiam, em ordem', () => {
  assert.deepEqual(
    mesclarPresencas(['2026-09-14', '2026-09-18'], ['2026-09-16']),
    ['2026-09-14', '2026-09-16', '2026-09-18'],
  );
});

test('dia que o coach já marcou não é novidade', () => {
  assert.equal(mesclarPresencas(['2026-09-16'], ['2026-09-16']), null);
});

test('o mesmo dia repetido na caixa entra uma vez só', () => {
  assert.deepEqual(mesclarPresencas([], ['2026-09-16', '2026-09-16']), ['2026-09-16']);
});

test('caixa vazia ou sem o campo não mexe na ficha', () => {
  assert.equal(mesclarPresencas(['2026-09-16'], []), null);
  assert.equal(mesclarPresencas(['2026-09-16'], undefined), null);
  assert.equal(mesclarPresencas(['2026-09-16'], 'nao-e-lista'), null);
});

test('ficha sem presenças ainda aceita a primeira', () => {
  assert.deepEqual(mesclarPresencas(undefined, ['2026-09-16']), ['2026-09-16']);
});

test('lixo na caixa é descartado, e o que presta continua entrando', () => {
  assert.deepEqual(
    mesclarPresencas([], ['2026-09-16', '16/09/2026', '', null, 42, '2026-9-1']),
    ['2026-09-16'],
  );
});

test('caixa só com lixo não vira gravação', () => {
  assert.equal(mesclarPresencas(['2026-09-14'], ['ontem', {}]), null);
});

test('a ficha nunca perde um dia que já tinha', () => {
  const antes = ['2026-09-01', '2026-09-02', '2026-09-03'];
  const depois = mesclarPresencas(antes, ['2026-09-10']);
  assert.ok(depois);
  antes.forEach((d) => assert.ok(depois.includes(d), `sumiu ${d}`));
});
