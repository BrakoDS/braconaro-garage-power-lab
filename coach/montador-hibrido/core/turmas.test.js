// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarTurmas, moverAluno, removerAluno, adicionarHorario, paraEnvio, impedimentos,
  totalDeAlunos, horarioDoAluno, treinaNoDia, normalizarHora, horaLegivel,
  MAX_POR_TURMA, SEM_HORARIO,
} from './turmas.js';

/** 2026-09-16 é uma QUARTA. */
const QUARTA = '2026-09-16';
/** 2026-09-14 é uma SEGUNDA. */
const SEGUNDA = '2026-09-14';

const aluno = (id, nome, extra = {}) => ({ id, nome, status: 'ativo', ...extra });

const TURMA_DO_BOX = [
  aluno('1', 'Ana', { diasTreino: ['seg', 'qua'], horarios: { seg: '07:00', qua: '19:00' } }),
  aluno('2', 'Bruno', { diasTreino: ['seg', 'qua'], horarios: { seg: '07:00', qua: '07:00' } }),
  aluno('3', 'Carla', { diasTreino: ['qua'], horarios: { qua: '19:00' } }),
  aluno('4', 'Diego', { diasTreino: ['ter', 'qui'], horarios: { ter: '18:00' } }),
  aluno('5', 'Elisa', { diasTreino: ['qua'], horarios: {}, freqHorario: '18h30' }),
  aluno('6', 'Fábio', { diasTreino: ['qua'], horarios: {} }),
  aluno('7', 'Gabi', { diasTreino: ['qua'], horarios: { qua: '07:00' }, status: 'inativo' }),
];

test('o mesmo aluno cai em horários diferentes conforme o DIA', () => {
  // A Ana treina 7h na segunda e 19h na quarta. Um campo `horario_padrao` único
  // não conseguiria representar isso — é por isso que ele não existe.
  const ana = TURMA_DO_BOX[0];
  assert.equal(horarioDoAluno(ana, 'seg'), '07:00');
  assert.equal(horarioDoAluno(ana, 'qua'), '19:00');
});

test('as turmas saem agrupadas e ordenadas por horário', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  assert.deepEqual(t.map((x) => x.horario), ['07:00', '18:30', '19:00', SEM_HORARIO]);
  assert.deepEqual(t[0].alunos.map((a) => a.nome), ['Bruno']);
  assert.deepEqual(t[2].alunos.map((a) => a.nome), ['Ana', 'Carla']);
});

test('quem não treina naquele dia da semana fica de fora', () => {
  const nomes = montarTurmas(TURMA_DO_BOX, QUARTA).flatMap((t) => t.alunos.map((a) => a.nome));
  assert.ok(!nomes.includes('Diego'), 'Diego treina ter/qui — não entra na quarta');
});

test('aluno inativo não entra na turma', () => {
  const nomes = montarTurmas(TURMA_DO_BOX, QUARTA).flatMap((t) => t.alunos.map((a) => a.nome));
  assert.ok(!nomes.includes('Gabi'));
});

test('o freqHorario antigo ainda coloca o aluno numa turma', () => {
  // Ficha de antes do horário por dia não pode aparecer sem turma só porque o
  // formato mudou — é a mesma tolerância que a tela da Gestão já tem.
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  assert.deepEqual(t.find((x) => x.horario === '18:30')?.alunos.map((a) => a.nome), ['Elisa']);
});

test('quem treina no dia mas não tem hora aparece no bloco "sem horário", no FIM', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  const ultima = t[t.length - 1];
  assert.equal(ultima.horario, SEM_HORARIO);
  assert.deepEqual(ultima.alunos.map((a) => a.nome), ['Fábio']);
  assert.equal(ultima.rotulo, 'Sem horário na ficha');
});

test('o dia muda as turmas inteiras', () => {
  const seg = montarTurmas(TURMA_DO_BOX, SEGUNDA);
  assert.deepEqual(seg.map((x) => x.horario), ['07:00']);
  assert.deepEqual(seg[0].alunos.map((a) => a.nome), ['Ana', 'Bruno']);
});

