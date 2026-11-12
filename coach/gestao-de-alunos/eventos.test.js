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
import { autorDoEvento, camposAlterados, eventosDaCaixa, eventosDoDiario, novoEvento, origemDaCaixa } from './eventos.js?v=40';

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

/* ---------- quem fez, quem pediu, quem aprovou, por quê (etapa 5) ---------- */

test('novoEvento leva autor, proposta, aprovação, situação e motivo — e só o que é válido', () => {
  const ev = novoEvento({
    tipo: 'mensagem-enviada', origem: 'gestao', aluno, em: 2000, resumo: 'WhatsApp · Recibo', id: 'm1',
    autor: { tipo: 'coach' }, proposta: { por: { tipo: 'rotina' }, em: 1500, via: 'recibo' },
    aprovacao: { por: { tipo: 'coach' }, em: 2000, decisao: 'aprovada' }, motivo: '  ',
  });
  assert.deepEqual(ev.autor, { tipo: 'coach' });
  assert.deepEqual(ev.proposta, { por: { tipo: 'rotina' }, em: 1500, via: 'recibo' });
  assert.deepEqual(ev.aprovacao, { por: { tipo: 'coach' }, em: 2000, decisao: 'aprovada' });
  assert.ok(!('motivo' in ev), 'motivo em branco não entra');
  assert.ok(!('situacao' in ev), 'executada é o padrão: não vai para o documento');
  const recusada = novoEvento({ tipo: 'mensagem-descartada', origem: 'gestao', aluno, em: 3000, resumo: 'x', situacao: 'recusada', motivo: ' Pix devolvido ' });
  assert.equal(recusada.situacao, 'recusada');
  assert.equal(recusada.motivo, 'Pix devolvido');
  const lixo = novoEvento({ tipo: 'x', origem: 'gestao', aluno, em: 1, resumo: 'x', autor: { tipo: 'hacker' }, proposta: { por: {} }, aprovacao: { por: { tipo: 'coach' }, em: 1, decisao: 'talvez' }, situacao: 'qualquer' });
  for (const k of ['autor', 'proposta', 'aprovacao', 'situacao']) assert.ok(!(k in lixo), `${k} inválido não entra`);
  assert.equal(novoEvento({ tipo: 'x', origem: 'gestao', aluno, em: 1, resumo: 'x', motivo: 'a'.repeat(400) }).motivo.length, 300, 'motivo cortado em 300');
});

test('autorDoEvento: o autor gravado; nas linhas antigas, deduzido pela origem', () => {
  assert.equal(autorDoEvento({ origem: 'servidor', autor: { tipo: 'agente' } }), 'agente');
  assert.equal(autorDoEvento({ origem: 'gestao' }), 'coach');
  assert.equal(autorDoEvento({ origem: 'servidor' }), 'rotina');
  for (const o of ['app', 'portal', 'aluno']) assert.equal(autorDoEvento({ origem: o }), 'aluno');
  assert.equal(autorDoEvento({ origem: null, derivado: true }), '', 'linha derivada da ficha: não dá para saber');
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

/* ---------- eventosDoDiario ---------- */

test('cada aviso do diário vira um evento foto-diario, com a hora e a origem do aviso', () => {
  const inbox = { diario: [{ dia: '2026-09-24', em: 1000, origem: 'app' }] };
  const [ev, ...resto] = eventosDoDiario(aluno, inbox);
  assert.equal(resto.length, 0);
  assert.equal(ev.tipo, 'foto-diario');
  assert.equal(ev.origem, 'app');
  assert.equal(ev.em, 1000);
  assert.equal(ev.dia, '2026-09-24');
  assert.equal(ev.alunoId, '012');
  assert.equal(ev.id, 'diario-012-2026-09-24-1000');
});

test('refazer a foto do dia (outro em) é outra linha; o mesmo aviso de novo é a mesma', () => {
  const inbox = { diario: [{ dia: '2026-09-24', em: 1000, origem: 'app' }, { dia: '2026-09-24', em: 2000, origem: 'app' }] };
  const ids = eventosDoDiario(aluno, inbox).map((e) => e.id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(eventosDoDiario(aluno, inbox).map((e) => e.id), ids);
});

test('aviso do diário sem dia válido ou sem em fica de fora; origem estranha vira "aluno"', () => {
  const inbox = { diario: [
    { dia: 'ontem', em: 1, origem: 'app' },
    { dia: '2026-09-24', origem: 'app' },
    null,
    { dia: '2026-09-23', em: 5, origem: 'gestao' },
  ] };
  const evs = eventosDoDiario(aluno, inbox);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].origem, 'aluno');
});

test('caixa sem diário (ou malformada) não gera evento', () => {
  assert.deepEqual(eventosDoDiario(aluno, { feedbacks: [] }), []);
  assert.deepEqual(eventosDoDiario(aluno, { diario: 'x' }), []);
  assert.deepEqual(eventosDoDiario(null, { diario: [] }), []);
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
