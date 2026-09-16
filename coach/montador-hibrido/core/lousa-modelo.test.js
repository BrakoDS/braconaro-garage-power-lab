// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciciosDo, totalSeries, usoPorImplemento, trocarImplemento, removerExercicio,
  paraGravar, resumo, normalizar,
} from './lousa-modelo.js';

/** Um treino no formato que a function devolve. */
const treino = () => ({
  sistema: 'Hipertrofia',
  titulo: 'Full Body A',
  blocos: [
    { id: 'A', nome: 'Mobilidade', exercicios: [
      { nome: 'Mobilidade de Quadril', bloco: 'A', series: 1, reps: '40s', implemento: '', grupamentos: [], observacao: '' },
    ] },
    { id: 'C', nome: 'Força', exercicios: [
      { nome: 'Agachamento Livre', bloco: 'C', series: 4, reps: '8-12', implemento: 'Barra', grupamentos: ['Quadríceps'], observacao: 'RIR 2' },
      { nome: 'Remada Curvada', bloco: 'C', series: 3, reps: '10', implemento: 'Barra', grupamentos: ['Costas'], observacao: '' },
    ] },
  ],
  estimativaSeries: 8,
  substituicoes: [],
  avisos: [],
});

test('achata os exercícios na ordem dos blocos', () => {
  assert.deepEqual(exerciciosDo(treino()).map((e) => e.nome),
    ['Mobilidade de Quadril', 'Agachamento Livre', 'Remada Curvada']);
});

test('treino ausente não quebra a tela', () => {
  assert.deepEqual(exerciciosDo(null), []);
  assert.equal(totalSeries(null), 0);
  assert.equal(resumo(null), '');
});

test('o total de séries é RECALCULADO, não lido do campo que veio do servidor', () => {
  const t = treino();
  t.estimativaSeries = 999; // valor congelado de antes de o coach editar
  assert.equal(totalSeries(t), 8);
});

test('conta o uso por implemento e ignora exercício sem implemento', () => {
  assert.deepEqual(usoPorImplemento(treino()), { Barra: 2 });
});

test('troca por SATURAÇÃO muda todas as linhas daquele implemento', () => {
  const novo = trocarImplemento(treino(), { alvo: 'Barra', de: '', para: 'Halter' });
  assert.deepEqual(usoPorImplemento(novo), { Halter: 2 });
});

test('troca por DUPLICAÇÃO muda só o exercício apontado', () => {
  const novo = trocarImplemento(treino(), { alvo: 'Agachamento Livre', de: 'Barra', para: 'Halter' });
  assert.deepEqual(usoPorImplemento(novo), { Halter: 1, Barra: 1 });
});

test('a troca devolve um treino NOVO — a lousa original continua para a comparação lado a lado', () => {
  const original = treino();
  const novo = trocarImplemento(original, { alvo: 'Barra', de: '', para: 'Halter' });
  assert.equal(original.blocos[1].exercicios[0].implemento, 'Barra');
  assert.notEqual(novo, original);
});

test('troca sem destino é ignorada em vez de apagar o implemento', () => {
  const novo = trocarImplemento(treino(), { alvo: 'Barra', de: '', para: '' });
  assert.deepEqual(usoPorImplemento(novo), { Barra: 2 });
});

test('remover o último exercício de um bloco tira o bloco vazio da tela', () => {
  const novo = removerExercicio(treino(), 'Mobilidade de Quadril');
  assert.deepEqual(novo.blocos.map((b) => b.id), ['C']);
  assert.equal(totalSeries(novo), 7);
});

test('paraGravar recalcula a estimativa e respeita o título que o coach reescreveu', () => {
  const g = paraGravar(treino(), { dateId: '2026-09-16', titulo: '  Segunda pesada  ', classTime: '19:00' });
  assert.equal(g.dateId, '2026-09-16');
  assert.equal(g.classTime, '19:00');
  assert.equal(g.treino.titulo, 'Segunda pesada');
  assert.equal(g.treino.estimativaSeries, 8);
  assert.ok(Date.parse(g.geradoEm) > 0, 'geradoEm precisa ser ISO legível — é ele que sustenta a conta de 72h');
});

test('título em branco cai no sistema, nunca em string vazia no calendário', () => {
  const t = treino();
  t.titulo = '';
  assert.equal(paraGravar(t, { dateId: '2026-09-16', titulo: '' }).treino.titulo, 'Hipertrofia');
});

test('a normalização casa o jeito que o coach escreve com o jeito que o servidor guarda', () => {
  assert.equal(normalizar('  Agachamento  LIVRE '), 'agachamento livre');
  assert.equal(normalizar('Pull-Up'), 'pull up');
  assert.equal(normalizar('Tríceps'), 'triceps');
});

test('o resumo diz sistema, exercícios e séries', () => {
  assert.equal(resumo(treino()), 'Hipertrofia · 3 exercícios · 8 séries');
});
