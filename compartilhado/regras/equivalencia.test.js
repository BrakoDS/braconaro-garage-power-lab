// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEGUNDOS_POR_SERIE, REPS_POR_SERIE, seriesPorTempo, seriesPorReps, repsDaPrescricao,
  seriesDoMovimentoWod,
} from './equivalencia.js';

test('um round de TABATA de 20s vale meia serie', () => {
  assert.equal(seriesPorTempo(20), 0.5);
});

test('um slot de HIIT (4 rounds de 20s) vale 2 series', () => {
  assert.equal(seriesPorTempo(4 * 20), 2);
});

test('20 reps valem uma serie', () => {
  assert.equal(seriesPorReps(20), 1);
});

test('as 100 puxadas do Murph valem 5 series', () => {
  assert.equal(seriesPorReps(100), 5);
});

test('tempo ou reps negativos ou invalidos valem zero', () => {
  assert.equal(seriesPorTempo(-10), 0);
  assert.equal(seriesPorTempo(NaN), 0);
  assert.equal(seriesPorReps(-5), 0);
  assert.equal(seriesPorReps(undefined), 0);
});

test('le as reps das prescricoes que o Hibrido gera', () => {
  assert.equal(repsDaPrescricao('12 reps'), 12);
  assert.equal(repsDaPrescricao('20 reps'), 20);
});

test('distancia nao e reps', () => {
  assert.equal(repsDaPrescricao('200m'), null);
  assert.equal(repsDaPrescricao('300 m'), null);
});

test('prescricao livre do coach: le o numero quando ele existe', () => {
  assert.equal(repsDaPrescricao('15 burpees'), 15);
  assert.equal(repsDaPrescricao('10'), 10);
});

test('prescricao sem numero nao inventa', () => {
  assert.equal(repsDaPrescricao('maximo de reps'), null);
  assert.equal(repsDaPrescricao(''), null);
  assert.equal(repsDaPrescricao(undefined), null);
});

test('tempo em segundos tambem nao e reps', () => {
  assert.equal(repsDaPrescricao('40s'), null);
  assert.equal(repsDaPrescricao('30 seg'), null);
});

test('WOD com reps e rodadas: conta reps x rodadas', () => {
  const s = seriesDoMovimentoWod({ prescricao: '12 reps', rodadas: 5, duracaoMin: 12, nMovimentos: 3 });
  assert.equal(s, 3); // 12 * 5 / 20
});

test('WOD com reps e sem rodadas cai no tempo, nao multiplica por um', () => {
  const s = seriesDoMovimentoWod({ prescricao: '12 reps', rodadas: null, duracaoMin: 12, nMovimentos: 3 });
  assert.equal(s, 6); // 12 min / 3 movimentos = 4 min = 240 s / 40
});

test('WOD sem reps legiveis cai no tempo do bloco repartido', () => {
  const s = seriesDoMovimentoWod({ prescricao: '200m', rodadas: null, duracaoMin: 10, nMovimentos: 4 });
  assert.equal(s, 3.75); // 10 min / 4 = 2,5 min = 150 s / 40
});

test('WOD sem tempo e sem reps nao conta nada', () => {
  assert.equal(seriesDoMovimentoWod({ prescricao: '', rodadas: null, duracaoMin: 0, nMovimentos: 3 }), 0);
});

test('as constantes sao as duas reguas, e concordam entre si', () => {
  assert.equal(SEGUNDOS_POR_SERIE, 40);
  assert.equal(REPS_POR_SERIE, 20);
  // uma serie de ~10 reps em ~40 s: as duas reguas descrevem o mesmo esforco
  assert.equal(seriesPorTempo(SEGUNDOS_POR_SERIE), seriesPorReps(REPS_POR_SERIE));
});
