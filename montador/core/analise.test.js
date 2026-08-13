// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { somarVolume, analisarSemana, agruparPorSemana, analisarMes } from './analise.js';
import { MINIMO_SEMANAL } from '../config/frequencias.js';
import { diaEditavel, alternativasDoDia, trocarExercicioDoDia, alunosDoDia } from './editar-dia.js';
import { EXERCICIO_POR_ID } from '../data/exercicios.js';

const dia = (dateId, vol, modalidade = 'hipertrofia') => ({ dateId, modalidade, volPorPadrao: vol });
/** Uma semana que fecha o mínimo em todos os padrões cobrados. */
const cheio = () => ({ empurrar: 9, puxar: 9, quadriceps: 9, posterior_gluteo: 9, core: 3 });

// -------- soma e semana --------

test('somarVolume acumula por padrão e ignora treino sem volume', () => {
  const v = somarVolume([dia('2026-09-01', { puxar: 4 }), dia('2026-09-02', { puxar: 3, core: 2 }), dia('2026-09-03', undefined)]);
  assert.equal(v.puxar, 7);
  assert.equal(v.core, 2);
  assert.equal(v.empurrar, 0);
});

test('semana sem treino não recebe recomendação', () => {
  const a = analisarSemana([]);
  assert.equal(a.status, 'vazia');
  assert.equal(a.recomendacao, '');
  assert.equal(a.fechada, false);
});

test('semana que bate todos os mínimos é declarada fechada', () => {
  const a = analisarSemana([dia('2026-09-01', cheio())]);
  assert.equal(a.status, 'fechada');
  assert.equal(a.fechada, true);
  assert.equal(a.faltas.length, 0);
  assert.match(a.recomendacao, /fechada/i);
});

test('semana incompleta diz o que falta e quantos exercícios cobrem', () => {
  const a = analisarSemana([dia('2026-09-01', { empurrar: 9, puxar: 1, quadriceps: 9, posterior_gluteo: 9, core: 3 })]);
  assert.equal(a.status, 'incompleta');
  assert.equal(a.faltas[0].padrao, 'puxar');
  assert.equal(a.faltas[0].falta, 8);
  assert.match(a.recomendacao, /Puxar/);
  assert.match(a.recomendacao, /faltam 8/);
});

test('as faltas vêm da maior para a menor — é a ordem em que o coach age', () => {
  const a = analisarSemana([dia('2026-09-01', { empurrar: 8, puxar: 1, quadriceps: 5, posterior_gluteo: 9, core: 3 })]);
  assert.deepEqual(a.faltas.map((f) => f.padrao), ['puxar', 'quadriceps', 'empurrar']);
});

test('excesso só vira alerta quando há déficit grave em outro padrão', () => {
  // passar do mínimo não é problema: o mínimo é piso, não teto
  const sóExcesso = analisarSemana([dia('2026-09-01', { ...cheio(), empurrar: 30 })]);
  assert.equal(sóExcesso.status, 'fechada');

  // o mesmo excesso COM um padrão pela metade é desequilíbrio
  const desequilibrada = analisarSemana([dia('2026-09-01', { ...cheio(), empurrar: 30, puxar: 2 })]);
  assert.equal(desequilibrada.status, 'desequilibrada');
  assert.match(desequilibrada.recomendacao, /Desequil/i);
  assert.match(desequilibrada.recomendacao, /troca livre/i);
});

test('a recomendação muda conforme a semana já esteja cheia de treinos', () => {
  const vol = { empurrar: 9, puxar: 2, quadriceps: 9, posterior_gluteo: 9, core: 3 };
  const poucos = analisarSemana([dia('2026-09-01', vol)]);
  const muitos = analisarSemana([1, 2, 3, 4].map((i) => dia(`2026-09-0${i}`, i === 1 ? vol : {})));
  assert.match(poucos.recomendacao, /um dia de|exercício/i);
  assert.match(muitos.recomendacao, /trocar exercício num dia já salvo/i);
});

// -------- agrupamento por semana --------

