// @ts-check
/**
 * Testes da montagem livre.
 * Rodar: node --test montador/core/livre.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarLivre } from './livre.js';
import { calcularVolume } from './volume.js';

/** Catálogo de mentira: o módulo recebe `porId`, então o teste não precisa do real. */
const CAT = {
  supino: { id: 'supino', nome: 'Supino reto', padrao: 'empurrar', equipamento: ['smith'],
    musculosPrimarios: ['peito'], musculosSecundarios: ['triceps'], tempoMedioSeg: 35 },
  remada: { id: 'remada', nome: 'Remada curvada', padrao: 'puxar', equipamento: ['barra'],
    musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'], tempoMedioSeg: 40 },
  burpee: { id: 'burpee', nome: 'Burpee', padrao: 'corpo_inteiro', equipamento: ['corporal'],
    musculosPrimarios: ['corpo'], musculosSecundarios: [], tempoMedioSeg: 30 },
  mob: { id: 'mob', nome: 'Mobilidade de quadril', padrao: 'mobilidade', equipamento: ['corporal'],
    musculosPrimarios: [], musculosSecundarios: [], tempoMedioSeg: 30 },
};
const porId = (id) => CAT[id] || null;

const base = (over = {}) => ({
  classificacao: 'hipertrofia', aquecimento: [], blocos: [], porId, ...over,
});

/* ---------- volume ---------- */

test('o volume soma todos os blocos', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 4, reps: '8–12', descansoSeg: 75, porNivel: true, exercicios: [{ id: 'supino' }] },
    { nome: 'B', series: 3, reps: '12', descansoSeg: 30, porNivel: false, exercicios: [{ id: 'remada' }] },
  ] }));
  assert.equal(r.vol.totalSeries, 7);
  assert.equal(r.vol.porPadrao.empurrar, 4);
  assert.equal(r.vol.porPadrao.puxar, 3);
});

test('o aquecimento não entra no volume — igual às outras abas', () => {
  const r = montarLivre(base({
    aquecimento: [{ id: 'mob', duracaoSeg: 90 }],
    blocos: [{ nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] }],
  }));
  assert.equal(r.vol.totalSeries, 3);
  assert.equal(r.extra.tempos.aquecimentoSeg, 90);
});

test('exercício repetido no dia conta duas vezes — é o que o aluno vai fazer', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true,
      exercicios: [{ id: 'supino' }, { id: 'supino' }] },
  ] }));
  assert.equal(r.vol.porPadrao.empurrar, 6);
  assert.equal(r.nItens, 2);
});

test('o volume de um dia livre é idêntico ao de um dia plano com os mesmos exercícios', () => {
  // A prova de que a contagem da semana não se perde na forma livre.
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 4, reps: '8', descansoSeg: 75, porNivel: true, exercicios: [{ id: 'supino' }] },
    { nome: 'B', series: 3, reps: '12', descansoSeg: 30, porNivel: false, exercicios: [{ id: 'burpee' }] },
  ] }));
  const plano = calcularVolume([
    { exercicio: CAT.supino, series: 4 },
    { exercicio: CAT.burpee, series: 3 },
  ]);
  assert.deepEqual(r.vol.porPadrao, plano.porPadrao);
  assert.deepEqual(r.vol.porMusculo, plano.porMusculo);
});

/* ---------- herança de prescrição ---------- */

test('a linha herda séries, reps e descanso do bloco', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 4, reps: '8–12', descansoSeg: 75, porNivel: true, exercicios: [{ id: 'supino' }] },
  ] }));
  const ex = r.extra.livre.blocos[0].exercicios[0];
  assert.equal(ex.seriesRef, 4);
  assert.equal(ex.reps, '8–12');
  assert.equal(ex.descansoSeg, 75);
});

test('a linha sobrescreve qualquer um dos três, sem afetar as vizinhas', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 4, reps: '8–12', descansoSeg: 75, porNivel: true, exercicios: [
      { id: 'supino', series: 6 },
      { id: 'remada', reps: '20', descansoSeg: 30 },
    ] },
  ] }));
  const [a, b] = r.extra.livre.blocos[0].exercicios;
  assert.equal(a.seriesRef, 6);
  assert.equal(a.reps, '8–12');
  assert.equal(b.seriesRef, 4);
  assert.equal(b.reps, '20');
  assert.equal(b.descansoSeg, 30);
});

/* ---------- níveis ---------- */

