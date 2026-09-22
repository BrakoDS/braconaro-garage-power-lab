// @ts-check
/**
 * Rodar: node --test compartilhado/regras/matriz-individualizacao.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPO, VERSAO, e1rm, cargaDe1RM, matrizDe, historicoDaSemana, separarParaGravar,
  semanaId, zerarGrupos, volumePorGrupo, resumoDeAdaptacoes, rotulo, REGRAS_IMPACTO,
} from './matriz-individualizacao.js';
import { GRUPOS } from './grupos.js';
import { focoDe } from './metas-aluno.js';

test('ficha antiga sai com a matriz inteira em branco, e nao quebrada', () => {
  // É a maioria das fichas de hoje. O Motor não pode ter que perguntar se o
  // campo existe antes de ler.
  const m = matrizDe({ nome: 'Ana' });
  assert.equal(m.versao, VERSAO);
  assert.equal(m.perfil.nivel, '');
  assert.equal(m.adaptacoes.impacto, 'livre', 'o padrao e fazer impacto normalmente');
  assert.equal(m.adaptacoes.tracao, 'barra');
  assert.deepEqual(m.adaptacoes.lesoes, []);
  assert.deepEqual(m.historico.correcoes, {}, 'sem correcao nenhuma, a conta e do sistema');
  assert.equal(m.cargas.referencia.agachamento.rmEfetivo, null);
  assert.deepEqual(matrizDe(null).adaptacoes.mobilidade, [], 'nem aluno nenhum derruba');
});

test('os campos do topo da ficha entram na matriz sem virar copia', () => {
  const a = { nivel: 'avancado', objetivo: 'Hipertrofia', foco: ['perna', 'gluteo'], freqVezes: '4' };
  const m = matrizDe(a);
  assert.equal(m.perfil.nivel, 'avancado');
  assert.equal(m.perfil.objetivo, 'Hipertrofia');
  assert.equal(m.perfil.focoPrimario, 'perna');
  assert.equal(m.perfil.focoSecundario, 'gluteo');
  assert.equal(m.perfil.freqVezes, '4');
  // Nada disso foi gravado dentro do campo novo — a fonte da verdade é uma só.
  assert.equal(a[CAMPO], undefined);
});

test('valor que a lista nao conhece cai no padrao, nunca vaza', () => {
  const m = matrizDe({
    nivel: 'semideus',
    foco: ['panturrilha', 'costas'],
    [CAMPO]: {
      perfil: { fase: 'crossfit' },
      cargas: { rir: '9-10' },
      adaptacoes: {
        impacto: 'voar', tracao: 'guindaste',
        mobilidade: ['ombro_overhead', 'orelha'],
        lesoes: [{ regiao: 'asa' }, { regiao: 'ombro', gravidade: 'catastrofica' }],
      },
    },
  });
  assert.equal(m.perfil.nivel, '');
  assert.equal(m.perfil.fase, '');
  assert.equal(m.cargas.rir, '');
  assert.equal(m.adaptacoes.impacto, 'livre');
  assert.equal(m.adaptacoes.tracao, 'barra');
  assert.deepEqual(m.adaptacoes.mobilidade, ['ombro_overhead']);
  assert.equal(m.adaptacoes.lesoes.length, 1, 'lesao sem regiao conhecida nao entra');
  assert.equal(m.adaptacoes.lesoes[0].gravidade, 'leve', 'gravidade desconhecida vira leve');
  assert.equal(m.perfil.focoPrimario, 'costas', 'panturrilha nao e um dos sete');
});

test('1RM: Epley, com a maxima digitada ganhando da estimativa', () => {
  assert.equal(e1rm(100, 1), 100, 'uma repeticao ja e a maxima');
  assert.equal(e1rm(100, 5), 116.5, '100 x (1 + 5/30)');
  assert.equal(e1rm('82,5', '3'), 91, 'virgula e texto vem do formulario');
  assert.equal(e1rm(0, 5), null);
  assert.equal(e1rm(100, 0), null);
  assert.equal(e1rm('', ''), null);

  const estimado = matrizDe({ [CAMPO]: { cargas: { referencia: { supino: { kg: 100, reps: 5 } } } } });
  assert.equal(estimado.cargas.referencia.supino.rmEfetivo, 116.5);
  assert.equal(estimado.cargas.referencia.supino.rm, null, 'ninguem mediu maxima nenhuma aqui');
  const testado = matrizDe({ [CAMPO]: { cargas: { referencia: { supino: { kg: 100, reps: 5, rm: 110 } } } } });
  assert.equal(testado.cargas.referencia.supino.rmEfetivo, 110, 'teste de verdade vale mais que a conta');
});

test('a estimativa nao e gravada, para nao congelar no primeiro teste', () => {
  // O bug que isto tranca: se o 1RM estimado fosse gravado no campo da máxima
  // medida, ele passaria a ganhar de si mesmo — mudar as repetições depois não
  // mexeria mais no número, e o aluno treinaria a vida toda no 1RM de agosto.
  const um = separarParaGravar({ cargas: { referencia: { supino: { kg: 100, reps: 5 } } } }).matriz;
  assert.equal(um.cargas.referencia.supino.rm, null);
  assert.equal(um.cargas.referencia.supino.rmEfetivo, undefined, 'derivado nao vai para o documento');

  // Sobe o peso do teste: o 1RM efetivo acompanha, porque é refeito na leitura.
  const dois = separarParaGravar({ cargas: { referencia: { supino: { kg: 110, reps: 5 } } } }).matriz;
  assert.equal(matrizDe({ [CAMPO]: dois }).cargas.referencia.supino.rmEfetivo, 128.5);
});

test('a carga de trabalho sai no que da para montar na barra', () => {
  assert.equal(cargaDe1RM(100, 75), 75);
  assert.equal(cargaDe1RM(117.5, 70), 82.5, 'multiplo de 2,5 — o par de anilhas mais leve');
  assert.equal(cargaDe1RM(null, 70), null);
  assert.equal(cargaDe1RM(100, 0), null);
});

test('correcao de semana passada nao vale como status atual', () => {
  const agora = new Date('2026-09-16T10:00:00');   // uma quarta-feira
  const estaSemana = semanaId(agora);

  const atual = historicoDaSemana({ historico: { semanaId: estaSemana, correcoes: { perna: 14 }, atualizadoEm: 5 } }, agora);
  assert.equal(atual.vencido, false);
  assert.deepEqual(atual.correcoes, { perna: 14 });

  const velho = historicoDaSemana({ historico: { semanaId: '2026-09-07', correcoes: { perna: 14 } } }, agora);
  assert.equal(velho.vencido, true, 'a tela precisa poder explicar o campo vazio');
  assert.deepEqual(velho.correcoes, {});
  assert.equal(velho.semanaId, estaSemana);

  const nunca = historicoDaSemana({ historico: {} }, agora);
  assert.equal(nunca.vencido, false, 'quem nunca corrigiu nada nao teve semana vencida');
  assert.deepEqual(nunca.correcoes, {});
});

test('o volume da semana e o derivado — a ficha so corrige onde foi escrito', () => {
  const agora = new Date('2026-09-16T10:00:00');
  const derivado = { peito: 6, costas: 9, perna: 12 };
  const semFicha = volumePorGrupo(null, derivado, agora);
  assert.equal(semFicha.perna, 12, 'sem ficha, manda a conta do sistema');
  assert.equal(semFicha.ombro, 0, 'grupo que o sistema nao contou entra zerado');
  assert.deepEqual(Object.keys(semFicha).sort(), [...GRUPOS].sort(), 'sempre os sete');

  const m = matrizDe({ [CAMPO]: { historico: { semanaId: semanaId(agora), correcoes: { peito: 10, perna: 0 } } } });
  const corrigido = volumePorGrupo(m, derivado, agora);
  assert.equal(corrigido.peito, 10, 'treinou em casa — a correcao ganha');
  assert.equal(corrigido.perna, 0, 'zero digitado e correcao de verdade, nao ausencia');
  assert.equal(corrigido.costas, 9, 'grupo sem correcao segue com o derivado');

  const velha = matrizDe({ [CAMPO]: { historico: { semanaId: '2026-09-07', correcoes: { peito: 10 } } } });
  assert.equal(volumePorGrupo(velha, derivado, agora).peito, 6, 'correcao da semana passada nao alcanca esta');
});

test('correcao so aceita grupo que existe e numero que faz sentido', () => {
  const m = matrizDe({ [CAMPO]: { historico: { correcoes: { panturrilha: 8, perna: -3, peito: 'muito', costas: 7 } } } });
  assert.deepEqual(m.historico.correcoes, { costas: 7 });
});

test('gravar separa o que e do topo da ficha do que e da matriz', () => {
  const { topo, matriz } = separarParaGravar({
    perfil: { nivel: 'intermediario', objetivo: 'Hipertrofia', fase: 'forca', focoPrimario: 'gluteo', focoSecundario: 'perna', freqVezes: '3' },
    cargas: { referencia: { agachamento: { kg: 80, reps: 5 } }, rir: '2-3', airbike: { rpm: 60 } },
    adaptacoes: { impacto: 'converter_airbike', tracao: 'puxada_alta', lesoes: [{ regiao: 'ombro', gravidade: 'moderada' }] },
  });

  assert.deepEqual(topo.foco, ['gluteo', 'perna'], 'o primario vem primeiro');
  assert.equal(topo.nivel, 'intermediario');
  assert.equal(topo.objetivo, 'Hipertrofia');
  assert.equal(topo.freqVezes, '3');
  assert.equal(matriz.perfil.fase, 'forca');
  assert.equal(matriz.perfil.nivel, undefined, 'o nivel mora no topo, e so la');
  assert.equal(matriz.perfil.foco, undefined);
  assert.equal(matrizDe({ [CAMPO]: matriz }).cargas.referencia.agachamento.rmEfetivo, 93.5, '80 x (1 + 5/30)');
  assert.equal(matriz.adaptacoes.impacto, 'converter_airbike');
  assert.ok(matriz.atualizadoEm > 0);

  // O foco gravado continua sendo lido pela regra que ja existe.
  assert.deepEqual(focoDe({ foco: topo.foco }), ['gluteo', 'perna']);
});

test('o mesmo grupo nos dois selects de foco e erro de clique, nao foco dobrado', () => {
  const { topo } = separarParaGravar({ perfil: { focoPrimario: 'perna', focoSecundario: 'perna' } });
  assert.deepEqual(topo.foco, ['perna']);
});

test('ida e volta: o que e gravado e lido de volta igual', () => {
  const entrada = {
    perfil: { nivel: 'avancado', objetivo: 'Emagrecimento', fase: 'condicionamento', focoPrimario: 'core', focoSecundario: '', freqVezes: '5' },
    cargas: { referencia: { terra: { kg: 140, reps: 3, medidoEm: '2026-08-01' } }, rir: '1-2', airbike: { rpm: 70, calPorMin: 12, obs: 'joelho reclama acima de 75' } },
    adaptacoes: { impacto: 'reduzir', tracao: 'barra_assistida', mobilidade: ['tornozelo'], lesoes: [{ regiao: 'joelho', gravidade: 'leve', desde: '2025-02-10', obs: 'condromalacia' }], obs: 'sem overhead' },
  };
  const { topo, matriz } = separarParaGravar(entrada);
  const lida = matrizDe({ ...topo, [CAMPO]: matriz });

  assert.deepEqual(lida.perfil, entrada.perfil);
  assert.equal(lida.cargas.rir, '1-2');
  assert.equal(lida.cargas.airbike.calPorMin, 12);
  assert.equal(lida.cargas.referencia.terra.rmEfetivo, 154, '140 x (1 + 3/30)');
  assert.equal(lida.cargas.referencia.terra.medidoEm, '2026-08-01');
  assert.deepEqual(lida.adaptacoes.lesoes, entrada.adaptacoes.lesoes);
  assert.equal(lida.adaptacoes.obs, 'sem overhead');
});

test('o resumo so fala do que foge do padrao', () => {
  assert.equal(resumoDeAdaptacoes(matrizDe({})), '', 'aluno sem adaptacao nenhuma nao gera linha');
  const m = matrizDe({ [CAMPO]: { adaptacoes: { impacto: 'converter_airbike', lesoes: [{ regiao: 'lombar' }] } } });
  const txt = resumoDeAdaptacoes(m);
  assert.ok(txt.includes(rotulo(REGRAS_IMPACTO, 'converter_airbike')));
  assert.ok(txt.includes('Lombar'));
});
