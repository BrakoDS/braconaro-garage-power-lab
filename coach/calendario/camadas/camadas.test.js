// @ts-check
/** Rodar: node --test coach/calendario/camadas/camadas.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camadaFeriados, nomeCurtoDoFeriado } from './feriados.js';
import { camadaAniversarios } from './aniversarios.js';
import { camadaReavaliacoes } from './reavaliacoes.js';
import { CAMADAS } from './registro.js';

/** @param {any} o @returns {any} */
const ctx = (o = {}) => ({ fichas: [], meta: { turmas: {}, feriados: {} }, fechados: [], pendentes: {}, hoje: '2026-11-02', agora: '08:00', ...o });

test('feriados: as três decisões do coach', () => {
  const datas = ['2026-12-24', '2026-12-25', '2026-11-15', '2026-11-20'];
  const sem = camadaFeriados.itens(ctx(), datas);
  assert.ok(sem.some((i) => i.data === '2026-12-25' && i.dados.decisao === 'decidir'), 'Natal sem decisão');
  const fechado = camadaFeriados.itens(ctx({ meta: { turmas: {}, feriados: { '2026-12-25': false } } }), datas);
  assert.equal(fechado.find((i) => i.data === '2026-12-25')?.dados.decisao, 'fechado');
  const aberto = camadaFeriados.itens(ctx({ meta: { turmas: {}, feriados: { '2026-12-25': true } } }), datas);
  assert.equal(aberto.find((i) => i.data === '2026-12-25')?.dados.decisao, 'aberto');
  assert.ok(sem.every((i) => i.tipo === 'feriado' && i.hora === undefined), 'feriado é item do dia');
});

test('feriados: um item por dia, com o nome curto', () => {
  const r = camadaFeriados.itens(ctx(), ['2026-12-25', '2026-12-26']);
  assert.equal(r.filter((i) => i.data === '2026-12-25').length, 1);
  assert.equal(nomeCurtoDoFeriado('Natal — feriado nacional (lei)'), 'Natal');
  assert.equal(nomeCurtoDoFeriado('Carnaval (segunda)'), 'Carnaval');
});

test('aniversários: o dia, o nome e a idade; inativo fora; vira o mês sem perder ninguém', () => {
  const fichas = [
    { id: 'A1', nome: 'Ana Paula', nascimento: '1992-11-04' },
    { id: 'B2', nome: 'Beto', nascimento: '1990-12-01' },
    { id: 'C3', nome: 'Caio', nascimento: '1990-11-04', status: 'inativo' },
  ];
  const r = camadaAniversarios.itens(ctx({ fichas }), ['2026-11-30', '2026-12-01', '2026-11-04']);
  assert.deepEqual(r.map((i) => [i.data, i.titulo]).sort(), [['2026-11-04', 'Ana Paula · 34'], ['2026-12-01', 'Beto · 36']]);
  assert.ok(r.every((i) => i.tipo === 'aniversario'));
});

test('reavaliações: só a próxima, no dia dela', () => {
  const fichas = [{ id: 'B1', nome: 'Bruno', avaliacoes: [{ dataRealizada: '2026-08-05', dataProxima: '2026-11-05' }] }];
  const r = camadaReavaliacoes.itens(ctx({ fichas }), ['2026-11-05', '2026-11-06']);
  assert.deepEqual(r, [{ data: '2026-11-05', tipo: 'reavaliacao', titulo: 'Bruno', dados: { alunoId: 'B1', nome: 'Bruno' } }]);
});

test('registro: ids únicos e cor de token', () => {
  const ids = CAMADAS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CAMADAS) assert.match(c.cor, /^--[a-z]+$/);
});
