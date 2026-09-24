// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/registros-ui.test.js
 *
 * A tela Registros sem DOM e sem Firebase: o histórico reconstruído das fichas,
 * a junção com os eventos gravados, os filtros, o agrupamento por dia e a linha
 * em HTML (que carrega texto escrito pelo aluno — daí o teste de escape).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPorDia, filtrarEventos, historicoDasFichas, juntarEventos, linhaHTML, rotuloDia,
} from './registros-ui.js';

/** ms de um horário LOCAL — é assim que a tela lê as datas. */
const local = (iso, hh = 0, mm = 0) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, hh, mm).getTime();
};

const ficha = {
  id: '012', nome: 'Fulano', criadoEm: local('2026-01-10', 9),
  presencas: ['2026-09-22', '2026-09-23'],
  presencaHoras: { '2026-09-23': '07:12' },
  atestados: { '2026-09-19': { em: local('2026-09-18', 20), reposicao: null } },
  feedbacks: [{ id: 'f1', data: '2026-09-22', esforco: 8, dor: 'nenhuma', obs: '', criadoEm: local('2026-09-22', 21) }],
  avaliacoes: [{ num: 1, criadoEm: local('2026-02-01', 10) }],
};

/* ---------- historicoDasFichas ---------- */

test('reconstrói presenças, atestado, feedback, avaliação e cadastro, do mais novo ao mais antigo', () => {
  const evs = historicoDasFichas([ficha]);
  assert.deepEqual(evs.map((e) => e.tipo), ['presenca', 'feedback', 'presenca', 'atestado', 'avaliacao', 'aluno-criado']);
  assert.ok(evs.every((e) => e.derivado === true && e.alunoId === '012' && e.alunoNome === 'Fulano'));
});

test('presença com hora usa a hora; sem hora fica marcada semHora', () => {
  const evs = historicoDasFichas([ficha]).filter((e) => e.tipo === 'presenca');
  const com = evs.find((e) => e.dia === '2026-09-23');
  const sem = evs.find((e) => e.dia === '2026-09-22');
  assert.equal(com.em, local('2026-09-23', 7, 12));
  assert.ok(!com.semHora);
  assert.equal(sem.semHora, true);
});

test('o histórico não tem origem, a não ser o feedback que já veio com ela', () => {
  const comOrigem = { ...ficha, feedbacks: [{ ...ficha.feedbacks[0], origem: 'app' }] };
  const evs = historicoDasFichas([comOrigem]);
  assert.equal(evs.find((e) => e.tipo === 'feedback').origem, 'app');
  assert.equal(evs.find((e) => e.tipo === 'presenca').origem, null);
});

test('só entra o que é anterior ao primeiro evento gravado', () => {
  const evs = historicoDasFichas([ficha], { antesDe: local('2026-09-22', 0) });
  assert.ok(evs.every((e) => e.em < local('2026-09-22', 0)));
  assert.ok(!evs.some((e) => e.dia === '2026-09-23'));
});

test('fato que já tem evento gravado (mesma chave) não aparece duas vezes', () => {
  const evs = historicoDasFichas([ficha], { chaves: new Set(['presenca:012:2026-09-23', 'feedback:012:f1']) });
  assert.ok(!evs.some((e) => e.dia === '2026-09-23' && e.tipo === 'presenca'));
  assert.ok(!evs.some((e) => e.tipo === 'feedback'));
});

test('ficha malformada não quebra', () => {
  assert.deepEqual(historicoDasFichas([{ id: '1' }, null, { id: '2', presencas: 'x', feedbacks: {}, avaliacoes: [null] }]), []);
  assert.deepEqual(historicoDasFichas(undefined), []);
});

test('presença com data inválida é ignorada', () => {
  assert.deepEqual(historicoDasFichas([{ id: '1', presencas: ['ontem', '2026-13-45x'] }]), []);
});

/* ---------- juntarEventos ---------- */

