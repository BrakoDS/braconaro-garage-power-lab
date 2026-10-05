// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAvisoTroca, renderOpcoes } from './render-troca.js';

const semConflito = { mesmoBloco: false, repeticoes: [], semanaAnterior: false, equipamento: [], instanciaDiferente: false };
/** Uma resposta de `opcoesTrocaBox` no formato do servidor (`edicao-box.ts`). */
const R = {
  vaga: { sessao: 'H1', posicao: 5, instancia: 'estender_quadril', dias: ['segunda', 'terca'], atual: { exercicioId: 'rdl_halter', nome: 'Levantamento terra romeno com halteres' } },
  opcoes: [
    { exercicioId: 'ponte_gluteo', nome: 'Ponte de glúteo no chão', instancia: 'estender_quadril', mesmaInstancia: true, conflitos: semConflito, substitutos: [] },
    {
      exercicioId: 'rdl_smith', nome: 'Levantamento terra romeno no Smith', instancia: 'estender_quadril', mesmaInstancia: true,
      conflitos: { ...semConflito, repeticoes: [{ sessao: 'H2', posicao: 1, dias: ['quarta'] }] },
      substitutos: [{ sessao: 'H2', posicao: 1, dias: ['quarta'], opcoes: [{ exercicioId: 'elevacao_pelvica', nome: 'Elevação pélvica (hip thrust)' }] }],
    },
    { exercicioId: 'mesa_flexora', nome: 'Mesa flexora', instancia: 'estender_quadril', mesmaInstancia: true, conflitos: { ...semConflito, mesmoBloco: true }, substitutos: [] },
    { exercicioId: 'pallof_press', nome: 'Pallof press', instancia: 'estabilizar_tronco', mesmaInstancia: false, conflitos: { ...semConflito, instanciaDiferente: true }, substitutos: [] },
  ],
};

test('lista: só a instância da vaga, com selos, e o que já está no bloco desabilitado', () => {
  const h = renderOpcoes(R, false);
  assert.ok(h.includes('H1 · vaga 5') && h.includes('segunda e terça') && h.includes('Hoje: Levantamento terra romeno com halteres'));
  assert.match(h, /data-acao="escolher:ponte_gluteo"/);
  assert.match(h, /data-acao="escolher:rdl_smith"/);
  assert.ok(h.includes('⚠ no H2'));
  assert.doesNotMatch(h, /escolher:mesa_flexora/, 'já no bloco: não dá para escolher');
  assert.ok(h.includes('já no bloco'));
  assert.doesNotMatch(h, /pallof_press/, 'outra instância fica fora do filtro');
  assert.match(h, /data-acao="todas"/);
});

test('lista: "ver todos" mostra outras instâncias com o nome da instância', () => {
  const h = renderOpcoes(R, true);
  assert.match(h, /data-acao="escolher:pallof_press"/);
  assert.ok(h.includes('<span class="troca-inst">Core</span>'));
  assert.match(h, /data-acao="instancia"/);
});

test('aviso de repetição: substituir no outro lugar, escolher outro, manter ou cancelar', () => {
  const a = renderAvisoTroca(R, R.opcoes[1]);
  assert.equal(a.titulo, 'Trocar por Levantamento terra romeno no Smith?');
  assert.ok(a.corpoHTML.includes('Já está no H2 (vaga 1 · quarta).'));
  assert.deepEqual(a.acoes.map((x) => x.id), ['substituir:H2:1:elevacao_pelvica', 'outro-substituto:H2:1', 'manter']);
  assert.equal(a.fechar, 'Cancelar a troca', 'cancelar é o próprio botão de fechar, sem duplicar');
  assert.deepEqual(a.acoes.map((x) => !!x.secundaria), [false, true, true], 'substituir em destaque; o resto contornado');
});

test('aviso de equipamento: sem "manter"', () => {
  const opcao = { ...R.opcoes[0], conflitos: { ...semConflito, equipamento: [{ recurso: 'smith', usado: 3, limite: 2 }] } };
  const a = renderAvisoTroca(R, opcao);
  assert.deepEqual(a.acoes.map((x) => x.id), ['outro']);
  assert.ok(a.corpoHTML.includes('A semana não publica assim.'));
});

test('nome vindo do catálogo é escapado', () => {
  const r = { ...R, opcoes: [{ ...R.opcoes[0], nome: '<img src=x>' }] };
  assert.ok(!renderOpcoes(r, false).includes('<img src=x>'));
});
