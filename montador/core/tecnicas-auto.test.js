// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atribuirTecnicasAuto, TECNICAS_DE_UM_EXERCICIO, congelarTecnica } from './tecnicas-auto.js';
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

test('quando resumo e objetivo faltam, detalhe recebe o nome', () => {
  // ui/render.js:463 filtra técnicas com detalhe vazio, então a fallback
  // para nome evita que uma técnica incompleta desapareça do cartão do coach.
  const tecnica = { id: 'drop_set', nome: 'Drop Set Firme' };
  const congelada = congelarTecnica(tecnica);
  assert.equal(congelada.detalhe, 'Drop Set Firme');
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

// -------- troca livre --------

test('a troca livre oferece o catálogo inteiro, não só o mesmo padrão', async () => {
  const { alternativasLivres, alternativasViaveis } = await import('./gerador.js');
  const t = gerarTreino({ modalidade: 'hipertrofia', nivel: 'intermediario', dia: 'seg', semana: 2, seed: 11 });
  const presas = alternativasViaveis(t, 1);
  const livres = alternativasLivres(t, 1);
  assert.ok(livres.length > presas.length, `livre ${livres.length} deveria superar restrita ${presas.length}`);
  // a restrita mantém o padrão; a livre alcança outros
  assert.ok(presas.every((e) => e.padrao === t.principal[1].exercicio.padrao));
  assert.ok(livres.some((c) => c.mudaPadrao), 'troca livre não alcançou outro padrão');
});

test('a troca livre não oferece exercício já usado no próprio treino', async () => {
  const { alternativasLivres } = await import('./gerador.js');
  const t = gerarTreino({ modalidade: 'forca', nivel: 'intermediario', dia: 'ter', semana: 1, seed: 5 });
  const usados = new Set(t.principal.map((p) => p.exercicio.id));
  for (const c of alternativasLivres(t, 0)) {
    assert.ok(!usados.has(c.exercicio.id), `${c.exercicio.nome} já está no treino`);
  }
});

test('a troca livre etiqueta o que a escolha custa, em vez de esconder', async () => {
  const { alternativasLivres } = await import('./gerador.js');
  const t = gerarTreino({ modalidade: 'forca', nivel: 'intermediario', dia: 'ter', semana: 1, seed: 5 });
  const cands = alternativasLivres(t, 0);
  // há candidatos de fora da modalidade e candidatos que quebram equipamento —
  // e é justamente isso que a etiqueta na tela precisa dizer.
  assert.ok(cands.some((c) => !c.naModalidade), 'nenhum candidato fora da modalidade');
  assert.ok(cands.some((c) => !c.viavel), 'nenhum candidato inviável por aparelho');
  assert.ok(cands.some((c) => c.viavel && c.naModalidade), 'nenhum candidato limpo');
});

test('depois da troca livre, o volume por padrão segue a composição REAL', async () => {
  const { alternativasLivres, aplicarTroca } = await import('./gerador.js');
  const t = gerarTreino({ modalidade: 'hipertrofia', nivel: 'intermediario', dia: 'seg', semana: 2, seed: 11 });
  const padraoAntigo = t.principal[1].exercicio.padrao;
  const novo = alternativasLivres(t, 1).find((c) => c.mudaPadrao && c.viavel);
  assert.ok(novo, 'sem candidato de outro padrão para o cenário');

  const depois = aplicarTroca(t, 1, novo.exercicio);
  const p = novo.exercicio.padrao;
  assert.equal(depois.principal[1].exercicio.id, novo.exercicio.id);
  // o padrão novo ganhou volume e o antigo perdeu — é a contabilidade acompanhando
  assert.ok((depois.volume.porPadrao[p] || 0) > (t.volume.porPadrao[p] || 0),
    `${p} não ganhou volume após a troca`);
  assert.ok((depois.volume.porPadrao[padraoAntigo] || 0) < (t.volume.porPadrao[padraoAntigo] || 0),
    `${padraoAntigo} não perdeu volume após a troca`);
  // e a viabilidade é recalculada sobre a nova composição
  assert.equal(depois.viabilidade.ok,
    (await import('./viabilidade.js')).verificarViabilidade(
      depois.principal.map((x) => x.exercicio), depois.nAlunos, depois.principal.length).ok);
});

test('a troca livre não muda séries nem reps do slot', async () => {
  const { alternativasLivres, aplicarTroca } = await import('./gerador.js');
  const t = gerarTreino({ modalidade: 'hipertrofia', nivel: 'intermediario', dia: 'seg', semana: 2, seed: 11 });
  const alvo = t.principal[2];
  const novo = alternativasLivres(t, 2).find((c) => c.mudaPadrao);
  const depois = aplicarTroca(t, 2, novo.exercicio);
  assert.equal(depois.principal[2].series, alvo.series);
  assert.equal(depois.principal[2].reps, alvo.reps);
  assert.equal(depois.principal[2].descansoSeg, alvo.descansoSeg);
});
