// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarHistorico, MAX_PASSOS } from './historico.js';

test('sem nada empilhado não há o que desfazer', () => {
  const h = criarHistorico();
  assert.equal(h.podeDesfazer(), false);
  assert.equal(h.desfazer(), null);
});

test('com só o estado inicial ainda não há o que desfazer', () => {
  // Desfazer o começo não tem para onde ir. Devolver o próprio estado atual
  // faria o botão parecer quebrado: clica e nada muda.
  const h = criarHistorico();
  h.registrar('a', { texto: 'a' });
  assert.equal(h.podeDesfazer(), false);
  assert.equal(h.desfazer(), null);
});

test('desfazer devolve o estado ANTERIOR, não o atual', () => {
  const h = criarHistorico();
  h.registrar('a', { texto: 'a' });
  h.registrar('b', { texto: 'ab' });
  assert.deepEqual(h.desfazer(), { texto: 'a' });
});

test('desfazer duas vezes volta dois passos', () => {
  const h = criarHistorico();
  h.registrar('a', 1);
  h.registrar('b', 2);
  h.registrar('c', 3);
  assert.equal(h.desfazer(), 2);
  assert.equal(h.desfazer(), 1);
  assert.equal(h.desfazer(), null, 'chegou no início');
});

test('estado igual ao do topo é ignorado', () => {
  // Sem isso, cada tecla digitada empilharia um passo e apagar uma palavra
  // exigiria cinquenta cliques em Desfazer.
  const h = criarHistorico();
  assert.equal(h.registrar('a', 1), true);
  assert.equal(h.registrar('a', 1), false);
  assert.equal(h.tamanho(), 1);
});

test('estado igual a um ANTIGO (não ao topo) entra normalmente', () => {
  // Apagar uma letra e redigitar volta à mesma chave de dois passos atrás; isso
  // é um passo novo, não uma repetição.
  const h = criarHistorico();
  h.registrar('a', 1);
  h.registrar('b', 2);
  assert.equal(h.registrar('a', 3), true);
  assert.equal(h.tamanho(), 3);
});

test('a pilha tem teto e o mais antigo cai primeiro', () => {
  const h = criarHistorico({ max: 3 });
  for (const k of ['a', 'b', 'c', 'd']) h.registrar(k, k);
  assert.equal(h.tamanho(), 3);
  assert.equal(h.desfazer(), 'c');
  assert.equal(h.desfazer(), 'b');
  assert.equal(h.desfazer(), null, 'o "a" caiu fora do teto');
});

test('teto absurdo ou ausente cai num valor utilizável', () => {
  assert.equal(criarHistorico({ max: 0 }).tamanho(), 0);
  const h = criarHistorico({ max: 1 });
  h.registrar('a', 1); h.registrar('b', 2);
  assert.equal(h.podeDesfazer(), true, 'teto mínimo de 2: com 1 o botão nunca funcionaria');
  assert.equal(criarHistorico().tamanho(), 0);
});

test('o teto padrão é o documentado', () => {
  const h = criarHistorico();
  for (let i = 0; i < MAX_PASSOS + 10; i++) h.registrar(String(i), i);
  assert.equal(h.tamanho(), MAX_PASSOS);
});

test('recomeçar zera a pilha — abrir outro treino não desfaz para dentro do anterior', () => {
  const h = criarHistorico();
  h.registrar('a', 1);
  h.registrar('b', 2);
  h.recomecar('novo', 99);
  assert.equal(h.tamanho(), 1);
  assert.equal(h.podeDesfazer(), false);
  assert.equal(h.desfazer(), null);
});

test('depois de desfazer, um passo novo continua de onde parou', () => {
  const h = criarHistorico();
  h.registrar('a', 1);
  h.registrar('b', 2);
  h.registrar('c', 3);
  h.desfazer();                 // volta para 2
  h.registrar('d', 4);          // caminho novo a partir dali
  assert.equal(h.desfazer(), 2);
  assert.equal(h.desfazer(), 1);
});

test('guarda o estado que recebe, sem interpretar', () => {
  // O módulo não sabe o que é uma lousa; quem lê e restaura é a tela.
  const h = criarHistorico();
  const quadro = { html: '<b>x</b>', tracos: [{ pontos: [] }] };
  h.registrar('1', quadro);
  h.registrar('2', { html: '', tracos: [] });
  assert.equal(h.desfazer(), quadro, 'o mesmo objeto, sem cópia nem conversão');
});
