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
} from './presenca-regras.js?v=36';
import { checkin, trocarDia, desfazer } from './checkin-regras.js?v=36';
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

test('turma: o status de cada um — presente, sem chamada, box fechado', () => {
  const a = ana({ presencas: [SEG], presencaHoras: { [SEG]: '06:58' } });
  assert.deepEqual(aulasDoDia([a], SEG, { hoje: QUA }).map((x) => [x.status, x.horaCheckin]), [['presente', '06:58']]);
  const faltou = aulasDoDia([ana()], SEG, { hoje: QUA })[0];
  assert.equal(faltou.status, 'sem-chamada', 'o dia passou e nada foi gravado: não se deduz falta');
  assert.equal(faltou.automatica, undefined);
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

test('desmarcar com exatamente 2h: no prazo, +1 crédito até o fim do mês, vaga livre', () => {
  const aviso = { hoje: QUA, agora: '05:00' };
  assert.deepEqual(previaDesmarcacao(ana(), QUA, aviso), { noPrazo: true, antecedenciaMin: PRAZO_DESMARCAR_MIN });
  const r = desmarcar(ana(), QUA, { aviso, em: 111 });
  assert.ok('patch' in r);
  assert.deepEqual(r.patch.atestados[QUA], {
    em: 111, tipo: 'desmarcacao', aula: { data: QUA, hora: '07:00' }, antecedenciaMin: 120,
    expira: '2026-10-31', reposicao: null, // fim do mês do aviso (07/10)
  });
  assert.deepEqual(r.patch.faltas, {});
  assert.equal(r.log.tipo, 'desmarcacao');
  assert.equal(r.log.resumo, 'Desmarcou no prazo (2h antes · aula de 07/10 07:00) · +1 crédito até 31/10');
  assert.equal(r.log.extra?.chave, `atestado:A1:${QUA}`);
  const a = aplicar(ana(), r);
  assert.equal(aulasDoDia([a], QUA, { hoje: QUA })[0].status, 'desmarcou-no-prazo');
  assert.deepEqual(creditosDisponiveis(a, QUA), [{ origem: QUA, tipo: 'desmarcacao', expira: '2026-10-31' }]);
});

test('desmarcar no fim do mês: o crédito vale no mínimo 7 dias', () => {
  const QUA_FIM = '2026-10-28';
  const r = desmarcar(ana(), QUA_FIM, { aviso: { hoje: QUA_FIM, agora: '05:00' }, em: 112 });
  assert.ok('patch' in r);
  assert.equal(r.patch.atestados[QUA_FIM].expira, '2026-11-04', 'aviso em 28/10: vale 7 dias, e não só até 31/10');
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

test('conceder crédito (exceção) a quem desmarcou fora do prazo: vira crédito até o fim do mês seguinte', () => {
  const a0 = aplicar(ana(), desmarcar(ana(), QUA, { aviso: { hoje: QUA, agora: '06:00' }, em: 1 }));
  const r = concederCredito(a0, QUA, { hoje: QUA, em: 2 });
  assert.ok('patch' in r);
  assert.deepEqual(r.patch.atestados[QUA], { em: 2, tipo: 'excecao', antes: 'fora-do-prazo', aula: { data: QUA, hora: '07:00' }, expira: '2026-11-30', reposicao: null });
  assert.deepEqual(r.patch.faltas, {});
  assert.equal(r.log.tipo, 'credito');
  const a = aplicar(a0, r);
  const x = aulasDoDia([a], QUA, { hoje: QUA })[0];
  assert.deepEqual([x.status, x.credito?.tipo], ['desmarcou-fora', 'excecao'], 'o status conta o que houve; o crédito, a exceção');
  assert.equal(creditosDisponiveis(a, QUA).length, 1);
  assert.ok('recusa' in concederCredito(a, QUA, { hoje: QUA, em: 3 }), 'não concede duas vezes');
});

test('conceder crédito a uma aula "sem chamada" registra antes: sem-chamada e NÃO vira falta', () => {
  const r = concederCredito(ana(), SEG, { hoje: QUA, em: 1 });
  assert.ok('patch' in r);
  assert.equal(r.patch.atestados[SEG].antes, 'sem-chamada');
  const x = aulasDoDia([aplicar(ana(), r)], SEG, { hoje: QUA })[0];
  assert.deepEqual([x.status, x.credito?.tipo], ['sem-chamada', 'excecao']);
  const [t] = turmasDoDia([aplicar(ana(), r)], SEG, { hoje: QUA });
  assert.equal(resumoDaTurma(t).faltas, 0);
  // o no-show gravado pelo coach segue sendo falta
  const comFalta = aplicar(ana(), marcarNoShow(ana(), SEG, { em: 1 }));
  assert.equal(concederCredito(comFalta, SEG, { hoje: QUA, em: 2 }).patch.atestados[SEG].antes, 'no-show');
  assert.equal(aulasDoDia([aplicar(comFalta, concederCredito(comFalta, SEG, { hoje: QUA, em: 2 }))], SEG, { hoje: QUA })[0].status, 'falta');
});

test('crédito de box fechado (tipo fechado) é "Box fechado" com o crédito, não "Atestado"', () => {
  const a = ana({ atestados: { [SEG]: { em: 1, tipo: 'fechado', aula: { data: SEG, hora: '07:00' }, expira: '2026-10-31', reposicao: null } } });
  const x = aulasDoDia([a], SEG, { hoje: QUA, fechados: [SEG] })[0];
  assert.deepEqual([x.status, x.credito?.expira], ['fechado', '2026-10-31']);
  assert.equal(aulasDoDia([a], SEG, { hoje: QUA })[0].status, 'fechado', 'mesmo sem o dia na lista de fechados');
  assert.equal(creditosDisponiveis(a, QUA).length, 1, 'o crédito segue disponível');
  // semana: o quadrado é o dia fechado, o crédito fica na ficha
  const sem = semanaDoAluno({ diasTreino: ['seg'], horarios: { seg: '07:00' }, atestados: a.atestados, hoje: new Date('2026-10-07T12:00:00') });
  assert.equal(sem[0].estado, 'fechado');
});

/* ---------- regra 4: reposição até 1h antes, com vaga e dentro da validade ---------- */

// Avisou às 04:00 da quarta (3h antes): crédito até o fim do mês do aviso (31/10).
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
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: '2026-11-07', hora: '18:00' }, { relogio: rel, vagas: 1 })), 'O crédito vale até 31/10');
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: '2026-11-09', hora: '18:00' }, { relogio: { hoje: '2026-11-07', agora: '08:00' }, vagas: 1 })), 'Crédito vencido em 31/10');
  assert.equal(texto(agendarReposicaoNaTurma(comCredito(), QUA, { data: QUA, hora: '' }, { relogio: rel, vagas: 1 })), 'Escolha uma turma com horário');
  assert.equal(texto(agendarReposicaoNaTurma(ana(), QUA, { data: QUA, hora: '18:00' }, { relogio: rel, vagas: 1 })), 'Crédito não encontrado');
});

