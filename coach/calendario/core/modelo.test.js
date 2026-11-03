// @ts-check
/** Rodar: node --test coach/calendario/core/modelo.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarModelo, ordemHora } from './modelo.js';

const turma = (/** @type {string} */ data, /** @type {string} */ hora, /** @type {number} */ vem) =>
  ({ data, hora, tipo: 'turma', titulo: `${vem}/6`, dados: { vem: Array.from({ length: vem }, () => ({})), naoVem: [], capacidade: 6, naGrade: hora !== '18:00', lotada: false, pendentes: 0 } });
const camada = (/** @type {any[]} */ itens) => ({ id: 'turmas', nome: 'Turmas', cor: '--accent', itens: () => itens });
const ctx = /** @type {any} */ ({ fichas: [], meta: {}, fechados: ['2026-11-06'], pendentes: {}, hoje: '2026-11-04', agora: '08:40' });
const grade = () => ['06:00', '18:10'];

test('semana: seg a sáb (domingo sem turma sai), totais, hoje e fechado', () => {
  const m = montarModelo({ camadas: [camada([turma('2026-11-02', '06:00', 4), turma('2026-11-02', '18:10', 6), turma('2026-11-04', '06:00', 2)])], ctx, visao: 'semana', ancora: '2026-11-04', ligadas: new Set(['turmas']), gradeDoDia: grade });
  assert.deepEqual(m.dias.map((d) => d.rotulo), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
  assert.equal(m.dias[0].total, 10);
  assert.equal(m.dias[2].hoje, true);
  assert.equal(m.dias[4].fechado, true);
  assert.equal(m.rotulo, '2 – 7 NOV 2026');
  assert.deepEqual(m.horas, [{ hora: '06:00', foraDaGrade: false }, { hora: '18:10', foraDaGrade: false }]);
  assert.equal(m.semanas, null);
});

test('semana: domingo com turma aparece; hora fora da grade e "sem horário" por último', () => {
  const m = montarModelo({ camadas: [camada([turma('2026-11-08', '08:00', 1), turma('2026-11-02', '18:00', 1), turma('2026-11-02', '', 1)])], ctx, visao: 'semana', ancora: '2026-11-04', ligadas: new Set(['turmas']), gradeDoDia: grade });
  assert.equal(m.dias.at(-1)?.rotulo, 'Dom');
  assert.deepEqual(m.horas.map((h) => [h.hora, h.foraDaGrade]), [['08:00', true], ['18:00', true], ['', true]]);
});

test('mês e dia: a grade do mês; no dia, só as horas do primeiro dia', () => {
  const itens = [turma('2026-11-02', '06:00', 1), turma('2026-11-03', '07:00', 1)];
  const mes = montarModelo({ camadas: [camada(itens)], ctx, visao: 'mes', ancora: '2026-11-04', ligadas: new Set(['turmas']), gradeDoDia: grade });
  assert.equal(mes.dias.length, 30);
  assert.equal(mes.semanas?.length, 5);
  const dia = montarModelo({ camadas: [camada(itens)], ctx, visao: 'dia', ancora: '2026-11-02', ligadas: new Set(['turmas']), gradeDoDia: grade });
  assert.deepEqual(dia.horas.map((h) => h.hora), ['06:00']);
  assert.equal(dia.dias.length, 7);
});

test('ordemHora: hora em ordem, vazio por último', () => {
  assert.deepEqual(['', '18:10', '06:00'].sort(ordemHora), ['06:00', '18:10', '']);
});
