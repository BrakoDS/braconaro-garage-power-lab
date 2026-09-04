// @ts-check
/**
 * Teste de PARIDADE entre a tela e o core, para o Treino Livre.
 *
 * O achado da revisão da Task 3: `gruposDoBloco`/`linhasIncompletas` (tela) e a
 * regra de agrupamento de `montarLivre` (core) são DUAS CÓPIAS da mesma regra —
 * e cópias divergem. Se divergirem, a barra de salvar mente pro coach: diz "não
 * vai pro aluno" para uma linha que o core salva, ou o contrário. Esse já foi o
 * bug caro desta aba.
 *
 * Este arquivo importa `./livre.js` DE VERDADE (não uma terceira cópia — uma
 * cópia só prova a cópia) e prova, cenário a cenário, que o conjunto de linhas
 * que `linhasIncompletas()` acusa é exatamente o COMPLEMENTO do que
 * `montarLivre()` de fato salva.
 *
 * `livre.js` só toca `document`/`localStorage`/`window` DENTRO de funções de
 * tela (render, eventos, boot) — os helpers puros usados aqui
 * (`gruposDoBloco`, `linhasIncompletas`, `est`) não chamam nada disso. Os
 * stubs abaixo existem só porque o import em cadeia (`store.js`,
 * `academia/db.js`, `portal-treino.js`) referencia esses globais dentro de
 * função, e o Node não os tem por padrão fora do browser — carregar o módulo
 * não exige mais do que isto.
 *
 * Rodar: node --test montador/ui/livre.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Os stubs têm de existir ANTES de `livre.js` carregar: `academia/db.js`, que
// entra na cadeia de import dele, chama `localStorage` no CARREGAMENTO do
// módulo (`garantirSeed()` roda solto no topo do arquivo, não dentro de uma
// função). Um `import` estático de `./livre.js` no topo deste arquivo rodaria
// ANTES do corpo deste módulo (é assim que import funciona), stubs inclusive —
// por isso o import é dinâmico aqui: só depois que os globais abaixo existem.
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

const { est, gruposDoBloco, linhasIncompletas, num, herdar } = await import('./livre.js');
const { montarLivre } = await import('../core/livre.js');
const { EXERCICIOS } = await import('../data/exercicios.js');

/** Mesmo `porId` que `livre.js` usa internamente — o catálogo é o mesmo array
 * importado (módulos ES cacheiam), então as duas leituras nunca podem divergir
 * por causa do catálogo em si; só a REGRA pode divergir, que é o que este
 * arquivo testa. */
const porId = (id) => EXERCICIOS.find((e) => e.id === id) || null;
/** Um punhado de ids reais do catálogo, só para ter "exercício válido" nas linhas. */
const IDS = EXERCICIOS.slice(0, 10).map((e) => e.id);

/**
 * O coração do teste: para um array de blocos, toda linha com exercício
 * válido tem de estar SALVA no snapshot XOR REPORTADA por `linhasIncompletas`
 * — nunca as duas coisas, nunca nenhuma das duas.
 * @param {any[]} blocos
 */
function checarParidade(blocos) {
  est.blocos = blocos;
  const incompletas = new Set(linhasIncompletas());
  const { extra } = montarLivre({ blocos, porId });
  const idsSalvos = new Set();
  extra.livre.blocos.forEach((b) => b.exercicios.forEach((e) => idsSalvos.add(e.id)));

  blocos.forEach((b, bi) => {
    // Mesmo cálculo de nome que `linhasIncompletas` faz — usado só para achar
    // o rótulo na lista de incompletas; irrelevante para bloco de WOD, porque
    // `gruposDoBloco` já devolve [] para ele e nenhum rótulo chega a existir.
    const nome = String(b.nome || '').trim() || `Bloco ${bi + 1}`;
    (b.exercicios || []).forEach((l, li) => {
      if (!l.id || !porId(l.id)) return; // linha sem exercício válido não entra na conta de nenhum dos dois lados
      const marcada = incompletas.has(`${nome} · linha ${li + 1}`);
      const salva = idsSalvos.has(l.id);
      assert.notEqual(marcada, salva,
        `bloco "${nome}" linha ${li + 1} (id ${l.id}): marcada-incompleta=${marcada}, salva-pelo-core=${salva} — tinham que ser opostos`);
    });
  });
}

/* ---------- cenários de série (bloco tipo 'series') ---------- */

test('série vazia na linha E no bloco — grupo cai, linha some dos dois lados igual', () => {
  const blocos = [{ nome: 'A', series: '', exercicios: [{ id: IDS[0], series: '' }] }];
  checarParidade(blocos);
  const { nItens } = montarLivre({ blocos, porId });
  assert.equal(nItens, 0, 'sem série em lugar nenhum, nada é salvo');
  assert.deepEqual(linhasIncompletas(), ['A · linha 1']);
});

