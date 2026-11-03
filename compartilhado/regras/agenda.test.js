// @ts-check
/** Rodar: node --test compartilhado/regras/agenda.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxReav, eventosDoMes } from './agenda.js';

const alunos = [
  { id: 'A1', nome: 'Ana Lima', nascimento: '1995-10-12', avaliacoes: [{ dataRealizada: '2026-04-01', dataProxima: '2026-07-01' }, { dataRealizada: '2026-07-01', dataProxima: '2026-10-01' }] },
  { id: 'B2', nome: 'Bia', avaliacoes: [{ dataProxima: '2026-10-20' }] },
  { id: 'C3', nome: 'Caio', nascimento: '2000-10-12', status: 'inativo' },
];

test('proxReav: a dataProxima da avaliação REALIZADA mais recente', () => {
  assert.equal(proxReav(alunos[0]), '2026-10-01', 'a mais recente NÃO é a primeira da lista');
  assert.equal(proxReav(alunos[1]), null, 'sem dataRealizada não conta');
  assert.equal(proxReav({}), null);
});

test('eventosDoMes: reavaliação só no mês dela; aniversário todo ano com a idade; inativo fora', () => {
  assert.deepEqual(eventosDoMes(alunos, 2026, 10), {
    1: [{ tipo: 'reav', nome: 'Ana Lima', alunoId: 'A1' }],
    12: [{ tipo: 'aniv', nome: 'Ana Lima', alunoId: 'A1', idade: 31 }],
  });
  assert.deepEqual(eventosDoMes(alunos, 2027, 10), { 12: [{ tipo: 'aniv', nome: 'Ana Lima', alunoId: 'A1', idade: 32 }] }, 'a reavaliação não se repete no ano seguinte');
  assert.deepEqual(eventosDoMes(alunos, 2026, 11), {});
});
