// @ts-check
/**
 * Os montadores que o Treino Manual reusa dos geradores automáticos. O ponto de
 * cada teste é que o manual NÃO reimplemente a metodologia — se estes montadores
 * mudarem, as duas telas mudam juntas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMusica } from './gap.js';
import { slotDe } from './hiitTabata.js';
import { estimarDuracaoSeg, volumeHyrox, HYROX_ESTACOES, HYROX_CORRIDA, NIVEIS_HYROX } from './hyrox.js';
import { MOV_GAP_POR_ID } from '../data/gap.js';

test('música de variações rende 8 rounds ciclando 3 variações do mesmo movimento', () => {
  const m = montarMusica({ modo: 'variacoes', base: MOV_GAP_POR_ID.sumo });
  assert.equal(m.rounds.length, 8);
  assert.equal(new Set(m.rounds.map((r) => r.movId)).size, 1);
  assert.deepEqual([...new Set(m.rounds.map((r) => r.variacao))].sort(),
    ['dinamica', 'isometrico', 'quicada']);
});

test('movimento com salto entra saltando, não liso', () => {
  // `agachamento` tem `salto: true`: a versão dinâmica dele é com salto (metabólica).
  // O peso de volume também muda (PESO_VARIACAO.salto = 1,25), então trocar isso
  // recalibraria a aula inteira.
  const m = montarMusica({ modo: 'variacoes', base: MOV_GAP_POR_ID.agachamento });
  assert.deepEqual([...new Set(m.rounds.map((r) => r.variacao))].sort(),
    ['isometrico', 'quicada', 'salto']);
  assert.ok(m.rounds.some((r) => r.nome.includes('com salto')));
});

test('música unilateral abre os dois lados e fecha com o bilateral', () => {
  const m = montarMusica({
    modo: 'unilateral',
    base: MOV_GAP_POR_ID.afundo_bulgaro,
    terceiro: MOV_GAP_POR_ID.cadeira_parede,
  });
  assert.equal(m.rounds.length, 8);
  const nomes = [...new Set(m.rounds.map((r) => r.nome))];
  assert.ok(nomes.some((n) => n.includes('Lado Direito')));
  assert.ok(nomes.some((n) => n.includes('Lado Esquerdo')));
  assert.ok(m.rounds.some((r) => r.movId === 'cadeira_parede'));
});

test('música de trio usa os 3 movimentos escolhidos', () => {
  const trio = ['canivete', 'escalador', 'barquinho'].map((id) => MOV_GAP_POR_ID[id]);
  const m = montarMusica({ modo: 'trio', trio, titulo: 'Abdômen 1' });
  assert.equal(m.titulo, 'Abdômen 1');
  assert.equal(m.rounds.length, 8);
  assert.deepEqual([...new Set(m.rounds.map((r) => r.movId))].sort(),
    ['barquinho', 'canivete', 'escalador']);
});

test('montarMusica produz a MESMA forma que o gerador automático', async () => {
  // Ancora o manual no automático: mesma chave de round, mesmo ciclo 1,2,3,1,2,3,1,2.
  const { gerarGap } = await import('./gap.js');
  const auto = gerarGap({ seed: 7 }).partes[1].musicas[0];
  const manual = montarMusica({ modo: 'variacoes', base: MOV_GAP_POR_ID.agachamento });
  assert.deepEqual(Object.keys(manual.rounds[0]).sort(), Object.keys(auto.rounds[0]).sort());
  assert.deepEqual(manual.rounds.map((r) => r.n), auto.rounds.map((r) => r.n));
});

test('slotDe descreve a carga e marca o lado do unilateral', () => {
  const corporal = slotDe({ id: 'x', nome: 'Burpee', equipamento: [] });
  assert.equal(corporal.carga, 'peso corporal');
  assert.equal(corporal.lado, undefined);
  const uni = slotDe({ id: 'y', nome: 'Avanço', equipamento: [], unilateral: true }, 'D');
  assert.equal(uni.lado, 'D');
  assert.equal(uni.unilateral, true);
  const comEquip = slotDe({ id: 'z', nome: 'Remada', equipamento: ['halter_leve'] });
  assert.ok(comEquip.carga && comEquip.carga !== 'peso corporal');
});

test('Hyrox com menos estações dura menos e rende menos volume', () => {
  const tudo = estimarDuracaoSeg('intermediario');
  const metade = estimarDuracaoSeg('intermediario', HYROX_ESTACOES.slice(0, 4));
  assert.ok(metade < tudo, `${metade} deveria ser menor que ${tudo}`);
  assert.equal(estimarDuracaoSeg('intermediario', HYROX_ESTACOES), tudo,
    'passar a lista inteira tem que dar o mesmo que omitir');
  assert.ok(volumeHyrox(HYROX_ESTACOES.slice(0, 4)).totalSeries < volumeHyrox().totalSeries);
  assert.deepEqual(volumeHyrox(HYROX_ESTACOES), volumeHyrox());
});

test('a corrida do Hyrox acompanha o nº de estações ligadas', () => {
  // A corrida acontece antes de CADA estação. Se o termo de corrida ficasse preso a
  // HYROX_ESTACOES.length, desligar estações não reduziria a parte mais longa da prova.
  const uma = estimarDuracaoSeg('avancado', HYROX_ESTACOES.slice(0, 1));
  const duas = estimarDuracaoSeg('avancado', HYROX_ESTACOES.slice(0, 2));
  const soEstacao2 = estimarDuracaoSeg('avancado', HYROX_ESTACOES.slice(1, 2));
  assert.equal(duas, uma + soEstacao2);
});

test('gerarHyrox aceita um subconjunto e devolve só ele', async () => {
  const { gerarHyrox } = await import('./hyrox.js');
  const hx = gerarHyrox({ estacoes: HYROX_ESTACOES.slice(0, 3) });
  assert.equal(hx.estacoes.length, 3);
  assert.equal(hx.duracaoSeg.intermediario, estimarDuracaoSeg('intermediario', hx.estacoes));
  assert.equal(gerarHyrox().estacoes.length, 8);
});

test('a corrida do Hyrox tem alternativa na airbike em todos os níveis', async () => {
  // A bike não é estação nem bloco extra: é a MESMA rodada de corrida, pedalando,
  // para quem não pode impacto ou quando a rua está inviável. Sem um tempo para
  // cada nível, o aluno substituído não sabe quando parar.
  for (const n of ['iniciante', 'intermediario', 'avancado']) {
    assert.ok(HYROX_CORRIDA[n].bikeMin > 0, `${n} sem tempo de airbike`);
  }
  // Mais corrida tem que significar mais bike — se a ordem inverter, o aluno
  // substituído faria menos esforço justamente no nível mais alto.
  assert.ok(HYROX_CORRIDA.iniciante.bikeMin < HYROX_CORRIDA.intermediario.bikeMin);
  assert.ok(HYROX_CORRIDA.intermediario.bikeMin < HYROX_CORRIDA.avancado.bikeMin);
});

test('as voltas de 50 m batem com a distância declarada', () => {
  // Cada volta é um tiro de 50 m ida e volta = 100 m. Uma volta a mais ou a menos
  // muda o percurso real da aula sem mudar o número que o coach lê.
  for (const [n, c] of Object.entries(HYROX_CORRIDA)) {
    assert.equal(c.voltas * 100, c.metros, `${n}: ${c.voltas} voltas ≠ ${c.metros} m`);
  }
});

// -------- tabela do Hyrox: os números do quadro do box --------

test('a prescrição das 8 estações bate com o quadro do box', () => {
  // Fonte da verdade: o quadro branco da parede, 4 colunas.
  // Se alguém mexer num número aqui sem mexer no quadro, a aula sai diferente
  // do que a turma lê na parede.
  const esperado = {
    1: { nome: 'SkiErg',            tipo: 'reps',      v: [60, 80, 100, 250] },
    2: { nome: 'Sled Push',         tipo: 'distancia', v: [20, 30, 40, 100] },
    3: { nome: 'Sled Pull',         tipo: 'distancia', v: [20, 30, 40, 100] },
    4: { nome: 'Burpee Broad Jump', tipo: 'distancia', v: [20, 40, 60, 100] },
    5: { nome: 'Rowing',            tipo: 'reps',      v: [60, 80, 100, 250] },
    6: { nome: 'Farmers Carry',     tipo: 'distancia', v: [80, 100, 150, 200] },
    7: { nome: 'Sandbag Lunges',    tipo: 'distancia', v: [20, 30, 40, 100] },
    8: { nome: 'Wall Balls',        tipo: 'reps',      v: [30, 50, 75, 100] },
  };
  assert.equal(HYROX_ESTACOES.length, 8);
  for (const e of HYROX_ESTACOES) {
    const q = esperado[e.n];
    assert.equal(e.base, q.nome, `estação ${e.n}`);
    assert.equal(e.tipo, q.tipo, `${q.nome}: unidade errada`);
    assert.deepEqual(
      ['iniciante', 'intermediario', 'avancado', 'competitivo'].map((n) => e.prescricao[n]),
      q.v, `${q.nome}: prescrição fora do quadro`);
  }
});

test('a corrida e a bike batem com o quadro, e as voltas fecham a distância', () => {
  assert.deepEqual(NIVEIS_HYROX.map((n) => HYROX_CORRIDA[n].metros), [100, 300, 500, 1000]);
  assert.deepEqual(NIVEIS_HYROX.map((n) => HYROX_CORRIDA[n].bikeMin), [0.8, 1, 2, 4]);
  for (const [n, c] of Object.entries(HYROX_CORRIDA)) {
    assert.equal(c.voltas * 100, c.metros, `${n}: ${c.voltas} voltas de 50 m ida/volta ≠ ${c.metros} m`);
  }
});

test('a prescrição cresce a cada nível — nunca cai', () => {
  // Uma coluna fora de ordem passa despercebida na leitura mas inverte o treino
  // de duas turmas. Vale para as 8 estações e para a corrida.
  for (const e of HYROX_ESTACOES) {
    const v = NIVEIS_HYROX.map((n) => e.prescricao[n]);
    for (let i = 1; i < v.length; i++) {
      assert.ok(v[i] >= v[i - 1], `${e.base}: ${NIVEIS_HYROX[i]} (${v[i]}) < ${NIVEIS_HYROX[i - 1]} (${v[i - 1]})`);
    }
  }
  const dist = NIVEIS_HYROX.map((n) => HYROX_CORRIDA[n].metros);
  assert.deepEqual([...dist].sort((a, b) => a - b), dist);
});

test('o Competitivo é o nível mais longo, e existe só no Hyrox', async () => {
  const dur = NIVEIS_HYROX.map((n) => estimarDuracaoSeg(n));
  assert.deepEqual([...dur].sort((a, b) => a - b), dur, 'as durações não crescem com o nível');
  // niveis.js continua com 3 — acrescentar lá vazaria uma 4ª coluna para
  // Força e Hipertrofia, que não têm prescrição competitiva.
  const { NIVEIS } = await import('./niveis.js');
  assert.equal(NIVEIS.length, 3);
  assert.ok(!NIVEIS.includes('competitivo'));
});