test('agrupa os dias do mês em semanas que começam na segunda', () => {
  // Setembro/2026: dia 1 é terça. Semana 1 = 1–6, semana 2 = 7–13.
  const g = agruparPorSemana('2026-09', [
    dia('2026-09-01', {}), dia('2026-09-03', {}), dia('2026-09-07', {}), dia('2026-09-14', {}),
  ]);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.semana), [1, 2, 3]);
  assert.equal(g[0].treinos.length, 2);
  assert.match(g[0].rotulo, /Semana 1 · 01–03/);
});

test('semana sem treino nenhum não aparece na lista', () => {
  const g = agruparPorSemana('2026-09', [dia('2026-09-01', {}), dia('2026-09-21', {})]);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.semana), [1, 4]);
});

// -------- mês --------

test('o mínimo do mês escala com as semanas que TIVERAM treino', () => {
  // Duas semanas com treino: a meta do mês é o dobro da semanal, não 4×.
  const m = analisarMes('2026-09', [dia('2026-09-01', cheio()), dia('2026-09-08', cheio())]);
  assert.equal(m.nSemanas, 2);
  const puxar = m.metas.find((x) => x.padrao === 'puxar');
  assert.equal(puxar.meta, MINIMO_SEMANAL.puxar * 2);
  assert.equal(puxar.pct, 100);
});

test('mês vazio não inventa déficit', () => {
  const m = analisarMes('2026-09', []);
  assert.equal(m.nTreinos, 0);
  assert.equal(m.nSemanas, 0);
  assert.equal(m.mediaPorSemana, 0);
  assert.ok(m.metas.every((x) => x.pct === 0));
});

test('mais e menos trabalhado saem em % da meta, não em séries brutas', () => {
  // core tem mínimo 3 e puxar tem 9: comparar séries diretas diria sempre que o
  // core é o mais fraco, o que é falso.
  const m = analisarMes('2026-09', [dia('2026-09-01', { empurrar: 9, puxar: 9, quadriceps: 9, posterior_gluteo: 9, core: 9 })]);
  assert.equal(m.maisTrabalhado.padrao, 'core');   // 9/3 = 300%
  assert.equal(m.maisTrabalhado.pct, 300);
  assert.equal(m.menosTrabalhado.pct, 100);
  assert.equal(m.amplitude, 200);
});

test('a distribuição por modalidade conta os dias de cada uma', () => {
  const m = analisarMes('2026-09', [
    dia('2026-09-01', {}, 'forca'), dia('2026-09-02', {}, 'forca'),
    dia('2026-09-03', {}, 'hibrido'), dia('2026-09-04', {}, 'murph'),
  ]);
  assert.equal(m.porModalidade.forca, 2);
  assert.equal(m.porModalidade.hibrido, 1);
  assert.equal(m.porModalidade.murph, 1);
  assert.equal(m.nTreinos, 4);
});

test('conta quantas semanas fecharam de verdade', () => {
  const m = analisarMes('2026-09', [
    dia('2026-09-01', cheio()),                                   // semana 1 fecha
    dia('2026-09-08', { empurrar: 2 }),                           // semana 2 não
  ]);
  assert.equal(m.nSemanas, 2);
  assert.equal(m.semanasFechadas, 1);
  assert.equal(m.mediaPorSemana, 1);
});

// -------- edição do dia salvo --------

const snapPlano = () => ({
  dia: 'seg', modalidade: 'hipertrofia', nAlunos: 8,
  viabilidade: { ok: true, tamanhoGrupo: 2 },
  volPorPadrao: {},
  exercicios: [
    { id: 'supino_smith', nome: 'Supino no Smith', padrao: 'empurrar', equipamento: ['smith'],
      reps: '8–12 reps', descansoSeg: 75, seriesRef: 4, niveis: {}, tecnica: { tipo: 'drop_set', label: 'Drop Set', detalhe: 'x' } },
    { id: 'remada_curvada_barra', nome: 'Remada curvada', padrao: 'puxar', equipamento: ['barra_livre'],
      reps: '8–12 reps', descansoSeg: 75, seriesRef: 4, niveis: {}, tecnica: null },
  ],
});

