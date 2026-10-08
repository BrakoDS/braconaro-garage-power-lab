// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-perfil.test.js
 *
 * O cabeçalho da ficha e a barra de abas. A guarda mais importante é a última:
 * aba sem painel (ou painel sem aba) é tela que não abre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABAS, htmlCabecalho, htmlAbas } from './ui-perfil.js';

const HOJE = '2026-10-07';
const ana = {
  id: 'Ana0101', nome: 'Ana Lima', objetivo: 'Hipertrofia', status: 'ativo',
  avaliacoes: [{ num: 1, dataRealizada: '2026-07-01', dataProxima: '2026-10-01' }],
};

test('cabeçalho: nome, número, situação, objetivo e as três ações', () => {
  const h = htmlCabecalho(ana, HOJE);
  assert.match(h, /<h2 class="pc-nome">Ana Lima<\/h2>/);
  assert.match(h, /<span class="pc-num">#Ana0101<\/span>/);
  assert.match(h, /<span class="status ativo">Ativo<\/span>/);
  assert.match(h, /<div class="pc-obj">Hipertrofia<\/div>/);
  for (const acao of ['voltar', 'pdf', 'foto']) assert.match(h, new RegExp(`data-acao="${acao}"`));
  assert.match(h, /id="p-avatar"/, 'o upload da foto ainda acha o botão por esse id');
});

test('cabeçalho: o mesmo anel de reavaliação da lista', () => {
  assert.match(htmlCabecalho(ana, HOJE), /class="pc-id st-ativo reav-atrasada"/);
  assert.match(htmlCabecalho(ana, HOJE), /Reavaliação atrasada · 6 dias/);
  const inativa = htmlCabecalho({ ...ana, status: 'inativo' }, HOJE);
  assert.match(inativa, /class="pc-id st-inativo reav-inativo"/);
  assert.doesNotMatch(inativa, /Reavaliação atrasada/, 'inativo não deve reavaliação, como na lista');
  assert.match(inativa, /<span class="status inativo">Inativo<\/span>/);
});

test('cabeçalho: foto quando tem, iniciais quando não; sem objetivo, sem a linha', () => {
  assert.match(htmlCabecalho({ ...ana, fotoUrl: 'https://x/f.webp' }, HOJE), /<img src="https:\/\/x\/f\.webp" alt="" \/>/);
  const sem = htmlCabecalho({ id: '9', nome: 'Bia Souza' }, HOJE);
  assert.match(sem, /<span class="pc-ini">BS<\/span>/);
  assert.doesNotMatch(sem, /pc-obj/);
  assert.match(htmlCabecalho({ id: '9' }, HOJE), /Sem nome/);
});

test('cabeçalho: texto digitado é escapado', () => {
  const h = htmlCabecalho({ id: '<i>', nome: '<script>x</script>', objetivo: 'a & b' }, HOJE);
  assert.doesNotMatch(h, /<script>|<i>/);
  assert.match(h, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(h, /a &amp; b/);
});

test('abas: tablist com uma só selecionada e só ela no Tab do teclado', () => {
  const h = htmlAbas('matriz');
  assert.equal((h.match(/role="tab"/g) || []).length, ABAS.length);
  assert.equal((h.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(h, /id="aba-matriz" aria-controls="tab-matriz" aria-selected="true" tabindex="0" data-tab="matriz"/);
  assert.equal((h.match(/tabindex="0"/g) || []).length, 1);
  assert.match(htmlAbas('dados', [{ id: 'financeiro', rotulo: 'Financeiro' }]), /data-tab="financeiro" type="button">Financeiro</, 'aba nova = uma linha a mais');
});

test('abas: cada aba tem o seu painel no index.html, e cada painel tem aba', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const paineis = [...html.matchAll(/class="tab-panel[^"]*" id="tab-([a-z]+)" role="tabpanel" aria-labelledby="aba-([a-z]+)"/g)];
  assert.deepEqual(paineis.map((m) => m[1]).sort(), ABAS.map((a) => a.id).sort());
  for (const m of paineis) assert.equal(m[1], m[2], `painel tab-${m[1]} rotulado pela aba certa`);
  assert.match(html, /<nav class="perfil-abas" id="perfil-abas" role="tablist"/);
  assert.match(html, /<header class="perfil-cab" id="perfil-cab">/);
});
