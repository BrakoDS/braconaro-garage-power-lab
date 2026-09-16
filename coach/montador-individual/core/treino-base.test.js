// @ts-check
/**
 * Rodar: node --test coach/montador-individual/core/treino-base.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  treinoNovo, linhaNova, blocoNovo, trocarEstrutura,
  seriesDaLinha, idsDoTreino, volumeDoTreino, paraSalvar,
} from './treino-base.js';
import { SEGUNDOS_POR_SERIE, FATOR_DENSIDADE_WOD } from '../../../compartilhado/regras/equivalencia.js';

/** Linha de musculação pronta. */
const supino = (/** @type {Partial<any>} */ p = {}) => ({
  id: 'supino_reto_halter', nome: 'Supino reto halter', padrao: 'empurrar',
  musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
  series: 3, reps: '8–12', descansoSeg: 75, travado: false, ...p,
});

/** Treino de musculação com as linhas dadas. */
function comLinhas(linhas, estrutura = 'musculacao') {
  const t = treinoNovo({ dateId: '2026-09-16', estrutura });
  t.blocos[0].exercicios = linhas;
  return t;
}

test('treino novo nasce na data, no dia da semana e com o bloco da estrutura', () => {
  const t = treinoNovo({ dateId: '2026-09-16', estrutura: 'gap', nAlunos: 12 });
  assert.equal(t.dia, 'qua');
  assert.equal(t.estrutura, 'gap');
  assert.equal(t.nAlunos, 12);
  assert.deepEqual(t.blocos.map((b) => b.nome), ['Música 1']);
  assert.deepEqual(t.blocos[0].exercicios, [], 'bloco de partida vem vazio: quem escreve e o coach');
  assert.equal(treinoNovo({ dateId: '2026-09-16' }).estrutura, 'musculacao');
});

test('linha nova traz os campos da estrutura e nasce destravada', () => {
  const m = linhaNova('musculacao');
  assert.equal(m.series, 3);
  assert.equal(m.travado, false);
  const t = linhaNova('hiit');
  assert.equal(t.rounds, 8);
  assert.equal(t.trabalhoSeg, 20);
  assert.equal(t.series, undefined, 'linha de tempo nao inventa serie');
});

test('trocar a estrutura preserva o que o coach ja digitou', () => {
  // Escolher a estrutura errada, digitar sete exercícios e perder tudo ao
  // corrigir seria cobrar o erro com o trabalho todo.
  const t = comLinhas([supino(), supino({ id: 'remada_baixa', nome: 'Remada baixa', padrao: 'puxar' })]);
  const gap = trocarEstrutura(t, 'gap');
  assert.equal(gap.estrutura, 'gap');
  assert.deepEqual(gap.blocos[0].exercicios.map((l) => l.nome), ['Supino reto halter', 'Remada baixa']);
  assert.equal(gap.blocos[0].exercicios[0].rounds, 8, 'campos da estrutura nova entram com o padrao dela');
  assert.equal(gap.blocos[0].exercicios[0].series, 3, 'o que a linha ja tinha continua, para a volta atras nao perder nada');
  assert.equal(trocarEstrutura(gap, 'musculacao').blocos[0].exercicios[0].series, 3);
});

test('dia ainda em branco adota os blocos da estrutura nova', () => {
  // Sem isso, escolher GAP num dia novo deixava o bloco chamado "Principal" para
  // o coach corrigir na mão.
  const t = treinoNovo({ dateId: '2026-09-16' });
  assert.deepEqual(trocarEstrutura(t, 'gap').blocos.map((b) => b.nome), ['Música 1']);
  t.blocos[0].exercicios = [linhaNova('musculacao')]; // linha vazia ainda e dia em branco
  assert.deepEqual(trocarEstrutura(t, 'cross').blocos.map((b) => b.nome), ['WOD']);
  t.blocos = [];
  assert.deepEqual(trocarEstrutura(t, 'cross').blocos.map((b) => b.nome), ['WOD'], 'treino sem bloco nenhum tambem');
});