test('ficha antiga sem diasTreino entra no dia em vez de sumir', () => {
  const legado = [aluno('9', 'Zé', { horarios: {}, freqHorario: '07:00' })];
  assert.equal(treinaNoDia(legado[0], 'qua'), true);
  assert.equal(montarTurmas(legado, QUARTA)[0].alunos.length, 1);
});

test('dentro da turma os nomes saem em ordem alfabética', () => {
  const desordem = [
    aluno('a', 'Zilda', { diasTreino: ['qua'], horarios: { qua: '07:00' } }),
    aluno('b', 'Alice', { diasTreino: ['qua'], horarios: { qua: '07:00' } }),
  ];
  assert.deepEqual(montarTurmas(desordem, QUARTA)[0].alunos.map((a) => a.nome), ['Alice', 'Zilda']);
});

/* ---------- mover, remover, acrescentar ---------- */

test('mover um aluno tira dele a turma antiga e põe na nova', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  const depois = moverAluno(t, '1', '07:00'); // Ana das 19h para as 7h
  assert.deepEqual(depois.find((x) => x.horario === '07:00')?.alunos.map((a) => a.nome), ['Bruno', 'Ana']);
  assert.deepEqual(depois.find((x) => x.horario === '19:00')?.alunos.map((a) => a.nome), ['Carla']);
});

test('mover devolve turmas NOVAS — a lista original continua intacta', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  const antes = JSON.stringify(t);
  moverAluno(t, '1', '07:00');
  assert.equal(JSON.stringify(t), antes);
});

test('a turma esvaziada CONTINUA na tela, para o coach poder desfazer', () => {
  // "19h — ninguém hoje" é informação, e é o que permite mover o aluno de volta.
  // Quem impede que ela seja gravada é `paraEnvio`, não o sumiço do bloco.
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  const depois = moverAluno(moverAluno(t, '3', '07:00'), '1', '07:00');
  const vazia = depois.find((x) => x.horario === '19:00');
  assert.ok(vazia, 'o bloco das 19h continua visível');
  assert.equal(vazia.alunos.length, 0);
  assert.ok(!paraEnvio(depois).some((x) => x.classTime === '19:00'), 'mas não é enviada');
});

test('mover para um horário que ainda não existe cria o bloco', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  const depois = moverAluno(t, '1', '06:00');
  assert.deepEqual(depois[0].horario, '06:00');
  assert.deepEqual(depois[0].alunos.map((a) => a.nome), ['Ana']);
});

test('mover um id que não existe não muda nada', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  assert.equal(moverAluno(t, 'fantasma', '07:00'), t);
});

test('remover tira o aluno que avisou que vai faltar', () => {
  const t = montarTurmas(TURMA_DO_BOX, QUARTA);
  const depois = removerAluno(t, '2');
  assert.equal(depois.flatMap((x) => x.alunos).find((a) => a.id === '2'), undefined);
  assert.equal(depois.find((x) => x.horario === '07:00')?.alunos.length, 0, 'o bloco das 7h fica, vazio');
  assert.ok(!paraEnvio(depois).some((x) => x.classTime === '07:00'), 'e não é enviado');
});

test('acrescentar horário aceita texto livre e não duplica', () => {
  const t = adicionarHorario([], '6h30');
  assert.deepEqual(t.map((x) => x.horario), ['06:30']);
  assert.equal(adicionarHorario(t, '06:30').length, 1, 'horário repetido não vira segundo bloco');
  assert.equal(adicionarHorario(t, 'lixo').length, 1, 'texto sem hora não cria bloco');
});

/* ---------- o que vai para o servidor ---------- */

test('só turma com horário E aluno é enviada', () => {
  const envio = paraEnvio(montarTurmas(TURMA_DO_BOX, QUARTA));
  assert.deepEqual(envio.map((t) => t.classTime), ['07:00', '18:30', '19:00']);
  assert.ok(!envio.some((t) => !t.classTime), 'o bloco sem horário não vai: a ficha sairia sem dizer de que aula é');
  assert.deepEqual(envio.find((t) => t.classTime === '19:00')?.studentIds, ['1', '3']);
});

test('o total conta só quem vai receber de verdade', () => {
  // Fábio está no bloco sem horário, então não entra na conta.
  assert.equal(totalDeAlunos(montarTurmas(TURMA_DO_BOX, QUARTA)), 4);
});

