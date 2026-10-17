// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tela-turmas.test.js
 *
 * A tela Turmas (painel de presença) ligada ao roteador, ao banco e às regras:
 * abre em hoje com a turma do horário, cada botão aplica a regra certa (grava,
 * registra, redesenha), e a recusa aparece na tela.
 *
 * DOM de mentira (só o que a tela toca) e o db.js de verdade sobre um
 * localStorage em memória, instalado ANTES dos imports. Todo mundo treina os
 * sete dias às 23:59, para a turma de hoje existir e ainda não ter começado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/** Os campos que o coach preencheu (aviso, seleção, nome…). @type {Record<string, any>} */
const campos = {};
/** @param {string} sel */
function elemento(sel) {
  return {
    sel, innerHTML: '', textContent: '', ouvintes: /** @type {Record<string, Function>} */ ({}),
    addEventListener(t, f) { this.ouvintes[t] = f; },
    querySelector: (/** @type {string} */ s) => campos[s] || null,
  };
}
/** @type {Record<string, any>} */ const tela = {};
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({ querySelector: (s) => el(s), querySelectorAll: () => [] });

const db = await import('./db.js?v=23');
const { emit, EVENTOS } = await import('./estado.js?v=23');
const eventos = await import('./eventos.js?v=23');
const { iniciarTelaTurmas } = await import('./ui-tela-turmas.js?v=23');
const { hoje, addDias, fmtData } = await import('./util/formato.js?v=23');
iniciarTelaTurmas();

const TODOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const grade = Object.fromEntries(TODOS.map((k) => [k, '23:59']));
const HOJE = hoje(), AMANHA = addDias(HOJE, 1);
db.criar({ id: 'Gil01', nome: 'Gil', diasTreino: TODOS, horarios: grade });
db.criar({ id: 'Bia02', nome: 'Bia', diasTreino: TODOS, horarios: grade });
db.criar({ id: 'Davi03', nome: 'Davi', diasTreino: TODOS, horarios: grade });
// Caio não tem grade: só aparece numa turma pela reposição. O crédito dele vale 30 dias.
db.criar({ id: 'Caio04', nome: 'Caio', atestados: { '2026-01-05': { em: 1, tipo: 'desmarcacao', expira: addDias(HOJE, 30), reposicao: null } } });
db.criar({ id: 'Fora05', nome: 'Fora', status: 'inativo', diasTreino: TODOS, horarios: grade });

const corpo = () => el('#tur-corpo');
/** Um clique como o navegador entrega. @param {Record<string, string>} dataset @param {string} [classe] */
const clicar = (dataset, classe = '') => {
  const btn = { dataset, disabled: false, classList: { contains: (c) => c === classe } };
  corpo().ouvintes.click({ target: { closest: () => btn } });
};
/** Clica numa ação da linha de um aluno titular de hoje. @param {string} acao @param {string} id @param {string} [tipo] @param {string} [chave] */
const agir = (acao, id, tipo = 'titular', chave = HOJE) => clicar({ acao, k: `${id}|${tipo}|${chave}` });
const ultimoLog = () => eventos.pendentes().at(-1);
/** O trecho do HTML da linha de um nome. @param {string} nome */
const linha = (nome) => (corpo().innerHTML.split('<div class="fin-row tur-row').find((p) => p.includes(`fin-nome">${nome} `)) || '');

