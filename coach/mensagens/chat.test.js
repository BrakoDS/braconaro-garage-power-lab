// @ts-check
/**
 * A regra do chat do lado coach — o mesmo formato que o app grava.
 *
 * Rodar: node --test coach/mensagens/chat.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUMO_MAX,
  TEXTO_MAX,
  aguardaResposta,
  alunoDaConversa,
  casaBusca,
  edicaoDaMensagem,
  emMs,
  enderecoDaConversa,
  lerEndereco,
  normalizarStatus,
  paraMarcar,
  podeAlterar,
  ticksDoStatus,
  horaDaMensagem,
  iniciais,
  itensDoChat,
  normalizarConversa,
  normalizarMensagem,
  novaMensagem,
  ordenarConversas,
  ordenarMensagens,
  prepararTexto,
  quandoNaLista,
  resumoAposApagar,
  resumoDoChat,
  rotuloDoDia,
} from './chat.js';

// Horários no fuso local: 25/09/2026 às 10:30.
const AGORA = new Date(2026, 8, 25, 10, 30).getTime();
const as = (/** @type {number} */ dia, /** @type {number} */ h, /** @type {number} */ min) =>
  new Date(2026, 8, dia, h, min).getTime();

test('o texto sai aparado, sem pilha de linhas em branco e cortado no teto', () => {
  assert.equal(prepararTexto('  oi  '), 'oi');
  assert.equal(prepararTexto('oi\r\n\r\n\r\n\r\naluno'), 'oi\n\naluno');
  assert.equal(prepararTexto('x'.repeat(TEXTO_MAX + 10))?.length, TEXTO_MAX);
  assert.equal(prepararTexto('  \n\t '), null);
  assert.equal(prepararTexto(undefined), null);
});

test('a resposta do coach grava so texto, remetente coach e timestamp', () => {
  const m = novaMensagem(' Pode trocar pelo halter. ', 'coach', AGORA);
  assert.deepEqual(m, { texto: 'Pode trocar pelo halter.', remetente: 'coach', timestamp: AGORA });
  assert.equal(novaMensagem('   ', 'coach', AGORA), null, 'resposta vazia nao sai');
});

test('o resumo leva a ultima mensagem encurtada, e o e-mail do aluno', () => {
  const r = resumoDoChat('ana@box.com', /** @type {any} */ (novaMensagem('a'.repeat(300), 'coach', AGORA)));
  assert.equal(r.aluno, 'ana@box.com');
  assert.equal(r.atualizadoEm, AGORA);
  assert.equal(r.ultimaMensagem.texto.length, RESUMO_MAX);
  assert.ok(r.ultimaMensagem.texto.endsWith('…'));
  assert.equal(r.ultimaMensagem.remetente, 'coach');
});

test('mensagem do servidor e lida sem confiar nela', () => {
  assert.equal(normalizarMensagem('m1', { texto: 'oi', remetente: 'aluno', timestamp: AGORA })?.remetente, 'aluno');
  assert.equal(normalizarMensagem('m1', { texto: 'oi', remetente: 'admin', timestamp: AGORA }), null);
  assert.equal(normalizarMensagem('m1', { texto: '  ', remetente: 'aluno', timestamp: AGORA }), null);
  assert.equal(normalizarMensagem('m1', { texto: 'oi', remetente: 'aluno' }), null);
  assert.equal(normalizarMensagem('m1', { texto: 'oi', remetente: 'coach', timestamp: { seconds: 1_790_000_000, nanoseconds: 5e8 } })
    ?.timestamp, 1_790_000_000_500, 'aceita o Timestamp do Firestore');
  assert.equal(emMs({ toMillis: () => 42 }), 42);
  assert.equal(emMs('ontem'), 0);
});

