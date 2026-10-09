// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/checkin-regras.test.js
 *
 * As regras do Check-in, sem tela e sem banco. A semana dos testes é a de
 * 05/10/2026 (segunda) a 11/10/2026 (domingo); "hoje" é a quarta, 07/10. O
 * aluno treina seg, qua e sex às 07:00.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkin, trocarDia, atestado, desfazer, agendarReposicao, desmarcarReposicao, alternarPresenca,
  diaEfetivo, diasReivindicados, outraAulaUsa, donoDoDia, quemSumiu, ultimaPresenca, diasDesde, DIA_EXT,
} from './checkin-regras.js?v=14';
import { datasDaSemana } from '../../compartilhado/regras/semana.js';

const SEG = '2026-10-05', TER = '2026-10-06', QUA = '2026-10-07', QUI = '2026-10-08', SEX = '2026-10-09';
const TER2 = '2026-10-13', QUA2 = '2026-10-14';
const relogio = { hoje: QUA, agora: '07:12' };

/** Uma ficha nova a cada teste, com o que for pedido por cima. @param {any} [extra] */
const aluno = (extra = {}) => ({
  id: 'A1', nome: 'Ana', diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' },
  presencas: [], presencaHoras: {}, remarcacoes: {}, atestados: {}, ...extra,
});

/* ---------- onde cada aula acontece ---------- */

test('base: dia efetivo, dias ocupados e quem já usa um dia', () => {
  assert.equal(diaEfetivo(aluno(), SEG), SEG);
  assert.equal(diaEfetivo(aluno({ remarcacoes: { [SEG]: { data: TER, hora: '' } } }), SEG), TER);
  assert.equal(diaEfetivo(aluno({ remarcacoes: { [SEG]: TER } }), SEG), TER, 'formato antigo: só a data');
  const sem = datasDaSemana(new Date(QUA + 'T00:00:00'));
  assert.deepEqual([...diasReivindicados(aluno(), sem)], [[SEG, SEG], [QUA, QUA], [SEX, SEX]]);
  assert.deepEqual([...diasReivindicados(aluno({ atestados: { [SEG]: { em: 1, reposicao: { data: TER2, hora: '' } } } }), sem)],
    [[QUA, QUA], [SEX, SEX], [TER2, SEG]], 'atestado não ocupa o dia; a reposição ocupa o dela');
  assert.equal(donoDoDia(aluno(), SEG, QUA), QUA);
  assert.equal(donoDoDia(aluno(), SEG, TER), null);
  assert.equal(donoDoDia(aluno(), QUA, QUA), null, 'o próprio dia não é "ocupado"');
  assert.equal(DIA_EXT.qua, 'Quarta');
});

/* ---------- CHECK-IN ---------- */

test('check-in: aula de hoje grava a presença e a hora; o log diz "Check-in"', () => {
  const r = checkin(aluno(), QUA, relogio);
  assert.deepEqual(r.patch, { presencas: [QUA], presencaHoras: { [QUA]: '07:12' }, atestados: {} });
  assert.deepEqual(r.log, { tipo: 'presenca', resumo: 'Check-in', extra: { dia: QUA, chave: `presenca:A1:${QUA}` } });
});

test('check-in: aula passada não leva a hora de agora; hora já gravada não muda', () => {
  const r = checkin(aluno({ presencas: [QUI] }), SEG, relogio);
  assert.deepEqual(r.patch.presencas, [SEG, QUI], 'ordenadas');
  assert.deepEqual(r.patch.presencaHoras, {});
  assert.equal(r.log.resumo, 'Check-in · aula de 05/10');
  assert.equal(checkin(aluno({ presencaHoras: { [QUA]: '06:58' } }), QUA, relogio).patch.presencaHoras[QUA], '06:58');
});

test('check-in: aula trocada de dia grava a presença no dia novo', () => {
  const r = checkin(aluno({ remarcacoes: { [SEG]: { data: TER, hora: '18:00' } } }), SEG, relogio);
  assert.deepEqual(r.patch.presencas, [TER]);
  assert.equal(r.log.resumo, 'Check-in · aula de 06/10');
});

test('check-in: numa aula com atestado, o atestado sai; na reposição, fica', () => {
  const at = { [SEG]: { em: 1, reposicao: { data: TER2, hora: '' } } };
  assert.deepEqual(checkin(aluno({ atestados: at }), SEG, relogio).patch.atestados, {});
  const rep = checkin(aluno({ atestados: at }), TER2, { ...relogio, ehReposicao: true });
  assert.deepEqual(rep.patch.atestados, at);
  assert.deepEqual(rep.patch.presencas, [TER2]);
  assert.equal(rep.log.resumo, 'Check-in da reposição · 13/10');
});

/* ---------- ALTERAR DIA ---------- */

