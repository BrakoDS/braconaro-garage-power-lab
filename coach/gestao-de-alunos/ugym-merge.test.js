// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ugym-merge.test.js
 *
 * O check-in feito no app da uGym, aplicado na ficha pela Gestão — com a hora
 * do check-in no app, e fechando a aula certa da ficha (a titular, a trocada ou
 * a reposição). Semana de 05/10/2026; Ana treina seg/qua/sex às 07:00.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarCheckinsNaFicha, temItens } from './ugym-merge.js?v=24';
import { aulasDoDia } from './presenca-regras.js?v=24';

const SEG = '2026-10-05', TER = '2026-10-06', QUA = '2026-10-07', QUI = '2026-10-08';
const ana = (extra = {}) => ({
  id: 'A1', nome: 'Ana', email: 'ana@x.com', diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' },
  presencas: [], presencaHoras: {}, remarcacoes: {}, atestados: {}, ...extra,
});
/** @param {string} dia @param {string} agora @param {number} [em] @param {string} [hora] */
const item = (dia, agora, em = 1, hora = '07:00') => ({ coachUid: 'C', origem: /** @type {'ugym'} */ ('ugym'), dia, hora, checkin: { hoje: dia, agora }, em });

test('check-in na aula titular: presença no dia, com a hora do app', () => {
  const r = aplicarCheckinsNaFicha(ana(), { 'ugym|1': item(QUA, '06:58') });
  assert.deepEqual(r.patch.presencas, [QUA]);
  assert.equal(r.patch.presencaHoras[QUA], '06:58');
  assert.deepEqual(r.consumidos, ['ugym|1']);
  assert.equal(r.logs[0].tipo, 'presenca');
  assert.equal(r.logs[0].resumo, 'Pelo app da uGym: Check-in');
});

test('o Painel de Presença passa a mostrar "Presente"', () => {
  const a = ana();
  assert.equal(aulasDoDia([a], QUA, { hoje: QUA })[0].status, 'confirmado');
  const r = aplicarCheckinsNaFicha(a, { 'ugym|1': item(QUA, '06:58') });
  const [aula] = aulasDoDia([{ ...a, ...r.patch }], QUA, { hoje: QUA });
  assert.equal(aula.status, 'presente');
});

test('aula trocada de dia: o check-in no dia novo fecha a aula de origem', () => {
  const r = aplicarCheckinsNaFicha(ana({ remarcacoes: { [QUA]: { data: QUI, hora: '19:00' } } }), { 'ugym|1': item(QUI, '18:55', 1, '19:00') });
  assert.deepEqual(r.patch.presencas, [QUI]);
  assert.equal(r.patch.presencaHoras[QUI], '18:55');
  assert.equal(r.ignorados.length, 0);
});

test('reposição marcada: o check-in no dia dela fecha a reposição e o crédito fica registrado', () => {
  const atestados = { [SEG]: { em: 1, tipo: 'desmarcacao', expira: '2026-11-04', reposicao: { data: TER, hora: '19:00' } } };
  const r = aplicarCheckinsNaFicha(ana({ atestados }), { 'ugym|1': item(TER, '19:02', 1, '19:00') });
  assert.deepEqual(r.patch.presencas, [TER]);
  assert.equal(r.patch.atestados[SEG].reposicao.data, TER, 'o crédito usado continua na ficha, com a reposição');
  assert.match(r.logs[0].resumo, /^Pelo app da uGym: Check-in da reposição · 06\/10/);
});

test('falta já lançada pelo coach sai: o aluno veio', () => {
  const r = aplicarCheckinsNaFicha(ana({ faltas: { [QUA]: { tipo: 'no-show', em: 1 } } }), { 'ugym|1': item(QUA, '07:10') });
  assert.deepEqual(r.patch.presencas, [QUA]);
  assert.deepEqual(r.patch.faltas, {});
});

test('aluno sem grade fixa: ganha a presença do dia', () => {
  const r = aplicarCheckinsNaFicha(ana({ diasTreino: [], horarios: {} }), { 'ugym|1': item(TER, '12:00') });
  assert.deepEqual(r.patch.presencas, [TER]);
  assert.equal(r.patch.presencaHoras[TER], '12:00');
});

