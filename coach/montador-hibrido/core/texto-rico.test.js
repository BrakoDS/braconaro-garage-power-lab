// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarCor, compactar, textoPlano, paraPrompt, temCor, segmentosDoTreino, COR_PADRAO,
} from './texto-rico.js';

test('a cor volta do navegador como rgb() e ainda assim é reconhecida', () => {
  // `color: #D32F2F` é lido de volta como `rgb(211, 47, 47)` — casar só o hex
  // faria toda observação em vermelho chegar à IA como se fosse preta.
  assert.equal(normalizarCor('rgb(211, 47, 47)'), 'vermelho');
  assert.equal(normalizarCor('rgb(25, 118, 210)'), 'azul');
  assert.equal(normalizarCor('rgb(26, 26, 26)'), 'preto');
});

test('hex, maiúsculas e rgba também são reconhecidos', () => {
  assert.equal(normalizarCor('#D32F2F'), 'vermelho');
  assert.equal(normalizarCor('#d32f2f'), 'vermelho');
  assert.equal(normalizarCor('rgba(25,118,210,1)'), 'azul');
});

test('um vermelho PARECIDO, vindo de texto colado, ainda conta como vermelho', () => {
  assert.equal(normalizarCor('rgb(200, 40, 40)'), 'vermelho');
});

test('cor desconhecida, vazia ou herdada cai em preto — a cor de "exercício"', () => {
  assert.equal(normalizarCor(''), COR_PADRAO);
  assert.equal(normalizarCor('inherit'), COR_PADRAO);
  assert.equal(normalizarCor('rgb(0, 200, 0)'), COR_PADRAO, 'verde não é caneta do box');
});

test('segmentos vizinhos da mesma cor viram um só', () => {
  // O contenteditable fragmenta o texto a cada tecla; sem juntar, uma palavra
  // digitada vira onze marcas de cor no prompt.
  const r = compactar([
    { texto: 'aga', cor: 'preto' }, { texto: 'cha', cor: 'preto' }, { texto: 'mento', cor: 'preto' },
    { texto: ' 4x8', cor: 'azul' },
  ]);
  assert.equal(r.length, 2);
  // O espaço que abria o trecho azul saiu para fora da marca — por isso ele
  // aparece colado no fim do preto, e não no começo do azul.
  assert.equal(r[0].texto, 'agachamento ');
  assert.equal(r[1].texto, '4x8');
});

test('espaço entre palavras de cores diferentes NÃO some', () => {
  // A versão anterior filtrava trecho em branco e "4x8" + " " + "RIR" viravam
  // "4x8RIR" no prompt.
  const p = paraPrompt([
    { texto: '4x8', cor: 'azul' },
    { texto: ' ', cor: 'preto' },
    { texto: 'RIR 2', cor: 'vermelho' },
  ]);
  assert.ok(p.includes('[[/azul]] [[vermelho]]'), `esperava o espaço preservado, veio: ${p}`);
});

test('a marca de cor não atravessa a quebra de linha', () => {
  // O navegador fecha o <br> DENTRO do span da cor ativa; sem aparar, o prompt
  // saía com "[[vermelho]] RIR 2\n[[/vermelho]]".
  const p = paraPrompt([
    { texto: 'Agachamento', cor: 'preto' },
    { texto: ' RIR 2\n', cor: 'vermelho' },
    { texto: '  Pull-ups', cor: 'preto' },
  ]);
  assert.equal(p, 'Agachamento [[vermelho]]RIR 2[[/vermelho]]\n  Pull-ups');
});

test('trecho colorido que é só espaço vira espaço comum', () => {
  assert.equal(paraPrompt([{ texto: '   ', cor: 'azul' }]), '   ');
});

test('segmento vazio some e cor inválida cai no padrão', () => {
  const r = compactar([{ texto: '', cor: 'azul' }, { texto: 'oi', cor: 'roxo' }]);
  assert.deepEqual(r, [{ texto: 'oi', cor: COR_PADRAO }]);
});

