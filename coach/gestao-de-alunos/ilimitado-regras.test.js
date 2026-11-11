// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarMarcacao, marcar, gravarMarcacao, desmarcarIlimitadoComAviso, noShowIlimitado, reabrirIlimitado, tirarMarcacao,
  aulasNaSemana, previaDesmarcacaoIlimitado, ehIlimitado,
} from './ilimitado-regras.js';
import { turmasDoDia, aulasDoDia } from './presenca-regras.js';
import { agendarReposicao } from './checkin-regras.js';
import { aplicarAvisosNaFicha } from './ausencias-merge.js';
import { faltaDaChamada, desfazerFaltaDaChamada } from './chamada-faltas.js';

// Semana de 16/11/2026 (segunda) a 22/11 (domingo).
const SEG = '2026-11-16', TER = '2026-11-17', QUA = '2026-11-18';
const ilim = { id: 'Ivo01', nome: 'Ivo', status: 'ativo', plano: { vezes: 'ilimitado', prazo: 'mensal' }, presencas: [] };
const relogio = { hoje: SEG, agora: '08:00' };
const recusou = (/** @type {any} */ r) => !!r && 'recusa' in r;
const comPatch = (/** @type {any} */ a, /** @type {any} */ r) => ({ ...a, ...r.patch });

test('só o Ilimitado marca; pausado não', () => {
  assert.equal(ehIlimitado(ilim), true);
  assert.match(/** @type {any} */ (avaliarMarcacao({ ...ilim, plano: { vezes: 3 } }, { data: TER, hora: '18:10' }, { relogio, vagas: 3 })).erro, /Só o plano Ilimitado/);
  assert.match(/** @type {any} */ (avaliarMarcacao({ ...ilim, status: 'pausado' }, { data: TER, hora: '18:10' }, { relogio, vagas: 3 })).erro, /pausado/);
});

test('janela de 7 dias, 1h antes, turma com vaga', () => {
  assert.deepEqual(avaliarMarcacao(ilim, { data: TER, hora: '18:10' }, { relogio, vagas: 1 }), { ok: true, antecedenciaMin: 2050 });
  assert.match(/** @type {any} */ (avaliarMarcacao(ilim, { data: '2026-11-15', hora: '18:10' }, { relogio, vagas: 1 })).erro, /próximos 7 dias/);
  assert.match(/** @type {any} */ (avaliarMarcacao(ilim, { data: '2026-11-23', hora: '18:10' }, { relogio, vagas: 1 })).erro, /próximos 7 dias/);
  assert.equal('ok' in avaliarMarcacao(ilim, { data: '2026-11-22', hora: '09:00' }, { relogio, vagas: 1 }), true, 'o 7º dia (contando hoje) ainda vale');
  assert.match(/** @type {any} */ (avaliarMarcacao(ilim, { data: SEG, hora: '08:30' }, { relogio, vagas: 1 })).erro, /até 1h antes/);
  assert.equal('ok' in avaliarMarcacao(ilim, { data: SEG, hora: '09:00' }, { relogio, vagas: 1 }), true, 'exatamente 1h antes vale');
  assert.match(/** @type {any} */ (avaliarMarcacao(ilim, { data: TER, hora: '18:10' }, { relogio, vagas: 0 })).erro, /lotada/);
  assert.match(/** @type {any} */ (avaliarMarcacao(ilim, { data: TER, hora: '' }, { relogio, vagas: 1 })).erro, /horário/);
});

test('uma aula por dia (marcada, grade fixa ou reposição) e 6 na semana', () => {
  const r = /** @type {any} */ (marcar(ilim, { data: TER, hora: '18:10' }, { relogio, vagas: 2, em: 1 }));
  assert.deepEqual(r.patch.marcacoes, { [TER]: { hora: '18:10', em: 1 } });
  assert.equal(r.log.tipo, 'marcacao');
  const a = comPatch(ilim, r);
  assert.ok(recusou(marcar(a, { data: TER, hora: '19:10' }, { relogio, vagas: 2, em: 2 })), 'já marcou no dia');
  const comGrade = { ...ilim, diasTreino: ['qua'], horarios: { qua: '07:00' } };
  assert.ok(recusou(marcar(comGrade, { data: QUA, hora: '18:10' }, { relogio, vagas: 2, em: 2 })), 'quarta é da grade fixa');
  assert.ok(!recusou(marcar(comGrade, { data: TER, hora: '18:10' }, { relogio, vagas: 2, em: 2 })), 'com grade fixa, marca os outros dias');
  const cheia = { ...ilim, marcacoes: Object.fromEntries(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map((d) => [d, { hora: '07:00' }])) };
  assert.equal(aulasNaSemana(cheia, SEG), 6);
  const domingo = /** @type {any} */ (avaliarMarcacao(cheia, { data: '2026-11-22', hora: '09:00' }, { relogio, vagas: 2 }));
  assert.match(domingo.erro, /6 aulas/);
  const comFalta = { ...cheia, marcacoes: { ...cheia.marcacoes, '2026-11-16': { hora: '07:00', noShow: true } } };
  assert.equal(aulasNaSemana(comFalta, SEG), 5, 'a falta não conta no limite');
});

test('a reposição não cai no dia da aula marcada', () => {
  const a = { ...ilim, marcacoes: { [TER]: { hora: '18:10' } }, atestados: { '2026-11-02': { tipo: 'desmarcacao', expira: '2026-11-30', reposicao: null } } };
  const r = /** @type {any} */ (agendarReposicao(a, '2026-11-02', TER, '19:10'));
  assert.ok(recusou(r));
  assert.match(r.recusa.texto, /Ilimitado já usa esse dia/);
});

