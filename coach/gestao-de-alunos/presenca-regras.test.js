// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/presenca-regras.test.js
 *
 * As regras do Painel de Presença, sem tela e sem banco. A semana é a de
 * 05/10/2026 (segunda) a 11/10/2026; "hoje" é a quarta, 07/10. Ana treina
 * seg/qua/sex às 07:00; Bia, ter/qua às 07:00; Caio, qua às 18:00.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  antecedenciaMin, somarDias, textoAntecedencia, ondeAcontece, aulasDoDia, turmasDoDia, capacidadeDaTurma,
  creditosDisponiveis, previaDesmarcacao, desmarcar, desmarcarReposicaoComAviso, marcarNoShow, noShowReposicao,
  concederCredito, concederCreditoReposicao, agendarReposicaoNaTurma, reabrirReposicao,
  adicionarExperimental, statusExperimental, removerExperimental, podarExperimentais, resumoDaTurma,
  PRAZO_DESMARCAR_MIN, VALIDADE_CREDITO_DIAS, CAPACIDADE_PADRAO, STATUS,
} from './presenca-regras.js?v=23';
import { checkin, trocarDia, desfazer } from './checkin-regras.js?v=23';
import { semanaDoAluno, reposicoesPendentes } from '../../compartilhado/regras/semana.js';

const SEG = '2026-10-05', TER = '2026-10-06', QUA = '2026-10-07', QUI = '2026-10-08', SEX = '2026-10-09';
const TER2 = '2026-10-13';

/** @param {string} id @param {string} nome @param {Record<string,string>} horarios @param {any} [extra] */
const ficha = (id, nome, horarios, extra = {}) => ({
  id, nome, diasTreino: Object.keys(horarios), horarios,
  presencas: [], presencaHoras: {}, remarcacoes: {}, atestados: {}, ...extra,
});
const ana = (extra = {}) => ficha('A1', 'Ana', { seg: '07:00', qua: '07:00', sex: '07:00' }, extra);
const bia = (extra = {}) => ficha('B2', 'Bia', { ter: '07:00', qua: '07:00' }, extra);
const caio = (extra = {}) => ficha('C3', 'Caio', { qua: '18:00' }, extra);

/** Aplica um patch como a tela faz (db.atualizar = Object.assign). */
const aplicar = (/** @type {any} */ a, /** @type {any} */ r) => { assert.ok(r && 'patch' in r, `esperava mudança, veio ${JSON.stringify(r)}`); return { ...a, ...r.patch }; };

/* ---------- relógio ---------- */

test('relógio: antecedência em minutos, dias somados e o texto do prazo', () => {
  assert.equal(antecedenciaMin({ hoje: QUA, agora: '05:00' }, QUA, '07:00'), 120);
  assert.equal(antecedenciaMin({ hoje: TER, agora: '22:30' }, QUA, '07:00'), 510, 'atravessa a meia-noite');
  assert.equal(antecedenciaMin({ hoje: QUA, agora: '07:10' }, QUA, '07:00'), -10);
  assert.equal(antecedenciaMin({ hoje: QUA, agora: '05:00' }, QUA, ''), null, 'sem hora não há prazo');
  assert.equal(somarDias(QUA, 30), '2026-11-06');
  assert.equal(somarDias('2026-12-20', 30), '2027-01-19', 'vira o ano');
  assert.equal(textoAntecedencia(130), '2h10 antes');
  assert.equal(textoAntecedencia(120), '2h antes');
  assert.equal(textoAntecedencia(45), '45min antes');
  assert.equal(textoAntecedencia(-5), 'depois do início');
});

/* ---------- regra 1: a grade fixa monta a turma ---------- */

test('turma: quem tem grade fixa entra sozinho na turma do seu horário', () => {
  const turmas = turmasDoDia([ana(), bia(), caio()], QUA, { hoje: QUA });
  assert.deepEqual(turmas.map((t) => [t.hora, t.aulas.map((x) => x.aluno.nome), t.ocupadas, t.capacidade]),
    [['07:00', ['Ana', 'Bia'], 2, CAPACIDADE_PADRAO], ['18:00', ['Caio'], 1, CAPACIDADE_PADRAO]]);
  assert.ok(turmas[0].aulas.every((x) => x.tipo === 'titular' && x.status === 'confirmado'));
  assert.deepEqual(turmasDoDia([ana(), bia(), caio()], QUI, { hoje: QUA }), [], 'quinta: ninguém tem aula');
});

