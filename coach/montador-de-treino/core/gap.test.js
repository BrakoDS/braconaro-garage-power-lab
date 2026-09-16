// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarGap, volumeGap } from './gap.js';
import { SERIES_POR_ROUND } from '../data/gap.js';
import { TABATA } from './gap.js';
import { ROUND_TABATA } from '../../../compartilhado/config/estruturas.js';

test('a regua do GAP e a mesma de sempre: meia serie por round', () => {
  assert.equal(SERIES_POR_ROUND, 0.5);
});

test('o round do compartilhado e o mesmo round do GAP', () => {
  // O montador novo monta GAP a partir de ROUND_TABATA (compartilhado/config/estruturas.js).
  // Duas verdades sobre o mesmo round e como o volume do GAP comeca a divergir entre
  // as duas telas — aqui, e nao la, porque o app importa o compartilhado, nunca o contrario.
  assert.equal(ROUND_TABATA.trabalhoSeg, TABATA.trabalhoSeg);
  assert.equal(ROUND_TABATA.descansoSeg, TABATA.descansoSeg);
  assert.equal(ROUND_TABATA.rounds, TABATA.roundsPorMusica);
});

test('uma aula inteira mantem o total que o coach ja lia', () => {
  const vol = volumeGap(gerarGap({ seed: 42 }));
  // 9 musicas x 8 rounds = 72 rounds, com pesos de variacao entre 0,75 e 1,25: o total
  // medido para essa seed e 36 (estavel tambem nas seeds 7 e 1234). Fixado no numero
  // exato, e nao numa faixa, para servir de alarme de verdade: uma faixa larga o
  // suficiente para nao gerar falso positivo tambem e larga o suficiente para nao
  // pegar uma regua que derivou (ex.: SEGUNDOS_POR_SERIE de 40 para 44s cairia para
  // ~32,7, ainda "dentro da faixa" antiga). So muda legitimamente se a regua mudar
  // (compartilhado/regras/equivalencia.js) ou se o banco de movimentos do GAP ganhar
  // ou perder movimento (data/gap.js).
  assert.equal(vol.totalSeries, 36, `total mudou: ${vol.totalSeries}`);
  assert.ok(Object.keys(vol.porMusculo).length > 0, 'GAP tem que contar musculo');
});

test('o volume do GAP e estavel para a mesma seed', () => {
  const a = volumeGap(gerarGap({ seed: 7 }));
  const b = volumeGap(gerarGap({ seed: 7 }));
  assert.deepEqual(a, b);
});
