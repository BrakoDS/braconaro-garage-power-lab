// @ts-check
/**
 * A regra do Mural de Recordes do lado coach — o mesmo formato que o app grava.
 *
 * Rodar: node --test coach/recordes/prs.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerEndereco } from '../mensagens/chat.js';
import {
  chaveExercicio,
  dataBr,
  dataValida,
  diasDesde,
  donoDoCaminho,
  ehNovo,
  enderecoDoFiltro,
  filtrarPRs,
  formatarCarga,
  formatarReps,
  lerFiltro,
  linkDeParabens,
  mensagemDeParabens,
  normalizarPR,
  opcoesDeAluno,
  opcoesDeExercicio,
  ordenarPRs,
  primeiroNome,
  resumoDoMural,
  rotuloDaData,
} from './prs.js';

// Horário no fuso local: 28/09/2026 às 10:30.
const AGORA = new Date(2026, 8, 28, 10, 30).getTime();

/** Um PR já normalizado, com o que o teste não disser preenchido. @param {Partial<import('./prs.js').PR>} o */
const pr = (o = {}) => {
  const email = o.email || 'ana@box.com';
  const id = o.id || 'p1';
  return {
    id, email, caminho: `alunos/${email}/prs/${id}`,
    exercicio: 'Deadlift', carga: 120, reps: 1, data: '2026-09-28', criadoEm: AGORA, ...o,
  };
};

const valido = { exercicio: 'Back Squat', carga: 102.5, reps: 5, data: '2026-09-27', criadoEm: AGORA };

test('o dono sai do caminho, e so vale a subcolecao prs de alunos/{email}', () => {
  assert.deepEqual(donoDoCaminho('alunos/Ana@Box.com/prs/abc'), { email: 'ana@box.com', id: 'abc' });
  assert.equal(donoDoCaminho('coaches/uid/prs/abc'), null, 'outro prs no banco nao e PR de aluno');
  assert.equal(donoDoCaminho('alunos/ana@box.com/prs'), null);
  assert.equal(donoDoCaminho('x/alunos/ana@box.com/prs/abc'), null);
  assert.equal(donoDoCaminho('alunos/sem-arroba/prs/abc'), null);
  assert.equal(donoDoCaminho(''), null);
});

test('o PR valido chega inteiro, com o e-mail do caminho', () => {
  assert.deepEqual(normalizarPR('alunos/ana@box.com/prs/p9', valido), {
    id: 'p9', email: 'ana@box.com', caminho: 'alunos/ana@box.com/prs/p9',
    exercicio: 'Back Squat', carga: 102.5, reps: 5, data: '2026-09-27', criadoEm: AGORA,
  });
  const t = normalizarPR('alunos/ana@box.com/prs/p9', { ...valido, exercicio: '  Back   Squat ', criadoEm: { seconds: 1, nanoseconds: 0 } });
  assert.equal(t?.exercicio, 'Back Squat', 'espaco dobrado sai');
  assert.equal(t?.criadoEm, 1000, 'Timestamp do Firestore tambem vale');
});

test('o que foge dos limites do app e da regra nao entra no mural', () => {
  const c = 'alunos/ana@box.com/prs/p1';
  for (const [campo, v] of /** @type {[string, unknown][]} */ ([
    ['exercicio', ''], ['exercicio', '   '], ['exercicio', 'x'.repeat(61)], ['exercicio', 7],
    ['carga', 0], ['carga', -5], ['carga', 500.5], ['carga', '100'], ['carga', NaN], ['carga', Infinity],
    ['reps', 0], ['reps', 51], ['reps', 2.5], ['reps', '5'],
    ['data', '2026-9-27'], ['data', '2026-02-30'], ['data', '27/09/2026'], ['data', undefined],
  ])) {
    assert.equal(normalizarPR(c, { ...valido, [campo]: v }), null, `${campo} = ${String(v)}`);
  }
  assert.ok(normalizarPR(c, { ...valido, carga: 500, reps: 50, exercicio: 'x'.repeat(60) }), 'os tetos valem');
  assert.equal(normalizarPR('chats/ana@box.com/prs/p1', valido), null);
  assert.equal(normalizarPR(c, null), null);
});

