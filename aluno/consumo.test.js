// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesIdDoConsumo, mesIdParaLancar, consumosDoMes, totalConsumos, faturaDoMes,
  parteCoberta, faturaPropria, faturaComDependentes, descontoParceria, PERCENTUAIS_PARCERIA } from './consumo.js';

const c = (data, mesId, preco, nome = 'Energético') => ({ id: data + nome, nome, preco, data, mesId });

/* ---------- O corte é o dia do vencimento ---------- */

test('até o dia do vencimento, o consumo entra na fatura do próprio mês', () => {
  assert.equal(mesIdDoConsumo('2026-09-01', 10), '2026-09');
  assert.equal(mesIdDoConsumo('2026-09-09', 10), '2026-09');
});

test('no PRÓPRIO dia do vencimento ainda entra na fatura daquele mês', () => {
  assert.equal(mesIdDoConsumo('2026-09-10', 10), '2026-09');
});

test('depois do vencimento já soma na fatura seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-09-11', 10), '2026-10');
  assert.equal(mesIdDoConsumo('2026-08-25', 10), '2026-09');
  assert.equal(mesIdDoConsumo('2026-08-31', 10), '2026-09');
});

test('o exemplo do box: 25/08 e 31/08 caem juntos na fatura de setembro', () => {
  assert.equal(mesIdDoConsumo('2026-08-25', 10), '2026-09');
  assert.equal(mesIdDoConsumo('2026-08-31', 10), '2026-09');
});

test('dezembro vira janeiro do ano seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-12-20', 10), '2027-01');
});

test('vencimento no dia 31 não quebra em fevereiro — vale o último dia do mês', () => {
  // Fevereiro de 2026 tem 28 dias: o corte é 28, e o dia 28 ainda entra.
  assert.equal(mesIdDoConsumo('2026-02-28', 31), '2026-02');
  assert.equal(mesIdDoConsumo('2026-02-27', 31), '2026-02');
});

test('vencimento no dia 1: só o dia 1 fica no mês, o resto vai pro seguinte', () => {
  assert.equal(mesIdDoConsumo('2026-09-01', 1), '2026-09');
  assert.equal(mesIdDoConsumo('2026-09-02', 1), '2026-10');
});

/* ---------- Fatura já paga: o consumo pula para a seguinte ---------- */

test('sem nada pago, lança na fatura que a data manda', () => {
  assert.equal(mesIdParaLancar('2026-08-25', 10, {}), '2026-09');
});

test('quem já pagou setembro no dia 5 vê a compra do dia 8 em outubro', () => {
  // Sem isto, a compra entraria numa conta que o aluno já fechou.
  assert.equal(mesIdParaLancar('2026-09-08', 10, { '2026-09': true }), '2026-10');
});

test('pula quantas faturas pagas houver seguidas', () => {
  assert.equal(mesIdParaLancar('2026-09-08', 10, { '2026-09': true, '2026-10': true }), '2026-11');
});

test('fatura paga mais adiante não interfere na atual', () => {
  assert.equal(mesIdParaLancar('2026-09-08', 10, { '2026-11': true }), '2026-09');
});

/* ---------- Leitura da fatura ---------- */

test('os consumos saem na ordem em que foram comprados', () => {
  const lista = [c('2026-08-31', '2026-09', 3, 'Dose'), c('2026-08-25', '2026-09', 10)];
  assert.deepEqual(consumosDoMes(lista, '2026-09').map((x) => x.data), ['2026-08-25', '2026-08-31']);
});

test('consumo de outra fatura não entra na conta', () => {
  const lista = [c('2026-08-25', '2026-09', 10), c('2026-09-20', '2026-10', 3, 'Dose')];
  assert.equal(totalConsumos(lista, '2026-09'), 10);
  assert.equal(totalConsumos(lista, '2026-10'), 3);
});

test('sem consumo nenhum a conta é só a mensalidade', () => {
  assert.equal(totalConsumos(undefined, '2026-09'), 0);
  const f = faturaDoMes({ mensalidade: '150' }, '2026-09');
  assert.equal(f.total, 150);
  assert.equal(f.mensalidade, 150);
  assert.equal(f.desconto, 0);
  assert.equal(f.parceria, null);
  assert.deepEqual(f.consumos, []);
});

test('a fatura soma mensalidade e consumíveis', () => {
  const aluno = { mensalidade: '150', consumos: [c('2026-08-25', '2026-09', 10), c('2026-08-31', '2026-09', 3, 'Dose')] };
  const f = faturaDoMes(aluno, '2026-09');
  assert.equal(f.mensalidade, 150);
  assert.equal(f.extras, 13);
  assert.equal(f.total, 163);
  assert.equal(f.consumos.length, 2);
});

