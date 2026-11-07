// @ts-check
/**
 * PUBLICAR O QUADRO — do texto conferido (`conferirSemana`) ao pedido de
 * `publicarQuadroBox`. Lógica pura: sem rede e sem DOM.
 *
 * Decisão do coach, 07/11/2026: o que ele escreveu vale. Cada aula vira o que o
 * Portal, o app e a Lousa já sabem mostrar:
 *  - o H (seções de força da coluna H) → os exercícios, com as séries e repetições escritas;
 *  - o WOD (a seção de WOD do Cross) → formato, minutos e os movimentos com a quantidade escrita;
 *  - o Hyrox → as 8 estações (a tabela por modelo e nível vem do servidor);
 *  - o HIIT → as estações escritas ("Estação 1 - Pernas"), com as vagas;
 *  - o resto (Mobilidade, Aquecimento, a Força do Cross, a aula do mês) → blocos de texto, como escritos.
 * Os dias seguem os quadros: segunda e terça H1 (terça com Cross), quarta e
 * quinta H2 (quinta com Hyrox), sexta e sábado H3 (sábado com HIIT).
 *
 * O que IMPEDE publicar (`impedimentos`): nome que não é do catálogo numa
 * aula que o aluno registra, WOD sem formato/minutos/quantidade, Hyrox sem as
 * 8 estações, estação do HIIT acima de 4 vagas, dia sem aula sem o motivo.
 * Aviso de equipamento não impede: a conferência já mostra, e o coach adapta.
 */
import { DIAS, NOME_DIA, NOME_ESTACAO_HIIT, NOME_TIPO_SECAO, QUADROS, SERIES_POR_EXERCICIO, SLOTS_POR_ESTACAO, vagasDaEstacao } from './quadro.js';

/** A prescrição do H quando o quadro não escreve (7 × 3, decisão do coach de 23/10/2026). */
export const PRESCRICAO_H = { series: SERIES_POR_EXERCICIO, repeticoes: '8-12', rir: '0-3' };
export const TIPOS_SEM_AULA = /** @type {const} */ (['feriado', 'recesso', 'evento']);
/** @type {Record<string, string>} */
export const NOME_SEM_AULA = { feriado: 'Feriado', recesso: 'Recesso', evento: 'Evento' };
export const ESTACOES_HYROX_PROVA = 8;

/**
 * @typedef {import('./quadro.js').ColunaLida} ColunaLida
 * @typedef {import('./quadro.js').Secao} Secao
 * @typedef {import('./quadro.js').ItemLido} ItemLido
 * @typedef {{onde: string, linha?: number, dia?: string, texto: string}} Impedimento
 * @typedef {{aula: string, titulo: string, linhas: string[]}} BlocoTexto
 * @typedef {{tipo: string, texto: string}} SemAula
 */

/** Unidade escrita → unidade do servidor (`UNIDADES_CROSS`) e o número convertido. @param {{n: number, unidade: string}} q */
export function quantidadeDoWod(q) {
  switch (q.unidade) {
    case 'reps': return { quantidade: q.n, unidade: 'reps' };
    case 'm': return { quantidade: q.n, unidade: 'metros' };
    case 'km': return { quantidade: Math.round(q.n * 1000), unidade: 'metros' };
    case 'cal': return { quantidade: q.n, unidade: 'calorias' };
    case 'min': return { quantidade: Math.round(q.n * 60), unidade: 'segundos' };
    default: return { quantidade: q.n, unidade: 'segundos' };
  }
}

/** As linhas escritas de uma seção (sem o cabeçalho e sem linha vazia). @param {ColunaLida} c @param {Secao} s */
function linhasDaSecao(c, s) {
  const k = c.secoes.indexOf(s);
  return c.linhas.filter((l) => l.secao === k && l.tipo !== 'secao' && l.tipo !== 'vazia').map((l) => l.texto.trim()).filter(Boolean);
}

/** A seção como bloco de texto, do jeito que foi escrita. @param {ColunaLida} c @param {Secao} s @returns {BlocoTexto|null} */
function blocoDe(c, s) {
  const linhas = linhasDaSecao(c, s);
  const titulo = (s.titulo || NOME_TIPO_SECAO[s.tipo] || '').trim();
  if (!titulo && !linhas.length) return null;
  return { aula: c.aula, titulo, linhas };
}

