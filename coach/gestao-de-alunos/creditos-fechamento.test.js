// @ts-check
/** Rodar: node --test coach/gestao-de-alunos/creditos-fechamento.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditosDeFechamento } from './creditos-fechamento.js';

const FINADOS = '2026-11-02'; // segunda
const base = () => ([
  { id: 'A', nome: 'Ana', status: 'ativo', diasTreino: ['seg', 'qua'], horarios: { seg: '06:00', qua: '06:00' }, atestados: {}, faltas: {}, presencas: [] },
  { id: 'B', nome: 'Bia', status: 'ativo', diasTreino: ['ter'], horarios: { ter: '07:00' }, atestados: {}, faltas: {}, presencas: [] }, // não treina segunda
  { id: 'C', nome: 'Caio', status: 'inativo', diasTreino: ['seg'], horarios: { seg: '06:00' }, atestados: {}, faltas: {}, presencas: [] }, // inativo
  { id: 'D', nome: 'Davi', status: 'ativo', diasTreino: ['seg'], horarios: { seg: '06:00' }, atestados: { [FINADOS]: { tipo: 'desmarcacao', expira: '2026-11-30', reposicao: null } }, faltas: {}, presencas: [] }, // já tem crédito
]);

test('feriado fechado: +1 crédito só para quem tinha aula e não tem nada no dia', () => {
  const r = creditosDeFechamento(base(), [FINADOS], '2026-11-03');
  assert.deepEqual(r.map((x) => x.alunoId), ['A'], 'só a Ana (Bia não treina seg, Caio inativo, Davi já tem crédito)');
  const cred = r[0].patch.atestados[FINADOS];
  assert.equal(cred.tipo, 'fechado');
  assert.equal(cred.expira, '2026-11-30');
  assert.equal(cred.reposicao, null);
  assert.deepEqual(cred.aula, { data: FINADOS, hora: '06:00' });
  assert.match(r[0].log.resumo, /fechou[^]*cr[ée]dito/i);
  assert.equal(r[0].log.extra.dia, FINADOS);
});

test('pausado (etapa 6.1) não ganha crédito de feriado', () => {
  const alunos = base();
  alunos[0].status = 'pausado';
  assert.deepEqual(creditosDeFechamento(alunos, [FINADOS], '2026-11-03'), []);
});

test('idempotente: rodar de novo com o crédito já aplicado não gera nada', () => {
  const alunos = base();
  const r1 = creditosDeFechamento(alunos, [FINADOS], '2026-11-03');
  Object.assign(alunos[0], r1[0].patch); // aplica o patch da Ana na ficha dela
  const r2 = creditosDeFechamento(alunos, [FINADOS], '2026-11-03');
  assert.deepEqual(r2, []);
});

test('não gera crédito já vencido (dia de mês anterior)', () => {
  const r = creditosDeFechamento(base(), ['2026-10-05'], '2026-11-03'); // fimDoMes = 2026-10-31 < hoje
  assert.deepEqual(r, []);
});

test('quem já tem presença no dia (veio de algum jeito) ou falta não ganha crédito', () => {
  const alunos = base();
  alunos[0].presencas = [FINADOS];
  assert.deepEqual(creditosDeFechamento(alunos, [FINADOS], '2026-11-03').map((x) => x.alunoId), [], 'Ana presente: sem crédito');
  const alunos2 = base();
  alunos2[0].faltas = { [FINADOS]: { tipo: 'fora-do-prazo' } };
  assert.deepEqual(creditosDeFechamento(alunos2, [FINADOS], '2026-11-03').map((x) => x.alunoId), [], 'Ana com falta: sem crédito');
});
