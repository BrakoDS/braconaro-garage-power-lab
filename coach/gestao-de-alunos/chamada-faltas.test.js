// @ts-check
/** Rodar: node --test coach/gestao-de-alunos/chamada-faltas.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailsQueFaltaram, faltaDaChamada, desfazerFaltaDaChamada, ORIGEM_FALTA } from './chamada-faltas.js';
import { aplicarCheckinsNaFicha, ORIGENS } from './ugym-merge.js?v=37';
import { aulasDoDia, reabrirReposicao } from './presenca-regras.js?v=37';

const QUI = '2026-11-05'; // quinta
const ana = (extra = {}) => ({
  id: 'A', nome: 'Ana', status: 'ativo', diasTreino: ['qua', 'qui'], horarios: { qua: '18:10', qui: '19:10' },
  presencas: [], atestados: {}, faltas: {}, remarcacoes: {}, ...extra,
});
const o = (extra = {}) => ({ dia: QUI, hora: '19:10', em: 1000, hoje: QUI, agora: '20:00', fechados: [], ...extra });
/** @param {any} r */
const falta = (r) => { assert.equal(r.acao, 'falta', JSON.stringify(r)); return r; };
/** @param {any} r @param {RegExp} re */
const nada = (r, re) => { assert.equal(r.acao, 'nada', JSON.stringify(r)); assert.match(r.motivo, re); };
const reposicaoDe = (/** @type {any} */ reposicao) => ana({
  diasTreino: ['seg'], horarios: { seg: '18:10' },
  atestados: { '2026-11-02': { em: 1, tipo: 'desmarcacao', aula: { data: '2026-11-02', hora: '18:10' }, expira: '2026-11-30', reposicao } },
});

test('quem faltou: só os de "faltaram" que não estão em "presentes", sem repetir', () => {
  assert.deepEqual(emailsQueFaltaram({ presentes: ['B@x.com'], faltaram: ['a@x.com', 'b@X.com ', 'a@x.com', 'c@x.com'] }), ['a@x.com', 'c@x.com']);
  assert.deepEqual(emailsQueFaltaram({}), []);
  assert.deepEqual(emailsQueFaltaram(null), []);
  assert.deepEqual(emailsQueFaltaram({ faltaram: 'a@x.com' }), []);
});

test('titular que não veio: faltas[dia] no formato do no-show, com origem lousa', () => {
  const r = falta(faltaDaChamada(ana(), o()));
  assert.equal(r.tipo, 'titular');
  assert.equal(r.chave, QUI);
  assert.deepEqual(Object.keys(r.patch), ['faltas'], 'só o campo que mudou');
  assert.deepEqual(r.patch.faltas[QUI], { em: 1000, tipo: 'no-show', aula: { data: QUI, hora: '19:10' }, origem: ORIGEM_FALTA });
  assert.equal(r.log.tipo, 'falta');
  assert.match(r.log.resumo, /Pela chamada da Lousa: não veio/);
  assert.equal(r.log.extra.origem, 'lousa');
  assert.equal(r.log.extra.chave, `falta:A:${QUI}`);
});

test('o dia já passou (chamada fechada depois): a falta entra do mesmo jeito', () => {
  falta(faltaDaChamada(ana(), o({ hoje: '2026-11-06' })));
});

test('avisou: "Não irei" no prazo (crédito), atestado e exceção: nenhuma falta', () => {
  const aula = { data: QUI, hora: '19:10' };
  nada(faltaDaChamada(ana({ atestados: { [QUI]: { tipo: 'desmarcacao', aula, expira: '2026-11-30', reposicao: null } } }), o()), /avisou/);
  nada(faltaDaChamada(ana({ atestados: { [QUI]: { em: 1, reposicao: null } } }), o()), /avisou/);
  nada(faltaDaChamada(ana({ atestados: { [QUI]: { tipo: 'excecao', antes: 'no-show', aula, expira: '2026-12-31', reposicao: null } } }), o()), /avisou|resposta/);
});

test('"Não irei" fora do prazo já é uma falta lançada: não grava outra por cima', () => {
  nada(faltaDaChamada(ana({ faltas: { [QUI]: { em: 5, tipo: 'fora-do-prazo', aula: { data: QUI, hora: '19:10' } } } }), o()), /resposta/);
});

test('já tem presença no dia (uGym chegou antes): nada', () => {
  nada(faltaDaChamada(ana({ presencas: [QUI] }), o()), /presença/);
});