test('a conversa vale pelo id do documento (o e-mail), nao pelo campo aluno', () => {
  const c = normalizarConversa('Ana@Box.com', {
    aluno: 'outra@x.com',
    ultimaMensagem: { texto: 'Posso treinar com dor?', remetente: 'aluno', timestamp: AGORA },
    atualizadoEm: AGORA,
  });
  assert.equal(c?.email, 'ana@box.com');
  assert.equal(c?.ultimaMensagem?.texto, 'Posso treinar com dor?');
  assert.ok(c && aguardaResposta(c), 'a ultima palavra foi do aluno: espera o coach');
  assert.equal(normalizarConversa('ana@box.com', { aluno: 'ana@box.com' }), null, 'sem hora nenhuma nao entra na lista');
  const semUltima = normalizarConversa('ana@box.com', { atualizadoEm: AGORA });
  assert.ok(semUltima && semUltima.ultimaMensagem === null && !aguardaResposta(semUltima));
});

test('a lista abre pela conversa mais recente', () => {
  const lista = ordenarConversas([
    { email: 'b@x.com', atualizadoEm: 1 },
    { email: 'c@x.com', atualizadoEm: 3 },
    { email: 'a@x.com', atualizadoEm: 1 },
  ]);
  assert.deepEqual(lista.map((c) => c.email), ['c@x.com', 'a@x.com', 'b@x.com']);
});

test('as mensagens saem em ordem cronologica, e o empate vai pelo id', () => {
  const m = (/** @type {string} */ id, /** @type {number} */ timestamp) => ({ id, timestamp });
  const bagunca = [m('c', 3), m('b', 2), m('a', 2)];
  assert.equal(ordenarMensagens(bagunca).map((x) => x.id).join(''), 'abc');
  assert.equal(bagunca[0].id, 'c', 'ordenar nao mexe na lista original');
});

test('hora, dia e o horario curto da lista', () => {
  assert.equal(horaDaMensagem(as(25, 7, 5)), '07:05');
  assert.equal(rotuloDoDia(as(25, 0, 1), AGORA), 'Hoje');
  assert.equal(rotuloDoDia(as(24, 23, 59), AGORA), 'Ontem');
  assert.equal(rotuloDoDia(as(20, 12, 0), AGORA), '20/09/2026');
  assert.equal(rotuloDoDia(new Date(2026, 0, 1, 9).getTime(), new Date(2026, 0, 2, 9).getTime()), 'Ontem');
  assert.equal(quandoNaLista(as(25, 9, 7), AGORA), '09:07');
  assert.equal(quandoNaLista(as(24, 9, 7), AGORA), 'Ontem');
  assert.equal(quandoNaLista(as(20, 9, 7), AGORA), '20/09');
});

test('cada dia abre com o separador, e o bloco junta o que veio em seguida', () => {
  const msg = (/** @type {string} */ id, /** @type {'aluno'|'coach'} */ remetente, /** @type {number} */ timestamp) =>
    ({ id, texto: id, remetente, timestamp });
  const itens = itensDoChat([
    msg('m4', 'coach', as(25, 8, 0)),
    msg('m1', 'aluno', as(24, 18, 0)),
    msg('m2', 'aluno', as(24, 18, 3)),
    msg('m3', 'aluno', as(24, 18, 30)),
    msg('m5', 'coach', as(25, 8, 2)),
    msg('m6', 'aluno', as(25, 8, 3)),
  ], AGORA);
  const forma = itens.map((it) => (it.tipo === 'dia' ? `[${it.rotulo}]` : `${it.id}${it.continuacao ? '+' : ''}`)).join(' ');
  assert.equal(forma, '[Ontem] m1 m2+ m3 [Hoje] m4 m5+ m6');
  assert.equal(new Set(itens.map((it) => it.id)).size, itens.length, 'ids unicos');
  assert.deepEqual(itensDoChat([], AGORA), []);
});

