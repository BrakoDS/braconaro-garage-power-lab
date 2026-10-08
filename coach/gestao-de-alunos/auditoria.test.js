// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/auditoria.test.js
 *
 * A trilha do dinheiro na aba Registros, e o fatiamento de Registros e Matriz.
 *
 * O registro de verdade passa pela fila do eventos.js, que mora no
 * localStorage — aqui um em memória, instalado ANTES de importar os módulos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

const { eventoPagamento, eventoPagamentoDesfeito, eventoLancamento, novoConsumo } = await import('./financeiro-aluno.js');
const { regFinanceiro } = await import('./registro.js');
const eventos = await import('./eventos.js');
const { on, EVENTOS } = await import('./estado.js');
const { TIPOS, CATEGORIAS, filtrarEventos, linhaHTML } = await import('./registros-ui.js');

const NB = (s) => s.replace(/ /g, ' ');
const ana = { id: 'Ana', nome: 'Ana Lima', vencimento: '10', pagamentos: {} };

/* ---------- o texto ---------- */

test('auditoria: o texto de cada evento diz mês e valor', () => {
  assert.deepEqual({ ...eventoPagamento('2026-09', 280), resumo: NB(eventoPagamento('2026-09', 280).resumo) },
    { tipo: 'pagamento', resumo: 'Pagamento registrado · Setembro / 2026 · R$ 280,00' });
  assert.deepEqual(eventoPagamentoDesfeito('2026-09'), { tipo: 'pagamento-desfeito', resumo: 'Pagamento desfeito · Setembro / 2026' });
  const c = novoConsumo(ana, { nome: 'Camiseta', preco: 60 }, '2026-10-25', 'x');
  assert.equal(NB(eventoLancamento(c).resumo), 'Lançamento avulso · Camiseta · R$ 60,00 · fatura de Novembro / 2026',
    'a fatura vai junto: lançado depois do vencimento, cai na seguinte');
});

/* ---------- o registro de verdade ---------- */

test('auditoria: pagamento vira evento na fila da aba Registros, e o barramento avisa', () => {
  memoria.clear();
  const avisos = [];
  const parar = on(EVENTOS.REGISTROS_MUDARAM, (id) => avisos.push(id));
  regFinanceiro(ana, eventoPagamento('2026-09', 280));
  regFinanceiro(ana, eventoPagamentoDesfeito('2026-09'));
  parar();
  const fila = eventos.pendentes();
  assert.deepEqual(fila.map((e) => [e.tipo, e.origem, e.alunoId, e.alunoNome, NB(e.resumo)]), [
    ['pagamento', 'gestao', 'Ana', 'Ana Lima', 'Pagamento registrado · Setembro / 2026 · R$ 280,00'],
    ['pagamento-desfeito', 'gestao', 'Ana', 'Ana Lima', 'Pagamento desfeito · Setembro / 2026'],
  ]);
  assert.ok(fila.every((e) => e.em > 0 && e.id));
  assert.deepEqual(avisos, ['Ana', 'Ana'], 'a aba Registros aberta se atualiza na hora');
});

/* ---------- a aba Registros mostra e filtra ---------- */

test('auditoria: categoria "Financeiro" nos filtros, com ícone por tipo', () => {
  assert.ok(CATEGORIAS.some(([v, r]) => v === 'financeiro' && r === 'Financeiro'));
  for (const t of ['pagamento', 'pagamento-desfeito', 'lancamento']) assert.equal(TIPOS[t].categoria, 'financeiro', t);
  const evs = [
    { id: '1', tipo: 'pagamento', origem: 'gestao', alunoId: 'Ana', em: 3, resumo: 'Pagamento registrado' },
    { id: '2', tipo: 'presenca', origem: 'gestao', alunoId: 'Ana', em: 2, resumo: 'Check-in' },
    { id: '3', tipo: 'lancamento', origem: 'gestao', alunoId: 'Ana', em: 1, resumo: 'Lançamento avulso' },
  ];
  assert.deepEqual(filtrarEventos(evs, { categoria: 'financeiro' }).map((e) => e.id), ['1', '3']);
  assert.match(linhaHTML(evs[0]), /💰 Pagamento registrado/);
  assert.match(linhaHTML(evs[2]), /🧾 Lançamento avulso/);
});

/* ---------- as três telas que dão baixa registram ---------- */

test('auditoria: toda tela que dá baixa ou lança avulso deixa a trilha', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const tab = ler('./ui-tab-financeiro.js');
  assert.match(tab, /regFinanceiro\(a, eventoPagamento\(/, 'aba do aluno: pagamento');
  assert.match(tab, /regFinanceiro\(a, eventoPagamentoDesfeito\(/, 'aba do aluno: desfazer');
  assert.match(tab, /if \(!item\.produtoId\) regFinanceiro\(a, eventoLancamento\(c\)\)/, 'aba do aluno: só o avulso');
  const app = ler('./app.js');
  assert.match(app, /function toggleFin[\s\S]*?regFinanceiro\(a, pago \? eventoPagamento\(finMes, total\) : eventoPagamentoDesfeito\(finMes\)\)/, 'tela Financeiro do box');
  assert.match(app, /const pg = e\.target\.closest\('\.cob-pago'\);[\s\S]*?regFinanceiro\(a, eventoPagamento\(mes, total\)\)/, 'Cobranças');
});

/* ---------- fatiamento de Registros e Matriz ---------- */

test('fatiamento: Registros e Matriz moram nos módulos delas, ligadas no main.js', async () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const app = ler('./app.js');
  for (const resto of ['function abrirRegistros', 'function desenharRegistros', 'function atualizarRegistros', 'regFiltro',
    "$('#reg-lista')", 'matrizUI', 'matriz-ui.js']) {
    assert.ok(!app.includes(resto), `app.js ainda tem ${resto}`);
  }
  const main = ler('./main.js');
  assert.match(main, /iniciarTabMatriz\(\);/);
  assert.match(main, /iniciarTabRegistros\(\);/);
  assert.ok(main.indexOf('iniciarTabRegistros();') < main.indexOf("await import('./app.js')"), 'as abas ligam antes do app');
  const matriz = await import('./ui-tab-matriz.js');
  const registros = await import('./ui-tab-registros.js');
  assert.equal(typeof matriz.iniciarTabMatriz, 'function');
  assert.equal(typeof matriz.montar, 'function');
  assert.equal(typeof registros.iniciarTabRegistros, 'function');
});

test('log da Matriz: compara com a ficha do banco na hora de salvar, e chama o campo de "Matriz"', async () => {
  const fonte = readFileSync(new URL('./ui-tab-matriz.js', import.meta.url), 'utf8');
  assert.match(fonte, /const antes = db\.obter\(aluno\.id\);[^]{0,600}?db\.atualizar\(aluno\.id/, 'snapshot antes de gravar');
  assert.match(fonte, /aoSalvar: \(salvo, antes\) => \{\s*\n\s*if \(antes\) regFicha\(antes, salvo\);/);
  const { resumoFicha } = await import('./registros-ui.js');
  assert.equal(resumoFicha(['matrizIndividualizacao', 'nivel']), 'Ficha editada · Matriz, Nível');
});
