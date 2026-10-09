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

const db = await import('./db.js?v=14');
const eventos = await import('./eventos.js?v=14');
const { estado, on, emit, EVENTOS } = await import('./estado.js?v=14');
const { iniciarNavegacao } = await import('./navegacao.js?v=14');
const { iniciarAutomacao, mensagens, sincronizarAutomacao } = await import('./automacao.js?v=14');
const { iniciarTelaAutomacao } = await import('./ui-tela-automacao.js?v=14');
const { darBaixa, desfazerBaixa } = await import('./financeiro-regras.js?v=14');
const { regFinanceiro } = await import('./registro.js?v=14');

/* ---------- o que vem de fora ---------- */
const OUT = '2026-10';
let HOJE = '2026-10-09';
let AGORA = Date.UTC(2026, 9, 9, 12);
const abertos = /** @type {string[]} */ ([]);
const nuvem = { feitas: /** @type {Record<string, any>} */ ({}), chamadas: /** @type {any[]} */ ([]), falha: false };
const depsMotor = {
  hoje: () => HOJE, agora: () => AGORA,
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
const baixa = (id) => { const a = db.obter(id); const r = darBaixa(a, OUT, db.listar()); assert.ok(r); db.atualizar(id, r.patch); if (r.log) regFinanceiro(a, r.log); };

// O box: Ana venceu dia 5; Gil venceu dia 1 e não tem telefone; Edu vence dia 20; Duda é cortesia.
db.criar({ id: 'Ana01', nome: 'Ana Lima', telefone: '(14) 99999-0000', mensalidade: '150', vencimento: '5' });
db.criar({ id: 'Gil02', nome: 'Gil Neto', mensalidade: '100', vencimento: '1' });
db.criar({ id: 'Edu03', nome: 'Edu Prado', telefone: '14955554444', mensalidade: '200', vencimento: '20' });
db.criar({ id: 'Duda04', nome: 'Duda Reis', telefone: '14966665555', mensalidade: '150', vencimento: '5', parceria: { nome: 'Atleta', percentual: 100 } });

/* ---------- a) a cobrança vencida entra sozinha ---------- */

test('a) cobrança vencida e lembrete: entram na fila sem ninguém pedir, com o selo, o texto pronto e o "sem telefone"', () => {
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.equal(selo(), '3', 'selo no botão da lista, sem abrir a tela');
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  assert.deepEqual(cartoes(), ['cobranca-vencida:Gil02:2026-10', 'cobranca-vencida:Ana01:2026-10', 'cobranca-a-vencer:Edu03:2026-10'],
    'as vencidas (a mais atrasada primeiro), depois os lembretes');
  const html = el('#auto-list').innerHTML;
  assert.match(html, /Cobranças vencidas[\s\S]*Lembretes do mês \(a vencer\)/);
  assert.match(html, /Ana Lima[\s\S]*R\$\s150,00 · venceu há 4 dias/);
  assert.match(html, /Olá, Ana! 😊 Passando pra lembrar da sua mensalidade de Outubro/);
  assert.match(html, /auto-enviar" data-chave="cobranca-vencida:Ana01:2026-10"/);
  assert.ok(!/auto-enviar" data-chave="cobranca-vencida:Gil02/.test(html), 'Gil sem telefone: sem botão de enviar');
  assert.match(html, /sem telefone na ficha/);
  assert.ok(!/Duda/.test(html), 'cortesia fica de fora');
});

test('lembrete: a conta a vencer aparece com "vence em N dias" e o texto "vence dia X"; descartado, não volta', () => {
  const html = el('#auto-list').innerHTML;
  assert.match(html, /auto-row auto-cobranca-a-vencer[\s\S]*Edu Prado[\s\S]*R\$\s200,00 · vence em 11 dias[\s\S]*Lembrete de vencimento/);
  assert.match(html, /Olá, Edu! 😊 Passando pra lembrar da sua mensalidade de Outubro \(R\$\s200,00\), que vence dia 20\. Pra facilitar/);
  const antes = logs().length;
  clicar('auto-descartar', 'cobranca-a-vencer:Edu03:2026-10');
  assert.equal(logs().length, antes);
  assert.deepEqual(cartoes(), ['cobranca-vencida:Gil02:2026-10', 'cobranca-vencida:Ana01:2026-10']);
  assert.equal(selo(), '2');
});

test('a) a fila acompanha a ficha: telefone novo no Gil vale na hora, e o botão aparece', () => {
  db.atualizar('Gil02', { telefone: '14911112222' });
  assert.match(el('#auto-list').innerHTML, /auto-enviar" data-chave="cobranca-vencida:Gil02:2026-10"/, 'redesenhou com a tela aberta');
});

/* ---------- b) Enviar ---------- */

test('b) Enviar: abre o WhatsApp com o texto, registra "mensagem-enviada" na ficha e some da fila — uma vez só', () => {
  const avisos = /** @type {string[]} */ ([]);
  const parar = on(EVENTOS.REGISTROS_MUDARAM, (id) => avisos.push(id));
  const antes = logs().length;
  clicar('auto-enviar', 'cobranca-vencida:Ana01:2026-10');
  clicar('auto-enviar', 'cobranca-vencida:Ana01:2026-10'); // o duplo toque
  parar();
  assert.equal(abertos.length, 1, 'um WhatsApp só');
  const url = new URL(abertos[0]);
  assert.equal(url.origin + url.pathname, 'https://api.whatsapp.com/send');
  assert.equal(url.searchParams.get('phone'), '5514999990000');
  assert.match(url.searchParams.get('text') || '', /^Olá, Ana! 😊 Passando pra lembrar da sua mensalidade de Outubro \(R\$\s150,00\), que venceu dia 5/);
  const novos = logs().slice(antes);
  assert.equal(novos.length, 1, 'um registro só');
  assert.deepEqual([novos[0].tipo, novos[0].alunoId, novos[0].alunoNome, novos[0].origem, novos[0].chave],
    ['mensagem-enviada', 'Ana01', 'Ana Lima', 'gestao', 'mensagem:cobranca-vencida:Ana01:2026-10']);
  assert.match(novos[0].resumo, /^WhatsApp · Cobrança vencida · R\$\s150,00 · venceu há 4 dias$/);
  assert.deepEqual(avisos, ['Ana01'], 'a aba Registros aberta mostra a linha na hora');
  assert.deepEqual(cartoes(), ['cobranca-vencida:Gil02:2026-10']);
  assert.equal(selo(), '1');
});

test('b) a enviada não volta: nem na próxima varredura, nem com a ficha mudando', () => {
  db.atualizar('Ana01', { objetivo: 'Força' });
  assert.ok(!mensagens().some((m) => m.alunoId === 'Ana01'));
});

/* ---------- c) Descartar ---------- */

test('c) Descartar: some da fila e do selo, sem abrir WhatsApp e sem registrar envio', () => {
  const antes = logs().length;
  clicar('auto-descartar', 'cobranca-vencida:Gil02:2026-10');
  assert.equal(abertos.length, 1, 'nada aberto');
  assert.equal(logs().length, antes, 'nada registrado');
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
  const a = db.obter('Edu03'); const r = desfazerBaixa(a, OUT); assert.ok(r);
  db.atualizar('Edu03', r.patch); if (r.log) regFinanceiro(a, r.log);
  assert.deepEqual(cartoes(), []);
  assert.equal(selo(), null);
});

test('recibo: a baixa de quem estava na fila de cobrança troca a cobrança pelo recibo; cortesia não gera recibo', () => {
  db.criar({ id: 'Bia05', nome: 'Bia Souza', telefone: '14988887777', mensalidade: '120', vencimento: '3' });
  assert.deepEqual(cartoes(), ['cobranca-vencida:Bia05:2026-10']);
  baixa('Bia05');
  baixa('Duda04');
  assert.deepEqual(cartoes(), ['recibo:Bia05:2026-10']);
});

test('c) descartar o recibo e refazer a baixa do mês não traz outro recibo', () => {
  clicar('auto-descartar', 'recibo:Bia05:2026-10');
  const a = db.obter('Bia05'); const r = desfazerBaixa(a, OUT); assert.ok(r);
  db.atualizar('Bia05', r.patch); regFinanceiro(a, r.log);
  // Desfeita a baixa, a Bia volta a dever: a cobrança volta (outra chave) — o recibo não.
  assert.deepEqual(cartoes(), ['cobranca-vencida:Bia05:2026-10']);
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
  // moravam ali — a cobrança descartada do Gil volta (é a nuvem que protege
  // contra isso: ver o teste da nuvem) e o recibo esperando se perde.
  const guardado = memoria.get('braconaro_automacao_v1');
  memoria.set('braconaro_automacao_v1', '{lixo');
  try {
    iniciarAutomacao(depsMotor);
    assert.deepEqual(mensagens().map((m) => m.chave), ['cobranca-vencida:Gil02:2026-10']);
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
    db.criar({ id: 'Caio06', nome: 'Caio Leme', telefone: '14977776666', mensalidade: '90', vencimento: '2' });
    db.criar({ id: 'Rui07', nome: 'Rui Paz', telefone: '14933332222', mensalidade: '90', vencimento: '2' });
    assert.deepEqual(mensagens().map((m) => m.chave), ['cobranca-vencida:Caio06:2026-10', 'cobranca-vencida:Rui07:2026-10']);
    // Marca aqui: sobe só a chave e o status.
    emit(EVENTOS.ABRIR_TELA, 'automacao');
    clicar('auto-descartar', 'cobranca-vencida:Caio06:2026-10');
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(nuvem.chamadas.at(-1), ['gravar', 'coach1', ['cobranca-vencida:Caio06:2026-10']]);
    assert.deepEqual(nuvem.feitas['cobranca-vencida:Caio06:2026-10'], { status: 'descartada', em: AGORA });
    // Outro aparelho enviou a do Rui; e uma marca velha passou do prazo.
    nuvem.feitas['cobranca-vencida:Rui07:2026-10'] = { status: 'enviada', em: AGORA - 1000 };
    nuvem.feitas['cobranca-vencida:Rui07:2026-05'] = { status: 'enviada', em: AGORA - 200 * 86400000 };
    await sincronizarAutomacao('coach1');
    assert.deepEqual(cartoes(), [], 'a do Rui saiu daqui, e a tela redesenhou');
    assert.ok(!('cobranca-vencida:Rui07:2026-05' in nuvem.feitas), 'a velha foi apagada lá');
    // Sem rede: a marca fica aqui e sobe no próximo sync.
    nuvem.falha = true;
    db.criar({ id: 'Tom08', nome: 'Tom Sá', telefone: '14922221111', mensalidade: '90', vencimento: '2' });
    clicar('auto-descartar', 'cobranca-vencida:Tom08:2026-10');
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(!('cobranca-vencida:Tom08:2026-10' in nuvem.feitas));
    await sincronizarAutomacao('coach1'); // falha calada
    nuvem.falha = false;
    await sincronizarAutomacao('coach1');
    assert.equal(nuvem.feitas['cobranca-vencida:Tom08:2026-10']?.status, 'descartada');
    assert.deepEqual(mensagens(), []);
  } finally {
    estado.uid = null;
  }
});

test('sem login (a vitrine, o modo local): nenhuma chamada à nuvem', () => {
  const n = nuvem.chamadas.length;
  db.criar({ id: 'Lia09', nome: 'Lia Mota', telefone: '14900001111', mensalidade: '90', vencimento: '2' });
  clicar('auto-descartar', 'cobranca-vencida:Lia09:2026-10');
  assert.equal(nuvem.chamadas.length, n);
});

test('Enviar num cartão velho sem telefone (o botão nem existe, mas o clique chega): nada abre, nada registra, a mensagem fica', () => {
  db.criar({ id: 'Ze10', nome: 'Zé Sem Fone', mensalidade: '90', vencimento: '2' });
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  const n = abertos.length, l = logs().length;
  clicar('auto-enviar', 'cobranca-vencida:Ze10:2026-10');
  assert.deepEqual([abertos.length, logs().length], [n, l]);
  assert.deepEqual(cartoes(), ['cobranca-vencida:Ze10:2026-10']);
  clicar('auto-descartar', 'cobranca-vencida:Ze10:2026-10');
});

test('d) selo: a virada do dia conta sem nenhum dado mudar — voltar para a lista refaz o selo', () => {
  db.criar({ id: 'Val11', nome: 'Val Dias', telefone: '14900002222', mensalidade: '90', vencimento: '9' });
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.deepEqual(mensagens().map((m) => [m.chave, m.dados.dias]), [['cobranca-a-vencer:Val11:2026-10', 0]], 'vence hoje: é lembrete');
  emit(EVENTOS.ABRIR_TELA, 'automacao');
  clicar('auto-descartar', 'cobranca-a-vencer:Val11:2026-10'); // o coach dispensa o lembrete
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.equal(selo(), null);
  HOJE = '2026-10-10';
  emit(EVENTOS.ABRIR_TELA, 'lista');
  assert.equal(selo(), '1', 'meia-noite passou: venceu ontem — a cobrança vencida é outra mensagem');
  assert.deepEqual(mensagens().map((m) => m.chave), ['cobranca-vencida:Val11:2026-10']);
});

test('consistência: o botão WhatsApp da tela Cobranças abre o MESMO texto da Fila (com o extrato dos consumos)', async () => {
  const { iniciarTelaCobrancas } = await import('./ui-tela-cobrancas.js?v=14');
  const { mesIdAtual } = await import('./financeiro-aluno.js?v=14');
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
  const daFila = mensagens().find((m) => m.alunoId === 'Xan12');
  if (Number(venc) < new Date().getDate()) {
    assert.ok(daFila, 'vencida: está na Fila');
    assert.equal(new URL(href).searchParams.get('text'), daFila.texto);
  }
  assert.match(new URL(href).searchParams.get('text') || '', /sua conta de [^\n]+:\n- Mensalidade: R\$\s150,00\n- 2x Energético: R\$\s20,00\nPra facilitar/);
});
