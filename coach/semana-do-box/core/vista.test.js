// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIAS, RECURSOS, NOME_INSTANCIA, estadoDaSemana, textoAlerta, textoTroca, posicoesEmAlerta,
  consumoVisivel, publicacao, variacaoSeguinte, msDe, datasDosDias, tituloForca,
} from './vista.js';

/**
 * Semana 2026-W42 saída do gerador DO SERVIDOR (functions/lib/gerador-box.js),
 * com 1 smith ativo — é a forma real do documento, não uma imitação dela.
 */
const W42 = JSON.parse(readFileSync(new URL('./fixtures/semana-w42.json', import.meta.url), 'utf8'));

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
