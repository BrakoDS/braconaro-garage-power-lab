// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fecharContrato, trancar, trancamentoDoContrato, contaDaSaida, encerrarAntes, registrarDevolucao, avisoDeFim, renovar,
  passarParaMensal, contratoEmCurso,
} from './contratos-regras.js?v=39';
import { voltar } from './cadastro-regras.js?v=39';
import { mensalidadeDoMes } from '../../compartilhado/regras/planos.js';

const ana = { id: 'Ana01', nome: 'Ana', status: 'ativo', plano: { vezes: 3, prazo: 'mensal' }, fundador: true, mensalidade: '130' };
const recusou = (/** @type {any} */ r) => 'recusa' in r;
const comPatch = (/** @type {any} */ a, /** @type {any} */ r) => ({ ...a, ...r.patch });
const HOJE = '2026-12-10';

test('fechar contrato: preço da tabela do prazo, total de uma vez, plano no prazo', () => {
  const r = /** @type {any} */ (fecharContrato(ana, { prazo: 'trimestral', inicio: '2027-01', id: 'c1', hojeIso: HOJE }));
  assert.ok(!recusou(r));
  assert.deepEqual(r.patch.contratos, [{ id: 'c1', prazo: 'trimestral', vezes: 3, inicio: '2027-01', valorMensal: 180, pctBonus: 0, total: 540 }]);
  assert.deepEqual(r.patch.plano, { vezes: 3, prazo: 'trimestral' });
  assert.equal(r.log.tipo, 'contrato');
  assert.equal(r.log.resumo, 'Contrato trimestral de jan/2027 a mar/2027: R$ 540,00 de uma vez');
  const a = comPatch(ana, r);
  assert.equal(mensalidadeDoMes(a, '2027-01').valor, 540);
  assert.equal(mensalidadeDoMes(a, '2027-02').valor, 0);
});

test('fechar contrato recusa: antes de 2027, mês passado, sem plano, plano fora da tabela, sobreposto', () => {
  assert.ok(recusou(fecharContrato(ana, { prazo: 'trimestral', inicio: '2026-12', id: 'x', hojeIso: HOJE })));
  assert.ok(recusou(fecharContrato(ana, { prazo: 'trimestral', inicio: '2027-01', id: 'x', hojeIso: '2027-02-01' })));
  assert.ok(recusou(fecharContrato({ ...ana, plano: null }, { prazo: 'trimestral', inicio: '2027-01', id: 'x', hojeIso: HOJE })));
  assert.ok(recusou(fecharContrato({ ...ana, plano: { vezes: 4 } }, { prazo: 'trimestral', inicio: '2027-01', id: 'x', hojeIso: HOJE })), 'fundador não tem 4x trimestral');
  const a = comPatch(ana, fecharContrato(ana, { prazo: 'trimestral', inicio: '2027-01', id: 'c1', hojeIso: HOJE }));
  const r = fecharContrato(a, { prazo: 'semestral', inicio: '2027-03', id: 'c2', hojeIso: HOJE });
  assert.ok(recusou(r));
  assert.match(/** @type {any} */ (r).recusa, /mar\/2027/);
});

test('trancar: pausa ligada ao contrato; o trimestral só tem 1; voltar estica o contrato', () => {
  const a = comPatch(ana, fecharContrato(ana, { prazo: 'trimestral', inicio: '2027-01', id: 'c1', hojeIso: HOJE }));
  assert.ok(recusou(trancar(a, { desde: '2026-12-20' })), 'sem contrato em dezembro: é pausa');
  const r = /** @type {any} */ (trancar(a, { desde: '2027-02-01', motivo: 'Viagem' }));
  assert.ok(!recusou(r));
  assert.deepEqual(r.patch.pausas, [{ desde: '2027-02-01', motivo: 'Viagem', contrato: 'c1' }]);
  assert.equal(r.patch.status, 'pausado');
  assert.match(r.log.resumo, /trancado desde 01\/02/);
  const trancado = comPatch(a, r);
  const volta = /** @type {any} */ (voltar(trancado, { ate: '2027-02-16' }));
  const depois = comPatch(trancado, volta);
  assert.deepEqual(trancamentoDoContrato(depois, depois.contratos[0]), { periodosUsados: 1, periodos: 1, diasPorPeriodo: 15, diasUsados: 15 });
  assert.ok(recusou(trancar(depois, { desde: '2027-03-01' })), 'o trimestral já usou o trancamento');
  assert.equal(mensalidadeDoMes(depois, '2027-04').valor, 95, 'abril cobra as semanas depois de 15/04');
});

