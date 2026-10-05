// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderLista, renderSemana, esc } from './render.js';

/** A W42 saída do gerador do servidor — ver `core/fixtures/semana-w42.json`. */
const W42 = JSON.parse(readFileSync(new URL('../core/fixtures/semana-w42.json', import.meta.url), 'utf8'));
const BASE = { chave: '2026-W42', rotulo: '12/10 a 18/10', inicio: '2026-10-12' };

test('semana não gerada: só o botão de gerar, com a data presa à semana', () => {
  const h = renderSemana({ ...BASE, doc: null });
  assert.match(h, /data-acao="gerar"/);
  assert.match(h, /Gerar Matriz Semanal/);
  assert.match(h, /min="2026-10-12" max="2026-10-17"/);
  assert.doesNotMatch(h, /data-acao="publicar"/);
});

test('rascunho: grade dos 6 dias, H1/H2/H3 e metabólicos', () => {
  const h = renderSemana({ ...BASE, doc: W42 });
  for (const dia of ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']) assert.ok(h.includes(dia), dia);
  assert.ok(h.includes('H1 · Força Base — Agachar/Empurrar (catch-up)'), 'terça é o catch-up do H1');
  assert.ok(h.includes('H2 · Força Base — Cadeia Posterior/Puxar'));
  assert.ok(h.includes('H3 · Consolidação Full Body'));
  for (const m of ['Cross', 'Hyrox', 'HIIT']) assert.ok(h.includes(`<h4>${m} <span`), m);
  assert.equal((h.match(/class="exercicio[ "]/g) || []).length, 5 * 6, '5 dias com força × 6 exercícios');
  assert.ok(h.includes('120 s') && h.includes('45 s'), 'descansos por exercício');
  assert.match(h, /data-acao="publicar" type="button">/, 'publicar habilitado sem problemas');
  assert.match(h, /data-acao="sortear"/);
  assert.ok(h.includes('O que o gerador decidiu') && h.includes('Trocas pela trava de equipamento'));
});

test('alerta de inventário: banner claro e exercícios marcados no dia', () => {
  const doc = {
    ...W42,
    alertas: [{ dia: 'segunda', recurso: 'smith', usado: 2, limite: 1 }],
    problemasParaPublicar: ['segunda: 2 estações de smith, e o box tem 1 ativa(s).'],
    dias: { ...W42.dias, segunda: { ...W42.dias.segunda, consumoEquipamentos: { ...W42.dias.segunda.consumoEquipamentos, smith: 2 } } },
  };
  const h = renderSemana({ ...BASE, doc });
  assert.match(h, /role="alert"/);
  assert.ok(h.includes('Limite de Smiths atingido na segunda: 2 em uso, 1 ativo.'));
  assert.match(h, /data-acao="publicar" type="button" disabled/, 'publicar travado');
  assert.ok(h.includes('segunda: 2 estações de smith'), 'o motivo do servidor aparece');
  assert.ok(h.includes('consumo-chip estourou'), 'o chip do dia fica vermelho');
  assert.ok(h.includes('dia-estourado'));
  const marcados = (h.match(/exercicio em-alerta/g) || []).length;
  const comSmith = W42.dias.segunda.blocoPrincipal.filter((e) => e.recursos.includes('smith')).length;
  assert.equal(marcados, comSmith, 'só os exercícios de smith da segunda');
});

test('publicada: só volta para rascunho', () => {
  const h = renderSemana({ ...BASE, doc: { ...W42, status: 'publicado' } });
  assert.match(h, /data-acao="despublicar"/);
  assert.doesNotMatch(h, /data-acao="(publicar|sortear|gerar)"/);
  assert.match(h, /selo-publicado/);
});

test('ocupado: botões desabilitados enquanto o servidor responde', () => {
  assert.match(renderSemana({ ...BASE, doc: null, ocupado: true }), /data-acao="gerar" type="button" disabled/);
  assert.match(renderSemana({ ...BASE, doc: W42, ocupado: true }), /data-acao="publicar" type="button" disabled/);
});

test('lista do mês: estado e alertas de cada semana', () => {
  const semanas = [{ chave: '2026-W41', rotulo: '05/10 a 11/10' }, BASE];
  const h = renderLista(semanas, { '2026-W41': null, '2026-W42': { ...W42, alertas: [{}, {}] } }, '2026-W42');
  assert.match(h, /data-semana="2026-W41"[\s\S]*Não gerada/);
  assert.match(h, /semana-card ativa" data-semana="2026-W42"/);
  assert.ok(h.includes('⚠ 2 alertas'));
});

test('dado do Firestore é escapado', () => {
  assert.equal(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  const doc = structuredClone(W42);
  doc.dias.segunda.blocoPrincipal[0].nome = '<img src=x onerror=alert(1)>';
  const h = renderSemana({ ...BASE, doc });
  assert.ok(!h.includes('<img src=x'), 'nome de exercício não vira HTML');
});