test('alterar dia: para um dia livre grava a troca com a hora; o atestado sai', () => {
  const r = trocarDia(aluno({ atestados: { [SEG]: { em: 1, reposicao: null } } }), SEG, TER, '18:00');
  assert.ok('patch' in r);
  assert.deepEqual(r.patch, { remarcacoes: { [SEG]: { data: TER, hora: '18:00' } }, atestados: {} });
  assert.deepEqual(r.log, { tipo: 'troca-aula', resumo: 'Aula de 05/10 → 06/10 18:00', extra: { dia: SEG } });
});

test('alterar dia: para um dia que outra aula usa é recusado, com o recado no quadrado', () => {
  assert.deepEqual(trocarDia(aluno(), SEG, QUA, ''), { recusa: { chave: `A1|${SEG}`, texto: 'Quarta já usa esse dia' } });
});

test('alterar dia: voltar ao dia e à hora originais desfaz a troca; só a hora é uma troca', () => {
  const trocado = aluno({ remarcacoes: { [SEG]: { data: TER, hora: '18:00' } } });
  const volta = trocarDia(trocado, SEG, SEG, '07:00');
  assert.ok('patch' in volta);
  assert.deepEqual(volta.patch.remarcacoes, {});
  assert.equal(volta.log.resumo, 'Aula de 05/10 voltou ao horário original');
  assert.ok('patch' in trocarDia(trocado, SEG, SEG, ''));
  const soHora = trocarDia(aluno(), SEG, SEG, '19:00');
  assert.ok('patch' in soHora);
  assert.deepEqual(soHora.patch.remarcacoes, { [SEG]: { data: SEG, hora: '19:00' } });
  assert.equal(soHora.log.resumo, 'Aula de 05/10 → 05/10 19:00');
});

/* ---------- ATESTADO ---------- */

test('atestado: abre o crédito, tira a troca e a presença daquela aula', () => {
  const a = aluno({ presencas: [TER, QUA], presencaHoras: { [TER]: '18:05' }, remarcacoes: { [SEG]: { data: TER, hora: '18:00' } } });
  const r = atestado(a, SEG, { em: 1234 });
  assert.deepEqual(r.patch, {
    atestados: { [SEG]: { em: 1234, reposicao: null } }, remarcacoes: {}, presencas: [QUA], presencaHoras: {},
  });
  assert.deepEqual(r.log, { tipo: 'atestado', resumo: 'Atestado · aula de 05/10', extra: { dia: SEG, chave: `atestado:A1:${SEG}` } });
});

test('atestado: a presença fica se outra aula também acontece naquele dia', () => {
  // Ficha antiga: a segunda foi trocada para a quarta, que já tinha aula.
  const a = aluno({ presencas: [QUA], remarcacoes: { [SEG]: QUA } });
  assert.equal(outraAulaUsa(a, SEG, QUA), true);
  assert.deepEqual(atestado(a, SEG, { em: 1 }).patch.presencas, [QUA]);
});

/* ---------- DESFAZER ---------- */

test('desfazer: a aula volta a ficar aberta — sem troca, sem atestado, sem presença', () => {
  const a = aluno({ presencas: [TER], presencaHoras: { [TER]: '18:02' }, remarcacoes: { [SEG]: { data: TER, hora: '18:00' } } });
  const r = desfazer(a, SEG);
  assert.deepEqual(r.patch, { remarcacoes: {}, atestados: {}, presencas: [], presencaHoras: {} });
  assert.deepEqual(r.log, { tipo: 'presenca-removida', resumo: 'Aula de 06/10 desfeita', extra: { dia: TER } });
  assert.deepEqual(desfazer(aluno({ atestados: { [SEG]: { em: 1, reposicao: null } } }), SEG).patch.atestados, {});
});

test('desfazer reposição: apaga a presença dela — identificada pela aula de origem, não pela data', () => {
  const a = aluno({ presencas: [TER2], atestados: { [SEG]: { em: 1, reposicao: { data: TER2, hora: '' } } } });
  const r = desfazer(a, TER2, { ehReposicao: true, origem: SEG });
  assert.deepEqual(r.patch.presencas, [], 'pela data, ela se veria "usando o dia" e seguraria a presença');
  assert.deepEqual(r.patch.atestados, a.atestados, 'o atestado e a reposição agendada ficam');
  assert.equal(r.log.resumo, 'Aula de 13/10 desfeita');
});

/* ---------- REPOSIÇÃO ---------- */

test('reposição: agenda num dia livre de outra semana', () => {
  const a = aluno({ atestados: { [SEG]: { em: 9, reposicao: null } } });
  const r = agendarReposicao(a, SEG, TER2, '18:00');
  assert.ok(r && 'patch' in r);
  assert.deepEqual(r.patch, { atestados: { [SEG]: { em: 9, reposicao: { data: TER2, hora: '18:00' } } } });
  assert.deepEqual(r.log, { tipo: 'reposicao', resumo: 'Reposição da aula de 05/10 marcada para 13/10 18:00', extra: { dia: TER2 } });
});

