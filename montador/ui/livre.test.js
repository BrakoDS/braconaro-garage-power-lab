// @ts-check
/**
 * Teste de PARIDADE entre a tela e o core, para o Treino Livre — e (Task 4) das
 * três portas de pesquisa (exercício, mobilidade, técnica) que ligam o Treino
 * Livre ao modal de pesquisa/cadastro.
 *
 * O achado da revisão da Task 3: `gruposDoBloco`/`linhasIncompletas` (tela) e a
 * regra de agrupamento de `montarLivre` (core) são DUAS CÓPIAS da mesma regra —
 * e cópias divergem. Se divergirem, a barra de salvar mente pro coach: diz "não
 * vai pro aluno" para uma linha que o core salva, ou o contrário. Esse já foi o
 * bug caro desta aba.
 *
 * Este arquivo importa `./livre.js` DE VERDADE (não uma terceira cópia — uma
 * cópia só prova a cópia) e prova, cenário a cenário, que o conjunto de linhas
 * que `linhasIncompletas(blocos)` acusa é exatamente o COMPLEMENTO do que
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
 * PARA AS PORTAS DE PESQUISA (Task 4), os stubs precisam de um pouco mais:
 * `pesquisarEAdicionar`/`pesquisarTecnica` terminam chamando `escolher()`, que
 * chama `render()` de verdade — então o stub de `document` ganhou elementos
 * fake "auto-criados" por seletor (suportam `.value`/`.innerHTML`/`.dataset`,
 * nada além disso) para `render()` não quebrar em `$('#l-corpo').innerHTML = …`
 * etc. E o stub de `localStorage` passou a persistir de verdade (um Map em
 * memória) — sem isso, `academia.salvarExerc()` "gravaria" e a leitura seguinte
 * voltaria vazia, e `construirCatalogoEfetivo()` nunca veria o exercício novo.
 * Não é preciso simular clique/evento nenhum: as portas são chamadas direto
 * (são funções exportadas), e a Cloud Function real é substituída por um
 * dublê via `_definirAbrirPesquisaDeTeste`/`_definirPedirTermoTecnicaDeTeste`
 * (não dá pra chamá-la de verdade neste teste — chave de API fica no Secret
 * Manager e a function exige a conta do coach).
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
/** Elemento fake mínimo: só o que `render()`/`escolher()` tocam (ver comentário
 * acima). Cada chamada a `document.querySelector(sel)` devolve sempre a MESMA
 * instância para o mesmo seletor (registro em `elementosPorSeletor`), porque
 * `render()` escreve e relê o mesmo elemento em passagens diferentes. */
function elementoFake() {
  return /** @type {any} */ ({
    value: '',
    checked: false,
    dataset: {},
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    focus() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  });
}
const elementosPorSeletor = new Map();
function elementoPara(sel) {
  if (!elementosPorSeletor.has(sel)) elementosPorSeletor.set(sel, elementoFake());
  return elementosPorSeletor.get(sel);
}
globalThis.document = /** @type {any} */ ({
  querySelector: (sel) => elementoPara(sel),
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => elementoFake(),
  body: elementoFake(),
});
globalThis.window = globalThis;
if (!globalThis.localStorage) {
  // Map em memória, não os dois `() => {}` de antes: as portas de pesquisa
  // gravam na Academia (`academia.salvarExerc`/`salvarTecnica`) e o teste
  // precisa reler o que gravou (`construirCatalogoEfetivo` lê `localStorage`
  // de novo, não guarda cópia).
  const armazenamento = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
    setItem: (k, v) => { armazenamento.set(k, String(v)); },
  });
}

const {
  gruposDoBloco, linhasIncompletas, num, herdar,
  _estadoParaTeste, pesquisarEAdicionar, pesquisarTecnica,
  _definirAbrirPesquisaDeTeste, _definirPedirTermoTecnicaDeTeste,
} = await import('./livre.js');
const { montarLivre } = await import('../core/livre.js');
const { EXERCICIOS } = await import('../data/exercicios.js');
const academia = await import('../../academia/db.js');

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
  // Os blocos entram por PARÂMETRO: a função de produção é a mesma, e nenhum
  // estado do módulo precisa ficar exposto para o teste existir.
  const incompletas = new Set(linhasIncompletas(blocos));
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
  assert.deepEqual(linhasIncompletas(blocos), ['A · linha 1']);
});

