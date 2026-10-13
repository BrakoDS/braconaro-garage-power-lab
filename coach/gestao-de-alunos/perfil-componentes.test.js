// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/perfil-componentes.test.js
 *
 * O fim do fatiamento do perfil: Progresso e Portal em módulo próprio, a troca
 * de painel no ui-perfil.js, a foto do cabeçalho no ui-fotos.js — e o app.js
 * sem nenhuma lógica de aba.
 *
 * A fiação é testada com um DOM de mentira (só o que as abas tocam) e o db.js
 * de verdade sobre um localStorage em memória, instalado ANTES dos imports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/* ---------- um DOM mínimo ---------- */

/** @param {string} sel */
function elemento(sel) {
  const classes = new Set();
  return {
    sel, id: sel.startsWith('#') ? sel.slice(1) : '', desenhos: 0, _html: '', value: '', src: '', textContent: '', dataset: /** @type {Record<string, string>} */ ({}),
    // O <select> de metas nasce com as opções de verdade, como no navegador.
    options: sel === '#meta-tipo' ? ['peso', 'gordura', 'cintura'].map((value) => ({ value })) : [],
    ouvintes: /** @type {Record<string, Function>} */ ({}), recebidas: /** @type {any[]} */ ([]),
    contentWindow: /** @type {any} */ (null),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v; this.desenhos++;
      // Como no DOM de verdade: redesenhar troca os campos de dentro.
      if (sel === '#prog-metas') { delete tela['#meta-tipo']; delete tela['#meta-alvo']; }
    },
    addEventListener(t, f) { this.ouvintes[t] = f; },
    removeAttribute(k) { if (k === 'src') this.src = ''; },
    setAttribute() {},
    querySelector() { return null; },
  };
}
/** @type {Record<string, ReturnType<typeof elemento>>} */
let tela = {};
const el = (s) => (tela[s] ||= elemento(s));
globalThis.document = /** @type {any} */ ({
  querySelector: (s) => el(s),
  querySelectorAll: (s) => (s === '.tab-panel' ? ['geral', 'progresso', 'portal'].map((n) => el('#tab-' + n)) : []),
});
const ouvintesJanela = /** @type {Function[]} */ ([]);
globalThis.window = /** @type {any} */ ({ addEventListener: (t, f) => { if (t === 'message') ouvintesJanela.push(f); } });
globalThis.location = /** @type {any} */ ({ origin: 'http://gestao.test' });

const db = await import('./db.js?v=19');
const { estado, emit, EVENTOS } = await import('./estado.js?v=19');
const { iniciarPerfil } = await import('./ui-perfil.js?v=19');
const { iniciarTabProgresso } = await import('./ui-tab-progresso.js?v=19');
const { iniciarTabPortal, rotuloSemana, mensagemPrevia, URL_PREVIA } = await import('./ui-tab-portal.js?v=19');
const { semanaSegSab, waMsg } = await import('./util/formato.js?v=19');

iniciarPerfil({ obter: db.obter });
iniciarTabProgresso();
iniciarTabPortal({ urlPrevia: '/vitrine/previa-falsa.html' });

/** Abre o perfil como o app.js faz. @param {string} id */
function abrirPerfil(id) {
  estado.alunoAtual = db.obter(id);
  el('#tela-perfil').classList.add('active');
  emit(EVENTOS.PERFIL_ABERTO, id);
  emit(EVENTOS.ABRIR_ABA, 'geral');
}

/* ---------- a troca de aba mora no ui-perfil.js ---------- */

test('perfil: "abrir-aba" mostra só o painel pedido', () => {
  emit(EVENTOS.ABRIR_ABA, 'portal');
  assert.deepEqual(['geral', 'progresso', 'portal'].map((n) => el('#tab-' + n).classList.contains('active')), [false, false, true]);
  emit(EVENTOS.ABRIR_ABA, 'geral');
  assert.deepEqual(['geral', 'progresso', 'portal'].map((n) => el('#tab-' + n).classList.contains('active')), [true, false, false]);
});

/* ---------- Uso do app (era o Progresso) ---------- */

const semAviso = async (fn) => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };

test('uso do app: redesenha a cada abertura, só com adesão e medalhas (metas e gráficos foram para a aba Treino)', async () => {
  await semAviso(async () => {
    db.criar({ id: 'Prog01', nome: 'Paula' });
    abrirPerfil('Prog01');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    const painel = el('#tab-progresso');
    assert.equal(painel.desenhos, 1);
    assert.match(painel.innerHTML, /Adesão aos hábitos[\s\S]*Medalhas do aluno/);
    assert.doesNotMatch(painel.innerHTML, /prog-metas|prog-cargas|prog-nutri|Feedbacks/);
    emit(EVENTOS.ABRIR_ABA, 'geral');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    assert.equal(painel.desenhos, 2);
  });
});

