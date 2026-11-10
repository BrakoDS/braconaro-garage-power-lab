// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/fatiamento-final.test.js
 *
 * O fim do fatiamento do app.js: o modal de novo aluno, os selos da
 * lista, o medidor/backup e o boot em módulo próprio — e o app.js, que não
 * existe mais.
 *
 * DOM de mentira (só o que essas telas tocam) e o db.js de verdade sobre um
 * localStorage em memória, instalado ANTES dos imports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});
/** @param {string} sel */
function elemento(sel) {
  const classes = new Set();
  return {
    sel, innerHTML: '', textContent: '', value: '', ouvintes: /** @type {Record<string, Function>} */ ({}),
    addEventListener(t, f) { this.ouvintes[t] = f; }, querySelector: () => null,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
  };
}
/** @type {Record<string, any>} */ const tela = {};
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({ querySelector: (s) => el(s), querySelectorAll: () => [] });
// O boot importa o login do Firebase, que pendura um helper em `window` ao carregar.
globalThis.window = /** @type {any} */ ({});

const db = await import('./db.js?v=31');
const { estado, on, emit, EVENTOS } = await import('./estado.js?v=31');
const eventos = await import('./eventos.js?v=31');
const { kcalDaSemana, medalhasPorAluno } = await import('./selos-lista.js?v=31');
const { iniciarModalAluno } = await import('./ui-modal-aluno.js?v=31');
const { medidaDoBanco, TETO_FIRESTORE } = await import('./medidor-banco.js?v=31');
const { msgAuth } = await import('./boot.js?v=31');
const { medalhasDaFicha } = await import('../../compartilhado/regras/gamificacao.js?v=31');
const { mesIdAtual } = await import('./financeiro-aluno.js?v=31');

/* ---------- selos da lista ---------- */

test('selos: kcal da semana por e-mail — só dentro da semana, vírgula aceita, zero fica de fora', () => {
  const gastos = new Map([
    ['ana@x.com', [{ data: '2026-10-05', calorias: '450,5' }, { data: '2026-10-10', calorias: 300 }, { data: '2026-10-11', calorias: 999 }]],
    ['bia@x.com', [{ data: '2026-09-30', calorias: 500 }]],
    ['caio@x.com', [{ data: '2026-10-06', calorias: 'x' }]],
  ]);
  assert.deepEqual([...kcalDaSemana(gastos, '2026-10-05', '2026-10-10')], [['ana@x.com', 750.5]]);
});

test('selos: medalhas por aluno são a mesma conta da aba Progresso (medalhasDaFicha)', () => {
  const ana = { id: 'Ana', email: ' ANA@x.com ', presencas: ['2026-10-01', '2026-10-02'], avaliacoes: [{ dataRealizada: '2026-09-01' }], feedbacks: [{}] };
  const semEmail = { id: 'Nil', presencas: ['2026-10-01'] };
  const nada = { id: 'Zero' };
  const gastos = new Map([['ana@x.com', [{ data: '2026-10-03', calorias: 600 }]]]);
  const concl = new Map([['ana@x.com', [{ categoria: 'agua' }]]]);
  const mm = medalhasPorAluno([ana, semEmail, nada], gastos, concl, []);
  const conta = (a, g, c) => medalhasDaFicha(a, { gastos: g, conclusoes: c, pausadas: [] }).filter((m) => m.ok).length;
  assert.equal(mm.get('Ana'), conta(ana, gastos.get('ana@x.com'), concl.get('ana@x.com')), 'e-mail normalizado (espaço e maiúscula)');
  assert.equal(mm.get('Nil'), conta(semEmail, [], []) || undefined);
  assert.ok(!mm.has('Zero'), 'sem medalha, sem selo');
});

/* ---------- modal de novo aluno ---------- */

