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
  agacho: { id: 'agacho', nome: 'Agachamento livre', padrao: 'agachar', equipamento: ['barra'],
    musculosPrimarios: ['pernas'], musculosSecundarios: ['gluteos'], tempoMedioSeg: 45 },
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

test('série digitada 1 com "abrir por nível" dá exatamente 1 ao intermediário — o piso do gerador não se aplica', () => {
  // Antes do ajuste, seriesDoNivel tinha piso 2 fixo e o intermediário virava "2"
  // mesmo o coach tendo digitado "1" — a mesma prescrição que itensVolume contava
  // como 1, contradizendo o card do aluno.
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 1, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] },
  ] }));
  const n = r.extra.livre.blocos[0].exercicios[0].niveis;
  assert.equal(n.intermediario.series, 1);
});

test('o volume contado bate com a série prescrita ao intermediário, mesmo digitando 1', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 1, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] },
  ] }));
  const n = r.extra.livre.blocos[0].exercicios[0].niveis;
  assert.equal(r.vol.totalSeries, n.intermediario.series);
});

test('série digitada 4 com "abrir por nível" ainda escala 3/4/5 — comportamento inalterado', () => {
  const r = montarLivre(base({ blocos: [
    { nome: 'A', series: 4, reps: '10', descansoSeg: 60, porNivel: true, exercicios: [{ id: 'supino' }] },
  ] }));
  const n = r.extra.livre.blocos[0].exercicios[0].niveis;
  assert.equal(n.iniciante.series, 3);
  assert.equal(n.intermediario.series, 4);
  assert.equal(n.avancado.series, 5);
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

/* ---------- bi-set (linhas linkadas) ---------- */

test('linhas linkadas formam um grupo e herdam a série do líder', () => {
  const r = montarLivre({
    blocos: [{ series: 3, reps: '10', descansoSeg: 60, exercicios: [
      { id: 'supino', series: 4 },
      { id: 'remada', series: 2, linkado: true },   // ignorado: o grupo manda
      { id: 'agacho' },
    ] }],
    porId,
  });
  const ex = r.extra.livre.blocos[0].exercicios;
  assert.deepEqual(ex.map((e) => e.grupo), [0, 0, 1]);
  assert.deepEqual(ex.map((e) => e.seriesRef), [4, 4, 3]);
});

test('o grupo cai inteiro quando o líder não tem série', () => {
  const r = montarLivre({
    blocos: [{ series: '', exercicios: [
      { id: 'supino', series: '' },
      { id: 'remada', series: 5, linkado: true },
      { id: 'agacho', series: 3 },
    ] }],
    porId,
  });
  const ex = r.extra.livre.blocos[0].exercicios;
  assert.deepEqual(ex.map((e) => e.id), ['agacho']);
  assert.equal(ex[0].grupo, 1, 'o grupo do agacho não renumera quando o de cima cai');
});

test('linkado na primeira linha válida não tem a quem linkar', () => {
  const r = montarLivre(base({ blocos: [
    { series: 3, descansoSeg: 60, exercicios: [
      { id: 'supino', linkado: true },   // primeira linha: nada acima para linkar
      { id: 'remada' },
    ] },
  ] }));
  const ex = r.extra.livre.blocos[0].exercicios;
  assert.deepEqual(ex.map((e) => e.grupo), [0, 1]);
});

test('o bi-set cobra o descanso uma vez só', () => {
  // dois exercícios de tempoMedioSeg 40 (remada), 3 séries, descanso 60:
  //   soltos  → 3×(40+60)+20 + 3×(40+60)+20 = 640
  //   linkados→ 3×(40+40+60) + 20×2 = 460
  const soltos = montarLivre(base({ blocos: [
    { series: 3, descansoSeg: 60, exercicios: [{ id: 'remada' }, { id: 'remada' }] },
  ] }));
  const linkados = montarLivre(base({ blocos: [
    { series: 3, descansoSeg: 60, exercicios: [{ id: 'remada' }, { id: 'remada', linkado: true }] },
  ] }));
  assert.equal(soltos.extra.tempos.principalSeg, 640);
  assert.equal(linkados.extra.tempos.principalSeg, 460);
});

test('grupo de um membro produz o mesmo tempo de antes', () => {
  // não-regressão: sem linkado, a fórmula do bi-set com 1 membro tem de bater
  // exatamente com a fórmula de hoje (série × (tempo + descanso) + 20).
  const r = montarLivre(base({ blocos: [
    { series: 2, descansoSeg: 60, exercicios: [{ id: 'supino' }] },
  ] }));
  assert.equal(r.extra.tempos.principalSeg, 2 * (35 + 60) + 20);
});

test('o volume não muda por linkar — os dois exercícios foram executados', () => {
  const soltos = montarLivre(base({ blocos: [
    { series: 3, descansoSeg: 60, exercicios: [{ id: 'remada' }, { id: 'supino' }] },
  ] }));
  const linkados = montarLivre(base({ blocos: [
    { series: 3, descansoSeg: 60, exercicios: [{ id: 'remada' }, { id: 'supino', linkado: true }] },
  ] }));
  assert.deepEqual(linkados.vol.porMusculo, soltos.vol.porMusculo);
});

test('o descansoSeg de cada linha no snapshot continua sendo o efetivo dela, não o do grupo', () => {
  const r = montarLivre(base({ blocos: [
    { series: 3, descansoSeg: 60, exercicios: [
      { id: 'supino' },
      { id: 'remada', descansoSeg: 90, linkado: true },
    ] },
  ] }));
  const [a, b] = r.extra.livre.blocos[0].exercicios;
  assert.equal(a.descansoSeg, 60);
  assert.equal(b.descansoSeg, 90, 'o dado da linha não muda, só a conta de tempo usa o do líder');
});
