// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpfValido, digitosDoCpf, codigoDoCpf, experimentalJaFeita, comCpf, dadosDoDayPass, dayPassDaFicha, avulsosDoMes, devolucoesDoMes,
} from './avulsos-regras.js?v=40';
import { adicionarExperimental } from './presenca-regras.js?v=40';

test('CPF: dígitos verificadores', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('52998224724'), false);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cpfValido('123'), false);
  assert.equal(digitosDoCpf('529.982.247-25'), '52998224725');
});

test('o código do CPF: o mesmo para o mesmo CPF, com ou sem pontos, e nunca o número', async () => {
  const a = await codigoDoCpf('529.982.247-25');
  const b = await codigoDoCpf('52998224725');
  assert.equal(a, b);
  assert.equal(a.length, 16);
  assert.ok(!a.includes('52998224725'));
  assert.notEqual(a, await codigoDoCpf('153.509.460-56'));
  const reg = comCpf({}, a, '2026-11-20');
  assert.equal(experimentalJaFeita(reg, b), '2026-11-20');
  assert.equal(experimentalJaFeita(reg, 'outro'), '');
});

test('Day Pass: nome e meio obrigatórios; entra na lista do dia com o pagamento', () => {
  assert.ok('recusa' in dadosDoDayPass({ nome: '', meio: 'pix-chave', em: 1 }));
  assert.ok('recusa' in dadosDoDayPass({ nome: 'Vi', meio: 'boleto', em: 1 }));
  const r = /** @type {any} */ (dadosDoDayPass({ nome: ' Vi ', telefone: '149', meio: 'pix-chave', em: 1 }));
  assert.deepEqual(r.dados, { nome: 'Vi', telefone: '149', tipo: 'daypass', pagamento: { meio: 'pix-chave', valor: 50, em: 1 } });
  const lista = /** @type {any} */ (adicionarExperimental([], { ...r.dados, hora: '18:10' }, { id: 'd1', em: 1, vagas: 2 })).lista;
  assert.deepEqual(lista[0], { id: 'd1', nome: 'Vi', telefone: '149', hora: '18:10', status: 'confirmado', em: 1, tipo: 'daypass', pagamento: { meio: 'pix-chave', valor: 50, em: 1 } });
  assert.deepEqual(dayPassDaFicha(lista[0], '2026-11-20'), { dia: '2026-11-20', valor: 50 });
});

test('aula experimental com o código do CPF', () => {
  const lista = /** @type {any} */ (adicionarExperimental([], { nome: 'Leo', hora: '07:00', cpf: 'abc123' }, { id: 'e1', em: 1, vagas: 1 })).lista;
  assert.equal(lista[0].cpf, 'abc123');
  assert.equal('tipo' in lista[0], false, 'sem tipo: aula experimental, como sempre');
});

test('avulsos do mês: só Day Pass pago e não cancelado, do mês', () => {
  const mapa = {
    '2026-11-03': [{ id: 'd1', nome: 'Vi', tipo: 'daypass', pagamento: { meio: 'pix-chave', valor: 50 }, status: 'presente' }, { id: 'e1', nome: 'Leo', status: 'presente' }],
    '2026-11-20': [{ id: 'd2', nome: 'Bia', tipo: 'daypass', pagamento: { meio: 'dinheiro', valor: 50 }, status: 'cancelada' }, { id: 'd3', nome: 'Zé', tipo: 'daypass', pagamento: { meio: 'cartao', valor: 50 }, status: 'confirmado' }],
    '2026-12-01': [{ id: 'd4', nome: 'Ana', tipo: 'daypass', pagamento: { meio: 'pix-chave', valor: 50 }, status: 'presente' }],
  };
  const r = avulsosDoMes(mapa, '2026-11');
  assert.deepEqual(r.itens.map((i) => i.nome), ['Vi', 'Zé']);
  assert.equal(r.total, 100);
});

test('devoluções do mês: pelo dia da devolução', () => {
  const fichas = [
    { id: 'A', nome: 'Ana', contratos: [{ devolucao: { valor: 288, data: '2027-02-05', meio: 'pix-chave' } }] },
    { id: 'B', nome: 'Bia', contratos: [{ saida: { devolucao: 100 } }] },
    { id: 'C', nome: 'Caio', contratos: [{ devolucao: { valor: 50, data: '2027-03-01', meio: 'dinheiro' } }] },
  ];
  const r = devolucoesDoMes(fichas, '2027-02');
  assert.deepEqual(r.itens, [{ alunoId: 'A', nome: 'Ana', valor: 288, data: '2027-02-05', meio: 'pix-chave' }]);
  assert.equal(r.total, 288);
});
