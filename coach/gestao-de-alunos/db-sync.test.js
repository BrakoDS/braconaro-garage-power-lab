// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/db-sync.test.js
 *
 * Ponta a ponta, sem rede: a nuvem é a porta em memória (`db-memoria.js`), o
 * relógio é falso. Do blob v1 na nuvem até a edição do dia a dia subindo um
 * documento por vez — passando pela migração no primeiro login.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCache, CHAVE_V1 } from './db-cache.js?v=33';
import { criarSync } from './db-sync.js?v=33';
import { portaEmMemoria } from './db-memoria.js';

function armazenamento(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}

/** Relógio falso: guarda os agendamentos e roda quando o teste manda. */
function relogio() {
  /** @type {Map<number, () => void>} */ const fila = new Map();
  let n = 0;
  return {
    agendar: (fn) => { fila.set(++n, fn); return n; },
    cancelar: (t) => { fila.delete(t); },
    pendentes: () => fila.size,
    async rodar() {
      const fns = [...fila.values()]; fila.clear();
      for (const fn of fns) fn();
      await new Promise((r) => setTimeout(r, 0)); // deixa as promessas do envio andarem
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const blobV1 = () => ({
  seq: 2, produtos: [{ id: 'energetico', nome: 'Energético', preco: 10 }], feriados: { '2026-10-12': false },
  alunos: [
    { id: '001', nome: 'Ana', email: 'Ana@Box.com', criadoEm: 1, avaliacoes: [{ num: 1, peso: 70 }], feedbacks: [{ id: 'f1', criadoEm: 1 }] },
    { id: '002', nome: 'Bia', criadoEm: 2, avaliacoes: [] },
  ],
});

/** Um aparelho: cache próprio, sync próprio, mesma nuvem. */
function aparelho(porta, { storage = armazenamento(), nome = 'pc', migrar } = /** @type {any} */ ({})) {
  const cache = criarCache({ storage });
  const rel = relogio();
  const escritas = [];
  const gravarLote = porta.gravarLote;
  porta.gravarLote = async (ops) => { escritas.push(...ops); return gravarLote(ops); };
  const sync = criarSync({ cache, abrirPorta: async () => porta, aparelho: nome, relogio: rel, log: () => {}, ...(migrar ? { migrar } : {}) });
  return { cache, sync, rel, escritas };
}

test('primeiro login com a nuvem no v1: migra, fica em v2 e o cache tem tudo', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync } = aparelho(porta);
  let avisos = 0;
  assert.equal(await sync.iniciar('uid', () => { avisos++; }), 'v2');
  assert.equal(porta.docs.get('').schema, 2);
  assert.ok(!('alunos' in porta.docs.get('')));
  assert.equal(cache.obter('001').feedbacks[0].id, 'f1');
  assert.equal(cache.obter('001').avaliacoes[0].peso, 70);
  assert.ok(avisos >= 1, 'a tela foi avisada');
  assert.deepEqual(cache.fila(), {}, 'nada pendente depois de carregar');
});

test('edição do dia a dia sobe SÓ o documento que mudou, depois do debounce', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync, rel, escritas } = aparelho(porta);
  await sync.iniciar('uid');
  escritas.length = 0;

  cache.gravarAluno({ ...cache.obter('002'), telefone: '1199' });
  sync.agendarEnvio();
  assert.equal(escritas.length, 0, 'nada antes do debounce');
  await rel.rodar();
  assert.deepEqual(escritas.map((o) => o.caminho?.join('/') ?? o.tipo), ['alunos/002']);
  assert.equal(porta.docs.get('alunos/002').telefone, '1199');
  assert.equal(porta.docs.get('alunos/001').nome, 'Ana', 'a outra ficha nem foi tocada');
  assert.deepEqual(cache.fila(), {});
});

