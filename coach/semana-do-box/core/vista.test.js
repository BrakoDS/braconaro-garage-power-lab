// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIAS, RECURSOS, NOME_INSTANCIA, NOME_RECURSO, estadoDaSemana, textoAlerta, textoTroca, posicoesEmAlerta,
  consumoVisivel, publicacao, variacaoSeguinte, msDe, datasDosDias, tituloForca,
  linhasDoInventario, alteracoesDoInventario, semanaAfetada, segundaDaChave,
  rotuloDias, datasIsoDosDias, sessaoEditavel, diasParaSalvar, textoConflitos, selosDaOpcao, acoesDoConflito, temConflito, textoAvisoEdicao,
  RECURSOS_HIIT, TURMA_MAX, TURMA_MIN, alunosPorEstacao, hiitDaSemana, inventarioCompleto, nomesDoHiit,
  rotuloDiasHiit, slotsEmAlertaHiit, textoAlertaHiit, textoForaDoHiit, totalDeAlertas, turmaDoInventario,
  acoesDoConflitoHiit, diasComHiitTrocado, hiitEditavel, rotuloSlots, selosDaOpcaoHiit, RECURSOS_CROSS_HYROX,
} from './vista.js';

/**
 * Semana 2026-W42 saída do gerador DO SERVIDOR (functions/lib/gerador-box.js),
 * com 1 smith ativo — é a forma real do documento, não uma imitação dela.
 */
const W42 = JSON.parse(readFileSync(new URL('./fixtures/semana-w42.json', import.meta.url), 'utf8'));
/** Saída real do gerador do servidor com o HIIT (W43, inventário de fábrica, turma de 6). */
const HIIT = JSON.parse(readFileSync(new URL('./fixtures/semana-hiit.json', import.meta.url), 'utf8'));

test('estado: sem documento, rascunho e publicada', () => {
  assert.equal(estadoDaSemana(null).id, 'vazia');
  assert.equal(estadoDaSemana(W42).rotulo, 'Rascunho');
  assert.equal(estadoDaSemana({ ...W42, status: 'publicado' }).id, 'publicado');
});

test('alerta: nome do recurso no plural e a preposição do dia', () => {
  assert.equal(textoAlerta({ dia: 'segunda', recurso: 'smith', usado: 3, limite: 2 }),
    'Limite de Smiths atingido na segunda: 3 em uso, 2 ativos.');
  assert.equal(textoAlerta({ dia: 'sabado', recurso: 'maquinaLegs', usado: 2, limite: 1 }),
    'Limite de Máquinas de pernas (extensora/flexora) atingido no sábado: 2 em uso, 1 ativo.');
});

test('troca: usa os nomes que o servidor gravou', () => {
  const t = W42.geracao.trocas[0];
  assert.ok(t, 'a fixture tem ao menos uma troca da trava');
  assert.match(textoTroca(t), new RegExp(`^${t.sessao}, vaga ${t.posicao}: .+ → .+ \\(faltou .+\\)\\.$`));
  assert.ok(textoTroca(t).includes(t.paraNome));
  // Troca sem nome (formato antigo) cai no id em vez de mostrar "undefined".
  assert.ok(textoTroca({ sessao: 'H1', posicao: 1, de: 'a', para: 'b', recurso: 'smith' }).includes('a → b'));
});

test('destaque: só as posições que ocupam o recurso estourado NAQUELE dia', () => {
  const bloco = W42.dias.segunda.blocoPrincipal;
  const comSmith = bloco.map((e, i) => (e.recursos.includes('smith') ? i : -1)).filter((i) => i >= 0);
  const doc = { ...W42, alertas: [{ dia: 'segunda', recurso: 'smith', usado: 2, limite: 1 }] };
  assert.deepEqual([...posicoesEmAlerta(doc, 'segunda')], comSmith);
  assert.equal(posicoesEmAlerta(doc, 'terca').size, 0, 'alerta da segunda não pinta a terça');
  assert.equal(posicoesEmAlerta(W42, 'segunda').size, 0, 'sem alerta, nada pintado');
});