test('aluno com grade e sem aula no dia: nada muda, o coach recebe a linha para decidir', () => {
  const r = aplicarCheckinsNaFicha(ana(), { 'ugym|1': item(TER, '19:05') });
  assert.deepEqual(r.patch, {});
  assert.deepEqual(r.consumidos, ['ugym|1']);
  assert.equal(r.logs.length, 1);
  assert.equal(r.logs[0].tipo, 'presenca-ugym-fora-da-grade');
  assert.match(r.logs[0].resumo, /06\/10 às 19:05.*confira/);
});

test('aula desmarcada (com crédito) e o aluno veio mesmo assim: não fecha nada sozinho', () => {
  const atestados = { [QUA]: { em: 1, tipo: 'desmarcacao', expira: '2026-11-06', reposicao: null } };
  const r = aplicarCheckinsNaFicha(ana({ atestados }), { 'ugym|1': item(QUA, '07:00') });
  assert.deepEqual(r.patch, {});
  assert.equal(r.logs[0].tipo, 'presenca-ugym-fora-da-grade');
});

test('já tinha check-in no dia (o coach marcou antes): ignorado, sem log', () => {
  const r = aplicarCheckinsNaFicha(ana({ presencas: [QUA], presencaHoras: { [QUA]: '06:50' } }), { 'ugym|1': item(QUA, '06:58') });
  assert.deepEqual(r.patch, {});
  assert.equal(r.logs.length, 0);
  assert.deepEqual(r.consumidos, ['ugym|1']);
  assert.match(r.ignorados[0].motivo, /já tinha check-in/);
});

test('dois check-ins no mesmo dia: o primeiro (por chegada) vale, o outro é ignorado', () => {
  const r = aplicarCheckinsNaFicha(ana(), { 'ugym|b': item(QUA, '07:30', 20), 'ugym|a': item(QUA, '06:58', 10) });
  assert.equal(r.patch.presencaHoras[QUA], '06:58');
  assert.deepEqual(r.consumidos, ['ugym|a', 'ugym|b']);
  assert.equal(r.ignorados.length, 1);
});

test('dois dias de uma vez (Gestão fechada): os dois entram', () => {
  const r = aplicarCheckinsNaFicha(ana(), { 'ugym|1': item(SEG, '07:01', 1), 'ugym|2': item(QUA, '06:59', 2) });
  assert.deepEqual(r.patch.presencas, [SEG, QUA]);
  assert.deepEqual(r.patch.presencaHoras, { [SEG]: '07:01', [QUA]: '06:59' });
  assert.equal(r.logs.length, 2);
});

test('item sem dados é consumido e ignorado', () => {
  /** @type {any} */ const ruim = { coachUid: 'C', dia: 'ontem', checkin: { hoje: QUA, agora: '7h' }, em: 1 };
  const r = aplicarCheckinsNaFicha(ana(), { 'ugym|x': ruim, 'ugym|y': /** @type {any} */ (null) });
  assert.deepEqual(r.patch, {});
  assert.deepEqual(r.consumidos.sort(), ['ugym|x', 'ugym|y']);
  assert.equal(r.ignorados.length, 2);
});

test('a ficha recebida não é alterada', () => {
  const a = ana();
  aplicarCheckinsNaFicha(a, { 'ugym|1': item(QUA, '06:58') });
  assert.deepEqual(a.presencas, []);
  assert.deepEqual(a.presencaHoras, {});
});

test('a hora de chegada é a do item, sem converter de novo (o servidor já entrega a hora local do box)', () => {
  // O caso de 19/10: check-in às 07:11 no box. O servidor grava agora: '07:11'; a ficha tem de dizer 07:11, e não 10:11 nem 04:11.
  const r = aplicarCheckinsNaFicha(ana(), { 'ugym|65005': item(QUA, '07:11', 1, '07:05') });
  assert.equal(r.patch.presencaHoras[QUA], '07:11');
});

test('o ouvinte só acorda a Gestão quando há item para aplicar', () => {
  assert.equal(temItens([]), false);
  assert.equal(temItens([{ itens: {} }, { atualizadoEm: 1 }, null]), false, 'o consumo deixa documentos vazios: não acorda (sem laço)');
  assert.equal(temItens([{ itens: {} }, { itens: { 'ugym|1': item(QUA, '07:11') } }]), true);
});