test('aparelho no formato novo recebe o que o outro gravou, sem perder a própria edição pendente', async () => {
  const porta = portaEmMemoria(blobV1());
  const pc = aparelho(porta, { nome: 'pc' });
  await pc.sync.iniciar('uid');

  // O celular entra depois (já v2), e edita a Bia.
  const cel = aparelho(porta, { nome: 'cel' });
  await cel.sync.iniciar('uid');
  cel.cache.gravarAluno({ ...cel.cache.obter('002'), nome: 'Bia (celular)' });
  await cel.sync.enviarAgora();

  // O pc, offline, editou a Ana e não conseguiu enviar; abre de novo.
  pc.cache.gravarAluno({ ...pc.cache.obter('001'), nome: 'Ana (pc)' });
  await pc.sync.iniciar('uid');
  assert.equal(pc.cache.obter('002').nome, 'Bia (celular)', 'veio da nuvem');
  assert.equal(pc.cache.obter('001').nome, 'Ana (pc)', 'a pendência local não foi engolida');
  assert.equal(porta.docs.get('alunos/001').nome, 'Ana (pc)', 'e subiu no login');
});

test('outro aparelho migrando: modo local, edições na fila, e quando a migração termina tudo sobe', async () => {
  const porta = portaEmMemoria({ ...blobV1(), migracao: { status: 'andando', em: Date.now(), aparelho: 'celular' } });
  const { cache, sync, rel, escritas } = aparelho(porta, { nome: 'pc' });
  assert.equal(await sync.iniciar('uid'), 'local');
  assert.equal(cache.obter('001').nome, 'Ana', 'mostra o blob da nuvem enquanto isso');

  cache.gravarAluno({ ...cache.obter('001'), nome: 'Ana editada no modo local' });
  sync.agendarEnvio();
  await sync.enviarAgora(); // nem pedindo
  assert.deepEqual(escritas, [], 'nada subiu: a nuvem ainda é v1');
  assert.ok(Array.isArray(porta.docs.get('').alunos));
  assert.ok(Object.keys(cache.fila()).length, 'a edição está na fila');

  // O celular "morre" e a trava fica velha: a nova tentativa migra e sobe a fila.
  porta.docs.set('', { ...porta.docs.get(''), migracao: { status: 'andando', em: 0, aparelho: 'celular' } });
  assert.equal(rel.pendentes(), 1, 'nova tentativa agendada');
  await rel.rodar();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sync.modo(), 'v2');
  assert.equal(porta.docs.get('').schema, 2);
  assert.equal(porta.docs.get('alunos/001').nome, 'Ana editada no modo local');
});

test('migração bloqueada por dado inválido: fica local e não insiste', async () => {
  const porta = portaEmMemoria({ alunos: [{ id: '001' }, { id: '001' }] });
  const erro = console.error; console.error = () => {};
  try {
    const { sync, rel } = aparelho(porta);
    assert.equal(await sync.iniciar('uid'), 'local');
    assert.equal(rel.pendentes(), 0);
  } finally { console.error = erro; }
});

test('coach novo, nuvem vazia: primeira gravação cria o meta já como v2', async () => {
  const porta = portaEmMemoria(null);
  const { cache, sync } = aparelho(porta);
  assert.equal(await sync.iniciar('uid'), 'v2');
  cache.gravarMeta({ seq: 1 });
  cache.gravarAluno({ id: '001', nome: 'Primeiro', email: 'P@x.com', avaliacoes: [] });
  await sync.enviarAgora();
  assert.deepEqual(porta.docs.get(''), { seq: 1, schema: 2 });
  assert.equal(porta.docs.get('alunos/001').emailNorm, 'p@x.com');
});

test('nuvem v2 sem alunos e aparelho com alunos: semeia a nuvem (como o v1 fazia)', async () => {
  const porta = portaEmMemoria({ schema: 2, seq: 0 });
  const storage = armazenamento({ [CHAVE_V1]: JSON.stringify(blobV1()) });
  const { sync } = aparelho(porta, { storage });
  await sync.iniciar('uid');
  assert.equal(porta.docs.get('alunos/001').nome, 'Ana');
  assert.equal(porta.docs.get('alunos/001/avaliacoes/1').peso, 70);
  assert.equal(porta.docs.get('').seq, 2);
});