test('consumo: só o que o dia usa, contra o limite gravado', () => {
  const c = consumoVisivel(W42.dias.segunda, W42.limitesUsados);
  assert.ok(c.length > 0);
  for (const x of c) {
    assert.ok(RECURSOS.includes(x.recurso));
    assert.equal(x.usado, W42.dias.segunda.consumoEquipamentos[x.recurso]);
    assert.equal(x.limite, W42.limitesUsados[x.recurso]);
    assert.equal(x.estourou, x.usado > x.limite);
  }
  assert.deepEqual(consumoVisivel(W42.dias.quinta, W42.limitesUsados), [], 'Hyrox: sem bloco, sem consumo');
  const semLimite = consumoVisivel(W42.dias.segunda, undefined);
  assert.ok(semLimite.every((x) => x.limite === null && !x.estourou), 'sem limitesUsados não inventa estouro');
});

test('publicar: espelha problemasParaPublicar do servidor', () => {
  assert.deepEqual(publicacao(W42), { pode: true, motivos: [] });
  const travada = publicacao({ ...W42, problemasParaPublicar: ['segunda: 3 estações de smith, e o box tem 2 ativa(s).'] });
  assert.equal(travada.pode, false);
  assert.equal(travada.motivos.length, 1);
  assert.equal(publicacao({ ...W42, status: 'publicado' }).pode, false, 'publicada não publica de novo');
  assert.equal(publicacao(null).pode, false);
  const antiga = { ...W42 };
  delete antiga.problemasParaPublicar;
  assert.equal(publicacao(antiga).pode, true, 'documento sem o campo deixa o servidor decidir');
});

test('sortear de novo: próxima variação, com volta em 1000', () => {
  assert.equal(variacaoSeguinte(W42), 1);
  assert.equal(variacaoSeguinte({ geracao: { variacao: 999 } }), 0);
  assert.equal(variacaoSeguinte({}), 1);
  assert.equal(variacaoSeguinte({ geracao: { variacao: 'x' } }), 1);
});

test('datas: segunda a sábado da W42 (12 a 17/10/2026)', () => {
  assert.deepEqual(datasDosDias(W42.dataInicio), {
    segunda: '12/10', terca: '13/10', quarta: '14/10', quinta: '15/10', sexta: '16/10', sabado: '17/10',
  });
  assert.equal(msDe({ toMillis: () => 5 }), 5);
  assert.ok(Number.isNaN(msDe(undefined)));
  assert.equal(datasDosDias(undefined).segunda, '');
});

test('título da força: principal e catch-up', () => {
  assert.equal(tituloForca(W42.dias.segunda), 'H1 · Força Base — Agachar/Empurrar');
  assert.equal(tituloForca(W42.dias.terca), 'H1 · Força Base — Agachar/Empurrar (catch-up)');
  assert.equal(tituloForca(W42.dias.quinta), '');
});

test('vocabulário cobre o que o servidor manda', () => {
  assert.deepEqual(DIAS.map((d) => d.id), Object.keys(W42.dias));
  for (const d of Object.values(W42.dias)) {
    for (const e of d.blocoPrincipal) assert.ok(NOME_INSTANCIA[e.instancia], `instância sem nome: ${e.instancia}`);
  }
});

test('inventário: linhas a partir do documento, com os ativos do servidor', () => {
  const doc = {
    equipamentos: {
      smith: { total: 2, emManutencao: 1, observacao: 'cabo rompido' },
      banco: { total: 2, emManutencao: 0, observacao: '' },
      monocross: { total: 3, emManutencao: 0, observacao: '' },
      maquinaLegs: { total: 1, emManutencao: 0, observacao: '' },
      cavalinho: { total: 2, emManutencao: 0, observacao: '' },
    },
    limitesAtivos: { smith: 1, banco: 2, monocross: 3, maquinaLegs: 1, cavalinho: 2 },
  };
  const linhas = linhasDoInventario(doc);
  assert.deepEqual(linhas.filter((l) => l.grupo === 'forca').map((l) => l.recurso), RECURSOS);
  assert.deepEqual(linhas.filter((l) => l.grupo === 'hiit').map((l) => l.recurso), RECURSOS_HIIT, 'depois da força, os do HIIT');
  assert.deepEqual(linhas[0], { recurso: 'smith', grupo: 'forca', nome: 'Smith', total: 2, emManutencao: 1, observacao: 'cabo rompido', ativos: 1 });
  assert.deepEqual(linhasDoInventario(null), [], 'sem documento, sem linhas');
  assert.equal(linhasDoInventario({ equipamentos: {} })[0].ativos, null, 'sem limitesAtivos, a tela não inventa');
});

