// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escalaBarras, arcosRosca, pontosLinha, PALETA_ROSCA, COR_OUTROS, MAX_FATIAS,
} from './graficos.js';

test('barras: prescrito e meta medem contra a MESMA régua', () => {
  const [peito] = escalaBarras([{ rotulo: 'Peito', valor: 5, meta: 10 }], { folga: 1 });
  // A meta é o maior valor da série, então ela ocupa 100% e o prescrito, metade.
  assert.equal(peito.pctMeta, 100);
  assert.equal(peito.pctValor, 50);
});

test('barras: a régua considera a meta, não só o prescrito', () => {
  // Semana fraca: ninguém chegou perto da meta. Se a régua olhasse só o
  // prescrito, a barra de 3 séries sairia cheia e a meta ficaria fora da tela.
  const [g] = escalaBarras([{ rotulo: 'Perna', valor: 3, meta: 12 }], { folga: 1 });
  assert.ok(g.pctValor < 30, `barra de semana fraca não pode sair cheia (${g.pctValor}%)`);
});

test('barras: saldo e estado dizem se o grupo ficou abaixo, na meta ou acima', () => {
  const r = escalaBarras([
    { rotulo: 'Peito', valor: 4, meta: 10 },
    { rotulo: 'Costas', valor: 10, meta: 10 },
    { rotulo: 'Perna', valor: 14, meta: 10 },
  ]);
  assert.deepEqual(r.map((x) => x.estado), ['abaixo', 'na_meta', 'acima']);
  assert.deepEqual(r.map((x) => x.saldo), [-6, 0, 4]);
});

test('barras: semana sem treino nem meta não divide por zero', () => {
  const r = escalaBarras([{ rotulo: 'Peito', valor: 0, meta: 0 }]);
  assert.equal(r[0].pctValor, 0);
  assert.ok(Number.isFinite(r[0].pctMeta));
});

test('barras: valor negativo vindo torto do banco vira zero, não barra invertida', () => {
  const [g] = escalaBarras([{ rotulo: 'X', valor: -5, meta: 10 }]);
  assert.equal(g.valor, 0);
  assert.equal(g.pctValor, 0);
});

test('rosca: as fatias somam 100% e saem na ordem de tamanho', () => {
  const { arcos, total } = arcosRosca([
    { rotulo: 'Barra', valor: 6 },
    { rotulo: 'Halter', valor: 3 },
    { rotulo: 'KB', valor: 1 },
  ]);
  assert.equal(total, 10);
  assert.deepEqual(arcos.map((a) => a.rotulo), ['Barra', 'Halter', 'KB']);
  assert.equal(Math.round(arcos.reduce((s, a) => s + a.pct, 0)), 100);
});

test('rosca: a cor segue a POSIÇÃO na paleta fixa, nunca uma cor gerada', () => {
  const { arcos } = arcosRosca([{ rotulo: 'Barra', valor: 2 }, { rotulo: 'Halter', valor: 1 }]);
  assert.equal(arcos[0].cor, PALETA_ROSCA[0]);
  assert.equal(arcos[1].cor, PALETA_ROSCA[1]);
});

test('rosca: acima de 6 implementos o excedente vira "Outros", não uma sétima cor', () => {
  const muitos = Array.from({ length: 9 }, (_, i) => ({ rotulo: `Imp${i}`, valor: 9 - i }));
  const { arcos } = arcosRosca(muitos);
  assert.equal(arcos.length, MAX_FATIAS + 1);
  const ultimo = arcos[arcos.length - 1];
  assert.ok(ultimo.rotulo.startsWith('Outros'), `esperava "Outros", veio "${ultimo.rotulo}"`);
  assert.equal(ultimo.cor, COR_OUTROS);
  assert.equal(Math.round(arcos.reduce((s, a) => s + a.pct, 0)), 100);
});

test('rosca: uma fatia só vira anel fechado, não um arco degenerado', () => {
  const { arcos } = arcosRosca([{ rotulo: 'Barra', valor: 10 }]);
  assert.equal(arcos.length, 1);
  assert.equal(arcos[0].pct, 100);
  // Dois subcaminhos (externo e interno): sem isso o navegador desenha nada.
  assert.equal((arcos[0].d.match(/M /g) || []).length, 2);
});

test('rosca: só a fatia larga o bastante recebe rótulo dentro do arco', () => {
  const { arcos } = arcosRosca([{ rotulo: 'Barra', valor: 97 }, { rotulo: 'KB', valor: 3 }]);
  assert.equal(arcos[0].rotulavel, true);
  assert.equal(arcos[1].rotulavel, false, 'rótulo em fatia de 3% seria cortado pelo próprio arco');
});

test('rosca: fatia de 12% fica sem rótulo interno — "12,2%" é mais largo que a banda do anel', () => {
  const { arcos } = arcosRosca([
    { rotulo: 'Barra', valor: 60 }, { rotulo: 'Halter', valor: 28 }, { rotulo: 'Cabo', valor: 12 },
  ]);
  assert.equal(arcos[2].pct, 12);
  assert.equal(arcos[2].rotulavel, false, 'ela aparece na legenda, que traz o percentual de todas');
  assert.equal(arcos[0].rotulavel, true);
});

test('rosca: mês sem treino devolve vazio em vez de um anel falso', () => {
  assert.deepEqual(arcosRosca([]), { arcos: [], total: 0 });
  assert.deepEqual(arcosRosca([{ rotulo: 'Barra', valor: 0 }]), { arcos: [], total: 0 });
});

test('linha: a régua começa em zero — 40 → 44 séries não pode parecer o dobro', () => {
  const r = pontosLinha([{ rotulo: 'S1', valor: 40 }, { rotulo: 'S2', valor: 44 }], { altura: 100, margem: 0 });
  const variacao = Math.abs(r.pontos[0].y - r.pontos[1].y);
  assert.ok(variacao < 15, `variação de 10% não pode ocupar meia altura (${variacao}px)`);
});

test('linha: só o último ponto é marcado para rótulo direto', () => {
  const r = pontosLinha([{ rotulo: 'S1', valor: 10 }, { rotulo: 'S2', valor: 20 }, { rotulo: 'S3', valor: 15 }]);
  assert.equal(r.ultimo?.rotulo, 'S3');
});

test('linha: um ponto só não quebra a conta de passo', () => {
  const r = pontosLinha([{ rotulo: 'S1', valor: 10 }]);
  assert.equal(r.pontos.length, 1);
  assert.ok(Number.isFinite(r.pontos[0].x) && Number.isFinite(r.pontos[0].y));
});

test('linha: série vazia devolve caminho vazio', () => {
  assert.deepEqual(pontosLinha([]), { pontos: [], d: '', max: 0, ultimo: null });
});