test('abrir pelo roteador: hoje, a turma das 23h59 com os titulares ativos e a ocupação', () => {
  emit(EVENTOS.ABRIR_TELA, 'turmas');
  assert.match(el('#tur-data-lbl').textContent, new RegExp(fmtData(HOJE).replace(/\//g, '\\/')));
  const html = corpo().innerHTML;
  assert.match(html, /tur-chip ativo[^]*23h59[^]*3\/6/, 'o seletor mostra a turma e a ocupação');
  for (const n of ['Gil', 'Bia', 'Davi']) assert.match(linha(n), /tur-status st-confirmado">Confirmado/, n);
  assert.doesNotMatch(html, /Fora/, 'inativo não entra na turma');
  assert.match(html, /<option value="Caio04\|2026-01-05">Caio — aula de 05\/01 \(desmarcou no prazo · vence/, 'Caio pode repor');
  assert.match(html, /2h ou mais<\/b> de antecedência/, 'as regras à vista');
});

test('✓ Presente: grava a presença, registra o check-in e pinta a linha', () => {
  agir('presente', 'Gil01');
  assert.ok(db.obter('Gil01').presencas.includes(HOJE));
  assert.equal(ultimoLog().tipo, 'presenca');
  assert.match(linha('Gil'), /st-presente">Presente/);
});

test('Desmarcou no prazo: o painel pede a hora do aviso; com 2h ou mais, crédito e vaga livre', () => {
  agir('desmarcar', 'Bia02');
  assert.match(linha('Bia'), /data-aviso-data/, 'o painel abriu na linha');
  campos['[data-aviso-data]'] = { value: addDias(HOJE, -1) };
  campos['[data-aviso-hora]'] = { value: '20:00' };
  agir('confirmar-desmarcar', 'Bia02');
  const credito = db.obter('Bia02').atestados[HOJE];
  assert.equal(credito.tipo, 'desmarcacao');
  assert.equal(credito.expira, addDias(addDias(HOJE, -1), 30), '30 dias a contar do aviso');
  assert.equal(ultimoLog().tipo, 'desmarcacao');
  assert.match(linha('Bia'), /st-desmarcou-no-prazo">Desmarcou no prazo/);
  assert.match(corpo().innerHTML, /tur-chip ativo[^]*2\/6/, 'a vaga dela ficou livre');
});

test('Desmarcou fora do prazo: falta sem crédito; o coach concede o crédito por exceção', () => {
  agir('desmarcar', 'Davi03');
  campos['[data-aviso-data]'] = { value: HOJE };
  campos['[data-aviso-hora]'] = { value: '23:00' };
  agir('confirmar-desmarcar', 'Davi03');
  assert.equal(db.obter('Davi03').faltas[HOJE].tipo, 'fora-do-prazo');
  assert.equal(db.obter('Davi03').atestados[HOJE], undefined, 'sem crédito');
  assert.match(linha('Davi'), /st-desmarcou-fora">Desmarcou fora do prazo[^]*Conceder crédito/);
  agir('credito', 'Davi03');
  assert.equal(db.obter('Davi03').atestados[HOJE].tipo, 'excecao');
  assert.deepEqual(db.obter('Davi03').faltas, {});
  assert.equal(ultimoLog().tipo, 'credito');
  assert.doesNotMatch(linha('Davi'), /Conceder crédito/, 'não concede duas vezes');
});

test('vagas: o coach muda a capacidade da turma, e a lotada recusa a reposição', () => {
  corpo().ouvintes.change({ target: { closest: () => ({ value: '1', dataset: { vagas: '23:59' } }) } });
  assert.deepEqual(db.configTurmas().porHorario, { '23:59': 1 });
  assert.match(corpo().innerHTML, /tur-chip ativo lotada/);
  campos['[data-rep-sel]'] = { value: 'Caio04|2026-01-05' };
  clicar({ acao: 'add-rep' });
  assert.match(corpo().innerHTML, /chk-cel-aviso">Turma lotada/);
  assert.equal(db.obter('Caio04').atestados['2026-01-05'].reposicao, null);
  corpo().ouvintes.change({ target: { closest: () => ({ value: '6', dataset: { vagas: '23:59' } }) } });
});

test('reposição: amanhã, na turma com vaga, usa o crédito e entra na lista como Reposição', () => {
  el('#tur-next').ouvintes.click();
  assert.match(el('#tur-data-lbl').textContent, new RegExp(fmtData(AMANHA).replace(/\//g, '\\/')));
  campos['[data-rep-sel]'] = { value: 'Caio04|2026-01-05' };
  clicar({ acao: 'add-rep' });
  assert.deepEqual(db.obter('Caio04').atestados['2026-01-05'].reposicao, { data: AMANHA, hora: '23:59' });
  assert.equal(ultimoLog().tipo, 'reposicao');
  assert.match(linha('Caio'), /tur-tag reposicao">Reposição[^]*st-confirmado/);
  assert.doesNotMatch(corpo().innerHTML, /option value="Caio04/, 'o crédito foi usado');
});

test('aula experimental: precisa de nome; entra na turma, muda de status e sai', () => {
  campos['[data-exp-nome]'] = { value: '  ' };
  clicar({ acao: 'add-exp' });
  assert.match(corpo().innerHTML, /Escreva o nome de quem vem experimentar/);
  campos['[data-exp-nome]'] = { value: 'Duda' };
  campos['[data-exp-tel]'] = { value: '11 98888-0000' };
  clicar({ acao: 'add-exp' });
  const [x] = db.experimentaisDoDia(AMANHA);
  assert.deepEqual([x.nome, x.telefone, x.hora, x.status], ['Duda', '11 98888-0000', '23:59', 'confirmado']);
  assert.match(linha('Duda'), /tur-tag experimental">Experimental/);
  clicar({ acao: 'exp-presente', exp: x.id });
  assert.equal(db.experimentaisDoDia(AMANHA)[0].status, 'presente');
  clicar({ acao: 'exp-remover', exp: x.id });
  assert.deepEqual(db.experimentaisDoDia(AMANHA), []);
});

test('abrir outro horário: a turma vazia aparece e já aceita experimental', () => {
  campos['[data-nova-hora]'] = { value: '06:00' };
  clicar({}, 'tur-abrir-hora');
  assert.match(corpo().innerHTML, /tur-chip ativo[^]*6h[^]*0\/6/);
  assert.match(corpo().innerHTML, /Turma vazia/);
});
