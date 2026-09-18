// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeDoMes, agruparPorDia, editavel, mesVizinho, mesDe, rotuloMes, chaveDeCor, DIAS_SEMANA,
} from './calendario.js';

const HOJE = '2026-09-16';

test('a semana começa na segunda, como no resto do sistema', () => {
  assert.equal(DIAS_SEMANA[0], 'seg');
  const g = gradeDoMes('2026-09', HOJE);
  // 01/09/2026 é uma terça — a primeira linha abre na segunda, 31/08.
  assert.equal(g.semanas[0][0].dateId, '2026-08-31');
  assert.equal(g.semanas[0][1].dateId, '2026-09-01');
});

test('os dias do mês vizinho aparecem marcados, não escondidos', () => {
  // Esconder 31/08 faria a primeira semana de setembro parecer mais vazia do
  // que foi — o treino daquela segunda é da mesma semana que o coach olha.
  const g = gradeDoMes('2026-09', HOJE);
  assert.equal(g.semanas[0][0].foraDoMes, true);
  assert.equal(g.semanas[0][1].foraDoMes, false);
});

test('toda linha tem sete dias e o mês cabe em até seis linhas', () => {
  for (const mes of ['2026-01', '2026-02', '2026-09', '2027-08', '2024-02']) {
    const g = gradeDoMes(mes, HOJE);
    assert.ok(g.semanas.length >= 4 && g.semanas.length <= 6, `${mes}: ${g.semanas.length} linhas`);
    for (const s of g.semanas) assert.equal(s.length, 7, `${mes}: linha com ${s.length} dias`);
  }
});

test('o mês inteiro está na grade, sem dia faltando nem repetido', () => {
  const g = gradeDoMes('2026-09', HOJE);
  const doMes = g.semanas.flat().filter((d) => !d.foraDoMes).map((d) => d.dateId);
  assert.equal(doMes.length, 30, 'setembro tem 30 dias');
  assert.equal(new Set(doMes).size, 30, 'sem repetição');
  assert.equal(doMes[0], '2026-09-01');
  assert.equal(doMes[29], '2026-09-30');
});

test('fevereiro de ano bissexto fecha em 29', () => {
  const doMes = gradeDoMes('2024-02', HOJE).semanas.flat().filter((d) => !d.foraDoMes);
  assert.equal(doMes.length, 29);
});

test('meio-dia UTC: o dia não escorrega para trás em fuso negativo', () => {
  // Com meia-noite UTC, o treino de segunda apareceria no domingo no box (UTC-3).
  const g = gradeDoMes('2026-09', HOJE);
  const primeiro = g.semanas.flat().find((d) => d.dateId === '2026-09-01');
  assert.equal(primeiro?.dia, 1);
});

test('hoje e o futuro são marcados', () => {
  const dias = gradeDoMes('2026-09', HOJE).semanas.flat();
  assert.equal(dias.find((d) => d.dateId === HOJE)?.ehHoje, true);
  assert.equal(dias.find((d) => d.dateId === '2026-09-17')?.ehFuturo, true);
  assert.equal(dias.find((d) => d.dateId === '2026-09-15')?.ehFuturo, false);
  assert.equal(dias.find((d) => d.dateId === HOJE)?.ehFuturo, false, 'hoje não é futuro');
});

test('mês inválido devolve grade vazia em vez de laço infinito', () => {
  assert.deepEqual(gradeDoMes('lixo', HOJE).semanas, []);
  assert.deepEqual(gradeDoMes('2026-13', HOJE).semanas, []);
  assert.deepEqual(gradeDoMes('', HOJE).semanas, []);
});

test('navegar entre meses atravessa a virada do ano', () => {
  assert.equal(mesVizinho('2026-09', 1), '2026-10');
  assert.equal(mesVizinho('2026-12', 1), '2027-01');
  assert.equal(mesVizinho('2026-01', -1), '2025-12');
  assert.equal(mesDe('2026-09-16'), '2026-09');
  assert.equal(rotuloMes('2026-09'), 'setembro de 2026');
});

test('o mesmo dia com dois treinos mostra os dois, na ordem em que foram criados', () => {
  // Hoje nenhum treino tem `classTime` (o horário saiu da Lousa), então a ordem
  // tem de vir de `geradoEm` — sem isso ela ficaria ao acaso do navegador.
  const porDia = agruparPorDia([
    { dateId: '2026-09-16', geradoEm: '2026-09-16T20:00:00Z', workoutId: 'segundo' },
    { dateId: '2026-09-16', geradoEm: '2026-09-16T07:00:00Z', workoutId: 'primeiro' },
    { dateId: '2026-09-17', geradoEm: '2026-09-17T07:00:00Z', workoutId: 'outro' },
  ]);
  assert.equal(porDia['2026-09-16'].length, 2, 'o segundo treino do dia não pode sumir');
  assert.deepEqual(porDia['2026-09-16'].map((l) => l.workoutId), ['primeiro', 'segundo']);
});

test('treino antigo COM horário ainda ordena pelo horário', () => {
  const porDia = agruparPorDia([
    { dateId: '2026-09-16', classTime: '20:00', workoutId: 'noite' },
    { dateId: '2026-09-16', classTime: '07:00', workoutId: 'manha' },
  ]);
  assert.deepEqual(porDia['2026-09-16'].map((l) => l.workoutId), ['manha', 'noite']);
});

test('treino com data corrompida é descartado em vez de virar chave lixo', () => {
  const porDia = agruparPorDia([{ dateId: 'ontem' }, { dateId: null }, {}]);
  assert.deepEqual(Object.keys(porDia), []);
});

test('só hoje e o futuro são editáveis — o passado é registro', () => {
  assert.equal(editavel('2026-09-16', HOJE), true, 'hoje');
  assert.equal(editavel('2026-09-20', HOJE), true, 'futuro');
  assert.equal(editavel('2026-09-15', HOJE), false, 'ontem');
  assert.equal(editavel('2026-08-31', HOJE), false, 'mês passado');
});

test('a cor da modalidade sai da tabela compartilhada, não de um mapa local', () => {
  assert.equal(chaveDeCor('HIIT'), 'hiit');
  assert.equal(chaveDeCor('Hipertrofia'), 'hipertrofia');
  assert.equal(chaveDeCor('Hyrox'), 'hyrox');
  assert.equal(chaveDeCor('GAP'), 'gap');
});