test('reposição: no dia de outra aula dele continua recusada (regra do check-in)', () => {
  const r = agendarReposicaoNaTurma(comCredito(), QUA, { data: SEX, hora: '18:00' }, { relogio: { hoje: QUA, agora: '08:00' }, vagas: 3 });
  assert.ok(r && 'recusa' in r);
});

test('validade: crédito vencido some dos disponíveis e dos pendentes (o atestado médico não vence)', () => {
  const a = { ...comCredito(), atestados: { ...comCredito().atestados, [SEG]: { em: 1, reposicao: null } } };
  // O crédito de QUA vence 31/10 (fim do mês); o de SEG é atestado médico, sem expira — não vence.
  assert.deepEqual(creditosDisponiveis(a, '2026-10-20').map((c) => c.origem), [QUA, SEG], 'vence primeiro, aparece primeiro');
  assert.deepEqual(creditosDisponiveis(a, '2026-11-01').map((c) => c.origem), [SEG]);
  assert.deepEqual(reposicoesPendentes(a.atestados, '2026-11-01'), [SEG]);
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
  assert.deepEqual(creditosDisponiveis(devolvido, TER2), [{ origem: QUA, tipo: 'desmarcacao', expira: '2026-11-30' }], 'crédito devolvido por exceção: fim do mês seguinte');
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
  assert.deepEqual(resumoDaTurma(t), { confirmados: 1, presentes: 1, desmarcaram: 1, faltas: 1, semChamada: 0 });
  assert.equal(STATUS['desmarcou-no-prazo'], 'Desmarcou no prazo');
});

/* ---------- Sem chamada: a falta só existe gravada ("Nada de deduzir falta") ---------- */

