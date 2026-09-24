// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/eventos.test.js
 *
 * Cobre a parte PURA do log de eventos: o que vira evento quando a caixa do
 * aluno é aplicada e quais campos contam como "ficha editada". A parte que fala
 * com o Firestore e com o localStorage não entra aqui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { camposAlterados, eventosDaCaixa, novoEvento, origemDaCaixa } from './eventos.js';

const aluno = { id: '012', nome: 'Fulano de Tal', presencas: ['2026-09-20'], feedbacks: [{ id: 'fb-velho', criadoEm: 1 }] };

/* ---------- novoEvento ---------- */

test('novoEvento copia o nome do aluno e descarta campo vazio', () => {
  const ev = novoEvento({ tipo: 'presenca', origem: 'gestao', aluno, em: 1000, dia: '2026-09-24', resumo: 'Check-in', id: 'x' });
  assert.deepEqual(ev, { id: 'x', tipo: 'presenca', origem: 'gestao', alunoId: '012', alunoNome: 'Fulano de Tal', em: 1000, dia: '2026-09-24', resumo: 'Check-in' });
});

test('novoEvento sem id gera um id que começa pelo instante', () => {
  const ev = novoEvento({ tipo: 'presenca', origem: 'gestao', aluno, em: 1234, resumo: 'Check-in' });
  assert.match(ev.id, /^1234-[a-z0-9]+$/);
});

/* ---------- origemDaCaixa ---------- */

test('origem da caixa só aceita app ou portal; o resto é "aluno"', () => {
  assert.equal(origemDaCaixa('app'), 'app');
  assert.equal(origemDaCaixa('portal'), 'portal');
  assert.equal(origemDaCaixa(undefined), 'aluno');
  assert.equal(origemDaCaixa('gestao'), 'aluno', 'o aparelho do aluno não se passa pelo coach');
  assert.equal(origemDaCaixa('<script>'), 'aluno');
});

/* ---------- eventosDaCaixa ---------- */

test('foto aplicada vira evento com a origem e a hora que vieram na caixa', () => {
  const evs = eventosDaCaixa(aluno, { fotoNova: 'u', fotoOrigem: 'app', fotoEm: 5000, atualizadoEm: 6000 }, { fotoUrl: 'u' }, 9000);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].tipo, 'foto-perfil');
  assert.equal(evs[0].origem, 'app');
  assert.equal(evs[0].em, 5000);
  assert.equal(evs[0].id, 'foto-012-5000');
});

test('foto de caixa antiga (sem origem nem fotoEm) usa atualizadoEm e origem "aluno"', () => {
  const [ev] = eventosDaCaixa(aluno, { fotoNova: 'u', atualizadoEm: 6000 }, { fotoUrl: 'u' }, 9000);
  assert.equal(ev.origem, 'aluno');
  assert.equal(ev.em, 6000);
});

test('só vira evento o feedback NOVO, com a origem gravada nele', () => {
  const inbox = { feedbacks: [{ id: 'fb-velho', criadoEm: 1 }, { id: 'fb-novo', data: '2026-09-23', esforco: 7, dor: 'leve', obs: 'pesado', criadoEm: 7000, origem: 'portal' }] };
  const patch = { feedbacks: [{ id: 'fb-novo', criadoEm: 7000 }, { id: 'fb-velho', criadoEm: 1 }] };
  const evs = eventosDaCaixa(aluno, inbox, patch, 9000);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, 'feedback-012-fb-novo');
  assert.equal(evs[0].origem, 'portal');
  assert.equal(evs[0].em, 7000);
  assert.equal(evs[0].dia, '2026-09-23');
  assert.match(evs[0].resumo, /7\/10/);
  assert.match(evs[0].resumo, /dor leve/i);
  assert.equal(evs[0].detalhe, 'pesado');
});

test('só vira evento o dia de presença que a ficha ainda não tinha, e a origem é o app', () => {
  const inbox = { presencas: ['2026-09-20', '2026-09-24'], atualizadoEm: 8000 };
  const patch = { presencas: ['2026-09-20', '2026-09-24'] };
  const evs = eventosDaCaixa(aluno, inbox, patch, 9000);
  assert.deepEqual(evs.map((e) => [e.id, e.origem, e.dia, e.em]), [['presenca-app-012-2026-09-24', 'app', '2026-09-24', 8000]]);
});

test('sem patch nada vira evento (a caixa não trouxe novidade)', () => {
  assert.deepEqual(eventosDaCaixa(aluno, { fotoNova: 'u', presencas: ['2026-09-20'] }, {}, 9000), []);
});

test('o mesmo merge rodado duas vezes produz os mesmos ids (regrava, não duplica)', () => {
  const inbox = { fotoNova: 'u', fotoEm: 5000, presencas: ['2026-09-24'], atualizadoEm: 8000 };
  const patch = { fotoUrl: 'u', presencas: ['2026-09-20', '2026-09-24'] };
  const a = eventosDaCaixa(aluno, inbox, patch, 9000).map((e) => e.id);
  const b = eventosDaCaixa(aluno, inbox, patch, 99999).map((e) => e.id);
  assert.deepEqual(a, b);
});

test('obs do feedback longa é cortada no detalhe', () => {
  const obs = 'x'.repeat(300);
  const [ev] = eventosDaCaixa(aluno, { feedbacks: [{ id: 'n', obs, criadoEm: 1 }] }, { feedbacks: [{ id: 'n' }] }, 9);
  assert.ok(ev.detalhe.length <= 121);
});

/* ---------- camposAlterados ---------- */

test('lista só os campos que mudaram, em ordem', () => {
  const antes = { nome: 'A', telefone: '1', plano: 'x' };
  const depois = { nome: 'A', telefone: '2', plano: 'y' };
  assert.deepEqual(camposAlterados(antes, depois), ['plano', 'telefone']);
});

test('vazio e ausente são a mesma coisa (o formulário devolve "" para campo nunca preenchido)', () => {
  assert.deepEqual(camposAlterados({ nome: 'A' }, { nome: 'A', obs: '', foco: [], horarios: {}, parceria: null }), []);
});

test('caixa desmarcada (false) é igual a campo ausente; marcar ou desmarcar de verdade conta', () => {
  assert.deepEqual(camposAlterados({ nome: 'A' }, { nome: 'A', appLiberado: false }), []);
  assert.deepEqual(camposAlterados({ appLiberado: true }, { appLiberado: false }), ['appLiberado']);
  assert.deepEqual(camposAlterados({}, { appLiberado: true }), ['appLiberado']);
});

test('compara lista e objeto pelo conteúdo', () => {
  assert.deepEqual(camposAlterados({ diasTreino: ['seg'] }, { diasTreino: ['seg'] }), []);
  assert.deepEqual(camposAlterados({ diasTreino: ['seg'] }, { diasTreino: ['seg', 'qua'] }), ['diasTreino']);
});

test('idade não conta: é derivada do nascimento e muda sozinha no aniversário', () => {
  assert.deepEqual(camposAlterados({ idade: '30' }, { idade: '31' }), []);
});

test('entrada malformada não quebra', () => {
  assert.deepEqual(camposAlterados(null, { nome: 'A' }), ['nome']);
  assert.deepEqual(camposAlterados({ nome: 'A' }, null), []);
});
