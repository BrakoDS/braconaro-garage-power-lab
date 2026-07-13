// @ts-check
/**
 * GERADOR DE TREINO FULL BODY — o coração do sistema.
 *
 * Implementa os 8 passos do briefing:
 *  1. Identifica a modalidade do dia
 *  2. Define 4, 5 ou 6 exercícios
 *  3. Seleciona exercícios FULL BODY equilibrados (cobre os padrões obrigatórios)
 *  4. Verifica disponibilidade de aparelhos (8 alunos)
 *  5. Calcula volume por músculo
 *  6. Evita sobrecarga (teto por músculo + variedade vs. dia anterior)
 *  7. Ajusta o tempo total para caber em 45–50 min
 *  8. Gera treino final: aquecimento + principal + finalizador (opcional)
 *
 * @typedef {import('../data/exercicios.js').Exercicio} Exercicio
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 */
import { EXERCICIOS, EXERCICIO_POR_ID } from '../data/exercicios.js';
import { MODALIDADES } from '../config/modalidades.js';
import { padroesObrigatorios, PADROES } from '../config/padroes.js';
import { verificarViabilidade, podeAdicionar } from './viabilidade.js';
import { calcularVolume } from './volume.js';
import { seriesAjustadas, ehDeload } from './periodizacao.js';
import { ALUNOS_POR_SESSAO } from '../data/equipamentos.js';
import { gerarHyrox, volumeHyrox, estimarDuracaoSeg } from './hyrox.js';
import { gerarHiitTabata, volumeHiit, estimarDuracaoSeg as estimarDuracaoHiitSeg } from './hiitTabata.js';
import { gerarGap, volumeGap, estimarDuracaoSeg as estimarDuracaoGapSeg } from './gap.js';
import { gerarHibrido, volumeHibrido } from './hibrido.js';

const NIVEL_ORDEM = { iniciante: 1, intermediario: 2, avancado: 3 };
const TETO_SERIES_POR_MUSCULO = 10; // teto por sessão para evitar sobrecarga
// Teto do bloco principal (seg). Aula inteira (mobilidade + principal) deve caber em
// 55 min, +5 min de tolerância = 60 min teto estrito. Força tem mobilidade maior
// (7,5 min) e descanso mais longo entre séries, então seu teto de principal é mais
// justo para não estourar a janela; as demais seguem o teto padrão de 45–50 min.
const BUDGET_PRINCIPAL = {
  forca: [2400, 2850],  // 40–47,5 min — deixa a mobilidade (7,5 min) caber em 55 min
  default: [2700, 3000], // 45–50 min
};

// -------- RNG determinístico (seed reproduzível) --------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tempo de um exercício do bloco principal (segundos).
 * @param {Exercicio} ex @param {number} series @param {import('../config/modalidades.js').Modalidade} mod
 */
function tempoExercicio(ex, series, mod) {
  const transicao = 20;
  if (mod.formato === 'circuito' && mod.segPorRepMedia === 0) {
    const porRodada = mod.id === 'gap' ? 30 : 45; // GAP: TABATA 20/10; HIIT: 30/15
    return series * porRodada + transicao;
  }
  return series * (ex.tempoMedioSeg + mod.descansoSeg) + transicao;
}

/**
 * @param {Object} opcoes
 * @param {ModalidadeId} opcoes.modalidade
 * @param {'iniciante'|'intermediario'|'avancado'} opcoes.nivel
 * @param {string} opcoes.dia
 * @param {number} [opcoes.semana]
 * @param {import('./tipos.js').Treino|null} [opcoes.treinoAnterior]
 * @param {number} [opcoes.seed]
 * @param {number} [opcoes.nAlunos]
 * @param {Partial<Record<Padrao, number>>} [opcoes.viesPadrao]  Viés de seleção por padrão
 *        (positivo = priorizar; negativo = desencorajar). Usado pelo balanceamento semanal.
 * @param {string[]} [opcoes.idsEvitar]  IDs de exercícios a desencorajar (ex.: os da semana
 *        anterior do mês), para variar o estímulo entre semanas.
 */
