// @ts-check
/**
 * Estes casos são os MESMOS que `functions/src/checar.ts` fixa para
 * `volume-agregado.ts`. É de propósito: as duas implementações precisam
 * concordar, senão o gatilho grava numa chave e a tela pede outra — sem erro
 * nenhum, só um dashboard eternamente "consolidando".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chaveSemana, chaveMes, faixaDaSemana, faixaDoMes, rotuloMes, rotuloSemana, semanasDoMes,
} from './periodos.js';

test('a chave de semana bate com a do servidor nos mesmos casos', () => {
  assert.equal(chaveSemana('2026-09-16'), '2026-W38');
  assert.equal(chaveSemana('2026-09-14'), chaveSemana('2026-09-20'), 'segunda e domingo são a mesma semana');
  assert.notEqual(chaveSemana('2026-09-20'), chaveSemana('2026-09-21'), 'a segunda seguinte já é outra');
  assert.equal(chaveSemana('2025-12-31'), '2026-W01', 'a virada de ano não parte a semana de treino');
});

test('data inválida devolve chave vazia em vez de "NaN-WNaN"', () => {
  assert.equal(chaveSemana('não é data'), '');
  assert.equal(chaveSemana(''), '');
});

test('a semana vai de segunda a domingo', () => {
  assert.deepEqual(faixaDaSemana('2026-09-16'), { inicio: '2026-09-14', fim: '2026-09-20' });
});

test('meio-dia UTC: o dia não escorrega para trás em fuso negativo', () => {
  // O box está em UTC-3. Com meia-noite UTC, '2026-09-14' viraria 13/09 local e
  // a segunda cairia na semana anterior.
  assert.equal(faixaDaSemana('2026-09-14').inicio, '2026-09-14');
});

test('a faixa do mês conhece o tamanho de cada mês', () => {
  assert.equal(faixaDoMes('2026-02-10').fim, '2026-02-28');
  assert.equal(faixaDoMes('2024-02-10').fim, '2024-02-29', 'ano bissexto');
  assert.equal(faixaDoMes('2026-09-16').inicio, '2026-09-01');
});

test('a chave de mês é o prefixo', () => {
  assert.equal(chaveMes('2026-09-16'), '2026-09');
});

test('rótulos legíveis para o coach', () => {
  assert.equal(rotuloMes('2026-09'), 'setembro de 2026');
  assert.equal(rotuloSemana('2026-09-16'), '14/09 a 20/09');
  assert.equal(rotuloMes('lixo'), 'lixo');
});

test('as semanas de um mês são as semanas ISO que o tocam', () => {
  const s = semanasDoMes('2026-09');
  assert.ok(s.length >= 4 && s.length <= 6, `um mês tem de 4 a 6 semanas ISO (${s.length})`);
  assert.equal(s[0].chave, chaveSemana('2026-09-01'));
  assert.equal(s[s.length - 1].chave, chaveSemana('2026-09-30'));
  // Sem repetição: uma chave duplicada desenharia dois pontos no mesmo x da linha.
  assert.equal(new Set(s.map((x) => x.chave)).size, s.length);
});

test('mês inválido não entra em laço infinito', () => {
  assert.deepEqual(semanasDoMes('lixo'), []);
});
