// @ts-check
/**
 * Testes dos feriados.
 * Rodar: node --test compartilhado/regras/feriados.test.js
 *
 * As datas de Páscoa abaixo foram conferidas contra o calendário litúrgico, e as
 * móveis derivam delas. É o tipo de coisa que ninguém percebe estar errada até o
 * coach abrir o mês e o Carnaval estar na semana errada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pascoa, feriadosDoAno, feriadoEm, feriadosDoMes } from './feriados.js';

const isoDe = (d) => d.toISOString().slice(0, 10);

test('a Páscoa cai onde o calendário diz', () => {
  const esperado = {
    2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
    2027: '2027-03-28', 2028: '2028-04-16', 2030: '2030-04-21',
  };
  for (const [ano, data] of Object.entries(esperado)) {
    assert.equal(isoDe(pascoa(Number(ano))), data, `Páscoa de ${ano}`);
  }
});

test('as datas móveis derivam da Páscoa, e não de uma lista digitada à mão', () => {
  // 2026: Páscoa em 05/04 → Carnaval 16-17/02, Cinzas 18/02, Sexta Santa 03/04,
  // Corpus Christi 04/06.
  const f = feriadosDoAno(2026);
  const por = (nome) => f.find((x) => x.nome.startsWith(nome))?.data;
  assert.equal(por('Carnaval (segunda)'), '2026-02-16');
  assert.equal(por('Carnaval (terça)'), '2026-02-17');
  assert.equal(por('Quarta-feira de Cinzas'), '2026-02-18');
  assert.equal(por('Sexta-feira Santa'), '2026-04-03');
  assert.equal(por('Corpus Christi'), '2026-06-04');
});

test('os fixos nacionais estão todos lá', () => {
  const f = feriadosDoAno(2026).filter((x) => x.tipo === 'nacional').map((x) => x.data);
  for (const d of ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07',
    '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25']) {
    assert.ok(f.includes(d), `faltou o nacional ${d}`);
  }
});

test('9 de julho é estadual — é o feriado de São Paulo', () => {
  const f = feriadoEm('2026-07-09');
  assert.equal(f?.tipo, 'estadual');
  assert.match(f?.nome || '', /Constitucionalista/);
});

test('os dois municipais de Agudos: o padroeiro e o aniversário', () => {
  const padroeiro = feriadoEm('2026-01-25');
  const aniversario = feriadoEm('2026-07-27');
  assert.equal(padroeiro?.tipo, 'municipal');
  assert.match(padroeiro?.nome || '', /São Paulo Apóstolo/);
  assert.equal(aniversario?.tipo, 'municipal');
  assert.match(aniversario?.nome || '', /Agudos/);
});

test('o aniversário de Agudos é em JULHO, não em fevereiro', () => {
  // 20/02/1899 foi a instalação da câmara; a emancipação é a Lei 543, de
  // 27/07/1898. Listas de feriado na internet erram isso com frequência, e este
  // teste existe para que a correção não seja desfeita por uma delas.
  assert.equal(feriadoEm('2026-02-20'), null, 'fevereiro não é feriado em Agudos');
  assert.ok(feriadoEm('2026-07-27'), 'julho é');
});

test('Carnaval e Corpus Christi são FACULTATIVOS, não feriado', () => {
  // O sistema não pode afirmar lei que não existe. Quem decide se o box abriu
  // é o coach, no botão do calendário.
  assert.equal(feriadoEm('2026-02-17')?.tipo, 'facultativo');
  assert.equal(feriadoEm('2026-06-04')?.tipo, 'facultativo');
});

test('20 de novembro é nacional (Lei 14.759/2023), inclusive nos anos seguintes', () => {
  for (const ano of [2024, 2025, 2026, 2030]) {
    assert.equal(feriadoEm(`${ano}-11-20`)?.tipo, 'nacional', `Consciência Negra em ${ano}`);
  }
});

test('dia comum devolve null', () => {
  assert.equal(feriadoEm('2026-03-11'), null);
  assert.equal(feriadoEm('2026-08-13'), null);
});

test('entrada torta não quebra', () => {
  for (const v of [null, undefined, '', 'abc', '2026', 42, {}]) {
    assert.equal(feriadoEm(/** @type {any} */ (v)), null, `entrada ${JSON.stringify(v)}`);
  }
});

test('feriadosDoMes devolve só o mês pedido, e ordenado', () => {
  const jul = feriadosDoMes(2026, 7);
  assert.deepEqual(jul.map((f) => f.data), ['2026-07-09', '2026-07-27']);
  assert.equal(feriadosDoMes(2026, 3).length, 0, 'março de 2026 não tem feriado');
});

test('a lista sai ordenada por data', () => {
  const f = feriadosDoAno(2026).map((x) => x.data);
  assert.deepEqual(f, [...f].sort(), 'fora de ordem');
});

test('nenhum ano fica sem os móveis — varre uma década', () => {
  for (let ano = 2024; ano <= 2034; ano += 1) {
    const f = feriadosDoAno(ano);
    for (const nome of ['Carnaval (terça)', 'Sexta-feira Santa', 'Corpus Christi']) {
      assert.ok(f.some((x) => x.nome === nome), `${nome} faltou em ${ano}`);
    }
    // Sexta-feira Santa é sempre sexta; Carnaval, sempre terça. Se o cálculo
    // escorregar um dia, isto acusa.
    const sexta = f.find((x) => x.nome === 'Sexta-feira Santa');
    const terca = f.find((x) => x.nome === 'Carnaval (terça)');
    assert.equal(new Date(sexta.data + 'T12:00:00Z').getUTCDay(), 5, `Sexta Santa de ${ano} não caiu numa sexta`);
    assert.equal(new Date(terca.data + 'T12:00:00Z').getUTCDay(), 2, `Carnaval de ${ano} não caiu numa terça`);
  }
});
