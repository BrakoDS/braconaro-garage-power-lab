// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/financeiro-aluno.test.js
 *
 * O financeiro de um aluno: quais meses aparecem, em que situação cada fatura
 * está (o critério do Portal), quem paga a conta de quem, e as gravações
 * (consumo carimbado na fatura certa, baixa do mês).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  brl, numMoney, rotuloMesFin, addMesFin, statusFin, novoConsumo, comPagamento,
  contaDoMes, mesesDoHistorico, faturaDoAluno, historicoFinanceiro, resumoDoPlano,
} from './financeiro-aluno.js';

const HOJE = '2026-10-07'; // vencimento dia 10: outubro ainda não venceu
const ana = {
  id: 'Ana', nome: 'Ana Lima', mensalidade: '150', vencimento: '10', freqVezes: '3', status: 'ativo',
  pagamentos: { '2026-08': true },
  consumos: [
    { id: 'c1', produtoId: 'energetico', nome: 'Energético', preco: 10, data: '2026-09-05', mesId: '2026-09' },
    { id: 'c2', nome: 'Camiseta', preco: 60, data: '2026-10-02', mesId: '2026-10' },
  ],
};

test('formato: reais, meses', () => {
  assert.equal(brl(1234.5).replace(/\s/g, ' '), 'R$ 1.234,50');
  assert.equal(numMoney('12,5'), 12.5);
  assert.equal(numMoney('x'), 0);
  assert.equal(rotuloMesFin('2026-10'), 'Outubro / 2026');
  assert.equal(addMesFin('2026-01', -1), '2025-12');
});

test('statusFin (tela do box): a mesma regra de antes, com fevereiro curto', () => {
  assert.equal(statusFin(ana, '2026-08', HOJE), 'pago');
  assert.equal(statusFin(ana, '2026-09', HOJE), 'vencido');
  assert.equal(statusFin(ana, '2026-10', HOJE), 'pendente');
  assert.equal(statusFin({ vencimento: '31' }, '2027-02', '2027-02-28'), 'pendente', 'vence no último dia de fevereiro');
  assert.equal(statusFin({ vencimento: '31' }, '2027-02', '2027-03-01'), 'vencido');
});

/* ---------- meses do histórico ---------- */

test('histórico começa no primeiro registro — nunca antes (meses sem controle não viram "atrasado")', () => {
  assert.deepEqual(mesesDoHistorico(ana, HOJE).meses, ['2026-10', '2026-09', '2026-08']);
  assert.deepEqual(mesesDoHistorico({ criadoEm: 1 }, HOJE).meses, ['2026-10'], 'sem registro: só o mês atual');
});

test('histórico vai até a fatura mais à frente com consumo, e corta em 12 meses', () => {
  const adiante = { ...ana, consumos: [...ana.consumos, { id: 'c3', nome: 'Pré', preco: 3, data: '2026-10-20', mesId: '2026-11' }] };
  assert.equal(mesesDoHistorico(adiante, HOJE).meses[0], '2026-11');
  const antigo = { pagamentos: { '2024-01': true } };
  const h = mesesDoHistorico(antigo, HOJE);
  assert.equal(h.meses.length, 12);
  assert.equal(h.temMais, true);
  assert.equal(h.meses[0], '2026-10');
});

/* ---------- faturas ---------- */

test('fatura: mensalidade + consumos do mês, e a situação do Portal', () => {
  const h = historicoFinanceiro(ana, [ana], HOJE);
  assert.deepEqual(h.faturas.map((f) => [f.mesId, f.status, f.total]), [
    ['2026-10', 'pendente', 210], ['2026-09', 'vencido', 160], ['2026-08', 'pago', 150],
  ]);
  assert.equal(h.emAberto, 370);
  assert.equal(h.atrasado, 160);
  const set = h.faturas[1];
  assert.deepEqual(set.itens.map((i) => [i.tipo, i.descricao, i.valor]), [['mensalidade', 'Mensalidade', 150], ['consumo', 'Energético', 10]]);
  assert.equal(set.itens[1].consumoId, 'c1');
  assert.equal(set.vencimento, '2026-09-10');
  assert.ok(h.faturas.every((f) => f.pagavel));
});

test('fatura: depois do dia 28, a do mês seguinte é "próximo mês" (como no Portal)', () => {
  const f = faturaDoAluno({ mensalidade: '100', vencimento: '10', consumos: [] }, '2026-11', [], '2026-10-29');
  assert.equal(f?.status, 'proximo');
});

test('parceria: desconto só na mensalidade; 100% vira cortesia, sem baixa', () => {
  const p25 = { ...ana, pagamentos: {}, consumos: [], parceria: { nome: 'Clínica', percentual: 25 } };
  const f = faturaDoAluno(p25, '2026-10', [p25], HOJE);
  assert.equal(f?.total, 112.5);
  assert.match(f?.itens[0].detalhe || '', /150,00 − parceria 25%/);
  const cortesia = { ...p25, parceria: { nome: 'Atleta', percentual: 100 } };
  const fc = faturaDoAluno(cortesia, '2026-10', [cortesia], HOJE);
  assert.equal(fc?.status, 'cortesia');
  assert.equal(fc?.pagavel, false);
});

