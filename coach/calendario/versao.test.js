// @ts-check
/**
 * Rodar: node --test coach/calendario/versao.test.js
 *
 * O Calendário importa módulos da Gestão. Para o navegador, `db.js?v=N` e
 * `db.js?v=N+1` são DOIS bancos: todo import da Gestão daqui tem de levar a
 * versão que a Gestão usa (a do main.js no index.html dela), e nenhum arquivo
 * pode ser carregado por duas URLs na página do Calendário.
 * Ao subir a Gestão (ferramentas/versionar-gestao.mjs N), troque também aqui:
 *   grep -rl "?v=" coach/calendario | xargs sed -i "s/?v=[0-9]*'/?v=N'/g"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grafo, duplicados } from '../../ferramentas/grafo-modulos.mjs';

const indexGestao = readFileSync(new URL('../gestao-de-alunos/index.html', import.meta.url), 'utf8');
const versao = (/src="\.\/main\.js\?v=(\d+)"/.exec(indexGestao) || [])[1];
const g = grafo('coach/calendario/gate.js');

test('calendário: nenhum módulo por duas URLs', () => {
  assert.deepEqual(duplicados(g), []);
  assert.ok(g.has('coach/calendario/app.js'), 'o grafo chegou ao app');
});

test('calendário: módulo da Gestão vem na versão da Gestão', () => {
  assert.match(versao || '', /^\d+$/);
  const errados = [...g].filter(([arq]) => arq.startsWith('coach/gestao-de-alunos/'))
    .filter(([, urls]) => [...urls].some((u) => !u.endsWith(`?v=${versao}`)))
    .map(([arq, urls]) => `${arq}: ${[...urls].join(', ')}`);
  assert.deepEqual(errados, []);
});