export function gerarTreino(opcoes) {
  const {
    modalidade, nivel, dia,
    semana = 1, treinoAnterior = null, nAlunos = ALUNOS_POR_SESSAO,
    viesPadrao = {}, idsEvitar = [],
  } = opcoes;
  const seed = opcoes.seed ?? hashSeed(`${modalidade}-${dia}-${semana}-${nivel}`);
  const rng = mulberry32(seed);
  const mod = MODALIDADES[modalidade];

  // -------- Hyrox: template FIXO (formato da competição), não a geração genérica --------
  if (modalidade === 'hyrox') return montarHyrox({ dia, semana, nivel, nAlunos });
  // -------- HIIT: template TABATA em 4 estações --------
  if (modalidade === 'hiit') return montarHiit({ dia, semana, nivel, nAlunos, seed });
  // -------- GAP: aula estruturada TABATA (Aquecimento + Pernas/Glúteo/Abdômen) --------
  if (modalidade === 'gap') return montarGap({ dia, semana, nivel, nAlunos, seed });
  // -------- Híbrido: Mobilidade + Hipertrofia (split) + WOD, gerado dinamicamente --------
  if (modalidade === 'hibrido') return montarHibrido({ dia, semana, nivel, nAlunos, seed, idsEvitar });

  // -------- Passo 2: quantos exercícios (4, 5 ou 6) --------
  // A contagem é estável por TEMPLATE (modalidade+dia+nível) para que um mesociclo
  // mantenha o mesmo nº de exercícios entre semanas — a progressão vem de séries/carga,
  // não de mudar quantos exercícios. A seleção dos exercícios em si continua variando.
  const [min, max] = mod.faixaExercicios;
  const rngContagem = mulberry32(hashSeed(`${modalidade}-${dia}-${nivel}`));
  let nExercicios = ehDeload(semana) ? min : min + Math.floor(rngContagem() * (max - min + 1));
  nExercicios = Math.min(8, Math.max(4, nExercicios)); // regra do box: máx. 8

  // -------- pool elegível: modalidade + nível + não-mobilidade --------
  const nivelAluno = NIVEL_ORDEM[nivel];
  const idsAnteriores = new Set([
    ...(treinoAnterior?.principal ?? []).map((i) => i.exercicio.id),
    ...idsEvitar,
  ]);
  const naoMobilidadePura = (/** @type {Exercicio} */ e) => !(e.categorias.length === 1 && e.categorias[0] === 'mobilidade');
  const naModalidade = (/** @type {Exercicio} */ e) => e.categorias.includes(modalidade) && (!mod.padroesAlvo || mod.padroesAlvo.includes(e.padrao));
  const pool = EXERCICIOS.filter(
    (e) => naModalidade(e) && NIVEL_ORDEM[e.nivel] <= nivelAluno && naoMobilidadePura(e)
  );
  // Pool AMPLO: mesmo filtro SEM o teto de nível. Rede de segurança quando a turma
  // não tem exercício do nível para um padrão OBRIGATÓRIO (ex.: turma iniciante, mas o
  // único core de hipertrofia é intermediário). Sem isso o dia perderia o padrão e
  // dobraria outro — quebrando o full body. O box roda UM treino p/ todos; o nível
  // escala a CARGA (ver sugerirCarga), não remove o movimento essencial.
  const poolAmplo = EXERCICIOS.filter((e) => naModalidade(e) && naoMobilidadePura(e));

  /** @type {Exercicio[]} */
  const selecionados = [];
  /** @type {Record<string, number>} */
  const seriesPorMusculo = {};

  /** Pontua um candidato: cobre padrão faltante, variedade, viabilidade. @param {Exercicio} ex @param {Set<Padrao>} faltantes */
  const pontuar = (ex, faltantes) => {
    let s = 0;
    if (faltantes.has(ex.padrao)) s += 100;          // prioriza padrão ainda não coberto
    if (idsAnteriores.has(ex.id)) s -= 40;            // evita repetir exercício do dia anterior
    if (!podeAdicionar(selecionados, ex, nAlunos, nExercicios)) s -= 1000; // inviável por aparelho
    // penaliza sobrecarga muscular
    for (const m of ex.musculosPrimarios) {
      if ((seriesPorMusculo[m] || 0) >= TETO_SERIES_POR_MUSCULO) s -= 60;
    }
    // penaliza congestionar um mesmo aparelho (deixa espaço p/ outros padrões)
    for (const equipId of ex.equipamento) {
      const usos = selecionados.filter((sel) => sel.equipamento.includes(equipId)).length;
      s -= usos * 18;
    }
    // viés de balanceamento semanal (déficit/superávit de volume por padrão)
    s += viesPadrao[ex.padrao] || 0;
    s += rng() * 10; // desempate aleatório controlado
    return s;
  };

  const seriesBase = seriesAjustadas(mod.series, semana, nivel);

  const adicionar = (/** @type {Exercicio} */ ex) => {
    selecionados.push(ex);
    for (const m of ex.musculosPrimarios) seriesPorMusculo[m] = (seriesPorMusculo[m] || 0) + seriesBase;
    for (const m of ex.musculosSecundarios) seriesPorMusculo[m] = (seriesPorMusculo[m] || 0) + seriesBase * 0.5;
  };

  /**
   * Melhores candidatos de uma fonte, pontuados e ordenados.
   * @param {Exercicio[]} fonte @param {Padrao|null} filtroPadrao @param {Set<Padrao>} faltantes
   */
  const candidatosDe = (fonte, filtroPadrao, faltantes) => fonte
    .filter((e) => !selecionados.includes(e) && (filtroPadrao ? e.padrao === filtroPadrao : true))
    .map((e) => ({ e, score: pontuar(e, faltantes) }))
    .sort((a, b) => b.score - a.score);
  const temViavel = (/** @type {{score:number}[]} */ c) => c.length && c[0].score > -500;

  // -------- Passo 3+6: preencher padrões obrigatórios (full body equilibrado) --------
  const obrigatorios = mod.padroesAlvo
    ? mod.padroesAlvo
    : padroesObrigatorios(/** @type {4|5|6} */ (Math.min(6, nExercicios)));
  for (const padrao of obrigatorios) {
    const faltantes = new Set(obrigatorios.filter((p) => !selecionados.some((s) => s.padrao === p)));
    let candidatos = candidatosDe(pool, padrao, faltantes);
    // padrão obrigatório sem opção no nível da turma → amplia o nível (não deixa o dia sem o movimento)
    if (!temViavel(candidatos)) {
      const ampliados = candidatosDe(poolAmplo, padrao, faltantes);
      if (temViavel(ampliados)) candidatos = ampliados;
    }
    if (temViavel(candidatos)) adicionar(candidatos[0].e);
  }

  // -------- preencher slots restantes equilibrando volume --------
  while (selecionados.length < nExercicios) {
    // padrão com menor volume atual recebe prioridade
    const volPorPadrao = Object.fromEntries(PADROES.map((p) => [p, 0]));
    for (const ex of selecionados) volPorPadrao[ex.padrao] += 1;
    const faltantes = new Set(
      [...PADROES].sort((a, b) => volPorPadrao[a] - volPorPadrao[b])
    );
    let candidatos = candidatosDe(pool, null, faltantes);
    if (!temViavel(candidatos)) candidatos = candidatosDe(poolAmplo, null, faltantes); // completa o treino se o nível esgotou
    if (!temViavel(candidatos)) break; // nada viável
    adicionar(candidatos[0].e);
  }

  // -------- Passo 7: ajuste de tempo para caber no teto do bloco principal --------
  const budget = BUDGET_PRINCIPAL[modalidade] ?? BUDGET_PRINCIPAL.default;
  let series = selecionados.map(() => seriesBase);
  const tempoPrincipal = () =>
    selecionados.reduce((acc, ex, i) => acc + tempoExercicio(ex, series[i], mod), 0);

  // reduz séries (até mín. 2) enquanto estourar o teto
  while (tempoPrincipal() > budget[1] && Math.max(...series) > 2) {
    const idx = series.indexOf(Math.max(...series));
    series[idx] -= 1;
  }
  // se ainda estourar, remove o último exercício (mantém ≥ 4)
  while (tempoPrincipal() > budget[1] && selecionados.length > 4) {
    selecionados.pop();
    series.pop();
  }

  // -------- Passo 8: montar blocos --------
  const principal = selecionados.map((ex, i) => ({
    exercicio: ex,
    series: series[i],
    reps: mod.reps,
    descansoSeg: mod.descansoSeg,
    tempoSeg: tempoExercicio(ex, series[i], mod),
  }));

  const aquecimento = montarAquecimento(rng, modalidade);
  const finalizador = mod.finalizador ? montarFinalizador(pool, selecionados, rng) : null;

  const volume = calcularVolume(principal.map((p) => ({ exercicio: p.exercicio, series: p.series })));
  const viabilidade = verificarViabilidade(selecionados, nAlunos, selecionados.length);

  const tempoPrincipalSeg = tempoPrincipal();
  const tempoAquecimentoSeg = aquecimento.reduce((a, x) => a + x.duracaoSeg, 0);
  const tempoFinalizadorSeg = finalizador ? finalizador.tempoSeg : 0;

  return {
    modalidade, dia, semana, nivel, nAlunos,
    tamanhoGrupo: viabilidade.tamanhoGrupo,
    deload: ehDeload(semana),
    aquecimento,
    principal,
    finalizador,
    volume,
    viabilidade,
    tempoAquecimentoSeg,
    tempoPrincipalSeg,
    tempoFinalizadorSeg,
    tempoTotalSeg: tempoAquecimentoSeg + tempoPrincipalSeg + tempoFinalizadorSeg + 300, // +5min tolerância
  };
}

