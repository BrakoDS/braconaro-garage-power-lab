import test from 'node:test';
import assert from 'node:assert/strict';
import { fundirPrecos, rotuloVerificado, estadoPrecos } from './precos.js';

const PRODUTOS = [
  { id: 'a', nome: 'Creatina Dux', preco: 48.9, url: 'https://meli.la/1' },
  { id: 'b', nome: 'Whey Max', preco: 129.9, url: 'https://meli.la/2' },
  { id: 'c', nome: 'Cinto', preco: 89, url: 'https://meli.la/3' },
];

const feedCom = (itens) => ({ atualizadoEm: 2000, rodada: { total: 3, lidos: 3, falhas: 0, travou: false }, itens });

test('o preço do feed vence o preço digitado no catálogo', () => {
  const r = fundirPrecos(PRODUTOS, feedCom({ a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 } }));
  assert.equal(r.find((p) => p.id === 'a').preco, 39.09);
  assert.equal(r.find((p) => p.id === 'a').verificadoEm, 2000);
});

test('produto sem entrada no feed mantém o preço do catálogo', () => {
  const r = fundirPrecos(PRODUTOS, feedCom({ a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 } }));
  const b = r.find((p) => p.id === 'b');
  assert.equal(b.preco, 129.9);
  assert.equal(b.verificadoEm, undefined, 'sem feed não pode fingir que foi verificado');
});

test('produto com leitura falhada some da vitrine', () => {
  const r = fundirPrecos(PRODUTOS, feedCom({
    a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: 500 },
  }));
  assert.equal(r.length, 2);
  assert.ok(!r.some((p) => p.id === 'a'), 'o produto que falhou não pode aparecer');
});

test('feed ausente ou corrompido devolve a lista original sem quebrar', () => {
  assert.equal(fundirPrecos(PRODUTOS, null).length, 3);
  assert.equal(fundirPrecos(PRODUTOS, {}).length, 3);
  assert.equal(fundirPrecos(PRODUTOS, { itens: 'lixo' }).length, 3);
  assert.equal(fundirPrecos(null, feedCom({})).length, 0);
});

test('o rótulo do card diz a idade do preço em português de gente', () => {
  const agora = new Date('2026-08-25T10:00:00').getTime();
  assert.equal(rotuloVerificado(new Date('2026-08-25T05:03:00').getTime(), agora), 'verificado hoje');
  assert.equal(rotuloVerificado(new Date('2026-08-24T05:03:00').getTime(), agora), 'verificado ontem');
  assert.equal(rotuloVerificado(new Date('2026-08-20T05:03:00').getTime(), agora), 'verificado em 20/ago');
  assert.equal(rotuloVerificado(null, agora), '');
});

test('a faixa da gestão distingue os três estados', () => {
  assert.equal(estadoPrecos(null, PRODUTOS).tipo, 'nunca');

  const bom = estadoPrecos(feedCom({
    a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 },
  }), PRODUTOS);
  assert.equal(bom.tipo, 'ok');

  const comFalha = estadoPrecos({
    atualizadoEm: 2000,
    rodada: { total: 3, lidos: 2, falhas: 1, travou: false },
    itens: { a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: 500 } },
  }, PRODUTOS);
  assert.equal(comFalha.tipo, 'falhas');
  assert.ok(comFalha.texto.includes('Creatina Dux'), 'a faixa precisa NOMEAR o produto fora do ar');

  // `estadoPrecos` usa `travadaEm` (não `atualizadoEm`) para datar a trava: o
  // ramo travado do backend deliberadamente não escreve `atualizadoEm`, para não
  // mentir dizendo que os preços são de hoje (ver `functions/src/index.ts`).
  const travada = estadoPrecos({
    travadaEm: 2000,
    rodada: { total: 22, lidos: 3, falhas: 19, travou: true },
    itens: {},
  }, PRODUTOS);
  assert.equal(travada.tipo, 'travou');
  assert.ok(travada.texto.includes('19'), 'e quantos falharam quando a trava dispara');
});

test('a faixa da gestão fala português certo quando o carimbo é de vários dias atrás', () => {
  // Regressão: quando o carimbo não é "hoje" nem "ontem", `rotuloVerificado`
  // devolve "verificado em D/mmm" — e o ramo de falhas colava isso direto
  // depois de "desde", resultando em "desde em D/mmm". Usamos dias relativos a
  // `Date.now()` (a mesma âncora que `estadoPrecos` usa por baixo) para o teste
  // não depender de uma data fixa e não quebrar quando o ano virar.
  const seiDiasAtras = new Date();
  seiDiasAtras.setDate(seiDiasAtras.getDate() - 6);
  const ts = seiDiasAtras.getTime();
  const rotulo = rotuloVerificado(ts); // "verificado em D/mmm", mesma função usada por estadoPrecos
  const dataComEm = rotulo.replace('verificado ', ''); // "em D/mmm"
  const dataSemEm = dataComEm.replace(/^em /, ''); // "D/mmm" — forma correta depois de "desde"

  const ok = estadoPrecos({
    atualizadoEm: ts,
    rodada: { total: 3, lidos: 3, falhas: 0, travou: false },
    itens: {},
  }, PRODUTOS);
  assert.equal(ok.texto, `Preços verificados ${dataComEm} · 3 de 3`);

  const comFalha = estadoPrecos({
    atualizadoEm: ts,
    rodada: { total: 3, lidos: 2, falhas: 1, travou: false },
    itens: { a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: ts } },
  }, PRODUTOS);
  assert.equal(comFalha.texto, `1 produto fora da vitrine desde ${dataSemEm}: Creatina Dux.`);

  const duasFalhas = estadoPrecos({
    atualizadoEm: ts,
    rodada: { total: 3, lidos: 1, falhas: 2, travou: false },
    itens: {
      a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: ts },
      b: { estado: 'falhou', motivo: 'http', preco: 129.9, verificadoEm: ts },
    },
  }, PRODUTOS);
  assert.match(duasFalhas.texto, /^2 produtos fora da vitrine desde /, 'plural correto com mais de uma falha');

  const travada = estadoPrecos({
    travadaEm: ts,
    rodada: { total: 22, lidos: 3, falhas: 19, travou: true },
    itens: {},
  }, PRODUTOS);
  assert.equal(
    travada.texto,
    `A leitura falhou em 19 de 22 ${dataComEm}. Nada foi alterado — os preços continuam os da última rodada boa. Provável mudança no site do Mercado Livre.`,
  );
});
