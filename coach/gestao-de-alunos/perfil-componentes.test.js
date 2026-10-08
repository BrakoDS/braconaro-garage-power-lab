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
  querySelectorAll: (s) => (s === '.tab-panel' ? ['dados', 'progresso', 'portal'].map((n) => el('#tab-' + n)) : []),
});
const ouvintesJanela = /** @type {Function[]} */ ([]);
globalThis.window = /** @type {any} */ ({ addEventListener: (t, f) => { if (t === 'message') ouvintesJanela.push(f); } });
globalThis.location = /** @type {any} */ ({ origin: 'http://gestao.test' });

const db = await import('./db.js');
const { estado, emit, EVENTOS } = await import('./estado.js');
const { iniciarPerfil } = await import('./ui-perfil.js');
const { iniciarTabProgresso } = await import('./ui-tab-progresso.js');
const { iniciarTabPortal, rotuloSemana, mensagemPrevia, URL_PREVIA } = await import('./ui-tab-portal.js');
const { semanaSegSab, waMsg } = await import('./util/formato.js');

iniciarPerfil({ obter: db.obter });
iniciarTabProgresso();
iniciarTabPortal({ urlPrevia: '/vitrine/previa-falsa.html' });

/** Abre o perfil como o app.js faz. @param {string} id */
function abrirPerfil(id) {
  estado.alunoAtual = db.obter(id);
  el('#tela-perfil').classList.add('active');
  emit(EVENTOS.PERFIL_ABERTO, id);
  emit(EVENTOS.ABRIR_ABA, 'dados');
}

/* ---------- a troca de aba mora no ui-perfil.js ---------- */

test('perfil: "abrir-aba" mostra só o painel pedido', () => {
  emit(EVENTOS.ABRIR_ABA, 'portal');
  assert.deepEqual(['dados', 'progresso', 'portal'].map((n) => el('#tab-' + n).classList.contains('active')), [false, false, true]);
  emit(EVENTOS.ABRIR_ABA, 'dados');
  assert.deepEqual(['dados', 'progresso', 'portal'].map((n) => el('#tab-' + n).classList.contains('active')), [true, false, false]);
});

/* ---------- Progresso ---------- */

const semAviso = async (fn) => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };

test('progresso: redesenha a cada abertura, com a avaliação lançada em outra aba', async () => {
  await semAviso(async () => {
    db.criar({ id: 'Prog01', nome: 'Paula' });
    db.addAvaliacao('Prog01', { dataRealizada: '2026-01-10', peso: '80' });
    abrirPerfil('Prog01');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    const painel = el('#tab-progresso');
    assert.equal(painel.desenhos, 1);
    assert.match(painel.innerHTML, /Cadastre ao menos 2 avaliações/);
    // Lançou a segunda avaliação na aba Avaliações e voltou.
    emit(EVENTOS.ABRIR_ABA, 'avaliacoes');
    db.addAvaliacao('Prog01', { dataRealizada: '2026-04-10', peso: '76' });
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    assert.equal(painel.desenhos, 2);
    assert.match(painel.innerHTML, /Peso: −4,0 kg/, 'a evolução já entra no gráfico');
  });
});

test('progresso: a meta digitada sobrevive à troca de aba, mas não passa para outro aluno', async () => {
  await semAviso(async () => {
    abrirPerfil('Prog01');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    const desenhos = el('#tab-progresso').desenhos;
    // O coach escolhe o tipo e digita o alvo, sem salvar, e vai para outra aba.
    el('#meta-tipo').value = 'cintura';
    el('#meta-alvo').value = '72';
    emit(EVENTOS.ABRIR_ABA, 'financeiro');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    assert.equal(el('#tab-progresso').desenhos, desenhos + 1, 'redesenhou');
    assert.deepEqual([el('#meta-tipo').value, el('#meta-alvo').value], ['cintura', '72'], 'o rascunho volta aos campos redesenhados');
    // Fechou e reabriu o perfil do mesmo aluno: começa limpo, como nas outras abas.
    abrirPerfil('Prog01');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    assert.deepEqual([el('#meta-tipo').value, el('#meta-alvo').value], ['', '']);
    // Outro aluno: o rascunho fica para trás.
    el('#meta-alvo').value = '65';
    db.criar({ id: 'Prog02', nome: 'Pedro' });
    abrirPerfil('Prog02');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    assert.equal(el('#meta-alvo').value, '');
  });
});