test('série 0 — zero não é série que preste, nos dois lados', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [{ id: IDS[0], series: 0 }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), ['A · linha 1']);
});

test('série negativa — igualmente inválida nos dois lados', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [{ id: IDS[0], series: -3 }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), ['A · linha 1']);
});

test('série com vírgula decimal — "3,5" é série válida nos dois lados', () => {
  const blocos = [{ nome: 'A', series: '', exercicios: [{ id: IDS[0], series: '3,5' }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), [], 'vírgula decimal não pode acusar incompleta');
  const { nItens } = montarLivre({ blocos, porId });
  assert.equal(nItens, 1, 'e o core tem de ter salvo a linha de verdade — não é só as duas concordarem em estar erradas');
});

test('líder sem exercício válido — a 2ª linha válida vira líder e ignora o próprio linkado', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [
    { id: '', series: 5 },                       // sem exercício: nem entra na conta
    { id: IDS[0], linkado: true },                // primeira linha VÁLIDA: linkado é ignorado por design
  ] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), [], 'o líder (linha 2, a única válida) herda a série do bloco e fecha o grupo');
});

test('linkado na primeira linha do bloco — não há a quem linkar, e o próprio linkado é ignorado', () => {
  const blocos = [{ nome: 'A', series: 4, exercicios: [{ id: IDS[0], linkado: true }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), []);
});

test('linha vazia no meio de uma cadeia — a linha 3 linka através da linha 2 vazia, direto na linha 1', () => {
  const blocos = [{ nome: 'A', series: 3, exercicios: [
    { id: IDS[0] },                               // líder
    { id: '' },                                    // vazia: invisível para o agrupamento dos dois lados
    { id: IDS[1], linkado: true },                  // linka com o líder, "pulando" a linha vazia
  ] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), [], 'as duas linhas válidas fecham o grupo pela série do líder');
  const grupos = gruposDoBloco(blocos[0]);
  assert.equal(grupos.length, 1, 'líder + linha 3 formam UM grupo só — a vazia não quebra a cadeia');
  assert.equal(grupos[0].membros.length, 2);
});

test('bloco inteiro sem série — todas as linhas caem nos dois lados', () => {
  const blocos = [{ nome: 'A', series: '', exercicios: [{ id: IDS[0] }, { id: IDS[1], linkado: true }, { id: IDS[2] }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), ['A · linha 1', 'A · linha 2', 'A · linha 3']);
  const { nItens } = montarLivre({ blocos, porId });
  assert.equal(nItens, 0);
});

/* ---------- bloco de WOD: nunca pode aparecer como incompleto ---------- */

test('bloco de WOD nunca aparece em linhasIncompletas — a regra de série não se aplica a ele', () => {
  const blocos = [{ tipo: 'wod', nome: 'Metcon', formato: 'AMRAP', duracaoMin: 12,
    exercicios: [{ id: IDS[0], prescricao: '10 reps' }, { id: IDS[1], prescricao: '' }] }];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), [], 'WOD não tem série — a regra de série jamais se aplica a ele');
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
  assert.deepEqual(linhasIncompletas(blocos), []);
});

/* ---------- mistura: um bloco de série e um de WOD no mesmo dia ---------- */