test('meia dose entra com centavos e a soma fecha certo', () => {
  const aluno = { mensalidade: '150', consumos: [c('2026-09-02', '2026-09', 1.5, '1/2 Dose'), c('2026-09-03', '2026-09', 1.5, '1/2 Dose')] };
  assert.equal(faturaDoMes(aluno, '2026-09').total, 153);
});

test('mensalidade com vírgula é lida como número', () => {
  assert.equal(faturaDoMes({ mensalidade: '150,50' }, '2026-09').total, 150.5);
});

test('aluno sem mensalidade cadastrada ainda soma os consumíveis', () => {
  const aluno = { consumos: [c('2026-09-02', '2026-09', 10)] };
  assert.equal(faturaDoMes(aluno, '2026-09').total, 10);
});

/* ---------- Quem paga a conta de quem ---------- */

const MATHEUS = (escopo) => ({
  nome: 'Matheus', mensalidade: '150',
  consumos: [c('2026-09-02', '2026-09', 10), c('2026-09-03', '2026-09', 3, 'Dose')],
  ...(escopo ? { pagoPor: { id: 'andre', escopo } } : {}),
});

test('sem responsável, a conta inteira é do próprio aluno', () => {
  assert.equal(faturaPropria(MATHEUS(), '2026-09').total, 163);
  assert.equal(parteCoberta(MATHEUS(), '2026-09').total, 0);
});

test('escopo "tudo": o responsável assume mensalidade e consumíveis', () => {
  assert.equal(parteCoberta(MATHEUS('tudo'), '2026-09').total, 163);
  assert.equal(faturaPropria(MATHEUS('tudo'), '2026-09').total, 0, 'o dependente não deve nada');
});

test('escopo "plano": o responsável assume só a mensalidade', () => {
  const coberta = parteCoberta(MATHEUS('plano'), '2026-09');
  assert.equal(coberta.mensalidade, 150);
  assert.equal(coberta.extras, 0);
  assert.equal(coberta.total, 150);
  const propria = faturaPropria(MATHEUS('plano'), '2026-09');
  assert.equal(propria.mensalidade, 0);
  assert.equal(propria.total, 13, 'o que ele consumiu continua sendo dele');
  assert.equal(propria.consumos.length, 2, 'e ele vê o que consumiu na notinha');
});

test('as duas metades sempre fecham a conta cheia', () => {
  for (const escopo of ['tudo', 'plano', undefined]) {
    const m = MATHEUS(escopo);
    assert.equal(parteCoberta(m, '2026-09').total + faturaPropria(m, '2026-09').total,
      faturaDoMes(m, '2026-09').total, `escopo ${escopo}`);
  }
});

test('a conta do André soma a dele e a do filho', () => {
  const andre = { nome: 'André', mensalidade: '150', consumos: [c('2026-09-01', '2026-09', 10)] };
  const f = faturaComDependentes(andre, '2026-09', [MATHEUS('tudo')]);
  assert.equal(f.propria.total, 160);
  assert.equal(f.dependentes.length, 1);
  assert.equal(f.dependentes[0].nome, 'Matheus');
  assert.equal(f.dependentes[0].total, 163);
  assert.equal(f.total, 323);
});

test('com escopo "plano", o André só leva a mensalidade do filho', () => {
  const andre = { nome: 'André', mensalidade: '150' };
  const f = faturaComDependentes(andre, '2026-09', [MATHEUS('plano')]);
  assert.equal(f.dependentes[0].total, 150);
  assert.equal(f.total, 300);
});

test('dois dependentes somam os dois', () => {
  const andre = { nome: 'André', mensalidade: '150' };
  const outro = { nome: 'Ana', mensalidade: '171', pagoPor: { id: 'andre', escopo: 'tudo' } };
  const f = faturaComDependentes(andre, '2026-09', [MATHEUS('tudo'), outro]);
  assert.deepEqual(f.dependentes.map((d) => d.nome), ['Matheus', 'Ana']);
  assert.equal(f.total, 150 + 163 + 171);
});

test('dependente sem nada a cobrar naquele mês não polui a notinha', () => {
  const andre = { nome: 'André', mensalidade: '150' };
  const semNada = { nome: 'Zé', mensalidade: '', consumos: [], pagoPor: { id: 'andre', escopo: 'tudo' } };
  const f = faturaComDependentes(andre, '2026-09', [semNada]);
  assert.equal(f.dependentes.length, 0);
  assert.equal(f.total, 150);
});

test('no Portal o dependente chega com o escopo solto, sem a ficha inteira', () => {
  // A fatia publicada do responsável carrega {nome, escopo, mensalidade, consumos}.
  const andre = { nome: 'André', mensalidade: '150' };
  const fatia = { nome: 'Matheus', escopo: 'plano', mensalidade: '150', consumos: [c('2026-09-02', '2026-09', 10)] };
  const f = faturaComDependentes(andre, '2026-09', [fatia]);
  assert.equal(f.dependentes[0].total, 150);
  assert.equal(f.total, 300);
});

