import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarPostos, montarMobilidade, montarWod, atribuirTecnicas, gerarHibrido, volumeHibrido,
} from './hibrido.js';
import { verificarViabilidade } from './viabilidade.js';
import { calcularPostos, calcularSeries, SERIE_SEG } from './hibrido-postos.js';
import { EXERCICIOS } from '../data/exercicios.js';

/** mulberry32 — mesmo RNG do gerador, pra teste determinístico. */
function rngDe(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const montar = (o = {}) => montarPostos({
  nivel: 'intermediario', semana: 2, nAlunos: 8, idsEvitar: [], rng: rngDe(o.seed ?? 1), ...o,
});

test('8 alunas geram 4 postos; 6 geram 3 (o core sai)', () => {
  assert.equal(montar({ nAlunos: 8 }).length, 4);
  const seis = montar({ nAlunos: 6 });
  assert.equal(seis.length, 3);
  assert.deepEqual(seis.map((p) => p.par), ['peito_costas', 'quadriceps_posterior', 'bracos']);
});

test('cada posto tem dois exercícios distintos, um de cada lado do par', () => {
  for (const p of montar()) {
    assert.ok(p.a && p.b, `posto ${p.par} incompleto`);
    assert.notEqual(p.a.id, p.b.id, `posto ${p.par} repetiu o exercício`);
  }
});

test('os músculos de cada posto batem com o par declarado', () => {
  const postos = montar();
  const peito = postos.find((p) => p.par === 'peito_costas');
  assert.ok(peito.a.musculosPrimarios.includes('peito'));
  assert.ok(peito.b.musculosPrimarios.includes('costas'));
  const bracos = postos.find((p) => p.par === 'bracos');
  assert.ok(bracos.a.musculosPrimarios.includes('biceps'));
  assert.ok(bracos.b.musculosPrimarios.includes('triceps'));
});

test('nenhum exercício se repete entre postos', () => {
  const ids = montar().flatMap((p) => [p.a.id, p.b.id]);
  assert.equal(new Set(ids).size, ids.length);
});

test('o inventário aguenta os 4 postos rodando juntos, em qualquer seed', () => {
  for (let seed = 0; seed < 50; seed++) {
    const postos = montarPostos({
      nivel: 'intermediario', semana: 2, nAlunos: 8, idsEvitar: [], rng: rngDe(seed),
    });
    const exs = postos.flatMap((p) => [p.a, p.b]);
    assert.equal(exs.length, 8, `seed ${seed}: postos incompletos`);
    const v = verificarViabilidade(exs, 8, exs.length);
    assert.ok(v.ok, `seed ${seed}: ${v.conflitos.join(' ')}`);
    assert.equal(v.tamanhoGrupo, 1, `seed ${seed}: cada exercício serve 1 pessoa por vez`);
  }
});

test('a prescrição da semana chega em todos os postos', () => {
  for (const p of montar({ semana: 3 })) {
    assert.equal(p.series, 3);          // 4 postos → 3 séries
    assert.equal(p.reps, 8);            // semana 3 = pico
    assert.equal(p.descansoSeg, 72);
    assert.equal(p.pctRM, 75);
  }
});

test('o bloco fecha em 24 min com 8 ou com 6 alunas', () => {
  const bloco = (postos) => postos.reduce((a, p) => a + p.tempoSeg, 0);
  assert.equal(bloco(montar({ nAlunos: 8 })), 24 * 60);
  assert.equal(bloco(montar({ nAlunos: 6 })), 24 * 60);
});

test('nAlunos de 1 a 20 (faixa aceita pela UI) nunca lança exceção nem excede o teto de postos', () => {
  for (let nAlunos = 1; nAlunos <= 20; nAlunos++) {
    for (const semana of [1, 2, 3, 4]) {
      for (const seed of [0, 1, 2]) {
        assert.doesNotThrow(() => {
          const postos = montarPostos({
            nivel: 'intermediario', semana, nAlunos, idsEvitar: [], rng: rngDe(nAlunos * 100 + semana * 10 + seed),
          });
          assert.ok(
            postos.length <= calcularPostos(nAlunos),
            `nAlunos ${nAlunos} semana ${semana} seed ${seed}: ${postos.length} postos > teto de ${calcularPostos(nAlunos)}`,
          );
        }, `nAlunos ${nAlunos} semana ${semana} seed ${seed} lançou exceção`);
      }
    }
  }
});

test('quando um posto cai, as séries recalculam sobre o Nº REAL de postos (o bloco tenta voltar a 24 min)', () => {
  let achouQueda = false;
  for (let seed = 0; seed < 40; seed++) {
    const postos = montarPostos({
      nivel: 'intermediario', semana: 2, nAlunos: 18, idsEvitar: [], rng: rngDe(seed),
    });
    if (!postos.length) continue;
    if (postos.length < calcularPostos(18)) achouQueda = true;
    const esperado = calcularSeries(postos.length);
    for (const p of postos) {
      assert.equal(p.series, esperado, `seed ${seed}: série não recalculada sobre postos.length real`);
      assert.equal(p.tempoSeg, esperado * SERIE_SEG);
    }
  }
  assert.ok(achouQueda, 'teste não encontrou nenhuma seed com posto descartado (pré-condição do cenário)');
});

test('deload corta uma série de cada posto', () => {
  assert.equal(montar({ semana: 4, nAlunos: 8 })[0].series, 2); // 3 - 1
  assert.equal(montar({ semana: 4, nAlunos: 6 })[0].series, 3); // 4 - 1
});

test('idsEvitar afasta o exercício sem travar a montagem', () => {
  const base = montar({ seed: 3 });
  const evitados = base.flatMap((p) => [p.a.id, p.b.id]);
  const outro = montarPostos({
    nivel: 'intermediario', semana: 2, nAlunos: 8, idsEvitar: evitados, rng: rngDe(3),
  });
  assert.equal(outro.length, 4, 'a montagem não pode degradar por causa do idsEvitar');
  const repetidos = outro.flatMap((p) => [p.a.id, p.b.id]).filter((id) => evitados.includes(id));
  assert.ok(repetidos.length <= 2, `repetiu demais: ${repetidos.join(', ')}`);
});

test('iniciante não recebe exercício avançado', () => {
  const NIVEL = { iniciante: 1, intermediario: 2, avancado: 3 };
  for (const p of montar({ nivel: 'iniciante' })) {
    for (const ex of [p.a, p.b]) {
      assert.ok(NIVEL[ex.nivel] <= NIVEL.iniciante, `${ex.nome} é ${ex.nivel}`);
    }
  }
});

test('rede de segurança nunca entrega exercício acima do nível, mesmo sob pressão máxima', () => {
  const NIVEL = { iniciante: 1, intermediario: 2, avancado: 3 };
  // Todos os ids de exercícios iniciante que servem ao bloco (musculacao && !ocupaTudo)
  const idsIniciante = EXERCICIOS
    .filter((e) => e.categorias.includes('musculacao') && !e.ocupaTudo && e.nivel === 'iniciante')
    .map((e) => e.id);

  // Rodar múltiplas seeds com máxima pressão: idsEvitar = todos os iniciantes
  for (let seed = 0; seed < 30; seed++) {
    const postos = montarPostos({
      nivel: 'iniciante', semana: 2, nAlunos: 8, idsEvitar: idsIniciante, rng: rngDe(seed),
    });
    for (const p of postos) {
      for (const lado of ['a', 'b']) {
        const ex = p[lado];
        assert.ok(
          NIVEL[ex.nivel] <= NIVEL.iniciante,
          `seed ${seed}: ${ex.nome} (${ex.nivel}) vazou no lado ${lado} do par ${p.par}`,
        );
      }
    }
  }
});

test('mobilidade tem 4 min nas semanas normais e 12 no deload', () => {
  const postos = montar();
  const soma = (itens) => itens.reduce((a, m) => a + m.duracaoSeg, 0);
  assert.ok(Math.abs(soma(montarMobilidade(postos, rngDe(1), false)) - 240) <= 2);
  assert.ok(Math.abs(soma(montarMobilidade(postos, rngDe(1), true)) - 720) <= 2);
});

test('a mobilidade mira nos músculos que os postos vão treinar', () => {
  const postos = montar({ seed: 5 });
  const alvo = new Set(postos.flatMap((p) => [...p.a.musculosPrimarios, ...p.b.musculosPrimarios]));
  const itens = montarMobilidade(postos, rngDe(5), false);
  assert.ok(itens.length > 0);
  assert.ok(itens.some((m) => m.musculosAlvo?.some((mu) => alvo.has(mu)) ?? true));
});

const wod = (o = {}) => montarWod({
  padroesFaltantes: new Set(), semana: 2, nAlunos: 8, rng: rngDe(o.seed ?? 1), ...o,
});

test('a duração do WOD segue a semana do ciclo', () => {
  assert.equal(wod({ semana: 1 }).duracaoMin, 16);
  assert.equal(wod({ semana: 3 }).duracaoMin, 20);
  assert.equal(wod({ semana: 4 }).duracaoMin, 12);
});

test('o deload trava o formato em EMOM', () => {
  for (let seed = 0; seed < 20; seed++) {
    assert.equal(wod({ semana: 4, seed }).formato, 'EMOM',
      'EMOM é o único formato cujo ritmo a estrutura impõe');
  }
});

test('fora do deload o formato varia', () => {
  const formatos = new Set([...Array(30).keys()].map((seed) => wod({ semana: 2, seed }).formato));
  assert.ok(formatos.size > 1, `sorteou sempre ${[...formatos]}`);
});

test('o WOD cobre o padrão que a Hipertrofia deixou de fora', () => {
  const b = wod({ padroesFaltantes: new Set(['core']) });
  assert.ok(b.movimentos.some((m) => m.padraoDominante === 'core'));
});

test('técnicas se aplicam ao posto e somem no deload', () => {
  const postos = montar();
  assert.ok(atribuirTecnicas(postos.map((p) => ({ ...p })), rngDe(1), false).some((p) => p.tecnica));
  assert.ok(atribuirTecnicas(postos.map((p) => ({ ...p })), rngDe(1), true).every((p) => !p.tecnica),
    'deload não tem trabalho até a falha');
});

const gerar = (o = {}) => gerarHibrido({ dia: 'seg', semana: 2, nivel: 'intermediario', nAlunos: 8, ...o });

test('gerarHibrido devolve os 3 blocos e não fala mais em split', () => {
  const h = gerar();
  assert.ok(h.mobilidade.length && h.hipertrofia.length && h.wod.movimentos.length);
  assert.equal(h.split, undefined);
  assert.equal(h.splitLabel, undefined);
});

test('a mesma entrada gera sempre o mesmo treino', () => {
  assert.deepEqual(gerar(), gerar());
});

test('a aula fecha na janela esperada em todas as semanas', () => {
  for (const semana of [1, 2, 3, 4]) {
    for (const nAlunos of [6, 8]) {
      const min = gerar({ semana, nAlunos }).duracaoSeg / 60;
      assert.ok(min >= 38 && min <= 54, `semana ${semana}, ${nAlunos} alunas: ${min.toFixed(1)}min`);
    }
  }
});

test('a nota de viabilidade lista os pares montados', () => {
  const h = gerar();
  assert.ok(h.viabilidade.ok);
  assert.ok(h.viabilidade.nota.includes('Peito / Costas'), h.viabilidade.nota);
});

test('a checagem final de viabilidade reflete a composição REAL da aula, não a pretendida', () => {
  // Âncora do bug: 17 alunas / seed 10 — 2 dos 4 postos pretendidos caem, sobram 4
  // exercícios reais pra 17 alunas (grupos de ~5 por estação), e o box só tem 2
  // Smiths / 2 bancos reguláveis / 2 torres de monocross. É um conflito REAL de
  // equipamento. Com o denominador pretendido (2×4=8 slots) esse conflito ficava
  // mascarado atrás do selo "✓ viável"; com o denominador real (exercicios.length)
  // ele tem que aparecer — gerarHibrido().viabilidade.ok tem que bater exatamente
  // com verificarViabilidade() usando a mesma contagem real.
  const h = gerarHibrido({ dia: 'd', semana: 1, nivel: 'intermediario', nAlunos: 17, seed: 10 });
  const exs = h.hipertrofia.flatMap((p) => [p.a, p.b]);
  assert.ok(h.hipertrofia.length < calcularPostos(17), 'pré-condição do cenário: precisa de um posto caído');
  assert.equal(
    h.viabilidade.ok,
    verificarViabilidade(exs, 17, exs.length).ok,
    'gerarHibrido().viabilidade.ok tem que bater com a verdade física (verificarViabilidade sobre a contagem real)',
  );
  assert.equal(h.viabilidade.ok, false, 'este caso é um conflito real de equipamento — não pode passar como viável');

  // Caso normal: nada cai, e o alarme continua calado — 8 alunas / semana 2 seguem
  // ok === true, com a nota listando os pares montados (não pode virar alarmista).
  const normal = gerar({ nAlunos: 8, semana: 2 });
  assert.equal(normal.viabilidade.ok, true);
  assert.ok(normal.viabilidade.nota.includes('postos de bi-set'), normal.viabilidade.nota);
});

test('quando um posto cai mas a turma continua fisicamente viável, a nota avisa o coach quantos saíram', () => {
  let achouQueda = false;
  for (let seed = 0; seed < 40; seed++) {
    const h = gerarHibrido({ dia: 'seg', semana: 2, nivel: 'intermediario', nAlunos: 18, seed });
    // Só interessa o caso "posto caiu, mas sem virar conflito de equipamento" — quando
    // vira conflito real, a nota é a lista de conflitos, não o aviso de posto perdido
    // (ver teste acima: isso é o comportamento correto, não uma regressão).
    if (h.hipertrofia.length >= 4 || !h.viabilidade.ok) continue;
    achouQueda = true;
    assert.ok(
      /posto.*não coube|não couberam/.test(h.viabilidade.nota),
      `seed ${seed}: nota não avisa sobre o posto perdido — ${h.viabilidade.nota}`,
    );
  }
  assert.ok(achouQueda, 'teste não encontrou nenhuma seed com posto descartado e ainda viável (pré-condição do cenário)');
});

test('o volume credita os DOIS exercícios de cada posto', () => {
  const h = gerar();
  const vol = volumeHibrido(h.hipertrofia, h.wod);
  const seriesDaHipertrofia = h.hipertrofia.reduce((a, p) => a + p.series * 2, 0);
  assert.ok(vol.totalSeries >= seriesDaHipertrofia,
    `${vol.totalSeries} < ${seriesDaHipertrofia} — algum lado do bi-set ficou sem crédito`);
});

test('bíceps e tríceps entram no volume — o desenho antigo só os creditava de raspão', () => {
  const h = gerar();
  const vol = volumeHibrido(h.hipertrofia, h.wod);
  assert.ok(vol.porMusculo.biceps > 0, 'bíceps sem volume');
  assert.ok(vol.porMusculo.triceps > 0, 'tríceps sem volume');
});
