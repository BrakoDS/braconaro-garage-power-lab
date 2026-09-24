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
  agruparPorDia, anexarFotosDoDiario, filtrarEventos, fotosDoDiarioPorDia, historicoDasFichas, juntarEventos,
  linhaDoTempoDoAluno, linhaHTML, rotuloDia,
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

/* ---------- linhaDoTempoDoAluno ---------- */

test('a linha do tempo traz só os eventos do aluno aberto', () => {
  const gravados = [
    { id: 'g1', tipo: 'presenca', origem: 'app', alunoId: '012', em: local('2026-09-23', 7, 12), chave: 'presenca:012:2026-09-23' },
    { id: 'g2', tipo: 'presenca', origem: 'app', alunoId: '099', em: local('2026-09-24', 8) },
  ];
  const { reais } = linhaDoTempoDoAluno(gravados, ficha);
  assert.deepEqual(reais.map((e) => e.id), ['g1']);
});

test('o histórico da ficha começa antes do primeiro evento DESTE aluno, não de outro', () => {
  const gravados = [
    // O evento de outro aluno é mais antigo que tudo; não pode esconder o histórico do 012.
    { id: 'outro', tipo: 'presenca', origem: 'app', alunoId: '099', em: local('2025-01-01', 8) },
    { id: 'g1', tipo: 'presenca', origem: 'app', alunoId: '012', em: local('2026-09-23', 7, 12), chave: 'presenca:012:2026-09-23' },
  ];
  const { hist } = linhaDoTempoDoAluno(gravados, ficha);
  assert.deepEqual(hist.map((e) => e.tipo), ['feedback', 'presenca', 'atestado', 'avaliacao', 'aluno-criado']);
  assert.ok(hist.every((e) => e.alunoId === '012' && e.em < local('2026-09-23', 7, 12)));
});

test('sem evento gravado, a linha do tempo é a ficha inteira', () => {
  const { reais, hist } = linhaDoTempoDoAluno([], ficha);
  assert.deepEqual(reais, []);
  assert.equal(hist.length, 6);
});

test('os filtros valem para os gravados e para o histórico', () => {
  const gravados = [{ id: 'g1', tipo: 'foto-perfil', origem: 'portal', alunoId: '012', em: local('2026-09-24', 9) }];
  const { reais, hist } = linhaDoTempoDoAluno(gravados, ficha, { categoria: 'presenca', origem: 'todas' });
  assert.deepEqual(reais, []);
  assert.ok(hist.length > 0 && hist.every((e) => e.tipo === 'presenca' || e.tipo === 'atestado'));
});

test('sem ficha aberta, nada', () => {
  assert.deepEqual(linhaDoTempoDoAluno([{ id: 'x', alunoId: '1', em: 1 }], null), { reais: [], hist: [] });
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
  const ev = { id: '1', tipo: 'feedback', origem: 'app', alunoId: 'a', alunoNome: 'X', em: local('2026-09-24', 8, 5), resumo: '<b>Feedback</b>', detalhe: '<img src=x onerror=alert(1)>' };
  const html = linhaHTML(ev);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;b&gt;Feedback'));
  assert.ok(html.includes('08:05'));
  assert.ok(html.includes('App'));
});

test('dentro da ficha a linha não repete o aluno nem é clicável', () => {
  const ev = { id: '1', tipo: 'presenca', origem: 'gestao', alunoId: 'a', alunoNome: 'Fulano', em: 1, resumo: 'Check-in' };
  const html = linhaHTML(ev);
  assert.ok(!html.includes('Fulano'));
  assert.ok(!html.includes('<button'));
  assert.ok(!html.includes('data-id'));
});

test('evento reconstruído sem hora mostra traço e não mostra selo de origem', () => {
  const ev = { id: 'd', tipo: 'presenca', origem: null, alunoId: 'a', alunoNome: 'X', em: 1, semHora: true, derivado: true, resumo: 'Presença' };
  const html = linhaHTML(ev);
  assert.ok(html.includes('—'));
  assert.ok(!html.includes('reg-origem'));
});

/* ---------- Diário de Evolução: a foto na linha ---------- */

