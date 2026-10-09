// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-lista.test.js
 *
 * A lista de alunos: a situação da reavaliação (que vira o anel da foto), o
 * filtro e a ordem, e o HTML do card — com o escape, porque nome e objetivo
 * são texto digitado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusAvaliacao, reavaliacaoNaLista, ehInativo, filtrarOrdenar, htmlAluno, htmlLista, htmlResumo, seloReavaliacao } from './ui-lista.js?v=12';

const HOJE = '2026-10-07';
const aval = (realizada, proxima) => ({ num: 1, dataRealizada: realizada, dataProxima: proxima });

const ana = { id: '001', nome: 'Ana Lima', objetivo: 'Hipertrofia', email: 'Ana@Box.com', avaliacoes: [aval('2026-07-01', '2026-10-01')] }; // atrasada 6d
const bia = { id: '002', nome: 'Bia', avaliacoes: [aval('2026-07-10', '2026-10-10')] }; // a vencer 3d
const caio = { id: '003', nome: 'Caio', status: 'inativo', avaliacoes: [aval('2026-09-01', '2026-12-01')] }; // em dia
const duda = { id: 'Duda1203', nome: 'Duda', status: 'pendente' }; // sem avaliação

test('reavaliação: atrasada, a vencer (até 7 dias), em dia e sem avaliação', () => {
  assert.deepEqual(statusAvaliacao(ana, HOJE), { tipo: 'atrasada', dias: 6 });
  assert.deepEqual(statusAvaliacao(bia, HOJE), { tipo: 'avencer', dias: 3 });
  assert.equal(statusAvaliacao(caio, HOJE).tipo, 'emdia');
  assert.deepEqual(statusAvaliacao(duda, HOJE), { tipo: 'sem' });
  assert.deepEqual(statusAvaliacao({ avaliacoes: [aval('2026-07-01', HOJE)] }, HOJE), { tipo: 'avencer', dias: 0 });
});

test('reavaliação: vale a avaliação feita por último, e a não realizada não conta', () => {
  const a = { avaliacoes: [aval('2026-01-01', '2026-04-01'), aval('2026-09-01', '2026-12-01'), { num: 3, dataProxima: '2026-01-01' }] };
  assert.equal(statusAvaliacao(a, HOJE).tipo, 'emdia');
});

test('ordem: atrasadas no topo, depois a vencer, o resto na ordem que veio, inativos no fim', () => {
  const r = filtrarOrdenar([caio, duda, bia, ana], { hojeIso: HOJE });
  assert.deepEqual(r.alunos.map((a) => a.id), ['001', '002', 'Duda1203', '003']);
  assert.equal(r.nAtr, 1);
  assert.equal(r.nVenc, 1);
});

test('busca por nome ou ID, sem diferenciar maiúscula; o resumo conta o box inteiro', () => {
  const r = filtrarOrdenar([ana, bia, caio, duda], { busca: 'duda1203', hojeIso: HOJE });
  assert.deepEqual(r.alunos.map((a) => a.id), ['Duda1203']);
  assert.equal(r.nAtr, 1, 'a busca não muda o resumo');
  assert.deepEqual(filtrarOrdenar([ana, bia], { busca: '  LIMA ', hojeIso: HOJE }).alunos.map((a) => a.id), ['001']);
});

test('filtro por reavaliação', () => {
  assert.deepEqual(filtrarOrdenar([ana, bia, caio], { filtroStatus: 'avencer', hojeIso: HOJE }).alunos.map((a) => a.id), ['002']);
});

