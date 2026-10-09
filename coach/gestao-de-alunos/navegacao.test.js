// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/navegacao.test.js
 *
 * O roteador de telas ('abrir-tela'): mostra uma tela só, os botões com
 * `data-tela` navegam, o "voltar" antigo vira 'lista' — e o app.js não liga mais
 * botão de entrar nem de voltar em tela nenhuma.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ---------- um DOM mínimo: as <section class="screen"> e o clique ---------- */

const telas = ['lista', 'perfil', 'checkin', 'agenda', 'financeiro', 'cobrancas', 'aviso', 'mural', 'desafios', 'leads', 'automacao'].map((n) => {
  const c = new Set(n === 'lista' ? ['active'] : []);
  return { id: 'tela-' + n, classList: { toggle: (k, on) => (on ? c.add(k) : c.delete(k)), contains: (k) => c.has(k) } };
});
let cliques = /** @type {Function|null} */ (null);
let rolou = 0;
globalThis.document = /** @type {any} */ ({
  querySelectorAll: (s) => (s === '.screen' ? telas : []),
  addEventListener: (t, f) => { if (t === 'click') cliques = f; },
});
globalThis.window = /** @type {any} */ ({ scrollTo: () => { rolou++; } });

const { on, emit, EVENTOS } = await import('./estado.js?v=13');
const { iniciarNavegacao, telaAtual, TELAS } = await import('./navegacao.js?v=13');
iniciarNavegacao();

const visiveis = () => telas.filter((t) => t.classList.contains('active')).map((t) => t.id);
/** Um botão de mentira, com `closest` como no DOM. @param {string|undefined} tela */
const botao = (tela) => ({ dataset: tela ? { tela } : {}, closest(s) { return s === '[data-tela]' && tela ? this : null; } });

test('roteador: abrir-tela mostra uma tela só e rola para o topo', () => {
  const r = rolou;
  emit(EVENTOS.ABRIR_TELA, 'checkin');
  assert.deepEqual(visiveis(), ['tela-checkin']);
  assert.equal(telaAtual(), 'checkin');
  assert.equal(rolou, r + 1);
  emit(EVENTOS.ABRIR_TELA, 'perfil');
  assert.deepEqual(visiveis(), ['tela-perfil']);
});

test('roteador: a tela já está visível quando o módulo dela desenha', () => {
  let visivelAoDesenhar = null;
  const parar = on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'agenda') visivelAoDesenhar = visiveis(); });
  emit(EVENTOS.ABRIR_TELA, 'agenda');
  parar();
  assert.deepEqual(visivelAoDesenhar, ['tela-agenda']);
});

test('roteador: nome desconhecido não esconde a tela atual', () => {
  emit(EVENTOS.ABRIR_TELA, 'lista');
  const erro = console.error; const erros = [];
  console.error = (m) => erros.push(m);
  try { emit(EVENTOS.ABRIR_TELA, 'checkn'); } finally { console.error = erro; }
  assert.deepEqual(visiveis(), ['tela-lista']);
  assert.match(erros[0], /tela desconhecida "checkn"/);
});

test('roteador: o "voltar-lista" do perfil vira abrir-tela "lista"', () => {
  emit(EVENTOS.ABRIR_TELA, 'perfil');
  const pedidos = [];
  const parar = on(EVENTOS.ABRIR_TELA, (t) => pedidos.push(t));
  emit(EVENTOS.VOLTAR_LISTA);
  parar();
  assert.deepEqual(pedidos, ['lista']);
  assert.deepEqual(visiveis(), ['tela-lista']);
});

test('roteador: um ouvinte só para todos os botões com data-tela', () => {
  cliques?.({ target: botao('leads') });
  assert.deepEqual(visiveis(), ['tela-leads']);
  cliques?.({ target: botao(undefined) }); // clique fora de botão de navegação
  assert.deepEqual(visiveis(), ['tela-leads']);
  cliques?.({ target: botao('lista') });
  assert.deepEqual(visiveis(), ['tela-lista']);
});

/* ---------- a marcação e o app.js ---------- */

const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('roteador: toda tela tem a sua <section>, botão de entrar e "voltar" com data-tela', () => {
  const html = ler('./index.html');
  for (const t of TELAS) assert.match(html, new RegExp(`<section id="tela-${t}" class="screen`), `falta a tela ${t}`);
  for (const t of TELAS.filter((x) => x !== 'lista' && x !== 'perfil')) {
    assert.match(html, new RegExp(`id="btn-${t}" data-tela="${t}"`), `botão de entrar em ${t}`);
  }
  assert.equal((html.match(/-voltar" data-tela="lista"/g) || []).length, 9, 'os nove "← Voltar para a listagem"');
});

test('roteador: ninguém navega na mão — nenhuma tela liga o próprio botão de entrar ou voltar', () => {
  const fontes = ['./boot.js', './telas.js', './main.js', './ui-tela-checkin.js', './ui-tela-agenda.js', './ui-tela-financeiro.js', './ui-tela-cobrancas.js',
    './ui-tela-avisos.js', './ui-tela-mural.js', './ui-tela-desafios.js', './ui-tela-leads.js', './ui-tela-automacao.js', './ui-modal-aluno.js'].map(ler).join('\n');
  assert.ok(!fontes.includes('mostrarTela'), 'mostrarTela saiu');
  assert.ok(!/\$\('#[\w]+-voltar'\)/.test(fontes), 'nenhum botão de voltar ligado à mão');
  // (o $('#btn-leads') que sobra é o contador de leads desenhado no botão, não navegação)
  assert.ok(!/\$\('#btn-(checkin|agenda|financeiro|cobrancas|aviso|mural|desafios|leads|automacao)'\)\??\.addEventListener/.test(fontes), 'nenhum botão de entrar ligado à mão');
  assert.match(ler('./ui-perfil.js'), /emit\(EVENTOS\.ABRIR_TELA, 'perfil'\)/, 'abrir o perfil pede a tela ao roteador');
  const telas = ler('./telas.js');
  assert.ok(telas.indexOf('iniciarNavegacao();') < telas.indexOf('iniciarLista('), 'o roteador liga antes das telas');
});
