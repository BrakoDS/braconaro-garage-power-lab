// @ts-check
/**
 * O rascunho do salvar global: o que fica sujo, o que se grava e quando duas
 * edições batem de frente.
 *
 * Rodar: node --test coach/gestao-de-alunos/perfil-rascunho.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRascunho, lerCaminho } from './perfil-rascunho.js?v=26';

const ficha = () => ({
  id: '007', nome: 'Ana', telefone: '14999990000', diasTreino: ['seg', 'qua'],
  anamnese: { sono: '7', medicamentos: '' },
  matrizIndividualizacao: { versao: 1, cargas: { rir: '2-3', referencia: { supino: { kg: 40 } } } },
});

/* ---------- lerCaminho ---------- */

test('lerCaminho anda pelos mapas e para no que não é mapa', () => {
  const a = ficha();
  assert.equal(lerCaminho(a, 'nome'), 'Ana');
  assert.equal(lerCaminho(a, 'matrizIndividualizacao.cargas.referencia.supino.kg'), 40);
  assert.equal(lerCaminho(a, 'anamnese.inexistente'), undefined);
  assert.equal(lerCaminho(a, 'nome.x'), undefined, 'string não é mapa');
  assert.equal(lerCaminho(a, 'diasTreino.0'), undefined, 'lista é folha');
  assert.equal(lerCaminho(null, 'nome'), undefined);
});

/* ---------- sujo / valor ---------- */

test('rascunho novo está limpo e mostra a base', () => {
  const r = criarRascunho(ficha());
  assert.equal(r.sujo(), false);
  assert.equal(r.valor('nome'), 'Ana');
  assert.equal(r.valor('anamnese.sono'), '7');
  assert.deepEqual(r.montarPatch(ficha()), {});
});

test('editar suja; voltar ao valor da base limpa', () => {
  const r = criarRascunho(ficha());
  r.definir('nome', 'Ana Paula');
  assert.equal(r.sujo(), true);
  assert.equal(r.valor('nome'), 'Ana Paula');
  assert.deepEqual(r.caminhos(), ['nome']);
  r.definir('nome', 'Ana');
  assert.equal(r.sujo(), false, 'desfazer na mão também limpa');
});

test('campo ausente e campo apagado são a mesma coisa', () => {
  const r = criarRascunho(ficha());
  r.definir('endereco', 'Rua X');
  r.definir('endereco', '');
  assert.equal(r.sujo(), false);
  r.definir('anamnese.medicamentos', '');
  assert.equal(r.sujo(), false, "'' já era o valor");
  r.definir('foco', []);
  assert.equal(r.sujo(), false, 'lista vazia num campo ausente');
});

test('false e 0 são valores, não vazio', () => {
  const r = criarRascunho({ id: '1' });
  r.definir('appLiberado', false);
  assert.equal(r.sujo(), true);
  r.definir('appLiberado', undefined);
  r.definir('vencimento', 0);
  assert.equal(r.sujo(), true);
});

test('a base é copiada: mexer no objeto de quem chamou não muda o rascunho', () => {
  const a = ficha();
  const r = criarRascunho(a);
  a.nome = 'Outra';
  a.anamnese.sono = '3';
  assert.equal(r.valor('nome'), 'Ana');
  assert.equal(r.valor('anamnese.sono'), '7');
});

test('o valor definido é copiado: mexer na lista depois não muda o rascunho', () => {
  const r = criarRascunho(ficha());
  const dias = ['seg', 'qua', 'sex'];
  r.definir('diasTreino', dias);
  dias.push('sab');
  assert.deepEqual(r.valor('diasTreino'), ['seg', 'qua', 'sex']);
});

test('caminho inválido é erro de programação, não silêncio', () => {
  const r = criarRascunho(ficha());
  for (const c of ['', 'a..b', '.a', 'a.']) assert.throws(() => r.definir(c, 1), /caminho inválido/, c);
});

/* ---------- caminhos que se cruzam ---------- */

test('caminho largo engole os de dentro dele', () => {
  const r = criarRascunho(ficha());
  r.definir('anamnese.sono', '8');
  r.definir('anamnese', { sono: '6', medicamentos: 'x' });
  assert.deepEqual(r.caminhos(), ['anamnese']);
  assert.equal(r.valor('anamnese.sono'), '6');
});

test('caminho estreito dentro de um largo já editado entra nele', () => {
  const r = criarRascunho(ficha());
  r.definir('anamnese', { sono: '6', medicamentos: 'x' });
  r.definir('anamnese.sono', '9');
  assert.deepEqual(r.caminhos(), ['anamnese']);
  assert.equal(r.valor('anamnese.sono'), '9');
  assert.equal(r.valor('anamnese.medicamentos'), 'x');
});

/* ---------- montarPatch ---------- */