test('turma: a aula remarcada aparece no dia e na hora para onde foi', () => {
  const a = aplicar(ana(), trocarDia(ana(), SEG, TER, '18:00'));
  assert.deepEqual(ondeAcontece(a, SEG), { data: TER, hora: '18:00' });
  assert.deepEqual(aulasDoDia([a], TER, { hoje: QUA }).map((x) => [x.chave, x.hora]), [[SEG, '18:00']]);
  assert.deepEqual(aulasDoDia([a], SEG, { hoje: QUA }), [], 'saiu da segunda');
});

test('turma: o status de cada um — presente, falta automática, box fechado', () => {
  const a = ana({ presencas: [SEG], presencaHoras: { [SEG]: '06:58' } });
  assert.deepEqual(aulasDoDia([a], SEG, { hoje: QUA }).map((x) => [x.status, x.horaCheckin]), [['presente', '06:58']]);
  const faltou = aulasDoDia([ana()], SEG, { hoje: QUA })[0];
  assert.equal(faltou.status, 'falta');
  assert.equal(faltou.automatica, true, 'o dia passou: falta calculada, não lançada');
  assert.equal(aulasDoDia([ana()], SEX, { hoje: QUA })[0].status, 'confirmado');
  assert.equal(aulasDoDia([ana()], SEG, { hoje: QUA, fechados: [SEG] })[0].status, 'fechado');
});

test('turma: vagas — capacidade por horário, padrão do box, e quem libera a vaga', () => {
  const config = { padrao: 8, porHorario: { '07:00': 2 } };
  assert.equal(capacidadeDaTurma(config, '07:00'), 2);
  assert.equal(capacidadeDaTurma(config, '18:00'), 8);
  assert.equal(capacidadeDaTurma(null, '18:00'), CAPACIDADE_PADRAO);
  assert.equal(capacidadeDaTurma({ porHorario: { '07:00': 0 } }, '07:00'), 0, 'zero é um número válido');
  const cheia = turmasDoDia([ana(), bia()], QUA, { hoje: QUA, config })[0];
  assert.deepEqual([cheia.ocupadas, cheia.vagas, cheia.lotada], [2, 0, true]);
  const b = aplicar(bia(), desmarcar(bia(), QUA, { aviso: { hoje: TER, agora: '20:00' }, em: 1 }));
  const livre = turmasDoDia([ana(), b], QUA, { hoje: QUA, config })[0];
  assert.deepEqual([livre.ocupadas, livre.vagas, livre.lotada], [1, 1, false], 'quem desmarcou libera a vaga');
});

test('turma: experimental ocupa vaga (a cancelada não), e horário vazio aberto à mão aparece', () => {
  const exps = [
    { id: 'x1', nome: 'Duda', hora: '07:00', status: /** @type {const} */ ('confirmado'), em: 1 },
    { id: 'x2', nome: 'Edu', hora: '07:00', status: /** @type {const} */ ('cancelada'), em: 1 },
  ];
  const turmas = turmasDoDia([ana()], QUA, { hoje: QUA, experimentais: exps, horasExtras: ['12:00'] });
  assert.deepEqual(turmas.map((t) => [t.hora, t.ocupadas]), [['07:00', 2], ['12:00', 0]]);
});

test('turma: aluno sem horário na ficha cai na turma "sem horário", por último', () => {
  const sem = ficha('D4', 'Davi', { qua: '' });
  assert.deepEqual(turmasDoDia([sem, ana()], QUA, { hoje: QUA }).map((t) => t.hora), ['07:00', '']);
});

/* ---------- regra 2: desmarcar com 2h ou mais gera crédito ---------- */

test('desmarcar com exatamente 2h: no prazo, +1 crédito de 30 dias, vaga livre', () => {
  const aviso = { hoje: QUA, agora: '05:00' };
  assert.deepEqual(previaDesmarcacao(ana(), QUA, aviso), { noPrazo: true, antecedenciaMin: PRAZO_DESMARCAR_MIN });
  const r = desmarcar(ana(), QUA, { aviso, em: 111 });
  assert.ok('patch' in r);
  assert.deepEqual(r.patch.atestados[QUA], {
    em: 111, tipo: 'desmarcacao', aula: { data: QUA, hora: '07:00' }, antecedenciaMin: 120,
    expira: somarDias(QUA, VALIDADE_CREDITO_DIAS), reposicao: null,
  });
  assert.deepEqual(r.patch.faltas, {});
  assert.equal(r.log.tipo, 'desmarcacao');
  assert.equal(r.log.resumo, 'Desmarcou no prazo (2h antes · aula de 07/10 07:00) · +1 crédito até 06/11');
  assert.equal(r.log.extra?.chave, `atestado:A1:${QUA}`);
  const a = aplicar(ana(), r);
  assert.equal(aulasDoDia([a], QUA, { hoje: QUA })[0].status, 'desmarcou-no-prazo');
  assert.deepEqual(creditosDisponiveis(a, QUA), [{ origem: QUA, tipo: 'desmarcacao', expira: '2026-11-06' }]);
});

