// @ts-check
/**
 * Etapa 6.4 (decisão 12) na Gestão: o lançamento com quantidade, a compra paga
 * na hora (fora da fatura, com o meio), a venda a visitante nos avulsos e o mês
 * fechado na fatia do Portal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lancarConsumo, registrarCompraNaHora, desfazerCompraNaHora, erroDaVendaNaHora } from './financeiro-regras.js?v=40';
import { faturaDoAluno } from './financeiro-aluno.js?v=40';
import {
  dadosDaVendaAvulsa, comVendaAvulsa, semVendaAvulsa, avulsosDoMes, comprasNaHoraDoMes, DIAS_DE_VENDAS_AVULSAS,
} from './avulsos-regras.js?v=40';
import { retratoDoMes, aprovarFechamento, reabrirFechamento, fechamentosDaFatia } from './fechamento-regras.js?v=40';
import { fatia } from './portal-sync.js?v=40';

const ana = (extra = {}) => ({ id: 'A1', nome: 'Ana', email: 'ana@x.com', mensalidade: '130', vencimento: '10', pagamentos: {}, consumos: [], ...extra });
const energetico = { produtoId: 'p1', nome: 'Energético', preco: 10 };

test('lançar 12 energéticos de uma vez: uma linha, preco = total, qtd e unitário', () => {
  const r = lancarConsumo(ana(), { ...energetico, qtd: 12 }, '2026-12-02', 'c1');
  assert.deepEqual(r.consumo, { id: 'c1', produtoId: 'p1', nome: 'Energético', preco: 120, data: '2026-12-02', mesId: '2027-01', qtd: 12, unitario: 10 });
  assert.equal(r.patch.consumos.length, 1);
});

test('lançar 1 unidade grava como antes (sem qtd)', () => {
  const r = lancarConsumo(ana(), energetico, '2026-11-20', 'c2');
  assert.deepEqual(r.consumo, { id: 'c2', produtoId: 'p1', nome: 'Energético', preco: 10, data: '2026-11-20', mesId: '2026-12' });
});

test('a fatura mostra "12 × Energético" e soma o total', () => {
  const a = ana({ consumos: [lancarConsumo(ana(), { ...energetico, qtd: 12 }, '2026-12-02', 'c1').consumo] });
  const f = faturaDoAluno(a, '2027-01', [a], '2027-01-05');
  assert.ok(f);
  const item = f.itens.find((i) => i.tipo === 'consumo');
  assert.equal(item && item.descricao, '12 × Energético');
  assert.equal(item && item.valor, 120);
});

test('compra paga na hora: fora da fatura, com o meio e a trilha', () => {
  const r = registrarCompraNaHora(ana(), { ...energetico, qtd: 2 }, '2026-12-03', 'dinheiro', { em: 1, id: 'nh1' });
  assert.ok(r);
  assert.deepEqual(r.compra, { id: 'nh1', nome: 'Energético', qtd: 2, unitario: 10, valor: 20, data: '2026-12-03', meio: 'dinheiro', em: 1, produtoId: 'p1' });
  assert.equal(r.patch.consumos, undefined, 'não mexe nos consumos da fatura');
  assert.equal(r.log && r.log.tipo, 'venda-na-hora');
  assert.match(String(r.log && r.log.resumo), /2 × Energético · R\$\s?20,00 · Dinheiro/);
  const a = ana({ comprasNaHora: r.patch.comprasNaHora });
  assert.equal(faturaDoAluno(a, '2027-01', [a], '2027-01-05')?.itens.some((i) => i.tipo === 'consumo'), false);
});

test('compra na hora sem meio ou sem valor é recusada', () => {
  assert.match(erroDaVendaNaHora(energetico, ''), /Pix, cartão ou dinheiro/);
  assert.match(erroDaVendaNaHora({ nome: 'X', preco: 0 }, 'pix-chave'), /valor/);
  assert.equal(registrarCompraNaHora(ana(), energetico, '2026-12-03', 'cheque', { em: 1 }), null);
});

test('desfazer a venda na hora pede o motivo', () => {
  const a = ana({ comprasNaHora: [{ id: 'nh1', nome: 'Energético', qtd: 1, unitario: 10, valor: 10, data: '2026-12-03', meio: 'cartao', em: 1 }] });
  assert.equal(desfazerCompraNaHora(a, 'nh1', '  '), null);
  assert.equal(desfazerCompraNaHora(a, 'outra', 'errei'), null);
  const r = desfazerCompraNaHora(a, 'nh1', 'lancei no aluno errado');
  assert.ok(r);
  assert.deepEqual(r.patch.comprasNaHora, []);
  assert.equal(r.log && r.log.tipo, 'venda-desfeita');
  assert.equal(r.log && r.log.motivo, 'lancei no aluno errado');
});

test('as compras na hora do mês (pela data), de todos os alunos', () => {
  const fichas = [
    ana({ comprasNaHora: [{ id: '1', nome: 'Água', qtd: 2, valor: 10, data: '2026-12-03', meio: 'pix-chave' }, { id: '2', nome: 'Água', valor: 5, data: '2027-01-02', meio: 'cartao' }] }),
    { id: 'B2', nome: 'Bia', comprasNaHora: [{ id: '3', nome: 'Energético', valor: 10, data: '2026-12-01', meio: 'dinheiro' }] },
  ];
  const r = comprasNaHoraDoMes(fichas, '2026-12');
  assert.equal(r.total, 20);
  assert.deepEqual(r.itens.map((i) => [i.nome, i.descricao, i.valor]), [['Bia', 'Energético', 10], ['Ana', '2 × Água', 10]]);
});

test('venda a visitante: nome, produto, quantidade e meio; entra nos avulsos do mês', () => {
  const d = dadosDaVendaAvulsa({ visitante: ' Caio ', item: { ...energetico, qtd: '3' }, meio: 'pix-chave', em: 5, id: 'va1' });
  assert.ok('dados' in d);
  assert.deepEqual(d.dados, { id: 'va1', visitante: 'Caio', nome: 'Energético', qtd: 3, unitario: 10, valor: 30, meio: 'pix-chave', em: 5, produtoId: 'p1' });
  const vendas = comVendaAvulsa({}, '2026-12-04', d.dados, '2026-12-04');
  const exps = { '2026-12-04': [{ tipo: 'daypass', nome: 'Duda', pagamento: { valor: 50, meio: 'cartao' } }] };
  const av = avulsosDoMes(exps, '2026-12', vendas);
  assert.equal(av.total, 80);
  assert.deepEqual(av.itens.map((i) => [i.tipo, i.nome, i.valor]), [['daypass', 'Duda', 50], ['venda', 'Caio · 3 × Energético', 30]]);
  assert.equal(avulsosDoMes(exps, '2026-12').total, 50, 'sem as vendas, só o Day Pass (como antes)');
});

test('venda a visitante recusada: sem nome, sem meio ou sem produto', () => {
  assert.deepEqual(dadosDaVendaAvulsa({ visitante: '', item: energetico, meio: 'cartao', em: 1, id: 'x' }), { recusa: 'Escreva o nome do visitante' });
  assert.deepEqual(dadosDaVendaAvulsa({ visitante: 'Caio', item: energetico, meio: 'fiado', em: 1, id: 'x' }), { recusa: 'Escolha como ele pagou' });
  assert.deepEqual(dadosDaVendaAvulsa({ visitante: 'Caio', item: { nome: '', preco: 0 }, meio: 'cartao', em: 1, id: 'x' }), { recusa: 'Escolha o produto' });
});

test('as vendas a visitantes podam os dias velhos e saem pelo id', () => {
  const velho = { '2025-01-01': [{ id: 'v0', valor: 5 }] };
  const com = comVendaAvulsa(velho, '2026-12-04', { id: 'v1', valor: 10 }, '2026-12-04');
  assert.equal(DIAS_DE_VENDAS_AVULSAS, 400);
  assert.deepEqual(Object.keys(com), ['2026-12-04'], 'o dia de mais de 400 dias atrás sai');
  assert.deepEqual(semVendaAvulsa(com, '2026-12-04', 'v1'), {});
  assert.equal(semVendaAvulsa(com, '2026-12-04', 'nada'), null);
});

test('o retrato guarda as vendas na hora do mês, fora das linhas', () => {
  const a = ana();
  const naHora = { itens: [{ alunoId: 'A1', nome: 'Ana', descricao: 'Água', valor: 5, meio: 'pix-chave', data: '2026-12-03' }], total: 5 };
  const r = /** @type {any} */ (retratoDoMes([a], '2026-12', '2026-12-20', { avulsos: { itens: [], total: 0 }, devolucoes: { itens: [], total: 0 }, naHora }));
  assert.equal(r.totais.naHora, 5);
  assert.equal(r.naHora.length, 1);
  const sem = /** @type {any} */ (retratoDoMes([a], '2026-12', '2026-12-20', { avulsos: { itens: [], total: 0 }, devolucoes: { itens: [], total: 0 } }));
  assert.equal(sem.totais.naHora, undefined, 'sem venda na hora, o retrato fica como era');
});