test('o texto plano sobrevive intacto à compactação — nada de caractere perdido', () => {
  const entrada = [
    { texto: 'A — Mobilidade\n  ', cor: 'preto' },
    { texto: 'Agachamento', cor: 'preto' },
    { texto: ' 4x8 ', cor: 'azul' },
    { texto: '· ', cor: 'preto' },
    { texto: 'RIR 2\n', cor: 'vermelho' },
  ];
  assert.equal(textoPlano(compactar(entrada)), textoPlano(entrada),
    'compactar reorganiza as cores, nunca muda o texto');
});

test('só o que NÃO é preto ganha marca no prompt', () => {
  const p = paraPrompt([
    { texto: 'Agachamento', cor: 'preto' },
    { texto: ' 4x8-12', cor: 'azul' },
    { texto: ' RIR 2', cor: 'vermelho' },
  ]);
  // Cada marca envolve SÓ o texto que qualifica: os espaços ficam de fora.
  assert.equal(p, 'Agachamento [[azul]]4x8-12[[/azul]] [[vermelho]]RIR 2[[/vermelho]]');
});

test('a marca usa colchete DUPLO — treino de verdade tem "[3 rounds]"', () => {
  const p = paraPrompt([{ texto: '[3 rounds]', cor: 'vermelho' }]);
  assert.ok(p.includes('[[vermelho]]'), 'a marca precisa ser distinguível do colchete do coach');
  assert.ok(p.includes('[3 rounds]'), 'e o colchete do coach passa intacto');
});

test('lousa toda preta não ganha marca nenhuma', () => {
  assert.equal(paraPrompt([{ texto: 'Agachamento 4x8', cor: 'preto' }]), 'Agachamento 4x8');
  assert.equal(temCor([{ texto: 'x', cor: 'preto' }]), false);
  assert.equal(temCor([{ texto: 'x', cor: 'azul' }]), true);
});

test('o texto plano é o que se guarda para reabrir a lousa', () => {
  const seg = [{ texto: 'Agachamento', cor: 'preto' }, { texto: ' 4x8', cor: 'azul' }];
  assert.equal(textoPlano(seg), 'Agachamento 4x8');
});

test('lista vazia não quebra nada', () => {
  assert.deepEqual(compactar([]), []);
  assert.equal(paraPrompt([]), '');
  assert.equal(textoPlano(undefined), '');
});

/* ---------- o caminho de volta, para o Calendário reabrir ---------- */

const treino = {
  sistema: 'Hipertrofia',
  blocos: [
    { id: 'A', nome: 'Mobilidade', exercicios: [
      { nome: 'Mobilidade de Quadril', series: 1, reps: '40s', implemento: '', observacao: '' }] },
    { id: 'C', nome: 'Força', exercicios: [
      { nome: 'Agachamento Livre', series: 4, reps: '8-12', implemento: 'Barra', observacao: 'RIR 2' }] },
  ],
};

test('o treino salvo volta ao quadro com as cores da convenção', () => {
  const seg = segmentosDoTreino(treino);
  const porCor = (c) => seg.filter((s) => s.cor === c).map((s) => s.texto).join('');
  assert.ok(porCor('preto').includes('Agachamento Livre'), 'exercício em preto');
  assert.ok(porCor('azul').includes('4x8-12'), 'série e repetição em azul');
  assert.ok(porCor('vermelho').includes('RIR 2'), 'observação em vermelho');
});

test('o texto reconstruído traz os blocos na ordem e é legível', () => {
  const t = textoPlano(segmentosDoTreino(treino));
  assert.ok(t.indexOf('A — Mobilidade') < t.indexOf('C — Força'), 'na ordem dos blocos');
  assert.ok(t.includes('Agachamento Livre · 4x8-12 · Barra · RIR 2'));
});

test('treino vazio ou ausente devolve lista vazia, não explode', () => {
  assert.deepEqual(segmentosDoTreino(null), []);
  assert.deepEqual(segmentosDoTreino({ blocos: [] }), []);
});
