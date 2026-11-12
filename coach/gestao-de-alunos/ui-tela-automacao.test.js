// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-tela-automacao.test.js
 *
 * O motor ligado de verdade: o db.js real (sobre um localStorage em memória),
 * o barramento, o roteador, o log da aba Registros, o motor (automacao.js) e a
 * Fila de mensagens (ui-tela-automacao.js). Só o DOM é de mentira, e o que
 * falaria com o mundo de fora (abrir o WhatsApp, a nuvem) entra por parâmetro.
 *
 * Os testes rodam em sequência sobre o MESMO box — cada um parte de onde o
 * anterior deixou, como o coach usando a tela.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
});

/* ---------- DOM de mentira ---------- */
/** @param {string} sel */
function elemento(sel) {
  return {
    sel, innerHTML: '', textContent: '', filhos: /** @type {any[]} */ ([]), ouvintes: /** @type {Record<string, Function>} */ ({}),
    addEventListener(t, f) { this.ouvintes[t] = f; },
    querySelector(q) { return q === '.btn-badge' ? this.filhos.find((f) => f.className === 'btn-badge') || null : null; },
    appendChild(f) { this.filhos.push(f); f.pai = this; },
  };
}
/** @type {Record<string, any>} */ const tela = {};
const el = (s) => (tela[s] ||= elemento(s));
const docOuvintes = /** @type {Record<string, Function>} */ ({});
globalThis.document = /** @type {any} */ ({
  querySelector: (s) => el(s), querySelectorAll: () => [],
  addEventListener: (t, f) => { docOuvintes[t] = f; },
  createElement: () => ({ className: '', textContent: '', title: '', remove() { this.pai.filhos = this.pai.filhos.filter((x) => x !== this); } }),
});
globalThis.window = /** @type {any} */ ({ scrollTo() {} });

const db = await import('./db.js?v=40');
const eventos = await import('./eventos.js?v=40');
const { estado, on, emit, EVENTOS } = await import('./estado.js?v=40');
const { iniciarNavegacao } = await import('./navegacao.js?v=40');
const { iniciarAutomacao, mensagens, sincronizarAutomacao } = await import('./automacao.js?v=40');
const { iniciarTelaAutomacao } = await import('./ui-tela-automacao.js?v=40');
const { darBaixa, desfazerBaixa } = await import('./financeiro-regras.js?v=40');
const { regFinanceiro } = await import('./registro.js?v=40');
const { itensDoDia } = await import('./rotinas-regras.js?v=40');

/* ---------- o que vem de fora ---------- */
const OUT = '2026-10';
let HOJE = '2026-10-05';
let AGORA = Date.UTC(2026, 9, 5, 12);
const abertos = /** @type {string[]} */ ([]);
const nuvem = { feitas: /** @type {Record<string, any>} */ ({}), chamadas: /** @type {any[]} */ ([]), falha: false };
const depsMotor = {
  hoje: () => HOJE, agora: () => AGORA,
  // A lista da rotina das 7h (etapa 8), como o servidor gravaria hoje sobre as fichas.
  rotinas: () => [{ dia: HOJE, itens: itensDoDia(db.listar(), HOJE, {}) }], fechamentos: () => ({}),
  nuvem: {
    ler: async (/** @type {string} */ uid) => { nuvem.chamadas.push(['ler', uid]); if (nuvem.falha) throw new Error('rede'); return { ...nuvem.feitas }; },
    gravar: async (/** @type {string} */ uid, /** @type {any} */ f) => { nuvem.chamadas.push(['gravar', uid, Object.keys(f)]); if (nuvem.falha) throw new Error('rede'); Object.assign(nuvem.feitas, f); },
    apagar: async (/** @type {string} */ uid, /** @type {string[]} */ ks) => { nuvem.chamadas.push(['apagar', uid, ks]); for (const k of ks) delete nuvem.feitas[k]; },
  },
};
iniciarNavegacao();
iniciarAutomacao(depsMotor);
iniciarTelaAutomacao({ abrir: (url) => { abertos.push(url); } });
db.aoGravar(() => emit(EVENTOS.ALUNOS_MUDARAM)); // como o boot: gravar avisa as telas