test('card: anel e selo da reavaliação, objetivo e ID', () => {
  const h = htmlAluno(ana, { hojeIso: HOJE });
  assert.match(h, /class="aluno-card st-ativo reav-atrasada"/);
  assert.match(h, /data-id="001"/);
  assert.match(h, /Reavaliação atrasada · 6 dias/);
  assert.match(h, /Hipertrofia <span class="ac-id">#001<\/span>/);
  assert.match(htmlAluno(bia, { hojeIso: HOJE }), /Reavaliar em 3 dias/);
  assert.match(seloReavaliacao({ tipo: 'atrasada', dias: 1 }), /1 dia</);
  assert.match(seloReavaliacao({ tipo: 'avencer', dias: 0 }), /Reavaliar hoje/);
});

test('card: "Ativo" não ganha selo; inativo e pendente ganham', () => {
  assert.doesNotMatch(htmlAluno(ana, { hojeIso: HOJE }), /ac-chip-ativo/);
  assert.match(htmlAluno(caio, { hojeIso: HOJE }), /class="aluno-card st-inativo reav-inativo"/);
  assert.match(htmlAluno(caio, { hojeIso: HOJE }), /<span class="ac-chip ac-chip-inativo">Inativo<\/span>/);
  assert.match(htmlAluno(duda, { hojeIso: HOJE }), /<span class="ac-chip ac-chip-pendente">Pendente<\/span>/);
});

test('card: foto quando tem, iniciais quando não tem', () => {
  assert.match(htmlAluno({ ...bia, fotoUrl: 'https://x/a.webp' }, { hojeIso: HOJE }), /<img src="https:\/\/x\/a\.webp" alt="" loading="lazy" \/>/);
  assert.match(htmlAluno(ana, { hojeIso: HOJE }), /<span class="ac-ini">AL<\/span>/);
});

test('card: kcal da semana e medalhas só quando existem', () => {
  const h = htmlAluno(ana, { kcal: 1240, medalhas: 4, hojeIso: HOJE });
  assert.match(h, /🔥 1\.240 kcal/);
  assert.match(h, /🏅 4/);
  const sem = htmlAluno(bia, { hojeIso: HOJE });
  assert.doesNotMatch(sem, /kcal|🏅/);
  assert.doesNotMatch(htmlAluno({ id: '9', nome: 'X' }, { hojeIso: HOJE }), /ac-chips/, 'sem selo nenhum, sem a linha de selos');
});

test('card: nome, objetivo e ID digitados são escapados', () => {
  const h = htmlAluno({ id: '"><script>', nome: '<b>Zé</b>', objetivo: 'a & b' }, { hojeIso: HOJE });
  assert.doesNotMatch(h, /<script>|<b>Zé/);
  assert.match(h, /&lt;b&gt;Zé&lt;\/b&gt;/);
  assert.match(h, /data-id="&quot;&gt;&lt;script&gt;"/);
  assert.match(h, /a &amp; b/);
});

test('lista: kcal pelo e-mail normalizado, medalhas pelo ID; vazio com orientação', () => {
  const h = htmlLista([ana], 1, { kcalPorEmail: new Map([['ana@box.com', 500]]), medalhasPorId: new Map([['001', 2]]), hojeIso: HOJE });
  assert.match(h, /🔥 500 kcal/);
  assert.match(h, /🏅 2/);
  assert.match(htmlLista([], 0), /Nenhum aluno cadastrado/);
  assert.match(htmlLista([], 5), /Nenhum aluno encontrado/);
});

test('resumo: chips só quando há atrasada ou a vencer, com o filtro marcado', () => {
  assert.equal(htmlResumo(0, 0, 'todos'), '');
  const h = htmlResumo(2, 1, 'atrasada');
  assert.match(h, /data-f="atrasada" type="button" aria-pressed="true">2 atrasadas/);
  assert.match(h, /1 a vencer/);
  assert.match(h, /data-f="todos" type="button" aria-pressed="false">Todos/);
});

/* ---------- Inativos ---------- */

const joao = { id: '004', nome: 'João', status: 'inativo', avaliacoes: [aval('2026-01-01', '2026-03-01')] }; // vencida há meses
const lia = { id: '005', nome: 'Lia', status: 'Inativo', avaliacoes: [aval('2026-07-01', '2026-10-09')] }; // "a vencer", maiúscula

test('inativo: a reavaliação vencida não aparece na lista (a data continua na ficha)', () => {
  assert.ok(ehInativo(joao) && ehInativo(lia) && !ehInativo(duda) && !ehInativo(ana));
  assert.deepEqual(reavaliacaoNaLista(joao, HOJE), { tipo: 'inativo' });
  assert.equal(statusAvaliacao(joao, HOJE).tipo, 'atrasada', 'a regra da ficha não mudou');
  assert.equal(reavaliacaoNaLista(duda, HOJE).tipo, 'sem', 'pendente não é inativo');
});

test('inativo: não conta nos contadores nem aparece no filtro de atrasadas / a vencer', () => {
  const r = filtrarOrdenar([joao, lia, ana, bia], { hojeIso: HOJE });
  assert.equal(r.nAtr, 1, 'só a Ana');
  assert.equal(r.nVenc, 1, 'só a Bia');
  assert.deepEqual(filtrarOrdenar([joao, ana], { filtroStatus: 'atrasada', hojeIso: HOJE }).alunos.map((a) => a.id), ['001']);
  assert.deepEqual(filtrarOrdenar([lia, bia], { filtroStatus: 'avencer', hojeIso: HOJE }).alunos.map((a) => a.id), ['002']);
});

test('inativo: vai para o fim da lista, depois de todos os ativos e pendentes', () => {
  const r = filtrarOrdenar([joao, caio, lia, duda, bia, ana], { hojeIso: HOJE });
  // ativos/pendentes por pendência; inativos no fim, na ordem em que vieram
  assert.deepEqual(r.alunos.map((a) => a.id), ['001', '002', 'Duda1203', '004', '003', '005']);
  assert.deepEqual(filtrarOrdenar([joao, ana], { busca: 'jo', hojeIso: HOJE }).alunos.map((a) => a.id), ['004'], 'a busca ainda acha o inativo');
});

test('inativo: sem anel e sem selo de reavaliação — só o selo "Inativo"', () => {
  const h = htmlAluno(joao, { hojeIso: HOJE });
  assert.match(h, /class="aluno-card st-inativo reav-inativo"/);
  assert.doesNotMatch(h, /reav-atrasada|Reavaliação atrasada|Reavaliar/);
  assert.match(h, /<span class="ac-chip ac-chip-inativo">Inativo<\/span>/);
  assert.doesNotMatch(htmlAluno(lia, { hojeIso: HOJE }), /Reavaliar/);
});