test('o aluno da conversa vem da ficha da Gestao, pelo e-mail', () => {
  const alunos = [{ nome: 'Ana Lima', email: 'ANA@box.com ', fotoUrl: 'https://x/foto.webp' }];
  assert.deepEqual(alunoDaConversa('ana@box.com', alunos), { nome: 'Ana Lima', foto: 'https://x/foto.webp', naFicha: true });
  assert.deepEqual(alunoDaConversa('novo@box.com', alunos), { nome: 'novo@box.com', foto: '', naFicha: false },
    'sem ficha, a conversa aparece pelo e-mail');
});

test('iniciais e busca sem acento', () => {
  assert.equal(iniciais('Ana Maria Lima'), 'AL');
  assert.equal(iniciais('joao.silva@box.com'), 'JS');
  assert.equal(iniciais(''), '?');
  assert.ok(casaBusca({ nome: 'João Silva', email: 'js@box.com' }, 'joao'));
  assert.ok(casaBusca({ nome: 'João Silva', email: 'js@box.com' }, 'JS@'));
  assert.ok(!casaBusca({ nome: 'João Silva', email: 'js@box.com' }, 'ana'));
  assert.ok(casaBusca({ nome: 'x', email: 'y' }, '  '), 'busca vazia mostra todos');
});

/* ---------- Padrão WhatsApp (Etapa 15.2) ---------- */

const doServidor = (/** @type {Record<string, unknown>} */ extra) =>
  normalizarMensagem('m1', { texto: 'Bora treinar', remetente: 'coach', timestamp: AGORA, ...extra });

test('sem status gravado a mensagem esta enviada, e lixo nao vira tick', () => {
  assert.equal(doServidor({})?.status, 'enviado');
  assert.equal(doServidor({ status: 'entregue' })?.status, 'entregue');
  assert.equal(doServidor({ status: 'lido' })?.status, 'lido');
  assert.equal(normalizarStatus('visto'), 'enviado');
  assert.equal(normalizarStatus(undefined), 'enviado');
});

test('a mensagem editada chega marcada', () => {
  const editada = doServidor({ texto: 'Bora treinar amanha', editado: true });
  assert.equal(editada?.editado, true);
  assert.equal(editada?.texto, 'Bora treinar amanha');
  assert.equal(doServidor({ editado: 'sim' })?.editado, false, 'so true conta');
  assert.ok(!('apagado' in /** @type {object} */ (doServidor({}))), 'a mensagem lida nao carrega mais o apagado');
});

test('a apagada da 15.2 que sobrou em conversa antiga nao e mais mensagem: nada de balao "Mensagem apagada"', () => {
  assert.equal(doServidor({ texto: '', apagado: true }), null);
  assert.equal(doServidor({ texto: 'sobrou', apagado: true, editado: true }), null,
    'nem com texto sobrando no documento');
  assert.ok(doServidor({ apagado: false }), 'so apagado: true tira a mensagem');
});

test('a edicao grava o texto preparado e editado: true', () => {
  assert.deepEqual(edicaoDaMensagem('  Pode ser amanha.  '), { texto: 'Pode ser amanha.', editado: true });
  assert.equal(edicaoDaMensagem('   '), null, 'edicao vazia nao sai — para sumir com a mensagem, apagar');
});

test('o coach so mexe na resposta dele, ja gravada', () => {
  assert.ok(podeAlterar({ remetente: 'coach' }));
  assert.ok(!podeAlterar({ remetente: 'aluno' }), 'mensagem do aluno nao');
  assert.ok(!podeAlterar({ remetente: 'coach', pendente: true }), 'ainda a caminho nao');
});