const itensDa = (/** @type {ColunaLida} */ c, /** @type {Secao} */ s) => c.itens.filter((i) => i.secao === s);

/**
 * O exercício da linha, ou o impedimento (nome fora do catálogo / por confirmar).
 * @param {ColunaLida} c @param {ItemLido} i @param {Impedimento[]} imp
 */
function idDe(c, i, imp) {
  if (i.item) return i.item.id;
  imp.push({
    onde: c.onde, linha: i.linha,
    texto: i.leitura.como === 'fora'
      ? `${c.aula}: "${i.escrito}" está como "fora do catálogo". Cadastre no catálogo para o aluno ver e registrar.`
      : `${c.aula}: confirme qual exercício do catálogo é "${i.escrito}".`,
  });
  return null;
}

/** O H: as seções de força da coluna. @param {ColunaLida} c @param {Impedimento[]} imp */
function forcaDe(c, imp) {
  /** @type {{exercicioId: string, series: number, repeticoes: string, descansoSeg?: number, rir: string}[]} */
  const exercicios = [];
  /** @type {BlocoTexto[]} */
  const blocos = [];
  for (const s of c.secoes) {
    if (s.tipo !== 'forca') {
      const b = blocoDe(c, s);
      if (b) blocos.push(b);
      continue;
    }
    const escritos = s.itens;
    itensDa(c, s).forEach((i, k) => {
      const id = idDe(c, i, imp);
      if (!id) return;
      if (exercicios.some((e) => e.exercicioId === id)) {
        imp.push({ onde: c.onde, linha: i.linha, texto: `${c.aula}: ${i.item?.nome} aparece duas vezes.` });
        return;
      }
      const e = escritos[k];
      exercicios.push({
        exercicioId: id,
        series: e?.series ?? s.series ?? PRESCRICAO_H.series,
        repeticoes: e?.reps ?? s.reps ?? PRESCRICAO_H.repeticoes,
        ...(s.descansoSeg !== null && s.descansoSeg !== undefined ? { descansoSeg: s.descansoSeg } : {}),
        rir: PRESCRICAO_H.rir,
      });
    });
  }
  return { exercicios, blocos };
}

/** O Cross: o WOD (a primeira seção de WOD) e o resto como texto. @param {ColunaLida} c @param {Impedimento[]} imp */
function crossDe(c, imp) {
  const wod = c.secoes.find((s) => s.tipo === 'wod' && s.itens.length);
  /** @type {BlocoTexto[]} */
  const blocos = [];
  for (const s of c.secoes) {
    if (s === wod) continue;
    const b = blocoDe(c, s);
    if (b) blocos.push(b);
  }
  if (!wod) {
    imp.push({ onde: c.onde, texto: 'Cross: escreva o WOD (ex.: "D) WOD AMRAP 18 min" e os movimentos embaixo).' });
    return { cross: null, blocos };
  }
  if (!wod.formato) imp.push({ onde: c.onde, linha: wod.linha, texto: 'Cross: escreva o formato do WOD no título (AMRAP, EMOM, For Time ou Chipper).' });
  if (!wod.minutos && wod.formato !== 'EMOM') imp.push({ onde: c.onde, linha: wod.linha, texto: 'Cross: escreva os minutos do WOD (ex.: "AMRAP 18 min", "time cap 20").' });
  /** @type {{exercicioId: string, quantidade: number, unidade: string, alternativas: string[]}[]} */
  const movimentos = [];
  for (const i of itensDa(c, wod)) {
    const id = idDe(c, i, imp);
    if (!id) continue;
    if (movimentos.some((m) => m.exercicioId === id)) {
      imp.push({ onde: c.onde, linha: i.linha, texto: `Cross: ${i.item?.nome} aparece duas vezes no WOD.` });
      continue;
    }
    if (!i.qtd) {
      imp.push({ onde: c.onde, linha: i.linha, texto: `Cross: escreva a quantidade de ${i.item?.nome ?? i.escrito} no WOD (ex.: "12x", "200m", "10 cal").` });
      continue;
    }
    movimentos.push({ exercicioId: id, ...quantidadeDoWod(i.qtd), alternativas: i.alternativas.slice(0, 3) });
  }
  return {
    cross: { formato: wod.formato, minutos: wod.minutos, rodadas: wod.rodadas, movimentos },
    blocos,
  };
}