test('rede cai no envio: a fila fica, e o próximo envio manda', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync } = aparelho(porta);
  await sync.iniciar('uid');
  const gravar = porta.gravarLote;
  porta.gravarLote = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
  cache.gravarAluno({ ...cache.obter('001'), nome: 'Offline' });
  await assert.rejects(sync.enviarAgora());
  assert.ok('alunos/001' in cache.fila());
  porta.gravarLote = gravar;
  await sync.enviarAgora();
  assert.equal(porta.docs.get('alunos/001').nome, 'Offline');
  assert.deepEqual(cache.fila(), {});
});

test('edição feita com o lote no ar não se perde', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync } = aparelho(porta);
  await sync.iniciar('uid');
  const gravar = porta.gravarLote;
  let soltar;
  porta.gravarLote = (ops) => new Promise((r) => { soltar = () => r(gravar(ops)); });
  cache.gravarAluno({ ...cache.obter('001'), nome: 'V1' });
  const envio = sync.enviarAgora();
  await new Promise((r) => setTimeout(r, 0));
  cache.gravarAluno({ ...cache.obter('001'), nome: 'V2' }); // durante o voo
  const segundo = sync.enviarAgora();
  porta.gravarLote = gravar;
  soltar();
  await envio; await segundo;
  assert.equal(porta.docs.get('alunos/001').nome, 'V2');
  assert.deepEqual(cache.fila(), {});
});

test('remover aluno apaga a ficha e os filhos na nuvem; feriado desmarcado some do meta', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync } = aparelho(porta);
  await sync.iniciar('uid');
  cache.removerAluno('001');
  cache.gravarMeta({ feriados: {} });
  await sync.enviarAgora();
  assert.ok(![...porta.docs.keys()].some((k) => k.startsWith('alunos/001')));
  assert.deepEqual(porta.docs.get('').feriados, {});
  assert.equal(porta.docs.get('').schema, 2);
  assert.equal(porta.docs.get('').migracao.status, 'concluida', 'o meta não perdeu o registro da migração');
});

test('box grande: 600 edições pendentes sobem em lotes de no máximo 500', async () => {
  const alunos = Array.from({ length: 600 }, (_, i) => ({ id: `a${i}`, nome: `A${i}`, avaliacoes: [] }));
  const porta = portaEmMemoria({ seq: 600, alunos });
  const { cache, sync } = aparelho(porta);
  await sync.iniciar('uid');
  const tamanhos = [];
  const gravar = porta.gravarLote;
  porta.gravarLote = async (ops) => { tamanhos.push(ops.length); return gravar(ops); };
  for (const a of cache.todos()) cache.gravarAluno({ ...a, status: 'inativo' });
  await sync.enviarAgora();
  assert.deepEqual(tamanhos, [500, 100]);
});

/* ---------- a ficha por campo e o servidor gravando (Fase 1 · etapa 1) ---------- */

test('o servidor grava na ficha enquanto o coach edita outro campo: nada se perde, e a tela vê na hora', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync, rel } = aparelho(porta);
  let avisos = 0;
  await sync.iniciar('uid', () => { avisos++; });
  const antes = avisos;

  // O servidor dá a baixa do Pix da Ana (Admin SDK): a Gestão aberta vê ao vivo.
  porta.gravarComoServidor('001', { pagamentos: { '2026-11': true }, pixPagos: { '2026-11': 'p1' } });
  assert.deepEqual(cache.obter('001').pagamentos, { '2026-11': true });
  assert.equal(avisos, antes + 1, 'a tela foi avisada');

  // O coach, com a ficha aberta, troca o telefone dela.
  cache.gravarAluno({ ...cache.obter('001'), telefone: '1199' });
  sync.agendarEnvio();
  await rel.rodar();
  const naNuvem = porta.docs.get('alunos/001');
  assert.equal(naNuvem.telefone, '1199');
  assert.deepEqual(naNuvem.pagamentos, { '2026-11': true }, 'a baixa do servidor ficou');
  assert.deepEqual(naNuvem.pixPagos, { '2026-11': 'p1' });
  assert.equal(avisos, antes + 1, 'a própria gravação voltando da nuvem não redesenha a tela');
});

