// @ts-check
/** Rodar: node --test coach/calendario/camadas/turmas.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camadaTurmas, VEM } from './turmas.js';
import { turmasDoDia } from '../../gestao-de-alunos/presenca-regras.js?v=40';
import { CAMADAS } from './registro.js';

const SEG = '2026-11-02', QUA = '2026-11-04';
const ctx = (/** @type {any} */ o = {}) => /** @type {any} */ ({ fichas: [], meta: { turmas: {}, feriados: {} }, fechados: [], pendentes: {}, hoje: '2026-11-01', agora: '08:00', ...o });
const fichas = [
  { id: 'A1', nome: 'Ana', diasTreino: ['seg', 'qua'], horarios: { seg: '06:00', qua: '06:00' } },
  { id: 'B2', nome: 'Bia', diasTreino: ['seg'], horarios: { seg: '06:00' }, atestados: { [SEG]: { em: 1, tipo: 'desmarcacao', expira: '2026-12-01', reposicao: null } } },
  { id: 'C3', nome: 'Caio', diasTreino: ['seg'], horarios: { seg: '18:00' } },
  { id: 'D4', nome: 'Davi', atestados: { '2026-10-20': { em: 1, tipo: 'desmarcacao', expira: '2026-11-19', reposicao: { data: SEG, hora: '06:00' } } } },
  { id: 'E5', nome: 'Elisa', status: 'inativo', diasTreino: ['seg'], horarios: { seg: '06:00' } },
];
const daHora = (/** @type {any[]} */ itens, /** @type {string} */ data, /** @type {string} */ hora) => itens.find((i) => i.data === data && i.hora === hora);

test('turma: quem vem (fixo e reposição), quem não vem, e as vagas', () => {
  const t = daHora(camadaTurmas.itens(ctx({ fichas }), [SEG]), SEG, '06:00');
  assert.equal(t.tipo, 'turma');
  assert.deepEqual(t.dados.vem.map((/** @type {any} */ p) => [p.aluno.nome, p.tipo]), [['Ana', 'titular'], ['Davi', 'reposicao']]);
  assert.deepEqual(t.dados.naoVem.map((/** @type {any} */ p) => [p.aluno.nome, p.status]), [['Bia', 'desmarcou-no-prazo']]);
  assert.equal(t.titulo, '2/6');
  assert.equal(t.dados.naGrade, true);
  assert.equal(t.dados.lotada, false);
});

test('turma: horário de ficha fora da grade fica marcado; a grade aparece mesmo vazia', () => {
  const itens = camadaTurmas.itens(ctx({ fichas }), [SEG]);
  assert.equal(daHora(itens, SEG, '18:00').dados.naGrade, false, '18:00 não é 18:10');
  const vazia = daHora(itens, SEG, '18:10');
  assert.equal(vazia.dados.vem.length, 0);
  assert.equal(vazia.dados.naGrade, true);
});

test('turma: box fechado não abre a grade e ninguém "vem"', () => {
  const itens = camadaTurmas.itens(ctx({ fichas, fechados: [SEG] }), [SEG]);
  assert.equal(daHora(itens, SEG, '18:10'), undefined);
  assert.ok(itens.every((i) => i.dados.vem.length === 0));
});

test('turma: lotada quando vêm tantos quanto as vagas', () => {
  const t = daHora(camadaTurmas.itens(ctx({ fichas, meta: { turmas: { porHorario: { '06:00': 2 } }, feriados: {} } }), [SEG]), SEG, '06:00');
  assert.equal(t.titulo, '2/2');
  assert.equal(t.dados.lotada, true);
});

test('turma: pedido pendente marca a pessoa e conta na turma', () => {
  const t = daHora(camadaTurmas.itens(ctx({ fichas, pendentes: { D4: [{ tipo: 'reserva', chave: '2026-10-20', em: 5, data: SEG, hora: '06:00' }] } }), [SEG]), SEG, '06:00');
  assert.equal(t.dados.pendentes, 1);
  assert.equal(t.dados.vem.find((/** @type {any} */ p) => p.aluno.id === 'D4').pendente.tipo, 'reserva');
  assert.equal(t.dados.vem.find((/** @type {any} */ p) => p.aluno.id === 'A1').pendente, null);
});

test('paridade com o Painel de Presença: as mesmas pessoas e status por turma', () => {
  const ativos = fichas.filter((a) => (a.status || 'ativo') !== 'inativo');
  for (const dia of [SEG, QUA]) {
    const painel = turmasDoDia(ativos, dia, { hoje: '2026-11-01', fechados: [], config: {} });
    const cal = camadaTurmas.itens(ctx({ fichas }), [dia]);
    for (const p of painel) {
      const c = daHora(cal, dia, p.hora);
      const doCal = [...c.dados.vem, ...c.dados.naoVem].map((/** @type {any} */ x) => `${x.aluno.id}|${x.tipo}|${x.status}`).sort();
      const doPainel = p.aulas.map((x) => `${x.aluno.id}|${x.tipo}|${x.status}`).sort();
      assert.deepEqual(doCal, doPainel, `${dia} ${p.hora}`);
      assert.ok(c.dados.vem.every((/** @type {any} */ x) => VEM.has(x.status)));
    }
  }
});

test('registro: Turmas é a primeira camada', () => {
  assert.equal(CAMADAS[0].id, 'turmas');
});
