// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanaDoAluno, segundaDaSemana, dataIso, reposicoesPendentes } from './semana.js';

// Semana de referência: segunda 03/08/2026 … domingo 09/08/2026.
const SEG = '2026-08-03', TER = '2026-08-04', QUA = '2026-08-05';
const QUI = '2026-08-06', SEX = '2026-08-07', SAB = '2026-08-08';
/** Quinta-feira 06/08 às 12h — meio da semana, com seg/ter/qua já passados. */
const QUINTA = new Date(2026, 7, 6, 12);
/** Domingo 09/08 — a semana inteira já passou. */
const DOMINGO = new Date(2026, 7, 9, 12);
const FIXOS = ['seg', 'ter', 'qua'];
const HORARIOS = { seg: '19:00', ter: '19:00', qua: '06:00' };

test('a semana começa na segunda, inclusive quando hoje é domingo', () => {
  assert.equal(dataIso(segundaDaSemana(new Date(2026, 7, 6))), SEG);   // quinta
  assert.equal(dataIso(segundaDaSemana(new Date(2026, 7, 3))), SEG);   // a própria segunda
  assert.equal(dataIso(segundaDaSemana(new Date(2026, 7, 9))), SEG);   // domingo fecha a semana
});

/* ---------- Check-in: o caso normal ---------- */

test('veio nos três dias marcados: tudo verde, sem recado de troca', () => {
  const q = semanaDoAluno({ diasTreino: FIXOS, presencas: [SEG, TER, QUA], hoje: QUINTA });
  assert.equal(q.length, 3);
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'ok', 'ok']);
  assert.ok(q.every((x) => !x.veioEm), 'nenhum quadrado deveria falar em troca de dia');
});

test('cada quadrado carrega a hora do seu próprio dia', () => {
  const q = semanaDoAluno({ diasTreino: FIXOS, horarios: HORARIOS, presencas: [], hoje: QUINTA });
  assert.deepEqual(q.map((x) => x.horaPrevista), ['19:00', '19:00', '06:00']);
});

test('faltou na terça e não compensou: o dia já passou, então fica vermelho', () => {
  const q = semanaDoAluno({ diasTreino: FIXOS, presencas: [SEG, QUA], hoje: QUINTA });
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'falta', 'ok']);
});

test('o dia fixo que ainda não chegou fica aguardando, não vermelho', () => {
  const q = semanaDoAluno({ diasTreino: ['sex', 'sab'], presencas: [], hoje: QUINTA });
  assert.deepEqual(q.map((x) => x.estado), ['aguardando', 'aguardando']);
});

test('hoje ainda conta como aguardando enquanto não há check-in', () => {
  const q = semanaDoAluno({ diasTreino: ['qui'], presencas: [], hoje: QUINTA });
  assert.equal(q[0].estado, 'aguardando');
  assert.equal(q[0].iso, QUI);
});

test('sem check-in registrado a hora simplesmente não aparece', () => {
  const q = semanaDoAluno({ diasTreino: ['seg'], presencas: [SEG], hoje: QUINTA });
  assert.equal(q[0].estado, 'ok');
  assert.equal(q[0].hora, undefined);
});

/* ---------- Cobertura automática: a rede para quando ninguém marcou nada ---------- */

test('trocou de dia sem avisar: a presença fora da grade cobre a falta', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, QUA, SAB], horas: { [SAB]: '09:15' }, hoje: DOMINGO,
  });
  assert.equal(q.length, 3, 'a presença extra cobre a falta em vez de virar um 4º quadrado');
  assert.equal(q[1].estado, 'ok');
  assert.equal(q[1].veioEm, SAB);
  assert.equal(q[1].hora, '09:15');
});

test('treinou mais do que o plano: o que sobra vira quadrado extra', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, QUA, QUI, SEX], horas: { [SEX]: '20:00' }, hoje: DOMINGO,
  });
  assert.equal(q.length, 5);
  const extras = q.filter((x) => x.tipo === 'extra');
  assert.deepEqual(extras.map((x) => x.chave), ['qui', 'sex']);
  assert.equal(extras[1].hora, '20:00');
});