test('musculacao conta a serie escrita; tempo conta o relogio', () => {
  assert.equal(seriesDaLinha(supino({ series: 4 }), 'musculacao'), 4);
  assert.equal(seriesDaLinha(supino({ series: 0 }), 'musculacao'), 0);
  // 8 rounds de 20s = 160s; com 40s por série, 4 séries equivalentes.
  assert.equal(seriesDaLinha({ rounds: 8, trabalhoSeg: 20, id: 'x', nome: 'x', travado: false }, 'gap'), 160 / SEGUNDOS_POR_SERIE);
  assert.equal(seriesDaLinha({ duracaoSeg: 240, id: 'x', nome: 'x', travado: false }, 'hyrox'), 6);
  assert.equal(seriesDaLinha(supino({ series: 5 }), 'gap'), 0, 'na estrutura de tempo, serie escrita nao conta sozinha');
});

test('o WOD leva o desconto de densidade, e so ele', () => {
  const linha = { duracaoSeg: 600, rodadas: 5, id: 'x', nome: 'Thruster', travado: false };
  assert.equal(seriesDaLinha(linha, 'cross'), (600 / SEGUNDOS_POR_SERIE) * FATOR_DENSIDADE_WOD);
  assert.equal(seriesDaLinha(linha, 'hyrox'), 600 / SEGUNDOS_POR_SERIE, 'Hyrox conta o relogio cheio');
});

test('o volume soma primario 1,0 e secundario 0,5, e fecha por grupo', () => {
  const t = comLinhas([supino({ series: 3 })]);
  const v = volumeDoTreino(t);
  assert.equal(v.porMusculo.peito, 3);
  assert.equal(v.porMusculo.triceps, 1.5);
  assert.equal(v.porPadrao.empurrar, 3);
  assert.equal(v.totalSeries, 3);
  // Tríceps e ombro são de grupos diferentes: braço e ombro.
  assert.equal(v.porGrupo.peito, 3);
  assert.equal(v.porGrupo.braco, 1.5);
  assert.equal(v.porGrupo.ombro, 1.5);
});

test('linha ainda em branco nao entra no volume nem nos ids', () => {
  const t = comLinhas([supino(), linhaNova('musculacao')]);
  const v = volumeDoTreino(t);
  assert.equal(v.totalSeries, 3, 'a linha vazia nao pode contar');
  assert.ok(!('undefined' in v.porPadrao), 'linha vazia nao cria chave de padrao');
  assert.deepEqual(idsDoTreino(t), ['supino_reto_halter']);
});

test('o volume por grupo e a soma do volume por musculo', () => {
  const t = comLinhas([
    supino(),
    supino({ id: 'agacho', nome: 'Agachamento', padrao: 'agachar', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'], series: 4 }),
  ]);
  const v = volumeDoTreino(t);
  const somaMusculo = Object.values(v.porMusculo).reduce((a, b) => a + b, 0);
  const somaGrupo = Object.values(v.porGrupo).reduce((a, b) => a + b, 0);
  assert.equal(somaGrupo, somaMusculo, 'musculo sem grupo sumiu da conta');
});

test('paraSalvar leva o volume junto, ja calculado', () => {
  const t = comLinhas([supino()]);
  const salvo = paraSalvar(t);
  assert.equal(salvo.totalSeries, 3);
  assert.equal(salvo.volPorPadrao.empurrar, 3);
  assert.equal(salvo.volPorMusculo.peito, 3);
  assert.equal(salvo.volPorGrupo.peito, 3);
  assert.deepEqual(salvo.blocos, t.blocos, 'salvar nao mexe nos exercicios');
});

test('o total salvo conta o exercicio fora do catalogo, que some dos outros mapas', () => {
  // O coach escreve um exercício que a Academia ainda não tem: ele não tem padrão
  // nem músculo, some das duas tabelas, mas as séries dele foram treinadas. Sem
  // `totalSeries` guardado, o histórico mostraria menos do que a tela mostrou.
  const t = comLinhas([supino(), { id: '', nome: 'Agachamento do coach', series: 3, travado: false }]);
  const salvo = paraSalvar(t);
  assert.equal(salvo.totalSeries, 6);
  const somaPadroes = Object.values(salvo.volPorPadrao).reduce((a, b) => a + b, 0);
  assert.equal(somaPadroes, 3, 'a linha fora do catalogo nao entra no volume por padrao');
});

test('bloco novo nasce vazio e com o nome dado', () => {
  const b = blocoNovo('Finalizador', 'finalizador');
  assert.deepEqual(b, { nome: 'Finalizador', tipo: 'finalizador', exercicios: [] });
});