test('sem chamada: aula passada sem presença e sem registro não é falta nem entra na contagem de faltas', () => {
  const [aula] = aulasDoDia([ana()], SEG, { hoje: QUA });
  assert.equal(aula.status, 'sem-chamada');
  assert.equal(STATUS['sem-chamada'], 'Sem chamada');
  const [t] = turmasDoDia([ana()], SEG, { hoje: QUA });
  assert.deepEqual(
    { faltas: resumoDaTurma(t).faltas, semChamada: resumoDaTurma(t).semChamada, ocupadas: t.ocupadas },
    { faltas: 0, semChamada: 1, ocupadas: 1 }, 'não conta como falta, mas segue ocupando a vaga como antes');
  assert.equal(aula.credito, undefined, 'continua usada, sem crédito de volta');
});

test('sem chamada: a falta GRAVADA (no-show ou fora do prazo) continua falta', () => {
  const a = aplicar(ana(), marcarNoShow(ana(), SEG, { em: 1 }));
  const [aula] = aulasDoDia([a], SEG, { hoje: QUA });
  assert.equal(aula.status, 'falta');
  assert.equal(resumoDaTurma(turmasDoDia([a], SEG, { hoje: QUA })[0]).faltas, 1);
  assert.equal(resumoDaTurma(turmasDoDia([a], SEG, { hoje: QUA })[0]).semChamada, 0);
  const fora = { ...ana(), faltas: { [SEG]: { em: 1, tipo: 'fora-do-prazo' } } };
  assert.equal(aulasDoDia([fora], SEG, { hoje: QUA })[0].status, 'desmarcou-fora');
});

test('sem chamada: a presença ganha, e hoje e o futuro seguem como eram', () => {
  assert.equal(aulasDoDia([ana({ presencas: [SEG] })], SEG, { hoje: QUA })[0].status, 'presente');
  assert.equal(aulasDoDia([ana()], QUA, { hoje: QUA })[0].status, 'confirmado', 'hoje: ainda confirmado');
  assert.equal(aulasDoDia([ana()], SEX, { hoje: QUA })[0].status, 'confirmado', 'futuro');
  assert.equal(aulasDoDia([ana()], SEG, { hoje: QUA, fechados: [SEG] })[0].status, 'fechado');
});

test('sem chamada: reposição passada sem nada gravado é sem chamada; no-show gravado é falta', () => {
  const a = ana({ atestados: { [SEG]: { em: 1, tipo: 'desmarcacao', expira: '2026-10-31', reposicao: { data: TER, hora: '19:10' } } } });
  const rep = (/** @type {any} */ f) => aulasDoDia([f], TER, { hoje: QUA }).find((x) => x.tipo === 'reposicao');
  assert.equal(rep(a)?.status, 'sem-chamada');
  const noShow = { ...a, atestados: { [SEG]: { ...a.atestados[SEG], reposicao: { data: TER, hora: '19:10', noShow: true } } } };
  assert.equal(rep(noShow)?.status, 'falta');
});

test('sem chamada: a chamada ainda grava a falta numa aula sem chamada (não perde o caminho)', async () => {
  const { faltaDaChamada } = await import('./chamada-faltas.js?v=36');
  const r = faltaDaChamada(ana(), { dia: SEG, hora: '07:00', em: 9, hoje: QUA });
  assert.equal(r.acao, 'falta', JSON.stringify(r));
  const depois = { ...ana(), ...(r.acao === 'falta' ? r.patch : {}) };
  assert.equal(aulasDoDia([depois], SEG, { hoje: QUA })[0].status, 'falta', 'gravada: agora sim é falta');
});

test('semana do aluno: aula passada sem registro leva semChamada (estado segue falta); a gravada, não', () => {
  const hoje = new Date(2026, 9, 7, 12, 0); // quarta 07/10
  const base = { diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' }, hoje };
  const q = semanaDoAluno(base);
  assert.deepEqual([q[0].estado, q[0].semChamada], ['falta', true]);
  assert.equal(q[1].semChamada, undefined, 'hoje: aguardando');
  assert.equal(q[2].semChamada, undefined, 'futuro');
  const g = semanaDoAluno({ ...base, faltas: { [SEG]: { tipo: 'no-show' } } });
  assert.deepEqual([g[0].estado, g[0].semChamada], ['falta', undefined]);
  const ok = semanaDoAluno({ ...base, presencas: [SEG] });
  assert.deepEqual([ok[0].estado, ok[0].semChamada], ['ok', undefined]);
});