/** O Hyrox: as estações escritas, na ordem; o resto como texto. @param {ColunaLida} c @param {Impedimento[]} imp */
function hyroxDe(c, imp) {
  /** @type {{estacao: string, substituta: boolean}[]} */
  const estacoes = [];
  /** @type {BlocoTexto[]} */
  const blocos = [];
  for (const s of c.secoes) {
    const doHyrox = itensDa(c, s).filter((i) => i.item?.id.startsWith('hyrox:'));
    if (s.tipo !== 'hyrox' || !doHyrox.length) {
      const b = blocoDe(c, s);
      if (b) blocos.push(b);
      continue;
    }
    for (const i of itensDa(c, s)) {
      if (!i.item?.id.startsWith('hyrox:')) {
        if (!i.item) idDe(c, i, imp);
        continue;
      }
      const [, estacao, sub] = i.item.id.split(':');
      if (estacoes.some((e) => e.estacao === estacao)) {
        imp.push({ onde: c.onde, linha: i.linha, texto: `Hyrox: ${i.item.nome} aparece duas vezes.` });
        continue;
      }
      estacoes.push({ estacao, substituta: sub === 'sub' });
    }
  }
  if (estacoes.length !== ESTACOES_HYROX_PROVA) {
    imp.push({ onde: c.onde, texto: `Hyrox: a quinta é a prova completa — escreva as ${ESTACOES_HYROX_PROVA} estações, na ordem (veio ${estacoes.length}).` });
  }
  return { hyrox: { estacoes }, blocos };
}

/** O HIIT: as estações escritas, com as vagas; o resto como texto. @param {ColunaLida} c @param {Impedimento[]} imp */
function hiitDe(c, imp) {
  /** @type {{estacao: string, slots: {exercicioId: string}[]}[]} */
  const estacoes = [];
  /** @type {BlocoTexto[]} */
  const blocos = [];
  for (const s of c.secoes) {
    if (s.tipo !== 'hiit' || !s.estacao) {
      if (s.tipo === 'tabata' && s.itens.length) {
        imp.push({ onde: c.onde, linha: s.linha, texto: 'HIIT: escreva o nome da estação antes dos exercícios (ex.: "A) Estação 1 - Pernas").' });
        continue;
      }
      const b = blocoDe(c, s);
      if (b) blocos.push(b);
      continue;
    }
    const nome = NOME_ESTACAO_HIIT[s.estacao] ?? s.estacao;
    if (estacoes.some((e) => e.estacao === s.estacao)) {
      imp.push({ onde: c.onde, linha: s.linha, texto: `HIIT: a estação ${nome} aparece duas vezes.` });
      continue;
    }
    const vagas = vagasDaEstacao(c, s).length;
    if (vagas > SLOTS_POR_ESTACAO) {
      imp.push({ onde: c.onde, linha: s.linha, texto: `HIIT · ${nome}: ${vagas} vagas, e a estação tem ${SLOTS_POR_ESTACAO} (o unilateral ocupa 2).` });
    }
    /** @type {{exercicioId: string}[]} */
    const slots = [];
    for (const i of itensDa(c, s)) {
      const id = idDe(c, i, imp);
      if (id) slots.push({ exercicioId: id });
    }
    if (slots.length) estacoes.push({ estacao: s.estacao, slots });
    else imp.push({ onde: c.onde, linha: s.linha, texto: `HIIT · ${nome}: a estação está vazia.` });
  }
  if (!estacoes.length && !imp.some((x) => x.onde === c.onde)) {
    imp.push({ onde: c.onde, texto: 'HIIT: escreva as estações (Pernas, Core, Superiores, Cardio), cada uma com os exercícios embaixo.' });
  }
  return { hiit: { estacoes }, blocos };
}