/**
 * Monta o treino Hyrox (template fixo). Mantém a forma de `Treino` esperada pelo
 * render/snapshot/mesociclo, mas o conteúdo vive em `hyrox`; `principal` fica vazio
 * e o `volume` é nominal (condicionamento). O tempo é a estimativa do intermediário.
 * @param {{dia:string, semana:number, nivel:string, nAlunos:number}} o
 */
function montarHyrox({ dia, semana, nivel, nAlunos }) {
  const hyrox = gerarHyrox({ nAlunos });
  const tempoTotalSeg = estimarDuracaoSeg('intermediario');
  return {
    modalidade: 'hyrox', dia, semana, nivel, nAlunos,
    tamanhoGrupo: nAlunos,
    deload: ehDeload(semana),
    hyrox,
    aquecimento: [],
    principal: [],
    finalizador: null,
    volume: volumeHyrox(),
    viabilidade: { ok: true, conflitos: [], demanda: {}, formato: 'for-time', nota: hyrox.viabilidade.nota },
    tempoAquecimentoSeg: 0,
    tempoPrincipalSeg: tempoTotalSeg,
    tempoFinalizadorSeg: 0,
    tempoTotalSeg,
  };
}

/**
 * Monta o treino HIIT (4 estações TABATA). Como o Hyrox: conteúdo em `hiit`,
 * `principal` vazio, `volume` nominal, tempo = estimativa.
 * @param {{dia:string, semana:number, nivel:string, nAlunos:number, seed:number}} o
 */
