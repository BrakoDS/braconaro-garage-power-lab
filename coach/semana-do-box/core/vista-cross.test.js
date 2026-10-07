// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESTACOES_HYROX_SEM_SUBSTITUTA, NIVEIS_HYROX, NOME_PADRAO_CROSS, alunosPorMovimento, conteudoEditavel, diasComCrossTrocado,
  diasComHyroxTrocado, estacoesEmAlerta, hyroxDaSemana, linhasDaCorrida, linhasDoInventario, movimentosEmAlerta, nomesDoWod,
  quantidadeCross, selosDaOpcaoCross, acoesDoConflitoCross, semanaAfetada, temSubstitutaHyrox, textoAlertaCross,
  textoAlertaHyrox, textoContaWod, textoSegundos, tituloHyrox, tituloWod, totalDeAlertas, wodDaSemana,
  NOME_CATEGORIA_FOCO, NOME_TIPO_TECNICA, alertasDaTecnica, diasComFocoTrocado, tituloTecnica, unidadesNaTecnica,
} from './vista.js';

/** Saída real do gerador do servidor (W44, variação 21): Chipper e Hyrox compromised. */
const W44 = JSON.parse(readFileSync(new URL('./fixtures/semana-cross-hyrox.json', import.meta.url), 'utf8'));
/** A W42 de antes do Cross/Hyrox: os dias só sinalizam as duas modalidades. */
const W42 = JSON.parse(readFileSync(new URL('./fixtures/semana-w42.json', import.meta.url), 'utf8'));
const modelo = readFileSync(new URL('../../../functions/src/modelo-box.ts', import.meta.url), 'utf8');
const catalogoHyrox = readFileSync(new URL('../../../functions/src/catalogo-hyrox.ts', import.meta.url), 'utf8');

