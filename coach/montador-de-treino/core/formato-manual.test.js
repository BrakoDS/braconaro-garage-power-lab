// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatoManual, FORMATO_POR_MODALIDADE } from './formato-manual.js';

test('cada modalidade tem um formato', () => {
  for (const m of ['forca', 'hipertrofia', 'hiit', 'gap', 'hibrido', 'hyrox']) {
    assert.ok(FORMATO_POR_MODALIDADE[m], `${m} sem formato`);
  }
});

test('Força pede 5 blocos com os padrões obrigatórios etiquetados', () => {
  const f = formatoManual('forca');
  assert.equal(f.tipo, 'blocos');
  assert.equal(f.nBlocos, 5);
  assert.deepEqual(f.padroesSugeridos,
    ['empurrar', 'puxar', 'quadriceps', 'posterior_gluteo', 'core']);
  assert.equal(f.seriesPadrao, 4);
  assert.equal(f.repsPadrao, 5);
  assert.deepEqual(f.repsFaixa, [1, 6]);
  assert.equal(f.descansoSeg, 150);
});

test('Hipertrofia pede 6 blocos e inclui estabilizadores', () => {
  const f = formatoManual('hipertrofia');
  assert.equal(f.nBlocos, 6);
  assert.equal(f.padroesSugeridos[5], 'estabilizadores');
  assert.equal(f.repsPadrao, 10);
  assert.equal(f.descansoSeg, 75);
});

test('a mobilidade da Força tem mais tempo e mais slots que a das demais', () => {
  const forca = formatoManual('forca').mobilidade;
  const hiper = formatoManual('hipertrofia').mobilidade;
  assert.equal(forca.orcamentoSeg, 450);
  assert.equal(hiper.orcamentoSeg, 240);
  assert.equal(forca.nSlots, 8);
  assert.equal(hiper.nSlots, 5);
});

test('HIIT são 4 estações de 4 slots', () => {
  const f = formatoManual('hiit');
  assert.equal(f.tipo, 'tabata4');
  assert.equal(f.estacoes.length, 4);
  assert.deepEqual(f.estacoes.map((e) => e.grupo),
    ['inferiores', 'core', 'superiores', 'cardio']);
  assert.ok(f.estacoes.every((e) => e.nSlots === 4));
  assert.equal(f.protocolo.trabalhoSeg, 20);
  assert.equal(f.protocolo.descansoSeg, 10);
});

test('GAP são 9 músicas distribuídas nas 4 partes', () => {
  const f = formatoManual('gap');
  assert.equal(f.tipo, 'gapMusicas');
  assert.deepEqual(f.partes.map((p) => p.musicas), [1, 3, 3, 2]);
  assert.deepEqual(f.partes.map((p) => p.modo),
    ['trio', 'membro', 'membro', 'trio']);
  assert.deepEqual(f.partes.map((p) => p.banco),
    ['aquecimento', 'pernas', 'gluteo', 'abdomen']);
});

test('Híbrido tira os postos da turma e as séries do relógio', () => {
  const seis = formatoManual('hibrido', { nAlunos: 6, semana: 1 });
  assert.equal(seis.tipo, 'postosBiset');
  assert.equal(seis.nPostos, 3);
  assert.equal(seis.series, 4);
  assert.equal(seis.pares.length, 3);
  const oito = formatoManual('hibrido', { nAlunos: 8, semana: 1 });
  assert.equal(oito.nPostos, 4);
  assert.equal(oito.series, 3);
});

test('o deload do Híbrido corta série, abre a mobilidade e trava o WOD em EMOM', () => {
  const normal = formatoManual('hibrido', { nAlunos: 8, semana: 1 });
  const deload = formatoManual('hibrido', { nAlunos: 8, semana: 4 });
  assert.equal(deload.series, normal.series - 1);
  assert.equal(normal.mobilidade.orcamentoSeg, 240);
  assert.equal(deload.mobilidade.orcamentoSeg, 720);
  assert.equal(normal.mobilidade.nSlots, 3);
  assert.equal(deload.mobilidade.nSlots, 6);
  assert.deepEqual(deload.wod.formatos, ['EMOM']);
  assert.equal(deload.wod.duracaoMin, 12);
  assert.equal(normal.wod.duracaoMin, 16);
  assert.equal(normal.wod.formatos.length, 4);
});

test('as séries do Híbrido no manual batem com as do gerador automático', async () => {
  // A regra mora em montarPostos (core/hibrido.js): calcularSeries sobre o nº REAL
  // de postos, menos uma no deload. Se as duas divergirem, o bloco manual deixa de
  // fechar 24 min e o coach monta uma aula com duração errada sem perceber.
  const { calcularSeries, calcularPostos } = await import('./hibrido-postos.js');
  for (const nAlunos of [1, 2, 5, 6, 8, 12]) {
    for (const semana of [1, 2, 3, 4]) {
      const f = formatoManual('hibrido', { nAlunos, semana });
      const base = calcularSeries(calcularPostos(nAlunos));
      const esperado = semana === 4 ? Math.max(2, base - 1) : base;
      assert.equal(f.series, esperado, `nAlunos=${nAlunos} semana=${semana}`);
    }
  }
});

test('Hyrox entrega as 8 estações da prova', () => {
  const f = formatoManual('hyrox');
  assert.equal(f.tipo, 'hyroxEstacoes');
  assert.equal(f.estacoes.length, 8);
  assert.ok(f.corrida.intermediario.metros > 0);
});

test('modalidade desconhecida cai em blocos em vez de quebrar a tela', () => {
  const f = formatoManual(/** @type {any} */ ('inexistente'));
  assert.equal(f.tipo, 'blocos');
  assert.ok(f.nBlocos >= 4);
});