/**
 * O pedido de `publicarQuadroBox` para a semana conferida.
 * @param {ReturnType<typeof import('./quadro.js').conferirSemana>} conf
 * @param {Record<string, SemAula>} [semAula] os dias marcados sem aula, com o motivo
 * @returns {{dias: Record<string, any>, impedimentos: Impedimento[], resumo: Record<string, string[]>}}
 */
export function pedidoDoQuadro(conf, semAula = {}) {
  /** @type {Impedimento[]} */
  const imp = [];
  /** @type {Record<string, {treinos: string[], forca?: any, cross?: any, hyrox?: any, hiit?: any, blocosTexto: BlocoTexto[], aviso?: SemAula}>} */
  const dias = Object.fromEntries(DIAS.map((d) => [d, { treinos: [], blocosTexto: [] }]));
  // Só confere o que vai ao aluno: dia marcado sem aula não cobra nada.
  const comAula = (/** @type {readonly string[]} */ ds) => ds.filter((d) => !semAula[d]);

  for (const q of QUADROS) {
    const h = conf.colunas[`${q.id}.h`];
    const m = conf.colunas[`${q.id}.m`];
    const diasH = comAula(q.dias);
    const diaM = comAula([q.diaMetabolico]);

    if (h && !h.vazia && diasH.length) {
      const f = forcaDe(h, imp);
      if (!f.exercicios.length) imp.push({ onde: h.onde, texto: `${q.h}: nenhum exercício do catálogo na parte de força.` });
      for (const d of diasH) {
        dias[d].forca = { exercicios: f.exercicios };
        dias[d].blocosTexto.push(...f.blocos);
      }
    }
    if (m && !m.vazia && diaM.length) {
      const d = diaM[0];
      if (q.metabolico === 'Cross') {
        const r = crossDe(m, imp);
        dias[d].cross = r.cross;
        dias[d].blocosTexto.push(...r.blocos);
      } else if (q.metabolico === 'Hyrox') {
        const r = hyroxDe(m, imp);
        dias[d].hyrox = r.hyrox;
        dias[d].blocosTexto.push(...r.blocos);
      } else {
        const r = hiitDe(m, imp);
        dias[d].hiit = r.hiit;
        dias[d].blocosTexto.push(...r.blocos);
      }
    }
    // A aula metabólica é a principal do dia; o H, a alternativa (como na grade do box).
    for (const d of q.dias) {
      const x = dias[d];
      const metab = d === q.diaMetabolico && (x.cross || x.hyrox || x.hiit) ? [q.metabolico] : [];
      x.treinos = [...metab, ...(x.forca ? [q.h] : [])];
    }
  }

  const extra = conf.colunas.extra;
  if (extra && !extra.vazia) {
    const d = extra.dias[0];
    if (d && !semAula[d]) {
      const linhas = extra.linhas.filter((l) => l.tipo !== 'vazia').map((l) => l.texto.trim()).filter(Boolean);
      dias[d].blocosTexto.push({ aula: extra.aula, titulo: extra.aula, linhas });
    }
  }

  for (const d of DIAS) {
    const x = dias[d];
    const s = semAula[d];
    if (s) {
      dias[d] = { treinos: [], blocosTexto: [], aviso: { tipo: s.tipo, texto: String(s.texto ?? '').slice(0, 500) } };
      continue;
    }
    if (!x.treinos.length) {
      // Bloco de texto (a aula do mês) sozinho não é aula que o aluno registra.
      imp.push({ onde: '', dia: d, texto: `${NOME_DIA[d]}: sem treino escrito. Escreva o treino ou marque o dia sem aula (feriado, recesso ou evento).` });
      x.blocosTexto = [];
    }
    for (const k of ['forca', 'cross', 'hyrox', 'hiit']) if (/** @type {any} */ (x)[k] === undefined) delete /** @type {any} */ (x)[k];
  }
  if (DIAS.every((d) => semAula[d])) imp.push({ onde: '', texto: 'A semana inteira está sem aula. Para isso, não precisa publicar o quadro.' });

  /** @type {Record<string, string[]>} */
  const resumo = Object.fromEntries(DIAS.map((d) => [d, semAula[d] ? [NOME_SEM_AULA[semAula[d].tipo] ?? 'Sem aula'] : dias[d].treinos]));
  return { dias, impedimentos: imp, resumo };
}
