// @ts-check
/**
 * Rodar: node --test compartilhado/config/estruturas.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTRUTURAS, ESTRUTURA_IDS, ESTRUTURA_PADRAO, ROUND_TABATA,
  estruturaDe, blocosIniciais, linhaPadrao, contaPorTempo,
} from './estruturas.js';

test('toda estrutura esta inteira e com o id igual a chave', () => {
  for (const id of ESTRUTURA_IDS) {
    const e = ESTRUTURAS[id];
    assert.equal(e.id, id, `${id}: id diferente da chave`);
    assert.ok(e.label && e.desc, `${id}: falta rotulo ou descricao`);
    assert.ok(['series', 'tempo'].includes(e.contagem), `${id}: contagem desconhecida`);
    assert.ok(e.blocos.length >= 1, `${id}: estrutura sem bloco de partida`);
    assert.ok(e.blocos.every((b) => b.nome && b.tipo), `${id}: bloco sem nome ou tipo`);
  }
  assert.ok(ESTRUTURA_IDS.includes(ESTRUTURA_PADRAO));
});

test('a densidade de WOD so aparece em quem conta por tempo', () => {
  for (const id of ESTRUTURA_IDS) {
    if (ESTRUTURAS[id].densidadeWod) assert.equal(ESTRUTURAS[id].contagem, 'tempo', `${id}: desconto de densidade fora da rota do tempo`);
  }
  assert.equal(ESTRUTURAS.cross.densidadeWod, true, 'o WOD e quem tem o desconto');
  assert.equal(ESTRUTURAS.musculacao.densidadeWod, false);
});

// A comparação com o `TABATA` do GAP mora em `coach/montador-de-treino/core/gap.test.js`:
// o app pode importar o compartilhado, o contrário inverteria a seta.

test('estrutura desconhecida cai na padrao, em vez de quebrar a tela', () => {
  // Dia salvo com estrutura que não existe mais tem que abrir mostrando os
  // exercícios do coach, e não uma tela vazia.
  assert.equal(estruturaDe('inventada').id, ESTRUTURA_PADRAO);
  assert.equal(estruturaDe(undefined).id, ESTRUTURA_PADRAO);
  assert.equal(estruturaDe('gap').id, 'gap');
});

test('blocos e linha saem em copia, nao na origem', () => {
  const b = blocosIniciais('musculacao');
  b[0].nome = 'Editado';
  assert.equal(ESTRUTURAS.musculacao.blocos[0].nome, 'Principal', 'editar o bloco de um dia mudou a estrutura de todos');
  const l = linhaPadrao('musculacao');
  l.series = 9;
  assert.equal(ESTRUTURAS.musculacao.linhaPadrao.series, 3);
  const t = linhaPadrao('hiit');
  t.rounds = 99;
  assert.equal(ROUND_TABATA.rounds, 8, 'a linha nova nao pode mexer no round de referencia');
});

test('quem conta por tempo e quem conta por serie', () => {
  assert.equal(contaPorTempo('musculacao'), false);
  for (const id of ['hiit', 'gap', 'hyrox', 'cross']) assert.equal(contaPorTempo(id), true, `${id} deveria contar por tempo`);
});