test('na turma: a aula marcada entra como Ilimitado e ocupa vaga', () => {
  const a = { ...ilim, marcacoes: { [TER]: { hora: '18:10' } } };
  const aulas = aulasDoDia([a], TER, { hoje: SEG });
  assert.deepEqual(aulas.map((x) => [x.tipo, x.chave, x.hora, x.status]), [['ilimitado', TER, '18:10', 'confirmado']]);
  const [t] = turmasDoDia([a], TER, { hoje: SEG, config: { padrao: 6 } });
  assert.deepEqual([t.hora, t.ocupadas, t.vagas], ['18:10', 1, 5]);
  assert.equal(aulasDoDia([{ ...a, presencas: [TER] }], TER, { hoje: SEG })[0].status, 'presente');
  assert.equal(aulasDoDia([a], TER, { hoje: QUA })[0].status, 'sem-chamada');
});

test('desmarcar: com 2h ou mais a vaga fica livre; com menos, falta', () => {
  const a = { ...ilim, marcacoes: { [TER]: { hora: '18:10', em: 1 } } };
  assert.deepEqual(previaDesmarcacaoIlimitado(a, TER, { hoje: TER, agora: '16:10' }), { noPrazo: true, antecedenciaMin: 120 });
  const noPrazo = /** @type {any} */ (desmarcarIlimitadoComAviso(a, TER, { aviso: { hoje: TER, agora: '16:10' }, em: 5 }));
  assert.deepEqual(noPrazo.patch.marcacoes, {});
  assert.match(noPrazo.log.resumo, /no prazo/);
  const fora = /** @type {any} */ (desmarcarIlimitadoComAviso(a, TER, { aviso: { hoje: TER, agora: '16:30' }, em: 5 }));
  assert.equal(fora.patch.marcacoes[TER].foraDoPrazo, true);
  assert.equal(fora.log.tipo, 'falta');
  const comFalta = comPatch(a, fora);
  assert.equal(aulasDoDia([comFalta], TER, { hoje: SEG })[0].status, 'desmarcou-fora');
  const [t] = turmasDoDia([comFalta], TER, { hoje: SEG });
  assert.equal(t.ocupadas, 0, 'desmarcou fora do prazo: a vaga fica livre');
  assert.equal(desmarcarIlimitadoComAviso(ilim, TER, { aviso: relogio, em: 1 }), null);
});

test('no-show, reabrir e tirar', () => {
  const a = { ...ilim, marcacoes: { [TER]: { hora: '18:10' } }, presencas: [TER] };
  const ns = /** @type {any} */ (noShowIlimitado(a, TER, { em: 3 }));
  assert.equal(ns.patch.marcacoes[TER].noShow, true);
  assert.deepEqual(ns.patch.presencas, []);
  const re = /** @type {any} */ (reabrirIlimitado(comPatch(a, ns), TER));
  assert.deepEqual(re.patch.marcacoes[TER], { hora: '18:10' });
  const ti = /** @type {any} */ (tirarMarcacao(a, TER));
  assert.deepEqual(ti.patch.marcacoes, {});
});

test('as caixas: a marcação do app entra na fila, e o Não irei do Ilimitado a desmarca', () => {
  const marcacoes = { [TER]: { data: TER, hora: '18:10', coachUid: 'c', em: 10 } };
  const avisos = { [`ilimitado|${TER}`]: { tipo: 'ilimitado', chave: TER, coachUid: 'c', aviso: { hoje: TER, agora: '10:00' }, em: 20 } };
  const r = aplicarAvisosNaFicha(ilim, avisos, {}, marcacoes);
  assert.deepEqual(r.marcacoesConsumidas, [TER]);
  assert.deepEqual(r.consumidos, [`ilimitado|${TER}`]);
  assert.deepEqual(r.patch.marcacoes, {}, 'marcou e desmarcou no prazo: nada fica');
  assert.deepEqual(r.logs.map((l) => l.tipo), ['marcacao', 'marcacao']);
  const so = aplicarAvisosNaFicha(ilim, {}, {}, marcacoes);
  assert.deepEqual(so.patch.marcacoes, { [TER]: { hora: '18:10', em: 10 } });
  const recusada = aplicarAvisosNaFicha({ ...ilim, plano: { vezes: 3 } }, {}, {}, marcacoes);
  assert.deepEqual(recusada.ignorados.map((i) => i.motivo), ['a ficha não é do plano Ilimitado']);
});

test('a chamada da Lousa: falta na aula marcada, e desfazer', () => {
  const a = { ...ilim, email: 'ivo@b.com', marcacoes: { [TER]: { hora: '18:10' } } };
  const f = /** @type {any} */ (faltaDaChamada(a, { dia: TER, hora: '18:10', em: 9, hoje: TER, agora: '19:30' }));
  assert.equal(f.acao, 'falta');
  assert.equal(f.tipo, 'ilimitado');
  assert.deepEqual(f.patch.marcacoes[TER], { hora: '18:10', noShow: true, noShowEm: 9, noShowOrigem: 'lousa' });
  const d = /** @type {any} */ (desfazerFaltaDaChamada({ ...a, ...f.patch }, { dia: TER, hora: '18:10' }));
  assert.equal(d.acao, 'desfazer');
  assert.deepEqual(d.patch.marcacoes[TER], { hora: '18:10' });
});

test('gravarMarcacao (o que o servidor aplica): a trava da ficha', () => {
  assert.ok(!recusou(gravarMarcacao(ilim, TER, '18:10', 1)));
  assert.ok(recusou(gravarMarcacao({ ...ilim, marcacoes: { [TER]: { hora: '07:00' } } }, TER, '18:10', 1)));
});