test('inventário: só manda o que mudou', () => {
  const original = linhasDoInventario({
    equipamentos: { smith: { total: 2, emManutencao: 0, observacao: '' }, banco: { total: 2, emManutencao: 0, observacao: '' } },
    limitesAtivos: {},
  });
  const editado = original.map((l) => (l.recurso === 'smith' ? { ...l, emManutencao: 1, observacao: '  cabo rompido ' } : { ...l }));
  assert.deepEqual(alteracoesDoInventario(original, editado), { smith: { emManutencao: 1, observacao: 'cabo rompido' } });
  assert.deepEqual(alteracoesDoInventario(original, original.map((l) => ({ ...l }))), {}, 'nada mudou, nada vai');
});

test('semana afetada: publicada não é despublicada, e a tela diz isso', () => {
  const pub = semanaAfetada({ semanaId: '2026-W42', status: 'publicado', alertas: [{ dia: 'segunda', recurso: 'smith', usado: 2, limite: 1 }] });
  assert.equal(pub.titulo, 'Semana 2026-W42 · publicada');
  assert.deepEqual(pub.alertas, ['Limite de Smiths atingido na segunda: 2 em uso, 1 ativo.']);
  assert.match(pub.acao, /Volte para rascunho/);
  assert.match(semanaAfetada({ semanaId: '2026-W43', status: 'rascunho', alertas: [] }).acao, /^Sorteie de novo/);
});

test('segunda-feira da chave: abre a semana afetada no mês certo', () => {
  assert.equal(segundaDaChave('2026-W42'), '2026-10-12');
  assert.equal(segundaDaChave('2026-W01'), '2025-12-29', 'semana 1 que começa no ano anterior');
  assert.equal(segundaDaChave('2026-W53'), '2026-12-28');
  assert.equal(segundaDaChave('x'), '');
});

test('edição: a troca vale para TODOS os dias da sessão (H1 = segunda e terça)', () => {
  const novo = diasParaSalvar(W42, [{ sessao: 'H1', posicao: 2, exercicioId: 'supino_smith' }]);
  assert.equal(novo.segunda.blocoPrincipal[1].exercicioId, 'supino_smith');
  assert.equal(novo.terca.blocoPrincipal[1].exercicioId, 'supino_smith', 'o catch-up muda junto');
  assert.deepEqual(novo.quarta.blocoPrincipal, W42.dias.quarta.blocoPrincipal.map((e) => ({
    exercicioId: e.exercicioId, series: e.series, repeticoes: e.repeticoes, descansoSeg: e.descansoSeg,
  })), 'o H2 não muda');
  const s = W42.dias.segunda.blocoPrincipal[1];
  assert.deepEqual(novo.segunda.blocoPrincipal[1], { exercicioId: 'supino_smith', series: s.series, repeticoes: s.repeticoes, descansoSeg: s.descansoSeg },
    'séries, reps e descanso da vaga ficam');
  assert.deepEqual(novo.quinta, { treinos: ['Hyrox'], blocoPrincipal: [], cadencia: W42.dias.quinta.cadencia, descansos: W42.dias.quinta.descansos });
  assert.deepEqual(diasParaSalvar(W42).segunda.blocoPrincipal.map((e) => e.exercicioId),
    W42.dias.segunda.blocoPrincipal.map((e) => e.exercicioId), 'sem troca, a semana volta igual');
});

test('edição: sessão travada só em semana já publicada com dia passado', () => {
  assert.equal(sessaoEditavel(W42, 'H1', '2026-10-20'), true, 'rascunho nunca trava');
  const pub = { ...W42, status: 'publicado' };
  assert.equal(sessaoEditavel(pub, 'H1', '2026-10-12'), true, 'segunda é hoje: ainda dá');
  assert.equal(sessaoEditavel(pub, 'H1', '2026-10-13'), false, 'na terça, o H1 (segunda já passou) trava');
  assert.equal(sessaoEditavel(pub, 'H2', '2026-10-13'), true, 'o H2 de quarta segue editável');
  assert.equal(sessaoEditavel({ ...W42, publicadoEm: { seconds: 1 } }, 'H1', '2026-10-13'), false, 'voltou para rascunho depois de publicada: trava igual');
  assert.equal(datasIsoDosDias(W42.dataInicio).sabado, '2026-10-17');
});

