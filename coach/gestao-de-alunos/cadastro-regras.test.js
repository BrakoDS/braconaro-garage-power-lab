// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diasEntre, mesSeguinte, congelarCreditos, pausar, voltar, gradeDiferente, ligarDupla, desligarDupla,
  alternarInstagram, indicacoesDe, darIndicacao, tirarIndicacao, ajustarSemanas,
  inicioDaFicha, planoDaFicha, migracaoDaFicha, fundadorPeloInicio,
} from './cadastro-regras.js?v=40';
import { mensalidadeDoMes } from '../../compartilhado/regras/planos.js';

const ana = { id: 'Ana01', nome: 'Ana Souza', status: 'ativo', plano: { vezes: 3, prazo: 'mensal' }, fundador: true, mensalidade: '130' };
const recusou = (r) => 'recusa' in r;

test('datas', () => {
  assert.equal(diasEntre('2026-12-20', '2027-01-11'), 22);
  assert.equal(mesSeguinte('2026-12'), '2027-01');
});

/* ---------- pausa ---------- */

test('pausar grava o status e a pausa, com o motivo', () => {
  const r = pausar(ana, { desde: '2026-12-20', motivo: 'Viagem' });
  assert.ok(!recusou(r));
  assert.deepEqual(r.patch, { status: 'pausado', pausas: [{ desde: '2026-12-20', motivo: 'Viagem' }] });
  assert.equal(r.log.tipo, 'pausa');
  assert.equal(r.log.resumo, 'Plano pausado desde 20/12');
  assert.deepEqual(r.log.extra, { dia: '2026-12-20', motivo: 'Viagem' });
});

test('pausar recusa: sem data, inativa, já pausado, antes da última volta', () => {
  assert.ok(recusou(pausar(ana, { desde: '' })));
  assert.ok(recusou(pausar({ ...ana, status: 'inativo' }, { desde: '2026-12-20' })));
  assert.ok(recusou(pausar({ ...ana, status: 'pausado', pausas: [{ desde: '2026-12-01' }] }, { desde: '2026-12-20' })));
  const r = pausar({ ...ana, pausas: [{ desde: '2026-10-01', ate: '2026-11-10' }] }, { desde: '2026-11-05' });
  assert.ok(recusou(r));
  assert.match(r.recusa, /10\/11/);
});

test('voltar fecha a pausa, volta a ativo e estende os créditos em aberto', () => {
  const pausado = {
    ...ana, status: 'pausado', pausas: [{ desde: '2026-10-01', ate: '2026-10-05' }, { desde: '2026-12-20', motivo: 'Viagem' }],
    atestados: {
      '2026-12-15': { em: 1, tipo: 'desmarcacao', expira: '2026-12-31', reposicao: null },     // aberto: ganha 22 dias
      '2026-12-10': { em: 1, tipo: 'desmarcacao', expira: '2026-12-31', reposicao: { data: '2026-12-12', hora: '18:10' } }, // já usado
      '2026-11-02': { em: 1, tipo: 'desmarcacao', expira: '2026-11-30', reposicao: null },     // venceu antes da pausa
      '2026-09-01': { em: 1, reposicao: null },                                                // atestado antigo: não vence
    },
  };
  const r = voltar(pausado, { ate: '2027-01-11' });
  assert.ok(!recusou(r));
  assert.equal(r.patch.status, 'ativo');
  assert.deepEqual(r.patch.pausas[1], { desde: '2026-12-20', motivo: 'Viagem', ate: '2027-01-11' });
  assert.deepEqual(r.patch.pausas[0], { desde: '2026-10-01', ate: '2026-10-05' });
  assert.equal(r.patch.atestados['2026-12-15'].expira, '2027-01-22');
  assert.equal(r.patch.atestados['2026-12-10'].expira, '2026-12-31');
  assert.equal(r.patch.atestados['2026-11-02'].expira, '2026-11-30');
  assert.equal(r.patch.atestados['2026-09-01'].expira, undefined);
  assert.equal(r.log.tipo, 'volta');
  assert.equal(r.log.resumo, 'Voltou da pausa em 11/01 (22 dias pausado) · 1 crédito ganhou 22 dias de validade');
});

test('voltar sem crédito não mexe em atestados', () => {
  const r = voltar({ ...ana, status: 'pausado', pausas: [{ desde: '2026-12-20' }] }, { ate: '2027-01-04' });
  assert.ok(!recusou(r));
  assert.equal('atestados' in r.patch, false);
});