test('presenças de outras semanas não entram na conta', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: ['2026-07-27', '2026-08-10', SEG], hoje: QUINTA,
  });
  assert.equal(q.length, 3, 'nada de quadrado extra vindo de outra semana');
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'falta', 'falta']);
});

test('a compensação segue a ordem dos fatos: a presença mais antiga cobre a falta mais antiga', () => {
  const q = semanaDoAluno({ diasTreino: FIXOS, presencas: [SEX, QUI], hoje: DOMINGO });
  assert.equal(q[0].veioEm, QUI, 'a segunda é coberta pela quinta, que veio antes');
  assert.equal(q[1].veioEm, SEX);
  assert.equal(q[2].estado, 'falta', 'sobrou uma falta sem cobertura');
});

/* ---------- Alterar dia: troca combinada, dentro da semana ---------- */

test('alterou para um dia que ainda vem: fica aguardando, apontando o novo dia', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER], remarcacoes: { [QUA]: { data: SEX, hora: '19:00' } }, hoje: QUINTA,
  });
  const quarta = q[2];
  assert.equal(quarta.estado, 'aguardando');
  assert.equal(quarta.remarcado, true);
  assert.equal(quarta.efetivo, SEX);
  assert.equal(quarta.horaPrevista, '19:00');
});

test('alterar só a hora mantém o dia — e ainda assim conta como mexida', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, horarios: HORARIOS, presencas: [],
    remarcacoes: { [QUA]: { data: QUA, hora: '19:00' } }, hoje: new Date(2026, 7, 5, 5),
  });
  const quarta = q[2];
  assert.equal(quarta.remarcado, false, 'o dia não mudou');
  assert.equal(quarta.alterado, true, 'mas o coach mexeu');
  assert.equal(quarta.horaPrevista, '19:00', 'a hora da troca vence a da grade (06:00)');
  assert.equal(quarta.efetivo, QUA);
});

test('alterada e cumprida: fica verde e conta o dia em que ele veio', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, SEX], horas: { [SEX]: '18:40' },
    remarcacoes: { [QUA]: { data: SEX, hora: '18:30' } }, hoje: DOMINGO,
  });
  assert.equal(q.length, 3, 'a presença de sexta é da quarta alterada, não um treino extra');
  assert.equal(q[2].estado, 'ok');
  assert.equal(q[2].veioEm, SEX);
  assert.equal(q[2].hora, '18:40');
});

test('alterada e perdida vira falta — e nenhuma outra presença a resgata', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, SAB],
    remarcacoes: { [QUA]: { data: QUI, hora: '19:00' } }, hoje: DOMINGO,
  });
  assert.equal(q[2].estado, 'falta');
  assert.equal(q[2].efetivo, QUI);
  const extras = q.filter((x) => x.tipo === 'extra');
  assert.equal(extras.length, 1, 'o sábado sobra como treino extra, sem cobrir a quarta');
});

test('o dia reservado por uma troca não cobre outra falta também', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEX], remarcacoes: { [SEG]: { data: SEX, hora: '' } }, hoje: DOMINGO,
  });
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'falta', 'falta']);
  assert.equal(q.length, 3, 'a sexta está reservada — não sobra como extra');
});

test('o formato antigo de remarcação (só a data) continua sendo lido', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, TER, SEX], remarcacoes: { [QUA]: SEX }, hoje: DOMINGO,
  });
  assert.equal(q[2].estado, 'ok');
  assert.equal(q[2].veioEm, SEX);
});

/* ---------- Atestado: falta com direito a repor ---------- */