function montarHiit({ dia, semana, nivel, nAlunos, seed }) {
  const hiit = gerarHiitTabata({ nAlunos, seed });
  const tempoTotalSeg = estimarDuracaoHiitSeg();
  return {
    modalidade: 'hiit', dia, semana, nivel, nAlunos,
    tamanhoGrupo: nAlunos,
    deload: ehDeload(semana),
    hiit,
    aquecimento: [],
    principal: [],
    finalizador: null,
    volume: volumeHiit(hiit.estacoes),
    viabilidade: { ok: true, conflitos: [], demanda: {}, formato: 'tabata', nota: hiit.viabilidade.nota },
    tempoAquecimentoSeg: 0,
    tempoPrincipalSeg: tempoTotalSeg,
    tempoFinalizadorSeg: 0,
    tempoTotalSeg,
  };
}

/**
 * Monta a aula GAP estruturada (TABATA, Siga o Mestre). Como Hyrox/HIIT: conteúdo em
 * `gap`, `principal` vazio, `volume` nominal, tempo = estimativa.
 * @param {{dia:string, semana:number, nivel:string, nAlunos:number, seed:number}} o
 */
function montarGap({ dia, semana, nivel, nAlunos, seed }) {
  const gap = gerarGap({ nAlunos, seed });
  const tempoTotalSeg = estimarDuracaoGapSeg();
  return {
    modalidade: 'gap', dia, semana, nivel, nAlunos,
    tamanhoGrupo: nAlunos,
    deload: ehDeload(semana),
    gap,
    aquecimento: [],
    principal: [],
    finalizador: null,
    volume: volumeGap(),
    viabilidade: { ok: true, conflitos: [], demanda: {}, formato: 'tabata', nota: gap.viabilidade.nota },
    tempoAquecimentoSeg: 0,
    tempoPrincipalSeg: tempoTotalSeg,
    tempoFinalizadorSeg: 0,
    tempoTotalSeg,
  };
}

