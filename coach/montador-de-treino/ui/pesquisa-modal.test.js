// @ts-check
/**
 * Testes da VIEW PURA de `pesquisa-modal.js` — as funções que recebem uma
 * `Proposta` (o formato exato de `functions/src/pesquisa.ts`) e devolvem uma
 * string de HTML, sem tocar `document`.
 *
 * O que este arquivo prova (Task 3, item de verificação do brief):
 *   1. Todo campo que veio da IA (nome, obs, resumo, comoExecutar, objetivo,
 *      equipamentoFaltante) sai ESCAPADO — `<script>`, `<img onerror=...>` e
 *      `"><svg onload=...>` nunca aparecem como tag de verdade no HTML final.
 *   2. `fontes` só vira link quando começa com http(s); uma URL `javascript:`
 *      nunca vira `href` clicável, mesmo que o filtro do servidor falhasse.
 *   3. `mesclarProposta` (Regra 6 do brief — "Pesquisar na internet" preserva
 *      edição do coach) funciona campo a campo, inclusive para arrays de
 *      checkbox onde a ORDEM não deveria contar como "editado".
 *
 * O módulo importa `coach/academia/db.js` na cadeia (`coach/academia/data/seed.js` →
 * `montador/data/*.js` são puros, mas `coach/academia/db.js` chama `localStorage` no
 * CARREGAMENTO do módulo — `garantirSeed()` roda solto no topo do arquivo).
 * Mesmo stub mínimo de `livre.test.js`: existe só para o import em cadeia não
 * quebrar em Node, os testes abaixo não usam `document` para nada.
 *
 * Rodar: node --test coach/montador-de-treino/ui/pesquisa-modal.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = /** @type {any} */ ({
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  createElement: () => ({ classList: { add() {} }, addEventListener() {}, appendChild() {} }),
});
globalThis.window = globalThis;
if (!globalThis.localStorage) {
  globalThis.localStorage = /** @type {any} */ ({ getItem: () => null, setItem: () => {} });
}

const {
  ehUrlSegura, fontesHTML, equipamentoFaltanteHTML,
  formularioExercicioHTML, formularioTecnicaHTML, mesclarProposta,
} = await import('./pesquisa-modal.js');

/* ---------- ehUrlSegura ---------- */

