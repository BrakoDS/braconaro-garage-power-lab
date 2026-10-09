// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/db-cache.test.js
 *
 * O cache v2: o consumidor vê o aluno de sempre, a fila só recebe o documento
 * que mudou, e a mescla com a nuvem não engole edição local pendente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCache, mesclar, estadoDeBlobV1, CHAVE, CHAVE_V1, CHAVE_FILA } from './db-cache.js?v=13';

function armazenamento(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m };
}

const blob = () => ({
  seq: 2,
  produtos: [{ id: 'energetico', nome: 'Energético', preco: 10 }],
  alunos: [
    {
      id: '001', nome: 'Ana', email: ' Ana@Box.com ', criadoEm: 1,
      avaliacoes: [{ num: 1, peso: 70 }, { num: 2, peso: 69 }],
      feedbacks: [{ id: 'f2', criadoEm: 20 }, { id: 'f1', criadoEm: 10 }],
    },
    { id: '002', nome: 'Bia', criadoEm: 2, avaliacoes: [] },
  ],
});

const comV1 = () => {
  const s = armazenamento({ [CHAVE_V1]: JSON.stringify(blob()) });
  return { s, c: criarCache({ storage: s }) };
};
const fila = (c) => Object.fromEntries(Object.entries(c.fila()).map(([k, v]) => [k, v.op]));

test('primeira abertura: converte o blob v1, sem pôr nada na fila (a nuvem já tem)', () => {
  const { s, c } = comV1();
  assert.equal(c.todos().length, 2);
  assert.ok(s.m.has(CHAVE), 'o v2 passou a existir');
  assert.deepEqual(c.fila(), {});
  assert.equal(JSON.parse(s.m.get(CHAVE_V1)).alunos.length, 2, 'a chave v1 fica intacta, como rede');
});

test('o consumidor vê o aluno de sempre: avaliações e feedbacks dentro, sem emailNorm', () => {
  const { c } = comV1();
  const ana = c.obter('001');
  assert.deepEqual(ana, blob().alunos[0]);
  assert.ok(!('emailNorm' in ana));
  assert.ok(!('feedbacks' in c.obter('002')), 'aluno sem feedbacks continua sem o campo');
  assert.deepEqual(c.comoBlobV1(), blob(), 'o blob inteiro volta igual');
});

test('mexer no objeto devolvido não mexe no cache (como o v1, que relia o storage)', () => {
  const { c } = comV1();
  const ana = c.obter('001');
  ana.nome = 'Outra'; ana.avaliacoes.push({ num: 9 });
  assert.equal(c.obter('001').nome, 'Ana');
  assert.equal(c.obter('001').avaliacoes.length, 2);
});

test('editar a ficha marca só a ficha', () => {
  const { c } = comV1();
  c.gravarAluno({ ...c.obter('001'), telefone: '1199' });
  assert.deepEqual(fila(c), { 'alunos/001': 'set' });
});

test('salvar sem mudar nada não marca nada', () => {
  const { c } = comV1();
  c.gravarAluno(c.obter('001'));
  assert.deepEqual(c.fila(), {});
});

test('avaliação nova marca só ela; apagada vira delete; a ficha fica de fora', () => {
  const { c } = comV1();
  const a = c.obter('001');
  a.avaliacoes = [a.avaliacoes[0], { num: 3, peso: 68 }];
  c.gravarAluno(a);
  assert.deepEqual(fila(c), { 'alunos/001/avaliacoes/3': 'set', 'alunos/001/avaliacoes/2': 'delete' });
});

test('feedback novo pela caixa (lista reordenada pelo portal-merge): sobe só o novo', () => {
  const { c } = comV1();
  const a = c.obter('001');
  a.feedbacks = [...a.feedbacks, { id: 'f3', criadoEm: 30 }].sort((x, y) => y.criadoEm - x.criadoEm);
  c.gravarAluno(a);
  assert.deepEqual(fila(c), { 'alunos/001/feedbacks/f3': 'set' });
});

test('feedback antigo sem id: o id não depende da posição, então reordenar não sobe nada', () => {
  const s = armazenamento({ [CHAVE_V1]: JSON.stringify({ alunos: [{ id: '1', feedbacks: [{ criadoEm: 5 }, { criadoEm: 9 }] }] }) });
  const c = criarCache({ storage: s });
  const a = c.obter('1');
  a.feedbacks.reverse();
  c.gravarAluno(a);
  assert.deepEqual(c.fila(), {});
});

test('remover aluno apaga a ficha e todos os filhos dele', () => {
  const { c } = comV1();
  c.removerAluno('001');
  assert.equal(c.obter('001'), null);
  assert.deepEqual(fila(c), {
    'alunos/001/avaliacoes/1': 'delete', 'alunos/001/avaliacoes/2': 'delete',
    'alunos/001/feedbacks/f2': 'delete', 'alunos/001/feedbacks/f1': 'delete', 'alunos/001': 'delete',
  });
});

