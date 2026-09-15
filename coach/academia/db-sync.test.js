// @ts-check
/**
 * Trava contra listas paralelas de migração na Academia.
 *
 * O `db.js` roda as migrações de dados em DOIS lugares: soltas no fim do arquivo
 * (quando o módulo carrega) e de novo dentro de `iniciarSync`, depois de baixar a
 * nuvem por cima do que está no navegador. Uma migração que só está na primeira
 * lista roda, e é apagada pela nuvem logo em seguida — nunca chega ao Firestore.
 * Foi assim que `backfillSeparacaoMusculos` nasceu sem efeito, e o comentário do
 * `iniciarSync` conta que o `seedVersion` já se perdeu do mesmo jeito.
 *
 * Rodar: node --test coach/academia/db-sync.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./db.js', import.meta.url), 'utf8');

test('toda migracao que roda ao carregar tambem roda depois da sincronizacao', () => {
  const aoCarregar = [...SRC.matchAll(/^((?:backfill\w+|migrar\w+))\(\);/gm)].map((m) => m[1]);
  const linhaSync = SRC.split(/\r?\n/).find((l) => /const mudou = .*backfill/.test(l));
  assert.ok(aoCarregar.length >= 5, `achei so ${aoCarregar.length} migracoes soltas no fim do db.js — o formato mudou?`);
  assert.ok(linhaSync, 'nao achei a linha `const mudou = ...` do iniciarSync — o formato mudou?');
  const naSync = [...linhaSync.matchAll(/(\w+)\(\)/g)].map((m) => m[1]);
  const faltando = aoCarregar.filter((n) => !naSync.includes(n));
  assert.deepEqual(faltando, [], `rodam ao carregar mas a nuvem apaga em seguida: ${faltando.join(', ')}`);
});