test('desmarcar: o prazo conta da hora do AVISO, não da hora em que o coach lançou', () => {
  // Avisou às 04:50 (2h10 antes); o coach só lançou depois da aula.
  const r = desmarcar(ana(), QUA, { aviso: { hoje: QUA, agora: '04:50' }, em: 999 });
  assert.ok('patch' in r);
  assert.equal(r.patch.atestados[QUA].tipo, 'desmarcacao');
});

test('desmarcar aula remarcada: o prazo mede a aula nova, a remarcação sai e a turma lembra onde era', () => {
  const a0 = aplicar(ana(), trocarDia(ana(), SEG, TER, '18:00'));
  const r = desmarcar(a0, SEG, { aviso: { hoje: TER, agora: '15:00' }, em: 1 });
  assert.ok('patch' in r);
  assert.equal(r.patch.atestados[SEG].antecedenciaMin, 180);
  assert.deepEqual(r.patch.remarcacoes, {});
  const a = aplicar(a0, r);
  assert.deepEqual(aulasDoDia([a], TER, { hoje: QUA }).map((x) => [x.chave, x.hora, x.status]), [[SEG, '18:00', 'desmarcou-no-prazo']]);
});

test('desmarcar: aula sem horário é recusada (não há como medir o prazo); crédito em dobro também', () => {
  const sem = ficha('D4', 'Davi', { qua: '' });
  assert.deepEqual(desmarcar(sem, QUA, { aviso: { hoje: QUA, agora: '05:00' }, em: 1 }),
    { recusa: { chave: `D4|${QUA}`, texto: 'Aula sem horário na ficha: defina o horário para medir o prazo' } });
  const a = aplicar(ana(), desmarcar(ana(), QUA, { aviso: { hoje: TER, agora: '10:00' }, em: 1 }));
  assert.ok('recusa' in desmarcar(a, QUA, { aviso: { hoje: TER, agora: '10:00' }, em: 2 }));
  assert.ok('recusa' in marcarNoShow(a, QUA, { em: 2 }));
});

/* ---------- regra 3: menos de 2h, ou no-show, é falta sem crédito ---------- */

test('desmarcar com 1h59: fora do prazo, falta sem crédito, mas a vaga fica livre', () => {
  const r = desmarcar(ana(), QUA, { aviso: { hoje: QUA, agora: '05:01' }, em: 5 });
  assert.ok('patch' in r);
  assert.deepEqual(r.patch.atestados, {});
  assert.deepEqual(r.patch.faltas[QUA], { em: 5, tipo: 'fora-do-prazo', aula: { data: QUA, hora: '07:00' }, antecedenciaMin: 119 });
  assert.equal(r.log.tipo, 'falta');
  assert.equal(r.log.resumo, 'Desmarcou fora do prazo (1h59 antes · aula de 07/10 07:00) · sem crédito');
  const a = aplicar(ana(), r);
  const t = turmasDoDia([a], QUA, { hoje: QUA })[0];
  assert.deepEqual([t.aulas[0].status, t.ocupadas], ['desmarcou-fora', 0]);
  assert.deepEqual(creditosDisponiveis(a, QUA), []);
});

test('desmarcar depois do início também é fora do prazo', () => {
  const r = desmarcar(ana(), QUA, { aviso: { hoje: QUA, agora: '07:20' }, em: 1 });
  assert.ok('patch' in r);
  assert.equal(r.patch.faltas[QUA].tipo, 'fora-do-prazo');
  assert.match(r.log.resumo, /depois do início/);
});

