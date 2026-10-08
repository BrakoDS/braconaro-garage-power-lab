// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/versionamento.test.js
 *
 * O cache do navegador: cada import da Gestão leva a versão (`?v=N`) — a mesma
 * do `main.js?v=N` no index.html —, e nenhum arquivo é carregado por duas URLs.
 * Para o navegador, `estado.js` e `estado.js?v=11` são DOIS módulos: um import
 * esquecido sem versão partiria o barramento (ou o banco) em duas cópias.
 *
 * Para mudar a versão num deploy: node ferramentas/versionar-gestao.mjs <N>
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grafo, duplicados } from '../../ferramentas/grafo-modulos.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const versao = (/src="\.\/main\.js\?v=(\d+)"/.exec(index) || [])[1];
const g = grafo('coach/gestao-de-alunos/main.js');

test('versão: o index.html carrega o main.js com versão', () => {
  assert.match(versao || '', /^\d+$/);
});

test('versão: nenhum módulo é carregado por duas URLs (duas cópias = dois barramentos, dois bancos)', () => {
  assert.deepEqual(duplicados(g), []);
  assert.ok(g.size > 60, `o grafo inteiro foi percorrido (${g.size} módulos)`);
});

test('versão: todo módulo da Gestão é importado com a versão do main.js', () => {
  const errados = [...g]
    .filter(([arq]) => arq.startsWith('coach/gestao-de-alunos/') && !arq.endsWith('/main.js'))
    .filter(([, urls]) => [...urls].some((u) => !u.endsWith(`?v=${versao}`)))
    .map(([arq, urls]) => `${arq}: ${[...urls].join(', ')}`);
  assert.deepEqual(errados, []);
});

test('versão: o que mudou no compartilhado e só a Gestão usa também leva a versão', () => {
  // medalhasDaFicha nasceu nesta versão: um gamificacao.js velho em cache
  // derrubaria o carregamento inteiro ("não exporta medalhasDaFicha").
  assert.deepEqual([...g.get('compartilhado/regras/gamificacao.js') || []], [`/compartilhado/regras/gamificacao.js?v=${versao}`]);
});

test('versão: compartilhado/firebase fica SEM versão — a vitrine troca o config.js casando a URL exata', () => {
  // Com `config.js?v=N`, o import map da vitrine local deixaria de casar e ela
  // carregaria o config de verdade: a vitrine falaria com a produção.
  assert.deepEqual([...g.get('compartilhado/firebase/config.js') || []], ['/compartilhado/firebase/config.js']);
  for (const [arq, urls] of g) {
    if (arq.startsWith('compartilhado/firebase/')) assert.ok([...urls].every((u) => !u.includes('?')), `${arq} com versão`);
  }
});