test('mesmo com a edição do coach PENDENTE (cache velho), a gravação por campo não apaga o que o servidor pôs', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync } = aparelho(porta);
  await sync.iniciar('uid');
  sync.parar(); // sem ouvir: o cache daqui não fica sabendo do servidor
  cache.gravarAluno({ ...cache.obter('001'), presencas: ['2026-11-03'], telefone: '1199' });
  porta.gravarComoServidor('001', { presencas: ['2026-11-04'], presencaHoras: { '2026-11-04': '18:12' } });
  await sync.enviarAgora();
  const naNuvem = porta.docs.get('alunos/001');
  assert.deepEqual(naNuvem.presencas, ['2026-11-03', '2026-11-04'], 'as duas presenças: o conjunto somou');
  assert.deepEqual(naNuvem.presencaHoras, { '2026-11-04': '18:12' });
  assert.equal(naNuvem.telefone, '1199');
});

test('dois aparelhos editando campos diferentes da mesma ficha ao mesmo tempo: os dois ficam', async () => {
  const porta = portaEmMemoria(blobV1());
  const pc = aparelho(porta, { nome: 'pc' });
  await pc.sync.iniciar('uid');
  pc.sync.parar();
  const cel = aparelho(porta, { nome: 'cel' });
  await cel.sync.iniciar('uid');
  cel.sync.parar();
  pc.cache.gravarAluno({ ...pc.cache.obter('002'), telefone: 'do pc' });
  cel.cache.gravarAluno({ ...cel.cache.obter('002'), obs: 'do celular' });
  await pc.sync.enviarAgora();
  await cel.sync.enviarAgora();
  const b = porta.docs.get('alunos/002');
  assert.equal(b.telefone, 'do pc');
  assert.equal(b.obs, 'do celular', 'antes, o último a gravar levava a ficha inteira e apagava o outro');
});

test('ficha apagada em outro aparelho e editada aqui: volta inteira (a edição do coach não se perde)', async () => {
  const porta = portaEmMemoria(blobV1());
  const { cache, sync } = aparelho(porta);
  await sync.iniciar('uid');
  sync.parar();
  cache.gravarAluno({ ...cache.obter('002'), telefone: '1' });
  porta.docs.delete('alunos/002');
  await sync.enviarAgora();
  assert.equal(porta.docs.get('alunos/002').telefone, '1');
  assert.equal(porta.docs.get('alunos/002').nome, 'Bia');
});

test('a nuvem recusa a gravação: a fila fica e quem avisa o coach é chamado', async () => {
  const porta = portaEmMemoria(blobV1());
  const cache = criarCache({ storage: armazenamento() });
  const rel = relogio();
  const erros = [];
  const sync = criarSync({ cache, abrirPorta: async () => porta, relogio: rel, log: () => {}, aoErro: (e) => erros.push(e.code) });
  await sync.iniciar('uid');
  porta.gravarLote = async () => { throw Object.assign(new Error('negado'), { code: 'permission-denied' }); };
  const avisoConsole = console.warn; console.warn = () => {};
  try {
    cache.gravarAluno({ ...cache.obter('001'), nome: 'X' });
    sync.agendarEnvio();
    await rel.rodar();
  } finally { console.warn = avisoConsole; }
  assert.deepEqual(erros, ['permission-denied']);
  assert.ok('alunos/001' in cache.fila());
});