test('no-show: falta lançada, sem crédito, e a presença do dia sai', () => {
  const a0 = ana({ presencas: [QUA], presencaHoras: { [QUA]: '07:02' } });
  const r = marcarNoShow(a0, QUA, { em: 7 });
  assert.ok('patch' in r);
  assert.deepEqual(r.patch.faltas[QUA], { em: 7, tipo: 'no-show', aula: { data: QUA, hora: '07:00' } });
  assert.deepEqual(r.patch.presencas, []);
  assert.equal(r.log.resumo, 'No-show · aula de 07/10 07:00');
  const a = aplicar(a0, r);
  const x = aulasDoDia([a], QUA, { hoje: QUA })[0];
  assert.equal(x.status, 'falta');
  assert.equal(x.automatica, undefined, 'lançada, não calculada');
});

test('falta lançada na semana: é falta na hora, e outra presença NÃO a cobre', () => {
  // Desmarcou a segunda fora do prazo e veio na terça: sem a falta lançada, a
  // cobertura automática usaria a terça para dar a segunda como "ok". Com ela,
  // a terça vai cobrir a próxima aula aberta (a quarta), como sempre.
  const a = aplicar(ana({ presencas: [TER] }), desmarcar(ana({ presencas: [TER] }), SEG, { aviso: { hoje: SEG, agora: '06:30' }, em: 1 }));
  const q = semanaDoAluno({ ...a, horas: a.presencaHoras, hoje: new Date(QUA + 'T00:00:00') });
  assert.deepEqual(q.map((x) => [x.tipo, x.iso, x.estado, x.veioEm]), [
    ['fixo', SEG, 'falta', undefined], ['fixo', QUA, 'ok', TER], ['fixo', SEX, 'aguardando', undefined],
  ]);
  const semFalta = semanaDoAluno({ ...ana({ presencas: [TER] }), hoje: new Date(QUA + 'T00:00:00') });
  assert.equal(semFalta[0].estado, 'ok', 'contraprova: sem a falta lançada, a terça cobria a segunda');
  // A mesma falta, numa aula que ainda não chegou: falta já, sem esperar o dia.
  const b = aplicar(ana(), marcarNoShow(ana(), SEX, { em: 1 }));
  assert.equal(semanaDoAluno({ ...b, hoje: new Date(QUA + 'T00:00:00') }).find((x) => x.iso === SEX)?.estado, 'falta');
});

test('check-in, troca e desfazer apagam a falta lançada (as duas telas não divergem)', () => {
  const a = aplicar(ana(), marcarNoShow(ana(), QUA, { em: 1 }));
  const c = checkin(a, QUA, { hoje: QUA, agora: '07:05' });
  assert.deepEqual(c.patch.faltas, {});
  assert.equal(aulasDoDia([aplicar(a, c)], QUA, { hoje: QUA })[0].status, 'presente');
  const t = trocarDia(a, QUA, QUI, '07:00');
  assert.ok('patch' in t);
  assert.deepEqual(t.patch.faltas, {});
  assert.deepEqual(desfazer(a, QUA).patch.faltas, {});
  assert.equal('faltas' in checkin(ana(), QUA, { hoje: QUA, agora: '07:05' }).patch, false, 'ficha sem faltas grava o mesmo de sempre');
});

/* ---------- exceção do coach ---------- */

test('conceder crédito (exceção) a quem desmarcou fora do prazo: vira crédito de 30 dias a partir de hoje', () => {
  const a0 = aplicar(ana(), desmarcar(ana(), QUA, { aviso: { hoje: QUA, agora: '06:00' }, em: 1 }));
  const r = concederCredito(a0, QUA, { hoje: QUA, em: 2 });
  assert.ok('patch' in r);
  assert.deepEqual(r.patch.atestados[QUA], { em: 2, tipo: 'excecao', antes: 'fora-do-prazo', aula: { data: QUA, hora: '07:00' }, expira: '2026-11-06', reposicao: null });
  assert.deepEqual(r.patch.faltas, {});
  assert.equal(r.log.tipo, 'credito');
  const a = aplicar(a0, r);
  const x = aulasDoDia([a], QUA, { hoje: QUA })[0];
  assert.deepEqual([x.status, x.credito?.tipo], ['desmarcou-fora', 'excecao'], 'o status conta o que houve; o crédito, a exceção');
  assert.equal(creditosDisponiveis(a, QUA).length, 1);
  assert.ok('recusa' in concederCredito(a, QUA, { hoje: QUA, em: 3 }), 'não concede duas vezes');
});

test('conceder crédito a falta calculada (sem nada lançado) registra como no-show', () => {
  const r = concederCredito(ana(), SEG, { hoje: QUA, em: 1 });
  assert.ok('patch' in r);
  assert.equal(r.patch.atestados[SEG].antes, 'no-show');
});

