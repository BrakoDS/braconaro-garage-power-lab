// @ts-check
/**
 * Trava contra a falha mais cara deste projeto: regra repetida em lugares
 * paralelos, onde um lugar novo nasce sem a parte que os outros têm.
 *
 * Todo ponto que salva o volume de um dia (`volPorPadrao`) tem que salvar também
 * o volume por músculo (`volPorMusculo`). Hoje são quatro. Se aparecer um quinto
 * sem o músculo, o volume por músculo daquele dia some ao salvar — e nenhum teste
 * de comportamento pegaria, porque cada tela funciona sozinha.
 *
 * Rodar: node --test coach/montador-de-treino/core/snapshot-volume.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url)); // coach/montador-de-treino/
const ler = (/** @type {string} */ rel) => readFileSync(RAIZ + rel, 'utf8');
/** `volPorPadrao:` montado a partir de um volume calculado — a forma de um dia salvo. */
const SALVA_VOLUME = /volPorPadrao:\s*(vol\.porPadrao|t\.volume\?\.porPadrao)/g;

test('os quatro pontos que salvam um dia salvam tambem o volume por musculo', () => {
  for (const rel of ['ui/app.js', 'ui/livre.js', 'ui/manual.js', 'core/editar-dia.js']) {
    const src = ler(rel);
    const padrao = (src.match(SALVA_VOLUME) || []).length;
    const musculo = (src.match(/volPorMusculo:/g) || []).length;
    assert.ok(padrao >= 1, `${rel} deixou de salvar volPorPadrao — atualize esta lista`);
    assert.equal(musculo, padrao, `${rel}: ${padrao} volPorPadrao salvo(s), ${musculo} volPorMusculo`);
  }
});

test('nenhum outro arquivo salva o volume de um dia sem o volume por musculo', () => {
  for (const pasta of ['ui', 'core']) {
    for (const nome of readdirSync(RAIZ + pasta)) {
      if (!nome.endsWith('.js') || nome.endsWith('.test.js')) continue;
      const src = ler(`${pasta}/${nome}`);
      const padrao = (src.match(SALVA_VOLUME) || []).length;
      if (!padrao) continue;
      assert.equal((src.match(/volPorMusculo:/g) || []).length, padrao, `${pasta}/${nome} salva volPorPadrao sem volPorMusculo`);
    }
  }
});
