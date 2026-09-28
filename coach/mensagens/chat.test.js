// @ts-check
/**
 * A regra do chat do lado coach — o mesmo formato que o app grava. E o
 * download da foto (`baixarArquivo`, de midia-web.js), com fetch e DOM de mentira.
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
  podeApagar,
  podeEditar,
  FORMATOS_DE_VOZ,
  LIMITES_MIDIA,
  MidiaRecusada,
  UPLOAD_PARADO,
  UPLOAD_PARADO_MS,
  VOZ_MIN_S,
  caminhoDaCapa,
  caminhoDaMidia,
  formatarDuracao,
  formatoDeGravacao,
  formatoDoArquivo,
  novaMensagemDeMidia,
  porcentagem,
  resultadoDaFalha,
  rotuloDaMidia,
  uploadParado,
  validarMidia,
  videoAceito,
  vozCompativel,
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
  nomeDaFotoBaixada,
} from './chat.js';
import { baixarArquivo } from './midia-web.js';

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
    ({ id, texto: id, remetente, timestamp, tipo: /** @type {const} */ ('texto'), status: /** @type {const} */ ('enviado'), editado: false });
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

test('o coach apaga qualquer mensagem, a dele e a do aluno — e so edita a resposta dele, de texto', () => {
  assert.ok(podeApagar({ remetente: 'coach' }) && podeEditar({ remetente: 'coach', tipo: 'texto' }));
  assert.ok(podeApagar({ remetente: 'aluno' }), 'a do aluno tambem sai (a regra deixa o coach apagar)');
  assert.ok(!podeEditar({ remetente: 'aluno', tipo: 'texto' }), 'mas nao edita o que o aluno escreveu');
  assert.ok(!podeApagar({ remetente: 'coach', pendente: true })
    && !podeEditar({ remetente: 'coach', pendente: true, tipo: 'texto' }), 'resposta ainda a caminho nao');
  assert.ok(podeApagar({ remetente: 'aluno', pendente: true }),
    'a do aluno com o lido a caminho (pendente) ja esta no servidor: apaga');
  for (const tipo of /** @type {const} */ (['imagem', 'video', 'audio'])) {
    for (const remetente of /** @type {const} */ (['coach', 'aluno'])) {
      assert.ok(podeApagar({ remetente }) && !podeEditar({ remetente, tipo }),
        `${tipo} do ${remetente}: so apagar — a regra nao deixa editar midia`);
    }
  }
});

test('apagar a ultima mensagem do aluno: o resumo volta para a anterior, com o rotulo da midia', () => {
  const fio = [
    { id: 'c1', texto: '🎤 Mensagem de voz (0:04)', remetente: /** @type {const} */ ('coach'), timestamp: as(24, 9, 0),
      tipo: /** @type {const} */ ('audio'), mediaUrl: 'https://x/v.m4a', duracao: 4, status: /** @type {const} */ ('lido'), editado: false },
    { id: 'a1', texto: '📷 Foto', remetente: /** @type {const} */ ('aluno'), timestamp: as(24, 9, 5),
      tipo: /** @type {const} */ ('imagem'), mediaUrl: 'https://x/f.jpg', status: /** @type {const} */ ('lido'), editado: false },
  ];
  assert.deepEqual(resumoAposApagar(fio, 'a1'),
    { texto: '🎤 Mensagem de voz (0:04)', remetente: 'coach', timestamp: as(24, 9, 0) },
    'a foto do aluno sai; a lista mostra a voz do coach, e a conversa deixa de aguardar resposta');
  assert.equal(resumoAposApagar(fio, 'c1'), undefined, 'a do coach era do meio: o resumo fica');
  assert.equal(resumoAposApagar([fio[1]], 'a1'), null, 'a unica, do aluno: o resumo sai com ela');
});

test('a foto baixada se chama foto_garage_{timestamp}.jpg', () => {
  assert.equal(nomeDaFotoBaixada(1_790_000_000_000), 'foto_garage_1790000000000.jpg');
  assert.equal(nomeDaFotoBaixada(1_790_000_000_000.4), 'foto_garage_1790000000000.jpg', 'sem casa decimal no nome');
  for (const torto of [0, -1, NaN, Infinity]) {
    assert.match(nomeDaFotoBaixada(torto), /^foto_garage_\d{13}\.jpg$/, `hora torta (${torto}) cai na de agora`);
  }
});