test('ehUrlSegura aceita http e https, recusa o resto', () => {
  assert.equal(ehUrlSegura('https://exemplo.com/artigo'), true);
  assert.equal(ehUrlSegura('http://exemplo.com'), true);
  assert.equal(ehUrlSegura('javascript:alert(1)'), false);
  assert.equal(ehUrlSegura('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(ehUrlSegura(''), false);
  assert.equal(ehUrlSegura(undefined), false);
});

/* ---------- fontesHTML ---------- */

test('fontesHTML renderiza URL http como link com rel=noopener', () => {
  const html = fontesHTML(['https://exemplo.com/estudo']);
  assert.match(html, /<a href="https:\/\/exemplo\.com\/estudo" target="_blank" rel="noopener">/);
});

test('fontesHTML NUNCA transforma javascript: em link — vira texto', () => {
  const html = fontesHTML(['javascript:alert(1)']);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /<li>javascript:alert\(1\)<\/li>/);
});

test('fontesHTML NUNCA transforma data: em link', () => {
  const html = fontesHTML(['data:text/html,oi']);
  assert.doesNotMatch(html, /<a /);
});

test('fontesHTML devolve string vazia sem fontes', () => {
  assert.equal(fontesHTML([]), '');
  assert.equal(fontesHTML(undefined), '');
});

/* ---------- escapando texto malicioso da IA ---------- */

const PROPOSTA_EXERCICIO_MALICIOSA = {
  tipo: 'exercicio',
  nome: '<script>alert(1)</script>',
  padrao: 'empurrar',
  musculos: [],
  tags: [],
  equipamentoIds: [],
  nivel: 'intermediario',
  tempoMedioSeg: 35,
  obs: '<img src=x onerror=alert(1)>',
  equipamentoFaltante: ['"><svg onload=alert(1)>'],
  fontes: ['javascript:alert(1)'],
};

test('formularioExercicioHTML escapa nome, obs e equipamentoFaltante — nenhuma tag de verdade sobrevive', () => {
  const html = formularioExercicioHTML({ proposta: PROPOSTA_EXERCICIO_MALICIOSA, equipamentos: [], restantes: 3, buscou: false });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.doesNotMatch(html, /<svg onload=/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot;&gt;&lt;svg onload=alert\(1\)&gt;/);
  // a fonte maliciosa não pode ter virado link
  assert.doesNotMatch(html, /href="javascript:/);
});

test('formularioExercicioHTML desenha o aviso de equipamento faltante ANTES do resto do formulário', () => {
  const html = formularioExercicioHTML({
    proposta: { ...PROPOSTA_EXERCICIO_MALICIOSA, nome: 'Remada TRX', obs: 'ok', equipamentoFaltante: ['TRX'] },
    equipamentos: [], restantes: 5, buscou: false,
  });
  const posAviso = html.indexOf('pesq-aviso');
  const posNome = html.indexOf('name="nome"');
  assert.ok(posAviso >= 0, 'aviso deveria aparecer');
  assert.ok(posAviso < posNome, 'aviso precisa vir antes do campo nome, não depois');
  assert.match(html, /<span class="chip falta">TRX<\/span>/);
});

test('formularioExercicioHTML some com o aviso quando equipamentoFaltante está vazio', () => {
  const html = formularioExercicioHTML({
    proposta: { ...PROPOSTA_EXERCICIO_MALICIOSA, equipamentoFaltante: [] },
    equipamentos: [], restantes: 5, buscou: false,
  });
  assert.doesNotMatch(html, /pesq-aviso"/);
});

test('formularioExercicioHTML só marca checkbox de equipamento que está no inventário passado', () => {
  const html = formularioExercicioHTML({
    proposta: { ...PROPOSTA_EXERCICIO_MALICIOSA, equipamentoFaltante: [], equipamentoIds: ['banco'] },
    equipamentos: [{ id: 'banco', nome: 'Banco reto' }, { id: 'barra', nome: 'Barra guiada' }],
    restantes: 5, buscou: false,
  });
  assert.match(html, /id="pesq-equipamentoIds-0"[^>]*checked/);
  assert.doesNotMatch(html, /id="pesq-equipamentoIds-1"[^>]*checked/);
});

const PROPOSTA_TECNICA_MALICIOSA = {
  tipo: 'tecnica',
  nome: '<script>alert(2)</script>',
  resumo: '<img src=x onerror=alert(2)>',
  comoExecutar: '1. "><svg onload=alert(2)>\n2. fim',
  objetivo: '<script>alert(3)</script>',
  fontes: [],
};

test('formularioTecnicaHTML escapa todos os campos de texto livre', () => {
  const html = formularioTecnicaHTML({ proposta: PROPOSTA_TECNICA_MALICIOSA, restantes: 2, buscou: true });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.doesNotMatch(html, /<svg onload=/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(html, /Buscou na internet/); // chip de "buscou" aparece quando buscou:true
});

test('equipamentoFaltanteHTML escapa e devolve vazio para lista vazia', () => {
  assert.equal(equipamentoFaltanteHTML([]), '');
  assert.equal(equipamentoFaltanteHTML(undefined), '');
  const html = equipamentoFaltanteHTML(['<script>x</script>']);
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});

/* ---------- mesclarProposta (Regra 6: "Pesquisar na internet" preserva edição) ---------- */

const BASE_EX = {
  tipo: 'exercicio', nome: 'Supino', padrao: 'empurrar', musculos: ['Peito'], tags: [],
  equipamentoIds: [], nivel: 'iniciante', tempoMedioSeg: 30, obs: 'original',
  equipamentoFaltante: [], fontes: [],
};
const NOVA_EX = {
  tipo: 'exercicio', nome: 'Supino inclinado', padrao: 'puxar', musculos: ['Costas'], tags: ['CROSS'],
  equipamentoIds: ['barra'], nivel: 'avancado', tempoMedioSeg: 45, obs: 'texto novo da IA',
  equipamentoFaltante: ['Anilha 20kg'], fontes: ['https://x.com'],
};

test('mesclarProposta mantém campo editado pelo coach e adota o resto da pesquisa nova', () => {
  const atual = { ...BASE_EX, nome: 'Supino reto (editado pelo coach)', obs: 'obs que o coach escreveu' };
  const m = mesclarProposta(BASE_EX, atual, NOVA_EX);
  assert.equal(m.nome, 'Supino reto (editado pelo coach)'); // editado -> preservado
  assert.equal(m.obs, 'obs que o coach escreveu');          // editado -> preservado
  assert.equal(m.padrao, 'puxar');                            // intocado -> valor novo
  assert.deepEqual(m.musculos, ['Costas']);                   // intocado -> valor novo
  assert.equal(m.nivel, 'avancado');                          // intocado -> valor novo
  assert.equal(m.tempoMedioSeg, 45);                          // intocado -> valor novo
  // não editáveis: sempre da pesquisa nova
  assert.deepEqual(m.equipamentoFaltante, ['Anilha 20kg']);
  assert.deepEqual(m.fontes, ['https://x.com']);
});

test('mesclarProposta não confunde reordenar checkboxes com editar', () => {
  const atual = { ...BASE_EX, musculos: ['Peito'] }; // mesmo conteúdo de BASE_EX.musculos, ordem idêntica
  const m = mesclarProposta(BASE_EX, atual, NOVA_EX);
  assert.deepEqual(m.musculos, ['Costas']); // não foi editado de fato -> pega o novo
});

test('mesclarProposta detecta edição em array (musculos com um item a mais)', () => {
  const atual = { ...BASE_EX, musculos: ['Peito', 'Ombro'] }; // coach marcou um a mais
  const m = mesclarProposta(BASE_EX, atual, NOVA_EX);
  assert.deepEqual(m.musculos.sort(), ['Ombro', 'Peito']); // editado -> preservado (ordem não importa para o teste)
});

const BASE_TEC = { tipo: 'tecnica', nome: 'Drop Set', resumo: 'r', comoExecutar: 'c', objetivo: 'o', fontes: [] };
const NOVA_TEC = { tipo: 'tecnica', nome: 'Drop Set novo', resumo: 'r novo', comoExecutar: 'c novo', objetivo: 'o novo', fontes: ['https://y.com'] };

test('mesclarProposta funciona para técnica com o conjunto reduzido de campos editáveis', () => {
  const atual = { ...BASE_TEC, objetivo: 'objetivo que o coach reescreveu' };
  const m = mesclarProposta(BASE_TEC, atual, NOVA_TEC);
  assert.equal(m.objetivo, 'objetivo que o coach reescreveu');
  assert.equal(m.nome, 'Drop Set novo');
  assert.equal(m.resumo, 'r novo');
  assert.equal(m.comoExecutar, 'c novo');
});

test('mesclarProposta sem base/atual (primeira busca) devolve a proposta nova sem alterações', () => {
  const m = mesclarProposta(null, null, NOVA_EX);
  assert.deepEqual(m, NOVA_EX);
});
