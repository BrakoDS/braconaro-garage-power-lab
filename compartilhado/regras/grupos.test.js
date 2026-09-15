// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRUPOS, grupoDoMusculo, grupoDoExercicio, agregarPorGrupo } from './grupos.js';
import { MUSCULOS } from '../config/padroes.js';
import { MUSC_MAP } from '../config/musculos.js';

test('todo musculo rastreado pelo volume cai num grupo', () => {
  for (const m of MUSCULOS) {
    assert.ok(grupoDoMusculo(m), `musculo sem grupo: ${m}`);
  }
});

test('todo musculo da Academia cai num grupo', () => {
  for (const chave of Object.keys(MUSC_MAP)) {
    assert.ok(grupoDoMusculo(chave), `musculo da Academia sem grupo: ${chave}`);
  }
});

test('musculo desconhecido nao inventa grupo', () => {
  assert.equal(grupoDoMusculo('pescoco'), null);
});

test('o grupo do exercicio e o do PRIMEIRO primario', () => {
  const rosca = { musculosPrimarios: ['biceps'], musculosSecundarios: ['antebraco'] };
  assert.equal(grupoDoExercicio(rosca), 'braco');
});

test('exercicio sem primario nao pertence a grupo nenhum', () => {
  assert.equal(grupoDoExercicio({ musculosPrimarios: [] }), null);
  assert.equal(grupoDoExercicio({}), null);
});

test('agrega somando os musculos do mesmo grupo', () => {
  const porGrupo = agregarPorGrupo({ biceps: 4, triceps: 3, quadriceps: 6, pescoco: 9 });
  assert.equal(porGrupo.braco, 7);
  assert.equal(porGrupo.perna, 6);
  assert.equal(porGrupo.pescoco, undefined);
});

test('GRUPOS tem exatamente os sete', () => {
  assert.deepEqual([...GRUPOS].sort(), ['braco', 'core', 'costas', 'gluteo', 'ombro', 'peito', 'perna']);
});
