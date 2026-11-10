// @ts-check
/**
 * Rodar: node --test coach/calendario/app.test.js
 *
 * A tela ligada ao banco de verdade (db.js sobre um localStorage em memória,
 * sem nuvem) com DOM de mentira: só o que o app toca. O relógio é fixo em
 * 21/12/2026 08:00 — a semana tem o Natal (sexta, 25).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});
/** @param {string} sel */
function elemento(sel) {
  return { sel, innerHTML: '', textContent: '', hidden: false, style: {}, ouvintes: /** @type {Record<string, Function>} */ ({}),
    addEventListener(/** @type {string} */ t, /** @type {Function} */ f) { this.ouvintes[t] = f; }, removeAttribute() {}, setAttribute() {} };
}
/** @type {Record<string, any>} */ const tela = {};
const el = (/** @type {string} */ s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({ querySelector: (/** @type {string} */ s) => el(s), querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' });
globalThis.window = /** @type {any} */ ({});

const db = await import('../gestao-de-alunos/db.js?v=31');
const { iniciarCalendario } = await import('./app.js');

db.criar({ id: 'A1', nome: 'Ana Lima', diasTreino: ['seg', 'qua'], horarios: { seg: '06:00', qua: '06:00' } });
const respostas = /** @type {(string|null)[]} */ ([]);
iniciarCalendario(null, {
  painel: async () => respostas.shift() ?? null,
  relogio: () => ({ hoje: '2026-12-21', agora: '08:00' }),
  agoraMs: () => 0,
});
const clicar = (/** @type {Record<string, string>} */ dataset) => el('#app').ouvintes.click({ target: { closest: () => ({ dataset }) } });

test('abre na semana de hoje, com a turma da Ana', () => {
  assert.equal(el('#cal-periodo').textContent, '21 – 26 DEZ 2026');
  assert.match(el('#cal-corpo').innerHTML, /data-acao="turma" data-iso="2026-12-21" data-hora="06:00"[^]*1<small>\/6/);
  assert.match(el('#cal-corpo').innerHTML, /Ana/);
});

test('feriado: "Não abriu" grava, fecha a coluna e "Limpar" desfaz', async () => {
  assert.match(el('#cal-corpo').innerHTML, /data-acao="feriado" data-iso="2026-12-25"[^]*decidir/);
  respostas.push('fechou');
  await clicar({ acao: 'feriado', iso: '2026-12-25' });
  assert.equal(db.feriadosDoBox()['2026-12-25'], false);
  assert.match(el('#cal-corpo').innerHTML, /cal-dh fechado[^]*box fechado/);
  assert.match(el('#cal-corpo').innerHTML, /não abriu/);
  respostas.push(null);
  await clicar({ acao: 'feriado', iso: '2026-12-25' });
  assert.equal(db.feriadosDoBox()['2026-12-25'], false, 'fechar o diálogo não muda nada');
  respostas.push('limpar');
  await clicar({ acao: 'feriado', iso: '2026-12-25' });
  assert.ok(!('2026-12-25' in db.feriadosDoBox()));
});

test('turma: abre o painel com quem vem; fechar limpa', async () => {
  await clicar({ acao: 'turma', iso: '2026-12-21', hora: '06:00' });
  assert.match(el('#cal-lado').innerHTML, /Vêm \(1\)[^]*Ana Lima/);
  await clicar({ acao: 'fechar' });
  assert.doesNotMatch(el('#cal-lado').innerHTML, /Vêm \(/);
});

test('camada desligada some e a escolha fica no aparelho', async () => {
  await clicar({ acao: 'camada', v: 'turmas' });
  assert.doesNotMatch(el('#cal-corpo').innerHTML, /data-acao="turma"/);
  assert.deepEqual(JSON.parse(memoria.get('braconaro_calendario_v1')).desligadas, ['turmas']);
  await clicar({ acao: 'camada', v: 'turmas' });
  assert.match(el('#cal-corpo').innerHTML, /data-acao="turma"/);
});

test('visão: mês e dia; navegar e voltar para hoje', async () => {
  await clicar({ acao: 'visao', v: 'mes' });
  assert.equal(el('#cal-periodo').textContent, 'DEZEMBRO 2026');
  assert.match(el('#cal-corpo').innerHTML, /mes-grade/);
  await clicar({ acao: 'next' });
  assert.equal(el('#cal-periodo').textContent, 'JANEIRO 2027');
  await clicar({ acao: 'hoje' });
  await clicar({ acao: 'visao', v: 'dia' });
  assert.equal(el('#cal-periodo').textContent, 'SEGUNDA · 21/12/2026');
  assert.match(el('#cal-corpo').innerHTML, /cartao/);
  await clicar({ acao: 'visao', v: 'semana' });
});
