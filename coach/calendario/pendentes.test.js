// @ts-check
/** Rodar: node --test coach/calendario/pendentes.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarPendentes } from './pendentes.js';

const QUA = '2026-10-07', QUI = '2026-10-08';
const ana = () => ({
  id: 'A1', nome: 'Ana', email: 'Ana@X.com', diasTreino: ['seg', 'qua', 'sex'], horarios: { seg: '07:00', qua: '07:00', sex: '07:00' },
  presencas: [], presencaHoras: {}, remarcacoes: {}, atestados: { '2026-09-28': { em: 1, tipo: 'desmarcacao', expira: '2026-10-28', reposicao: null } },
});
const beto = () => ({ id: 'B2', nome: 'Beto', email: 'beto@x.com', diasTreino: ['qua'], horarios: { qua: '07:00' } });
const aviso = { tipo: 'titular', chave: QUA, coachUid: 'C', aviso: { hoje: '2026-10-06', agora: '20:00' }, em: 20 };
const reserva = { origem: '2026-09-28', data: QUI, hora: '18:10', coachUid: 'C', em: 10 };

test('aviso e reserva do coach entram numa CÓPIA da ficha; o original não muda', () => {
  const fichas = [ana(), beto()];
  const antes = JSON.stringify(fichas);
  const r = aplicarPendentes(fichas, {
    avisos: { 'ana@x.com': { itens: { [`titular|${QUA}`]: aviso } } },
    reservas: { 'ana@x.com': { itens: { '2026-09-28': reserva } } },
  }, 'C');
  assert.equal(JSON.stringify(fichas), antes, 'nada gravado, nada mexido');
  const a = r.fichas[0];
  assert.equal(a.atestados[QUA].tipo, 'desmarcacao', 'o "Não irei" virou desmarcação na cópia');
  assert.equal(a.atestados['2026-09-28'].reposicao.data, QUI, 'a reserva virou reposição na cópia');
  assert.equal(a.atestados['2026-09-28'].reposicao.hora, '18:10');
  assert.equal(r.fichas[1], fichas[1], 'ficha sem pedido é a mesma');
  assert.deepEqual(r.porAluno.A1.map((p) => [p.tipo, p.chave]), [['reserva', '2026-09-28'], ['aviso', QUA]], 'em ordem de chegada');
});

test('item de outro coach e caixa sem ficha ficam de fora', () => {
  const r = aplicarPendentes([ana()], {
    avisos: { 'ana@x.com': { itens: { x: { ...aviso, coachUid: 'OUTRO' } } }, 'ninguem@x.com': { itens: { y: aviso } } },
    reservas: {},
  }, 'C');
  assert.deepEqual(r.porAluno, {});
  assert.equal(r.fichas[0].atestados[QUA], undefined);
});