test('sem aula nesse dia, ou em outro horário: nada', () => {
  nada(faltaDaChamada(ana(), o({ dia: '2026-11-06', hoje: '2026-11-06', hora: '19:10' })), /sem aula/); // sexta
  nada(faltaDaChamada(ana(), o({ hora: '18:10' })), /sem aula/);                                          // outra turma
  nada(faltaDaChamada(ana({ horarios: {} }), o()), /sem aula/);                                           // ficha sem horário
});

test('box fechado nesse dia: nada', () => {
  nada(faltaDaChamada(ana(), o({ fechados: [QUI] })), /fechado/);
});

test('ficha inativa, sem ficha e chamada do futuro: nada', () => {
  nada(faltaDaChamada(ana({ status: 'inativo' }), o()), /inativa/);
  nada(faltaDaChamada(ana({ status: 'pausado' }), o()), /pausada/);
  nada(faltaDaChamada(null, o()), /sem ficha/);
  nada(faltaDaChamada(ana(), o({ hoje: '2026-11-04' })), /ainda não chegou/);
});

test('aula remarcada para este dia: a falta fica na aula planejada e a troca é mantida', () => {
  const a = ana({ remarcacoes: { '2026-11-04': { data: QUI, hora: '19:10' } }, diasTreino: ['qua'], horarios: { qua: '18:10' } });
  const r = falta(faltaDaChamada(a, o()));
  assert.equal(r.chave, '2026-11-04');
  assert.deepEqual(r.patch.faltas['2026-11-04'].aula, { data: QUI, hora: '19:10' });
  assert.equal('remarcacoes' in r.patch, false, 'a troca de dia não é apagada');
});

test('reposição que o aluno não usou: no-show na reposição, crédito perdido', () => {
  const a = reposicaoDe({ data: QUI, hora: '19:10' });
  const r = falta(faltaDaChamada(a, o()));
  assert.equal(r.tipo, 'reposicao');
  assert.equal(r.chave, '2026-11-02');
  const rep = r.patch.atestados['2026-11-02'].reposicao;
  assert.equal(rep.noShow, true);
  assert.equal(rep.noShowEm, 1000);
  assert.equal(rep.noShowOrigem, 'lousa');
  assert.equal(rep.data, QUI, 'a reposição continua ligada ao crédito (que fica gasto)');
  assert.match(r.log.resumo, /No-show na reposição[^]*crédito perdido/);
  const aula = aulasDoDia([{ ...a, atestados: r.patch.atestados }], QUI, { hoje: QUI }).find((x) => x.tipo === 'reposicao');
  assert.equal(aula?.status, 'falta');
});

test('reposição já marcada como no-show, ou desmarcada fora do prazo: não repete', () => {
  nada(faltaDaChamada(reposicaoDe({ data: QUI, hora: '19:10', noShow: true }), o()), /resolvida/);
  nada(faltaDaChamada(reposicaoDe({ data: QUI, hora: '19:10', foraDoPrazo: true }), o()), /resolvida/);
});

test('idempotente: aplicar o patch e rodar de novo não gera nada', () => {
  const a = ana();
  const r1 = falta(faltaDaChamada(a, o()));
  nada(faltaDaChamada({ ...a, ...r1.patch }, o()), /resposta/);
  const b = reposicaoDe({ data: QUI, hora: '19:10' });
  const r2 = falta(faltaDaChamada(b, o()));
  nada(faltaDaChamada({ ...b, ...r2.patch }, o()), /resolvida/);
});

const ITEM = { coachUid: 'c', origem: 'lousa', dia: QUI, hora: '19:10', checkin: { hoje: QUI, agora: '19:10' }, em: 2000 };

test('fechar de novo: quem passou para "veio" perde a falta da Lousa pelo check-in', () => {
  const a = ana();
  const f = falta(faltaDaChamada(a, o()));
  const comFalta = { ...a, ...f.patch };
  const r = aplicarCheckinsNaFicha(comFalta, { [`lousa|${QUI}|19:10`]: ITEM }, ORIGENS.lousa);
  const depois = { ...comFalta, ...r.patch };
  assert.deepEqual(depois.presencas, [QUI]);
  assert.deepEqual(depois.faltas, {}, 'a falta com origem lousa saiu');
  assert.deepEqual(emailsQueFaltaram({ presentes: ['a@x.com'], faltaram: [] }), []);
  nada(faltaDaChamada(depois, o()), /presença/);
});

