// @ts-check
/** Rodar: node --test coach/calendario/render.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, nomesCurtos, avatar, chipDoDia, tempoDesde } from './render-comum.js';
import { htmlSemana } from './render-semana.js';
import { htmlTurma } from './render-turma.js';

const p = (/** @type {string} */ id, /** @type {string} */ nome, o = {}) => ({ aluno: { id, nome }, tipo: 'titular', chave: '2026-11-02', status: 'confirmado', pendente: null, ...o });
const turma = (/** @type {string} */ data, /** @type {string} */ hora, /** @type {any} */ d) => ({ data, hora, tipo: 'turma', titulo: '', camada: 'turmas',
  dados: { hora, capacidade: 6, vem: [], naoVem: [], naGrade: true, lotada: false, pendentes: 0, ...d } });
const dia = (/** @type {string} */ iso, /** @type {number} */ dow, o = {}) => ({ iso, dow, rotulo: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow], numero: iso.slice(8), hoje: false, fechado: false, total: 0, temTurma: false, doDia: [], porHora: {}, grade: ['06:00'], ...o });

test('comum: escape, nomes curtos, avatar e tempo', () => {
  assert.equal(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  assert.deepEqual(nomesCurtos(['Ana Lima', 'Ana Souza', 'Bia']), ['Ana L.', 'Ana S.', 'Bia']);
  assert.match(avatar({ nome: 'Bruno Reis' }), /<span class="av">BR<\/span>/);
  assert.match(avatar({ nome: 'X', fotoUrl: 'https://f.com/a.webp' }), /<img class="av" src="https:\/\/f.com\/a.webp"/);
  assert.doesNotMatch(avatar({ nome: 'X', fotoUrl: 'javascript:alert(1)' }), /<img/);
  assert.equal(tempoDesde(30_000), 'agora');
  assert.equal(tempoDesde(20 * 60_000), 'há 20 min');
  assert.equal(tempoDesde(3 * 3_600_000), 'há 3 h');
  assert.match(chipDoDia({ data: '2026-12-25', tipo: 'feriado', titulo: 'Natal', dados: { nome: 'Natal', decisao: 'fechado' } }), /data-acao="feriado" data-iso="2026-12-25"[^]*não abriu/);
});

test('semana: contagem, nomes, reposição, bolinha, lotada, tracejado e fechado', () => {
  const seg = dia('2026-11-02', 1, { hoje: true, temTurma: true, total: 3, porHora: {
    '06:00': [turma('2026-11-02', '06:00', { vem: [p('A', 'Ana'), p('D', 'Davi Reis', { tipo: 'reposicao', pendente: { tipo: 'reserva', chave: 'x', em: 1 } })], pendentes: 1 })],
    '18:10': [turma('2026-11-02', '18:10', { vem: [p('M', 'Marta')], capacidade: 1, lotada: true })],
  }, doDia: [{ data: '2026-11-02', tipo: 'aniversario', titulo: 'Ana · 34', camada: 'aniversarios' }] });
  const ter = dia('2026-11-03', 2, { fechado: true });
  const qua = dia('2026-11-04', 3, { grade: [] });
  const html = htmlSemana(/** @type {any} */ ({ visao: 'semana', dias: [seg, ter, qua], horas: [{ hora: '06:00', foraDaGrade: false }, { hora: '18:10', foraDaGrade: false }], hoje: '2026-11-02', agora: '08:40' }), { aberta: { iso: '2026-11-02', hora: '06:00' } });
  assert.match(html, /data-acao="turma" data-iso="2026-11-02" data-hora="06:00"/);
  assert.match(html, /<span class="cnt">2<small>\/6<\/small><\/span>/);
  assert.match(html, /Ana, <span class="rep">\+Davi<\/span>/);
  assert.match(html, /class="pend"/);
  assert.match(html, /class="cel cheia/);
  assert.match(html, /class="cel sel/);
  assert.match(html, /class="cel fech"/);
  assert.match(html, /class="cel nada"/);
  assert.match(html, /🎂 Ana · 34/);
  assert.match(html, /cal-dh hoje/);
  assert.match(html, /box fechado/);
  assert.match(html, /class="cal-agora"[^]*agora 08:40/);
});

test('semana: nome com HTML é escapado', () => {
  const seg = dia('2026-11-02', 1, { porHora: { '06:00': [turma('2026-11-02', '06:00', { vem: [p('X', '<img src=x>')] })] } });
  const html = htmlSemana(/** @type {any} */ ({ visao: 'semana', dias: [seg], horas: [{ hora: '06:00', foraDaGrade: false }], hoje: '2026-11-09', agora: '08:00' }), { aberta: null });
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img/);
});

test('painel da turma: vêm, pedido do app, não vêm e o atalho para o Painel de Presença', () => {
  const seg = dia('2026-11-02', 1);
  const item = turma('2026-11-02', '06:00', {
    vem: [p('A', 'Ana'), p('I', 'Ivan', { tipo: 'reposicao', pendente: { tipo: 'reserva', chave: 'o', em: 1_000 } })],
    naoVem: [p('F', 'Fábio', { status: 'desmarcou-no-prazo', pendente: { tipo: 'aviso', chave: '2026-11-02', em: 2_000 } })], pendentes: 2,
  });
  const html = htmlTurma(/** @type {any} */ (seg), item, { agoraMs: 1_000 + 20 * 60_000, voltarDia: false });
  assert.match(html, /SEG 02\/11 · 06:00/);
  assert.match(html, /2 de 6 vagas/);
  assert.match(html, /Vêm \(2\)[^]*Ana[^]*fixo[^]*Ivan[^]*reposição/);
  assert.match(html, /Pedido pelo app[^]*Ivan marcou esta reposição[^]*há 20 min/);
  assert.match(html, /Fábio avisou &quot;Não irei&quot;/);
  assert.match(html, /Não vêm \(1\)[^]*Fábio[^]*Desmarcou no prazo/);
  assert.match(html, /href="\.\.\/gestao-de-alunos\/index\.html#turmas\?dia=2026-11-02&amp;hora=06%3A00"/);
});
