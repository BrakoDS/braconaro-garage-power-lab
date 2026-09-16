// @ts-check
/**
 * Rodar: node --test coach/montador-individual/core/para-portal.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraPortal, temConteudoParaPortal } from './para-portal.js';

const treino = (extra = {}) => ({
  dateId: '2026-09-16', dia: 'qua', estrutura: 'musculacao',
  aquecimento: [{ nome: 'Mobilidade de quadril', duracaoSeg: 90 }, { nome: '', duracaoSeg: 60 }],
  blocos: [{ nome: 'Principal', tipo: 'principal', exercicios: [
    { id: 'supino', nome: 'Supino reto halter', padrao: 'empurrar', series: 3, reps: '8–12', descansoSeg: 75, travado: false },
    { id: '', nome: '', series: 3, travado: false },
  ] }],
  ...extra,
});

test('o dia sai no formato de blocos que o Portal ja renderiza', () => {
  const d = paraPortal(treino());
  assert.equal(d.modalidade, 'Musculação');
  assert.equal(d.livre.blocos.length, 1);
  assert.equal(d.livre.blocos[0].tipo, 'series');
  const ex = d.livre.blocos[0].exercicios[0];
  assert.equal(ex.nome, 'Supino reto halter');
  assert.equal(ex.reps, '8–12');
  assert.equal(ex.descansoSeg, 75);
});

test('o numero da turma vale para os tres niveis', () => {
  // A versão de cada aluno é da Etapa 5. Publicar níveis diferentes agora seria
  // inventar uma prescrição que ninguém calculou.
  const ex = paraPortal(treino()).livre.blocos[0].exercicios[0];
  assert.deepEqual(ex.niveis, {
    iniciante: { series: 3 }, intermediario: { series: 3 }, avancado: { series: 3 },
  });
});

test('linha e aquecimento em branco nao vao para o aluno', () => {
  const d = paraPortal(treino());
  assert.equal(d.livre.blocos[0].exercicios.length, 1, 'a linha sem nome fica no rascunho do coach');
  assert.deepEqual(d.aquecimento.map((a) => a.nome), ['Mobilidade de quadril']);
});

test('bloco por tempo manda o relogio, e nao "3x8-12"', () => {
  const gap = treino({ estrutura: 'gap', blocos: [{ nome: 'Música 1', exercicios: [
    { id: 'x', nome: 'Agachamento', rounds: 8, trabalhoSeg: 20, descansoSeg: 10 },
    { id: 'y', nome: 'Prancha', duracaoSeg: 300 },
  ] }] });
  const [a, b] = paraPortal(gap).livre.blocos[0].exercicios;
  assert.equal(a.reps, '8 rounds de 20s');
  assert.equal(b.reps, '5 min');
  assert.equal(a.niveis, null, 'sem serie escrita, o Portal mostra so a prescricao');
});

test('bloco que ficou sem exercicio nao vai, e dia vazio nao e publicavel', () => {
  const vazio = treino({ blocos: [{ nome: 'Principal', exercicios: [{ id: '', nome: '' }] }] });
  assert.deepEqual(paraPortal(vazio).livre.blocos, []);
  assert.equal(temConteudoParaPortal(vazio), false);
  assert.equal(temConteudoParaPortal(treino()), true);
});