test('série 0 — zero não é série que preste, nos dois lados', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [{ id: IDS[0], series: 0 }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), ['A · linha 1']);
});

test('série negativa — igualmente inválida nos dois lados', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [{ id: IDS[0], series: -3 }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), ['A · linha 1']);
});

test('série com vírgula decimal — "3,5" é série válida nos dois lados', () => {
  const blocos = [{ nome: 'A', series: '', exercicios: [{ id: IDS[0], series: '3,5' }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), [], 'vírgula decimal não pode acusar incompleta');
  const { nItens } = montarLivre({ blocos, porId });
  assert.equal(nItens, 1, 'e o core tem de ter salvo a linha de verdade — não é só as duas concordarem em estar erradas');
});

test('líder sem exercício válido — a 2ª linha válida vira líder e ignora o próprio linkado', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [
    { id: '', series: 5 },                       // sem exercício: nem entra na conta
    { id: IDS[0], linkado: true },                // primeira linha VÁLIDA: linkado é ignorado por design
  ] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), [], 'o líder (linha 2, a única válida) herda a série do bloco e fecha o grupo');
});

test('linkado na primeira linha do bloco — não há a quem linkar, e o próprio linkado é ignorado', () => {
  const blocos = [{ nome: 'A', series: 4, exercicios: [{ id: IDS[0], linkado: true }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), []);
});

test('linha vazia no meio de uma cadeia — a linha 3 linka através da linha 2 vazia, direto na linha 1', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [
    { id: IDS[0] },                               // líder
    { id: '' },                                    // vazia: invisível para o agrupamento dos dois lados
    { id: IDS[1], linkado: true },                  // linka com o líder, "pulando" a linha vazia
  ] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), [], 'as duas linhas válidas fecham o grupo pela série do líder');
  const grupos = gruposDoBloco(blocos[0]);
  assert.equal(grupos.length, 1, 'líder + linha 3 formam UM grupo só — a vazia não quebra a cadeia');
  assert.equal(grupos[0].membros.length, 2);
});

test('bloco inteiro sem série — todas as linhas caem nos dois lados', () => {
  const blocos = [{ nome: 'A', series: '', exercicios: [{ id: IDS[0] }, { id: IDS[1], linkado: true }, { id: IDS[2] }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), ['A · linha 1', 'A · linha 2', 'A · linha 3']);
  const { nItens } = montarLivre({ blocos, porId });
  assert.equal(nItens, 0);
});

/* ---------- bloco de WOD: nunca pode aparecer como incompleto ---------- */

test('bloco de WOD nunca aparece em linhasIncompletas — a regra de série não se aplica a ele', () => {
  const blocos = [{ tipo: 'wod', nome: 'Metcon', formato: 'AMRAP', duracaoMin: 12,
    exercicios: [{ id: IDS[0], prescricao: '10 reps' }, { id: IDS[1], prescricao: '' }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), [], 'WOD não tem série — a regra de série jamais se aplica a ele');
  const { nItens } = montarLivre({ blocos, porId });
  assert.equal(nItens, 2, 'os dois movimentos são salvos, com ou sem prescrição — isso é outro aviso, não este');
});

test('bloco de WOD sem NENHUMA linha com série no objeto ainda não é incompleto', () => {
  // O caso mais direto do achado: um bloco `{tipo:'wod', exercicios:[{id,prescricao}]}`
  // não tem `series` em lugar nenhum — nem no bloco, nem nas linhas. Antes do
  // fix, isso fazia `linhasIncompletas` acusar "WOD · linha 1" enquanto o core
  // salvava normal.
  const blocos = [{ tipo: 'wod', formato: 'EMOM', duracaoMin: 16, exercicios: [{ id: IDS[0], prescricao: '' }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), []);
});

/* ---------- mistura: um bloco de série e um de WOD no mesmo dia ---------- */

test('bloco de série incompleto ao lado de um WOD completo — cada um só acusa o que é seu', () => {
  const blocos = [
    { nome: 'Força', series: '', exercicios: [{ id: IDS[0] }] },
    { tipo: 'wod', nome: 'Cardio', formato: 'For Time', rodadas: 3, exercicios: [{ id: IDS[1], prescricao: '400m' }] },
  ];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(), ['Força · linha 1']);
});

/* ---------- num / herdar: a regra que sustenta tudo acima ---------- */

test('num aceita vírgula decimal e rejeita lixo', () => {
  assert.equal(num('3,5'), 3.5);
  assert.equal(num('4'), 4);
  assert.equal(num(''), null);
  assert.equal(num(undefined), null);
  assert.equal(num('abc'), null);
});

test('herdar usa o valor da linha quando existe, senão cai pro do bloco', () => {
  assert.equal(herdar(5, 3), 5);
  assert.equal(herdar('', 3), 3);
  assert.equal(herdar(undefined, 3), 3);
  assert.equal(herdar(0, 3), 0, '0 é um valor definido — não deve herdar');
});