test('apagar de verdade: o resumo volta para a anterior, ou sai com a conversa vazia', () => {
  const m = (/** @type {string} */ id, /** @type {'aluno'|'coach'} */ remetente, /** @type {number} */ timestamp) =>
    ({ id, texto: id, remetente, timestamp, status: /** @type {const} */ ('enviado'), editado: false });
  const fio = [m('p1', 'aluno', as(24, 9, 0)), m('p3', 'coach', as(24, 9, 2)), m('p2', 'aluno', as(24, 9, 1))];
  assert.equal(resumoAposApagar(fio, 'p1'), undefined, 'apagar uma do meio nao mexe no resumo');
  assert.equal(resumoAposApagar(fio, 'p2'), undefined);
  assert.deepEqual(resumoAposApagar(fio, 'p3'), { texto: 'p2', remetente: 'aluno', timestamp: as(24, 9, 1) },
    'apagar a ultima devolve o resumo a anterior (pela hora, nao pela posicao na lista)');
  assert.equal(resumoAposApagar([m('so', 'coach', AGORA)], 'so'), null,
    'apagar a unica: a conversa ficou vazia e o resumo sai tambem');
  assert.equal(resumoAposApagar([], 'x'), undefined);
  assert.equal(resumoAposApagar(fio, 'nao-existe'), undefined, 'id que nao esta na conversa nao mexe no resumo');
  assert.equal(fio.map((x) => x.id).join(','), 'p1,p3,p2', 'nao reordena a lista original');
});

test('a mensagem do aluno vira lido com a conversa a vista, e entregue com a aba escondida', () => {
  const m = (/** @type {string} */ id, /** @type {'aluno'|'coach'} */ remetente, /** @type {any} */ status, pendente = false) =>
    ({ id, texto: id, remetente, timestamp: AGORA, status, editado: false, pendente });
  const lista = [
    m('a1', 'aluno', 'enviado'),
    m('a2', 'aluno', 'entregue'),
    m('a3', 'aluno', 'lido'),
    m('c1', 'coach', 'enviado'),
    m('a4', 'aluno', 'enviado', true),
  ];
  assert.deepEqual(paraMarcar(lista, true), { status: 'lido', ids: ['a1', 'a2'] });
  assert.deepEqual(paraMarcar(lista, false), { status: 'entregue', ids: ['a1'] },
    'entregue so sai de enviado: o status nunca volta');
  assert.deepEqual(paraMarcar([], true).ids, []);
});

test('os ticks: um enviado, dois entregue, dois em destaque lido', () => {
  assert.deepEqual(ticksDoStatus('enviado'), { marca: '✓', lido: false });
  assert.deepEqual(ticksDoStatus('entregue'), { marca: '✓✓', lido: false });
  assert.deepEqual(ticksDoStatus('lido'), { marca: '✓✓', lido: true });
});

test('o endereco abre a conversa e pode trazer um rascunho, tudo no #', () => {
  assert.equal(enderecoDaConversa(' Ana@Box.com '), '#ana%40box.com');
  assert.deepEqual(lerEndereco('#ana%40box.com'), { email: 'ana@box.com', rascunho: null });

  const texto = 'Parabéns, Ana! 🏆 Novo PR de Back Squat: 102,5 kg × 5 reps & mais';
  const hash = enderecoDaConversa('ana@box.com', texto);
  assert.match(hash, /^#ana%40box\.com&rascunho=/);
  assert.deepEqual(lerEndereco(hash), { email: 'ana@box.com', rascunho: texto }, 'o & do texto nao corta o rascunho');
  assert.equal(enderecoDaConversa('ana@box.com', '   '), '#ana%40box.com', 'rascunho vazio nao entra');
});

test('endereco torto nao derruba a Central: sem @ ou com % solto, nenhuma conversa', () => {
  assert.deepEqual(lerEndereco(''), { email: '', rascunho: null });
  assert.deepEqual(lerEndereco('#sem-arroba'), { email: '', rascunho: null });
  assert.deepEqual(lerEndereco('#%E0%A4%A'), { email: '', rascunho: null });
  assert.deepEqual(lerEndereco('#ana@box.com&rascunho='), { email: 'ana@box.com', rascunho: null });
  assert.deepEqual(lerEndereco('#ana@box.com'), { email: 'ana@box.com', rascunho: null }, 'o formato antigo, sem codificar, continua valendo');
});
