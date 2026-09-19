// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeDoMes, agruparPorDia, editavel, mesVizinho, mesDe, rotuloMes, chaveDeCor, DIAS_SEMANA,
  aulasDoTreino, chipsDoDia,
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

const comTurmas = (turmas) => ({ distribuido: { turmas } });

test('aulasDoTreino devolve uma aula por horário distribuído, em ordem', () => {
  const r = aulasDoTreino(comTurmas([
    { classTime: '19:00', alunos: ['a', 'b'] },
    { classTime: '06:00', alunos: ['c'] },
    { classTime: '07:00', alunos: ['d', 'e', 'f'] },
  ]));
  assert.deepEqual(r.map((x) => x.classTime), ['06:00', '07:00', '19:00']);
  assert.deepEqual(r.map((x) => x.alunos), [1, 3, 2]);
});

test('treino ainda não distribuído não tem aula', () => {
  assert.deepEqual(aulasDoTreino({ treino: { sistema: 'HIIT' } }), []);
  assert.deepEqual(aulasDoTreino(comTurmas([])), []);
});

test('o treino antigo, com classTime no topo, continua valendo', () => {
  assert.deepEqual(aulasDoTreino({ classTime: '06:00' }), [{ classTime: '06:00', alunos: 0 }]);
});

test('a distribuição vence o campo antigo — é ela quem decide a hora hoje', () => {
  const r = aulasDoTreino({ classTime: '06:00', distribuido: { turmas: [{ classTime: '18:00', alunos: ['a'] }] } });
  assert.deepEqual(r, [{ classTime: '18:00', alunos: 1 }]);
});

test('turma sem horário não vira aula', () => {
  assert.deepEqual(aulasDoTreino(comTurmas([{ classTime: '', alunos: ['a'] }])), []);
});

test('aulasDoTreino aguenta lixo sem quebrar', () => {
  assert.deepEqual(aulasDoTreino(null), []);
  assert.deepEqual(aulasDoTreino({ distribuido: { turmas: 'nao-e-lista' } }), []);
  assert.deepEqual(aulasDoTreino(comTurmas([{ classTime: '07:00' }])), [{ classTime: '07:00', alunos: 0 }]);
});

test('chipsDoDia: um chip por aula, de todos os treinos do dia, em ordem', () => {
  const chips = chipsDoDia([
    { workoutId: 'b', distribuido: { turmas: [{ classTime: '19:00', alunos: ['x'] }] } },
    { workoutId: 'a', distribuido: { turmas: [{ classTime: '06:00', alunos: ['y'] }, { classTime: '07:00', alunos: [] }] } },
  ]);
  assert.deepEqual(chips.map((c) => c.classTime), ['06:00', '07:00', '19:00']);
  assert.deepEqual(chips.map((c) => c.treino.workoutId), ['a', 'a', 'b']);
});

test('quatro aulas do MESMO treino viram quatro chips apontando para ele', () => {
  const t = { workoutId: 'w1', distribuido: { turmas: ['06:00', '07:00', '18:00', '19:00'].map((h) => ({ classTime: h, alunos: ['a'] })) } };
  const chips = chipsDoDia([t]);
  assert.equal(chips.length, 4);
  assert.ok(chips.every((c) => c.treino.workoutId === 'w1'));
});

test('treino montado e não distribuído vira um chip pendente, no fim da lista', () => {
  const chips = chipsDoDia([
    { workoutId: 'pend' },
    { workoutId: 'dist', distribuido: { turmas: [{ classTime: '07:00', alunos: ['a'] }] } },
  ]);
  assert.deepEqual(chips.map((c) => c.pendente), [false, true]);
  assert.equal(chips[1].treino.workoutId, 'pend');
});

test('dia sem treino não tem chip', () => {
  assert.deepEqual(chipsDoDia([]), []);
  assert.deepEqual(chipsDoDia(null), []);
});

test('o dia SEM TREINO vira um chip próprio, na frente de tudo', () => {
  const chips = chipsDoDia([
    { workoutId: 'w', distribuido: { turmas: [{ classTime: '07:00', alunos: ['a'] }] } },
    { workoutId: 'folga', semTreino: true, titulo: 'Feriado' },
  ]);
  assert.equal(chips.length, 2);
  assert.equal(chips[0].semTreino, true, 'o estado do dia vem antes das aulas');
  assert.equal(chips[0].treino.titulo, 'Feriado');
  assert.equal(chips[1].semTreino, false);
});

test('sem treino NÃO é pendência — são coisas diferentes', () => {
  const [c] = chipsDoDia([{ workoutId: 'folga', semTreino: true }]);
  assert.equal(c.pendente, false, 'pendente é "montado e não distribuído"');
  assert.equal(c.semTreino, true);
});

test('o dia sem treino não gera chip por horário', () => {
  // Mesmo que alguém grave `distribuido` por engano num dia marcado, ele
  // continua sendo UM chip: o dia está bloqueado, não tem aula.
  const chips = chipsDoDia([
    { workoutId: 'folga', semTreino: true, distribuido: { turmas: [{ classTime: '07:00', alunos: ['a'] }] } },
  ]);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].semTreino, true);
});

test('treino normal continua sem a marca', () => {
  const chips = chipsDoDia([{ workoutId: 'w', distribuido: { turmas: [{ classTime: '07:00', alunos: [] }] } }]);
  assert.equal(chips[0].semTreino, false);
});