test('voltar recusa: não pausado, sem data, volta antes do começo', () => {
  assert.ok(recusou(voltar(ana, { ate: '2027-01-04' })));
  const p = { ...ana, status: 'pausado', pausas: [{ desde: '2026-12-20' }] };
  assert.ok(recusou(voltar(p, { ate: '' })));
  assert.ok(recusou(voltar(p, { ate: '2026-12-20' })));
});

test('pausar e voltar no valor: mês da pausa inteiro, mês todo pausado zero, volta por semana', () => {
  const r1 = /** @type {any} */ (pausar(ana, { desde: '2027-01-20' }));
  const pausado = { ...ana, ...r1.patch };
  assert.equal(mensalidadeDoMes(pausado, '2027-01').valor, 190);
  assert.equal(mensalidadeDoMes(pausado, '2027-02').valor, 0);
  const r2 = /** @type {any} */ (voltar(pausado, { ate: '2027-03-15' }));
  const voltou = { ...pausado, ...r2.patch };
  assert.equal(mensalidadeDoMes(voltou, '2027-02').valor, 0);
  assert.equal(mensalidadeDoMes(voltou, '2027-03').valor, 142.5);
  assert.equal(mensalidadeDoMes(voltou, '2027-04').valor, 190);
});

test('congelarCreditos com dias zero não muda nada', () => {
  const at = { a: { expira: '2026-12-31', reposicao: null } };
  assert.deepEqual(congelarCreditos(at, '2026-12-20', '2026-12-20'), { atestados: at, congelados: 0 });
});

/* ---------- dupla ---------- */

const bia = { id: 'Bia02', nome: 'Bia Lima', diasTreino: ['seg', 'qua'], horarios: { seg: '18:10', qua: '18:10' } };
const caio = { id: 'Caio03', nome: 'Caio Reis', diasTreino: ['seg', 'qua'], horarios: { seg: '18:10', qua: '19:10' } };

test('a grade diferente da dupla', () => {
  assert.equal(gradeDiferente(bia, { ...bia, id: 'X' }), '');
  assert.equal(gradeDiferente(bia, caio), 'Bia: qua 18:10 · Caio: qua 19:10');
});

test('ligar e desligar a dupla grava nos dois', () => {
  const r = ligarDupla({ ...ana, ...bia }, caio);
  assert.ok(!recusou(r));
  assert.deepEqual(r.patchA, { dupla: { id: 'Caio03', nome: 'Caio Reis' } });
  assert.deepEqual(r.patchB, { dupla: { id: 'Bia02', nome: 'Bia Lima' } });
  assert.match(r.aviso, /qua/);
  assert.ok(recusou(ligarDupla(bia, bia)));
  assert.ok(recusou(ligarDupla({ ...bia, dupla: { id: 'Z', nome: 'Zé' } }, caio)));
  const d = desligarDupla({ ...bia, dupla: { id: 'Caio03', nome: 'Caio Reis' } }, { ...caio, dupla: { id: 'Bia02' } });
  assert.deepEqual(d.patchA, { dupla: null });
  assert.deepEqual(d.patchB, { dupla: null });
  assert.equal(desligarDupla({ ...bia, dupla: { id: 'Caio03' } }, caio).patchB, null, 'o outro não tinha a dupla');
});

/* ---------- Instagram, indicação, semanas ---------- */

test('Instagram marca e desmarca o mês', () => {
  const r = /** @type {any} */ (alternarInstagram(ana, '2026-12'));
  assert.deepEqual(r.patch, { instagram: ['2026-12'] });
  assert.equal(r.log.resumo, 'Instagram de dez/2026: 5% em jan/2027');
  const r2 = /** @type {any} */ (alternarInstagram({ ...ana, ...r.patch }, '2026-12'));
  assert.deepEqual(r2.patch, { instagram: [] });
  assert.equal(mensalidadeDoMes({ ...ana, instagram: ['2026-12'] }, '2027-01').valor, 180.5);
});

test('indicações: elegível se pagou a 1ª até o dia 10', () => {
  const novo = (id, data) => ({ id, nome: id, indicadoPor: { id: 'Ana01', nome: 'Ana', mes: '2027-01' }, pagamentos: data ? { '2027-01': true } : {}, recebimentos: data ? { '2027-01': { data } } : {} });
  const todos = [ana, novo('N1', '2027-01-08'), novo('N2', '2027-01-12'), novo('N3', ''), { id: 'Outro', indicadoPor: { id: 'X', mes: '2027-01' } }];
  const l = indicacoesDe(ana, todos);
  assert.deepEqual(l.map((i) => [i.indicado.id, i.elegivel, i.mesDoBonus, i.dado]), [['N1', true, '2027-02', false], ['N2', false, '2027-02', false], ['N3', false, '2027-02', false]]);
  const r = /** @type {any} */ (darIndicacao(ana, todos[1], '2027-02'));
  assert.deepEqual(r.patch, { indicacoes: [{ mes: '2027-02', id: 'N1', nome: 'N1' }] });
  const comDada = { ...ana, ...r.patch };
  assert.equal(indicacoesDe(comDada, todos)[0].dado, true);
  assert.ok(recusou(darIndicacao(comDada, todos[1], '2027-02')));
  assert.equal(mensalidadeDoMes(comDada, '2027-02').valor, 133);
  assert.deepEqual(/** @type {any} */ (tirarIndicacao(comDada, 'N1')).patch, { indicacoes: [] });
  assert.ok(recusou(tirarIndicacao(ana, 'N1')));
});