test('edição: textos, selos e as ações do aviso', () => {
  const rep = { mesmoBloco: false, repeticoes: [{ sessao: 'H2', posicao: 1, dias: ['quarta'] }], semanaAnterior: true, equipamento: [], instanciaDiferente: false };
  assert.deepEqual(textoConflitos(rep, 'H1'), ['Já está no H2 (vaga 1 · quarta).', 'Foi usado na semana passada: quebra o rodízio.']);
  assert.deepEqual(selosDaOpcao(rep).map((s) => s.id), ['repetido', 'rodizio']);
  assert.equal(rotuloDias(['segunda', 'terca']), 'segunda e terça');

  const opcao = { conflitos: rep, substitutos: [{ sessao: 'H2', posicao: 1, dias: ['quarta'], opcoes: [{ exercicioId: 'ponte_gluteo', nome: 'Ponte de glúteo no chão' }] }] };
  assert.deepEqual(acoesDoConflito(opcao).map((a) => a.id),
    ['substituir:H2:1:ponte_gluteo', 'outro-substituto:H2:1', 'manter'], 'substituir no outro lugar, escolher outro, ou manter');
  assert.equal(acoesDoConflito(opcao)[0].label, 'Trocar no H2 por Ponte de glúteo no chão');

  const equip = { conflitos: { ...rep, repeticoes: [], semanaAnterior: false, equipamento: [{ recurso: 'smith', usado: 3, limite: 2 }] }, substitutos: [] };
  assert.deepEqual(acoesDoConflito(equip).map((a) => a.id), ['outro'], 'equipamento acima do limite NÃO tem "manter"');
  assert.equal(textoConflitos(equip.conflitos, 'H1')[0], 'Passa do limite de Smiths: 3 em uso, 2 ativos. A semana não publica assim.');
  assert.deepEqual(acoesDoConflito({ conflitos: { ...rep, repeticoes: [], semanaAnterior: false, mesmoBloco: true }, substitutos: [] }).map((a) => a.id), ['outro']);
  assert.equal(temConflito({ mesmoBloco: false, repeticoes: [], semanaAnterior: false, equipamento: [], instanciaDiferente: false }), false);
});

test('edição: notas gravadas na semana', () => {
  assert.equal(textoAvisoEdicao({ tipo: 'repeticao', nome: 'RDL Smith', lugares: [{ sessao: 'H1', posicao: 5 }, { sessao: 'H2', posicao: 1 }] }),
    'RDL Smith está em H1 (vaga 5) e H2 (vaga 1).');
  assert.equal(textoAvisoEdicao({ tipo: 'semanaAnterior', nome: 'Flexão no TRX', sessao: 'H2', posicao: 5 }), 'Flexão no TRX (H2, vaga 5) foi usado na semana passada.');
});

test('inventário: turma e documento de antes do HIIT', () => {
  const antigo = {
    equipamentos: { smith: { total: 2, emManutencao: 0 }, banco: { total: 2 }, monocross: { total: 3 }, maquinaLegs: { total: 1 }, cavalinho: { total: 2 } },
    limitesAtivos: { smith: 2 },
  };
  assert.equal(turmaDoInventario(antigo), null, 'inventário antigo não tem turma');
  assert.equal(inventarioCompleto(antigo), false, 'e precisa ser normalizado pelo servidor');
  const novo = {
    ...antigo,
    equipamentos: { ...antigo.equipamentos, ...Object.fromEntries(RECURSOS_HIIT.map((r) => [r, { total: 2, emManutencao: 0 }])) },
    alunosPorAula: 6,
  };
  assert.equal(turmaDoInventario(novo), 6);
  assert.equal(inventarioCompleto(novo), false, 'de depois do HIIT e antes do Cross/Hyrox: sem barras e sled, normaliza');
  const atual = {
    ...novo,
    equipamentos: { ...novo.equipamentos, ...Object.fromEntries(RECURSOS_CROSS_HYROX.map((r) => [r, { total: 1, emManutencao: 0 }])) },
  };
  assert.equal(inventarioCompleto(atual), true);
  assert.equal(inventarioCompleto({ ...atual, alunosPorAula: 0 }), false, 'turma fora da faixa = incompleto');
  assert.deepEqual([TURMA_MIN, TURMA_MAX], [1, 40], 'mesma faixa do servidor');
  assert.deepEqual([1, 4, 5, 6, 8, 9].map(alunosPorEstacao), [1, 1, 2, 2, 2, 3], 'turma ÷ 4, para cima (espelho do servidor)');
});

