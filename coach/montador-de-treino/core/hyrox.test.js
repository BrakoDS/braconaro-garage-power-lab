// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYROX_ESTACOES, volumeHyrox } from './hyrox.js';

test('toda estacao declara ao menos um musculo primario', () => {
  for (const e of HYROX_ESTACOES) {
    assert.ok(Array.isArray(e.musculos) && e.musculos.length > 0, `estacao sem musculo: ${e.nome}`);
  }
});

test('o Hyrox passa a contar musculo', () => {
  const vol = volumeHyrox();
  assert.ok(Object.keys(vol.porMusculo).length > 0, 'porMusculo nao pode mais vir vazio');
});

test('a prova inteira continua distribuida entre os padroes', () => {
  const vol = volumeHyrox();
  assert.ok(vol.porPadrao.puxar > 0);
  assert.ok(vol.porPadrao.quadriceps > 0);
  assert.ok(vol.totalSeries > 0);
});

test('nivel mais alto da mais volume — a prescricao escala', () => {
  const ini = volumeHyrox(HYROX_ESTACOES, 'iniciante');
  const comp = volumeHyrox(HYROX_ESTACOES, 'competitivo');
  assert.ok(comp.totalSeries > ini.totalSeries);
});

test('subconjunto de estacoes conta menos que a prova inteira', () => {
  const parcial = volumeHyrox(HYROX_ESTACOES.slice(0, 3));
  const inteira = volumeHyrox();
  assert.ok(parcial.totalSeries < inteira.totalSeries);
});

test('gerarTreino repassa o nivel para o volume do Hyrox — sem isso, todo nivel virava intermediario', async () => {
  // `montarHyrox` (gerador.js) tem `nivel` no escopo e é o ÚNICO chamador de
  // produção; se ele não repassar, `volumeHyrox` cai sempre no default
  // 'intermediario' e a turma avançada lê o mesmo volume da iniciante — o nível
  // fica morto em produção mesmo a régua sabendo escalar por nível.
  const { gerarTreino } = await import('./gerador.js');
  const ini = gerarTreino({ modalidade: 'hyrox', nivel: 'iniciante', dia: 'ter', semana: 1, nAlunos: 8 });
  const avc = gerarTreino({ modalidade: 'hyrox', nivel: 'avancado', dia: 'ter', semana: 1, nAlunos: 8 });
  assert.equal(ini.volume.totalSeries, volumeHyrox(HYROX_ESTACOES, 'iniciante').totalSeries);
  assert.equal(avc.volume.totalSeries, volumeHyrox(HYROX_ESTACOES, 'avancado').totalSeries);
  assert.notEqual(ini.volume.totalSeries, avc.volume.totalSeries,
    'iniciante e avançado saíram com o mesmo volume — o nível não está chegando em volumeHyrox');
});
