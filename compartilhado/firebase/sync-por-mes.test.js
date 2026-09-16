// @ts-check
/**
 * Trava de texto sobre `sync-por-mes.js`: o documento principal não pode voltar a
 * receber o estado inteiro, e a coleção tem que vir de quem chamou.
 *
 * Foi assim até 15/09/2026, com tudo dentro de `coaches/{uid}`, e é o que levava
 * o documento ao teto de 1 MB do Firestore — passando dele, o `setDoc` falha e o
 * coach não vê erro na tela. Um caminho novo que escreva lá direto reabre o
 * problema sem quebrar teste nenhum de comportamento, porque tudo continua
 * funcionando até encher. A coleção chumbada é o outro estrago possível: os dois
 * montadores passariam a disputar o mesmo documento.
 *
 * Rodar: node --test compartilhado/firebase/sync-por-mes.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./sync-por-mes.js', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');

test('a colecao vem do parametro, nunca do codigo', () => {
  const codigo = src.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
  const chumbadas = codigo.filter((l) => /'(coaches|montadorIndividual)'/.test(l));
  assert.deepEqual(chumbadas, [], `colecao chumbada em sync-por-mes.js: ${chumbadas.join(' | ')}`);
  assert.match(src, /_fns\.doc\(_db, colecao, uid\)/, 'o documento principal tem que sair da colecao recebida');
});

test('so os helpers de referencia montam caminho na colecao', () => {
  const linhas = src.split('\n').filter((l) => l.includes('_db, colecao') && !l.trimStart().startsWith('*'));
  assert.deepEqual(linhas.map((l) => l.trim().split(' = ')[0]), [
    'const refDoc',
    'const refMes',
    'const refArquivo',
    'const refMeses',
  ], 'caminho montado fora dos helpers: passe pelo refDoc/refMes/refArquivo/refMeses');
});

test('toda escrita no documento principal leva so a fatia dele', () => {
  const escritas = [...src.matchAll(/(?:setDoc|lote\.set)\(refDoc\([^)]*\),\s*([^\n]+)/g)].map((m) => m[1]);
  assert.ok(escritas.length >= 2, 'esperava as escritas do envio e da migracao — atualize esta trava');
  for (const arg of escritas) {
    assert.ok(arg.includes('fatiaDoDoc') || arg.includes('fatia)'),
      `escreve no documento principal sem passar por fatiaDoDoc: ${arg}`);
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

test('a migracao do formato antigo so roda para quem pediu', () => {
  assert.match(src, /if \(migrarLegado && precisaMigrar\(antigo\)\)/, 'migracao sem a trava do parametro');
  // App novo nasce dividido: ligar a migração nele faria o código procurar um
  // documento velho que nunca existiu, e reagir a lixo se alguém criasse um.
  assert.match(src, /migrarLegado = false/, 'o padrao tem que ser NAO migrar');
});

test('o montador atual continua com a colecao e os campos dele', () => {
  assert.match(cloud, /criarSincronia\(\{ colecao: 'coaches', campos: \['alunos', 'config'\], migrarLegado: true \}\)/,
    'cloud.js mudou de colecao, de campos ou desligou a migracao do formato antigo');
});