test('só o formato plano é editável', () => {
  assert.equal(diaEditavel(snapPlano()), true);
  for (const k of ['hyrox', 'hiit', 'gap', 'hibrido', 'murph']) {
    assert.equal(diaEditavel({ ...snapPlano(), [k]: {} }), false, `${k} não deveria ser editável`);
  }
  assert.equal(diaEditavel(null), false);
  assert.equal(diaEditavel({ exercicios: [] }), false);
});

test('a troca restrita mantém o padrão; a livre alcança o catálogo', () => {
  const s = snapPlano();
  const restrita = alternativasDoDia(s, 1);
  const livre = alternativasDoDia(s, 1, { livre: true });
  assert.ok(restrita.length > 0);
  assert.ok(restrita.every((c) => c.exercicio.padrao === 'puxar'));
  assert.ok(restrita.every((c) => c.viavel), 'a restrita deve filtrar por viabilidade');
  assert.ok(livre.length > restrita.length);
  assert.ok(livre.some((c) => c.mudaPadrao));
});

test('nenhuma alternativa repete exercício já presente no dia', () => {
  const s = snapPlano();
  for (const modo of [{}, { livre: true }]) {
    for (const c of alternativasDoDia(s, 0, modo)) {
      assert.notEqual(c.exercicio.id, 'supino_smith');
      assert.notEqual(c.exercicio.id, 'remada_curvada_barra');
    }
  }
});

test('a troca recalcula volume, cargas e viabilidade, e preserva o slot', () => {
  const s = snapPlano();
  const novo = EXERCICIO_POR_ID.abdominal_supra;
  assert.ok(novo, 'catálogo sem abdominal_supra (teste perdeu o sentido)');
  const depois = trocarExercicioDoDia(s, 1, novo);

  assert.equal(depois.exercicios[1].id, novo.id);
  assert.equal(depois.exercicios[1].padrao, novo.padrao);
  // o que é do SLOT sobrevive à troca
  assert.equal(depois.exercicios[1].seriesRef, 4);
  assert.equal(depois.exercicios[1].reps, '8–12 reps');
  assert.equal(depois.exercicios[1].descansoSeg, 75);
  // cargas por nível recalculadas para o exercício novo
  assert.ok(depois.exercicios[1].niveis.intermediario?.carga);
  // volume segue a composição nova
  assert.ok((depois.volPorPadrao.core || 0) > 0, 'core não recebeu volume');
  assert.equal(depois.volPorPadrao.puxar || 0, 0, 'puxar deveria ter zerado');
  assert.equal(typeof depois.viabilidade.ok, 'boolean');
  // e o original não foi mutado
  assert.equal(s.exercicios[1].id, 'remada_curvada_barra');
});

test('a técnica é do slot e sobrevive à troca do exercício', () => {
  const depois = trocarExercicioDoDia(snapPlano(), 0, EXERCICIO_POR_ID.crucifixo_halter);
  assert.equal(depois.exercicios[0].tecnica.tipo, 'drop_set');
});

test('a troca registra o histórico da edição', () => {
  const um = trocarExercicioDoDia(snapPlano(), 0, EXERCICIO_POR_ID.crucifixo_halter);
  assert.ok(um.editadoEm);
  assert.equal(um.trocas.length, 1);
  assert.equal(um.trocas[0].de, 'Supino no Smith');
  const dois = trocarExercicioDoDia(um, 1, EXERCICIO_POR_ID.abdominal_supra);
  assert.equal(dois.trocas.length, 2, 'a segunda troca não se acumulou');
});

test('dia salvo antes de nAlunos existir deriva a turma do tamanho do grupo', () => {
  const s = snapPlano();
  delete s.nAlunos;
  // 2 exercícios, grupos de 2 → turma de ~4
  assert.equal(alunosDoDia(s), 4);
  assert.equal(alunosDoDia({ ...snapPlano(), nAlunos: 12 }), 12);
});

test('trocar num dia não-editável devolve o mesmo snapshot', () => {
  const hyrox = { ...snapPlano(), hyrox: {} };
  assert.equal(trocarExercicioDoDia(hyrox, 0, EXERCICIO_POR_ID.crucifixo_halter), hyrox);
});