test('operação de envio: ficha com emailNorm, meta com schema 2 e sem campo reservado', () => {
  const { c } = comV1();
  c.gravarMeta({ feriados: { '2026-10-12': false } });
  const meta = c.operacaoDe('meta');
  assert.deepEqual(meta, { tipo: 'meta', dados: { seq: 2, produtos: blob().produtos, feriados: { '2026-10-12': false }, schema: 2 } });
  const ficha = c.operacaoDe('alunos/001');
  assert.equal(ficha?.tipo, 'set');
  assert.equal(/** @type {any} */ (ficha).dados.emailNorm, 'ana@box.com');
  assert.ok(!('avaliacoes' in /** @type {any} */ (ficha).dados));
  assert.deepEqual(c.operacaoDe('alunos/001/avaliacoes/2'), { tipo: 'set', caminho: ['alunos', '001', 'avaliacoes', '2'], dados: { num: 2, peso: 69 } });
  assert.deepEqual(c.operacaoDe('alunos/999'), { tipo: 'delete', caminho: ['alunos', '999'] }, 'sumiu do cache = delete');
  assert.equal(c.operacaoDe('lixo/x'), null);
});

test('meta: gravarMeta com undefined tira o campo (feriado desmarcado some)', () => {
  const { c } = comV1();
  c.gravarMeta({ feriados: { a: false } });
  c.gravarMeta({ produtos: undefined });
  assert.ok(!('produtos' in c.meta()));
});

test('confirmar não limpa o que mudou de novo durante o envio', () => {
  const { c } = comV1();
  c.gravarAluno({ ...c.obter('001'), nome: 'A1' });
  const enviado = c.fila();
  c.gravarAluno({ ...c.obter('001'), nome: 'A2' }); // edição com o lote no ar
  c.gravarAluno({ ...c.obter('002'), nome: 'B1' });
  c.confirmar(enviado);
  assert.deepEqual(fila(c), { 'alunos/001': 'set', 'alunos/002': 'set' }, 'a 001 continua: a versão enviada já é velha');
  c.confirmar(c.fila());
  assert.deepEqual(c.fila(), {});
});

test('marcarTudo põe meta, fichas e filhos na fila (semear nuvem vazia)', () => {
  const { c } = comV1();
  c.marcarTudo();
  assert.deepEqual(Object.keys(c.fila()).sort(), [
    'alunos/001', 'alunos/001/avaliacoes/1', 'alunos/001/avaliacoes/2', 'alunos/001/feedbacks/f1', 'alunos/001/feedbacks/f2',
    'alunos/002', 'meta',
  ]);
});

/* ---------- mescla com a nuvem ---------- */

test('mesclar: a nuvem vence onde não há pendência; pendência local vence onde há', () => {
  const local = estadoDeBlobV1(blob());
  local.alunos['001'].nome = 'Ana (editada aqui)';
  local.avaliacoes['001'].push({ num: 3, peso: 1 });
  const nuvem = estadoDeBlobV1(blob());
  nuvem.alunos['002'].nome = 'Bia (editada no celular)';
  nuvem.avaliacoes['001'] = [{ num: 1, peso: 70 }]; // a 2 foi apagada no celular
  const f = { 'alunos/001': { op: 'set', t: 'x' }, 'alunos/001/avaliacoes/3': { op: 'set', t: 'y' } };
  const m = mesclar(local, nuvem, /** @type {any} */ (f));
  assert.equal(m.alunos['001'].nome, 'Ana (editada aqui)');
  assert.equal(m.alunos['002'].nome, 'Bia (editada no celular)');
  assert.deepEqual(m.avaliacoes['001'].map((a) => a.num), [1, 3], 'a 2 sai (celular), a 3 fica (pendente aqui)');
});

test('mesclar: aluno apagado em outro aparelho some; criado aqui (pendente) fica; apagado aqui (pendente) não volta', () => {
  const local = estadoDeBlobV1(blob());
  local.alunos['003'] = { id: '003', nome: 'Caio novo' };
  delete local.alunos['001'];
  const nuvem = estadoDeBlobV1(blob());
  delete nuvem.alunos['002'];
  const f = { 'alunos/003': { op: 'set', t: '1' }, 'alunos/001': { op: 'delete', t: '2' } };
  const m = mesclar(local, nuvem, /** @type {any} */ (f));
  assert.deepEqual(Object.keys(m.alunos).sort(), ['003']);
});

test('mesclar: avaliação local sem número (não sobe) não some na mescla', () => {
  const local = estadoDeBlobV1(blob());
  local.avaliacoes['002'] = [{ data: 'sem num' }];
  const m = mesclar(local, estadoDeBlobV1(blob()), {});
  assert.deepEqual(m.avaliacoes['002'], [{ data: 'sem num' }]);
});

test('adotar grava no storage e respeita a fila do próprio cache', () => {
  const { c, s } = comV1();
  c.gravarAluno({ ...c.obter('001'), nome: 'Pendente' });
  const nuvem = estadoDeBlobV1(blob());
  nuvem.alunos['002'].nome = 'Da nuvem';
  c.adotar(nuvem);
  assert.equal(c.obter('001').nome, 'Pendente');
  assert.equal(c.obter('002').nome, 'Da nuvem');
  assert.ok(s.m.has(CHAVE_FILA));
});
