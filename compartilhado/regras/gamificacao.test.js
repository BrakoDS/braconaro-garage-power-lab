// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streakSemanas } from './gamificacao.js';

/** 'AAAA-MM-DD' local. */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A segunda-feira de N semanas atrás (0 = a semana em curso), e um dia dentro dela. */
function semana(n, diaDaSemana = 0) {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) - 7 * n + diaDaSemana);
  return iso(d);
}

test('sem pausa: a regra de sempre — semana passada sem treino quebra', () => {
  const dias = [semana(1, 1), semana(2, 2), semana(3), semana(5, 3)];
  assert.equal(streakSemanas(dias), 3, 'a semana 4 sem treino quebrou');
  assert.equal(streakSemanas(dias, 1, []), 3, 'lista vazia = a regra de sempre');
});

test('semana do box fechado (em branco) sem treino: pula, não quebra', () => {
  const dias = [semana(1, 1), semana(2, 2), semana(3), semana(5, 3)];
  assert.equal(streakSemanas(dias, 1, [semana(4)]), 4, 'a semana 4 (recesso) é pulada e a 5 continua a sequência');
});

test('semana pausada COM treino conta como qualquer outra', () => {
  const dias = [semana(1), semana(2), semana(3)];
  assert.equal(streakSemanas(dias, 1, [semana(2)]), 3);
});

test('a pausa não ressuscita sequência quebrada antes dela', () => {
  // 1 treinou; 2 sem treino e com aula (quebra); 3 recesso; 4 treinou.
  const dias = [semana(1), semana(4)];
  assert.equal(streakSemanas(dias, 1, [semana(3)]), 1);
});

test('semana em curso pausada e sem treino: segue para trás', () => {
  const dias = [semana(1), semana(2)];
  assert.equal(streakSemanas(dias, 1, [semana(0)]), 2);
});

test('duas semanas de recesso seguidas, e recesso solto no passado: termina e conta certo', () => {
  const dias = [semana(1), semana(4), semana(5)];
  assert.equal(streakSemanas(dias, 1, [semana(2), semana(3), semana(40)]), 3);
  assert.equal(streakSemanas([semana(10)], 1, [semana(1), semana(2)]), 0, 'pausa sem treino antes: zero, sem laço infinito');
});

test('meta acima de 1: semana pausada com treino abaixo da meta é pulada, não quebra', () => {
  const dias = [semana(1), semana(1, 2), semana(2), semana(3), semana(3, 1)];
  assert.equal(streakSemanas(dias, 2), 1, 'sem pausa: a semana 2 (1 treino) quebra');
  assert.equal(streakSemanas(dias, 2, [semana(2)]), 2, 'com a semana 2 pausada: 1 e 3 contam');
});

/* ---------- medalhasDaFicha: a conta única da Gestão (lista + aba Progresso) ---------- */

test('medalhasDaFicha: igual à montagem que a lista e a aba Progresso faziam à mão', async () => {
  const game = await import('./gamificacao.js');
  // A montagem antiga, copiada como era nas duas telas.
  const antiga = (a, gastos, concl, pausadas) => {
    const dias = game.diasTreino(a.presencas, gastos);
    const c = game.contadores(dias);
    return game.medalhas({
      total: c.total, mes: c.mes, semana: c.semana, streak: game.streakSemanas(dias, 1, pausadas),
      nAvaliacoes: (a.avaliacoes || []).filter((x) => x.dataRealizada).length,
      desafios: concl.length,
      desAgua: concl.filter((x) => x.categoria === 'agua').length,
      desAcucar: concl.filter((x) => x.categoria === 'acucar').length,
      meses: Object.values(a.pagamentos || {}).filter(Boolean).length,
      calMaxTreino: game.maxCaloriasTreino(gastos),
      calMaxSemana: game.maxCaloriasSemana(gastos),
      feedbacks: Array.isArray(a.feedbacks) ? a.feedbacks.length : 0,
    });
  };
  const hoje = new Date();
  const iso = (n) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const casos = [
    [{}, [], [], []],
    [{ presencas: [iso(1), iso(3), iso(8), iso(15)], avaliacoes: [{ dataRealizada: iso(30) }, { dataProxima: iso(1) }],
      pagamentos: { '2026-08': true, '2026-09': true, '2026-10': false }, feedbacks: [{}, {}] },
    [{ data: iso(2), calorias: '450' }, { data: iso(2), calorias: 300 }, { data: iso(9), calorias: 900 }],
    [{ categoria: 'agua' }, { categoria: 'acucar' }, { categoria: 'agua' }], [iso(14)]],
  ];
  for (const [a, gastos, concl, pausadas] of casos) {
    assert.deepEqual(game.medalhasDaFicha(a, { gastos, conclusoes: concl, pausadas }), antiga(a, gastos, concl, pausadas));
  }
  const ok = game.medalhasDaFicha(casos[1][0], { gastos: casos[1][1], conclusoes: casos[1][2] }).filter((m) => m.ok).length;
  assert.ok(ok > 0, 'o caso cheio conquista alguma medalha (o teste compara algo de verdade)');
  assert.deepEqual(game.medalhasDaFicha({}), antiga({}, [], [], []), 'sem o que vem de fora: listas vazias');
});
