// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ausencias-merge.test.js
 *
 * O aviso "Não irei ao treino" aplicado na ficha pela Gestão — com o relógio
 * do SERVIDOR (o do aviso), e não com o da hora em que o coach abriu a tela.
 * Semana de 05/10/2026; Ana treina seg/qua/sex às 07:00.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarAvisosNaFicha } from './ausencias-merge.js?v=36';

const QUA = '2026-10-07', SEX = '2026-10-09', QUI = '2026-10-08';
const ana = (extra = {}) => ({
  id: 'A1', nome: 'Ana', email: 'ana@x.com', diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' },
  presencas: [], presencaHoras: {}, remarcacoes: {}, atestados: {}, ...extra,
});
/** @param {'titular'|'reposicao'} tipo @param {string} chave @param {string} hoje @param {string} agora @param {number} em */
const aviso = (tipo, chave, hoje, agora, em) => ({ tipo, chave, coachUid: 'C', aviso: { hoje, agora }, em });

test('aviso no prazo vira crédito até o fim do mês do AVISO, mesmo aplicado dias depois', () => {
  const r = aplicarAvisosNaFicha(ana(), { [`titular|${QUA}`]: aviso('titular', QUA, '2026-10-06', '20:00', 10) });
  assert.equal(r.patch.atestados[QUA].tipo, 'desmarcacao');
  assert.equal(r.patch.atestados[QUA].expira, '2026-10-31'); // fim do mês do aviso (06/10)
  assert.deepEqual(r.consumidos, [`titular|${QUA}`]);
  assert.equal(r.logs[0].tipo, 'desmarcacao');
  assert.match(r.logs[0].resumo, /^Pelo app: Desmarcou no prazo \(11h antes/);
});

test('aviso fora do prazo vira falta sem crédito', () => {
  const r = aplicarAvisosNaFicha(ana(), { [`titular|${QUA}`]: aviso('titular', QUA, QUA, '06:00', 10) });
  assert.equal(r.patch.faltas[QUA].tipo, 'fora-do-prazo');
  assert.deepEqual(r.patch.atestados, {});
});

test('vários avisos: aplicados em ordem de chegada, cada um vendo o anterior', () => {
  const r = aplicarAvisosNaFicha(ana(), {
    [`titular|${SEX}`]: aviso('titular', SEX, QUA, '10:00', 20),
    [`titular|${QUA}`]: aviso('titular', QUA, '2026-10-06', '10:00', 10),
  });
  assert.deepEqual(Object.keys(r.patch.atestados).sort(), [QUA, SEX]);
  assert.equal(r.logs.length, 2);
});

test('aviso que a regra recusa (o coach já resolveu a aula) é consumido e ignorado', () => {
  const a = ana({ atestados: { [QUA]: { em: 1, tipo: 'desmarcacao', reposicao: null } } });
  const r = aplicarAvisosNaFicha(a, { [`titular|${QUA}`]: aviso('titular', QUA, QUA, '04:00', 10), lixo: /** @type {any} */ (null) });
  assert.deepEqual(r.patch, {});
  assert.deepEqual(r.consumidos.sort(), ['lixo', `titular|${QUA}`]);
  assert.deepEqual(r.ignorados.map((i) => i.motivo).sort(), ['Essa aula já tem crédito de reposição', 'aviso sem dados']);
});

test('reposição: no prazo o crédito volta para a fila; fora do prazo é perdido', () => {
  const comRep = ana({ atestados: { '2026-09-28': { em: 1, tipo: 'desmarcacao', expira: '2026-10-28', reposicao: { data: QUI, hora: '18:00' } } } });
  const noPrazo = aplicarAvisosNaFicha(comRep, { 'reposicao|2026-09-28': aviso('reposicao', '2026-09-28', QUI, '15:00', 1) });
  assert.equal(noPrazo.patch.atestados['2026-09-28'].reposicao, null);
  const fora = aplicarAvisosNaFicha(comRep, { 'reposicao|2026-09-28': aviso('reposicao', '2026-09-28', QUI, '17:00', 1) });
  assert.equal(fora.patch.atestados['2026-09-28'].reposicao.foraDoPrazo, true);
});

/** @param {string} data @param {string} hora @param {number} em */
const reserva = (data, hora, em) => ({ data, hora, coachUid: 'C', alunoId: 'A1', em });

test('reserva do aluno: o crédito livre ganha a reposição, e a reserva é consumida', () => {
  const a = ana({ atestados: { '2026-09-28': { em: 1, tipo: 'desmarcacao', expira: '2026-10-28', reposicao: null } } });
  const r = aplicarAvisosNaFicha(a, {}, { '2026-09-28': reserva(QUI, '18:00', 5) });
  assert.deepEqual(r.patch.atestados['2026-09-28'].reposicao, { data: QUI, hora: '18:00' });
  assert.deepEqual(r.reservasConsumidas, ['2026-09-28']);
  assert.deepEqual(r.consumidos, []);
  assert.match(r.logs[0].resumo, /^Pelo app: Reposição da aula de 28\/09 marcada para 08\/10 18:00/);
});

test('reserva com o crédito de um "Não irei" ainda não aplicado: o aviso entra antes, por ordem de chegada', () => {
  const r = aplicarAvisosNaFicha(ana(), { [`titular|${QUA}`]: aviso('titular', QUA, '2026-10-06', '10:00', 10) }, { [QUA]: reserva(QUI, '18:00', 20) });
  assert.equal(r.patch.atestados[QUA].tipo, 'desmarcacao');
  assert.deepEqual(r.patch.atestados[QUA].reposicao, { data: QUI, hora: '18:00' });
  assert.deepEqual(r.ignorados, []);
});

test('reserva e depois "Não irei" fora do prazo nela: a reserva entra e a reposição vira falta', () => {
  const a = ana({ atestados: { '2026-09-28': { em: 1, tipo: 'desmarcacao', expira: '2026-10-28', reposicao: null } } });
  const r = aplicarAvisosNaFicha(a, { 'reposicao|2026-09-28': aviso('reposicao', '2026-09-28', QUI, '17:00', 30) }, { '2026-09-28': reserva(QUI, '18:00', 20) });
  assert.equal(r.patch.atestados['2026-09-28'].reposicao.data, QUI);
  assert.equal(r.patch.atestados['2026-09-28'].reposicao.foraDoPrazo, true);
});

test('reserva que a ficha recusa (crédito já usado, crédito sumiu, dia com aula) é consumida e ignorada', () => {
  const usado = ana({ atestados: { '2026-09-28': { em: 1, tipo: 'desmarcacao', reposicao: { data: '2026-10-10', hora: '09:00' } } } });
  assert.deepEqual(aplicarAvisosNaFicha(usado, {}, { '2026-09-28': reserva(QUI, '18:00', 5) }).ignorados.map((i) => i.motivo), ['o crédito já tem reposição marcada']);
  const sumiu = aplicarAvisosNaFicha(ana(), {}, { '2026-09-28': reserva(QUI, '18:00', 5) });
  assert.deepEqual(sumiu.patch, {});
  assert.deepEqual(sumiu.reservasConsumidas, ['2026-09-28']);
  const livre = ana({ atestados: { '2026-09-28': { em: 1, tipo: 'desmarcacao', reposicao: null } } });
  assert.equal(aplicarAvisosNaFicha(livre, {}, { '2026-09-28': reserva(QUA, '18:00', 5) }).ignorados.length, 1);
});