test('o mês fechado vai para a fatia do aluno sem o registro do pagamento', () => {
  const a = ana({
    pagamentos: { '2026-11': true },
    recebimentos: { '2026-11': { valor: 140, data: '2026-11-08', meio: 'pix-chave', comprovante: 'gestao/x/y.webp' } },
    consumos: [{ id: 'c1', nome: 'Energético', preco: 10, data: '2026-11-05', mesId: '2026-11' }],
  });
  const retrato = retratoDoMes([a], '2026-11', '2026-11-30');
  const { doc } = aprovarFechamento(retrato, null, 1_700_000_000_000);
  const f = fechamentosDaFatia({ '2026-11': doc }, 'A1');
  assert.deepEqual(Object.keys(f), ['2026-11']);
  assert.equal(f['2026-11'].total, retrato.linhas.A1.total);
  assert.equal(f['2026-11'].fechadoEm, 1_700_000_000_000);
  assert.equal(JSON.stringify(f).includes('comprovante'), false, 'o comprovante não vai');
  assert.equal(JSON.stringify(f).includes('consumoId'), false, 'nem o id do lançamento');
  assert.ok(f['2026-11'].itens.some((i) => i.tipo === 'consumo' && i.valor === 10));
  // Reaberto: volta a ser calculado pela ficha (não vai para a fatia).
  const reaberto = reabrirFechamento(doc, 'faltou um consumo', 1_700_000_100_000);
  assert.deepEqual(fechamentosDaFatia({ '2026-11': reaberto && reaberto.doc }, 'A1'), {});
  // Outro aluno: nada.
  assert.deepEqual(fechamentosDaFatia({ '2026-11': doc }, 'B2'), {});
});

test('a fatia publica os meses fechados do aluno', () => {
  const a = ana();
  const { doc } = aprovarFechamento(retratoDoMes([a], '2026-11', '2026-11-30'), null, 1);
  const f = /** @type {any} */ (fatia(a, [a], [], '2026-12-01', { '2026-11': doc }));
  assert.deepEqual(Object.keys(f.fechamentos), ['2026-11']);
  assert.deepEqual(/** @type {any} */ (fatia(a, [a])).fechamentos, {}, 'sem fechamento, vazio');
});