test('reposição: a agenda conferida é a da semana do dia escolhido', () => {
  const a = aluno({ atestados: { [SEG]: { em: 9, reposicao: null } } });
  assert.deepEqual(agendarReposicao(a, SEG, QUA2, ''), { recusa: { chave: `A1|${SEG}`, texto: 'Quarta já usa esse dia' } },
    'quarta da semana seguinte já tem aula fixa');
});

test('reposição: sem data ou sem atestado, nada a fazer', () => {
  assert.equal(agendarReposicao(aluno({ atestados: { [SEG]: { em: 9, reposicao: null } } }), SEG, '', ''), null);
  assert.equal(agendarReposicao(aluno(), SEG, TER2, ''), null);
  assert.equal(desmarcarReposicao(aluno(), SEG), null);
});

test('desmarcar reposição: o crédito volta para a fila e a presença do dia sai', () => {
  const a = aluno({ presencas: [TER2], presencaHoras: { [TER2]: '18:01' }, atestados: { [SEG]: { em: 9, reposicao: { data: TER2, hora: '18:00' } } } });
  const r = desmarcarReposicao(a, SEG);
  assert.ok(r);
  assert.deepEqual(r.patch, { atestados: { [SEG]: { em: 9, reposicao: null } }, presencas: [], presencaHoras: {} });
  assert.deepEqual(r.log, { tipo: 'reposicao', resumo: 'Reposição da aula de 05/10 desmarcada' });
  // Sem data agendada: nenhuma presença é tocada.
  const semData = desmarcarReposicao(aluno({ presencas: [SEG], atestados: { [SEG]: { em: 9, reposicao: null } } }), SEG);
  assert.deepEqual(semData?.patch.presencas, [SEG]);
});

/* ---------- presença simples (aluno sem grade) ---------- */

test('presença simples: marca com a hora de hoje, desmarca tirando a hora', () => {
  const marca = alternarPresenca(aluno({ diasTreino: [] }), QUA, relogio);
  assert.deepEqual(marca.patch, { presencas: [QUA], presencaHoras: { [QUA]: '07:12' } });
  assert.deepEqual(marca.log, { tipo: 'presenca', resumo: 'Check-in', extra: { dia: QUA, chave: `presenca:A1:${QUA}` } });
  const passado = alternarPresenca(aluno({ diasTreino: [] }), SEG, relogio);
  assert.deepEqual(passado.patch.presencaHoras, {});
  assert.equal(passado.log.resumo, 'Check-in · aula de 05/10');
  const desmarca = alternarPresenca(aluno({ presencas: [SEG, QUA], presencaHoras: { [QUA]: '07:12' } }), QUA, relogio);
  assert.deepEqual(desmarca.patch, { presencas: [SEG], presencaHoras: {} });
  assert.deepEqual(desmarca.log, { tipo: 'presenca-removida', resumo: 'Check-in de 07/10 desfeito', extra: { dia: QUA } });
});

/* ---------- quem sumiu ---------- */

test('sumidos: 7+ dias sem vir, quem nunca veio primeiro', () => {
  const alunos = [
    { nome: 'Veio ontem', presencas: [TER] },
    { nome: 'Nunca veio', presencas: [] },
    { nome: 'Faz 7 dias', presencas: ['2026-09-30'] },
    { nome: 'Faz 20 dias', presencas: ['2026-09-10', '2026-09-17'] },
  ];
  assert.equal(ultimaPresenca(alunos[3]), '2026-09-17');
  assert.equal(diasDesde('2026-09-30', QUA), 7);
  assert.deepEqual(quemSumiu(alunos, QUA), [{ nome: 'Nunca veio', dias: null }, { nome: 'Faz 20 dias', dias: 20 }, { nome: 'Faz 7 dias', dias: 7 }]);
});

/* ---------- pureza ---------- */

test('puro: nenhuma regra altera a ficha que recebe', () => {
  /** @param {any} o */
  const congelar = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
  const a = congelar(aluno({
    presencas: [SEG, TER2], presencaHoras: { [SEG]: '07:01' }, remarcacoes: { [QUA]: { data: QUI, hora: '' } },
    atestados: { [SEX]: { em: 1, reposicao: { data: TER2, hora: '' } } },
  }));
  const copia = JSON.stringify(a);
  // Em módulo ES (modo estrito), escrever num objeto congelado lança erro.
  checkin(a, SEG, relogio); checkin(a, TER2, { ...relogio, ehReposicao: true });
  trocarDia(a, SEG, TER, '18:00'); trocarDia(a, SEG, QUI, '');
  atestado(a, SEG, { em: 1 }); desfazer(a, QUA); desfazer(a, TER2, { ehReposicao: true, origem: SEX });
  agendarReposicao(a, SEX, '2026-10-15', ''); desmarcarReposicao(a, SEX); alternarPresenca(a, SEG, relogio);
  assert.equal(JSON.stringify(a), copia);
});
