// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/estado.test.js
 *
 * O barramento que substitui as chamadas diretas entre telas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estado, on, emit, EVENTOS } from './estado.js?v=12';

test('o estado começa vazio e é um objeto só, compartilhado', async () => {
  assert.deepEqual(estado, { uid: null, alunoAtual: null, avalAberta: null });
  estado.uid = 'coach';
  const outro = await import('./estado.js?v=12');
  assert.equal(outro.estado.uid, 'coach', 'quem importa de novo vê o mesmo objeto');
  estado.uid = null;
});

test('emit avisa os ouvintes em ordem, com o dado', () => {
  const visto = [];
  const a = on(EVENTOS.ABRIR_PERFIL, (id) => visto.push(`a:${id}`));
  const b = on(EVENTOS.ABRIR_PERFIL, (id) => visto.push(`b:${id}`));
  emit(EVENTOS.ABRIR_PERFIL, '001');
  assert.deepEqual(visto, ['a:001', 'b:001']);
  a(); b();
});

test('cancelar a escuta funciona, e evento sem ouvinte não quebra', () => {
  let n = 0;
  const parar = on(EVENTOS.ALUNOS_MUDARAM, () => { n++; });
  emit(EVENTOS.ALUNOS_MUDARAM);
  parar();
  emit(EVENTOS.ALUNOS_MUDARAM);
  assert.equal(n, 1);
});

test('um ouvinte que lança não impede os outros', () => {
  const erro = console.error; console.error = () => {};
  try {
    let chegou = false;
    const a = on(EVENTOS.ALUNOS_MUDARAM, () => { throw new Error('quebrei'); });
    const b = on(EVENTOS.ALUNOS_MUDARAM, () => { chegou = true; });
    emit(EVENTOS.ALUNOS_MUDARAM);
    assert.ok(chegou);
    a(); b();
  } finally { console.error = erro; }
});

test('nome de evento errado falha na hora, em vez de virar ouvinte mudo', () => {
  assert.throws(() => on('alunos-mudou', () => {}), /Evento desconhecido/);
  assert.throws(() => emit('abrir-perfill'), /Evento desconhecido/);
});
