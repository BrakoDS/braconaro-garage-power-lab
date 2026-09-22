// @ts-check
/**
 * A adesão que o coach lê no painel. O que estes testes protegem não é a
 * aritmética — é a honestidade da tela: aluno novo não pode aparecer vermelho, e
 * dia sem rotina prescrita não pode contar como falha.
 *
 * Rodar: node --test compartilhado/regras/adesao.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_AGUA,
  ID_CREATINA,
  adesaoDoDia,
  adesaoPorBloco,
  desdeQuando,
  isoDia,
  mapaDeAdesao,
  nivelDeAdesao,
  normalizarRotina,
  resumoDeAdesao,
  sequenciaAtual,
} from './adesao.js';

const TODOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/** Uma quarta-feira qualquer, para os testes não dependerem do dia em que rodam. */
const HOJE = new Date(2026, 8, 23); // 23/09/2026, quarta
const dia = (n) => {
  const d = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate());
  d.setDate(d.getDate() - n);
  return isoDia(d);
};

/** Rotina de 3 blocos diários: água, creatina e um bloco comum. */
const bloco = (id, nome, dias = TODOS) => ({ id, nome, horario: '08:00', dias, categoria: 'saude' });
const TRES_DIARIOS = [
  bloco(ID_AGUA, 'Hidratação'),
  bloco(ID_CREATINA, 'Creatina'),
  bloco('cafe', 'Café da manhã'),
];

test('normalizar aceita documento torto sem quebrar', () => {
  const r = normalizarRotina({
    blocos: [null, { nome: 'sem id' }, { id: 'ok', dias: ['seg', 'xxx'] }],
    concluidos: { 'nao-e-data': ['a'], [dia(1)]: ['x', 7, null], [dia(2)]: 'texto' },
  });
  assert.equal(r.blocos.length, 1, 'bloco sem id não entra');
  assert.deepEqual(r.blocos[0].dias, ['seg'], 'sigla inválida é descartada');
  assert.equal(r.blocos[0].nome, 'ok', 'bloco sem nome cai no id, não em vazio');
  assert.deepEqual(Object.keys(r.concluidos), [dia(1)], 'chave que não é data não entra');
  assert.deepEqual(r.concluidos[dia(1)], ['x'], 'id que não é string não entra');
});

test('normalizar um documento inexistente devolve rotina vazia, não erro', () => {
  const r = normalizarRotina(null);
  assert.deepEqual(r, { blocos: [], concluidos: {} });
});

test('o dia é a fração dos blocos previstos que saíram', () => {
  const rotina = normalizarRotina({
    blocos: TRES_DIARIOS,
    concluidos: { [dia(1)]: [ID_AGUA, 'cafe'] },
  });
  const d = adesaoDoDia(rotina, new Date(2026, 8, 22), { hoje: isoDia(HOJE) });
  assert.equal(d.previstos, 3);
  assert.equal(d.feitos, 2);
  assert.equal(d.pct, 67);
  assert.equal(d.nivel, 2);
  assert.equal(d.semDado, false);
});

test('id concluído que não está mais prescrito não infla a conta', () => {
  const rotina = normalizarRotina({
    blocos: [bloco('cafe', 'Café da manhã')],
    concluidos: { [dia(1)]: ['cafe', 'bloco-que-o-aluno-apagou'] },
  });
  const d = adesaoDoDia(rotina, new Date(2026, 8, 22), { hoje: isoDia(HOJE) });
  assert.equal(d.previstos, 1);
  assert.equal(d.feitos, 1, 'o id órfão é ignorado, e não conta 2 de 1');
  assert.equal(d.pct, 100);
});

test('dia em que nada era previsto sai como sem-dado, não como 0%', () => {
  const rotina = normalizarRotina({
    blocos: [bloco('treino', 'Treino', ['seg', 'qua', 'sex'])],
    concluidos: { [dia(0)]: ['treino'] },
  });
  // 22/09/2026 é uma terça — o treino não cai nela.
  const terca = adesaoDoDia(rotina, new Date(2026, 8, 22), { hoje: isoDia(HOJE) });
  assert.equal(terca.semDado, true);
  assert.equal(terca.pct, null);
  assert.equal(terca.nivel, null, 'sem nível, o quadrado do heatmap fica vazio');
});

test('antes do primeiro registro, nenhum dia conta como falha', () => {
  const rotina = normalizarRotina({
    blocos: TRES_DIARIOS,
    concluidos: { [dia(2)]: [ID_AGUA, ID_CREATINA, 'cafe'] },
  });
  assert.equal(desdeQuando(rotina), dia(2));
  const antes = adesaoDoDia(rotina, new Date(2026, 8, 1), { hoje: isoDia(HOJE) });
  assert.equal(antes.semDado, true, 'aluno novo não aparece vermelho por três meses');
  assert.equal(antes.pct, null);
});

test('as faixas do heatmap não têm buraco nem sobreposição', () => {
  assert.equal(nivelDeAdesao(null), null);
  assert.equal(nivelDeAdesao(0), 0);
  assert.equal(nivelDeAdesao(1), 1);
  assert.equal(nivelDeAdesao(49), 1);
  assert.equal(nivelDeAdesao(50), 2);
  assert.equal(nivelDeAdesao(79), 2);
  assert.equal(nivelDeAdesao(80), 3);
  assert.equal(nivelDeAdesao(99), 3);
  assert.equal(nivelDeAdesao(100), 4);
});