const URL_BASE = 'https://firebasestorage.googleapis.com/v0/b/projeto-garage-f0a2f.firebasestorage.app/o/diario%2Ffulano%40x.com%2F';
const docDiario = (dia, em, extra = {}) => ({
  id: dia, dia, em,
  url: `${URL_BASE}${dia}.webp?alt=media&token=t`,
  miniUrl: `${URL_BASE}${dia}_mini.webp?alt=media&token=t`,
  ...extra,
});
const evDiario = (dia, em) => ({ id: `diario-012-${dia}-${em}`, tipo: 'foto-diario', origem: 'app', alunoId: '012', em, dia, resumo: 'Foto do Diário de Evolução' });

test('fotos do diário: indexa pelo dia e descarta documento incoerente ou com URL de fora', () => {
  const porDia = fotosDoDiarioPorDia([
    docDiario('2026-09-24', 1000),
    docDiario('2026-09-23', 900, { dia: '2026-09-22' }),        // dia ≠ id
    docDiario('2026-09-21', 0),                                   // sem em
    docDiario('2026-09-20', 800, { url: 'https://evil.example/x.webp' }),
    docDiario('2026-09-19', 700, { miniUrl: 'javascript:alert(1)' }),
    null,
  ]);
  assert.deepEqual([...porDia.keys()], ['2026-09-24']);
  assert.equal(porDia.get('2026-09-24').em, 1000);
  assert.equal(fotosDoDiarioPorDia(null), null);
});

test('evento do diário ganha a foto quando dia e em batem com o documento', () => {
  const porDia = fotosDoDiarioPorDia([docDiario('2026-09-24', 1000)]);
  const [ev] = anexarFotosDoDiario([evDiario('2026-09-24', 1000)], porDia);
  assert.ok(ev.foto.url.includes('2026-09-24.webp'));
  assert.ok(ev.foto.mini.includes('2026-09-24_mini.webp'));
});

test('foto refeita: a linha do envio antigo não mostra a foto nova', () => {
  const porDia = fotosDoDiarioPorDia([docDiario('2026-09-24', 2000)]);
  const [antiga, nova] = anexarFotosDoDiario([evDiario('2026-09-24', 1000), evDiario('2026-09-24', 2000)], porDia);
  assert.equal(antiga.foto, undefined);
  assert.equal(antiga.fotoEstado, 'refeita');
  assert.ok(nova.foto);
});

test('foto apagada pelo aluno some da linha; sem leitura (null), nada muda', () => {
  const [apagada] = anexarFotosDoDiario([evDiario('2026-09-24', 1000)], new Map());
  assert.equal(apagada.foto, undefined);
  assert.equal(apagada.fotoEstado, 'apagada');
  const ev = evDiario('2026-09-24', 1000);
  assert.deepEqual(anexarFotosDoDiario([ev], null), [ev]);
});

test('só o foto-diario é tocado', () => {
  const outro = { id: 'x', tipo: 'foto-perfil', dia: '2026-09-24', em: 1 };
  assert.equal(anexarFotosDoDiario([outro], new Map())[0], outro);
});

test('linha com foto mostra a miniatura clicável que abre a foto cheia', () => {
  const porDia = fotosDoDiarioPorDia([docDiario('2026-09-24', 1000)]);
  const [ev] = anexarFotosDoDiario([evDiario('2026-09-24', 1000)], porDia);
  const html = linhaHTML(ev);
  assert.ok(html.includes('reg-row--foto'));
  assert.ok(html.includes('class="reg-thumb"'));
  assert.ok(html.includes(`data-foto="${URL_BASE}2026-09-24.webp?alt=media&amp;token=t"`));
  assert.ok(html.includes('2026-09-24_mini.webp'));
});

test('linha de foto apagada ou refeita diz o porquê, sem miniatura', () => {
  const apagada = linhaHTML({ ...evDiario('2026-09-24', 1), fotoEstado: 'apagada' });
  assert.ok(!apagada.includes('reg-thumb') && apagada.includes('apagou'));
  const refeita = linhaHTML({ ...evDiario('2026-09-24', 1), fotoEstado: 'refeita' });
  assert.ok(!refeita.includes('reg-thumb') && refeita.includes('refeita'));
});