test('HIIT: a faixa da semana vem das estações gravadas na sexta e no sábado', () => {
  const h = hiitDaSemana(HIIT);
  assert.ok(h);
  assert.equal(h.estacoes.length, 4);
  assert.deepEqual(h.dias, [
    { id: 'sexta', nome: 'Sexta', papel: 'alternativa' },
    { id: 'sabado', nome: 'Sábado', papel: 'principal' },
  ]);
  assert.equal(rotuloDiasHiit(h.dias), 'sexta (alternativa) e sábado (principal)');
  assert.equal(h.protocolo, '2 Músicas de Tabata (16 rounds no total). 4x cada exercício.');
  assert.equal(hiitDaSemana(W42), null, 'semana de antes do gerador do HIIT: sem faixa');
  assert.equal(nomesDoHiit(HIIT).get('kb_swing'), 'Kettlebell swing');
});

test('HIIT: textos dos alertas, com e sem o nome dos exercícios', () => {
  const nomes = new Map([['flexao_trx', 'Flexão no TRX'], ['fallout_trx', 'Fallout no TRX']]);
  const slot = { recurso: 'trx', usado: 4, limite: 2, slot: 2, exercicios: ['flexao_trx', 'fallout_trx'], dias: ['sexta', 'sabado'] };
  assert.equal(textoAlertaHiit(slot, nomes),
    'Limite de TRX atingido no slot 2 do HIIT (sexta e sábado): 4 em uso, 2 ativos — Flexão no TRX + Fallout no TRX.');
  assert.equal(textoAlertaHiit(slot), 'Limite de TRX atingido no slot 2 do HIIT (sexta e sábado): 4 em uso, 2 ativos.',
    'sem a semana (aviso do inventário): sem nome');
  const sozinho = { recurso: 'sandbag', usado: 2, limite: 1, slot: null, exercicios: ['sandbag_clean'], dias: ['sexta', 'sabado'] };
  assert.equal(textoAlertaHiit(sozinho, new Map([['sandbag_clean', 'Clean com sandbag']])),
    'Clean com sandbag no HIIT (sexta e sábado) precisa sozinho de 2 Sandbags: 1 ativo.');
  assert.equal(textoAlertaHiit(sozinho), 'Um exercício no HIIT (sexta e sábado) precisa sozinho de 2 Sandbags: 1 ativo.');
  assert.equal(textoForaDoHiit(HIIT.geracao.hiitFora[0]), 'Clean com sandbag: precisa de 2 Sandbags, o box tem 1 ativo.');
  const espacial = {
    recurso: 'trx', usado: 2, limite: 1, slot: null, exercicios: ['flexao_trx', 'fallout_trx'],
    estacoes: ['superiores', 'core'], dias: ['sexta', 'sabado'],
  };
  assert.equal(textoAlertaHiit(espacial, nomes),
    'TRX fica fixo numa estação só, mas o HIIT (sexta e sábado) o usa em 2 estações: Superiores e Core — Flexão no TRX + Fallout no TRX.');
  assert.equal(textoAlertaHiit(espacial), 'TRX fica fixo numa estação só, mas o HIIT (sexta e sábado) o usa em 2 estações: Superiores e Core.',
    'no aviso do inventário, sem os nomes');
});

test('HIIT: o fixture (gerador real) põe o TRX numa estação só', () => {
  const comTrx = HIIT.dias.sabado.hiit.estacoes.filter((e) => e.slots.some((x) => x.consumoPorAluno.trx));
  assert.equal(comTrx.length, 1);
});