test('bloco de série incompleto ao lado de um WOD completo — cada um só acusa o que é seu', () => {
  const blocos = [
    { nome: 'Força', series: '', exercicios: [{ id: IDS[0] }] },
    { tipo: 'wod', nome: 'Cardio', formato: 'For Time', rodadas: 3, exercicios: [{ id: IDS[1], prescricao: '400m' }] },
  ];
  checarParidade(blocos);
  assert.deepEqual(linhasIncompletas(blocos), ['Força · linha 1']);
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

/* ============================================================================
 * TASK 4 — as três portas de pesquisa (exercício, mobilidade, técnica).
 *
 * `abrirPesquisa`/o pedido de termo da técnica são sempre substituídos por um
 * dublê (`_definirAbrirPesquisaDeTeste`/`_definirPedirTermoTecnicaDeTeste`) —
 * não dá pra chamar a Cloud Function de verdade aqui (chave no Secret Manager,
 * exige a conta do coach). O dublê do exercício/mobilidade GRAVA de verdade na
 * Academia (`academia.salvarExerc`), porque é exatamente essa gravação real
 * que `construirCatalogoEfetivo()` precisa enxergar para provar que o catálogo
 * foi reconstruído — um dublê que só devolve um id inventado não provaria nada.
 * ========================================================================= */

test('porta do exercício: pesquisar e cadastrar manda contexto "exercicio", reconstrói o catálogo e seleciona a linha', async () => {
  const est = _estadoParaTeste();
  est.blocos.length = 0;
  est.blocos.push({ tipo: 'series', nome: 'A', series: 3, reps: '10', exercicios: [{ id: '' }] });

  const chamadas = [];
  _definirAbrirPesquisaDeTeste(async ({ termo, contexto }) => {
    chamadas.push({ termo, contexto });
    const criado = academia.salvarExerc({ nome: termo, padrao: 'quadriceps', ativo: true });
    return { id: criado.id };
  });

  const input = /** @type {any} */ ({ value: 'Levantamento Terra Sumô Novo', dataset: { alvo: 'ex', b: '0', l: '0' } });
  await pesquisarEAdicionar(input);

  assert.deepEqual(chamadas, [{ termo: 'Levantamento Terra Sumô Novo', contexto: 'exercicio' }]);
  const idNaLinha = est.blocos[0].exercicios[0].id;
  assert.ok(idNaLinha, 'a linha recebeu o id do que foi cadastrado');
  assert.ok(EXERCICIOS.some((e) => e.id === idNaLinha),
    'construirCatalogoEfetivo() rodou — sem ela o exercício novo não apareceria em EXERCICIOS, e a linha ficaria "selecionada" num id que a busca nunca acha');
});

test('porta do exercício: cancelar no modal deixa a linha exatamente como estava', async () => {
  const est = _estadoParaTeste();
  est.blocos.length = 0;
  const linha = { id: IDS[0], series: 4, reps: '8' };
  est.blocos.push({ tipo: 'series', nome: 'A', series: 3, exercicios: [linha] });
  const antes = JSON.stringify(linha);

  _definirAbrirPesquisaDeTeste(async () => null); // coach cancelou o modal

  const input = /** @type {any} */ ({ value: 'Algo Que Não Existe', dataset: { alvo: 'ex', b: '0', l: '0' } });
  await pesquisarEAdicionar(input);

  assert.equal(JSON.stringify(est.blocos[0].exercicios[0]), antes, 'cancelar não pode mudar nada na linha');
});

test('porta do Aquecimento/Mobilidade: mesmo aviso, mas o contexto enviado é "mobilidade"', async () => {
  const est = _estadoParaTeste();
  est.aquecimento.length = 0;
  est.aquecimento.push({ id: '', duracaoSeg: 60 });

  const chamadas = [];
  _definirAbrirPesquisaDeTeste(async ({ termo, contexto }) => {
    chamadas.push({ termo, contexto });
    const criado = academia.salvarExerc({ nome: termo, padrao: 'core', ativo: true, tags: ['MOBILIDADE'] });
    return { id: criado.id };
  });

  const input = /** @type {any} */ ({ value: 'Mobilidade De Tornozelo Nova', dataset: { alvo: 'aquec', i: '0' } });
  await pesquisarEAdicionar(input);

  assert.equal(chamadas[0].contexto, 'mobilidade');
  const idNaLinha = est.aquecimento[0].id;
  assert.ok(EXERCICIOS.some((e) => e.id === idNaLinha), 'catálogo reconstruído também nesta porta');
});

test('porta da mobilidade: cancelar deixa a linha de aquecimento intacta', async () => {
  const est = _estadoParaTeste();
  est.aquecimento.length = 0;
  const linha = { id: '', duracaoSeg: 45 };
  est.aquecimento.push(linha);
  const antes = JSON.stringify(linha);

  _definirAbrirPesquisaDeTeste(async () => null);

  const input = /** @type {any} */ ({ value: 'Sei Lá O Quê', dataset: { alvo: 'aquec', i: '0' } });
  await pesquisarEAdicionar(input);

  assert.equal(JSON.stringify(est.aquecimento[0]), antes);
});

test('seletor de técnica: escolher "— pesquisar nova técnica…" reverte o select NA HORA (síncrono, antes de qualquer await)', async () => {
  const est = _estadoParaTeste();
  est.blocos.length = 0;
  est.blocos.push({ tipo: 'series', nome: 'A', series: 3, exercicios: [{ id: IDS[0] }] }); // sem técnica

  _definirPedirTermoTecnicaDeTeste(async () => null); // nunca resolve nada visível antes do assert abaixo
  _definirAbrirPesquisaDeTeste(async () => { throw new Error('não deveria ser chamada'); });

  const select = /** @type {any} */ ({ value: '__pesquisar__', dataset: { b: '0', l: '0' } });
  const promessa = pesquisarTecnica(select);
  // A reversão roda ANTES do primeiro `await` de `pesquisarTecnica` — já vale
  // mesmo sem esperar a Promise, que é exatamente o que evita o select ficar
  // preso na opção de pesquisar enquanto o coach decide o termo.
  assert.equal(select.value, '', 'sem técnica anterior, volta pro "— sem técnica —" (value vazio)');
  await promessa;
});

test('seletor de técnica: com técnica já escolhida, reverte para ELA (não para vazio)', async () => {
  const est = _estadoParaTeste();
  est.blocos.length = 0;
  const linha = { id: IDS[0], tecnica: { tipo: 'drop_set', label: 'Drop Set', detalhe: 'x' } };
  est.blocos.push({ tipo: 'series', nome: 'A', series: 3, exercicios: [linha] });

  _definirPedirTermoTecnicaDeTeste(async () => null); // coach fechou o pedido de termo sem digitar nada
  _definirAbrirPesquisaDeTeste(async () => { throw new Error('sem termo, a pesquisa nem deveria abrir'); });

  const select = /** @type {any} */ ({ value: '__pesquisar__', dataset: { b: '0', l: '0' } });
  const promessa = pesquisarTecnica(select);
  assert.equal(select.value, 'drop_set', 'reverte para a técnica que já estava, não para vazio');
  await promessa;
  assert.equal(linha.tecnica.tipo, 'drop_set', 'sem termo, a pesquisa nem chega a abrir — nada muda na linha');
});

test('seletor de técnica: cadastrar manda contexto "tecnica" e a linha recebe a técnica nova', async () => {
  const est = _estadoParaTeste();
  est.blocos.length = 0;
  est.blocos.push({ tipo: 'series', nome: 'A', series: 3, exercicios: [{ id: IDS[0] }] });

  const chamadas = [];
  _definirPedirTermoTecnicaDeTeste(async () => 'Rest-Pause');
  _definirAbrirPesquisaDeTeste(async ({ termo, contexto }) => {
    chamadas.push({ termo, contexto });
    const criado = academia.salvarTecnica({ nome: termo, resumo: 'r', comoExecutar: 'c', objetivo: 'o', ativo: true });
    return { id: criado.id };
  });

  const select = /** @type {any} */ ({ value: '__pesquisar__', dataset: { b: '0', l: '0' } });
  await pesquisarTecnica(select);

  assert.deepEqual(chamadas, [{ termo: 'Rest-Pause', contexto: 'tecnica' }]);
  assert.ok(est.blocos[0].exercicios[0].tecnica, 'a linha ganhou a técnica cadastrada');
  assert.equal(est.blocos[0].exercicios[0].tecnica.label, 'Rest-Pause');
});

test('seletor de técnica: termo informado mas modal cancelado — a técnica da linha não muda', async () => {
  const est = _estadoParaTeste();
  est.blocos.length = 0;
  const linha = { id: IDS[0], tecnica: { tipo: 'drop_set', label: 'Drop Set', detalhe: 'x' } };
  est.blocos.push({ tipo: 'series', nome: 'A', series: 3, exercicios: [linha] });

  _definirPedirTermoTecnicaDeTeste(async () => 'Miorreps');
  _definirAbrirPesquisaDeTeste(async () => null); // coach cancelou o modal

  const select = /** @type {any} */ ({ value: '__pesquisar__', dataset: { b: '0', l: '0' } });
  await pesquisarTecnica(select);

  assert.equal(linha.tecnica.tipo, 'drop_set', 'cancelar o modal mantém a técnica anterior');
});

// Restaura os dublês para as funções reais — nenhum teste depois deste ponto
// deveria rodar, mas é o hábito seguro caso este arquivo ganhe mais testes.
test('restaura os dublês de pesquisa para as funções reais', () => {
  _definirAbrirPesquisaDeTeste();
  _definirPedirTermoTecnicaDeTeste();
});
