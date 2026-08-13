// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atribuirTecnicasAuto, TECNICAS_DE_UM_EXERCICIO } from './tecnicas-auto.js';
import { gerarTreino } from './gerador.js';
import { TECNICAS_SEED } from '../../academia/data/seed.js';
import { sugerirCarga } from './cargas.js';
import { EXERCICIOS } from '../data/exercicios.js';

function rngDe(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const principalFalso = (n) => Array.from({ length: n }, (_, i) => ({ exercicio: { id: `ex${i}`, nome: `Ex ${i}` } }));

test('só Hipertrofia recebe técnica automática', () => {
  for (const mod of ['forca', 'hiit', 'gap', 'hyrox', 'hibrido', 'murph']) {
    const r = atribuirTecnicasAuto(principalFalso(6), TECNICAS_SEED, rngDe(1), mod);
    assert.ok(r.every((x) => x === null), `${mod} recebeu técnica`);
  }
  const hiper = atribuirTecnicasAuto(principalFalso(6), TECNICAS_SEED, rngDe(1), 'hipertrofia');
  assert.ok(hiper.some(Boolean), 'Hipertrofia ficou sem nenhuma técnica');
});

test('no máximo 2 exercícios recebem, e nunca o primeiro', () => {
  for (let seed = 0; seed < 40; seed++) {
    const r = atribuirTecnicasAuto(principalFalso(6), TECNICAS_SEED, rngDe(seed), 'hipertrofia');
    assert.equal(r[0], null, `seed ${seed}: o primeiro exercício (o mais pesado) recebeu técnica`);
    assert.ok(r.filter(Boolean).length <= 2, `seed ${seed}: mais de 2 técnicas no mesmo dia`);
  }
});

test('nunca sorteia técnica que precisa de mais de um exercício', () => {
  // Bi-set, Tri-set, Série Gigante, Pré e Pós-Exaustão pareiam DOIS ou mais
  // exercícios — o selo delas num item sozinho seria uma instrução impossível.
  const multi = ['bi_set', 'tri_set', 'serie_gigante', 'pre_exaustao', 'pos_exaustao'];
  for (const id of multi) {
    assert.ok(!TECNICAS_DE_UM_EXERCICIO.includes(id), `${id} está na lista de técnica solo`);
  }
  for (let seed = 0; seed < 60; seed++) {
    const r = atribuirTecnicasAuto(principalFalso(6), TECNICAS_SEED, rngDe(seed), 'hipertrofia');
    for (const t of r.filter(Boolean)) {
      assert.ok(!multi.includes(t.tipo), `seed ${seed}: sorteou ${t.tipo}, que precisa de par`);
    }
  }
});

test('todo id da lista solo existe no banco da Academia', () => {
  // Se alguém renomear um id no seed, a lista aqui vira letra morta em silêncio:
  // o pool esvazia e o treino volta a sair sem técnica nenhuma.
  const ids = new Set(TECNICAS_SEED.map((t) => t.id));
  for (const id of TECNICAS_DE_UM_EXERCICIO) {
    assert.ok(ids.has(id), `${id} não existe em TECNICAS_SEED`);
  }
});

test('não repete a mesma técnica duas vezes no mesmo dia', () => {
  for (let seed = 0; seed < 40; seed++) {
    const escolhidas = atribuirTecnicasAuto(principalFalso(6), TECNICAS_SEED, rngDe(seed), 'hipertrofia')
      .filter(Boolean).map((t) => t.tipo);
    assert.equal(new Set(escolhidas).size, escolhidas.length, `seed ${seed}: técnica repetida`);
  }
});

test('sem banco de técnicas, o treino sai sem técnica em vez de quebrar', () => {
  assert.ok(atribuirTecnicasAuto(principalFalso(6), [], rngDe(1), 'hipertrofia').every((x) => x === null));
  assert.ok(atribuirTecnicasAuto(principalFalso(6), null, rngDe(1), 'hipertrofia').every((x) => x === null));
  // técnica desativada na Academia não entra
  const desativadas = TECNICAS_SEED.map((t) => ({ ...t, ativo: false }));
  assert.ok(atribuirTecnicasAuto(principalFalso(6), desativadas, rngDe(1), 'hipertrofia').every((x) => x === null));
});

test('a técnica congelada guarda nome e texto — a Academia pode mudar depois', () => {
  const r = atribuirTecnicasAuto(principalFalso(6), TECNICAS_SEED, rngDe(3), 'hipertrofia').filter(Boolean);
  assert.ok(r.length);
  for (const t of r) {
    assert.ok(t.tipo && t.label && t.detalhe, `técnica incompleta: ${JSON.stringify(t)}`);
  }
});

test('o gerador anexa a técnica ao exercício da Hipertrofia', () => {
  const t = gerarTreino({
    modalidade: 'hipertrofia', nivel: 'intermediario', dia: 'seg', semana: 2,
    tecnicas: TECNICAS_SEED, seed: 7,
  });
  assert.ok(t.principal.some((p) => p.tecnica), 'nenhum exercício recebeu técnica');
  assert.equal(t.principal[0].tecnica, null);
  // sem passar o banco, o comportamento antigo é preservado
  const semBanco = gerarTreino({ modalidade: 'hipertrofia', nivel: 'intermediario', dia: 'seg', semana: 2, seed: 7 });
  assert.ok(semBanco.principal.every((p) => !p.tecnica));
});

test('o gerador produz aquecimento — é ele que o snapshot precisa guardar', () => {
  const t = gerarTreino({ modalidade: 'hipertrofia', nivel: 'intermediario', dia: 'seg', semana: 2, seed: 7 });
  assert.ok(t.aquecimento.length > 0, 'treino sem aquecimento');
  for (const a of t.aquecimento) {
    assert.ok(a.exercicio?.nome, 'item de aquecimento sem exercício');
    assert.ok(a.duracaoSeg >= 30 && a.duracaoSeg <= 60, `duração fora da faixa: ${a.duracaoSeg}s`);
  }
  assert.equal(t.tempoAquecimentoSeg, t.aquecimento.reduce((x, a) => x + a.duracaoSeg, 0));
});

test('TRX devolve orientação de intensidade, não um traço', () => {
  // Bug antigo: `trx` não estava entre os equipamentos corporais, então caía no
  // '—' final e a coluna de carga saía vazia nos três níveis.
  const trx = EXERCICIOS.filter((e) => e.equipamento.includes('trx'));
  assert.ok(trx.length, 'catálogo sem exercício de TRX (teste perdeu o sentido)');
  for (const ex of trx) {
    for (const n of ['iniciante', 'intermediario', 'avancado']) {
      const c = sugerirCarga(ex, n, 'hipertrofia');
      assert.notEqual(c.texto, '—', `${ex.nome} (${n}) sem carga`);
      assert.equal(c.tipo, 'trx');
    }
  }
  // e os três níveis têm orientações DIFERENTES — senão não serve para nada
  const textos = ['iniciante', 'intermediario', 'avancado'].map((n) => sugerirCarga(trx[0], n, 'hipertrofia').texto);
  assert.equal(new Set(textos).size, 3, 'os três níveis dão a mesma orientação de TRX');
});