test('conta da saída: 20% das mensalidades que faltam, devolve 80%', () => {
  const c = { id: 'c1', prazo: 'trimestral', inicio: '2027-01', total: 720 };
  assert.deepEqual(contaDaSaida(c, '2027-01'), { mesesQueFaltam: 2, valorQueFalta: 480, multa: 96, devolucao: 384 });
  const sem = { id: 's1', prazo: 'semestral', inicio: '2027-01', total: 1020 };
  assert.deepEqual(contaDaSaida(sem, '2027-02'), { mesesQueFaltam: 4, valorQueFalta: 680, multa: 136, devolucao: 544 });
});

test('encerrar antes: motivo obrigatório, grava a saída, o plano volta ao mensal; devolução registrada', () => {
  const a = comPatch(ana, fecharContrato(ana, { prazo: 'trimestral', inicio: '2027-01', id: 'c1', hojeIso: HOJE }));
  assert.ok(recusou(encerrarAntes(a, 'c1', { ultimoMes: '2027-01', motivo: '', em: 1 })));
  assert.ok(recusou(encerrarAntes(a, 'c1', { ultimoMes: '2027-03', motivo: 'x', em: 1 })), 'mar já é o fim');
  const r = /** @type {any} */ (encerrarAntes(a, 'c1', { ultimoMes: '2027-01', motivo: 'Mudou de cidade', em: 5 }));
  assert.ok(!recusou(r));
  assert.deepEqual(r.patch.contratos[0].saida, { ultimoMes: '2027-01', mesesQueFaltam: 2, valorQueFalta: 360, multa: 72, devolucao: 288, motivo: 'Mudou de cidade', em: 5 });
  assert.equal(r.patch.plano.prazo, 'mensal');
  assert.equal(r.log.extra.motivo, 'Mudou de cidade');
  const saiu = comPatch(a, r);
  assert.equal(mensalidadeDoMes(saiu, '2027-02').valor, 190, 'fevereiro já não é coberto');
  assert.ok(recusou(registrarDevolucao(saiu, 'c1', { data: '2027-02-05', meio: 'boleto', em: 6 })));
  const d = /** @type {any} */ (registrarDevolucao(saiu, 'c1', { data: '2027-02-05', meio: 'pix-chave', em: 6 }));
  assert.deepEqual(d.patch.contratos[0].devolucao, { valor: 288, data: '2027-02-05', meio: 'pix-chave', registradoEm: 6 });
  assert.equal(d.log.tipo, 'devolucao');
  assert.ok(recusou(registrarDevolucao(comPatch(saiu, d), 'c1', { data: '2027-02-05', meio: 'pix-chave', em: 7 })), 'já registrada');
});

test('aviso de fim: 30 dias antes do último dia coberto; renovar começa no mês seguinte', () => {
  const a = comPatch(ana, fecharContrato(ana, { prazo: 'trimestral', inicio: '2027-01', id: 'c1', hojeIso: HOJE }));
  assert.equal(avisoDeFim(a, '2027-02-27'), null);
  const av = avisoDeFim(a, '2027-03-05');
  assert.deepEqual(av && [av.ultimoDia, av.proximoMes], ['2027-03-31', '2027-04']);
  const r = /** @type {any} */ (renovar(a, { id: 'c2', hojeIso: '2027-03-05' }));
  assert.deepEqual(r.patch.contratos.map((/** @type {any} */ c) => c.inicio), ['2027-01', '2027-04']);
  const renovado = comPatch(a, r);
  assert.equal(avisoDeFim(renovado, '2027-03-05'), null, 'renovado: sem aviso');
  assert.equal(mensalidadeDoMes(renovado, '2027-04').valor, 540);
  assert.equal(contratoEmCurso(renovado, '2027-05').id, 'c2');
});

test('passar para o mensal', () => {
  const r = /** @type {any} */ (passarParaMensal({ ...ana, plano: { vezes: 3, prazo: 'trimestral' } }));
  assert.deepEqual(r.patch.plano, { vezes: 3, prazo: 'mensal' });
  assert.ok(recusou(passarParaMensal(ana)));
});