test('HIIT: slots em alerta e o total de alertas da semana', () => {
  assert.equal(slotsEmAlertaHiit(HIIT).size, 0, 'semana gerada sem alerta: nada marcado');
  // A estação e o slot do exercício com TRX no fixture (o gerador decide qual).
  const comTrx = HIIT.dias.sabado.hiit.estacoes.find((e) => e.slots.some((x) => x.consumoPorAluno.trx));
  const iTrx = comTrx.slots.findIndex((x) => x.consumoPorAluno.trx);
  const idTrx = comTrx.slots[iTrx].exercicioId;
  const pernas = HIIT.dias.sabado.hiit.estacoes.find((e) => e.estacao === 'pernas');
  const uni = pernas.slots.find((x) => x.lado === 'D').exercicioId;
  const doc = {
    ...HIIT,
    alertasHiit: [
      { recurso: 'trx', usado: 4, limite: 2, slot: iTrx + 1, exercicios: [idTrx], dias: ['sexta', 'sabado'] },
      { recurso: 'caixote', usado: 2, limite: 1, slot: null, exercicios: [uni], dias: ['sexta', 'sabado'] },
    ],
  };
  const m = slotsEmAlertaHiit(doc);
  assert.ok(m.has(`${comTrx.estacao}:${iTrx}`), 'alerta de slot marca o exercício daquele slot');
  const lados = pernas.slots.map((x, i) => (x.exercicioId === uni ? i : -1)).filter((i) => i >= 0);
  assert.equal(lados.length, 2);
  assert.ok(lados.every((i) => m.has(`pernas:${i}`)), 'alerta de exercício sozinho marca os dois lados do unilateral');
  assert.equal(m.size, 3);
  assert.equal(totalDeAlertas(doc), 2, 'a lista de semanas conta os alertas do HIIT');
  assert.equal(totalDeAlertas({ alertas: [{}], alertasHiit: [{}, {}] }), 3);
});

test('semana afetada: alertas do HIIT entram no aviso do inventário', () => {
  const a = semanaAfetada({
    semanaId: '2026-W43', status: 'rascunho', alertas: [],
    alertasHiit: [{ recurso: 'airbike', usado: 2, limite: 1, slot: null, exercicios: ['air_bike_sprint'], dias: ['sexta', 'sabado'] }],
  });
  assert.deepEqual(a.alertas, ['Um exercício no HIIT (sexta e sábado) precisa sozinho de 2 Air bikes: 1 ativo.']);
});

