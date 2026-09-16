// @ts-check
/**
 * Rodar: node --test compartilhado/regras/volume-aluno.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasDoAluno, volumeDaSemanaDoAluno } from './volume-aluno.js';

/** Semana de 14 a 20/09/2026: seg 14, ter 15, qua 16, qui 17, sex 18. */
const SEMANA = [
  { dateId: '2026-09-14', volPorGrupo: { peito: 6, braco: 3 } },   // segunda
  { dateId: '2026-09-15', volPorGrupo: { perna: 9 } },             // terça
  { dateId: '2026-09-16', volPorGrupo: { costas: 6 } },            // quarta (o dia)
  { dateId: '2026-09-17', volPorGrupo: { peito: 3 } },             // quinta
  { dateId: '2026-09-21', volPorGrupo: { perna: 99 } },            // segunda seguinte
];

test('a semana vai de segunda a domingo, e o proprio dia fica de fora', () => {
  const dias = diasDoAluno(SEMANA, '2026-09-16').map((t) => t.dateId);
  assert.deepEqual(dias, ['2026-09-14', '2026-09-15', '2026-09-17']);
  assert.ok(!dias.includes('2026-09-21'), 'a semana seguinte nao entra');
  assert.ok(diasDoAluno(SEMANA, '2026-09-16', { incluirODia: true }).some((t) => t.dateId === '2026-09-16'));
});

test('so os dias previstos do aluno contam', () => {
  const dias = diasDoAluno(SEMANA, '2026-09-16', { diasTreino: ['seg', 'qua', 'sex'] }).map((t) => t.dateId);
  assert.deepEqual(dias, ['2026-09-14'], 'terca e quinta nao sao dele');
});

test('aluno sem dias marcados conta todos — some-lo da turma seria pior', () => {
  const dias = diasDoAluno(SEMANA, '2026-09-16', { diasTreino: [] }).map((t) => t.dateId);
  assert.equal(dias.length, 3);
});

test('a presenca real manda quando existe, e falta tira o dia da conta', () => {
  const presencas = { '2026-09-14': true, '2026-09-15': false, '2026-09-17': true };
  const dias = diasDoAluno(SEMANA, '2026-09-16', { diasTreino: ['seg', 'ter'], presencas }).map((t) => t.dateId);
  assert.deepEqual(dias, ['2026-09-14', '2026-09-17'], 'faltou terca: sai; veio quinta fora do plano: entra');
});

test('o volume soma por grupo, e os sete grupos sempre aparecem', () => {
  const vol = volumeDaSemanaDoAluno(SEMANA, '2026-09-16', { diasTreino: ['seg', 'ter', 'qua'] });
  assert.equal(vol.peito, 6);
  assert.equal(vol.perna, 9);
  assert.equal(vol.costas, 0, 'o dia que esta sendo montado nao entra no que ja foi feito');
  assert.equal(vol.gluteo, 0, 'grupo nao treinado aparece zerado, e nao ausente');
});

test('treino salvo sem volume por grupo nao derruba a soma', () => {
  // Dia salvo antes de o volume por grupo existir: entra como zero, e a tela do
  // coach continua de pe.
  const vol = volumeDaSemanaDoAluno([{ dateId: '2026-09-14' }, ...SEMANA], '2026-09-16');
  assert.equal(vol.peito, 9, 'segunda (6) e quinta (3), sem dias marcados');
  assert.equal(volumeDaSemanaDoAluno(null, '2026-09-16').peito, 0);
});