test('bloco com "abrir por nível" ligado escala os três níveis', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 4, reps: '8', descansoSeg: 75, porNivel: true, exercicios: [{ id: 'supino' }] },
  ] }));
  const n = r.extra.livre.blocos[0].exercicios[0].niveis;
  assert.equal(n.intermediario.series, 4);
  assert.ok(n.iniciante.series < n.avancado.series, 'iniciante tem de fazer menos que o avançado');
});

test('bloco com "abrir por nível" desligado dá o mesmo número para todos — o caso do WOD', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'WOD', series: 3, reps: '12', descansoSeg: 30, porNivel: false, exercicios: [{ id: 'burpee' }] },
  ] }));
  const n = r.extra.livre.blocos[0].exercicios[0].niveis;
  assert.equal(n.iniciante.series, 3);
  assert.equal(n.intermediario.series, 3);
  assert.equal(n.avancado.series, 3);
});

test('mesmo com séries fixas, a carga sugerida continua existindo por nível', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'WOD', series: 3, reps: '12', descansoSeg: 30, porNivel: false, exercicios: [{ id: 'supino' }] },
  ] }));
  const n = r.extra.livre.blocos[0].exercicios[0].niveis;
  assert.ok(typeof n.iniciante.carga === 'string');
  assert.ok(typeof n.avancado.carga === 'string');
});

/* ---------- blocos e linhas que não valem ---------- */

test('bloco sem exercício válido some do snapshot', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] },
    { nome: 'Vazio', series: 3, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [] },
  ] }));
  assert.equal(r.extra.livre.blocos.length, 1);
  assert.equal(r.extra.livre.blocos[0].nome, 'A');
});

test('bloco sem nome ganha nome pela posição de entrada', () => {
  const r = montarLivre(base({ blocos: [
    { nome: '  ', series: 3, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] },
    { nome: '', series: 3, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'remada' }] },
  ] }));
  assert.deepEqual(r.extra.livre.blocos.map((b) => b.nome), ['Bloco 1', 'Bloco 2']);
});

test('linha sem séries não entra no volume nem no snapshot', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: '', reps: '10', descansoSeg: 60, porNivel: true,
      exercicios: [{ id: 'supino' }, { id: 'remada', series: 3 }] },
  ] }));
  assert.equal(r.nItens, 1);
  assert.equal(r.extra.livre.blocos[0].exercicios.length, 1);
  assert.equal(r.extra.livre.blocos[0].exercicios[0].id, 'remada');
});

test('exercício que não existe no catálogo é ignorado', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true,
      exercicios: [{ id: 'fantasma' }, { id: 'supino' }] },
  ] }));
  assert.equal(r.nItens, 1);
});

test('dia inteiro vazio devolve nItens 0 e nenhum bloco', () => {
  const r = montarLivre(base());
  assert.equal(r.nItens, 0);
  assert.equal(r.extra.livre.blocos.length, 0);
  assert.equal(r.vol.totalSeries, 0);
});

/* ---------- técnica e aquecimento ---------- */

test('a técnica escolhida vai congelada para o snapshot', () => {
  const tec = { tipo: 'drop_set', label: 'Drop-set', detalhe: 'Reduz a carga e continua.' };
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true,
      exercicios: [{ id: 'supino', tecnica: tec }] },
  ] }));
  assert.deepEqual(r.extra.livre.blocos[0].exercicios[0].tecnica, tec);
});

test('sem técnica, o campo é null e não undefined — o snapshot vai para o Firestore', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 3, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] },
  ] }));
  assert.equal(r.extra.livre.blocos[0].exercicios[0].tecnica, null);
});

test('o aquecimento sai com nome resolvido e duração, e soma o tempo', () => {
  const r = montarLivre(base({ aquecimento: [
    { id: 'mob', duracaoSeg: 90 },
    { id: 'fantasma', duracaoSeg: 60 },
  ] }));
  assert.deepEqual(r.extra.aquecimento, [{ nome: 'Mobilidade de quadril', duracaoSeg: 90 }]);
  assert.equal(r.extra.tempos.aquecimentoSeg, 90);
});

test('o tempo total soma aquecimento, parte principal e a folga de transição', () => {
  const r = montarLivre(base({
    aquecimento: [{ id: 'mob', duracaoSeg: 100 }],
    blocos: [{ nome: 'A', series: 2, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] }],
  }));
  // 2 × (35 + 60) + 20 = 210
  assert.equal(r.extra.tempos.principalSeg, 210);
  assert.equal(r.extra.tempos.totalSeg, 100 + 210 + 300);
});