test('baixar a foto: fetch do arquivo, blob local e um clique no link com o nome — sem abrir aba', async () => {
  const cliques = [];
  const revogados = [];
  const antes = { fetch: globalThis.fetch, document: globalThis.document, setTimeout: globalThis.setTimeout,
    criar: URL.createObjectURL, revogar: URL.revokeObjectURL };
  const link = { href: '', download: '', hidden: false, click() { cliques.push({ href: this.href, download: this.download }); }, remove() {} };
  /** @type {any[]} */ const pedidos = [];
  let status = 200;
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ opcoes) => {
    pedidos.push({ url, opcoes });
    return { ok: status === 200, status, blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }) };
  });
  globalThis.document = /** @type {any} */ ({ createElement: () => link, body: { appendChild() {} } });
  globalThis.setTimeout = /** @type {any} */ ((/** @type {() => void} */ fn) => { fn(); return 0; });
  URL.createObjectURL = () => 'blob:local/1';
  URL.revokeObjectURL = (/** @type {string} */ u) => { revogados.push(u); };
  try {
    const URL_FOTO = 'https://firebasestorage.googleapis.com/v0/b/b/o/chats%2Fa%40b.com%2F1_imagem.jpg?alt=media&token=t';
    assert.deepEqual(await baixarArquivo(URL_FOTO, 'foto_garage_1.jpg', () => assert.fail('com CORS, nada de aba')),
      { modo: 'download' });
    assert.equal(pedidos[0].url, URL_FOTO, 'busca o arquivo original do Storage');
    assert.equal(pedidos[0].opcoes.credentials, 'omit', 'sem cookie: o Storage responde com Allow-Origin *');
    assert.deepEqual(cliques, [{ href: 'blob:local/1', download: 'foto_garage_1.jpg' }],
      'o clique e no blob local, com download — nao no endereco do Storage');
    assert.deepEqual(revogados, ['blob:local/1'], 'o blob local e solto depois');

    status = 404;
    await assert.rejects(baixarArquivo(URL_FOTO, 'x.jpg', () => assert.fail('HTTP de erro nao abre aba')), /download-404/,
      'arquivo que nao veio (apagado, token trocado) e erro — nem .jpg vazio, nem aba com a pagina de erro');
    assert.equal(cliques.length, 1, 'e nada e salvo');
  } finally {
    Object.assign(globalThis, { fetch: antes.fetch, document: antes.document, setTimeout: antes.setTimeout });
    URL.createObjectURL = antes.criar;
    URL.revokeObjectURL = antes.revogar;
  }
});

// Depois do teste de cima, e por último entre os de `baixarArquivo`: a recusa
// de CORS fica lembrada no módulo até a página recarregar.
test('baixar a foto sem CORS: o fetch recusado abre a original numa aba — e dali em diante direto, dentro do clique', async () => {
  const URL_FOTO = 'https://firebasestorage.googleapis.com/v0/b/b/o/chats%2Fa%40b.com%2F2_imagem.jpg?alt=media&token=t';
  const antes = { fetch: globalThis.fetch, warn: console.warn, navegador: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  /** @type {string[]} */ const pedidos = [];
  /** @type {string[]} */ const abas = [];
  let abre = true;
  const abrir = (/** @type {string} */ u) => { abas.push(u); return abre; };
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url) => {
    pedidos.push(url);
    throw new TypeError('Failed to fetch'); // o que o navegador lança quando o CORS barra
  });
  console.warn = () => {};
  const navegador = (/** @type {boolean} */ onLine) =>
    Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true, writable: true });
  try {
    navegador(false);
    await assert.rejects(baixarArquivo(URL_FOTO, 'x.jpg', abrir), TypeError, 'sem rede, e erro: a aba tambem nao abriria a foto');
    assert.equal(abas.length, 0);

    navegador(true);
    assert.deepEqual(await baixarArquivo(URL_FOTO, 'foto_garage_2.jpg', abrir), { modo: 'aba', aberta: true },
      'com rede e o fetch recusado (CORS): abre a original numa aba');
    assert.deepEqual(abas, [URL_FOTO], 'a foto original, em alta — o mesmo endereco do Storage');
    assert.equal(pedidos.length, 2);

    assert.deepEqual(await baixarArquivo(URL_FOTO, 'foto_garage_2.jpg', abrir), { modo: 'aba', aberta: true });
    assert.equal(pedidos.length, 2, 'o segundo clique nem tenta o fetch: abre a aba na hora, antes de qualquer await');
    assert.equal(abas.length, 2);

    abre = false;
    assert.deepEqual(await baixarArquivo(URL_FOTO, 'foto_garage_2.jpg', abrir), { modo: 'aba', aberta: false },
      'o bloqueador de pop-ups barrou: a tela pede outro clique');
  } finally {
    globalThis.fetch = antes.fetch;
    console.warn = antes.warn;
    if (antes.navegador) Object.defineProperty(globalThis, 'navigator', antes.navegador);
    else delete (/** @type {any} */ (globalThis)).navigator;
  }
});

