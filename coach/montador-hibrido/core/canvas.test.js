// @ts-check
/**
 * Só a metade PURA de `canvas.js` — a conta de resolução, a leitura da data URL
 * e a escolha de formato. O desenho em si toca o DOM e não roda no node.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimensoesDoCanvas, partesDoDataUrl, MAX_LARGURA_EXPORT, QUALIDADE } from './canvas.js';

test('a qualidade da compressão é a que o spec pede', () => {
  assert.equal(QUALIDADE, 0.8);
});

test('num tablet DPR 2, o canvas é criado no dobro dos pixels — caligrafia borrada não se lê', () => {
  const d = dimensoesDoCanvas({ largura: 700, altura: 400, dpr: 2 });
  assert.equal(d.largura, 1400);
  assert.equal(d.altura, 800);
  assert.equal(d.escala, 2);
});

test('o teto de largura corta o DPR, e o quadro continua do mesmo tamanho na tela', () => {
  const d = dimensoesDoCanvas({ largura: 1200, altura: 600, dpr: 3 });
  assert.equal(d.largura, MAX_LARGURA_EXPORT, 'sem teto seriam 3600px e vários MB na chamada');
  assert.ok(d.escala < 3 && d.escala > 1, `a escala é reduzida, não zerada (${d.escala})`);
  // A proporção do quadro tem que sobreviver ao corte.
  assert.equal(Math.round(d.largura / d.altura), Math.round(1200 / 600));
});

test('tela pequena não é ESTICADA até o teto', () => {
  const d = dimensoesDoCanvas({ largura: 320, altura: 200, dpr: 1 });
  assert.equal(d.largura, 320);
  assert.equal(d.escala, 1);
});

test('canvas de tamanho zero (aba oculta) não gera dimensão inválida', () => {
  const d = dimensoesDoCanvas({ largura: 0, altura: 0, dpr: 2 });
  assert.ok(d.largura >= 1 && d.altura >= 1);
});

test('a data URL é separada em mime e base64', () => {
  const r = partesDoDataUrl('data:image/webp;base64,AAAB');
  assert.deepEqual(r, { mimeType: 'image/webp', base64: 'AAAB' });
});

test('toDataURL que falhou devolve null em vez de explodir no meio do clique', () => {
  assert.equal(partesDoDataUrl(''), null);
  assert.equal(partesDoDataUrl('data:image/png,nao-e-base64'), null);
  assert.equal(partesDoDataUrl('data:image/jpeg;base64,'), null);
});