/* ---------- regra 4: reposição até 1h antes, com vaga e dentro da validade ---------- */

// Avisou às 04:00 da quarta (3h antes): crédito até 06/11.
const comCredito = () => aplicar(ana(), desmarcar(ana(), QUA, { aviso: { hoje: QUA, agora: '04:00' }, em: 1 }));

test('reposição: agendada na turma de outro aluno, ocupa vaga e aparece como reposição', () => {
  const a = aplicar(comCredito(), agendarReposicaoNaTurma(comCredito(), QUA, { data: QUA, hora: '18:00' }, { relogio: { hoje: QUA, agora: '16:59' }, vagas: 3 }));
  const t = turmasDoDia([a, caio()], QUA, { hoje: QUA }).find((x) => x.hora === '18:00');
  assert.deepEqual(t?.aulas.map((x) => [x.aluno.nome, x.tipo, x.status]), [['Ana', 'reposicao', 'confirmado'], ['Caio', 'titular', 'confirmado']]);
  assert.equal(t?.ocupadas, 2);
  assert.deepEqual(creditosDisponiveis(a, QUA), [], 'o crédito foi usado');
});

test('reposição: com menos de 1h de antecedência é recusada', () => {
  const r = agendarReposicaoNaTurma(comCredito(), QUA, { data: QUA, hora: '18:00' }, { relogio: { hoje: QUA, agora: '17:01' }, vagas: 3 });
  assert.deepEqual(r, { recusa: { chave: `A1|${QUA}`, texto: 'Reposição só pode ser marcada até 1h antes da aula' } });
});

test('reposição: turma lotada, crédito vencido, fora da validade e sem horário são recusados', () => {
  const rel = { hoje: QUA, agora: '08:00' };
  const texto = (/** @type {any} */ r) => r && 'recusa' in r ? r.recusa.texto : r;
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: QUA, hora: '18:00' }, { relogio: rel, vagas: 0 })), 'Turma lotada');
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: '2026-11-07', hora: '18:00' }, { relogio: rel, vagas: 1 })), 'O crédito vale até 06/11');
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: '2026-11-09', hora: '18:00' }, { relogio: { hoje: '2026-11-07', agora: '08:00' }, vagas: 1 })), 'Crédito vencido em 06/11');
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: QUA, hora: '' }, { relogio: rel, vagas: 1 })), 'Escolha uma turma com horário');
  assert.equal(texto(agendarReposicaoNaTurma(ana(), QUA, { data: QUA, hora: '18:00' }, { relogio: rel, vagas: 1 })), 'Crédito não encontrado');
});

test('reposição: no dia de outra aula dele continua recusada (regra do check-in)', () => {
  const r = agendarReposicaoNaTurma(comCredito(), QUA, { data: SEX, hora: '18:00' }, { relogio: { hoje: QUA, agora: '08:00' }, vagas: 3 });
  assert.ok(r && 'recusa' in r);
});

test('validade: crédito vencido some dos disponíveis e dos pendentes (o atestado médico não vence)', () => {
  const a = { ...comCredito(), atestados: { ...comCredito().atestados, [SEG]: { em: 1, reposicao: null } } };
  assert.deepEqual(creditosDisponiveis(a, '2026-11-06').map((c) => c.origem), [QUA, SEG], 'vence primeiro, aparece primeiro');
  assert.deepEqual(creditosDisponiveis(a, '2026-11-07').map((c) => c.origem), [SEG]);
  assert.deepEqual(reposicoesPendentes(a.atestados, '2026-11-07'), [SEG]);
  assert.deepEqual(reposicoesPendentes(a.atestados), [SEG, QUA], 'sem data: o comportamento de sempre');
});

/* ---------- a reposição desmarcada ---------- */

const comReposicao = () => aplicar(comCredito(), agendarReposicaoNaTurma(comCredito(), QUA, { data: TER2, hora: '18:00' }, { relogio: { hoje: QUA, agora: '08:00' }, vagas: 3 }));

test('desmarcar a reposição no prazo: o crédito volta para a fila', () => {
  const r = desmarcarReposicaoComAviso(comReposicao(), QUA, { aviso: { hoje: TER2, agora: '15:00' }, em: 1 });
  assert.ok(r && 'patch' in r);
  assert.equal(r.patch.atestados[QUA].reposicao, null);
  assert.match(r.log.resumo, /o crédito volta/);
  assert.equal(creditosDisponiveis(aplicar(comReposicao(), r), TER2).length, 1);
});

