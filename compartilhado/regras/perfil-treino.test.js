// @ts-check
/**
 * Rodar: node --test compartilhado/regras/perfil-treino.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versaoDoAluno, PISO_SERIES, TETO_ACIMA_DO_BASE } from './perfil-treino.js';

/** O full body de 7 exercícios do spec, com os grupos de cada um. */
const CATALOGO = {
  supino_halter: { id: 'supino_halter', nome: 'Supino reto halter', padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps'] },
  remada_baixa: { id: 'remada_baixa', nome: 'Remada baixa fechada', padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'] },
  elevacao_lateral: { id: 'elevacao_lateral', nome: 'Elevação lateral', padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: [] },
  agacho_smith: { id: 'agacho_smith', nome: 'Agachamento smith', padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'] },
  mesa_flexora: { id: 'mesa_flexora', nome: 'Mesa flexora', padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa'], musculosSecundarios: [] },
  rosca_martelo: { id: 'rosca_martelo', nome: 'Rosca martelo', padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: ['antebraco'] },
  triceps_testa: { id: 'triceps_testa', nome: 'Tríceps testa', padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [] },
  leg_press: { id: 'leg_press', nome: 'Leg press', padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'] },
  supino_maquina: { id: 'supino_maquina', nome: 'Supino máquina', padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps'] },
  remada_curvada: { id: 'remada_curvada', nome: 'Remada curvada', padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'] },
};
const exercicioPorId = (/** @type {string} */ id) => CATALOGO[id] || null;

const linha = (id, series = 3, extra = {}) => ({ ...CATALOGO[id], series, reps: '8–12', descansoSeg: 75, travado: false, ...extra });

/** Treino base do spec: 7 exercícios, 3 séries cada = 21. */
function baseFullBody(extra = {}) {
  return {
    dateId: '2026-09-16', estrutura: 'musculacao',
    blocos: [{ nome: 'Principal', tipo: 'principal', exercicios: [
      linha('supino_halter'), linha('remada_baixa'), linha('elevacao_lateral'),
      linha('agacho_smith'), linha('mesa_flexora'), linha('rosca_martelo'), linha('triceps_testa'),
    ] }],
    ...extra,
  };
}

const porNome = (r) => Object.fromEntries(r.linhas.map((l) => [l.nome, l.series]));

test('sem perfil, o aluno recebe o treino da turma, sem deslocamento', () => {
  const r = versaoDoAluno({ base: baseFullBody(), exercicioPorId });
  assert.equal(r.total, 21);
  assert.equal(r.totalBase, 21);
  assert.ok(r.linhas.every((l) => l.series === 3));
  assert.deepEqual(r.avisos, []);
});

test('o foco redistribui em saldo zero: o total do aluno e o total da turma', () => {
  const foco = versaoDoAluno({ base: baseFullBody(), perfil: { objetivo: 'Hipertrofia', foco: ['braco'] }, exercicioPorId });
  assert.equal(foco.total, 21, 'saldo zero: ninguem treina mais nem menos que a turma');
  assert.equal(porNome(foco)['Rosca martelo'], 4);
  assert.equal(porNome(foco)['Tríceps testa'], 4);
  const perdeu = foco.linhas.filter((l) => l.series < 3);
  assert.equal(perdeu.length, 2, 'duas series saíram para as duas entrarem');
});

test('quem perde e o grupo mais acima da meta, nao o primeiro da lista', () => {
  // Ele já fez muito peito nesta semana (meta 10, feito 16) e pouco do resto:
  // a série tem que sair do supino, e não do primeiro exercício que não é foco.
  const r = versaoDoAluno({
    base: baseFullBody(),
    perfil: { objetivo: 'Hipertrofia', foco: ['braco'] },
    feitoPorGrupo: { peito: 16, costas: 2, ombro: 2, perna: 2 },
    exercicioPorId,
  });
  const s = porNome(r);
  assert.equal(s['Supino reto halter'], 2, 'o peito, que esta mais acima da meta, cedeu');
  assert.equal(r.total, 21);
});

test('piso de 2 e teto de base+2 sao respeitados', () => {
  const base = baseFullBody();
  base.blocos[0].exercicios = [linha('rosca_martelo', 3), linha('supino_halter', 2)];
  const r = versaoDoAluno({ base, perfil: { foco: ['braco'] }, exercicioPorId });
  assert.equal(porNome(r)['Supino reto halter'], PISO_SERIES, 'nao desce abaixo do piso');
  assert.equal(porNome(r)['Rosca martelo'], 3, 'sem doador, nao sobe');
  assert.equal(r.total, r.totalBase);
  assert.match(r.avisos[0], /piso de 2/);

  // Doador de sobra não vira dia dobrado: o deslocamento é de UMA série por
  // exercício de foco por dia, e quem fecha a meta semanal é a repetição.
  const base2 = baseFullBody();
  base2.blocos[0].exercicios = [linha('rosca_martelo', 3), linha('supino_halter', 9)];
  const r2 = versaoDoAluno({ base: base2, perfil: { foco: ['braco'] }, exercicioPorId });
  assert.equal(porNome(r2)['Rosca martelo'], 4);
  assert.ok(r2.linhas.every((l) => l.series <= l.seriesBase + TETO_ACIMA_DO_BASE), 'ninguem passa do teto');
  assert.equal(r2.total, r2.totalBase);
});

test('duas series disponiveis se dividem entre os dois exercicios de foco', () => {
  const base = baseFullBody();
  base.blocos[0].exercicios = [linha('rosca_martelo', 3), linha('triceps_testa', 3), linha('supino_halter', 4)];
  const r = versaoDoAluno({ base, perfil: { foco: ['braco'] }, exercicioPorId });
  const s = porNome(r);
  assert.equal(s['Rosca martelo'], 4);
  assert.equal(s['Tríceps testa'], 4, 'a segunda serie nao pode ir toda para o primeiro da lista');
  assert.equal(s['Supino reto halter'], 2);
  assert.equal(r.total, r.totalBase);
});

test('foco em grupo que o dia nao treina nao muda nada, e diz por que', () => {
  const r = versaoDoAluno({ base: baseFullBody(), perfil: { foco: ['gluteo'] }, exercicioPorId });
  assert.ok(r.linhas.every((l) => l.series === 3));
  assert.match(r.avisos[0], /não tem gluteo/);
});

test('linha travada ignora o perfil inteiro', () => {
  const base = baseFullBody();
  base.blocos[0].exercicios[5] = linha('rosca_martelo', 3, { travado: true, reps: '6', descansoSeg: 120 });
  const r = versaoDoAluno({ base, perfil: { objetivo: 'Emagrecimento', foco: ['braco'] }, exercicioPorId });
  const travada = r.linhas.find((l) => l.nome === 'Rosca martelo');
  assert.equal(travada.series, 3, 'travada nao ganha serie nem com foco no grupo dela');
  assert.equal(travada.reps, '6', 'travada mantem as reps que o coach escreveu');
  assert.equal(travada.descansoSeg, 120);
  assert.ok(travada.motivos.includes('Igual para a turma (linha travada)'));
  assert.equal(r.total, 21, 'o saldo continua zero mesmo com linha travada fora da conta');
});

test('o objetivo desloca reps e descanso dentro da faixa dele', () => {
  const r = versaoDoAluno({ base: baseFullBody(), perfil: { objetivo: 'Emagrecimento' }, exercicioPorId });
  const l = r.linhas[0];
  assert.equal(l.reps, '15–20');
  assert.equal(l.descansoSeg, 45, 'o descanso de 75s entra no teto da faixa (30-45)');
  assert.equal(l.tecnica, 'bi-set, descanso curto');
  assert.ok(l.motivos.some((m) => /emagrecimento/.test(m)));
  const saude = versaoDoAluno({ base: baseFullBody(), perfil: { objetivo: 'Saúde / qualidade de vida' }, exercicioPorId });
  assert.equal(saude.linhas[0].tecnica, undefined, 'saude nao recebe tecnica avancada');
});

test('objetivo "Outro" e ficha em branco deixam o que o coach escreveu', () => {
  for (const objetivo of ['Outro', '', undefined]) {
    const r = versaoDoAluno({ base: baseFullBody(), perfil: { objetivo }, exercicioPorId });
    assert.equal(r.linhas[0].reps, '8–12', `objetivo ${objetivo}: as reps do coach tem que ficar`);
    assert.equal(r.linhas[0].descansoSeg, 75);
  }
});

test('a restricao troca o exercicio, e o volume conta o substituto', () => {
  const r = versaoDoAluno({
    base: baseFullBody(),
    perfil: { restricoes: [{ evitarId: 'agacho_smith', substitutoId: 'leg_press', motivo: 'joelho' }] },
    exercicioPorId,
  });
  const l = r.linhas.find((x) => x.id === 'leg_press');
  assert.ok(l, 'o substituto entrou no lugar');
  assert.ok(!r.linhas.some((x) => x.id === 'agacho_smith'));
  assert.equal(l.series, 3, 'a troca nao mexe no numero de series');
  assert.deepEqual(l.musculosPrimarios, ['quadriceps'], 'o volume passa a contar o que ele fez de verdade');
  assert.match(l.motivos[0], /joelho/);
  assert.equal(r.total, 21);
});

test('restricao sem substituto marca a linha e nao conta volume', () => {
  const r = versaoDoAluno({
    base: baseFullBody(),
    perfil: { restricoes: [{ evitarId: 'agacho_smith', substitutoId: '', motivo: 'joelho' }] },
    exercicioPorId,
  });
  const l = r.linhas.find((x) => x.id === 'agacho_smith');
  assert.equal(l.restrito, true);
  assert.equal(r.total, 18, 'o que ele nao faz nao entra no total dele');
  assert.match(l.motivos[0], /sem substituto/);
});

test('substituto com outro padrao passa, mas com aviso', () => {
  const r = versaoDoAluno({
    base: baseFullBody(),
    perfil: { restricoes: [{ evitarId: 'agacho_smith', substitutoId: 'remada_curvada' }] },
    exercicioPorId,
  });
  const l = r.linhas.find((x) => x.id === 'remada_curvada' && x.motivos.length);
  assert.ok(l.motivos.some((m) => /outro padrão/.test(m)));
});

test('a excecao do dia vence o que o perfil derivou', () => {
  const r = versaoDoAluno({
    base: baseFullBody(),
    perfil: { objetivo: 'Hipertrofia', foco: ['braco'] },
    excecao: { linhas: { rosca_martelo: { series: 1, motivo: 'ombro doendo' } }, observacao: 'Segurar a carga hoje.' },
    exercicioPorId,
  });
  const l = r.linhas.find((x) => x.nome === 'Rosca martelo');
  assert.equal(l.series, 1, 'a palavra final do coach vence ate o teto e o piso');
  assert.ok(l.motivos.includes('ombro doendo'));
  assert.ok(r.avisos.includes('Segurar a carga hoje.'));
});

test('a excecao tambem troca o exercicio so naquele dia', () => {
  const r = versaoDoAluno({
    base: baseFullBody(),
    excecao: { linhas: { supino_halter: { exercicioId: 'supino_maquina' } } },
    exercicioPorId,
  });
  assert.ok(r.linhas.some((l) => l.id === 'supino_maquina'));
  assert.ok(!r.linhas.some((l) => l.id === 'supino_halter'));
});

test('dia por tempo nao redistribui serie nenhuma', () => {
  const base = { dateId: '2026-09-17', estrutura: 'gap', blocos: [{ nome: 'Música 1', exercicios: [
    { ...CATALOGO.rosca_martelo, rounds: 8, trabalhoSeg: 20, travado: false },
    { ...CATALOGO.agacho_smith, rounds: 8, trabalhoSeg: 20, travado: false },
  ] }] };
  const r = versaoDoAluno({ base, perfil: { objetivo: 'Hipertrofia', foco: ['braco'] }, exercicioPorId });
  assert.equal(r.porTempo, true);
  assert.ok(r.linhas.every((l) => l.reps === undefined), 'nao inventa repeticao em dia de relogio');
  assert.match(r.avisos[0], /mesmos rounds/);
});

test('em dia por tempo a restricao continua valendo', () => {
  // É o que sobra da individualidade nesses dias: carga, troca e observação.
  const base = { dateId: '2026-09-17', estrutura: 'hiit', blocos: [{ nome: 'Estações', exercicios: [
    { ...CATALOGO.agacho_smith, rounds: 8, trabalhoSeg: 20, travado: false },
  ] }] };
  const r = versaoDoAluno({ base, perfil: { restricoes: [{ evitarId: 'agacho_smith', substitutoId: 'leg_press' }] }, exercicioPorId });
  assert.equal(r.linhas[0].id, 'leg_press');
});

test('a troca ja resolvida na publicacao dispensa o catalogo', () => {
  // É o caminho do aparelho do aluno: ele não tem o catálogo, então quem publica
  // grava a troca com nome e grupo junto. Sem `exercicioPorId` nenhum aqui.
  const r = versaoDoAluno({
    base: baseFullBody(),
    perfil: { objetivo: 'Hipertrofia' },
    excecao: { trocas: { agacho_smith: { id: 'leg_press', nome: 'Leg press', padrao: 'quadriceps', grupoMuscular: 'perna', motivo: 'joelho' } } },
  });
  const l = r.linhas.find((x) => x.id === 'leg_press');
  assert.ok(l, 'o substituto entrou sem consultar catalogo');
  assert.equal(l.grupo, 'perna', 'o grupo vem junto, senao o foco pararia de enxergar a linha');
  assert.match(l.motivos[0], /joelho/);
  assert.equal(r.total, 21);
});

test('linha travada ignora ate a troca publicada', () => {
  const base = baseFullBody();
  base.blocos[0].exercicios[3] = linha('agacho_smith', 3, { travado: true });
  const r = versaoDoAluno({
    base,
    excecao: { trocas: { agacho_smith: { id: 'leg_press', nome: 'Leg press' } } },
  });
  assert.ok(r.linhas.some((l) => l.id === 'agacho_smith'), 'o cadeado vale para a turma inteira, sem excecao');
});