test('ajuste das semanas', () => {
  const r = /** @type {any} */ (ajustarSemanas(ana, '2027-01', 2));
  assert.deepEqual(r.patch, { semanasAjuste: { '2027-01': 2 } });
  assert.equal(r.log.resumo, 'Semanas de jan/2027: 2 de 4 (ajuste do coach)');
  assert.deepEqual(/** @type {any} */ (ajustarSemanas({ ...ana, ...r.patch }, '2027-01', null)).patch, { semanasAjuste: {} });
  assert.ok(recusou(ajustarSemanas(ana, '2027-01', 5)));
});

/* ---------- migração ---------- */

const BRT = (iso) => Date.parse(iso + 'T12:00:00-03:00');

test('início: o mais antigo entre criação, 1º mês pago e 1ª presença', () => {
  assert.equal(inicioDaFicha({ criadoEm: BRT('2026-08-20'), pagamentos: { '2026-07': true, '2026-06': false }, presencas: ['2026-07-15'] }), '2026-07-01');
  assert.equal(inicioDaFicha({ criadoEm: BRT('2026-06-03'), presencas: ['2026-06-10'] }), '2026-06-03');
  assert.equal(inicioDaFicha({}), '');
});

test('plano: pela frequência; sem ela, pelo valor', () => {
  assert.deepEqual(planoDaFicha({ freqVezes: '3', mensalidade: '115' }), { vezes: 3, prazo: 'mensal' });
  assert.deepEqual(planoDaFicha({ mensalidade: '115' }), { vezes: 2, prazo: 'mensal' });
  assert.deepEqual(planoDaFicha({ mensalidade: '130' }), { vezes: 3, prazo: 'mensal' });
  assert.deepEqual(planoDaFicha({ freqVezes: '4', mensalidade: '130' }), { vezes: 4, prazo: 'mensal' });
  assert.equal(planoDaFicha({ mensalidade: '99' }), null);
});

test('migração: ativa vira fundadora; cortesia sai da parceria de 100%; inativa sem fundador', () => {
  const f = { id: '1', status: 'ativo', freqVezes: '4', mensalidade: '150', criadoEm: BRT('2026-07-02'), parceria: { nome: 'Clínica', percentual: 100 } };
  assert.deepEqual(migracaoDaFicha(f), {
    inicio: '2026-07-02', plano: { vezes: 4, prazo: 'mensal' }, fundador: true, cortesia: { motivo: 'Clínica', desde: '2026-07-02' },
  });
  const inativa = migracaoDaFicha({ id: '2', status: 'inativo', freqVezes: '3', criadoEm: BRT('2026-06-10') });
  assert.equal('fundador' in inativa, false);
  assert.deepEqual(inativa.plano, { vezes: 3, prazo: 'mensal' });
  assert.deepEqual(migracaoDaFicha({ id: '3', inicio: '2026-07-01', plano: { vezes: 3 }, fundador: true }), {}, 'já migrada: nada');
  assert.equal(migracaoDaFicha({ id: '4', status: 'pendente', mensalidade: '130' }).fundador, true, 'pendente vira fundadora');
});

test('migração não muda o valor de nenhum mês até dezembro', () => {
  const f = { id: '1', status: 'ativo', freqVezes: '3', mensalidade: '130', criadoEm: BRT('2026-07-02'), pagamentos: { '2026-07': true } };
  const migrada = { ...f, ...migracaoDaFicha(f) };
  for (const mes of ['2026-07', '2026-10', '2026-11', '2026-12']) assert.equal(mensalidadeDoMes(migrada, mes).valor, 130, mes);
  assert.equal(mensalidadeDoMes(migrada, '2027-01').valor, 190);
});

test('fundador pelo início', () => {
  assert.equal(fundadorPeloInicio('2026-12-31'), true);
  assert.equal(fundadorPeloInicio('2027-01-04'), false);
  assert.equal(fundadorPeloInicio(''), false);
});