/**
 * Monta o treino Híbrido (Mobilidade + Hipertrofia em split + WOD). Como os demais
 * templates: conteúdo em `hibrido`, `principal` vazio — mas aqui o volume é REAL
 * (a hipertrofia usa o catálogo/equipamento de verdade, não é nominal).
 * @param {{dia:string, semana:number, nivel:string, nAlunos:number, seed:number, idsEvitar:string[]}} o
 */
function montarHibrido({ dia, semana, nivel, nAlunos, seed, idsEvitar }) {
  const hibrido = gerarHibrido({ dia, semana, nivel, nAlunos, seed, idsEvitar });
  return {
    modalidade: 'hibrido', dia, semana, nivel, nAlunos,
    tamanhoGrupo: hibrido.viabilidade.ok ? nAlunos : hibrido.hipertrofia.length,
    deload: ehDeload(semana),
    hibrido,
    aquecimento: [],
    principal: [],
    finalizador: null,
    volume: volumeHibrido(hibrido.hipertrofia, hibrido.wod),
    viabilidade: { ok: hibrido.viabilidade.ok, conflitos: [], demanda: {}, formato: 'blocos', nota: hibrido.viabilidade.nota },
    tempoAquecimentoSeg: 0,
    tempoPrincipalSeg: hibrido.duracaoSeg,
    tempoFinalizadorSeg: 0,
    tempoTotalSeg: hibrido.duracaoSeg,
  };
}

/**
 * Alternativas viáveis para trocar UM exercício do bloco principal, mantendo
 * o mesmo padrão de movimento, o nível do aluno, a modalidade e a viabilidade
 * de aparelhos para os 8 alunos. Usado pelo botão "trocar exercício" da UI.
 *
 * @param {import('./tipos.js').Treino} treino
 * @param {number} indice  Posição no `treino.principal`
 * @returns {Exercicio[]}
 */
export function alternativasViaveis(treino, indice) {
  const alvo = treino.principal[indice];
  if (!alvo) return [];
  const nivelAluno = NIVEL_ORDEM[/** @type {keyof typeof NIVEL_ORDEM} */ (treino.nivel)];
  const usados = new Set(treino.principal.map((p) => p.exercicio.id));
  const outros = treino.principal.filter((_, i) => i !== indice).map((p) => p.exercicio);

  return EXERCICIOS.filter((e) => {
    if (e.id === alvo.exercicio.id || usados.has(e.id)) return false;
    if (e.padrao !== alvo.exercicio.padrao) return false;
    if (!e.categorias.includes(treino.modalidade)) return false;
    if (NIVEL_ORDEM[e.nivel] > nivelAluno) return false;
    return verificarViabilidade([...outros, e], treino.nAlunos, treino.principal.length).ok;
  });
}

/**
 * Aplica a troca de um exercício e recalcula tempo, volume e viabilidade.
 * Não muta o treino original (retorna uma cópia atualizada).
 * @param {import('./tipos.js').Treino} treino
 * @param {number} indice
 * @param {Exercicio} novoExercicio
 * @returns {import('./tipos.js').Treino}
 */
