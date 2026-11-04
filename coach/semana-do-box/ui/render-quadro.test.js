// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conferirSemana } from '../core/quadro.js';
import { renderConferencia, renderLeitura, renderQuadroBase, rotuloDeOnde } from './render-quadro.js';

const CATALOGO = JSON.parse(readFileSync(new URL('../core/fixtures/catalogo.json', import.meta.url), 'utf8'));
const vazios = () => ({
  quadros: { q1: { h: '', metabolico: '' }, q2: { h: '', metabolico: '' }, q3: { h: '', metabolico: '' } },
  extra: { tipo: null, dia: 'sabado', texto: '' },
});

test('base: os 3 quadros com H e metabólico, o texto escapado e o extra só quando escolhido', () => {
  const t = vazios();
  t.quadros.q1.h = 'B) <script>';
  const html = renderQuadroBase({ semanaId: '2026-W45', rotulo: 'Semana 45', textos: t, nomesCatalogo: ['Mesa flexora'] });
  for (const col of ['q1.h', 'q1.m', 'q2.h', 'q2.m', 'q3.h', 'q3.m']) assert.ok(html.includes(`data-col="${col}"`), col);
  assert.ok(html.includes('B) &lt;script&gt;'));
  assert.ok(!html.includes('data-col="extra"'));
  const comGap = renderQuadroBase({ semanaId: '2026-W45', rotulo: '', textos: { ...t, extra: { tipo: 'GAP', dia: 'terca', texto: '' } }, nomesCatalogo: [] });
  assert.ok(comGap.includes('data-col="extra"'));
});

test('leitura: reconhecido vira chip, duvidoso vira pergunta com sugestões e "não está no catálogo"', () => {
  const t = vazios();
  t.quadros.q1.h = 'B) Principal 3x10\nAgachamento Smith\nDesenv. halter';
  const conf = conferirSemana({ ...t, catalogo: CATALOGO });
  const html = renderLeitura('q1.h', conf);
  assert.match(html, /class="ql-chip ok"[^>]*>Agachamento no Smith \(barra guiada\)</);
  assert.match(html, /“Desenv\. halter” é…/);
  assert.match(html, /data-apelido="desenv halter" data-id="desenvolvimento_halter"/);
  assert.match(html, /data-id="-">não está no catálogo/);
  assert.match(html, /2\/7 exercícios/, 'o nome por confirmar também é um exercício escrito');
});

test('conferência: contadores, avisos com o lugar, os 7 padrões e o equipamento do dia', () => {
  const t = vazios();
  t.quadros.q1.h = 'B) 3x10\nAgachamento Smith';
  const conf = conferirSemana({ ...t, catalogo: CATALOGO });
  const html = renderConferencia(conf, { caminho: 'aulas' });
  assert.match(html, /Falta para a semana/);
  assert.match(html, /data-ir="q1\.h"[^>]*>Quadro 1 · H1</);
  assert.match(html, /Os 7 padrões de cada H/);
  assert.match(html, /<th>Terça<\/th><td>H1<\/td>/, 'Cross em branco: a terça confere só o H1');
  assert.equal(rotuloDeOnde('q2.m', conf), 'Quadro 2 · Hyrox');
  assert.match(renderConferencia(conf, { caminho: 'alterna' }), /qc-caminho ativo" data-caminho="alterna"/);
});