test('data valida e so dia que existe no calendario', () => {
  assert.ok(dataValida('2028-02-29'));
  assert.ok(!dataValida('2026-02-29'));
  assert.ok(!dataValida('2026-13-01'));
  assert.ok(!dataValida(20260927));
});

test('o feed abre pelo PR batido mais recente; no mesmo dia, pelo registrado por ultimo', () => {
  const lista = [
    pr({ id: 'velho', data: '2026-09-01' }),
    pr({ id: 'cedo', data: '2026-09-28', criadoEm: AGORA - 1000 }),
    pr({ id: 'tarde', data: '2026-09-28', criadoEm: AGORA }),
    pr({ id: 'meio', data: '2026-09-15' }),
  ];
  assert.deepEqual(ordenarPRs(lista).map((x) => x.id), ['tarde', 'cedo', 'meio', 'velho']);
  assert.equal(lista[0].id, 'velho', 'nao mexe na lista original');
});

test('o exercicio agrupa sem caixa, sem acento e sem espaco dobrado', () => {
  assert.equal(chaveExercicio(' Back  SQUAT '), 'back squat');
  assert.equal(chaveExercicio('Supino Inclinado Árabe'), 'supino inclinado arabe');
});

test('o filtro de exercicio junta as grafias e mostra a mais usada, em ordem alfabetica', () => {
  const lista = [
    pr({ id: '1', exercicio: 'back squat', data: '2026-09-28' }),
    pr({ id: '2', exercicio: 'Back Squat', data: '2026-09-20' }),
    pr({ id: '3', exercicio: 'Back Squat', data: '2026-09-10' }),
    pr({ id: '4', exercicio: 'Deadlift' }),
    pr({ id: '5', exercicio: 'agachamento frontal' }),
  ];
  assert.deepEqual(opcoesDeExercicio(lista), [
    { chave: 'agachamento frontal', nome: 'agachamento frontal', total: 1 },
    { chave: 'back squat', nome: 'Back Squat', total: 3 },
    { chave: 'deadlift', nome: 'Deadlift', total: 1 },
  ]);
  const empate = [pr({ id: 'a', exercicio: 'snatch', data: '2026-09-01' }), pr({ id: 'b', exercicio: 'Snatch', data: '2026-09-20' })];
  assert.equal(opcoesDeExercicio(empate)[0].nome, 'Snatch', 'no empate, a grafia do PR mais recente');
});

test('o filtro de aluno usa o nome da ficha, e o e-mail de quem nao tem ficha', () => {
  const lista = [pr({ id: '1', email: 'ze@box.com' }), pr({ id: '2', email: 'ana@box.com' }), pr({ id: '3', email: 'ana@box.com' })];
  const fichas = [{ email: 'ANA@box.com', nome: 'Ana Souza' }];
  assert.deepEqual(opcoesDeAluno(lista, fichas), [
    { email: 'ana@box.com', nome: 'Ana Souza', total: 2 },
    { email: 'ze@box.com', nome: 'ze@box.com', total: 1 },
  ]);
});

test('os filtros de exercicio e aluno se somam; vazio e todos', () => {
  const lista = [
    pr({ id: '1', email: 'ana@box.com', exercicio: 'Deadlift' }),
    pr({ id: '2', email: 'ana@box.com', exercicio: 'Back Squat' }),
    pr({ id: '3', email: 'ze@box.com', exercicio: 'deadlift' }),
  ];
  const ids = (/** @type {any} */ f) => filtrarPRs(lista, f).map((x) => x.id);
  assert.deepEqual(ids({ exercicio: '', aluno: '' }), ['1', '2', '3']);
  assert.deepEqual(ids({ exercicio: 'deadlift', aluno: '' }), ['1', '3']);
  assert.deepEqual(ids({ exercicio: '', aluno: 'ANA@box.com' }), ['1', '2']);
  assert.deepEqual(ids({ exercicio: 'deadlift', aluno: 'ze@box.com' }), ['3']);
});