test('junta listas sem repetir id, do mais novo ao mais antigo', () => {
  const a = [{ id: 'x', em: 1 }, { id: 'y', em: 3 }];
  const b = [{ id: 'y', em: 3 }, { id: 'z', em: 2 }];
  assert.deepEqual(juntarEventos(a, b).map((e) => e.id), ['y', 'z', 'x']);
});

/* ---------- filtrarEventos ---------- */

const evs = [
  { id: '1', tipo: 'presenca', origem: 'app', alunoId: 'a', em: 5 },
  { id: '2', tipo: 'atestado', origem: 'gestao', alunoId: 'b', em: 4 },
  { id: '3', tipo: 'foto-perfil', origem: 'portal', alunoId: 'a', em: 3 },
  { id: '4', tipo: 'feedback', origem: 'aluno', alunoId: 'a', em: 2 },
  { id: '5', tipo: 'ficha-editada', origem: 'gestao', alunoId: 'b', em: 1 },
];

test('filtro de categoria agrupa os tipos (atestado é Presença)', () => {
  assert.deepEqual(filtrarEventos(evs, { categoria: 'presenca' }).map((e) => e.id), ['1', '2']);
  assert.deepEqual(filtrarEventos(evs, { categoria: 'ficha' }).map((e) => e.id), ['5']);
});

test('filtro de origem e de aluno se combinam', () => {
  assert.deepEqual(filtrarEventos(evs, { origem: 'gestao', alunoId: 'b' }).map((e) => e.id), ['2', '5']);
  assert.deepEqual(filtrarEventos(evs, { origem: 'app', alunoId: 'b' }), []);
});

test('sem filtro devolve tudo', () => {
  assert.equal(filtrarEventos(evs, {}).length, 5);
});

/* ---------- agruparPorDia / rotuloDia ---------- */

test('agrupa pelo dia LOCAL do evento, mantendo a ordem', () => {
  const lista = [
    { id: 'a', em: local('2026-09-24', 23, 30) },
    { id: 'b', em: local('2026-09-24', 0, 10) },
    { id: 'c', em: local('2026-09-23', 22) },
  ];
  const grupos = agruparPorDia(lista, '2026-09-24');
  assert.deepEqual(grupos.map((g) => [g.dia, g.rotulo, g.itens.map((e) => e.id)]), [
    ['2026-09-24', 'Hoje', ['a', 'b']],
    ['2026-09-23', 'Ontem', ['c']],
  ]);
});

test('dia anterior a ontem leva o dia da semana e a data', () => {
  assert.equal(rotuloDia('2026-09-22', '2026-09-24'), 'Ter · 22/09/2026');
});

/* ---------- linhaHTML ---------- */

test('a linha escapa o que veio do aluno', () => {
  const ev = { id: '1', tipo: 'feedback', origem: 'app', alunoId: 'a', alunoNome: '<b>X</b>', em: local('2026-09-24', 8, 5), resumo: 'Feedback', detalhe: '<img src=x onerror=alert(1)>' };
  const html = linhaHTML(ev, null);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;b&gt;X'));
  assert.ok(html.includes('08:05'));
  assert.ok(html.includes('App'));
});

test('a linha usa o nome e a foto ATUAIS da ficha quando ela existe', () => {
  const ev = { id: '1', tipo: 'presenca', origem: 'gestao', alunoId: 'a', alunoNome: 'Velho', em: 1, resumo: 'Check-in' };
  const html = linhaHTML(ev, { id: 'a', nome: 'Novo', fotoUrl: 'https://x/y.webp' });
  assert.ok(html.includes('Novo'));
  assert.ok(html.includes('https://x/y.webp'));
  assert.ok(html.includes('data-id="a"'));
});

test('evento reconstruído sem hora mostra traço e não mostra selo de origem', () => {
  const ev = { id: 'd', tipo: 'presenca', origem: null, alunoId: 'a', alunoNome: 'X', em: 1, semHora: true, derivado: true, resumo: 'Presença' };
  const html = linhaHTML(ev, null);
  assert.ok(html.includes('—'));
  assert.ok(!html.includes('reg-origem'));
});