test('paridade: as listas de recursos da tela são as do servidor (functions/src/modelo-box.ts)', () => {
  const modelo = readFileSync(new URL('../../../functions/src/modelo-box.ts', import.meta.url), 'utf8');
  const lista = (nome) => {
    const ini = modelo.indexOf(`export const ${nome} = [`);
    const m = ini < 0 ? null : [null, modelo.slice(ini, modelo.indexOf(']', ini))];
    assert.ok(m, `${nome} não encontrado no modelo do servidor`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  assert.deepEqual(RECURSOS, lista('RECURSOS_INVENTARIO'));
  assert.deepEqual(RECURSOS_HIIT, lista('RECURSOS_HIIT'));
  assert.deepEqual(RECURSOS_CROSS_HYROX, lista('RECURSOS_CROSS_HYROX'));
  for (const r of [...RECURSOS, ...RECURSOS_HIIT, ...RECURSOS_CROSS_HYROX]) assert.ok(NOME_RECURSO[r], `recurso sem nome na tela: ${r}`);
});

test('troca no HIIT: a trava espelha a do servidor (sexta ou sábado no passado)', () => {
  assert.equal(hiitEditavel(HIIT, '2026-10-30'), true, 'rascunho: sempre');
  const pub = { ...HIIT, status: 'publicado' };
  assert.equal(hiitEditavel(pub, '2026-10-23'), true, 'publicada, na sexta: ainda dá (com aviso)');
  assert.equal(hiitEditavel(pub, '2026-10-24'), false, 'publicada, no sábado: a sexta passou');
  assert.equal(hiitEditavel(W42, '2026-10-01'), false, 'semana sem estações: nada a trocar');
});

test('troca no HIIT: o pedido leva a troca na sexta E no sábado, nos slots da vaga', () => {
  const pernas = HIIT.dias.sabado.hiit.estacoes.find((e) => e.estacao === 'pernas');
  const iD = pernas.slots.findIndex((x) => x.lado === 'D');
  const dias = diasComHiitTrocado(HIIT, { estacao: 'pernas', slots: [iD + 1, iD + 2], exercicioId: 'afundo_kb' });
  for (const d of ['sexta', 'sabado']) {
    const ids = dias[d].hiit.estacoes.find((e) => e.estacao === 'pernas').slots.map((x) => x.exercicioId);
    assert.equal(ids[iD], 'afundo_kb');
    assert.equal(ids[iD + 1], 'afundo_kb');
    assert.equal(ids.filter((x) => x === 'afundo_kb').length, 2, `${d}: só os dois slots da vaga`);
  }
  assert.equal(dias.segunda.hiit, undefined, 'dia sem HIIT não ganha hiit');
  assert.deepEqual(Object.keys(dias.sabado.hiit.estacoes[0].slots[0]), ['exercicioId'], 'o pedido manda só ids (o servidor calcula o resto)');
  assert.deepEqual(dias.sabado.hiit.estacoes.map((e) => e.estacao), HIIT.dias.sabado.hiit.estacoes.map((e) => e.estacao), 'a ordem das estações fica');
  assert.ok(Array.isArray(dias.sexta.blocoPrincipal) && dias.sexta.blocoPrincipal.length === 6, 'o H3 vai junto, intacto');
});

test('troca no HIIT: selos dizem por que a opção está bloqueada', () => {
  const sem = { noHiit: false, tamanhoDiferente: false, equipamento: [], fixoEmOutraEstacao: [], noBlocoDoDia: [], semanaAnterior: false };
  const rot = (c, unilateral = false) => selosDaOpcaoHiit({ unilateral, conflitos: { ...sem, ...c } }).map((x) => x.rotulo);
  assert.deepEqual(rot({}), []);
  assert.deepEqual(rot({ noHiit: true }), ['já no HIIT']);
  assert.deepEqual(rot({ tamanhoDiferente: true }, true), ['ocupa 2 slots']);
  assert.deepEqual(rot({ tamanhoDiferente: true }, false), ['ocupa 1 slot']);
  assert.deepEqual(rot({ equipamento: [{ recurso: 'sandbag', usado: 2, limite: 1, slot: null }] }), ['🔧 2 Sandbags, 1 ativo']);
  assert.deepEqual(rot({ equipamento: [{ recurso: 'wallBall', usado: 4, limite: 2, slot: 1 }] }), ['🔧 slot 1: 4 Wall balls']);
  assert.deepEqual(rot({ fixoEmOutraEstacao: [{ recurso: 'trx', estacoes: ['core'] }] }), ['📍 TRX no Core']);
  assert.deepEqual(rot({ noBlocoDoDia: [{ sessao: 'H3', dias: ['sexta', 'sabado'] }] }), ['no H3']);
  assert.deepEqual(rot({ semanaAnterior: true }), ['↺ semana passada']);
  assert.deepEqual(acoesDoConflitoHiit({ conflitos: { ...sem, semanaAnterior: true } }).map((a) => [a.id, !!a.secundaria]),
    [['manter', false], ['outro', true]], 'rodízio: manter ou escolher outro');
  assert.deepEqual(acoesDoConflitoHiit({ conflitos: sem }), [], 'sem conflito: grava direto');
  assert.equal(rotuloSlots([1]), 'slot 1');
  assert.equal(rotuloSlots([3, 4]), 'slots 3 e 4');
});

test('troca no H: exercício que já está no HIIT do dia bloqueia', () => {
  const c = { mesmoBloco: false, repeticoes: [], semanaAnterior: false, equipamento: [], instanciaDiferente: false, noHiit: ['sexta', 'sabado'] };
  assert.ok(temConflito(c));
  assert.deepEqual(selosDaOpcao(c).map((x) => x.rotulo), ['no HIIT do dia']);
  assert.deepEqual(acoesDoConflito({ conflitos: c, substitutos: [] }).map((a) => a.id), ['outro'], 'sem "manter"');
  assert.ok(textoConflitos(c, 'H3').some((l) => l.includes('Já está no HIIT (sexta e sábado)')));
});
