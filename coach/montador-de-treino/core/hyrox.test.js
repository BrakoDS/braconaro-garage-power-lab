// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYROX_ESTACOES, volumeHyrox, NIVEIS_HYROX } from './hyrox.js';

test('Sled Push credita panturrilha, não peito — os braços são escora, a força sai do antepé', () => {
  const sledPush = HYROX_ESTACOES.find((e) => e.n === 2);
  assert.deepEqual(sledPush.musculos, ['quadriceps', 'gluteo', 'panturrilha']);
});

test('Burpee Broad Jump credita quadríceps primeiro — o salto avança a distância, não a flexão', () => {
  const burpeeBroadJump = HYROX_ESTACOES.find((e) => e.n === 4);
  assert.deepEqual(burpeeBroadJump.musculos, ['quadriceps', 'peito', 'core']);
});

test('as 3 estações por reps agora convertem por tempo, como as outras 5 sempre converteram', () => {
  // ANTES: SkiErg (n=1, reps) usava seriesPorReps direto — intermediário
  // 80 remadas / 20 = 4 séries, MAIOR que o Sled Push (n=2, perna, o tecido
  // limitante da prova), que já era por distância: 30 m * 1,8 s/m = 54 s / 40 =
  // 1,35 (sem o crédito do padrão secundário no totalSeries — ver teste de
  // totalSeries/porPadrao acima). Um aparelho de tronco valendo quase 3× uma
  // estação de perna inverte a prova.
  // DEPOIS: SkiErg cai para o mesmo tempo que `duracaoEstacaoSeg` já estimava pra
  // ele (usado na duração da aula) — 80 reps * 1,3 s/rep = 104 s / 40 = 2,6. O Sled
  // Push também sobe (2,025: 1,35 do padrão primário + 0,675 do secundário, agora
  // que o crédito soma no totalSeries), mas a folga caiu de 2,65 (4 − 1,35) para
  // 0,575 (2,6 − 2,025) — a perna deixando de ser afogada pelo tronco.
  const skiErg = HYROX_ESTACOES.find((e) => e.n === 1);
  const sledPush = HYROX_ESTACOES.find((e) => e.n === 2);
  const seriesSkiErg = volumeHyrox([skiErg], 'intermediario').totalSeries;
  const seriesSledPush = volumeHyrox([sledPush], 'intermediario').totalSeries;
  assert.equal(seriesSkiErg, 2.6, '80 reps * 1,3 s/rep = 104 s / 40');
  // Ponto-flutuante: 1,35 + 0,675 chega como 2.0250000000000004.
  assert.ok(Math.abs(seriesSledPush - 2.025) < 1e-9, '30 m * 1,8 s/m = 54 s / 40, + metade (empurrar) = 1,35 + 0,675');
  assert.ok(seriesSkiErg - seriesSledPush < 4 - 1.35,
    'a folga entre SkiErg e Sled Push tem que ter encolhido em relação ao valor antigo (4 vs 1,35)');
});

test('toda estacao declara ao menos um musculo primario', () => {
  for (const e of HYROX_ESTACOES) {
    assert.ok(Array.isArray(e.musculos) && e.musculos.length > 0, `estacao sem musculo: ${e.nome}`);
  }
});

test('o Hyrox passa a contar musculo', () => {
  const vol = volumeHyrox();
  assert.ok(Object.keys(vol.porMusculo).length > 0, 'porMusculo nao pode mais vir vazio');
});

test('a prova inteira continua distribuida entre os padroes', () => {
  const vol = volumeHyrox();
  assert.ok(vol.porPadrao.puxar > 0);
  assert.ok(vol.porPadrao.quadriceps > 0);
  assert.ok(vol.totalSeries > 0);
});

test('totalSeries bate com a soma de porPadrao — o crédito do padrão secundário entra nos dois', () => {
  // O crédito do padrão secundário (metade da série da estação, ver comentário em
  // volumeHyrox) entrava só em porPadrao. totalSeries ficava para trás — o único
  // formato onde os dois números descreviam a mesma sessão de jeitos diferentes.
  for (const nivel of NIVEIS_HYROX) {
    const vol = volumeHyrox(HYROX_ESTACOES, nivel);
    const somaPadrao = Object.values(vol.porPadrao).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(vol.totalSeries - somaPadrao) < 1e-9,
      `${nivel}: totalSeries=${vol.totalSeries} != soma(porPadrao)=${somaPadrao}`);
  }
});

test('nivel mais alto da mais volume — a prescricao escala', () => {
  const ini = volumeHyrox(HYROX_ESTACOES, 'iniciante');
  const comp = volumeHyrox(HYROX_ESTACOES, 'competitivo');
  assert.ok(comp.totalSeries > ini.totalSeries);
});

test('subconjunto de estacoes conta menos que a prova inteira', () => {
  const parcial = volumeHyrox(HYROX_ESTACOES.slice(0, 3));
  const inteira = volumeHyrox();
  assert.ok(parcial.totalSeries < inteira.totalSeries);
});

test('gerarTreino repassa o nivel para o volume do Hyrox — sem isso, todo nivel virava intermediario', async () => {
  // `montarHyrox` (gerador.js) tem `nivel` no escopo e é o ÚNICO chamador de
  // produção; se ele não repassar, `volumeHyrox` cai sempre no default
  // 'intermediario' e a turma avançada lê o mesmo volume da iniciante — o nível
  // fica morto em produção mesmo a régua sabendo escalar por nível.
  const { gerarTreino } = await import('./gerador.js');
  const ini = gerarTreino({ modalidade: 'hyrox', nivel: 'iniciante', dia: 'ter', semana: 1, nAlunos: 8 });
  const avc = gerarTreino({ modalidade: 'hyrox', nivel: 'avancado', dia: 'ter', semana: 1, nAlunos: 8 });
  assert.equal(ini.volume.totalSeries, volumeHyrox(HYROX_ESTACOES, 'iniciante').totalSeries);
  assert.equal(avc.volume.totalSeries, volumeHyrox(HYROX_ESTACOES, 'avancado').totalSeries);
  assert.notEqual(ini.volume.totalSeries, avc.volume.totalSeries,
    'iniciante e avançado saíram com o mesmo volume — o nível não está chegando em volumeHyrox');
});