/* ---------- Parcerias: desconto registrado, não valor apagado ---------- */

const COM_PARCERIA = (percentual, mensalidade = '150') => ({
  nome: 'Parceiro', mensalidade,
  parceria: percentual ? { nome: 'Clínica X', percentual } : null,
});

test('os percentuais oferecidos são 10, 25, 50 e 100', () => {
  assert.deepEqual(PERCENTUAIS_PARCERIA, [10, 25, 50, 100]);
});

test('sem parceria não há desconto nenhum', () => {
  assert.equal(descontoParceria(COM_PARCERIA(0)), null);
  assert.equal(faturaDoMes(COM_PARCERIA(0), '2026-09').desconto, 0);
});

test('cada percentual tira a fatia certa de R$ 150', () => {
  const esperado = { 10: 15, 25: 37.5, 50: 75, 100: 150 };
  for (const pct of PERCENTUAIS_PARCERIA) {
    const f = faturaDoMes(COM_PARCERIA(pct), '2026-09');
    assert.equal(f.desconto, esperado[pct], `${pct}%`);
    assert.equal(f.mensalidade, 150 - esperado[pct], `${pct}% — o que ele paga`);
    assert.equal(f.mensalidadeCheia, 150, 'a mensalidade cheia continua registrada');
  }
});

test('100% é cortesia: ele não paga nada e o box registra os R$ 150', () => {
  const f = faturaDoMes(COM_PARCERIA(100), '2026-09');
  assert.equal(f.total, 0);
  assert.equal(f.desconto, 150);
  assert.equal(f.parceria.nome, 'Clínica X');
});

test('a conta sempre fecha: cheia = o que ele paga + o que o box banca', () => {
  // Ao CENTAVO: as duas metades são exatas, mas somá-las em ponto flutuante
  // devolve 99,899999… — é o formato do dinheiro que manda, não o do double.
  const aoCentavo = (v) => Math.round(v * 100) / 100;
  for (const pct of [0, ...PERCENTUAIS_PARCERIA]) {
    for (const valor of ['150', '171', '99,90', '210,50']) {
      const f = faturaDoMes(COM_PARCERIA(pct, valor), '2026-09');
      assert.equal(aoCentavo(f.mensalidade + f.desconto), f.mensalidadeCheia, `${pct}% de ${valor}`);
    }
  }
});

test('centavos não escapam: 25% de R$ 171 é R$ 42,75 exatos', () => {
  const f = faturaDoMes(COM_PARCERIA(25, '171'), '2026-09');
  assert.equal(f.desconto, 42.75);
  assert.equal(f.mensalidade, 128.25);
});

test('o desconto vale só sobre o plano — consumível não entra na parceria', () => {
  const aluno = { ...COM_PARCERIA(50), consumos: [c('2026-09-02', '2026-09', 10)] };
  const f = faturaDoMes(aluno, '2026-09');
  assert.equal(f.desconto, 75, 'o desconto não cresce por causa do energético');
  assert.equal(f.extras, 10, 'o energético é cobrado cheio');
  assert.equal(f.total, 85);
});

test('mesmo com 100% de parceria, o que ele consome ele paga', () => {
  const aluno = { ...COM_PARCERIA(100), consumos: [c('2026-09-02', '2026-09', 3, 'Dose')] };
  const f = faturaDoMes(aluno, '2026-09');
  assert.equal(f.total, 3);
});

test('mudar o preço do plano recalcula o investimento sozinho', () => {
  assert.equal(faturaDoMes(COM_PARCERIA(50, '150'), '2026-09').desconto, 75);
  assert.equal(faturaDoMes(COM_PARCERIA(50, '200'), '2026-09').desconto, 100);
});

test('quem paga por outro paga o valor JÁ com a parceria do outro', () => {
  const filho = { ...COM_PARCERIA(50), nome: 'Filho', pagoPor: { id: 'pai', escopo: 'tudo' } };
  const pai = { nome: 'Pai', mensalidade: '150' };
  const f = faturaComDependentes(pai, '2026-09', [filho]);
  assert.equal(f.dependentes[0].total, 75, 'o desconto do filho não pode virar cobrança do pai');
  assert.equal(f.total, 225);
});

test('com parceria, as duas metades do vínculo continuam fechando', () => {
  const filho = { ...COM_PARCERIA(25), pagoPor: { id: 'pai', escopo: 'plano' },
    consumos: [c('2026-09-02', '2026-09', 10)] };
  assert.equal(parteCoberta(filho, '2026-09').total + faturaPropria(filho, '2026-09').total,
    faturaDoMes(filho, '2026-09').total);
  assert.equal(parteCoberta(filho, '2026-09').total, 112.5, 'o pai paga a mensalidade com desconto');
  assert.equal(faturaPropria(filho, '2026-09').total, 10, 'o energético continua sendo do filho');
});
