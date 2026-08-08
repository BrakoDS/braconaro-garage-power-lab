// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MURPH_BLOCOS, MURPH_TOTAL_REPS, MURPH_CARDIO, MURPH_EXECUCAO,
  CINDY_ROUNDS, CINDY_ROUND, gerarMurph, volumeMurph, estimarDuracaoSeg,
} from './murph.js';
import { EXERCICIO_POR_ID } from '../data/exercicios.js';
import { MODALIDADES } from '../config/modalidades.js';

test('o miolo é 100 / 200 / 300 e soma 600', () => {
  assert.deepEqual(MURPH_BLOCOS.map((b) => b.reps), [100, 200, 300]);
  assert.equal(MURPH_TOTAL_REPS, 600);
});

test('os três movimentos existem no catálogo do box', () => {
  // Se um id mudar no catálogo, o Murph passa a apontar para o vazio e ninguém
  // percebe — o card mostra o nome escrito à mão aqui, não o do exercício.
  for (const b of MURPH_BLOCOS) {
    const ex = EXERCICIO_POR_ID[b.exercicioId];
    assert.ok(ex, `${b.nome}: id "${b.exercicioId}" não existe no catálogo`);
    assert.equal(ex.padrao, b.padrao, `${b.nome}: padrão divergente do catálogo`);
  }
});

test('não há pull-up — a puxada substitui, e é a única com aparelho', () => {
  const puxada = MURPH_BLOCOS[0];
  assert.equal(puxada.base, 'Pull-up');
  assert.ok(puxada.equipamento.includes('monocross'));
  // Flexão e agachamento são peso corporal: é o que permite a turma inteira
  // trabalhar junto enquanto a puxada roda em rodízio.
  for (const b of MURPH_BLOCOS.slice(1)) {
    assert.deepEqual(b.equipamento, ['corporal'], `${b.nome} deveria ser peso corporal`);
  }
});

test('o round do Cindy fecha exatamente as 600 repetições', () => {
  assert.equal(CINDY_ROUNDS, 20);
  assert.deepEqual(CINDY_ROUND.map((r) => r.reps), [5, 10, 15]);
  const total = CINDY_ROUND.reduce((a, r) => a + r.reps, 0) * CINDY_ROUNDS;
  assert.equal(total, MURPH_TOTAL_REPS, 'o Cindy não fecha o miolo');
});

test('o cardio e a equivalência na airbike batem com o combinado', () => {
  assert.equal(MURPH_CARDIO.iniciante.metros, 500);
  assert.equal(MURPH_CARDIO.iniciante.bikeMin, 3);
  assert.equal(MURPH_CARDIO.intermediario.metros, 800);
  assert.equal(MURPH_CARDIO.intermediario.bikeMin, 5);
  assert.equal(MURPH_CARDIO.avancado.metros, 1600);
  assert.equal(MURPH_CARDIO.avancado.bikeMin, 10);
  // O avançado escolhe a ponta curta; a alternativa tem que ser a MESMA do intermediário.
  assert.deepEqual(MURPH_CARDIO.avancado.alternativa, { metros: 800, bikeMin: 5 });
});

test('a regra de execução de cada nível é a que o coach definiu', () => {
  assert.equal(MURPH_EXECUCAO.iniciante.id, 'cindy');
  assert.equal(MURPH_EXECUCAO.iniciante.obrigatorio, true);
  assert.equal(MURPH_EXECUCAO.intermediario.id, 'livre');
  assert.equal(MURPH_EXECUCAO.intermediario.obrigatorio, false);
  assert.equal(MURPH_EXECUCAO.avancado.id, 'inteiro');
  assert.equal(MURPH_EXECUCAO.avancado.obrigatorio, true);
});

test('o volume não estoura o mínimo semanal sozinho', async () => {
  // 600 reps de peso corporal não valem 60 séries de musculação. Se a conversão
  // ficar generosa demais, um único Murph zera a meta da semana inteira e a barra
  // deixa de servir para alguma coisa.
  const { MINIMO_SEMANAL } = await import('../config/frequencias.js');
  const v = volumeMurph();
  assert.equal(v.porPadrao.puxar, 5);
  assert.equal(v.porPadrao.empurrar, 10);
  assert.equal(v.porPadrao.quadriceps, 15);
  for (const [p, series] of Object.entries(v.porPadrao)) {
    assert.ok(series <= MINIMO_SEMANAL[p] * 2,
      `${p}: ${series} séries é mais que o dobro do mínimo semanal (${MINIMO_SEMANAL[p]})`);
  }
});

test('o avançado demora mais que o iniciante — o unbroken cobra caro', () => {
  const ini = estimarDuracaoSeg('iniciante');
  const int = estimarDuracaoSeg('intermediario');
  const avc = estimarDuracaoSeg('avancado');
  assert.ok(ini < int, `iniciante ${ini}s deveria ser menor que intermediário ${int}s`);
  assert.ok(int < avc, `intermediário ${int}s deveria ser menor que avançado ${avc}s`);
  // A ponta curta encurta a sessão do avançado, mas não o faz mais rápido que o intermediário.
  const avcCurto = estimarDuracaoSeg('avancado', { usarAlternativa: true });
  assert.ok(avcCurto < avc);
  assert.ok(avcCurto > int);
});

test('gerarMurph nunca reprova por equipamento — o rodízio é do professor', () => {
  const m = gerarMurph({ nAlunos: 20 });
  assert.equal(m.viabilidade.ok, true);
  assert.match(m.viabilidade.nota, /rod[íi]zio/i);
  assert.equal(m.blocos.length, 3);
  assert.equal(m.totalReps, 600);
});

test('o Murph está registrado como modalidade', () => {
  assert.ok(MODALIDADES.murph, 'murph fora de config/modalidades.js');
  assert.equal(MODALIDADES.murph.id, 'murph');
});

test('o gerador devolve o Murph pela modalidade, sem passar pela seleção genérica', async () => {
  const { gerarTreino } = await import('./gerador.js');
  const t = gerarTreino({ modalidade: 'murph', nivel: 'intermediario', dia: 'sex', semana: 1 });
  assert.ok(t.murph, 'treino sem o bloco murph');
  assert.equal(t.principal.length, 0, 'o Murph não usa a seleção genérica de exercícios');
  assert.equal(t.viabilidade.ok, true);
  assert.equal(t.tempoTotalSeg, estimarDuracaoSeg('intermediario'));
});