test('progresso: feedback que chega pelo merge aparece na aba aberta', async () => {
  await semAviso(async () => {
    abrirPerfil('Prog01');
    emit(EVENTOS.ABRIR_ABA, 'progresso');
    const painel = el('#tab-progresso'), antes = painel.desenhos;
    db.atualizar('Prog01', { feedbacks: [{ id: 'f1', data: '2026-10-06', esforco: 8, dor: 'leve', obs: 'pesado', criadoEm: 1 }] });
    emit(EVENTOS.REGISTROS_MUDARAM, 'Prog01');
    assert.equal(painel.desenhos, antes + 1);
    assert.match(painel.innerHTML, /Esforço <b>8<\/b>\/10/);
    emit(EVENTOS.REGISTROS_MUDARAM, 'Outro');
    assert.equal(painel.desenhos, antes + 1, 'evento de outro aluno não redesenha');
    emit(EVENTOS.ABRIR_ABA, 'dados');
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
  assert.equal(waMsg('(14) 99999-0000', 'Oi & tchau'), 'https://wa.me/5514999990000?text=Oi%20%26%20tchau');
  assert.equal(waMsg('', 'x'), '');
});

/* ---------- o app.js sem aba nenhuma ---------- */

test('fatiamento: o app.js só abre o perfil — nenhuma lógica de aba', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const app = ler('./app.js');
  for (const resto of ['renderProgresso', 'renderPortalPrevia', 'prvSemana', 'prvEnviar', 'chartSVG', 'renderMetasCoach',
    'carregarMedalhasAluno', 'feedbacksHTML', 'ativarAba', "'.tab-panel'", 'marcarAba', '#prv-', '#tab-',
    'TROCAR_FOTO', 'uploadFoto', 'function semanaSegSab', 'function waMsg']) {
    assert.ok(!app.includes(resto), `app.js ainda tem ${resto}`);
  }
  // O que sobra do perfil é o roteador: aluno no estado, cabeçalho, e os dois avisos.
  const perfil = app.slice(app.indexOf('function abrirPerfil'), app.indexOf('function abrirPerfil') + 700);
  assert.match(perfil, /emit\(EVENTOS\.PERFIL_ABERTO, a\.id\);\s*emit\(EVENTOS\.ABRIR_ABA, 'dados'\);/);
  assert.equal((app.match(/EVENTOS\.ABRIR_ABA/g) || []).length, 1, 'o app só emite abrir-aba ao abrir o perfil; não ouve');

  const main = ler('./main.js');
  const ordem = ['iniciarPerfil(', 'iniciarFotoDoPerfil();', 'iniciarTabDados();', 'iniciarTabAvaliacoes();', 'iniciarTabProgresso();',
    'iniciarTabAnamnese();', 'iniciarTabParq();', 'iniciarTabFinanceiro();', 'iniciarTabMatriz();', 'iniciarTabPortal();',
    'iniciarTabRegistros();', "await import('./app.js')"];
  const pos = ordem.map((f) => main.indexOf(f));
  assert.ok(pos.every((p) => p >= 0), `main.js liga tudo: ${ordem.filter((_, i) => pos[i] < 0)}`);
  assert.deepEqual([...pos].sort((x, y) => x - y), pos, 'o perfil liga antes das abas, e as abas antes do app');

  // Cada aba da barra tem um módulo que a desenha.
  const { ABAS } = { ABAS: ['dados', 'anamnese', 'parq', 'avaliacoes', 'progresso', 'matriz', 'financeiro', 'portal', 'registros'] };
  const fontes = ['ui-tab-dados', 'ui-tab-anamnese', 'ui-tab-par-q', 'ui-tab-avaliacoes', 'ui-tab-progresso', 'ui-tab-matriz',
    'ui-tab-financeiro', 'ui-tab-portal', 'ui-tab-registros'].map((f) => ler(`./${f}.js`)).join('\n');
  for (const aba of ABAS) assert.ok(fontes.includes(`'${aba}'`), `nenhum módulo desenha a aba ${aba}`);
});

test('perfil: as abas da barra são as nove com módulo', async () => {
  const { ABAS } = await import('./ui-perfil.js');
  assert.deepEqual(ABAS.map((a) => a.id), ['dados', 'anamnese', 'parq', 'avaliacoes', 'progresso', 'matriz', 'financeiro', 'portal', 'registros']);
});
