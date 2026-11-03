// @ts-check
/** Rodar: node --test coach/calendario/core/camadas.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rodarCamadas } from './camadas.js';

/** @type {any} */ const ctx = {};
const fixa = (/** @type {string} */ id, /** @type {any[]} */ itens) => ({ id, nome: id, cor: '--accent', itens: () => itens });

test('rodarCamadas: separa item do dia e item de horário; ignora data fora do período; marca a camada', () => {
  const r = rodarCamadas([
    fixa('a', [{ data: '2026-11-02', tipo: 'x', titulo: 'dia' }, { data: '2026-11-02', hora: '06:00', tipo: 'turma', titulo: '1/6' }, { data: '2026-11-02', hora: '', tipo: 'turma', titulo: 'sem hora' }]),
    fixa('b', [{ data: '2027-01-01', tipo: 'x', titulo: 'fora' }]),
  ], ctx, ['2026-11-02', '2026-11-03'], new Set(['a', 'b']));
  assert.deepEqual(Object.keys(r), ['2026-11-02', '2026-11-03']);
  assert.deepEqual(r['2026-11-02'].doDia.map((i) => [i.titulo, i.camada]), [['dia', 'a']]);
  assert.deepEqual(Object.keys(r['2026-11-02'].porHora).sort(), ['', '06:00']);
  assert.deepEqual(r['2026-11-03'], { doDia: [], porHora: {} });
});

test('rodarCamadas: camada desligada nem roda', () => {
  let rodou = false;
  const c = { id: 'z', nome: 'z', cor: '--bad', itens: () => { rodou = true; return []; } };
  rodarCamadas([c], ctx, ['2026-11-02'], new Set());
  assert.equal(rodou, false);
});

test('rodarCamadas: camada nova registrada aparece sem mudar nada mais', () => {
  const nova = fixa('nova', [{ data: '2026-11-02', tipo: 'novidade', titulo: 'oi' }]);
  const r = rodarCamadas([nova], ctx, ['2026-11-02'], new Set(['nova']));
  assert.equal(r['2026-11-02'].doDia[0].tipo, 'novidade');
});