/** Um clique num botão da fila, como o navegador entrega. @param {string} classe @param {string} chave */
const clicar = (classe, chave) => {
  const btn = { dataset: { chave }, classList: { contains: (c) => c === classe } };
  el('#auto-list').ouvintes.click({ target: { closest: (s) => (s === '[data-chave]' ? btn : null) } });
};
const selo = () => el('#btn-automacao').filhos.find((f) => f.className === 'btn-badge')?.textContent ?? null;
const cartoes = () => [...el('#auto-list').innerHTML.matchAll(/class="btn ghost btn-sm auto-descartar" data-chave="([^"]+)"/g)].map((m) => m[1]);
const logs = () => eventos.pendentes();
/** A baixa como as telas fazem: a regra, a gravação e o log. @param {string} id */
const baixa = (id) => { const a = db.obter(id); const r = darBaixa(a, OUT, db.listar(), { meio: 'pix-chave', data: '2026-10-08', em: 1 }); assert.ok(r); db.atualizar(id, r.patch); if (r.log) regFinanceiro(a, r.log); };

// O box, no dia 5: Ana vence hoje; Gil venceu ontem e não tem telefone; Edu vence no 10 (o meio do caminho é hoje); Duda é cortesia.
db.criar({ id: 'Ana01', nome: 'Ana Lima', telefone: '(14) 99999-0000', mensalidade: '150', vencimento: '5' });
db.criar({ id: 'Gil02', nome: 'Gil Neto', mensalidade: '100', vencimento: '4' });
db.criar({ id: 'Edu03', nome: 'Edu Prado', telefone: '14955554444', mensalidade: '200', vencimento: '10' });
db.criar({ id: 'Duda04', nome: 'Duda Reis', telefone: '14966665555', mensalidade: '150', vencimento: '5', parceria: { nome: 'Atleta', percentual: 100 } });

/* ---------- a) a régua da rotina entra sozinha ---------- */