test('a data: hoje, ontem, e o selo Novo na ultima semana', () => {
  assert.equal(diasDesde('2026-09-28', AGORA), 0);
  assert.equal(diasDesde('2026-09-27', AGORA), 1);
  assert.equal(diasDesde('2026-08-31', AGORA), 28);
  assert.equal(rotuloDaData('2026-09-28', AGORA), 'Hoje');
  assert.equal(rotuloDaData('2026-09-27', AGORA), 'Ontem');
  assert.equal(rotuloDaData('2026-09-02', AGORA), '02/09/2026');
  assert.equal(dataBr('2026-09-02'), '02/09/2026');
  assert.ok(ehNovo({ data: '2026-09-22' }, AGORA), '6 dias atras ainda e novo');
  assert.ok(!ehNovo({ data: '2026-09-21' }, AGORA), '7 dias atras ja nao e');
  // 23h59 ainda e o mesmo dia: a conta e no fuso local, nunca em UTC.
  assert.equal(diasDesde('2026-09-28', new Date(2026, 8, 28, 23, 59).getTime()), 0);
});

test('carga com virgula e reps no singular e no plural', () => {
  assert.equal(formatarCarga(102.5), '102,5');
  assert.equal(formatarCarga(120), '120');
  assert.equal(formatarCarga(61.25), '61,25');
  assert.equal(formatarCarga(0.1 + 0.2), '0,3');
  assert.equal(formatarReps(1), '1 rep');
  assert.equal(formatarReps(5), '5 reps');
});

test('o resumo do topo: total, PRs da semana e alunos diferentes', () => {
  const lista = [
    pr({ id: '1', email: 'ana@box.com', data: '2026-09-28' }),
    pr({ id: '2', email: 'ana@box.com', data: '2026-09-01' }),
    pr({ id: '3', email: 'ze@box.com', data: '2026-09-25' }),
  ];
  assert.deepEqual(resumoDoMural(lista, AGORA), { total: 3, naSemana: 2, alunos: 2 });
  assert.deepEqual(resumoDoMural([], AGORA), { total: 0, naSemana: 0, alunos: 0 });
});

test('o parabens chama pelo primeiro nome, e sem ficha nao chama pelo e-mail', () => {
  assert.equal(primeiroNome('Ana Souza'), 'Ana');
  assert.equal(primeiroNome('ana@box.com'), '');
  assert.equal(primeiroNome(''), '');
  const p = pr({ exercicio: 'Back Squat', carga: 102.5, reps: 5 });
  assert.equal(mensagemDeParabens(p, 'Ana Souza'),
    'Parabéns, Ana! 🏆 Novo PR de Back Squat: 102,5 kg × 5 reps. Mandou muito bem — bora pro próximo! 💪');
  assert.match(mensagemDeParabens(p, 'ana@box.com'), /^Parabéns! 🏆 Novo PR de Back Squat/);
});

test('o atalho abre a conversa do aluno na Central com o parabens pronto no campo', () => {
  const p = pr({ email: 'ana@box.com', exercicio: 'Deadlift', carga: 140, reps: 1 });
  const link = linkDeParabens(p, 'Ana Souza');
  assert.ok(link.startsWith('../mensagens/index.html#ana%40box.com&rascunho='));
  assert.ok(!link.includes('?'), 'nada no ?: o e-mail e o texto nao vao para o servidor');
  assert.deepEqual(lerEndereco(link.slice(link.indexOf('#'))), {
    email: 'ana@box.com',
    rascunho: mensagemDeParabens(p, 'Ana Souza'),
  });
});

test('os filtros vao e voltam pelo endereco do mural', () => {
  assert.equal(enderecoDoFiltro({ exercicio: '', aluno: '' }), '');
  const hash = enderecoDoFiltro({ exercicio: 'back squat', aluno: 'Ana@Box.com' });
  assert.deepEqual(lerFiltro(hash), { exercicio: 'back squat', aluno: 'ana@box.com' });
  assert.deepEqual(lerFiltro(''), { exercicio: '', aluno: '' });
  assert.deepEqual(lerFiltro('#exercicio=Back%20SQUAT'), { exercicio: 'back squat', aluno: '' }, 'chave torta vira chave');
});