test('novo aluno: sem nome avisa; ID repetido avisa; cadastrado registra e abre o perfil pelo barramento', () => {
  const avisos = [];
  iniciarModalAluno({ avisar: (o) => avisos.push(o.texto) });
  const form = (campos) => ({ preventDefault() {}, target: { campos } });
  // O FormData lê os campos "digitados" no formulário de mentira.
  globalThis.FormData = /** @type {any} */ (class { constructor(f) { this.m = f.campos; } entries() { return Object.entries(this.m); } get(k) { return this.m[k] ?? null; } getAll(k) { return [].concat(this.m[k] ?? []); } });
  el('#form-novo').ouvintes.submit(form({ nome: '  ' }));
  assert.deepEqual(avisos, ['Informe o nome do aluno.']);
  const abertos = [];
  const parar = on(EVENTOS.ABRIR_PERFIL, (id) => abertos.push(id));
  el('#modal-aluno').classList.add('open');
  el('#form-novo').ouvintes.submit(form({ id: 'Novo01', nome: 'Nina Nova' }));
  assert.equal(db.obter('Novo01')?.nome, 'Nina Nova');
  assert.deepEqual(abertos, ['Novo01'], 'o perfil abre pelo barramento, como o clique num card');
  assert.ok(!el('#modal-aluno').classList.contains('open'), 'o modal fecha');
  assert.ok(eventos.pendentes().some((e) => e.tipo === 'aluno-criado' && e.alunoId === 'Novo01'), 'fica na aba Registros');
  el('#form-novo').ouvintes.submit(form({ id: 'Novo01', nome: 'Outra' }));
  assert.equal(avisos.at(-1), 'Já existe um aluno com esse ID. Escolha outro.');
  assert.deepEqual(abertos, ['Novo01'], 'ID repetido não abre nada');
  parar();
});

/* ---------- medidor e boot ---------- */

test('medidor: bytes como o Firestore conta (UTF-8), a maior ficha sem avaliações e o sinal do teto', () => {
  const m = medidaDoBanco({ alunos: [{ id: 'a', nome: 'José', avaliacoes: [{ x: 'y'.repeat(5000) }] }, { id: 'b', nome: 'B' }] });
  assert.equal(m.alunos, 2);
  assert.equal(m.avaliacoes, 1);
  assert.equal(m.maior, new TextEncoder().encode(JSON.stringify({ id: 'a', nome: 'José' })).length, 'acento conta 2 bytes; avaliações fora');
  assert.equal(m.sinal, '🟢');
  assert.equal(medidaDoBanco({ alunos: [{ id: 'g', obs: 'x'.repeat(Math.ceil(TETO_FIRESTORE * 0.85)) }] }).sinal, '🔴');
  assert.deepEqual([medidaDoBanco(null).alunos, medidaDoBanco(null).total], [0, new TextEncoder().encode('{"alunos":[]}').length], 'banco vazio: { alunos: [] }');
});

test('login: o erro na língua do coach; código desconhecido aparece', () => {
  assert.equal(msgAuth({ code: 'auth/invalid-credential' }), 'E-mail ou senha incorretos.');
  assert.equal(msgAuth({ code: 'auth/qualquer' }), 'Erro ao entrar (auth/qualquer).');
  assert.equal(msgAuth(null), 'Erro ao entrar (desconhecido).');
});

/* ---------- a arquitetura final ---------- */

test('fatiamento: o app.js não existe; main.js liga as telas e depois o boot', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.ok(!existsSync(new URL('./app.js', import.meta.url)), 'o app.js foi apagado');
  const main = ler('./main.js');
  const codigo = main.split('\n').filter((l) => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l));
  assert.ok(codigo.length <= 6, `main.js é só a entrada (${codigo.length} linhas de código)`);
  assert.ok(main.indexOf('iniciarTelas(') < main.indexOf('iniciarBoot('), 'as telas ligam antes do boot (a sessão aberta entra direto)');
  const index = ler('./index.html');
  assert.ok(!/app\.js/.test(index) && /src="\.\/main\.js\?v=\d+"/.test(index), 'o index.html carrega só o main.js');
  // O boot não desenha tela nenhuma: só portão, sync, publicação e selos.
  const boot = ler('./boot.js');
  for (const resto of ['innerHTML', 'ABRIR_TELA', 'ABRIR_ABA', 'renderAgenda', 'formDadosHTML', 'kcalDaSemana', 'medalhasDaFicha', 'blobDoBanco']) {
    assert.ok(!boot.includes(resto), `boot.js tem ${resto}`);
  }
  assert.match(boot, /db\.aoGravar\(\(\) => \{ agendarPublicarPortal\(\); emit\(EVENTOS\.ALUNOS_MUDARAM\); \}\);/, 'a gravação publica o Portal num lugar só');
  // Toda tela do index.html tem quem a ligue em telas.js.
  const telas = ler('./telas.js');
  for (const [, t] of index.matchAll(/<section id="tela-([\w-]+)" class="screen/g)) {
    const modulo = { lista: 'iniciarLista(', perfil: 'iniciarPerfil(', aviso: 'iniciarTelaAvisos(' }[t] || `iniciarTela${t[0].toUpperCase()}${t.slice(1)}(`;
    assert.ok(telas.includes(modulo), `a tela ${t} não está ligada em telas.js (${modulo})`);
  }
});