test('a) a régua: o meio do caminho, o vence hoje e o venceu ontem entram sem ninguém pedir, com o selo, o texto pronto e o "sem telefone"', () => {
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.equal(selo(), '3', 'selo no botão da lista, sem abrir a tela');
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  assert.deepEqual(cartoes(), ['regua-meio:Edu03:2026-10', 'regua-vencimento:Ana01:2026-10', 'regua-pos:Gil02:2026-10'],
    'na ordem da régua');
  const html = el('#auto-list').innerHTML;
  assert.match(html, /Meio do caminho até o vencimento[\s\S]*Vencimento hoje[\s\S]*Venceu ontem/);
  assert.match(html, /Ana Lima[\s\S]*Outubro \/ 2026/);
  assert.match(html, /Olá, Ana! 😊 Hoje é o dia do vencimento da sua conta de outubro/);
  assert.match(html, /auto-enviar" data-chave="regua-vencimento:Ana01:2026-10"/);
  assert.ok(!/auto-enviar" data-chave="regua-pos:Gil02/.test(html), 'Gil sem telefone: sem botão de enviar');
  assert.match(html, /sem telefone na ficha/);
  assert.ok(!/Duda/.test(html), 'cortesia fica de fora');
});

test('o meio do caminho: "vence dia X", no dia 5 para quem vence no 10; descartado, não volta', () => {
  const html = el('#auto-list').innerHTML;
  assert.match(html, /auto-row auto-regua-meio[\s\S]*Edu Prado[\s\S]*Outubro \/ 2026[\s\S]*Lembrete do meio/);
  assert.match(html, /Olá, Edu! 😊 Passando pra lembrar da sua conta de outubro \(R\$\s200,00\), que vence dia 10\. Pra facilitar/);
  const antes = logs().length;
  clicar('auto-descartar', 'regua-meio:Edu03:2026-10');
  // Etapa 5: o descarte deixa o rastro — a rotina propôs, o coach recusou.
  const novos = logs().slice(antes);
  assert.equal(novos.length, 1);
  assert.equal(novos[0].tipo, 'mensagem-descartada');
  assert.equal(novos[0].situacao, 'recusada');
  assert.deepEqual([novos[0].proposta.por, novos[0].proposta.via, novos[0].aprovacao.por, novos[0].aprovacao.decisao], [{ tipo: 'rotina' }, 'fila', { tipo: 'coach' }, 'recusada']);
  clicar('auto-descartar', 'regua-meio:Edu03:2026-10');
  assert.equal(logs().length, antes + 1, 'o segundo toque não registra de novo');
  assert.deepEqual(cartoes(), ['regua-vencimento:Ana01:2026-10', 'regua-pos:Gil02:2026-10']);
  assert.equal(selo(), '2');
});

test('a) a fila acompanha a ficha: telefone novo no Gil vale na hora, e o botão aparece', () => {
  db.atualizar('Gil02', { telefone: '14911112222' });
  assert.match(el('#auto-list').innerHTML, /auto-enviar" data-chave="regua-pos:Gil02:2026-10"/, 'redesenhou com a tela aberta');
});

/* ---------- b) Enviar ---------- */

test('b) Enviar: abre o WhatsApp com o texto, registra "mensagem-enviada" na ficha e some da fila — uma vez só', () => {
  const avisos = /** @type {string[]} */ ([]);
  const parar = on(EVENTOS.REGISTROS_MUDARAM, (id) => avisos.push(id));
  const antes = logs().length;
  clicar('auto-enviar', 'regua-vencimento:Ana01:2026-10');
  clicar('auto-enviar', 'regua-vencimento:Ana01:2026-10'); // o duplo toque
  parar();
  assert.equal(abertos.length, 1, 'um WhatsApp só');
  const url = new URL(abertos[0]);
  assert.equal(url.origin + url.pathname, 'https://api.whatsapp.com/send');
  assert.equal(url.searchParams.get('phone'), '5514999990000');
  assert.match(url.searchParams.get('text') || '', /^Olá, Ana! 😊 Hoje é o dia do vencimento da sua conta de outubro \(R\$\s150,00\)/);
  const novos = logs().slice(antes);
  assert.equal(novos.length, 1, 'um registro só');
  assert.deepEqual([novos[0].tipo, novos[0].alunoId, novos[0].alunoNome, novos[0].origem, novos[0].chave],
    ['mensagem-enviada', 'Ana01', 'Ana Lima', 'gestao', 'mensagem:regua-vencimento:Ana01:2026-10']);
  assert.match(novos[0].resumo, /^WhatsApp · Vence hoje · Outubro \/ 2026$/);
  assert.deepEqual(avisos, ['Ana01'], 'a aba Registros aberta mostra a linha na hora');
  assert.deepEqual(cartoes(), ['regua-pos:Gil02:2026-10']);
  assert.equal(selo(), '1');
});

test('b) a enviada não volta: nem com a ficha mudando', () => {
  db.atualizar('Ana01', { objetivo: 'Força' });
  assert.ok(!mensagens().some((m) => m.alunoId === 'Ana01'));
});

/* ---------- c) Descartar ---------- */

test('c) Descartar: some da fila e do selo, sem abrir WhatsApp e sem registrar envio (só o descarte, etapa 5)', () => {
  const antes = logs().length;
  clicar('auto-descartar', 'regua-pos:Gil02:2026-10');
  assert.equal(abertos.length, 1, 'nada aberto');
  assert.deepEqual(logs().slice(antes).map((e) => e.tipo), ['mensagem-descartada'], 'nenhum envio registrado; só o descarte');
  assert.deepEqual(cartoes(), []);
  assert.match(el('#auto-list').innerHTML, /Nenhuma mensagem na fila/);
  assert.equal(selo(), null, 'fila vazia: sem selo');
});

/* ---------- o recibo (ação) ---------- */

test('recibo: a baixa (o mesmo caminho das telas) põe o recibo na fila; desfazer a baixa tira', () => {
  baixa('Edu03');
  assert.deepEqual(cartoes(), ['recibo:Edu03:2026-10']);
  assert.match(el('#auto-list').innerHTML, /Recibos de pagamento[\s\S]*Edu Prado[\s\S]*R\$\s200,00 · Outubro \/ 2026/);
  assert.match(el('#auto-list').innerHTML, /Recebi o pagamento da mensalidade de Outubro \(R\$\s200,00\)/);
  assert.equal(selo(), '1');
  const a = db.obter('Edu03'); const r = desfazerBaixa(a, OUT, 'teste'); assert.ok(r);
  db.atualizar('Edu03', r.patch); if (r.log) regFinanceiro(a, r.log);
  assert.deepEqual(cartoes(), []);
  assert.equal(selo(), null);
});

test('recibo: a baixa de quem estava na régua troca a mensagem pelo recibo; cortesia não gera recibo', () => {
  db.criar({ id: 'Bia05', nome: 'Bia Souza', telefone: '14988887777', mensalidade: '120', vencimento: '5' });
  assert.deepEqual(cartoes(), ['regua-vencimento:Bia05:2026-10']);
  baixa('Bia05');
  baixa('Duda04');
  assert.deepEqual(cartoes(), ['recibo:Bia05:2026-10']);
});

test('c) descartar o recibo e refazer a baixa do mês não traz outro recibo', () => {
  clicar('auto-descartar', 'recibo:Bia05:2026-10');
  const a = db.obter('Bia05'); const r = desfazerBaixa(a, OUT, 'teste'); assert.ok(r);
  db.atualizar('Bia05', r.patch); regFinanceiro(a, r.log);
  // Desfeita a baixa, a Bia volta a dever: o "vence hoje" volta (outra chave) — o recibo não.
  assert.deepEqual(cartoes(), ['regua-vencimento:Bia05:2026-10']);
  baixa('Bia05');
  assert.deepEqual(cartoes(), []);
});

/* ---------- d) o selo ---------- */

test('d) selo: acompanha a fila em qualquer tela — sobe com a ação, some com o envio', () => {
  emit(EVENTOS.ABRIR_TELA, 'lista');
  baixa('Edu03');
  assert.equal(selo(), '1', 'a baixa feita em outra tela já conta');
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  clicar('auto-enviar', 'recibo:Edu03:2026-10');
  assert.equal(selo(), null);
  assert.equal(abertos.length, 2);
  assert.match(decodeURIComponent(abertos[1]), /^https:\/\/api\.whatsapp\.com\/send\?phone=5514955554444&text=Olá, Edu! ✅ Recebi o pagamento/);
});

/* ---------- guardado neste aparelho ---------- */

test('recarregar: a fila e as marcas ficam no aparelho — reabrir não traz de volta o que foi feito', () => {
  baixa('Ana01');
  const antes = mensagens().map((m) => m.chave);
  assert.deepEqual(antes, ['recibo:Ana01:2026-10']);
  iniciarAutomacao(depsMotor); // relê do armazenamento
  assert.deepEqual(mensagens().map((m) => m.chave), antes);
  // Armazenamento com lixo: não quebra, e a fila recomeça vazia. As marcas
  // moravam ali — o "venceu ontem" descartado do Gil volta (é a nuvem que protege
  // contra isso: ver o teste da nuvem) e o recibo esperando se perde.
  const guardado = memoria.get('braconaro_automacao_v1');
  memoria.set('braconaro_automacao_v1', '{lixo');
  try {
    iniciarAutomacao(depsMotor);
    assert.deepEqual(mensagens().map((m) => m.chave), ['regua-pos:Gil02:2026-10']);
  } finally {
    memoria.set('braconaro_automacao_v1', guardado);
    iniciarAutomacao(depsMotor);
  }
  assert.deepEqual(mensagens().map((m) => m.chave), antes);
});

test('recarregar: o recibo esquecido por mais de 7 dias sai da fila', () => {
  AGORA += 8 * 86400000;
  iniciarAutomacao(depsMotor);
  assert.deepEqual(mensagens(), []);
});

/* ---------- a nuvem (de mentira) ---------- */

test('nuvem: a marca sobe sozinha; o que outro aparelho enviou some daqui; o que ficou sem rede sobe no sync', async () => {
  estado.uid = 'coach1';
  try {
    db.criar({ id: 'Caio06', nome: 'Caio Leme', telefone: '14977776666', mensalidade: '90', vencimento: '5' });
    db.criar({ id: 'Rui07', nome: 'Rui Paz', telefone: '14933332222', mensalidade: '90', vencimento: '5' });
    assert.deepEqual(mensagens().map((m) => m.chave), ['regua-vencimento:Caio06:2026-10', 'regua-vencimento:Rui07:2026-10']);
    // Marca aqui: sobe só a chave e o status.
    emit(EVENTOS.ABRIR_TELA, 'automacao');
    clicar('auto-descartar', 'regua-vencimento:Caio06:2026-10');
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(nuvem.chamadas.at(-1), ['gravar', 'coach1', ['regua-vencimento:Caio06:2026-10']]);
    assert.deepEqual(nuvem.feitas['regua-vencimento:Caio06:2026-10'], { status: 'descartada', em: AGORA });
    // Outro aparelho enviou a do Rui; e uma marca velha passou do prazo.
    nuvem.feitas['regua-vencimento:Rui07:2026-10'] = { status: 'enviada', em: AGORA - 1000 };
    nuvem.feitas['regua-vencimento:Rui07:2026-05'] = { status: 'enviada', em: AGORA - 200 * 86400000 };
    await sincronizarAutomacao('coach1');
    assert.deepEqual(cartoes(), [], 'a do Rui saiu daqui, e a tela redesenhou');
    assert.ok(!('regua-vencimento:Rui07:2026-05' in nuvem.feitas), 'a velha foi apagada lá');
    // Sem rede: a marca fica aqui e sobe no próximo sync.
    nuvem.falha = true;
    db.criar({ id: 'Tom08', nome: 'Tom Sá', telefone: '14922221111', mensalidade: '90', vencimento: '5' });
    clicar('auto-descartar', 'regua-vencimento:Tom08:2026-10');
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(!('regua-vencimento:Tom08:2026-10' in nuvem.feitas));
    await sincronizarAutomacao('coach1'); // falha calada
    nuvem.falha = false;
    await sincronizarAutomacao('coach1');
    assert.equal(nuvem.feitas['regua-vencimento:Tom08:2026-10']?.status, 'descartada');
    assert.deepEqual(mensagens(), []);
  } finally {
    estado.uid = null;
  }
});

test('sem login (a vitrine, o modo local): nenhuma chamada à nuvem', () => {
  const n = nuvem.chamadas.length;
  db.criar({ id: 'Lia09', nome: 'Lia Mota', telefone: '14900001111', mensalidade: '90', vencimento: '5' });
  clicar('auto-descartar', 'regua-vencimento:Lia09:2026-10');
  assert.equal(nuvem.chamadas.length, n);
});

test('Enviar num cartão velho sem telefone (o botão nem existe, mas o clique chega): nada abre, nada registra, a mensagem fica', () => {
  db.criar({ id: 'Ze10', nome: 'Zé Sem Fone', mensalidade: '90', vencimento: '5' });
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  const n = abertos.length, l = logs().length;
  clicar('auto-enviar', 'regua-vencimento:Ze10:2026-10');
  assert.deepEqual([abertos.length, logs().length], [n, l]);
  assert.deepEqual(cartoes(), ['regua-vencimento:Ze10:2026-10']);
  clicar('auto-descartar', 'regua-vencimento:Ze10:2026-10');
});

test('d) selo: a virada do dia conta sem nenhum dado mudar — voltar para a lista refaz o selo', () => {
  HOJE = '2026-10-09'; // os outros já passaram do vencimento + 1: viraram pendência, sem mensagem
  db.criar({ id: 'Val11', nome: 'Val Dias', telefone: '14900002222', mensalidade: '90', vencimento: '9' });
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.deepEqual(mensagens().map((m) => m.chave), ['regua-vencimento:Val11:2026-10'], 'vence hoje');
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  clicar('auto-descartar', 'regua-vencimento:Val11:2026-10'); // o coach dispensa
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.equal(selo(), null);
  HOJE = '2026-10-10';
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.equal(selo(), '1', 'meia-noite passou: venceu ontem — é outra mensagem');
  assert.deepEqual(mensagens().map((m) => m.chave), ['regua-pos:Val11:2026-10']);
});

test('Cobranças: o botão WhatsApp da tela continua com o lembrete e o extrato dos consumos (a régua da Fila tem os textos dela)', async () => {
  const { iniciarTelaCobrancas } = await import('./ui-tela-cobrancas.js?v=40');
  const { mesIdAtual } = await import('./financeiro-aluno.js?v=40');
  iniciarTelaCobrancas();
  // A tela Cobranças olha o mês do relógio; a Fila, o mesmo dia.
  HOJE = new Date().toISOString().slice(0, 10);
  const mes = mesIdAtual();
  const venc = String(Math.max(1, new Date().getDate() - 1));
  db.criar({ id: 'Xan12', nome: 'Xande Lopes', telefone: '14912345678', mensalidade: '150', vencimento: venc,
    consumos: [{ id: 'x1', nome: 'Energético', preco: 10, data: `${mes}-01`, mesId: mes }, { id: 'x2', nome: 'Energético', preco: 10, data: `${mes}-01`, mesId: mes }] });
  emit(EVENTOS.ABRIR_TELA, 'cobrancas');
  const href = (new RegExp('href="(https://api\\.whatsapp\\.com/send[^"]+)"[^>]*data-id="Xan12"').exec(el('#cob-list').innerHTML) || [])[1];
  assert.ok(href, 'o botão da Cobranças existe');
  assert.match(new URL(href).searchParams.get('text') || '', /sua conta de [^\n]+:\n- Mensalidade: R\$\s150,00\n- 2x Energético: R\$\s20,00\nPra facilitar/);
});
