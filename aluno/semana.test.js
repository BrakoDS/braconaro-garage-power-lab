// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanaDoAluno, segundaDaSemana, dataIso } from './semana.js';

// Semana de referência: segunda 03/08/2026 … domingo 09/08/2026.
const SEG = '2026-08-03', TER = '2026-08-04', QUA = '2026-08-05';
const QUI = '2026-08-06', SEX = '2026-08-07', SAB = '2026-08-08';
/** Quinta-feira 06/08 às 12h — meio da semana, com seg/ter/qua já passados. */
const QUINTA = new Date(2026, 7, 6, 12);
const FIXOS = ['seg', 'ter', 'qua'];

test('a semana começa na segunda, inclusive quando hoje é domingo', () => {
  assert.equal(dataIso(segundaDaSemana(new Date(2026, 7, 6))), SEG);   // quinta
  assert.equal(dataIso(segundaDaSemana(new Date(2026, 7, 3))), SEG);   // a própria segunda
  assert.equal(dataIso(segundaDaSemana(new Date(2026, 7, 9))), SEG);   // domingo fecha a semana
});

test('veio nos três dias marcados: tudo verde, sem recado de troca', () => {
  const q = semanaDoAluno({ diasTreino: FIXOS, presencas: [SEG, TER, QUA], hoje: QUINTA });
  assert.equal(q.length, 3);
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'ok', 'ok']);
  assert.ok(q.every((x) => !x.veioEm), 'nenhum quadrado deveria falar em troca de dia');
});

test('faltou na terça e não compensou: o dia já passou, então fica vermelho', () => {
  const q = semanaDoAluno({ diasTreino: FIXOS, presencas: [SEG, QUA], hoje: QUINTA });
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'falta', 'ok']);
});

test('trocou de dia: a presença fora da grade cobre a falta e conta quando ele veio', () => {
  // Faltou terça (dia fixo) e apareceu no sábado, que não é dia dele.
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, QUA, SAB], horas: { [SAB]: '09:15' },
    hoje: new Date(2026, 7, 9, 12), // domingo, semana fechada
  });
  assert.equal(q.length, 3, 'a presença extra cobre a falta em vez de virar um 4º quadrado');
  const terca = q[1];
  assert.equal(terca.estado, 'ok', 'a terça é coberta pela presença de sábado');
  assert.equal(terca.veioEm, SAB);
  assert.equal(terca.hora, '09:15');
});

test('o dia fixo que ainda não chegou fica aguardando, não vermelho', () => {
  // Na quinta, a quarta já passou; se ele nunca veio, seg/ter/qua são faltas.
  // Com os dias fixos em sex/sáb, nada venceu ainda.
  const q = semanaDoAluno({ diasTreino: ['sex', 'sab'], presencas: [], hoje: QUINTA });
  assert.deepEqual(q.map((x) => x.estado), ['aguardando', 'aguardando']);
});

test('hoje ainda conta como aguardando enquanto não há check-in', () => {
  const q = semanaDoAluno({ diasTreino: ['qui'], presencas: [], hoje: QUINTA });
  assert.equal(q[0].estado, 'aguardando');
  assert.equal(q[0].iso, QUI);
});

test('treinou mais do que o plano: o que sobra vira quadrado extra', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, QUA, QUI, SEX], horas: { [SEX]: '20:00' },
    hoje: new Date(2026, 7, 9, 12),
  });
  assert.equal(q.length, 5);
  assert.deepEqual(q.slice(0, 3).map((x) => x.extra), [false, false, false]);
  const extras = q.slice(3);
  assert.deepEqual(extras.map((x) => x.chave), ['qui', 'sex']);
  assert.ok(extras.every((x) => x.extra && x.estado === 'ok'));
  assert.equal(extras[1].hora, '20:00');
});

test('presenças de outras semanas não entram na conta', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS,
    presencas: ['2026-07-27', '2026-08-10', SEG], // semana passada, próxima e esta
    hoje: QUINTA,
  });
  assert.equal(q.length, 3, 'nada de quadrado extra vindo de outra semana');
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'falta', 'falta']);
});