test('atestado dá falta, mas é um estado próprio — não o vermelho de quem sumiu', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, horarios: HORARIOS, presencas: [SEG, QUA], atestados: { [TER]: {} }, hoje: DOMINGO,
  });
  assert.deepEqual(q.map((x) => x.estado), ['ok', 'atestado', 'ok']);
  assert.equal(q[1].horaPrevista, '19:00');
});

test('a aula com atestado não é resgatada pela cobertura automática', () => {
  // Ele faltou na terça com atestado e apareceu no sábado. O sábado é treino
  // extra: o atestado já foi compensado com o crédito de reposição.
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [SEG, QUA, SAB], atestados: { [TER]: {} }, hoje: DOMINGO,
  });
  assert.equal(q[1].estado, 'atestado');
  assert.equal(q.filter((x) => x.tipo === 'extra').length, 1);
});

test('atestado sem reposição agendada fica na lista de pendentes', () => {
  assert.deepEqual(reposicoesPendentes({ [TER]: {}, [QUA]: { reposicao: { data: '2026-08-20', hora: '19:00' } } }), [TER]);
  assert.deepEqual(reposicoesPendentes({}), []);
});

test('os pendentes saem do mais antigo para o mais novo', () => {
  assert.deepEqual(reposicoesPendentes({ [QUA]: {}, [SEG]: {}, [TER]: {} }), [SEG, TER, QUA]);
});

/* ---------- Reposição agendada: uma aula a mais, em qualquer semana ---------- */

test('a reposição aparece como quadrado na semana em que foi agendada', () => {
  // Aula perdida em 04/08 (semana anterior), reposta em 12/08 (semana seguinte).
  const q = semanaDoAluno({
    diasTreino: ['seg'], presencas: [], atestados: { [TER]: { reposicao: { data: '2026-08-12', hora: '19:00' } } },
    hoje: new Date(2026, 7, 10, 12), // segunda 10/08
  });
  const rep = q.find((x) => x.tipo === 'reposicao');
  assert.ok(rep, 'a reposição precisa aparecer na semana em que caiu');
  assert.equal(rep.iso, '2026-08-12');
  assert.equal(rep.origem, TER, 'ela sabe de qual aula perdida veio');
  assert.equal(rep.horaPrevista, '19:00');
  assert.equal(rep.estado, 'aguardando');
});

test('a reposição não aparece na semana da aula perdida', () => {
  const q = semanaDoAluno({
    diasTreino: FIXOS, presencas: [], atestados: { [TER]: { reposicao: { data: '2026-08-12', hora: '19:00' } } },
    hoje: QUINTA,
  });
  assert.equal(q.filter((x) => x.tipo === 'reposicao').length, 0);
  assert.equal(q[1].estado, 'atestado', 'na semana original ela segue como atestado');
});

test('reposição cumprida fica verde; o dia dela não vira treino extra', () => {
  const q = semanaDoAluno({
    diasTreino: ['seg'], presencas: ['2026-08-10', '2026-08-12'], horas: { '2026-08-12': '19:07' },
    atestados: { [TER]: { reposicao: { data: '2026-08-12', hora: '19:00' } } },
    hoje: new Date(2026, 7, 16, 12), // domingo, semana fechada
  });
  assert.equal(q.length, 2, 'a segunda e a reposição — nada de extra');
  const rep = q.find((x) => x.tipo === 'reposicao');
  assert.equal(rep.estado, 'ok');
  assert.equal(rep.hora, '19:07');
});

test('reposição agendada e não cumprida fica vermelha quando o dia passa', () => {
  const q = semanaDoAluno({
    diasTreino: [], presencas: [], atestados: { [TER]: { reposicao: { data: '2026-08-12', hora: '19:00' } } },
    hoje: new Date(2026, 7, 16, 12),
  });
  assert.equal(q[0].estado, 'falta');
  assert.equal(reposicoesPendentes({ [TER]: { reposicao: { data: '2026-08-12', hora: '19:00' } } }).length, 0,
    'agendada é agendada: o crédito só volta se o coach desmarcar');
});