test('nenhum aluno aparece em duas turmas', () => {
  const envio = paraEnvio(montarTurmas(TURMA_DO_BOX, QUARTA));
  const ids = envio.flatMap((t) => t.studentIds);
  assert.equal(new Set(ids).size, ids.length);
});

test('turma acima do teto vira impedimento, com o horário no texto', () => {
  const lotada = Array.from({ length: MAX_POR_TURMA + 1 }, (_, i) =>
    aluno(String(i), `A${i}`, { diasTreino: ['qua'], horarios: { qua: '07:00' } }));
  const t = montarTurmas(lotada, QUARTA);
  assert.equal(t[0].excede, true);
  const p = impedimentos(t);
  assert.equal(p.length, 1);
  assert.ok(p[0].includes('7h') && p[0].includes(String(MAX_POR_TURMA)));
});

test('sem turma enviável, o impedimento diz o que fazer', () => {
  const soSemHora = [aluno('1', 'Ana', { diasTreino: ['qua'], horarios: {} })];
  const p = impedimentos(montarTurmas(soSemHora, QUARTA));
  assert.equal(p.length, 1);
  assert.ok(p[0].includes('Cadastre a hora'));
});

test('turmas em ordem e dentro do teto não têm impedimento', () => {
  assert.deepEqual(impedimentos(montarTurmas(TURMA_DO_BOX, QUARTA)), []);
});

/* ---------- leitura de hora ---------- */

test('a hora do campo antigo é lida de todo jeito que o coach escreveu', () => {
  assert.equal(normalizarHora('19 Horas'), '19:00');
  assert.equal(normalizarHora('19h'), '19:00');
  assert.equal(normalizarHora('18h–19h'), '18:00', 'na faixa vale o começo');
  assert.equal(normalizarHora('6:30'), '06:30');
  assert.equal(normalizarHora('manhã'), '', 'sem hora reconhecível, vazio — não se inventa hora na ficha');
  assert.equal(normalizarHora('99:00'), '');
});

test('a hora é mostrada como se fala no box', () => {
  assert.equal(horaLegivel('19:00'), '19h');
  assert.equal(horaLegivel('06:30'), '6h30');
});

test('lista vazia ou torta não quebra a tela', () => {
  assert.deepEqual(montarTurmas([], QUARTA), []);
  assert.deepEqual(montarTurmas(null, QUARTA), []);
  assert.deepEqual(montarTurmas([{ nome: 'sem id' }], QUARTA), []);
  assert.deepEqual(paraEnvio(null), []);
  assert.equal(totalDeAlunos(undefined), 0);
});

/* ---------- aluno extra / reposição ---------- */

import { adicionarExtra, buscarAlunos } from './turmas.js';

/** A base inteira, incluindo quem não treina na quarta. */
const BASE = [
  ...TURMA_DO_BOX,
  aluno('8', 'Hélio Ramos', { diasTreino: ['sab'], horarios: { sab: '09:00' } }),
  aluno('9', 'Íris Campos', { diasTreino: ['ter'], horarios: { ter: '18:00' }, status: 'inativo' }),
];

test('a busca ignora dia e horário da ficha — é para achar quem vem repor', () => {
  // O Hélio só treina sábado; é justamente ele que o coach precisa achar numa
  // quarta para encaixar uma reposição.
  const r = buscarAlunos(BASE, 'hélio', montarTurmas(BASE, QUARTA));
  assert.equal(r.length, 1);
  assert.equal(r[0].aluno.nome, 'Hélio Ramos');
  assert.equal(r[0].ondeEsta, '', 'ele não está em turma nenhuma hoje');
});

test('a busca não se importa com acento nem com maiúscula', () => {
  const turmas = montarTurmas(BASE, QUARTA);
  assert.equal(buscarAlunos(BASE, 'helio', turmas).length, 1, 'sem acento acha');
  assert.equal(buscarAlunos(BASE, 'HÉLIO', turmas).length, 1, 'em maiúscula acha');
  assert.equal(buscarAlunos(BASE, 'ramos', turmas).length, 1, 'pelo sobrenome acha');
});