test('a compensação segue a ordem dos fatos: a presença mais antiga cobre a falta mais antiga', () => {
  // Dias fixos seg/ter/qua, faltou em todos, mas veio quinta e sexta.
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEX, QUI], hoje: new Date(2026, 7, 9, 12),
  });
  assert.equal(q[0].veioEm, QUI, 'a segunda é coberta pela quinta, que veio antes');
  assert.equal(q[1].veioEm, SEX);
  assert.equal(q[2].estado, 'falta', 'sobrou uma falta sem cobertura');
});

test('sem check-in registrado a hora simplesmente não aparece', () => {
  const q = semanaDoAluno({ diasTreino: ['seg'], presencas: [SEG], hoje: QUINTA });
  assert.equal(q[0].estado, 'ok');
  assert.equal(q[0].hora, undefined);
});

/* ---------- Remarcação: o coach diz em que dia a sessão vale ---------- */

test('remarcada para um dia que ainda vem: fica aguardando, apontando o novo dia', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER], remarcacoes: { [QUA]: SEX }, hoje: QUINTA,
  });
  const quarta = q[2];
  assert.equal(quarta.estado, 'aguardando', 'a sexta ainda não chegou');
  assert.equal(quarta.remarcado, true);
  assert.equal(quarta.efetivo, SEX);
});

test('remarcada e cumprida: fica verde e conta o dia em que ele veio', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, SEX], horas: { [SEX]: '18:40' },
    remarcacoes: { [QUA]: SEX }, hoje: new Date(2026, 7, 9, 12),
  });
  assert.equal(q.length, 3, 'a presença de sexta é da quarta remarcada, não um treino extra');
  assert.equal(q[2].estado, 'ok');
  assert.equal(q[2].veioEm, SEX);
  assert.equal(q[2].hora, '18:40');
});

test('remarcada e perdida vira falta — e nenhuma outra presença a resgata', () => {
  // Quarta remarcada para quinta, não foi na quinta, mas apareceu no sábado.
  // A cobertura automática NÃO entra: o coach já disse onde essa sessão vivia.
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, SAB],
    remarcacoes: { [QUA]: QUI }, hoje: new Date(2026, 7, 9, 12),
  });
  assert.equal(q[2].estado, 'falta');
  assert.equal(q[2].efetivo, QUI);
  assert.equal(q.length, 4, 'o sábado sobra como treino extra, sem cobrir a quarta');
  assert.equal(q[3].extra, true);
  assert.equal(q[3].iso, SAB);
});

test('a cobertura automática continua valendo nas sessões que o coach não tocou', () => {
  // Quarta remarcada para sexta (e cumprida); a terça ninguém tocou e é coberta
  // pelo sábado, que nenhuma remarcação reservou.
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, SEX, SAB],
    remarcacoes: { [QUA]: SEX }, hoje: new Date(2026, 7, 9, 12),
  });
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'ok', 'ok']);
  assert.equal(q[1].veioEm, SAB, 'a terça é coberta pelo sábado');
  assert.equal(q[2].veioEm, SEX, 'a quarta foi cumprida na sexta remarcada');
});

test('o dia reservado por uma remarcação não cobre outra falta também', () => {
  // Segunda remarcada para sexta e cumprida. A terça e a quarta ficam sem nada:
  // a presença de sexta já é da segunda, não pode contar duas vezes.
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEX], remarcacoes: { [SEG]: SEX }, hoje: new Date(2026, 7, 9, 12),
  });
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'falta', 'falta']);
  assert.equal(q.length, 3, 'a sexta está reservada — não sobra como extra');
});

test('remarcar para o próprio dia é o mesmo que não remarcar', () => {
  const q = semanaDoAluno({
    diasTreino: ['seg'], presencas: [SEG], remarcacoes: { [SEG]: SEG }, hoje: QUINTA,
  });
  assert.equal(q[0].estado, 'ok');
  assert.equal(q[0].remarcado, false);
  assert.equal(q[0].veioEm, undefined);
});
