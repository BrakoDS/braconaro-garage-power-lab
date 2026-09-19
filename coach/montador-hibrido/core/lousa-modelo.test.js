// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciciosDo, totalSeries, usoPorImplemento, trocarImplemento, removerExercicio,
  paraGravar, resumo, normalizar,
  paraGravarSemTreino, ehSemTreino, TITULO_SEM_TREINO,
} from './lousa-modelo.js';

/** Um treino no formato que a function devolve. */
const treino = () => ({
  sistema: 'Hipertrofia',
  titulo: 'Full Body A',
  blocos: [
    { id: 'A', nome: 'Mobilidade', exercicios: [
      { nome: 'Mobilidade de Quadril', bloco: 'A', series: 1, reps: '40s', implemento: '', grupamentos: [], observacao: '' },
    ] },
    { id: 'C', nome: 'Força', exercicios: [
      { nome: 'Agachamento Livre', bloco: 'C', series: 4, reps: '8-12', implemento: 'Barra', grupamentos: ['Quadríceps'], observacao: 'RIR 2' },
      { nome: 'Remada Curvada', bloco: 'C', series: 3, reps: '10', implemento: 'Barra', grupamentos: ['Costas'], observacao: '' },
    ] },
  ],
  estimativaSeries: 8,
  substituicoes: [],
  avisos: [],
});

test('achata os exercícios na ordem dos blocos', () => {
  assert.deepEqual(exerciciosDo(treino()).map((e) => e.nome),
    ['Mobilidade de Quadril', 'Agachamento Livre', 'Remada Curvada']);
});

test('treino ausente não quebra a tela', () => {
  assert.deepEqual(exerciciosDo(null), []);
  assert.equal(totalSeries(null), 0);
  assert.equal(resumo(null), '');
});

test('o total de séries é RECALCULADO, não lido do campo que veio do servidor', () => {
  const t = treino();
  t.estimativaSeries = 999; // valor congelado de antes de o coach editar
  assert.equal(totalSeries(t), 8);
});

test('conta o uso por implemento e ignora exercício sem implemento', () => {
  assert.deepEqual(usoPorImplemento(treino()), { Barra: 2 });
});

test('troca por SATURAÇÃO muda todas as linhas daquele implemento', () => {
  const novo = trocarImplemento(treino(), { alvo: 'Barra', de: '', para: 'Halter' });
  assert.deepEqual(usoPorImplemento(novo), { Halter: 2 });
});

test('troca por DUPLICAÇÃO muda só o exercício apontado', () => {
  const novo = trocarImplemento(treino(), { alvo: 'Agachamento Livre', de: 'Barra', para: 'Halter' });
  assert.deepEqual(usoPorImplemento(novo), { Halter: 1, Barra: 1 });
});

test('a troca devolve um treino NOVO — a lousa original continua para a comparação lado a lado', () => {
  const original = treino();
  const novo = trocarImplemento(original, { alvo: 'Barra', de: '', para: 'Halter' });
  assert.equal(original.blocos[1].exercicios[0].implemento, 'Barra');
  assert.notEqual(novo, original);
});

test('troca sem destino é ignorada em vez de apagar o implemento', () => {
  const novo = trocarImplemento(treino(), { alvo: 'Barra', de: '', para: '' });
  assert.deepEqual(usoPorImplemento(novo), { Barra: 2 });
});

test('remover o último exercício de um bloco tira o bloco vazio da tela', () => {
  const novo = removerExercicio(treino(), 'Mobilidade de Quadril');
  assert.deepEqual(novo.blocos.map((b) => b.id), ['C']);
  assert.equal(totalSeries(novo), 7);
});

test('paraGravar recalcula a estimativa e respeita o título que o coach reescreveu', () => {
  const g = paraGravar(treino(), { dateId: '2026-09-16', titulo: '  Segunda pesada  ' });
  assert.equal(g.dateId, '2026-09-16');
  assert.equal(g.treino.titulo, 'Segunda pesada');
  assert.equal(g.treino.estimativaSeries, 8);
  assert.ok(Date.parse(g.geradoEm) > 0, 'geradoEm precisa ser ISO legível — é ele que sustenta a conta de 72h');
});