test('o patch leva o campo do topo inteiro, com a edição por cima', () => {
  const r = criarRascunho(ficha());
  r.definir('anamnese.sono', '8');
  r.definir('nome', 'Ana Paula');
  assert.deepEqual(r.montarPatch(ficha()), { anamnese: { sono: '8', medicamentos: '' }, nome: 'Ana Paula' });
  assert.deepEqual(r.camposDoTopo(), ['anamnese', 'nome']);
});

test('o patch é montado sobre a ficha de AGORA: o que outro aparelho gravou no mesmo objeto fica', () => {
  // É o motivo do rascunho por caminho: db.atualizar troca `anamnese` inteiro.
  const r = criarRascunho(ficha());
  r.definir('anamnese.sono', '8');
  const agora = ficha();
  agora.anamnese.medicamentos = 'losartana'; // gravado no celular enquanto o coach editava no tablet
  assert.deepEqual(r.montarPatch(agora), { anamnese: { sono: '8', medicamentos: 'losartana' } });
  assert.deepEqual(r.conflitos(agora), [], 'campos diferentes não conflitam');
});

test('o patch cria os mapas que faltam no caminho', () => {
  const r = criarRascunho({ id: '1' });
  r.definir('matrizIndividualizacao.cargas.airbike.rpm', 60);
  assert.deepEqual(r.montarPatch({ id: '1' }), { matrizIndividualizacao: { cargas: { airbike: { rpm: 60 } } } });
});

test('várias edições no mesmo objeto viram um campo só no patch', () => {
  const r = criarRascunho(ficha());
  r.definir('matrizIndividualizacao.cargas.rir', '1-2');
  r.definir('matrizIndividualizacao.cargas.referencia.supino.kg', 45);
  const p = r.montarPatch(ficha());
  assert.deepEqual(Object.keys(p), ['matrizIndividualizacao']);
  assert.equal(p.matrizIndividualizacao.versao, 1, 'o resto do objeto vem junto');
  assert.equal(p.matrizIndividualizacao.cargas.rir, '1-2');
  assert.equal(p.matrizIndividualizacao.cargas.referencia.supino.kg, 45);
});

test('montar o patch não altera a ficha recebida', () => {
  const r = criarRascunho(ficha());
  r.definir('anamnese.sono', '8');
  const agora = ficha();
  r.montarPatch(agora);
  assert.equal(agora.anamnese.sono, '7');
});

/* ---------- conflitos ---------- */

test('o mesmo campo mudou aqui e no banco: conflito', () => {
  const r = criarRascunho(ficha());
  r.definir('telefone', '14988887777');
  const agora = { ...ficha(), telefone: '14911112222' };
  assert.deepEqual(r.conflitos(agora), [{ caminho: 'telefone', base: '14999990000', atual: '14911112222', meu: '14988887777' }]);
});

test('o banco chegou ao mesmo valor que o rascunho: não é conflito', () => {
  const r = criarRascunho(ficha());
  r.definir('telefone', '14988887777');
  assert.deepEqual(r.conflitos({ ...ficha(), telefone: '14988887777' }), []);
});

test('mudou só no banco, em campo não editado: não é conflito', () => {
  const r = criarRascunho(ficha());
  r.definir('nome', 'Ana Paula');
  assert.deepEqual(r.conflitos({ ...ficha(), telefone: '14911112222' }), []);
});

test('o Montador Individual trocou o foco enquanto o coach editava o foco: conflito', () => {
  const r = criarRascunho({ ...ficha(), foco: ['perna'] });
  r.definir('foco', ['costas']);
  assert.equal(r.conflitos({ ...ficha(), foco: ['peito'] }).length, 1);
});

/* ---------- descartar / rebasear ---------- */

test('descartar um caminho, ou tudo', () => {
  const r = criarRascunho(ficha());
  r.definir('nome', 'X');
  r.definir('anamnese.sono', '1');
  r.descartar('anamnese');
  assert.deepEqual(r.caminhos(), ['nome'], 'descartar um objeto leva o que está dentro dele');
  r.descartar();
  assert.equal(r.sujo(), false);
});

test('rebasear (manter o meu): o conflito some e as edições ficam', () => {
  const r = criarRascunho(ficha());
  r.definir('telefone', '14988887777');
  r.definir('nome', 'Ana Paula');
  const agora = { ...ficha(), telefone: '14911112222', nome: 'Ana Paula' };
  r.rebasear(agora);
  assert.deepEqual(r.conflitos(agora), []);
  assert.deepEqual(r.caminhos(), ['telefone'], 'o nome já está igual no banco: deixa de estar sujo');
  assert.deepEqual(r.montarPatch(agora), { telefone: '14988887777' });
});

test('usar o novo: descartar o caminho em conflito', () => {
  const r = criarRascunho(ficha());
  r.definir('telefone', '14988887777');
  const agora = { ...ficha(), telefone: '14911112222' };
  for (const c of r.conflitos(agora)) r.descartar(c.caminho);
  r.rebasear(agora);
  assert.equal(r.sujo(), false);
  assert.equal(r.valor('telefone'), '14911112222');
});
