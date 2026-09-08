import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARES_ANTAGONISTAS, calcularPostos, calcularSeries, SERIE_SEG } from './hibrido-postos.js';

test('os 4 pares vêm na ordem de prioridade do spec', () => {
  assert.deepEqual(PARES_ANTAGONISTAS.map((p) => p.id),
    ['peito_costas', 'quadriceps_posterior', 'bracos', 'core']);
});

test('cada par declara os músculos dos dois lados', () => {
  const pernas = PARES_ANTAGONISTAS.find((p) => p.id === 'quadriceps_posterior');
  assert.deepEqual(pernas.a, ['quadriceps']);
  assert.deepEqual(pernas.b, ['posterior_coxa', 'gluteo']);
});

test('postos = alunas / 2, arredondando pra cima, teto de 4', () => {
  assert.equal(calcularPostos(6), 3);   // a aula real do coach
  assert.equal(calcularPostos(7), 4);   // ímpar arredonda pra cima (gera um trio)
  assert.equal(calcularPostos(8), 4);
  assert.equal(calcularPostos(12), 4);  // teto
  assert.equal(calcularPostos(1), 1);   // piso
});

test('séries seguram o bloco em 24 min: postos x séries = 12', () => {
  assert.equal(calcularSeries(3), 4);
  assert.equal(calcularSeries(4), 3);
  assert.equal(3 * calcularSeries(3) * SERIE_SEG, 24 * 60);
  assert.equal(4 * calcularSeries(4) * SERIE_SEG, 24 * 60);
});

test('turma minúscula não explode as séries (clamp em 4)', () => {
  assert.equal(calcularSeries(1), 4);
  assert.equal(calcularSeries(2), 4);
});

import { prescricaoSemana, duracaoWodPorSemana, SEG_POR_REP } from './hibrido-postos.js';

test('a onda de 4 semanas: carga sobe, reps caem, pausa cresce', () => {
  const w = (s) => prescricaoSemana(s, 'intermediario');
  assert.deepEqual(
    [1, 2, 3, 4].map((s) => [w(s).pctRM, w(s).reps, w(s).descansoSeg]),
    [[65, 12, 48], [70, 10, 60], [75, 8, 72], [61, 12, 48]]
  );
});

test('toda série fecha em 120s, em qualquer semana', () => {
  for (const s of [1, 2, 3, 4]) {
    const p = prescricaoSemana(s, 'intermediario');
    assert.equal(2 * p.reps * SEG_POR_REP + p.descansoSeg, SERIE_SEG, `semana ${s}`);
  }
});

test('nível desloca a carga em ±5pp, não o volume', () => {
  assert.equal(prescricaoSemana(2, 'iniciante').pctRM, 65);
  assert.equal(prescricaoSemana(2, 'intermediario').pctRM, 70);
  assert.equal(prescricaoSemana(2, 'avancado').pctRM, 75);
  // reps não mudam com o nível — as séries seguram o relógio
  assert.equal(prescricaoSemana(2, 'iniciante').reps, prescricaoSemana(2, 'avancado').reps);
});

test('só a semana 4 é deload, e o rótulo vem da periodização', () => {
  assert.equal(prescricaoSemana(4, 'intermediario').ehDeload, true);
  assert.equal(prescricaoSemana(4, 'intermediario').rotulo, 'Deload');
  assert.equal(prescricaoSemana(3, 'intermediario').ehDeload, false);
  assert.equal(prescricaoSemana(3, 'intermediario').rotulo, 'Pico');
});

test('o ciclo se repete a cada 4 semanas', () => {
  assert.deepEqual(prescricaoSemana(5, 'intermediario'), prescricaoSemana(1, 'intermediario'));
  assert.equal(prescricaoSemana(8, 'intermediario').ehDeload, true);
});

test('duração do WOD segue a semana, não as séries', () => {
  assert.deepEqual([1, 2, 3, 4].map(duracaoWodPorSemana), [16, 16, 20, 12]);
  assert.equal(duracaoWodPorSemana(7), 20); // semana 3 do ciclo seguinte
});