/** As strings de uma `export const X = [...]` do servidor. */
const lista = (nome) => {
  const ini = modelo.indexOf(`export const ${nome} = [`);
  assert.ok(ini >= 0, `${nome} não encontrado no modelo do servidor`);
  return [...modelo.slice(ini, modelo.indexOf(']', ini)).matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

test('paridade: padrões, níveis e estações sem substituta são os do servidor', () => {
  assert.deepEqual(Object.keys(NOME_PADRAO_CROSS), lista('PADROES_CROSS'));
  assert.deepEqual(NIVEIS_HYROX.map((n) => n.id), lista('NIVEIS_HYROX'));
  // Um pedaço por estação de `DADOS_ESTACAO_HYROX` (cada uma começa em `  id: {`), só até o fim
  // dele: a tabela de músculos (`MUSCULOS_HYROX`), logo abaixo, também tem `substituta: null`.
  const inicio = catalogoHyrox.indexOf('export const DADOS_ESTACAO_HYROX');
  const dados = catalogoHyrox.slice(inicio, catalogoHyrox.indexOf('\n};', inicio));
  const semSub = dados.split(/^ {2}(?=[a-z_]+: \{)/m).slice(1)
    .filter((bloco) => bloco.includes('substituta: null')).map((bloco) => bloco.slice(0, bloco.indexOf(':')));
  assert.deepEqual(ESTACOES_HYROX_SEM_SUBSTITUTA, semSub, 'substituta: null em catalogo-hyrox.ts');
});

test('WOD e Hyrox da semana: o gerado e a semana de antes deles', () => {
  const w = wodDaSemana(W44);
  assert.equal(w?.wod.formato, 'Chipper');
  assert.deepEqual(w?.dias, [{ id: 'terca', nome: 'Terça', papel: 'principal' }]);
  const h = hyroxDaSemana(W44);
  assert.equal(h?.hyrox.formato, 'compromised');
  assert.deepEqual(h?.dias.map((d) => d.id), ['quinta']);
  assert.equal(wodDaSemana(W42), null, 'semana antiga: sem WOD');
  assert.equal(hyroxDaSemana(W42), null, 'semana antiga: sem Hyrox');
  assert.equal(wodDaSemana(null), null);
});

test('WOD: cabeçalho por formato e quantidade por unidade', () => {
  assert.equal(tituloWod({ formato: 'AMRAP', minutos: 16, rodadas: null }), 'AMRAP · 16 min');
  assert.equal(tituloWod({ formato: 'For Time', minutos: 16, rodadas: 4 }), 'For Time · 4 rodadas · cap 16 min');
  assert.equal(tituloWod({ formato: 'EMOM', minutos: 15, rodadas: 5 }), 'EMOM · 15 min (5 voltas)');
  assert.equal(tituloWod(W44.dias.terca.cross), 'Chipper · cap 15 min');
  assert.equal(quantidadeCross({ unidade: 'reps' }, 15), '15');
  assert.equal(quantidadeCross({ unidade: 'metros' }, 200), '200 m');
  assert.equal(quantidadeCross({ unidade: 'calorias' }, 12), '12 cal');
  assert.equal(quantidadeCross({ unidade: 'segundos' }, 30), '30 s');
  assert.equal(quantidadeCross({ unidade: 'reps', porLado: true }, 10), '10 por lado');
});

test('WOD: a conta da turma espelha o servidor (regra mista)', () => {
  assert.deepEqual([alunosPorMovimento('AMRAP', 6, 3), alunosPorMovimento('Chipper', 6, 5), alunosPorMovimento('EMOM', 6, 3)], [2, 2, 6]);
  assert.match(textoContaWod({ formato: 'EMOM', movimentos: [1, 2, 3] }, 6), /turma inteira \(6\)/);
  assert.match(textoContaWod(W44.dias.terca.cross, 6), /turma de 6 .* até 2 alunos por movimento, e os movimentos somam/);
  assert.equal(textoContaWod(W44.dias.terca.cross, undefined), '', 'sem turma gravada, sem rodapé');
});

test('WOD: alerta vira texto com os nomes e marca os movimentos', () => {
  const ids = W44.dias.terca.cross.movimentos.map((m) => m.exercicioId);
  const doc = { ...W44, alertasCross: [{ recurso: 'barraOlimpica', usado: 6, limite: 4, exercicios: [ids[4]], dias: ['terca'] }] };
  assert.equal(textoAlertaCross(doc.alertasCross[0], nomesDoWod(doc)),
    'Limite de Barras olímpicas atingido no WOD (terça): 6 em uso, 4 ativos — Power clean (barra).');
  assert.equal(textoAlertaCross(doc.alertasCross[0]), 'Limite de Barras olímpicas atingido no WOD (terça): 6 em uso, 4 ativos.', 'sem nomes (inventário)');
  assert.deepEqual([...movimentosEmAlerta(doc)], [ids[4]]);
  assert.equal(totalDeAlertas(doc), 1);
});

test('WOD: a troca monta o pedido só com ids, em todo dia que tem o WOD', () => {
  const dias = diasComCrossTrocado(W44, 3, 'push_press');
  const c = dias.terca.cross;
  assert.deepEqual(Object.keys(c), ['formato', 'minutos', 'rodadas', 'movimentos', 'tecnica']);
  assert.deepEqual(c.tecnica, { exercicioId: 'power_clean' }, 'o foco fica: continua no WOD');
  assert.equal(c.formato, 'Chipper');
  assert.deepEqual(c.movimentos.map((m) => m.exercicioId), W44.dias.terca.cross.movimentos.map((m, i) => (i === 2 ? 'push_press' : m.exercicioId)));
  assert.ok(c.movimentos.every((m) => Object.keys(m).join() === 'exercicioId'), 'prescrição é do servidor');
  assert.equal(dias.quinta.cross, undefined, 'dia sem WOD não ganha WOD');
  assert.equal(dias.quinta.hyrox, undefined, 'o Hyrox não vai: o servidor mantém o gravado');
  assert.equal(dias.sexta.hiit, undefined, 'o HIIT não vai: o servidor mantém o gravado');
});

test('WOD: selos e ações da troca (só o rodízio pergunta)', () => {
  const sem = { noWod: false, padraoRepetido: null, tiraOCardio: false, equipamento: [], semanaAnterior: false };
  assert.deepEqual(selosDaOpcaoCross({ conflitos: sem }), []);
  assert.deepEqual(selosDaOpcaoCross({ conflitos: { ...sem, noWod: true, padraoRepetido: 'Kettlebell swing', tiraOCardio: true, equipamento: ['barraOlimpica'] } })
    .map((s) => s.rotulo), ['já no WOD', 'mesmo padrão de Kettlebell swing', 'tira o cardio', '🔧 Barras olímpicas']);
  assert.deepEqual(acoesDoConflitoCross({ conflitos: { ...sem, semanaAnterior: true } }).map((a) => a.id), ['manter', 'outro']);
  assert.deepEqual(acoesDoConflitoCross({ conflitos: sem }), []);
});

test('Hyrox: cabeçalho, corrida e air bike por nível', () => {
  const h = W44.dias.quinta.hyrox;
  assert.equal(tituloHyrox(h), 'Compromised running · 2 rodadas');
  assert.equal(tituloHyrox({ nome: 'Prova completa', rodadas: 1 }), 'Prova completa');
  const [corrida, bike] = linhasDaCorrida(h);
  assert.deepEqual(corrida.valores, ['100', '300', '500', '1000']);
  assert.deepEqual(bike.valores, ['50 s', '1 min', '2 min', '4 min']);
  assert.deepEqual([textoSegundos(45), textoSegundos(60), textoSegundos(95), textoSegundos(240)], ['45 s', '1 min', '1 min 35 s', '4 min']);
});

test('Hyrox: alerta com o nome gravado, substituta e estação marcada', () => {
  const a = { estacao: 'sled_push', recurso: 'sled', precisa: 1, limite: 0, temSubstituta: true, dias: ['quinta'] };
  assert.equal(textoAlertaHyrox(a, 'Sled Push (empurrar trenó)'),
    'No Hyrox (quinta), Sled Push (empurrar trenó) precisa de 1 Sled (trenó), e o box tem 0 ativos — troque pela substituta.');
  assert.equal(textoAlertaHyrox({ ...a, temSubstituta: false }, 'Sled Push'), 'No Hyrox (quinta), Sled Push precisa de 1 Sled (trenó), e o box tem 0 ativos.');
  assert.deepEqual([...estacoesEmAlerta({ alertasHyrox: [a] })], ['sled_push']);
  assert.ok(temSubstitutaHyrox('sled_push') && !temSubstitutaHyrox('burpee_broad_jump'));
});

test('Hyrox: a troca manda formato e estações com a substituta, em todo dia que tem o Hyrox', () => {
  const dias = diasComHyroxTrocado(W44, 'sled_push', true);
  const h = dias.quinta.hyrox;
  assert.equal(h.formato, 'compromised');
  assert.deepEqual(h.estacoes, W44.dias.quinta.hyrox.estacoes.map((e) => ({ estacao: e.estacao, substituta: e.estacao === 'sled_push' })));
  const volta = diasComHyroxTrocado({ ...W44, dias: { ...W44.dias, quinta: { ...W44.dias.quinta, hyrox: { ...h, estacoes: h.estacoes } } } }, 'sled_push', false);
  assert.equal(volta.quinta.hyrox.estacoes.find((e) => e.estacao === 'sled_push').substituta, false, 'volta à estação da prova');
  assert.equal(dias.terca.cross, undefined, 'o WOD não vai: o servidor mantém o gravado');
});

test('trava: rascunho troca; publicada trava o dia que passou', () => {
  assert.ok(conteudoEditavel(W44, 'cross', '2026-11-30') && conteudoEditavel(W44, 'hyrox', '2026-11-30'), 'rascunho: sempre');
  const pub = { ...W44, status: 'publicado' };
  // W44: terça 27/10, quinta 29/10.
  assert.ok(conteudoEditavel(pub, 'cross', '2026-10-27'), 'hoje não é passado');
  assert.ok(!conteudoEditavel(pub, 'cross', '2026-10-28') && conteudoEditavel(pub, 'hyrox', '2026-10-28'), 'na quarta: WOD travado, Hyrox não');
  assert.ok(!conteudoEditavel(pub, 'hyrox', '2026-10-30'));
  assert.ok(!conteudoEditavel(W42, 'cross', '2026-01-01'), 'sem WOD, nada a trocar');
});

test('inventário: barras e sled no grupo do Cross/Hyrox; semana afetada fala do WOD e do Hyrox', () => {
  const doc = {
    equipamentos: { barraOlimpica: { total: 4, emManutencao: 1, observacao: '' }, sled: { total: 1, emManutencao: 0, observacao: '' } },
    limitesAtivos: { barraOlimpica: 3, sled: 1 },
  };
  const linhas = linhasDoInventario(doc).filter((l) => l.grupo === 'crossHyrox');
  assert.deepEqual(linhas.map((l) => [l.recurso, l.nome, l.ativos]), [['barraOlimpica', 'Barra olímpica', 3], ['sled', 'Sled (trenó)', 1]]);
  const s = semanaAfetada({
    semanaId: '2026-W44', status: 'rascunho',
    alertasCross: [{ recurso: 'barraOlimpica', usado: 6, limite: 3, exercicios: ['power_clean'], dias: ['terca'] }],
    alertasHyrox: [{ estacao: 'sled_push', recurso: 'sled', precisa: 1, limite: 0, temSubstituta: true, dias: ['quinta'] }],
  });
  assert.deepEqual(s.alertas, [
    'Limite de Barras olímpicas atingido no WOD (terça): 6 em uso, 3 ativos.',
    'No Hyrox (quinta), sled_push precisa de 1 Sled (trenó), e o box tem 0 ativos — troque pela substituta.',
  ]);
});

test('paridade: tipos e categorias da Técnica / Força são os do servidor', () => {
  assert.deepEqual(Object.keys(NOME_CATEGORIA_FOCO), lista('CATEGORIAS_FOCO'), 'na ordem de prioridade');
  assert.deepEqual(Object.keys(NOME_TIPO_TECNICA), lista('TIPOS_TECNICA'));
  assert.deepEqual([2, 5, 6, 9].map(unidadesNaTecnica), [1, 3, 3, 5], 'duplas revezando: turma / 2, para cima (espelho do servidor)');
});

test('Técnica / Força: título, alerta próprio e o WOD sem pintar o foco por causa dela', () => {
  const t = W44.dias.terca.cross.tecnica;
  assert.equal(tituloTecnica(t), 'Power clean (barra) · Técnica · 10 min');
  const a = { recurso: 'barraOlimpica', usado: 5, limite: 4, exercicios: ['power_clean'], dias: ['terca'], bloco: 'tecnica' };
  const doc = { ...W44, alertasCross: [a] };
  assert.equal(textoAlertaCross(a, nomesDoWod(doc)),
    'Limite de Barras olímpicas atingido na Técnica / Força (terça): 5 em uso com a turma em duplas, 4 ativos — Power clean (barra).');
  assert.deepEqual(alertasDaTecnica(doc), [a]);
  assert.equal(movimentosEmAlerta(doc).size, 0, 'o alerta da técnica não marca o movimento no WOD');
  assert.equal(totalDeAlertas(doc), 1, 'mas conta no total');
});

test('Técnica / Força: trocar o foco manda o WOD igual e o foco novo', () => {
  const dias = diasComFocoTrocado(W44, 'flexao');
  assert.deepEqual(dias.terca.cross.tecnica, { exercicioId: 'flexao' });
  assert.deepEqual(dias.terca.cross.movimentos.map((m) => m.exercicioId), W44.dias.terca.cross.movimentos.map((m) => m.exercicioId));
  assert.equal(dias.quinta.cross, undefined);
});

test('troca no WOD: tirar o foco deixa o servidor escolher outro; selos de técnica', () => {
  const pos = W44.dias.terca.cross.movimentos.findIndex((m) => m.exercicioId === 'power_clean') + 1;
  const dias = diasComCrossTrocado(W44, pos, 'kb_swing');
  assert.equal(dias.terca.cross.tecnica, undefined, 'o foco saiu do WOD: o pedido não escolhe');
  const sem = { noWod: false, padraoRepetido: null, tiraOCardio: false, equipamento: [], semanaAnterior: false };
  assert.deepEqual(selosDaOpcaoCross({ conflitos: { ...sem, tiraATecnica: true } }).map((s) => s.rotulo), ['tira a Técnica / Força']);
  assert.deepEqual(selosDaOpcaoCross({ conflitos: { ...sem, viraFoco: true } }).map((s) => [s.id, s.rotulo]), [['foco', '★ vira o foco da técnica']]);
});
