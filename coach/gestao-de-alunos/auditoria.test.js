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

const { eventoPagamento, eventoPagamentoDesfeito, eventoLancamento, novoConsumo } = await import('./financeiro-aluno.js?v=27');
const { regFinanceiro } = await import('./registro.js?v=27');
const eventos = await import('./eventos.js?v=27');
const { on, EVENTOS } = await import('./estado.js?v=27');
const { TIPOS, CATEGORIAS, filtrarEventos, linhaHTML } = await import('./registros-ui.js?v=27');

const NB = (s) => s.replace(/ /g, ' ');
const ana = { id: 'Ana', nome: 'Ana Lima', vencimento: '10', pagamentos: {} };

/* ---------- o texto ---------- */

test('auditoria: o texto de cada evento diz mês e valor', () => {
  assert.deepEqual({ ...eventoPagamento('2026-09', 280), resumo: NB(eventoPagamento('2026-09', 280).resumo) },
    { tipo: 'pagamento', resumo: 'Pagamento registrado · Setembro / 2026 · R$ 280,00', dados: { mesId: '2026-09', valor: 280, soMensalidade: true } });
  assert.deepEqual(eventoPagamentoDesfeito('2026-09'), { tipo: 'pagamento-desfeito', resumo: 'Pagamento desfeito · Setembro / 2026', dados: { mesId: '2026-09' } });
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

test('auditoria: as três telas que dão baixa usam a MESMA regra, e a trilha sai dela', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const telas = { 'aba do aluno': ler('./ui-tab-financeiro.js'), 'Financeiro do box': ler('./ui-tela-financeiro.js'), 'Cobranças': ler('./ui-tela-cobrancas.js') };
  for (const [nome, fonte] of Object.entries(telas)) {
    assert.match(fonte, /darBaixa\(a, /, `${nome}: dá baixa pela regra`);
    // Ninguém mais monta a gravação nem o texto do log à mão: a regra devolve os dois.
    assert.ok(!/pagamentos:\s*comPagamento|consumos:\s*\[/.test(fonte), `${nome}: não grava pagamentos/consumos à mão`);
    assert.ok(!/eventoPagamento|eventoLancamento/.test(fonte), `${nome}: não monta o evento do log`);
    assert.match(fonte, /if \(r\.log\) regFinanceiro\(a, r\.log\)/, `${nome}: registra o log que a regra devolveu`);
  }
  for (const nome of ['aba do aluno', 'Financeiro do box']) {
    assert.match(telas[nome], /desfazerBaixa\(a, /, `${nome}: desfaz pela regra`);
    assert.match(telas[nome], /lancarConsumo\(a, /, `${nome}: lança pela regra`);
    assert.match(telas[nome], /removerConsumo\(a, /, `${nome}: remove pela regra`);
  }
  assert.ok(!/darBaixa|comPagamento|regFinanceiro/.test(ler('./boot.js')), 'o app.js não mexe mais em dinheiro');
  // O Pix do Mercado Pago é a quarta porta da baixa: a mesma regra, nunca o mapa à mão.
  const pix = ler('./pix-baixa.js');
  assert.match(pix, /darBaixa\(a, /, 'Pix: dá baixa pela regra');
  assert.ok(!/comPagamento|pagamentos:\s*\{/.test(pix), 'Pix: não grava pagamentos à mão');
});

/* ---------- fatiamento de Registros e Matriz ---------- */

test('fatiamento: Registros e Treino (que absorveu a Matriz) moram nos módulos deles, ligados no main.js', async () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const app = ler('./boot.js');
  for (const resto of ['function abrirRegistros', 'function desenharRegistros', 'function atualizarRegistros', 'regFiltro',
    "$('#reg-lista')", 'matrizUI', 'matriz-ui.js']) {
    assert.ok(!app.includes(resto), `app.js ainda tem ${resto}`);
  }
  const main = ler('./telas.js');
  assert.match(main, /iniciarTabTreino\(\);/);
  assert.match(main, /iniciarTabRegistros\(\);/);
  assert.ok(main.indexOf('iniciarTabRegistros();') < main.length, 'as abas ligam antes do app');
  const treino = await import('./ui-tab-treino.js?v=27');
  const registros = await import('./ui-tab-registros.js?v=27');
  assert.equal(typeof treino.iniciarTabTreino, 'function');
  assert.equal(typeof registros.iniciarTabRegistros, 'function');
});

test('log da Matriz: o salvar global compara com a ficha do banco na hora de salvar, e chama o campo de "Matriz"', async () => {
  // A aba Treino (onde a Matriz se edita) não grava sozinha: quem grava (e registra) é o salvar global.
  const treino = readFileSync(new URL('./ui-tab-treino.js', import.meta.url), 'utf8');
  assert.doesNotMatch(treino, /db\.atualizar\(|regFicha\(/);
  const fonte = readFileSync(new URL('./ui-salvar-global.js', import.meta.url), 'utf8');
  assert.match(fonte, /const a = db\.obter\(alunoId\);[^]{0,1600}?db\.atualizar\(alunoId, \{ \.\.\.patch, \.\.\.arrumacao\.patch \}, \{ remover: arrumacao\.remover \}\);\s*\n\s*if \(Object\.keys\(resto\)\.length\) regFicha\(a, resto\);/,
    'a ficha de antes é lida do banco na hora de salvar, e o log compara com ela');
  const { resumoFicha } = await import('./registros-ui.js?v=27');
  assert.equal(resumoFicha(['matrizIndividualizacao', 'nivel']), 'Ficha editada · Matriz, Nível');
});