export function aplicarTroca(treino, indice, novoExercicio) {
  const mod = MODALIDADES[treino.modalidade];
  const principal = treino.principal.map((item, i) => {
    if (i !== indice) return item;
    return {
      exercicio: novoExercicio,
      series: item.series,
      reps: item.reps,
      descansoSeg: item.descansoSeg,
      tempoSeg: tempoExercicio(novoExercicio, item.series, mod),
    };
  });
  const volume = calcularVolume(principal.map((p) => ({ exercicio: p.exercicio, series: p.series })));
  const viabilidade = verificarViabilidade(principal.map((p) => p.exercicio), treino.nAlunos, principal.length);
  const tempoPrincipalSeg = principal.reduce((a, p) => a + p.tempoSeg, 0);
  return {
    ...treino, principal, volume, viabilidade, tempoPrincipalSeg,
    tempoTotalSeg: treino.tempoAquecimentoSeg + tempoPrincipalSeg + treino.tempoFinalizadorSeg + 300,
  };
}

/**
 * Alternativas viáveis para trocar um exercício a partir dos IDs de um dia salvo
 * (snapshot). Mantém o mesmo padrão de movimento, o nível, a modalidade e a
 * viabilidade de aparelhos. Usado pelo "trocar" da semana já salva.
 * @param {string[]} ids        IDs dos exercícios do dia (na ordem)
 * @param {number} indice
 * @param {string} modalidade
 * @param {string} nivel
 * @param {number} [nAlunos]
 * @returns {Exercicio[]}
 */
export function alternativasPorIds(ids, indice, modalidade, nivel, nAlunos = ALUNOS_POR_SESSAO) {
  const alvo = EXERCICIO_POR_ID[ids[indice]];
  if (!alvo) return [];
  const nivelAluno = NIVEL_ORDEM[/** @type {keyof typeof NIVEL_ORDEM} */ (nivel)];
  const usados = new Set(ids);
  const outros = ids.filter((_, i) => i !== indice).map((id) => EXERCICIO_POR_ID[id]).filter(Boolean);
  return EXERCICIOS.filter((e) => {
    if (usados.has(e.id) || e.id === alvo.id) return false;
    if (e.padrao !== alvo.padrao) return false;
    if (!e.categorias.includes(/** @type {any} */ (modalidade))) return false;
    if (NIVEL_ORDEM[e.nivel] > nivelAluno) return false;
    return verificarViabilidade([...outros, e], nAlunos, ids.length).ok;
  });
}

/**
 * Aquecimento de 5–10 min com mobilidade (preparação articular para os padrões do dia).
 * Força pede o bloco cheio (3 exercícios × 150s ≈ 7,5 min); as demais modalidades
 * seguem o padrão mais curto já validado (2 × 120s ≈ 4 min).
 * @param {() => number} rng @param {import('../config/modalidades.js').ModalidadeId} [modalidade]
 */
function montarAquecimento(rng, modalidade) {
  const mob = EXERCICIOS.filter((e) => e.categorias.includes('mobilidade'));
  const [n, duracaoSeg] = modalidade === 'forca' ? [3, 150] : [2, 120];
  const escolhidos = embaralhar(mob, rng).slice(0, n);
  return escolhidos.map((ex) => ({ exercicio: ex, duracaoSeg }));
}

/**
 * Finalizador genérico (WOD curto) — reservado p/ alguma modalidade full-body futura
 * que queira um fechamento leve. Hyrox/Híbrido têm blocos de WOD PRÓPRIOS e mais ricos
 * (ver hyrox.js/hibrido.js) e nem passam por aqui (curto-circuito no início do gerador).
 * @param {Exercicio[]} pool @param {Exercicio[]} jaUsados @param {() => number} rng
 */
function montarFinalizador(pool, jaUsados, rng) {
  const wod = pool.filter((e) => e.categorias.includes('wod') && !jaUsados.includes(e));
  const itens = embaralhar(wod, rng).slice(0, 3);
  if (!itens.length) return null;
  return {
    tipo: 'AMRAP 6 min',
    descricao: `Maior número de rodadas em 6 min: ${itens.map((e) => `10x ${e.nome}`).join(' + ')}`,
    itens,
    tempoSeg: 360,
  };
}

/** Fisher–Yates com rng. @template T @param {T[]} arr @param {() => number} rng @returns {T[]} */
function embaralhar(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Hash simples string→int para seed estável. @param {string} str */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