test('uso do app: o que chega pelo merge redesenha a aba aberta; de outro aluno ou com a aba fechada, não', async () => {
  await semAviso(async () => {
    abrirPerfil('Prog01');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    const painel = el('#tab-progresso'), antes = painel.desenhos;
    emit(EVENTOS.REGISTROS_MUDARAM, 'Prog01');
    assert.equal(painel.desenhos, antes + 1);
    emit(EVENTOS.REGISTROS_MUDARAM, 'Outro');
    assert.equal(painel.desenhos, antes + 1, 'evento de outro aluno não redesenha');
    emit(EVENTOS.ABRIR_ABA, 'geral');
    emit(EVENTOS.REGISTROS_MUDARAM, 'Prog01');
    assert.equal(painel.desenhos, antes + 1, 'aba fechada não redesenha');
  });
});

/* ---------- Portal ---------- */

test('portal: o rótulo da semana e a mensagem são a fatia publicada', () => {
  assert.equal(rotuloSemana(0), 'Semana atual');
  assert.equal(rotuloSemana(-2), '2 semana(s) atrás');
  assert.equal(rotuloSemana(1), '1 semana(s) à frente');
  db.criar({ id: 'Port01', nome: 'Rui', email: 'Rui@Box.com' });
  const m = mensagemPrevia(db.obter('Port01'), 0);
  assert.equal(m.tipo, 'portal-previa');
  assert.equal(m.email, 'rui@box.com');
  assert.match(m.hoje, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(m.dados.nome, 'Rui');
  assert.equal(URL_PREVIA, '../../painel-do-aluno/previa.html');
});

test('portal: abre a prévia injetada, espera o "pronto", navega semanas e acompanha a gravação', () => {
  abrirPerfil('Port01');
  const frame = el('#prv-frame');
  frame.contentWindow = { postMessage: (msg, origem) => frame.recebidas.push([msg, origem]) };
  emit(EVENTOS.ABRIR_ABA, 'portal');
  assert.match(frame.src, /^\/vitrine\/previa-falsa\.html\?previa=1&t=\d+$/, 'a vitrine troca a página da prévia');
  assert.equal(frame.recebidas.length, 0, 'nada antes do "pronto"');
  // Mensagem de outra origem é ignorada.
  ouvintesJanela.forEach((f) => f({ origin: 'http://intruso.test', data: { tipo: 'portal-previa-pronto' } }));
  assert.equal(frame.recebidas.length, 0);
  ouvintesJanela.forEach((f) => f({ origin: 'http://gestao.test', data: { tipo: 'portal-previa-pronto' } }));
  assert.equal(frame.recebidas.length, 1);
  assert.deepEqual([frame.recebidas[0][0].email, frame.recebidas[0][1]], ['rui@box.com', 'http://gestao.test']);
  el('#prv-prev').ouvintes.click();
  assert.equal(el('#prv-lbl').textContent, '1 semana(s) atrás');
  el('#prv-hoje').ouvintes.click();
  assert.equal(el('#prv-lbl').textContent, 'Semana atual');
  // Gravou com a prévia aberta: a fatia nova vai na hora.
  db.atualizar('Port01', { nome: 'Rui Alves' });
  emit(EVENTOS.ALUNOS_MUDARAM);
  assert.equal(frame.recebidas.at(-1)[0].dados.nome, 'Rui Alves');
});

test('portal: aluno sem e-mail não tem prévia — e a prévia do anterior não recebe nada', () => {
  db.criar({ id: 'Port02', nome: 'Sem Email' });
  abrirPerfil('Port02');
  const frame = el('#prv-frame'), n = frame.recebidas.length;
  emit(EVENTOS.ABRIR_ABA, 'portal');
  assert.equal(frame.src, '');
  assert.match(el('#prv-lbl').textContent, /sem e-mail não há Portal/);
  emit(EVENTOS.ALUNOS_MUDARAM);
  el('#prv-next').ouvintes.click();
  assert.equal(frame.recebidas.length, n);
});

/* ---------- utilitários que saíram do app.js ---------- */

test('formato: semana Seg–Sáb e link do WhatsApp com mensagem', () => {
  const s = semanaSegSab();
  assert.equal(s.length, 6);
  assert.equal(s[0].getDay(), 1);
  assert.equal(s[5].getDay(), 6);
  assert.equal(waMsg('(14) 99999-0000', 'Oi & tchau'), 'https://api.whatsapp.com/send?phone=5514999990000&text=Oi%20%26%20tchau');
  // Os emojis vão em UTF-8 e voltam inteiros — o wa.me os trocava por "" no redirecionamento.
  const emoji = waMsg('14999990000', 'Olá! ✅ 😊 💪 🏅');
  assert.ok(!emoji.includes('wa.me'), 'nada de wa.me');
  assert.ok(emoji.includes('%E2%9C%85') && emoji.includes('%F0%9F%92%AA'), '✅ e 💪 codificados em UTF-8');
  assert.equal(new URL(emoji).searchParams.get('text'), 'Olá! ✅ 😊 💪 🏅');
  assert.equal(new URL(emoji).searchParams.get('phone'), '5514999990000');
  assert.equal(waMsg('14999990000'), 'https://api.whatsapp.com/send?phone=5514999990000', 'sem texto: só a conversa');
  assert.equal(waMsg('', 'x'), '');
});

/* ---------- nenhuma lógica de aba fora dos módulos ---------- */

test('fatiamento: abrir o perfil é do ui-perfil.js; o boot não sabe de aba nenhuma', async () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const boot = ler('./boot.js');
  for (const resto of ['renderProgresso', 'renderPortalPrevia', 'prvSemana', 'prvEnviar', 'chartSVG', 'renderMetasCoach',
    'carregarMedalhasAluno', 'feedbacksHTML', 'ativarAba', "'.tab-panel'", 'marcarAba', '#prv-', '#tab-',
    'TROCAR_FOTO', 'uploadFoto', 'function semanaSegSab', 'function waMsg', 'ABRIR_ABA', 'abrirPerfil']) {
    assert.ok(!boot.includes(resto), `boot.js tem ${resto}`);
  }
  // Abrir o perfil: o aluno no estado, o cabeçalho, 'perfil-aberto', a aba Dados e a tela — nessa ordem.
  db.criar({ id: 'Abre01', nome: 'Abel' });
  const vistos = [];
  const { on } = await import('./estado.js?v=19');
  const parar = [EVENTOS.PERFIL_ABERTO, EVENTOS.ABRIR_ABA, EVENTOS.ABRIR_TELA].map((ev) => on(ev, (x) => vistos.push([ev, x, estado.alunoAtual?.id])));
  emit(EVENTOS.ABRIR_PERFIL, 'Abre01');
  parar.forEach((p) => p());
  assert.deepEqual(vistos, [['perfil-aberto', 'Abre01', 'Abre01'], ['abrir-aba', 'geral', 'Abre01'], ['abrir-tela', 'perfil', 'Abre01']]);
  assert.match(el('#perfil-cab').innerHTML, /Abel/, 'o cabeçalho já desenhado');
  emit(EVENTOS.ABRIR_PERFIL, 'nao-existe');
  assert.equal(estado.alunoAtual.id, 'Abre01', 'id que não existe não troca a ficha aberta');

  const telas = ler('./telas.js');
  const ordem = ['iniciarNavegacao();', 'iniciarPerfil(', 'iniciarFotoDoPerfil();', 'iniciarTabGeral();', 'iniciarTabSaude();', 'iniciarTabTreino();', 'iniciarTabAvaliacoes();', 'iniciarTabProgresso();',
    "iniciarTabFinanceiro('#tab-geral');", 'iniciarTabPortal(',
    'iniciarTabRegistros();'];
  const pos = ordem.map((f) => telas.indexOf(f));
  assert.ok(pos.every((p) => p >= 0), `telas.js liga tudo: ${ordem.filter((_, i) => pos[i] < 0)}`);
  assert.deepEqual([...pos].sort((x, y) => x - y), pos, 'o roteador e o perfil ligam antes das abas');

  // Cada aba da barra tem um módulo que a desenha.
  const { ABAS } = { ABAS: ['geral', 'saude', 'treino', 'avaliacoes', 'progresso', 'portal', 'registros'] };
  const fontes = ['ui-tab-geral', 'ui-tab-saude', 'ui-tab-treino', 'ui-tab-avaliacoes', 'ui-tab-progresso',
    'ui-tab-portal', 'ui-tab-registros'].map((f) => ler(`./${f}.js`)).join('\n');
  for (const aba of ABAS) assert.ok(fontes.includes(`'${aba}'`), `nenhum módulo desenha a aba ${aba}`);
});

test('perfil: as abas da barra, cada uma com módulo — Geral, Saúde e Treino primeiro; Financeiro, Anamnese, PAR-Q, Matriz e Dados viraram cards', async () => {
  const { ABAS } = await import('./ui-perfil.js?v=19');
  assert.deepEqual(ABAS.map((a) => a.id), ['geral', 'saude', 'treino', 'avaliacoes', 'progresso', 'portal', 'registros']);
});