test('desmarcar a reposição fora do prazo: falta, e o crédito foi gasto', () => {
  const r = desmarcarReposicaoComAviso(comReposicao(), QUA, { aviso: { hoje: TER2, agora: '17:00' }, em: 9 });
  assert.ok(r && 'patch' in r);
  const a = aplicar(comReposicao(), r);
  assert.deepEqual(aulasDoDia([a], TER2, { hoje: TER2 }).filter((x) => x.tipo === 'reposicao').map((x) => x.status), ['desmarcou-fora']);
  assert.deepEqual(creditosDisponiveis(a, TER2), []);
  assert.ok(r.patch.atestados[QUA].reposicao.foraDoPrazo);
});

test('no-show na reposição, exceção devolvendo o crédito, e reabrir', () => {
  const r = noShowReposicao(comReposicao(), QUA, { em: 3 });
  assert.ok(r);
  const a = aplicar(comReposicao(), r);
  assert.equal(aulasDoDia([a], TER2, { hoje: TER2 }).find((x) => x.tipo === 'reposicao')?.status, 'falta');
  const reaberta = aplicar(a, reabrirReposicao(a, QUA));
  assert.equal(aulasDoDia([reaberta], TER2, { hoje: TER2 }).find((x) => x.tipo === 'reposicao')?.status, 'confirmado');
  const devolvido = aplicar(a, concederCreditoReposicao(a, QUA, { hoje: TER2, em: 4 }));
  assert.deepEqual(creditosDisponiveis(devolvido, TER2), [{ origem: QUA, tipo: 'desmarcacao', expira: '2026-11-12' }], '30 dias a partir de hoje');
  assert.equal(noShowReposicao(ana(), QUA, { em: 1 }), null);
});

/* ---------- aula experimental ---------- */

test('experimental: precisa de nome, horário e vaga; muda de status e sai da lista', () => {
  const o = { id: 'x1', em: 1, vagas: 1 };
  assert.deepEqual(adicionarExperimental([], { nome: ' ', hora: '07:00' }, o), { recusa: 'Escreva o nome de quem vem experimentar' });
  assert.deepEqual(adicionarExperimental([], { nome: 'Duda', hora: '07:00' }, { ...o, vagas: 0 }), { recusa: 'Turma lotada' });
  assert.deepEqual(adicionarExperimental([], { nome: 'Duda', hora: '' }, o), { recusa: 'Escolha uma turma com horário' });
  const r = adicionarExperimental([], { nome: ' Duda ', telefone: '11 9999', hora: '07:00' }, o);
  assert.ok('lista' in r);
  assert.deepEqual(r.lista, [{ id: 'x1', nome: 'Duda', telefone: '11 9999', hora: '07:00', status: 'confirmado', em: 1 }]);
  assert.equal(statusExperimental(r.lista, 'x1', 'presente')[0].status, 'presente');
  assert.deepEqual(removerExperimental(r.lista, 'x1'), []);
});

test('experimental: dias com mais de 90 dias (e dias vazios) saem do documento do box', () => {
  const x = [{ id: 'x', nome: 'X', hora: '07:00', status: /** @type {const} */ ('confirmado'), em: 1 }];
  assert.deepEqual(Object.keys(podarExperimentais({ '2026-07-01': x, '2026-07-09': x, [QUA]: x, [QUI]: [] }, QUA)), ['2026-07-09', QUA]);
});

/* ---------- o resumo ---------- */

test('resumo da turma: confirmados, presentes, desmarcações e faltas (alunos + experimentais)', () => {
  const a = aplicar(ana(), desmarcar(ana(), QUA, { aviso: { hoje: TER, agora: '20:00' }, em: 1 }));
  const b = bia({ presencas: [QUA] });
  const exps = [
    { id: 'x1', nome: 'Duda', hora: '07:00', status: /** @type {const} */ ('confirmado'), em: 1 },
    { id: 'x2', nome: 'Edu', hora: '07:00', status: /** @type {const} */ ('falta'), em: 1 },
  ];
  const t = turmasDoDia([a, b], QUA, { hoje: QUA, experimentais: exps })[0];
  assert.deepEqual(resumoDaTurma(t), { confirmados: 1, presentes: 1, desmarcaram: 1, faltas: 1 });
  assert.equal(STATUS['desmarcou-no-prazo'], 'Desmarcou no prazo');
});
