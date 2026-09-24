// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/portal-merge.test.js
 *
 * Cobre a união das presenças que o Garage App avisa pela caixa de entrada. É a
 * única parte do merge que mexe no REGISTRO DO COACH sem ele ter clicado em
 * nada, então a regra precisa ser à prova de caixa malformada: quem escreve a
 * caixa é o aparelho do aluno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { camposDesconhecidos, casarCaixasComFichas, mesclarPresencas } from './portal-merge.js';

test('acrescenta o dia novo mantendo os que já existiam, em ordem', () => {
  assert.deepEqual(
    mesclarPresencas(['2026-09-14', '2026-09-18'], ['2026-09-16']),
    ['2026-09-14', '2026-09-16', '2026-09-18'],
  );
});

test('dia que o coach já marcou não é novidade', () => {
  assert.equal(mesclarPresencas(['2026-09-16'], ['2026-09-16']), null);
});

test('o mesmo dia repetido na caixa entra uma vez só', () => {
  assert.deepEqual(mesclarPresencas([], ['2026-09-16', '2026-09-16']), ['2026-09-16']);
});

test('caixa vazia ou sem o campo não mexe na ficha', () => {
  assert.equal(mesclarPresencas(['2026-09-16'], []), null);
  assert.equal(mesclarPresencas(['2026-09-16'], undefined), null);
  assert.equal(mesclarPresencas(['2026-09-16'], 'nao-e-lista'), null);
});

test('ficha sem presenças ainda aceita a primeira', () => {
  assert.deepEqual(mesclarPresencas(undefined, ['2026-09-16']), ['2026-09-16']);
});

test('lixo na caixa é descartado, e o que presta continua entrando', () => {
  assert.deepEqual(
    mesclarPresencas([], ['2026-09-16', '16/09/2026', '', null, 42, '2026-9-1']),
    ['2026-09-16'],
  );
});

test('caixa só com lixo não vira gravação', () => {
  assert.equal(mesclarPresencas(['2026-09-14'], ['ontem', {}]), null);
});

test('a ficha nunca perde um dia que já tinha', () => {
  const antes = ['2026-09-01', '2026-09-02', '2026-09-03'];
  const depois = mesclarPresencas(antes, ['2026-09-10']);
  assert.ok(depois);
  antes.forEach((d) => assert.ok(depois.includes(d), `sumiu ${d}`));
});

/**
 * A caixa só pode ser apagada por inteiro quando não sobra nada dentro.
 *
 * Esta regra nasceu de um prejuízo: a versão publicada apagava o documento
 * sempre, então quando o app começou a mandar `presencas` a Gestão antiga leu a
 * caixa, ignorou o campo e destruiu o dado — em silêncio, a cada tentativa.
 */
test('caixa só com campos conhecidos pode ser apagada inteira', () => {
  assert.deepEqual(camposDesconhecidos({ fotoNova: 'x', feedbacks: [], atualizadoEm: 1 }), []);
  assert.deepEqual(camposDesconhecidos({ presencas: ['2026-09-16'] }), []);
  assert.deepEqual(camposDesconhecidos({}), []);
});

test('campo que esta versão não entende sobrevive à limpeza', () => {
  assert.deepEqual(
    camposDesconhecidos({ feedbacks: [], medidasNovas: { peso: 80 } }),
    ['medidasNovas'],
  );
});

test('caixa ausente ou malformada não inventa campo para preservar', () => {
  assert.deepEqual(camposDesconhecidos(null), []);
  assert.deepEqual(camposDesconhecidos(undefined), []);
  assert.deepEqual(camposDesconhecidos('lixo'), []);
});

/**
 * O pareamento caixa ↔ ficha.
 *
 * Aqui estava o defeito que custou várias rodadas de teste: o merge partia da
 * FICHA para adivinhar o id da caixa, então caixa cujo e-mail nenhuma ficha
 * tivesse era invisível — e, pior, quando havia ficha a caixa era apagada mesmo
 * sem nada ser aplicado, destruindo a evidência a cada tentativa.
 */
test('caixa com ficha correspondente vira par', () => {
  const r = casarCaixasComFichas(['ana@x.com'], [{ id: '001', email: 'ana@x.com' }]);
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].aluno.id, '001');
  assert.deepEqual(r.orfas, []);
});

test('caixa sem ficha nenhuma sai como orfa, e NAO se perde', () => {
  const r = casarCaixasComFichas(['fantasma@x.com'], [{ id: '001', email: 'ana@x.com' }]);
  assert.deepEqual(r.pares, []);
  assert.deepEqual(r.orfas, ['fantasma@x.com']);
});

test('maiuscula e espaco nao impedem o casamento, dos dois lados', () => {
  const r = casarCaixasComFichas(['Ana@X.com'], [{ id: '001', email: '  ANA@x.com ' }]);
  assert.equal(r.pares.length, 1, 'deveria casar ignorando caixa e espaco');
  assert.deepEqual(r.orfas, []);
});

test('ficha sem e-mail nao captura caixa nenhuma', () => {
  const r = casarCaixasComFichas(['ana@x.com'], [{ id: '001' }, { id: '002', email: '' }]);
  assert.deepEqual(r.orfas, ['ana@x.com']);
});

test('lista vazia dos dois lados nao quebra', () => {
  assert.deepEqual(casarCaixasComFichas([], []), { pares: [], orfas: [] });
  assert.deepEqual(casarCaixasComFichas(undefined, undefined), { pares: [], orfas: [] });
});

test('varias caixas sao separadas corretamente entre pares e orfas', () => {
  const r = casarCaixasComFichas(
    ['ana@x.com', 'sem-ficha@x.com', 'bruno@x.com'],
    [{ id: '001', email: 'ana@x.com' }, { id: '002', email: 'bruno@x.com' }],
  );
  assert.deepEqual(r.pares.map((p) => p.key), ['ana@x.com', 'bruno@x.com']);
  assert.deepEqual(r.orfas, ['sem-ficha@x.com']);
});