test('responsável e dependente: a conta inteira na do pai, nada a cobrar do filho', () => {
  const bia = { id: 'Bia', nome: 'Bia', mensalidade: '120', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' },
    consumos: [{ id: 'b1', nome: 'Energético', preco: 10, data: '2026-10-01', mesId: '2026-10' }] };
  const todos = [ana, bia];
  const fAna = faturaDoAluno(ana, '2026-10', todos, HOJE);
  assert.equal(fAna?.total, 340, '150 + 60 + 130 da Bia');
  assert.deepEqual(fAna?.itens.at(-1), { tipo: 'dependente', descricao: 'Conta de Bia', valor: 130, detalhe: 'plano e consumíveis' });
  const fBia = faturaDoAluno(bia, '2026-10', todos, HOJE);
  assert.equal(fBia?.status, 'coberto');
  assert.equal(fBia?.responsavel, 'Ana Lima');
  assert.equal(fBia?.pagavel, false);
  assert.ok(fBia?.itens.every((i) => i.coberto), 'tudo aparece como "na conta de"');
});

test('dependente só do plano: paga o próprio consumo, a mensalidade é do responsável', () => {
  const caio = { id: 'Caio', nome: 'Caio', mensalidade: '100', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'plano' },
    consumos: [{ id: 'k1', nome: 'Pré', preco: 3, data: '2026-10-01', mesId: '2026-10' }] };
  const f = faturaDoAluno(caio, '2026-10', [ana, caio], HOJE);
  assert.equal(f?.total, 3);
  assert.equal(f?.pagavel, true);
  assert.equal(f?.status, 'pendente');
  assert.equal(f?.itens[0].coberto, true, 'mensalidade na conta da Ana');
  assert.equal(f?.itens[1].coberto, false);
});

test('responsável inativo (ou que saiu): o dependente volta a pagar a própria conta', () => {
  const dep = { id: 'Dudu', mensalidade: '80', vencimento: '10', pagoPor: { id: 'Ana', escopo: 'tudo' } };
  const f = faturaDoAluno(dep, '2026-10', [{ ...ana, status: 'inativo' }, dep], HOJE);
  assert.equal(f?.status, 'pendente');
  assert.equal(f?.total, 80);
  assert.equal(contaDoMes(dep, '2026-10', [dep]).resp, null);
});

test('mês sem nada (sem mensalidade, sem consumo) não vira fatura vazia', () => {
  assert.equal(faturaDoAluno({ consumos: [] }, '2026-10', [], HOJE), null);
  assert.deepEqual(historicoFinanceiro({}, [], HOJE).faturas, []);
});

/* ---------- gravações ---------- */

test('novo consumo: nome e preço copiados, fatura carimbada pela data', () => {
  const c = novoConsumo(ana, { produtoId: 'energetico', nome: 'Energético', preco: '12,50' }, '2026-10-05', 'x1');
  assert.deepEqual(c, { id: 'x1', produtoId: 'energetico', nome: 'Energético', preco: 12.5, data: '2026-10-05', mesId: '2026-10' });
  assert.equal(novoConsumo(ana, { nome: 'Pré', preco: 3 }, '2026-10-11', 'x2').mesId, '2026-11', 'depois do vencimento cai na seguinte');
  const avulso = novoConsumo(ana, { nome: '  Camiseta ', preco: 60 }, '2026-10-05', 'x3');
  assert.ok(!('produtoId' in avulso), 'avulso não inventa produto');
  assert.equal(avulso.nome, 'Camiseta');
  const pagouOutubro = { ...ana, pagamentos: { '2026-10': true } };
  assert.equal(novoConsumo(pagouOutubro, { nome: 'Pré', preco: 3 }, '2026-10-05', 'x4').mesId, '2026-11', 'fatura quitada empurra para a seguinte');
});

test('baixa e desfazer: o mês inteiro, sem mexer no mapa original', () => {
  const pg = { '2026-08': true };
  assert.deepEqual(comPagamento(pg, '2026-09', true), { '2026-08': true, '2026-09': true });
  assert.deepEqual(comPagamento(pg, '2026-08', false), {});
  assert.deepEqual(pg, { '2026-08': true });
  assert.deepEqual(comPagamento(undefined, '2026-10', true), { '2026-10': true });
});

/* ---------- resumo ---------- */

test('resumo do plano: valor, frequência, vencimento e vínculos', () => {
  const r = resumoDoPlano({ ...ana, parceria: { nome: 'Clínica', percentual: 50 } }, [ana], HOJE);
  assert.equal(r.plano, '3x por semana');
  assert.equal(r.mensalidade, 75);
  assert.equal(r.desconto, 75);
  assert.equal(r.vencimento, 10);
  const bia = { id: 'Bia', nome: 'Bia', pagoPor: { id: 'Ana', escopo: 'plano' } };
  assert.deepEqual(resumoDoPlano(bia, [ana, bia], HOJE).responsavel, { nome: 'Ana Lima', escopo: 'plano' });
  assert.deepEqual(resumoDoPlano(ana, [ana, bia], HOJE).dependentes, ['Bia']);
  assert.equal(resumoDoPlano({}, [], HOJE).vencimentoDefinido, false);
});
