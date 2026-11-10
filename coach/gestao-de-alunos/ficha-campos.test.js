// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ficha-campos.test.js
 *
 * A ficha gravada por campo: o que muda é o que sobe, o mapa desce até a
 * chave, a presença é conjunto, e a gravação por cima da nuvem não leva o que
 * o servidor gravou nos outros campos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diferencasDaFicha, juntarEntrada, sobrepor, converterLegada, escritasDaAtualizacao, aplicarEscritas,
  mesclarInteira, aplicarConjunto, valorEm, colocar, ehLegada, soDoBox,
} from './ficha-campos.js?v=32';

test('diferença: campo comum inteiro, mapa até a chave, carimbo do servidor de fora', () => {
  const antes = { nome: 'Ana', consumos: [{ id: 'c1' }], pagamentos: { '2026-10': true }, atualizadoEm: 1, anamnese: { sono: { h: 7 } } };
  const depois = { nome: 'Ana B', consumos: [{ id: 'c1' }, { id: 'c2' }], pagamentos: { '2026-10': true, '2026-11': true }, atualizadoEm: 2, anamnese: { sono: { h: 8 } } };
  assert.deepEqual(diferencasDaFicha(antes, depois).campos, [
    ['anamnese', 'sono'], // desce só até a chave: o resto do mapa de dentro vai junto
    ['consumos'], ['nome'], ['pagamentos', '2026-11'],
  ]);
});

test('diferença: campo que sumiu, mapa que virou null e lista de presenças como conjunto', () => {
  const d = diferencasDaFicha(
    { obs: 'x', pagoPor: { id: '002' }, presencas: ['2026-11-01', '2026-11-03'] },
    { pagoPor: null, presencas: ['2026-11-03', '2026-11-04'] },
  );
  assert.deepEqual(d.campos, [['obs'], ['pagoPor']]);
  assert.deepEqual(d.conjuntos, { presencas: { mais: ['2026-11-04'], menos: ['2026-11-01'] } });
});

test('juntar: duas edições somam os campos; "entrou" e depois "saiu" se anulam', () => {
  let e = juntarEntrada(undefined, { campos: [['telefone']], conjuntos: { presencas: { mais: ['d1'], menos: [] } } });
  e = juntarEntrada(e, { campos: [['telefone'], ['obs']], conjuntos: { presencas: { mais: [], menos: ['d1'] } } });
  assert.deepEqual(e, { op: 'set', campos: [['telefone'], ['obs']], conjuntos: { presencas: { mais: [], menos: ['d1'] } } });
  assert.deepEqual(juntarEntrada({ op: 'delete' }, { campos: [['x']] }), { op: 'set', inteira: true }, 'recriada sobe inteira');
  assert.deepEqual(juntarEntrada({ op: 'set', inteira: true }, { campos: [['x']] }), { op: 'set', inteira: true });
  assert.deepEqual(juntarEntrada({ op: 'set' }, { campos: [['x']] }), { op: 'set' }, 'entrada antiga segue antiga até a conversão');
  assert.ok(ehLegada({ op: 'set' }) && !ehLegada({ op: 'set', campos: [] }) && !ehLegada({ op: 'set', inteira: true }));
});

test('escritas por cima da nuvem: só o que mudou aqui; o conjunto soma sobre o que está lá', () => {
  const nuvem = { nome: 'Ana', pagamentos: { '2026-10': true, '2026-11': true }, presencas: ['2026-11-05'] };
  const local = { nome: 'Ana B', pagamentos: { '2026-10': true, '2026-09': true }, presencas: ['2026-11-04'] };
  const esc = escritasDaAtualizacao(nuvem, local, { campos: [['nome'], ['pagamentos', '2026-09']], conjuntos: { presencas: { mais: ['2026-11-04'], menos: [] } } });
  const r = aplicarEscritas(nuvem, esc);
  assert.deepEqual(r, {
    nome: 'Ana B',
    pagamentos: { '2026-10': true, '2026-11': true, '2026-09': true }, // o 2026-11 do servidor ficou
    presencas: ['2026-11-04', '2026-11-05'],
  });
});

test('escritas: pai que não é mapa na nuvem sobe inteiro; o de cima cobre os de baixo', () => {
  const nuvem = { horarios: null, atestados: { a: 1 } };
  const local = { horarios: { seg: '19:10' }, atestados: { b: 2 } };
  assert.deepEqual(escritasDaAtualizacao(nuvem, local, { campos: [['horarios', 'seg']] }), [{ caminho: ['horarios'], valor: { seg: '19:10' } }]);
  const esc = escritasDaAtualizacao(nuvem, local, { campos: [['atestados'], ['atestados', 'b']] });
  assert.deepEqual(esc, [{ caminho: ['atestados'], valor: { b: 2 } }], 'o Firestore recusa "atestados" e "atestados.b" juntos');
  assert.deepEqual(escritasDaAtualizacao({}, { obs: undefined }, { campos: [['obs']] }), [{ caminho: ['obs'], apagar: true }]);
});

test('sobrepor: a ficha da nuvem com o pendente daqui por cima', () => {
  const r = sobrepor(
    { nome: 'nuvem', pagamentos: { m1: true, m2: true }, presencas: ['d2'] },
    { nome: 'local', pagamentos: { m1: true }, presencas: ['d1'] },
    { op: 'set', campos: [['nome'], ['pagamentos', 'm3']], conjuntos: { presencas: { mais: ['d1'], menos: ['d2'] } } },
  );
  assert.deepEqual(r, { nome: 'local', pagamentos: { m1: true, m2: true }, presencas: ['d1'] });
});

test('fila antiga: o do coach sobe inteiro, o do servidor só soma', () => {
  const e = converterLegada(
    { telefone: 'novo', pagamentos: { m9: true }, faltas: { d1: { tipo: 'x' } }, presencas: ['d1'] },
    { telefone: 'velho', pagamentos: { m10: true }, presencas: ['d2'] },
  );
  assert.deepEqual(e.campos, [['faltas'], ['pagamentos', 'm9'], ['telefone']], 'faltas: a nuvem não tem o campo — entra inteiro');
  assert.deepEqual(e.conjuntos, { presencas: { mais: ['d1'], menos: [] } });
});

test('inteira por cima de uma que existe: mapas mesclam, conjunto soma', () => {
  assert.deepEqual(
    mesclarInteira({ pagamentos: { m1: true }, presencas: ['d2'], nome: 'a' }, { pagamentos: { m2: true }, presencas: ['d1'], nome: 'b' }),
    { pagamentos: { m1: true, m2: true }, presencas: ['d1', 'd2'], nome: 'b' },
  );
});

test('utilitários: valorEm, colocar, conjunto e soDoBox', () => {
  assert.deepEqual(valorEm({ a: { b: 1 } }, ['a', 'b']), { valor: 1 });
  assert.deepEqual(valorEm({ a: 'x' }, ['a', 'b']), { apagar: true });
  const o = { a: 'texto' };
  colocar(o, ['a', 'b'], { valor: 1 });
  assert.deepEqual(o, { a: { b: 1 } });
  colocar(o, ['a', 'b'], { apagar: true });
  assert.deepEqual(o, { a: {} });
  assert.deepEqual(aplicarConjunto(['b', 'a'], { mais: ['c', 'a'], menos: ['b'] }), ['a', 'c']);
  assert.deepEqual(soDoBox({ id: '1', emailNorm: 'x', atualizadoEm: 2, nome: 'A' }), { id: '1', nome: 'A' });
});
