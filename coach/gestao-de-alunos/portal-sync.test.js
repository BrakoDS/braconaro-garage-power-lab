// @ts-check
/**
 * A fatia publicada para o aluno. O que entra aqui é TUDO o que o Portal enxerga
 * daquele aluno — e o que sai daqui, ele deixa de ver sem aviso nenhum.
 *
 * Rodar: node --test coach/gestao-de-alunos/portal-sync.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fatia } from './portal-sync.js?v=27';

test('o perfil de treino vai na fatia, para o Portal calcular a versao do aluno', () => {
  const a = {
    id: '007', nome: 'Ana', email: 'Ana@Exemplo.com ', objetivo: 'Hipertrofia',
    foco: ['perna'], restricoes: [{ evitarId: 'agacho_smith', substitutoId: 'leg_press', motivo: 'joelho' }],
    metasGrupo: { perna: 20 },
  };
  const f = fatia(a, [a]);
  assert.equal(f.email, 'ana@exemplo.com', 'o e-mail e a chave do documento: sempre normalizado');
  assert.equal(f.objetivo, 'Hipertrofia');
  assert.deepEqual(f.foco, ['perna']);
  assert.equal(f.restricoes[0].substitutoId, 'leg_press');
  assert.deepEqual(f.metasGrupo, { perna: 20 });
});

test('metas corporais e metas por grupo saem cada uma no seu campo', () => {
  // O bug: a lista de metas corporais (aba Progresso) saía como `metasGrupo`.
  const meta = { id: 'm1', tipo: 'peso', alvo: 80, base: 90, baseData: '2026-09-01', criadoEm: 1 };
  const f = fatia({ id: '007', email: 'a@b.com', metas: [meta], metasGrupo: { perna: 20 } }, []);
  assert.deepEqual(f.metas, [meta]);
  assert.deepEqual(f.metasGrupo, { perna: 20 });
  const soCorporal = fatia({ id: '007', email: 'a@b.com', metas: [meta] }, []);
  assert.deepEqual(soCorporal.metasGrupo, {}, 'a lista nunca vira meta por grupo');
});

test('ficha antiga, com o mapa por grupo em `metas`: sai como metasGrupo, e metas fica lista', () => {
  const f = fatia({ id: '007', email: 'a@b.com', metas: { perna: 20 } }, []);
  assert.deepEqual(f.metasGrupo, { perna: 20 });
  assert.deepEqual(f.metas, []);
});

test('ficha antiga, sem perfil nenhum, publica vazio — e nao quebra o Portal', () => {
  // É o estado da maioria das fichas. Vazio quer dizer "sem deslocamento".
  const f = fatia({ id: '001', nome: 'João', email: 'joao@exemplo.com' }, []);
  assert.deepEqual(f.foco, []);
  assert.deepEqual(f.restricoes, []);
  assert.deepEqual(f.metasGrupo, {});
});

test('a fatia nao leva dado que e so do coach', () => {
  // O Portal mostra a ficha do proprio aluno; anotacao interna, telefone de
  // terceiro e presenca de outro aluno nunca podem vazar por aqui.
  const f = fatia({ id: '001', email: 'x@y.com', obs: 'lesão antiga no ombro', telefone: '11999999999', anotacoesCoach: 'cobrar pagamento' }, []);
  assert.ok(!('anotacoesCoach' in f));
  assert.ok(!('telefone' in f));
});

test('appLiberado: so a marcacao explicita libera o app', () => {
  // Padrao do box: ficha antiga, sem o campo, fica BLOQUEADA no app mobile.
  assert.equal(fatia({ id: '001', email: 'a@b.com', appLiberado: true }, []).appLiberado, true);
  assert.equal(fatia({ id: '001', email: 'a@b.com', appLiberado: false }, []).appLiberado, false);
  assert.equal(fatia({ id: '001', email: 'a@b.com' }, []).appLiberado, false, 'ficha antiga bloqueia');
  // Lixo que um import de planilha poderia deixar na ficha nao vira liberacao.
  for (const lixo of ['true', 1, 'sim', {}, null]) {
    assert.equal(fatia({ id: '001', email: 'a@b.com', appLiberado: lixo }, []).appLiberado, false, `appLiberado=${JSON.stringify(lixo)}`);
  }
});

test('modoLite: so a marcacao explicita liga a tela simplificada', () => {
  // Ficha antiga, sem o campo, continua com a Home completa de sempre.
  assert.equal(fatia({ id: '001', email: 'a@b.com', modoLite: true }, []).modoLite, true);
  assert.equal(fatia({ id: '001', email: 'a@b.com', modoLite: false }, []).modoLite, false);
  assert.equal(fatia({ id: '001', email: 'a@b.com' }, []).modoLite, false, 'ficha antiga fica na tela completa');
  for (const lixo of ['true', 1, 'sim', {}, null]) {
    assert.equal(fatia({ id: '001', email: 'a@b.com', modoLite: lixo }, []).modoLite, false, `modoLite=${JSON.stringify(lixo)}`);
  }
  const publicado = JSON.parse(JSON.stringify(fatia({ id: '001', email: 'a@b.com' }, [])));
  assert.equal(typeof publicado.modoLite, 'boolean', 'o campo vai ao documento mesmo desligado');
});

test('appLiberado sai como booleano, e sobrevive ao JSON da publicacao', () => {
  // `publicarPortal` passa a fatia por JSON antes do setDoc: undefined sumiria do
  // documento, e o campo precisa estar LA para o coach auditar no console.
  const publicado = JSON.parse(JSON.stringify(fatia({ id: '001', email: 'a@b.com' }, [])));
  assert.ok('appLiberado' in publicado);
  assert.equal(typeof publicado.appLiberado, 'boolean');
});

test('as faltas lançadas no Painel de Presença vão na fatia, junto com os créditos', () => {
  const a = {
    id: '008', nome: 'Bia', email: 'bia@exemplo.com',
    atestados: { '2026-10-05': { em: 1, tipo: 'desmarcacao', expira: '2026-11-03', reposicao: null } },
    faltas: { '2026-10-07': { em: 2, tipo: 'no-show', aula: { data: '2026-10-07', hora: '07:00' } } },
  };
  const f = fatia(a, [a]);
  assert.deepEqual(f.faltas, a.faltas);
  assert.equal(f.atestados['2026-10-05'].expira, '2026-11-03');
  assert.deepEqual(fatia({ id: '009', nome: 'Sem', email: 's@e.com' }, []).faltas, {}, 'ficha antiga publica vazio');
});