test('fechar de novo com a aula remarcada: o check-in ainda acha a aula e tira a falta', () => {
  const a = ana({ remarcacoes: { '2026-11-04': { data: QUI, hora: '19:10' } }, diasTreino: ['qua'], horarios: { qua: '18:10' } });
  const f = falta(faltaDaChamada(a, o()));
  const comFalta = { ...a, ...f.patch };
  const r = aplicarCheckinsNaFicha(comFalta, { [`lousa|${QUI}|19:10`]: ITEM }, ORIGENS.lousa);
  const depois = { ...comFalta, ...r.patch };
  assert.deepEqual(depois.presencas, [QUI]);
  assert.deepEqual(depois.faltas, {});
  assert.deepEqual(r.ignorados, []);
});

test('reposição corrigida para "veio": a presença ganha e "reabrir" limpa a marca da Lousa', () => {
  const a = reposicaoDe({ data: QUI, hora: '19:10' });
  const f = falta(faltaDaChamada(a, o()));
  const comFalta = { ...a, ...f.patch };
  const r = aplicarCheckinsNaFicha(comFalta, { [`lousa|${QUI}|19:10`]: ITEM }, ORIGENS.lousa);
  const depois = { ...comFalta, ...r.patch };
  assert.deepEqual(depois.presencas, [QUI]);
  assert.equal(aulasDoDia([depois], QUI, { hoje: QUI }).find((x) => x.tipo === 'reposicao')?.status, 'presente');
  // a marca de no-show sai com a presença: nada de "no-show lançado" na Turmas
  const rep = depois.atestados['2026-11-02'].reposicao;
  assert.equal('noShow' in rep, false);
  assert.equal('noShowEm' in rep, false);
  assert.equal('noShowOrigem' in rep, false);
  assert.deepEqual(rep, { data: QUI, hora: '19:10' });
  const reaberta = reabrirReposicao(comFalta, '2026-11-02');
  assert.equal('noShowOrigem' in reaberta.patch.atestados['2026-11-02'].reposicao, false);
});

test('chamada de HOJE fechada antes da hora da aula não grava falta', () => {
  nada(faltaDaChamada(ana(), o({ agora: '19:00' })), /ainda não começou/);
  nada(faltaDaChamada(ana(), o({ agora: undefined })), /ainda não começou/);
  falta(faltaDaChamada(ana(), o({ agora: '19:10' })));
  // dia passado: a hora do relógio não importa
  falta(faltaDaChamada(ana(), o({ hoje: '2026-11-06', agora: '08:00' })));
});

test('saiu da lista na chamada refeita: a falta da própria Lousa sai, a do coach não', () => {
  const a = ana();
  const comFalta = { ...a, ...falta(faltaDaChamada(a, o())).patch };
  const r = desfazerFaltaDaChamada(comFalta, { dia: QUI, hora: '19:10' });
  assert.equal(r.acao, 'desfazer');
  assert.deepEqual(r.patch.faltas, {});
  assert.match(r.log.resumo, /saiu da lista/);
  // outra aula (hora) não é tocada
  assert.equal(desfazerFaltaDaChamada(comFalta, { dia: QUI, hora: '18:10' }).acao, 'nada');
  // falta do coach (sem origem): nunca
  const doCoach = ana({ faltas: { [QUI]: { em: 5, tipo: 'no-show', aula: { data: QUI, hora: '19:10' } } } });
  assert.equal(desfazerFaltaDaChamada(doCoach, { dia: QUI, hora: '19:10' }).acao, 'nada');
  assert.equal(desfazerFaltaDaChamada(null, { dia: QUI, hora: '19:10' }).acao, 'nada');
});

test('saiu da lista: o no-show de reposição da Lousa sai, o do coach fica', () => {
  const a = reposicaoDe({ data: QUI, hora: '19:10' });
  const comFalta = { ...a, ...falta(faltaDaChamada(a, o())).patch };
  const r = desfazerFaltaDaChamada(comFalta, { dia: QUI, hora: '19:10' });
  assert.equal(r.acao, 'desfazer');
  assert.deepEqual(r.patch.atestados['2026-11-02'].reposicao, { data: QUI, hora: '19:10' });
  const doCoach = reposicaoDe({ data: QUI, hora: '19:10', noShow: true, noShowEm: 3 });
  assert.equal(desfazerFaltaDaChamada(doCoach, { dia: QUI, hora: '19:10' }).acao, 'nada');
});