test('o mapa sai alinhado à segunda e termina hoje', () => {
  const rotina = normalizarRotina({ blocos: TRES_DIARIOS, concluidos: { [dia(30)]: ['cafe'] } });
  const { dias, semanas } = mapaDeAdesao(rotina, { dias: 56, hoje: HOJE });

  assert.equal(dias[0].sigla, 'seg', 'a janela começa numa segunda');
  assert.equal(dias[dias.length - 1].iso, isoDia(HOJE), 'e termina hoje');
  assert.equal(dias[dias.length - 1].hoje, true, 'o último dia se declara como hoje');
  assert.ok(dias.length >= 56 && dias.length <= 62, `janela de ${dias.length} dias`);
  assert.equal(semanas[0].length, 7, 'as semanas fechadas têm 7 dias');
  assert.deepEqual(semanas[0].map((d) => d.sigla), ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
  assert.equal(semanas[semanas.length - 1].length, 3, 'a semana em curso vem parcial (seg, ter, qua)');
});

test('a sequência conta dias fechados e não é quebrada pelo dia em curso', () => {
  // Ontem e anteontem 100%; hoje, só a água.
  const rotina = normalizarRotina({
    blocos: TRES_DIARIOS,
    concluidos: {
      [dia(3)]: [ID_AGUA, ID_CREATINA, 'cafe'],
      [dia(2)]: [ID_AGUA, ID_CREATINA, 'cafe'],
      [dia(1)]: [ID_AGUA, ID_CREATINA, 'cafe'],
      [dia(0)]: [ID_AGUA],
    },
  });
  assert.equal(sequenciaAtual(rotina, HOJE), 3, 'hoje ainda incompleto não zera a sequência');

  // Fechando hoje, ele entra na conta.
  const completo = normalizarRotina({
    blocos: TRES_DIARIOS,
    concluidos: {
      [dia(1)]: [ID_AGUA, ID_CREATINA, 'cafe'],
      [dia(0)]: [ID_AGUA, ID_CREATINA, 'cafe'],
    },
  });
  assert.equal(sequenciaAtual(completo, HOJE), 2);

  // Um dia falhado no meio interrompe.
  const furado = normalizarRotina({
    blocos: TRES_DIARIOS,
    concluidos: {
      [dia(3)]: [ID_AGUA, ID_CREATINA, 'cafe'],
      [dia(2)]: [ID_AGUA],
      [dia(1)]: [ID_AGUA, ID_CREATINA, 'cafe'],
    },
  });
  assert.equal(sequenciaAtual(furado, HOJE), 1);
});

test('por bloco vem do pior para o melhor, com os obrigatórios marcados', () => {
  const rotina = normalizarRotina({
    blocos: TRES_DIARIOS,
    concluidos: {
      [dia(6)]: [ID_AGUA, 'cafe'],
      [dia(5)]: [ID_AGUA, 'cafe'],
      [dia(4)]: [ID_AGUA, 'cafe'],
      [dia(3)]: [ID_AGUA, 'cafe'],
      [dia(2)]: [ID_AGUA, 'cafe'],
      [dia(1)]: [ID_AGUA, 'cafe'],
      [dia(0)]: [ID_AGUA, 'cafe'],
    },
  });
  const lista = adesaoPorBloco(rotina, { dias: 7, hoje: HOJE });
  assert.equal(lista[0].id, ID_CREATINA, 'o hábito que está falhando aparece primeiro');
  assert.equal(lista[0].pct, 0);
  assert.equal(lista[0].obrigatorio, true);
  assert.equal(lista[1].pct, 100);
  assert.equal(lista.find((b) => b.id === 'cafe').obrigatorio, false);
});

test('bloco que nunca foi previsto na janela não aparece na lista', () => {
  const rotina = normalizarRotina({
    blocos: [bloco('cafe', 'Café'), bloco('so-domingo', 'Feira', ['dom'])],
    concluidos: { [dia(1)]: ['cafe'], [dia(0)]: ['cafe'] },
  });
  const lista = adesaoPorBloco(rotina, { dias: 2, hoje: HOJE });
  assert.deepEqual(lista.map((b) => b.id), ['cafe'], 'janela de 2 dias não tem domingo');
});

test('o resumo distingue "sem rotina" de "sem histórico" de "adesão zero"', () => {
  const semRotina = resumoDeAdesao({}, { hoje: HOJE });
  assert.equal(semRotina.temRotina, false);
  assert.equal(semRotina.temHistorico, false);
  assert.equal(semRotina.semana.pct, null, 'sem rotina não existe percentual, nem 0');

  const semHistorico = resumoDeAdesao({ blocos: TRES_DIARIOS }, { hoje: HOJE });
  assert.equal(semHistorico.temRotina, true);
  assert.equal(semHistorico.temHistorico, false);
  assert.equal(semHistorico.semana.pct, null);

  const zerado = resumoDeAdesao(
    { blocos: TRES_DIARIOS, concluidos: { [dia(1)]: [ID_AGUA] } },
    { hoje: HOJE },
  );
  assert.equal(zerado.temHistorico, true);
  assert.equal(zerado.semana.previstos, 6, 'dois dias com dado × 3 blocos');
  assert.equal(zerado.semana.feitos, 1);
  assert.equal(zerado.semana.pct, 17);
  assert.deepEqual(zerado.obrigatorios, [ID_AGUA, ID_CREATINA]);
});

test('o resumo de 30 dias ignora os dias fora do histórico', () => {
  const r = resumoDeAdesao(
    { blocos: TRES_DIARIOS, concluidos: { [dia(1)]: [ID_AGUA, ID_CREATINA, 'cafe'] } },
    { hoje: HOJE },
  );
  assert.equal(r.mes.comDado, 2, 'só ontem e hoje estão dentro do histórico');
  assert.equal(r.mes.previstos, 6);
  assert.equal(r.mes.pct, 50, 'e não 3/90 — os 28 dias anteriores não eram rotina do aluno');
});