test('quem já está numa turma aparece DIZENDO onde está, em vez de sumir', () => {
  // Esconder faria o coach procurar um nome que existe, não achar, e concluir
  // que o aluno não está cadastrado.
  const r = buscarAlunos(BASE, 'ana', montarTurmas(BASE, QUARTA));
  assert.equal(r[0].aluno.nome, 'Ana');
  assert.equal(r[0].ondeEsta, 'nas 19h');
});

test('a preposição vem do núcleo — senão a tela diria "já está nas sem horário"', () => {
  const semHora = [aluno('z', 'Zeca', { diasTreino: ['qua'], horarios: {} })];
  const r = buscarAlunos(semHora, 'zeca', montarTurmas(semHora, QUARTA));
  assert.equal(r[0].ondeEsta, 'no bloco sem horário');
});

test('aluno inativo não aparece na busca', () => {
  assert.equal(buscarAlunos(BASE, 'íris', montarTurmas(BASE, QUARTA)).length, 0);
});

test('busca sem termo devolve a base ativa inteira, em ordem alfabética', () => {
  const r = buscarAlunos(BASE, '', montarTurmas(BASE, QUARTA));
  assert.equal(r.length, BASE.filter((a) => a.status !== 'inativo').length);
  assert.deepEqual(r.slice(0, 3).map((x) => x.aluno.nome), ['Ana', 'Bruno', 'Carla']);
});

test('o extra entra na turma escolhida, marcado', () => {
  const t = montarTurmas(BASE, QUARTA);
  const helio = BASE.find((a) => a.id === '8');
  const depois = adicionarExtra(t, helio, '07:00');
  const manha = depois.find((x) => x.horario === '07:00');
  assert.deepEqual(manha.alunos.map((a) => a.nome), ['Bruno', 'Hélio Ramos']);
  assert.equal(manha.alunos.find((a) => a.id === '8').extra, true);
});

test('o extra vai junto no envio, como qualquer outro aluno', () => {
  const depois = adicionarExtra(montarTurmas(BASE, QUARTA), BASE.find((a) => a.id === '8'), '07:00');
  const envio = paraEnvio(depois).find((t) => t.classTime === '07:00');
  assert.deepEqual(envio.studentIds.sort(), ['2', '8']);
});

test('adicionar quem já está em outro horário MOVE, não duplica', () => {
  // Duas turmas com o mesmo aluno é o que o servidor recusa: no mesmo lote a
  // última escrita do documento dele venceria em silêncio.
  const t = montarTurmas(BASE, QUARTA);
  const ana = BASE.find((a) => a.id === '1');
  const depois = adicionarExtra(t, ana, '07:00');
  const ids = paraEnvio(depois).flatMap((x) => x.studentIds);
  assert.equal(new Set(ids).size, ids.length, 'ninguém aparece duas vezes');
  assert.equal(depois.find((x) => x.horario === '19:00').alunos.find((a) => a.id === '1'), undefined);
});

test('a marca de extra sobrevive a mover de horário', () => {
  const t = adicionarExtra(montarTurmas(BASE, QUARTA), BASE.find((a) => a.id === '8'), '07:00');
  const depois = moverAluno(t, '8', '19:00');
  assert.equal(depois.find((x) => x.horario === '19:00').alunos.find((a) => a.id === '8').extra, true);
});

test('o extra pode criar um horário que ainda não existia', () => {
  const depois = adicionarExtra(montarTurmas(BASE, QUARTA), BASE.find((a) => a.id === '8'), '20:00');
  assert.deepEqual(depois[depois.length - 2].horario, '20:00');
});

test('extra sem horário válido ou sem aluno não muda nada', () => {
  const t = montarTurmas(BASE, QUARTA);
  assert.equal(adicionarExtra(t, BASE[0], 'lixo'), t);
  assert.equal(adicionarExtra(t, null, '07:00'), t);
});

test('o extra conta no teto da turma, como todo mundo', () => {
  const lotada = Array.from({ length: MAX_POR_TURMA }, (_, i) =>
    aluno(`x${i}`, `A${i}`, { diasTreino: ['qua'], horarios: { qua: '07:00' } }));
  const t = montarTurmas(lotada, QUARTA);
  const cheia = adicionarExtra(t, aluno('novo', 'Extra'), '07:00');
  assert.equal(cheia[0].excede, true);
  assert.ok(impedimentos(cheia).length, 'e vira impedimento para distribuir');
});
