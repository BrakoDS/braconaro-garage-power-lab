// @ts-check
/**
 * Metas corporais × metas por grupo: cada uma no seu campo, e a ficha antiga
 * (mapa por grupo em `metas`) sem perder nada.
 *
 * Rodar: node --test coach/gestao-de-alunos/metas-grupo.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metasGrupoDe, metasCorporaisDe, patchDeMetas } from './metas-grupo.js?v=25';

const corporal = { id: 'm1', tipo: 'peso', alvo: 80, base: 90, baseData: '2026-09-01', criadoEm: 1 };

test('ficha nova: metasGrupo e metas, cada um no seu lugar', () => {
  const a = { metasGrupo: { perna: 20 }, metas: [corporal] };
  assert.deepEqual(metasGrupoDe(a), { perna: 20 });
  assert.deepEqual(metasCorporaisDe(a), [corporal]);
});

test('a lista de metas corporais nunca vira meta por grupo', () => {
  // Era o bug: o portal-sync publicava `metasGrupo: a.metas` com a lista dentro.
  assert.deepEqual(metasGrupoDe({ metas: [corporal] }), {});
});

test('ficha antiga, com o mapa por grupo em `metas`, continua valendo', () => {
  const a = { metas: { perna: 20 } };
  assert.deepEqual(metasGrupoDe(a), { perna: 20 });
  assert.deepEqual(metasCorporaisDe(a), [], 'o mapa antigo não é meta corporal');
});

test('metasGrupo ganha do mapa antigo', () => {
  assert.deepEqual(metasGrupoDe({ metasGrupo: { costas: 12 }, metas: { perna: 20 } }), { costas: 12 });
});

test('sem nada (ou lixo), vazio', () => {
  for (const a of [{}, null, undefined, { metas: null }, { metas: 'x' }, { metasGrupo: [1, 2] }]) {
    assert.deepEqual(metasGrupoDe(a), {}, JSON.stringify(a));
    assert.deepEqual(metasCorporaisDe(a), [], JSON.stringify(a));
  }
});

test('gravar meta corporal numa ficha antiga leva o mapa por grupo para metasGrupo', () => {
  // Sem isso, `metas: [nova]` apagaria o mapa por grupo da ficha.
  assert.deepEqual(patchDeMetas({ metas: { perna: 20 } }, [corporal]), { metas: [corporal], metasGrupo: { perna: 20 } });
});

test('gravar meta corporal em ficha que já separou: só a lista', () => {
  assert.deepEqual(patchDeMetas({ metas: [], metasGrupo: { perna: 20 } }, [corporal]), { metas: [corporal] });
  assert.deepEqual(patchDeMetas({}, [corporal]), { metas: [corporal] });
  assert.deepEqual(patchDeMetas({ metas: [corporal] }, []), { metas: [] });
});

test('ficha antiga que já tem metasGrupo: o mapa velho em metas não sobrescreve', () => {
  assert.deepEqual(patchDeMetas({ metas: { perna: 20 }, metasGrupo: { costas: 12 } }, [corporal]), { metas: [corporal] });
});
