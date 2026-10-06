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

test('trocar: botão em cada exercício do rascunho, por sessão e vaga', () => {
  const h = renderSemana({ ...BASE, doc: W42, hoje: '2026-10-12' });
  assert.equal((h.match(/data-trocar="/g) || []).length, 5 * 6, '5 dias com força × 6 vagas');
  assert.equal((h.match(/data-trocar="H1:1"/g) || []).length, 2, 'H1 vaga 1 aparece na segunda e na terça (mesma sessão)');
  assert.equal((renderSemana({ ...BASE, doc: W42 }).match(/data-trocar="/g) || []).length, 0, 'sem "hoje", só leitura');
  assert.equal((renderSemana({ ...BASE, doc: W42, hoje: '2026-10-12', ocupado: true }).match(/data-trocar="/g) || []).length, 0,
    'ocupado: sem troca');
});

test('trocar: semana publicada trava a sessão que já tem dia passado', () => {
  const h = renderSemana({ ...BASE, doc: { ...W42, status: 'publicado' }, hoje: '2026-10-13' });
  assert.doesNotMatch(h, /data-trocar="H1:/, 'H1 (segunda já passou) travado');
  assert.match(h, /data-trocar="H2:1"/, 'H2 (quarta) ainda dá');
  assert.equal((h.match(/data-trocar="/g) || []).length, 3 * 6, 'quarta, sexta e sábado');
});

test('avisos de edição gravados aparecem como nota', () => {
  const doc = { ...W42, avisosEdicao: [{ tipo: 'repeticao', exercicioId: 'x', nome: 'RDL Smith', lugares: [{ sessao: 'H1', posicao: 5 }, { sessao: 'H2', posicao: 1 }] }] };
  const h = renderSemana({ ...BASE, doc, hoje: '2026-10-12' });
  assert.ok(h.includes('Avisos da semana') && h.includes('RDL Smith está em H1 (vaga 5) e H2 (vaga 1).'));
  assert.ok(!renderSemana({ ...BASE, doc: W42, hoje: '2026-10-12' }).includes('Avisos da semana'));
});

/** A W43 com o HIIT, saída real do gerador do servidor — ver `core/fixtures/semana-hiit.json`. */
const HIIT = JSON.parse(readFileSync(new URL('../core/fixtures/semana-hiit.json', import.meta.url), 'utf8'));
const BASE_HIIT = { chave: '2026-W43', rotulo: '19/10 a 25/10', inicio: '2026-10-19' };
const fatia = (h, ini, fim) => h.slice(h.indexOf(ini), fim ? h.indexOf(fim, h.indexOf(ini)) : undefined);

test('HIIT: uma faixa só, abaixo da grade, com as 4 estações na ordem sorteada', () => {
  const h = renderSemana({ ...BASE_HIIT, doc: HIIT });
  assert.equal((h.match(/id="hiit-da-semana"/g) || []).length, 1, 'o HIIT aparece UMA vez');
  assert.ok(h.indexOf('id="hiit-da-semana"') > h.indexOf('class="grade-dias"'), 'abaixo da grade');
  assert.ok(h.includes('HIIT da semana <span class="mut">· sexta (alternativa) e sábado (principal)</span>'));
  assert.ok(h.includes('2 Músicas de Tabata (16 rounds no total). 4x cada exercício.'));
  assert.ok(h.includes('turma de 6, até 2 por estação'));
  const nomes = [...h.matchAll(/<article class="hiit-estacao">\s*<h4>([^<]+)<\/h4>/g)].map((m) => m[1]);
  assert.deepEqual(nomes, HIIT.dias.sabado.hiit.estacoes.map((e) => e.nome), 'na ordem gravada pelo servidor');
  assert.equal((h.match(/class="hiit-slot[ "]/g) || []).length, 16, '4 estações × 4 slots');
});

test('HIIT: unilateral em dois slots seguidos, D e E, ligados', () => {
  const h = renderSemana({ ...BASE_HIIT, doc: HIIT });
  const pernas = HIIT.dias.sabado.hiit.estacoes.find((e) => e.estacao === 'pernas');
  const iD = pernas.slots.findIndex((x) => x.lado === 'D');
  const nome = pernas.slots[iD].nome;
  const bloco = fatia(h, '<h4>Pernas</h4>', '</ol>');
  assert.ok(bloco.includes(`<li class="hiit-slot uni uni-d"><span class="hiit-n">${iD + 1}</span><span class="hiit-nome">${esc(nome)}</span><span class="hiit-lado" title="Lado direito">D</span>`));
  assert.ok(bloco.includes(`<li class="hiit-slot uni uni-e"><span class="hiit-n">${iD + 2}</span><span class="hiit-nome">${esc(nome)}</span><span class="hiit-lado" title="Lado esquerdo">E</span>`));
  assert.equal((fatia(h, '<h4>Cardio</h4>', '</ol>').match(/hiit-lado/g) || []).length, 0, 'bilateral não tem selo de lado');
});

test('HIIT: sexta e sábado chamam a faixa; os outros dias não', () => {
  const h = renderSemana({ ...BASE_HIIT, doc: HIIT });
  assert.equal((h.match(/data-ver-hiit/g) || []).length, 2, 'sexta e sábado');
  assert.ok(!h.includes('ver estações ↓ ·'), 'sem alerta, o botão não conta alerta');
  assert.ok(h.includes('Fora do sorteio do HIIT (equipamento)') && h.includes('Clean com sandbag: precisa de 2 Sandbags, o box tem 1 ativo.'));
  assert.ok(!h.includes('hiit-alerta'), 'sem alerta, sem caixa de alerta');
});

test('HIIT: alertas do servidor viram texto com nomes e slots marcados', () => {
  // O exercício com TRX do fixture (o gerador decide a estação), num alerta de slot.
  const est = HIIT.dias.sabado.hiit.estacoes.find((e) => e.slots.some((x) => x.consumoPorAluno.trx));
  const i = est.slots.findIndex((x) => x.consumoPorAluno.trx);
  const doc = {
    ...HIIT,
    alertasHiit: [{ recurso: 'trx', usado: 4, limite: 2, slot: i + 1, exercicios: [est.slots[i].exercicioId], dias: ['sexta', 'sabado'] }],
  };
  const h = renderSemana({ ...BASE_HIIT, doc });
  assert.match(h, /class="card hiit-semana hiit-estourado"/);
  assert.ok(h.includes(`Limite de TRX atingido no slot ${i + 1} do HIIT (sexta e sábado): 4 em uso, 2 ativos — ${esc(est.slots[i].nome)}.`));
  assert.ok(fatia(h, `<h4>${est.nome}</h4>`, '</ol>').includes(`<li class="hiit-slot em-alerta"><span class="hiit-n">${i + 1}</span>`));
  assert.equal((h.match(/ver estações ↓ · ⚠ 1 alerta/g) || []).length, 2, 'o botão de sexta e sábado avisa');
  assert.ok(renderLista([{ chave: '2026-W43', rotulo: '19/10' }], { '2026-W43': doc }, '').includes('⚠ 1 alerta'), 'a lista conta o alerta do HIIT');
});

test('HIIT: semana de antes do gerador fica como era; estação incompleta mostra o slot vazio', () => {
  const h = renderSemana({ ...BASE, doc: W42 });
  assert.ok(!h.includes('hiit-da-semana') && !h.includes('data-ver-hiit'), 'W42 (sem estações): sem faixa e sem botão');
  const incompleta = JSON.parse(JSON.stringify(HIIT));
  for (const d of ['sexta', 'sabado']) incompleta.dias[d].hiit.estacoes[0].slots.pop();
  const hi = renderSemana({ ...BASE_HIIT, doc: incompleta });
  assert.equal((hi.match(/hiit-slot vazio/g) || []).length, 1);
});

test('HIIT: nome vindo do catálogo é escapado', () => {
  const doc = JSON.parse(JSON.stringify(HIIT));
  doc.dias.sabado.hiit.estacoes[0].slots[0].nome = '<img src=x>';
  doc.dias.sexta.hiit.estacoes[0].slots[0].nome = '<img src=x>';
  assert.ok(!renderSemana({ ...BASE_HIIT, doc }).includes('<img src=x>'));
});