test('o treino gravado NÃO tem horário — quem decide a hora é a aba Turma', () => {
  // O mesmo treino vai para três horários; um `classTime` no documento dele
  // seria uma segunda resposta para a mesma pergunta, e a errada.
  const g = paraGravar(treino(), { dateId: '2026-09-16', titulo: 'x' });
  assert.equal('classTime' in g, false);
});

test('o texto original é guardado junto — é ele que o Calendário reabre', () => {
  const g = paraGravar(treino(), { dateId: '2026-09-16', titulo: 'x', textoOriginal: 'C — Força\n  Agachamento' });
  assert.ok(g.textoOriginal.includes('Agachamento'));
});

test('texto original gigante é truncado em vez de estourar o documento', () => {
  const g = paraGravar(treino(), { dateId: '2026-09-16', titulo: 'x', textoOriginal: 'a'.repeat(20000) });
  assert.equal(g.textoOriginal.length, 8000);
});

test('sem texto original (treino só de desenho) o campo sai vazio, não indefinido', () => {
  assert.equal(paraGravar(treino(), { dateId: '2026-09-16', titulo: 'x' }).textoOriginal, '');
});

test('título em branco cai no sistema, nunca em string vazia no calendário', () => {
  const t = treino();
  t.titulo = '';
  assert.equal(paraGravar(t, { dateId: '2026-09-16', titulo: '' }).treino.titulo, 'Hipertrofia');
});

test('a normalização casa o jeito que o coach escreve com o jeito que o servidor guarda', () => {
  assert.equal(normalizar('  Agachamento  LIVRE '), 'agachamento livre');
  assert.equal(normalizar('Pull-Up'), 'pull up');
  assert.equal(normalizar('Tríceps'), 'triceps');
});

test('o resumo diz sistema, exercícios e séries', () => {
  assert.equal(resumo(treino()), 'Hipertrofia · 3 exercícios · 8 séries');
});

test('paraGravarSemTreino grava o dia sem treino nenhum', () => {
  const d = paraGravarSemTreino({ dateId: '2026-09-20' });
  assert.equal(d.dateId, '2026-09-20');
  assert.equal(d.semTreino, true);
  assert.equal(d.titulo, TITULO_SEM_TREINO);
  // `treino: null` é o que faz o servidor pular o documento — ver a função.
  assert.equal(d.treino, null);
});

test('o motivo escrito pelo coach vira o título', () => {
  assert.equal(paraGravarSemTreino({ dateId: '2026-09-20', motivo: 'Feriado · 7 de setembro' }).titulo,
    'Feriado · 7 de setembro');
});

test('motivo em branco cai no padrão, e motivo gigante é cortado', () => {
  assert.equal(paraGravarSemTreino({ dateId: '2026-09-20', motivo: '   ' }).titulo, TITULO_SEM_TREINO);
  assert.equal(paraGravarSemTreino({ dateId: '2026-09-20', motivo: 'x'.repeat(200) }).titulo.length, 80);
});

test('NÃO grava blocos vazios: eles passariam no filtro do gatilho de volume', () => {
  const d = paraGravarSemTreino({ dateId: '2026-09-20' });
  // `blocos: []` é array, e `Array.isArray([])` é true — o dia entraria como
  // treino de zero série e inflaria a contagem de treinos da semana.
  assert.equal(d.treino?.blocos, undefined);
});

test('ehSemTreino reconhece a marcação e só ela', () => {
  assert.equal(ehSemTreino(paraGravarSemTreino({ dateId: '2026-09-20' })), true);
  assert.equal(ehSemTreino({ dateId: '2026-09-20', treino: { sistema: 'HIIT' } }), false);
  assert.equal(ehSemTreino({ semTreino: 'sim' }), false, 'só o booleano vale');
  assert.equal(ehSemTreino(null), false);
  assert.equal(ehSemTreino(undefined), false);
});
