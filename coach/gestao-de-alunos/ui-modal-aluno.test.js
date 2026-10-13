// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-modal-aluno.test.js
 *
 * O cadastro curto do "+ Cadastrar novo aluno": o modal abre com os nove
 * campos, grava só eles (nada de lista vazia ou "false" que o coach não
 * escolheu) e abre a ficha do aluno novo — na aba Geral.
 *
 * A fiação é testada com um DOM de mentira (só o que o modal toca) e o db.js
 * de verdade sobre um localStorage em memória, instalado ANTES dos imports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/** @param {string} sel */
function elemento(sel) {
  const classes = new Set();
  return {
    sel, _html: '', campos: /** @type {Record<string, any>} */ ({}), ouvintes: /** @type {Record<string, Function>} */ ({}),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle() {} },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    addEventListener(t, f) { this.ouvintes[t] = f; },
    querySelector: () => null, querySelectorAll: () => [],
  };
}
/** @type {Record<string, ReturnType<typeof elemento>>} */
const tela = {};
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({ querySelector: (s) => el(s), querySelectorAll: () => [] });
globalThis.FormData = /** @type {any} */ (class {
  constructor(f) { this.m = f.campos; }
  entries() { return Object.entries(this.m); }
  get(k) { return this.m[k] ?? null; }
  getAll(k) { const v = this.m[k]; return Array.isArray(v) ? v : v == null ? [] : [v]; }
});

const db = await import('./db.js?v=22');
const { on, EVENTOS } = await import('./estado.js?v=22');
const { iniciarModalAluno } = await import('./ui-modal-aluno.js?v=22');
const avisos = /** @type {string[]} */ ([]);
iniciarModalAluno({ avisar: (o) => avisos.push(o.texto) });

/** Envia o formulário do modal com os campos "digitados". @param {Record<string, any>} campos */
function enviar(campos) {
  const form = el('#form-novo');
  form.campos = campos;
  form.ouvintes.submit({ preventDefault() {}, target: form });
}

test('cadastro curto: o "+" abre o modal com os nove campos essenciais', () => {
  el('#fab-novo').ouvintes.click();
  const h = el('#modal-aluno-body').innerHTML;
  const nomes = [...h.matchAll(/name="([a-zA-Z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['id', 'nome', 'telefone', 'email', 'nascimento', 'sexo', 'status', 'mensalidade', 'vencimento']);
  assert.ok(el('#modal-aluno').classList.contains('open'));
});

test('cadastro curto: grava só o que o modal tem e abre a ficha do aluno novo', () => {
  const abertos = /** @type {string[]} */ ([]);
  const parar = on(EVENTOS.ABRIR_PERFIL, (id) => abertos.push(id));
  enviar({ id: 'Lia01', nome: ' Lia Rocha ', telefone: '14999990000', email: 'lia@box.com', nascimento: '2000-05-01', sexo: 'Feminino', status: 'ativo', mensalidade: '150', vencimento: '10' });
  parar();
  const a = db.obter('Lia01');
  assert.equal(a.nome, 'Lia Rocha');
  assert.equal(a.email, 'lia@box.com');
  assert.equal(a.mensalidade, '150');
  for (const k of ['idade', 'diasTreino', 'foco', 'horarios', 'appLiberado', 'modoLite', 'pagoPor', 'parceria']) {
    assert.ok(!(k in a), `${k} não é do cadastro curto (a idade sai do nascimento; o resto fica para o card dele)`);
  }
  assert.deepEqual(abertos, ['Lia01'], 'a ficha abre (o perfil abre na aba Geral)');
  assert.ok(!el('#modal-aluno').classList.contains('open'), 'o modal fecha');
});

test('cadastro curto: sem nome não grava; ID repetido avisa', () => {
  const n = db.listar().length;
  enviar({ id: '', nome: '  ', status: 'ativo' });
  assert.equal(db.listar().length, n);
  assert.equal(avisos.at(-1), 'Informe o nome do aluno.');
  enviar({ id: 'Lia01', nome: 'Outra', status: 'ativo' });
  assert.equal(avisos.at(-1), 'Já existe um aluno com esse ID. Escolha outro.');
  assert.equal(db.obter('Lia01').nome, 'Lia Rocha');
});
