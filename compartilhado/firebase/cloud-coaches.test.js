// @ts-check
/**
 * Trava de texto sobre `cloud.js`: o documento `coaches/{uid}` não pode voltar a
 * receber o estado inteiro.
 *
 * Foi assim até 15/09/2026, e é o que levava o documento ao teto de 1 MB do
 * Firestore — passando dele, o `setDoc` falha e o coach não vê erro na tela.
 * Um caminho novo que escreva lá direto reabre o problema sem quebrar teste
 * nenhum de comportamento, porque tudo continua funcionando até encher.
 *
 * Rodar: node --test compartilhado/firebase/cloud-coaches.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');

test('so os helpers de referencia montam caminho em coaches/', () => {
  const linhas = src.split('\n').filter((l) => l.includes("'coaches'") && !l.trimStart().startsWith('*'));
  assert.deepEqual(linhas.map((l) => l.trim().split(' = ')[0]), [
    'const refCoach',
    'const refMes',
    'const refArquivo',
    'const refMeses',
  ], 'caminho de coaches/ fora dos helpers: passe pelo refCoach/refMes/refArquivo/refMeses');
});

test('toda escrita no documento do coach leva so a fatia dele', () => {
  const escritas = [...src.matchAll(/(?:setDoc|lote\.set)\(refCoach\([^)]*\),\s*([^\n]+)/g)].map((m) => m[1]);
  assert.ok(escritas.length >= 2, 'esperava as escritas do envio e da migracao — atualize esta trava');
  for (const arg of escritas) {
    assert.ok(arg.includes('fatiaDoCoach') || arg.includes('coach)'),
      `escreve no documento do coach sem passar por fatiaDoCoach: ${arg}`);
  }
});

test('o mes e gravado com o campo treinos, e nada alem', () => {
  const escritas = [...src.matchAll(/(?:setDoc|lote\.set)\(refMes\([^)]*\),\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(escritas.length >= 2, 'esperava a gravacao do envio e a da migracao');
  for (const campos of escritas) {
    assert.match(campos, /treinos:/, 'documento de mes sem o campo treinos');
    assert.doesNotMatch(campos, /alunos:|config:|programas:/, 'o mes nao guarda alunos, config nem programas');
  }
});