test('apagar de verdade: o resumo volta para a anterior, ou sai com a conversa vazia', () => {
  const m = (/** @type {string} */ id, /** @type {'aluno'|'coach'} */ remetente, /** @type {number} */ timestamp) =>
    ({ id, texto: id, remetente, timestamp, tipo: /** @type {const} */ ('texto'), status: /** @type {const} */ ('enviado'), editado: false });
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
    ({ id, texto: id, remetente, timestamp: AGORA, tipo: /** @type {const} */ ('texto'), status, editado: false, pendente });
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

/* ---------- mídia (Etapa 17.3) — os mesmos casos do app ---------- */

const URL_FOTO = 'https://firebasestorage.googleapis.com/v0/b/projeto-garage-f0a2f.firebasestorage.app/o/chats%2Fana%40box.com%2F1_imagem.jpg?alt=media&token=t';
const URL_CAPA = 'https://firebasestorage.googleapis.com/v0/b/projeto-garage-f0a2f.firebasestorage.app/o/chats%2Fana%40box.com%2F1_capa.jpg?alt=media';
const MB = 1024 * 1024;

test('os tetos batem com o app e com as regras: 5/10/50 MB, 3 min de video, 5 min de voz', () => {
  assert.deepEqual(LIMITES_MIDIA, {
    imagem: { bytes: 5 * MB },
    video: { bytes: 50 * MB, duracaoMax: 180 },
    audio: { bytes: 10 * MB, duracaoMax: 300 },
  });
  assert.equal(VOZ_MIN_S, 1);
  assert.equal(UPLOAD_PARADO_MS, 30_000);
});

test('duracao no relogio do WhatsApp e o rotulo da midia', () => {
  assert.equal(formatarDuracao(5), '0:05');
  assert.equal(formatarDuracao(62.9), '1:02');
  assert.equal(formatarDuracao(3600), '1:00:00');
  assert.equal(formatarDuracao(-3), '0:00');
  assert.equal(formatarDuracao(NaN), '0:00');
  assert.equal(rotuloDaMidia('imagem'), '📷 Foto');
  assert.equal(rotuloDaMidia('video', 12), '🎥 Vídeo (0:12)');
  assert.equal(rotuloDaMidia('audio', 5), '🎤 Mensagem de voz (0:05)');
  assert.equal(rotuloDaMidia('audio'), '🎤 Mensagem de voz');
});

test('a mensagem de midia do coach grava so o que a regra aceita', () => {
  const foto = novaMensagemDeMidia('imagem', URL_FOTO, 'coach', { duracao: 9, thumbUrl: URL_CAPA }, AGORA);
  assert.deepEqual(foto, { texto: '📷 Foto', remetente: 'coach', timestamp: AGORA, tipo: 'imagem', mediaUrl: URL_FOTO },
    'foto: sem duracao nem capa');
  const voz = novaMensagemDeMidia('audio', URL_FOTO, 'coach', { duracao: 4.26 }, AGORA);
  assert.equal(voz?.duracao, 4.3, 'um decimo de segundo basta');
  assert.equal(voz?.texto, '🎤 Mensagem de voz (0:04)');
  assert.ok(voz && !('thumbUrl' in voz), 'voz nao leva capa');
  const video = novaMensagemDeMidia('video', URL_FOTO, 'coach', { duracao: 30, thumbUrl: URL_CAPA }, AGORA);
  assert.equal(video?.thumbUrl, URL_CAPA);
  const semCapa = novaMensagemDeMidia('video', URL_FOTO, 'coach', { duracao: 0, thumbUrl: 'blob:https://x/1' }, AGORA);
  assert.ok(semCapa && !('duracao' in semCapa) && !('thumbUrl' in semCapa), 'duracao zero e capa local ficam de fora');
  assert.equal(novaMensagemDeMidia('imagem', 'blob:https://x/1', 'coach'), null, 'sem endereco https, nao nasce');
  assert.equal(novaMensagemDeMidia('imagem', 'http://x.com/a.jpg', 'coach'), null);
  assert.equal(novaMensagem('oi', 'coach', AGORA)?.tipo, undefined, 'texto continua sem `tipo`');
});

test('a Central le a midia do app sem confiar no documento', () => {
  const ler = (/** @type {Record<string, unknown>} */ d) => normalizarMensagem('m1', { remetente: 'aluno', timestamp: AGORA, ...d });
  const foto = ler({ tipo: 'imagem', mediaUrl: URL_FOTO, texto: '📷 Foto' });
  assert.equal(foto?.tipo, 'imagem');
  assert.equal(foto?.mediaUrl, URL_FOTO);
  assert.equal(ler({ tipo: 'audio', mediaUrl: URL_FOTO, duracao: 7 })?.texto, '🎤 Mensagem de voz (0:07)', 'sem texto, ganha o rotulo');
  assert.equal(ler({ tipo: 'video', mediaUrl: URL_FOTO, thumbUrl: URL_CAPA })?.thumbUrl, URL_CAPA);
  assert.equal(ler({ tipo: 'imagem', mediaUrl: URL_FOTO, thumbUrl: URL_CAPA })?.thumbUrl, undefined, 'capa so no video');
  assert.equal(ler({ tipo: 'audio', mediaUrl: URL_FOTO, duracao: 'dez' })?.duracao, undefined);
  const suspeita = ler({ tipo: 'imagem', mediaUrl: 'javascript:alert(1)', texto: '📷 Foto' });
  assert.equal(suspeita?.tipo, 'texto', 'midia sem https vira o texto dela — nada de URL estranha no <img>');
  assert.equal(suspeita?.mediaUrl, undefined);
  assert.equal(ler({ tipo: 'imagem', texto: '' }), null);
  assert.equal(ler({ tipo: 'gif', mediaUrl: URL_FOTO, texto: 'oi' })?.tipo, 'texto');
  assert.equal(ler({ texto: 'oi' })?.tipo, 'texto', 'mensagem antiga, sem `tipo`, e texto');
});

test('o resumo leva so o rotulo — o endereco do arquivo fica na mensagem', () => {
  const voz = novaMensagemDeMidia('audio', URL_FOTO, 'coach', { duracao: 4 }, AGORA);
  const r = resumoDoChat('ana@box.com', /** @type {any} */ (voz));
  assert.deepEqual(r.ultimaMensagem, { texto: '🎤 Mensagem de voz (0:04)', remetente: 'coach', timestamp: AGORA });
});

test('caminho no Storage no padrao da regra: chats/{email}/{timestamp}_{tipo}.{ext}', () => {
  assert.equal(caminhoDaMidia(' Ana@Box.com ', 1_790_000_000_000, 'audio', 'm4a'), 'chats/ana@box.com/1790000000000_audio.m4a');
  assert.equal(caminhoDaCapa('ana@box.com', 7), 'chats/ana@box.com/7_capa.jpg');
  // O mesmo padrao do storage.rules (midiaChatValida).
  const regra = /^[0-9]+_(imagem|video|audio|capa)[.][a-z0-9]{2,4}$/;
  for (const tipo of /** @type {const} */ (['imagem', 'video', 'audio'])) {
    const { ext } = formatoDoArquivo(tipo, tipo === 'video' ? 'video/quicktime' : null);
    assert.match(caminhoDaMidia('a@b.com', 1, tipo, ext).split('/').pop() || '', regra);
  }
  assert.match(caminhoDaCapa('a@b.com', 1).split('/').pop() || '', regra);
});

test('formatos: foto em JPEG, voz em M4A, video MP4 ou MOV', () => {
  assert.deepEqual(formatoDoArquivo('imagem', 'image/png', 'print.png'), { ext: 'jpg', contentType: 'image/jpeg' },
    'o Ctrl+V (PNG) sai do canvas em JPEG');
  assert.deepEqual(formatoDoArquivo('audio', 'audio/mp4'), { ext: 'm4a', contentType: 'audio/mp4' });
  assert.equal(formatoDoArquivo('video', 'video/quicktime').ext, 'mov');
  assert.equal(formatoDoArquivo('video', '', 'IMG_1.MOV').contentType, 'video/quicktime');
  assert.equal(formatoDoArquivo('video', 'video/mp4', 'a.mp4').ext, 'mp4');
  assert.ok(videoAceito('video/mp4') && videoAceito('video/quicktime') && videoAceito('', 'treino.MOV'));
  assert.ok(!videoAceito('video/webm') && !videoAceito('video/x-matroska') && !videoAceito('', 'a.avi'),
    'o iPhone nao toca WebM/MKV/AVI');
});

test('gravacao de voz: so AAC em MP4, que o celular toca', () => {
  const suporta = (/** @type {string[]} */ lista) => (/** @type {string} */ t) => lista.includes(t);
  assert.equal(formatoDeGravacao(suporta(FORMATOS_DE_VOZ)), 'audio/mp4;codecs=mp4a.40.2', 'prefere AAC declarado');
  assert.equal(formatoDeGravacao(suporta(['audio/mp4'])), 'audio/mp4', 'Safari: audio/mp4 puro');
  assert.equal(formatoDeGravacao(suporta(['audio/webm', 'audio/ogg'])), null, 'Firefox: so WebM/Ogg, o microfone desliga');
  assert.equal(formatoDeGravacao(() => { throw new Error('x'); }), null, 'navegador que explode no isTypeSupported');
  assert.ok(vozCompativel('audio/mp4') && vozCompativel('audio/mp4; codecs=mp4a.40.2'));
  assert.ok(!vozCompativel('audio/mp4;codecs=opus') && !vozCompativel('audio/webm;codecs=opus') && !vozCompativel(''),
    'Opus (mesmo em MP4) o iPhone nao toca');
});

test('validacao: os tetos, com o motivo para o coach', () => {
  assert.equal(validarMidia('imagem', { bytes: 4 * MB }), null);
  assert.equal(validarMidia('video', { bytes: 49 * MB, duracao: 180 }), null);
  assert.equal(validarMidia('audio', { bytes: MB, duracao: 300 }), null);
  assert.match(validarMidia('video', { bytes: 51 * MB }) || '', /50 MB/);
  assert.match(validarMidia('imagem', { bytes: 6 * MB }) || '', /^A foto/);
  assert.match(validarMidia('video', { duracao: 200 }) || '', /3:00/);
  assert.match(validarMidia('audio', { duracao: 301 }) || '', /5:00/);
  assert.equal(validarMidia('video', { bytes: null, duracao: null }), null, 'desconhecido nao barra');
});

test('upload: progresso, vigia de upload parado e o que a tela diz na falha', () => {
  assert.equal(porcentagem(50, 200), 25);
  assert.equal(porcentagem(300, 200), 100);
  assert.equal(porcentagem(5, 0), 0);
  assert.ok(!uploadParado(0, UPLOAD_PARADO_MS) && uploadParado(0, UPLOAD_PARADO_MS + 1));
  const grande = new MidiaRecusada('O vídeo passa de 50 MB. Escolha um menor.');
  assert.equal(grande.name, 'MidiaRecusada');
  assert.deepEqual(resultadoDaFalha(grande), { resultado: 'recusada', motivo: 'O vídeo passa de 50 MB. Escolha um menor.' });
  assert.deepEqual(resultadoDaFalha(new Error(UPLOAD_PARADO)), { resultado: 'sem-rede' });
  assert.deepEqual(resultadoDaFalha(Object.assign(new Error('x'), { code: 'storage/unauthorized' })), { resultado: 'recusada' });
  assert.deepEqual(resultadoDaFalha(null), { resultado: 'recusada' });
});
