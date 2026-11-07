// @ts-check
/**
 * QUADRO DA SEMANA — o coach escreve, o sistema confere (decisão do coach, 04/11/2026).
 *
 * O gerador sai do caminho: o coach monta a semana no quadro, como sempre fez, e
 * este módulo só LÊ o que ele escreveu e confere contra as regras da Semana do
 * Box. Nada aqui escolhe ou troca exercício.
 *
 * São 3 quadros, um por par de dias. O H vale nos dois dias; o metabólico, só no
 * segundo, na MESMA hora e na mesma sala que o H (a turma se divide: 3 + 3,
 * 2 + 4, 1 + 5…, até 6 por horário). Por isso o equipamento é conferido somando
 * o H com o metabólico, em cada divisão da turma.
 *
 * As regras são as que a Semana do Box já usa (cópia de functions/src/modelo-box.ts,
 * conferida no teste — `quadro.test.js`):
 *  - cada H cobre os 7 padrões, 7 exercícios × 3 séries = 21 séries;
 *  - o mesmo exercício não se repete na semana;
 *  - WOD: 3–4 movimentos (Chipper 5), ao menos um cardio, padrão sem repetir,
 *    AMRAP até 20 min, EMOM até 16, For Time e Chipper com cap de 20;
 *  - Hyrox da quinta com as 8 estações;
 *  - volume em séries equivalentes: força 1 por série (1,0 no músculo principal,
 *    0,5 no secundário), rodada de WOD 0,5 (cardio 0,25), estação do Hyrox 1.
 * O HIIT, o GAP e o Murph não têm conta de volume na Semana do Box: usam a do
 * primeiro montador (20 s de Tabata = 0,5 série; 20 repetições = 1 série).
 * O HIIT é o da Semana do Box: 4 estações (Pernas, Core, Superiores, Cardio),
 * 4 vagas cada, o unilateral ocupando 2. O aquecimento conta ¼ por rodada e
 * entra na conferência de repetição (05/11/2026).
 *
 * Módulo puro (o teste roda no Node): recebe o catálogo de `listarCatalogoBox`,
 * o inventário gravado e os apelidos confirmados pelo coach.
 */

/* ───────────────────────────── a semana ───────────────────────────── */

/** Os 3 quadros: o H dos dois dias e o metabólico do segundo dia. */
export const QUADROS = /** @type {const} */ ([
  { id: 'q1', nome: 'Quadro 1', dias: ['segunda', 'terca'], h: 'H1', metabolico: 'Cross', diaMetabolico: 'terca' },
  { id: 'q2', nome: 'Quadro 2', dias: ['quarta', 'quinta'], h: 'H2', metabolico: 'Hyrox', diaMetabolico: 'quinta' },
  { id: 'q3', nome: 'Quadro 3', dias: ['sexta', 'sabado'], h: 'H3', metabolico: 'HIIT', diaMetabolico: 'sabado' },
]);

/** @type {Record<string, string>} */
export const NOME_DIA = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
export const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

/** A aula do mês que entra numa semana (escolhida pelo coach), fora dos 3 quadros. */
export const EXTRAS = ['GAP', 'Murph'];

/** Máximo de alunos por horário, somando os dois lados da sala. */
export const ALUNOS_POR_HORA = 6;

/* ─────────── cópias de functions/src/modelo-box.ts (paridade no teste) ─────────── */

/** Os 7 padrões do H, na ordem em que a tela mostra (core no fim). */
export const PADROES_H = [
  'agachar', 'estender_quadril', 'empurrar_horizontal', 'puxar_horizontal',
  'empurrar_vertical', 'puxar_vertical', 'estabilizar_tronco',
];
/** @type {Record<string, string>} */
export const NOME_PADRAO_H = {
  agachar: 'Agachar', estender_quadril: 'Estender quadril', empurrar_horizontal: 'Empurrar horizontal',
  puxar_horizontal: 'Puxar horizontal', empurrar_vertical: 'Empurrar vertical', puxar_vertical: 'Puxar vertical',
  estabilizar_tronco: 'Core',
};
export const EXERCICIOS_POR_BLOCO = 7;
export const SERIES_POR_EXERCICIO = 3;
export const SERIES_POR_SESSAO = EXERCICIOS_POR_BLOCO * SERIES_POR_EXERCICIO;
export const DESCANSO_PADRAO_SEG = 90;

export const PESO_PRINCIPAL = 1.0;
export const PESO_SECUNDARIO = 0.5;
export const FATOR_VOLUME = { forca: 1, wod: 0.5, cardio: 0.25, estacaoHyrox: 1 };
/** Séries equivalentes do bloco de força do metabólico quando o coach não escreve as séries. */
export const SERIES_FORCA_METABOLICO = 5;
export const MINUTOS_POR_RODADA_AMRAP = 3;
/** O Chipper vale 2 blocos por movimento (volume-cross-hyrox.ts). */
export const BLOCOS_CHIPPER = 2;
export const ALUNOS_POR_EQUIPAMENTO_TECNICA = 2;
/** O SkiErg do Hyrox: os 2 monocross lado a lado. */
export const CAPACIDADE_SKIERG = 2;

/** @type {Record<string, {movimentos: [number, number], escalonado: boolean}>} */
export const REGRA_FORMATO = {
  AMRAP: { movimentos: [3, 4], escalonado: true },
  EMOM: { movimentos: [3, 4], escalonado: false },
  'For Time': { movimentos: [3, 4], escalonado: true },
  Chipper: { movimentos: [5, 5], escalonado: true },
};
/** Duração (AMRAP, EMOM) ou time cap (For Time, Chipper), em minutos. */
/** @type {Record<string, number>} */
export const TETO_MINUTOS = { AMRAP: 20, EMOM: 16, 'For Time': 20, Chipper: 20 };

/** Do primeiro montador (compartilhado/regras/equivalencia.js): 40 s de trabalho = 1 série; 20 reps = 1 série. */
export const SEGUNDOS_POR_SERIE = 40;
export const REPS_POR_SERIE = 20;
export const SEGUNDOS_ROUND_TABATA = 20;
export const ROUNDS_POR_MUSICA = 8;
/** "4x cada exercício" do HIIT da Semana do Box. */
export const ROUNDS_HIIT_POR_EXERCICIO = 4;

/** As 4 estações do HIIT (ESTACOES_HIIT), rodando ao mesmo tempo, na mesma música. */
export const ESTACOES_HIIT = ['pernas', 'core', 'superiores', 'cardio'];
/** @type {Record<string, string>} */
export const NOME_ESTACAO_HIIT = { pernas: 'Pernas', core: 'Core', superiores: 'Superiores', cardio: 'Cardio' };
/** Vagas por estação (SLOTS_POR_ESTACAO). O unilateral ocupa 2: direito, depois esquerdo. */
export const SLOTS_POR_ESTACAO = 4;
/** PROTOCOLO_HIIT: "2 Músicas de Tabata (16 rounds no total). 4x cada exercício." */
export const MUSICAS_POR_ESTACAO = 2;
export const MINUTOS_POR_MUSICA = 4;
/** O TRX fica ancorado num canto: serve a UMA estação do HIIT (RECURSOS_FIXOS_HIIT). */
export const RECURSOS_FIXOS_HIIT = ['trx'];

/**
 * Estações do Hyrox que dividem o MESMO aparelho: o aluno empurra o trenó e
 * puxa de volta o mesmo trenó (decisão do coach, 07/11/2026). Contam 1 unidade
 * do recurso para o grupo, não 1 por estação.
 * @type {Record<string, string[]>}
 */
export const MESMO_APARELHO_HYROX = { sled: ['sled_push', 'sled_pull'] };

/** O aquecimento conta pouco no volume: ¼ de série por rodada, como o cardio do WOD (decisão do coach, 05/11/2026). */
export const FATOR_AQUECIMENTO = 0.25;

/** Os níveis e os modelos da quinta (NIVEIS_HYROX, MODELOS_HYROX); a tabela vem do `listarCatalogoBox`. */
export const NIVEIS_HYROX = ['iniciante', 'intermediario', 'avancado', 'competicao'];
/** @type {Record<string, string>} */
export const NOME_NIVEL_HYROX = { iniciante: 'Start', intermediario: 'Fit', avancado: 'Garage Open', competicao: 'Pro' };
export const MODELOS_HYROX = ['cardio', 'strength', 'dupla'];
/** @type {Record<string, string>} */
export const NOME_MODELO_HYROX = { cardio: 'Cardio', strength: 'Strength', dupla: 'Dupla' };
export const METROS_POR_CAL_AIRBIKE = 20;

/** Unidades de fábrica (PADRAO_BOX em semana-box.ts), quando o inventário não foi gravado. */
export const INVENTARIO_PADRAO = {
  smith: 2, banco: 2, monocross: 2, maquinaLegs: 1, cavalinho: 2,
  kettlebell: 10, wallBall: 4, caixote: 4, cordaNaval: 2, cordaPular: 2, sandbag: 1, airbike: 2, trx: 2, halteres: 4,
  barraOlimpica: 4, sled: 1, remo: 1,
};

/** Que recurso do inventário cada equipamento do catálogo ocupa (RECURSO_DO_EQUIPAMENTO + RECURSO_CROSS_DO_EQUIPAMENTO). */
/** @type {Record<string, string>} */
export const RECURSO_DO_EQUIPAMENTO = {
  smith: 'smith', banco: 'banco', monocross: 'monocross', flexora: 'maquinaLegs', extensora: 'maquinaLegs', cavalinho: 'cavalinho',
  kettlebell: 'kettlebell', wall_ball: 'wallBall', caixote: 'caixote', corda_naval: 'cordaNaval', corda_pular: 'cordaPular',
  sandbag: 'sandbag', air_bike: 'airbike', trx: 'trx', halteres: 'halteres', barra: 'barraOlimpica',
};

/** @type {Record<string, string>} */
export const NOME_RECURSO = {
  smith: 'Smith', banco: 'banco', monocross: 'monocross', maquinaLegs: 'máquina de pernas (flexora/extensora)', cavalinho: 'cavalinho',
  kettlebell: 'kettlebell', wallBall: 'wall ball', caixote: 'caixote', cordaNaval: 'corda naval', cordaPular: 'corda de pular',
  sandbag: 'sandbag', airbike: 'air bike', trx: 'TRX', halteres: 'par de halteres', barraOlimpica: 'barra', sled: 'trenó', remo: 'remo',
};

/** Músculos da corrida do Hyrox (MUSCULOS_CORRIDA_HYROX). */
export const MUSCULOS_CORRIDA = { musculoPrincipal: ['quadriceps', 'posterior_coxa'], musculosSecundarios: ['panturrilha', 'gluteo'] };

/* ───────────────────────────── regras de cada dia ───────────────────────────── */

/** Terça: o H1 fica com os Smith e os monocross. */
export const FORA_DO_CROSS = ['smith', 'monocross'];
/** Quinta: o que cabe no espaço do H2 enquanto o Hyrox usa os 2 monocross e as pistas. */
export const CABE_NO_H2_DA_QUINTA = ['smith', 'halteres', 'kettlebell', 'banco', 'barra', 'anilhas', 'peso_corporal', 'colchonete'];
export const SMITH_NO_H2_DA_QUINTA = 1;

/* ───────────────────────────── os nomes ───────────────────────────── */

/** Minúsculas, sem acento, só letras e números. */
export function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'com', 'e', 'em', 'o', 'a', 'os', 'as', 'para', 'pra', 'c', 'p', 's', 'the', 'of']);
/** Abreviações da lousa. Só as que não têm duas leituras ("flex" pode ser flexão ou flexora: fica de fora). */
/** @type {Record<string, string>} */
const ABREV = {
  desenv: 'desenvolvimento', desenvol: 'desenvolvimento', rem: 'remada', abs: 'abdominal', abd: 'abdominal', abdomen: 'abdominal',
  elev: 'elevacao', agach: 'agachamento', sup: 'supino', pux: 'puxada', lev: 'levantamento', kb: 'kettlebell', db: 'halter',
  halt: 'halter', haltere: 'halter', unilat: 'unilateral', unil: 'unilateral', inclin: 'inclinado', incl: 'inclinado',
  pushup: 'push', situp: 'sit',
};

function canon(t) {
  let x = ABREV[t] ?? t;
  if (x.length > 4) {
    if (x.endsWith('oes') || x.endsWith('aes')) x = `${x.slice(0, -3)}ao`;
    else if (x.endsWith('ais')) x = `${x.slice(0, -3)}al`;
    else if (x.endsWith('res')) x = x.slice(0, -2);
    else if (x.endsWith('s') && !x.endsWith('ss')) x = x.slice(0, -1);
  }
  return ABREV[x] ?? x;
}

/** As palavras que contam num nome. @param {string} s */
export function palavras(s) {
  return normalizar(s).split(' ').filter((t) => t && !STOP.has(t)).map(canon);
}
const chave = (/** @type {string[]} */ t) => [...new Set(t)].sort().join(' ');

/** A chave de um apelido: o nome escrito, normalizado (é o que o coach confirma uma vez). @param {string} escrito */
export const chaveApelido = (escrito) => normalizar(escrito);

/** Palavras de equipamento: "Stiff" e "Stiff barra" são o mesmo exercício para a repetição. */
const PALAVRAS_EQUIPAMENTO = new Set(['barra', 'halter', 'smith', 'kettlebell', 'monocross', 'polia', 'cabo', 'maquina', 'banco',
  'livre', 'anilha', 'dumbbell', 'barbell', 'crossover', 'trx', 'corda', 'peso', 'corporal']);
/**
 * A chave de um nome que o catálogo não reconheceu, para conferir a repetição
 * pelo texto: sem as palavras de equipamento. @param {string} escrito
 */
export function chaveSolta(escrito) {
  const w = palavras(escrito);
  const sem = w.filter((t) => !PALAVRAS_EQUIPAMENTO.has(t));
  return chave(sem.length ? sem : w);
}

/** Nomes da lousa que já têm uma leitura só (o coach não precisa confirmar). */
/** @type {Record<string, string>} */
const NOMES_CONHECIDOS = {
  'air squat': 'agachamento_livre', 'push up': 'flexao', 'flexao': 'flexao', 'abs crunch': 'abdominal_supra',
  'crunch': 'abdominal_supra', 'wall ball': 'wall_ball_shot', 'kb swing': 'kb_swing', 'swing': 'kb_swing',
};
/** Só valem dentro de uma seção de Hyrox. */
/** @type {Record<string, string>} */
const NOMES_HYROX = {
  'ski': 'hyrox:skierg', 'ski erg': 'hyrox:skierg', 'skierg': 'hyrox:skierg', 'skyerg': 'hyrox:skierg', 'sky erg': 'hyrox:skierg',
  'sandbag': 'hyrox:sandbag_lunges', 'sandbag lunge': 'hyrox:sandbag_lunges', 'remo': 'hyrox:remo', 'row': 'hyrox:remo',
  'wall ball': 'hyrox:wall_ball', 'wall balls': 'hyrox:wall_ball', 'burpee': 'hyrox:burpee_broad_jump',
  'farmer': 'hyrox:farmers_carry', 'lunges': 'hyrox:sandbag_lunges', 'lunge': 'hyrox:sandbag_lunges',
};

/**
 * @typedef {{id: string, nome: string, musculoPrincipal: string[], musculosSecundarios: string[], equipamentos?: string[],
 *   instancia?: string|null, cross?: {padrao: string}|null, hiit?: string[]|null, ativo?: boolean, unilateral?: boolean,
 *   acessorio?: boolean, estacao?: string, recursos?: Record<string, number>, hyrox?: boolean,
 *   tipo?: string, modelos?: Record<string, Record<string, number>>}} ItemQuadro
 * @typedef {{item: ItemQuadro, main: string, extras: string[], todas: Set<string>, mainSet: Set<string>}} Entrada
 * @typedef {{porId: Map<string, ItemQuadro>, entradas: Entrada[], hyrox: Entrada[], estacoes: ItemQuadro[],
 *   corrida: Record<string, Record<string, number>>|null}} Indice
 */

/** @param {ItemQuadro} item @param {string} nome */
function entrada(item, nome) {
  const parens = [...nome.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const semParens = nome.replace(/\([^)]*\)/g, ' ');
  const [principal, ...depois] = semParens.split(/\s[—–-]\s/);
  const mainT = palavras(principal);
  const extras = [...parens, ...depois].map((x) => chave(palavras(x))).filter(Boolean);
  const todas = new Set([...mainT, ...[...parens, ...depois].flatMap(palavras)]);
  return { item, main: chave(mainT), extras, todas, mainSet: new Set(mainT) };
}

/**
 * O índice de nomes do catálogo (`listarCatalogoBox`) e das 8 estações do Hyrox.
 * Exercício desativado continua reconhecido: o coach pode escrever o que quiser.
 * @param {{exercicios?: any[], hyrox?: any[], corridaHyrox?: any}} catalogo
 * @returns {Indice}
 */
export function indiceDoCatalogo(catalogo) {
  /** @type {Map<string, ItemQuadro>} */
  const porId = new Map();
  /** @type {Entrada[]} */
  const entradas = [];
  for (const e of catalogo?.exercicios ?? []) {
    porId.set(e.id, e);
    entradas.push(entrada(e, e.nome));
  }
  /** @type {Entrada[]} */
  const hyrox = [];
  /** @type {ItemQuadro[]} */
  const estacoes = [];
  for (const h of catalogo?.hyrox ?? []) {
    const est = {
      id: `hyrox:${h.estacao}`, nome: h.nome, estacao: h.estacao, hyrox: true, recursos: { ...(h.recursos ?? {}) },
      musculoPrincipal: h.musculoPrincipal ?? [], musculosSecundarios: h.musculosSecundarios ?? [],
      tipo: h.tipo, modelos: h.modelos,
    };
    if (h.estacao === 'skierg') est.recursos = { ...est.recursos, monocross: CAPACIDADE_SKIERG };
    porId.set(est.id, est);
    estacoes.push(est);
    hyrox.push(entrada(est, h.nome));
    // O nome de prova (base) também vale: "Sled Push", "Wall Balls".
    hyrox.push(entrada(est, h.estacao.replace(/_/g, ' ')));
    if (h.substituta) {
      const sub = {
        id: `hyrox:${h.estacao}:sub`, nome: h.substituta.nome, estacao: h.estacao, hyrox: true, recursos: {},
        musculoPrincipal: h.substituta.musculoPrincipal ?? [], musculosSecundarios: h.substituta.musculosSecundarios ?? [],
        tipo: h.substituta.tipo, modelos: h.substituta.modelos,
      };
      porId.set(sub.id, sub);
      hyrox.push(entrada(sub, h.substituta.nome));
    }
  }
  return { porId, entradas, hyrox, estacoes, corrida: catalogo?.corridaHyrox ?? null };
}

/** A unidade da tabela de uma estação do Hyrox (o SkiErg da casa conta puxadas). @param {ItemQuadro} it */
export function unidadeHyrox(it) {
  if (it.estacao === 'skierg' && !it.id.endsWith(':sub')) return 'puxadas';
  return /** @type {Record<string, string>} */ ({ reps: 'reps', metros: 'm', calorias: 'cal', segundos: 's' })[it.tipo ?? ''] ?? '';
}

/**
 * A quantidade de uma estação pela tabela do coach, nos 3 modelos de um nível.
 * @param {ItemQuadro|null} it @param {string} nivel
 * @returns {{modelo: string, n: number, unidade: string}[]}
 */
export function quantidadesHyrox(it, nivel) {
  if (!it?.modelos) return [];
  const unidade = unidadeHyrox(it);
  return MODELOS_HYROX.map((modelo) => ({ modelo, n: Number(it.modelos?.[modelo]?.[nivel]), unidade })).filter((x) => Number.isFinite(x.n));
}

/** A corrida antes de cada estação, nos 3 modelos de um nível (e a air bike em calorias). @param {Indice} indice @param {string} nivel */
export function corridaHyrox(indice, nivel) {
  if (!indice.corrida) return [];
  return MODELOS_HYROX.map((modelo) => {
    const m = Number(indice.corrida?.[modelo]?.[nivel]);
    return { modelo, metros: m, cal: Math.max(1, Math.round(m / METROS_POR_CAL_AIRBIKE)) };
  }).filter((x) => Number.isFinite(x.metros));
}

/**
 * @typedef {{id: string|null, como: 'apelido'|'nome'|'fora'|null, sugestoes: {id: string, nome: string}[]}} Leitura
 */

/** @param {Entrada[]} lista @param {string[]} w */
function candidatos(lista, w) {
  const k = chave(w);
  const ws = new Set(w);
  const iguais = lista.filter((e) => e.main === k || e.extras.includes(k));
  if (iguais.length) return iguais;
  return lista.filter((e) => [...e.mainSet].every((t) => ws.has(t)) && w.every((t) => e.todas.has(t)));
}

/** @param {Entrada[]} lista @param {string[]} w @param {number} n */
function sugestoes(lista, w, n = 3) {
  const ws = new Set(w);
  const vistos = new Set();
  return lista
    .map((e) => {
      const comum = [...ws].filter((t) => e.todas.has(t)).length;
      const uniao = new Set([...ws, ...e.mainSet]).size;
      return { e, nota: comum ? comum / uniao : 0 };
    })
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota || a.e.item.nome.localeCompare(b.e.item.nome, 'pt-BR'))
    .filter((x) => (vistos.has(x.e.item.id) ? false : (vistos.add(x.e.item.id), true)))
    .slice(0, n)
    .map((x) => ({ id: x.e.item.id, nome: x.e.item.nome }));
}

/**
 * Que exercício do catálogo é o nome escrito. Reconhece sozinho só o que não tem
 * dúvida (o nome do catálogo, com ou sem "no"/"com", ou um apelido que o coach
 * já confirmou); o resto volta com sugestões, e o coach escolhe UMA vez.
 * @param {string} escrito @param {Indice} indice @param {Record<string, string>} apelidos
 * @param {{hyrox?: boolean}} [ctx]
 * @returns {Leitura}
 */
export function lerNome(escrito, indice, apelidos = {}, ctx = {}) {
  const k = chaveApelido(escrito);
  const ap = apelidos[k];
  if (ap === '-') return { id: null, como: 'fora', sugestoes: [] };
  if (ap && indice.porId.has(ap)) return { id: ap, como: 'apelido', sugestoes: [] };
  const w = palavras(escrito);
  if (!w.length) return { id: null, como: null, sugestoes: [] };
  const lista = ctx.hyrox ? [...indice.hyrox, ...indice.entradas] : indice.entradas;
  // "?" = o coach pediu para trocar a leitura automática: pergunta de novo, com mais opções.
  if (ap === '?') return { id: null, como: null, sugestoes: sugestoes(lista, w, 5) };
  if (ctx.hyrox) {
    const h = NOMES_HYROX[chave(w)] ?? NOMES_HYROX[k];
    if (h && indice.porId.has(h)) return { id: h, como: 'nome', sugestoes: [] };
    const ch = unicos(candidatos(indice.hyrox, w));
    if (ch.length === 1) return { id: ch[0], como: 'nome', sugestoes: [] };
  }
  const conhecido = NOMES_CONHECIDOS[k];
  if (conhecido && indice.porId.has(conhecido)) return { id: conhecido, como: 'nome', sugestoes: [] };
  const c = unicos(candidatos(indice.entradas, w));
  if (c.length === 1) return { id: c[0], como: 'nome', sugestoes: [] };
  const sug = c.length > 1 ? c.slice(0, 4).map((id) => ({ id, nome: indice.porId.get(id)?.nome ?? id })) : sugestoes(lista, w);
  return { id: null, como: null, sugestoes: sug };
}
/** @param {Entrada[]} l */
const unicos = (l) => [...new Set(l.map((e) => e.item.id))];

/* ───────────────────────────── o texto ───────────────────────────── */

const RE_SERIES_REPS = /(?<![\d,.])(\d{1,2})\s*[xX×]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)(?![\d,.])/;
const RE_CABECALHO = /^\s*(?:bloco\s+)?([a-hA-H])\s*[)\]:.\-–—]\s*(.*)$/;
const RE_DESCANSO = [
  { re: /(\d+(?:[.,]\d+)?)\s*(?:'|’|min(?:utos?)?)\s*(?:de\s+)?(?:pausa|descanso|intervalo|rest)/i, mult: 60 },
  { re: /(\d+)\s*(?:s|"|”|seg(?:undos)?)\s*(?:de\s+)?(?:pausa|descanso|intervalo|rest)/i, mult: 1 },
  { re: /(?:pausa|descanso|intervalo|rest)\s*(?:de\s+)?(\d+)\s*(?:s|"|”|seg(?:undos)?)/i, mult: 1 },
  { re: /(?:pausa|descanso|intervalo|rest)\s*(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(?:'|’|min(?:utos?)?)?/i, mult: 60 },
];

/** O tipo de uma seção pelo título. */
const TIPOS_SECAO = /** @type {[string, RegExp][]} */ ([
  ['mobilidade', /^(mobilidade|mob|liberacao|ativacao)\b/],
  ['aquecimento', /^(aquecimento|aquec|warm ?up)\b/],
  ['calma', /^(volta a calma|desaquecimento|cool ?down|alongamento)\b/],
  ['forca', /^(forca|principal|strength|tecnica|skill|super ?serie|bi ?set)\b/],
  ['wod', /^(wod|metcon|amrap|emom|for time|chipper|rft)\b/],
  ['tabata', /^(tabata|hiit)\b/],
  ['hyrox', /^hyrox\b/],
  ['gap', /^gap\b/],
  ['murph', /^murph\b/],
]);
/** Seções que não contam volume nem repetição (preparação). O aquecimento conta pouco: `FATOR_AQUECIMENTO`. */
export const SECOES_SEM_CONTA = ['mobilidade', 'calma'];
/** @type {Record<string, string>} */
export const NOME_TIPO_SECAO = {
  mobilidade: 'Mobilidade', aquecimento: 'Aquecimento', calma: 'Volta à calma', forca: 'Força', wod: 'WOD',
  tabata: 'Tabata', hyrox: 'Hyrox', gap: 'GAP', murph: 'Murph', hiit: 'Estação',
};

// A linha INTEIRA é o nome da estação ("Estação 1 - Pernas"): "Abs crunch" continua exercício.
const RE_ESTACAO_HIIT = /^(?:estacao\s*)?(?:\d+\s*)?(membros superiores|membros inferiores|pernas?|core|abdomen|abdominal|abs|superior(?:es)?|cardio)$/;
/** A estação do HIIT pelo título ("Pernas", "Estação Core", "Estação 2 - Superior"). @param {string} titulo */
export function estacaoDoTitulo(titulo) {
  const m = RE_ESTACAO_HIIT.exec(normalizar(titulo));
  if (!m) return null;
  if (m[1].startsWith('pern') || m[1] === 'membros inferiores') return 'pernas';
  if (['core', 'abdomen', 'abdominal', 'abs'].includes(m[1])) return 'core';
  if (m[1] === 'cardio') return 'cardio';
  return 'superiores';
}

/** @param {string} titulo @param {string} [tipoPadrao] na coluna do HIIT, "Pernas", "Core"… são estações */
function tipoDoTitulo(titulo, tipoPadrao = '') {
  const n = normalizar(titulo);
  if (tipoPadrao === 'tabata' && estacaoDoTitulo(titulo)) return 'hiit';
  for (const [tipo, re] of TIPOS_SECAO) if (re.test(n)) return tipo;
  if (/\b(amrap|emom|for time|chipper|rft)\b/.test(n)) return 'wod';
  if (/\btabata\b/.test(n)) return 'tabata';
  return null;
}

/** @param {string} t */
function formatoDoTexto(t) {
  const n = normalizar(t);
  if (/\bamrap\b/.test(n)) return 'AMRAP';
  if (/\bemom\b/.test(n)) return 'EMOM';
  if (/\bchipper\b/.test(n)) return 'Chipper';
  if (/\b(for time|ft|rft)\b/.test(n)) return 'For Time';
  return null;
}

/**
 * Os números de uma prescrição escrita (cabeçalho ou linha só de números).
 * @param {string} t
 */
export function lerPrescricao(t) {
  /** @type {{series?: number, reps?: string, descansoSeg?: number, minutos?: number, rodadas?: number, formato?: string, rounds?: number}} */
  const p = {};
  let resto = String(t ?? '');
  const sr = RE_SERIES_REPS.exec(resto);
  if (sr) {
    const s = Number(sr[1]);
    if (s >= 1 && s <= 20) { p.series = s; p.reps = sr[2].replace(/\s*[-–]\s*/, '-'); }
    resto = resto.replace(sr[0], ' ');
  }
  for (const { re, mult } of RE_DESCANSO) {
    const m = re.exec(resto);
    if (m) { p.descansoSeg = Math.round(Number(m[1].replace(',', '.')) * mult); resto = resto.replace(m[0], ' '); break; }
  }
  const rounds = /(\d+)\s*(?:rounds?|rodadas?|rds?|rft|voltas?)(?![a-z])/i.exec(resto);
  if (rounds) { p.rodadas = Number(rounds[1]); resto = resto.replace(rounds[0], ' '); }
  const cap = /(?:time\s*)?cap\s*(?:de\s*)?(\d+)/i.exec(resto);
  const min = cap ?? /(\d+)\s*(?:min(?:utos?)?|m|'|’)(?![a-z0-9])/i.exec(resto);
  if (min) p.minutos = Number(min[1]);
  const f = formatoDoTexto(resto);
  if (f) p.formato = f;
  return p;
}

/** A linha é só números (séries, descanso, tempo)? @param {string} t */
function soPrescricao(t) {
  const sobra = normalizar(String(t)
    .replace(RE_SERIES_REPS, ' ')
    .replace(/\([^)]*\)/g, ' '))
    .replace(/\b\d+\b|\b\d+(m|s|min|seg|kg|x)\b/g, ' ')
    .replace(/\b(reps?|repeticoes|series?|x|min|minutos?|seg|segundos?|s|pausa|descanso|intervalo|rest|de|rounds?|rodadas?|rds|cada|cap|time|kg)\b/g, ' ')
    .replace(/\s+/g, '');
  return sobra.length < 3;
}

/** "12x", "200m", "10 cal", "1m" no começo do nome. */
const RE_QTD_INICIO = /^(\d+(?:[.,]\d+)?)\s*(x|×|reps?|m|mts?|metros?|km|cals?|calorias?|s|seg|min|'|"|’)?\s+(?=\S)/i;
const RE_QTD_FIM = /\s+(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(x|reps?|m|cals?|s|seg)?$/i;

/** @param {string} alt @param {boolean} [numeroSoltoEhReps] fora da força, "Wall ball 80" = 80 repetições */
function quantidadeDe(alt, numeroSoltoEhReps = false) {
  let texto = alt.trim();
  /** @type {{n: number, unidade: string}|null} */
  let qtd = null;
  const ini = RE_QTD_INICIO.exec(texto);
  if (ini) {
    qtd = { n: Number(ini[1].replace(',', '.')), unidade: unidade(ini[2]) };
    texto = texto.slice(ini[0].length);
  } else {
    const fim = RE_QTD_FIM.exec(texto);
    if (fim && (fim[2] || numeroSoltoEhReps)) { qtd = { n: Number(fim[1].replace(',', '.')), unidade: unidade(fim[2]) }; texto = texto.slice(0, fim.index); }
  }
  // "1m air bike": ninguém faz 1 metro — é 1 minuto.
  if (qtd && qtd.unidade === 'm' && qtd.n < 10) qtd = { n: qtd.n, unidade: 'min' };
  return { texto: texto.replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, '').trim(), qtd };
}
/** @param {string|undefined} u */
function unidade(u) {
  const n = String(u ?? '').toLowerCase();
  if (!n || n === 'x' || n === '×' || n.startsWith('rep')) return 'reps';
  if (n === 'km') return 'km';
  if (n.startsWith('m') && n !== 'min') return 'm';
  if (n.startsWith('cal')) return 'cal';
  if (n === 'min' || n === "'" || n === '’') return 'min';
  return 's';
}

/** Grupos do GAP ("3 perna", "4 glúteo"): os músculos de cada música. */
/** @type {Record<string, {nome: string, musculoPrincipal: string[], musculosSecundarios: string[]}>} */
export const GRUPOS_GAP = {
  aquecimento: { nome: 'Aquecimento', musculoPrincipal: [], musculosSecundarios: [] },
  perna: { nome: 'Perna', musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo', 'posterior_coxa'] },
  gluteo: { nome: 'Glúteo', musculoPrincipal: ['gluteo'], musculosSecundarios: ['posterior_coxa'] },
  abs: { nome: 'Abdômen', musculoPrincipal: ['core'], musculosSecundarios: [] },
  superiores: { nome: 'Superiores', musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps', 'costas'] },
};
const RE_GRUPO_GAP = /(\d+)\s*(?:m[uú]sicas?\s*(?:de\s+)?)?(aquecimento|pernas?|gl[uú]teos?|abs|abd[oô]men|abdominal|core|bra[cç]os?|superiores?|ombros?)/gi;
/** @param {string} g */
function grupoGap(g) {
  const n = normalizar(g);
  if (n.startsWith('aquec')) return 'aquecimento';
  if (n.startsWith('pern')) return 'perna';
  if (n.startsWith('glut')) return 'gluteo';
  if (/^(abs|abd|core)/.test(n)) return 'abs';
  return 'superiores';
}

/**
 * @typedef {{linha: number, escrito: string, alternativas: string[], qtd: {n: number, unidade: string}|null,
 *   series: number|null, reps: string|null, grupoLinha: number}} ItemEscrito
 * @typedef {{letra: string, titulo: string, tipo: string, linha: number, formato: string|null, minutos: number|null,
 *   rodadas: number|null, series: number|null, reps: string|null, descansoSeg: number|null, roundsPorMusica: number|null,
 *   estacao: string|null, itens: ItemEscrito[], musicas: {linha: number, grupo: string, n: number}[]}} Secao
 * @typedef {{i: number, texto: string, tipo: 'vazia'|'secao'|'prescricao'|'item'|'musicas', secao: number}} LinhaLida
 */

/** Os números de uma linha de prescrição valem para a seção inteira. @param {any} sec @param {ReturnType<typeof lerPrescricao>} p */
function juntarPrescricao(sec, p) {
  for (const k of ['series', 'reps', 'descansoSeg', 'minutos', 'rodadas', 'formato']) {
    if (/** @type {any} */ (p)[k] !== undefined) sec[k] = /** @type {any} */ (p)[k];
  }
}

/**
 * Lê uma coluna do quadro: seções (A, B, C…) com o que tem dentro.
 *
 * Cabeçalho é "B) Principal 3x 8-10 1' pausa" (a letra, ou só a palavra:
 * "Aquecimento", "WOD 18 min AMRAP"); o que vem depois de ":" no cabeçalho é
 * uma linha de exercício. Linha só de números ("5x 8-10 (60–90)") vale para a
 * seção inteira. O resto é exercício: "12x Abs remador", "Agachamento Smith",
 * "Double shoulder press + Stiff/RDL" (o "+" junta, a "/" e o "ou" são opções).
 * @param {string} texto @param {string} tipoPadrao o tipo de seção da coluna (forca, wod, hyrox, tabata, gap, murph)
 * @returns {{secoes: Secao[], linhas: LinhaLida[]}}
 */
export function lerColuna(texto, tipoPadrao) {
  const brutas = String(texto ?? '').split(/\r?\n/);
  /** @type {Secao[]} */
  const secoes = [];
  /** @type {LinhaLida[]} */
  const linhas = [];
  /** @param {string} letra @param {string} titulo @param {number} i */
  const novaSecao = (letra, titulo, i) => {
    const p = lerPrescricao(titulo);
    const tipo = tipoDoTitulo(titulo, tipoPadrao) ?? (p.formato ? 'wod' : tipoPadrao);
    const rpm = /(\d+)\s*rounds?/i.exec(titulo);
    secoes.push({
      letra, titulo: titulo.trim(), tipo, linha: i, formato: p.formato ?? null, minutos: p.minutos ?? null,
      rodadas: p.rodadas ?? null, series: p.series ?? null, reps: p.reps ?? null, descansoSeg: p.descansoSeg ?? null,
      roundsPorMusica: tipo === 'gap' && rpm ? Number(rpm[1]) : null,
      estacao: tipo === 'hiit' ? estacaoDoTitulo(titulo) : null, itens: [], musicas: [],
    });
  };
  const atual = () => {
    if (!secoes.length) novaSecao('', '', -1);
    return secoes[secoes.length - 1];
  };
  let grupoLinha = 0;

  /** @param {string} conteudo @param {number} i @param {boolean} marcar */
  const lerConteudo = (conteudo, i, marcar) => {
    const sec = atual();
    const idx = secoes.length - 1;
    if (sec.tipo === 'gap') {
      const grupos = [...conteudo.matchAll(RE_GRUPO_GAP)];
      if (grupos.length) {
        for (const g of grupos) sec.musicas.push({ linha: i, grupo: grupoGap(g[2]), n: Number(g[1]) });
        const rpm = /(\d+)\s*rounds?/i.exec(conteudo);
        if (rpm) sec.roundsPorMusica = Number(rpm[1]);
        if (marcar) linhas.push({ i, texto: conteudo, tipo: 'musicas', secao: idx });
        return;
      }
      // "cada música 8 rounds": a regra das músicas, não um exercício.
      const rpm = /(\d+)\s*rounds?/i.exec(conteudo);
      if (rpm && /m[uú]sica|tabata/i.test(conteudo)) {
        sec.roundsPorMusica = Number(rpm[1]);
        if (marcar) linhas.push({ i, texto: conteudo, tipo: 'prescricao', secao: idx });
        return;
      }
    }
    if (soPrescricao(conteudo)) {
      juntarPrescricao(sec, lerPrescricao(conteudo));
      if (marcar) linhas.push({ i, texto: conteudo, tipo: 'prescricao', secao: idx });
      return;
    }
    let corpo = conteudo.replace(/^[\s•*·>\-–]+/, '').replace(/^\d+[.)]\s+/, '');
    const sr = RE_SERIES_REPS.exec(corpo);
    /** @type {number|null} */
    let series = null;
    /** @type {string|null} */
    let reps = null;
    if (sr) { series = Number(sr[1]); reps = sr[2].replace(/\s*[-–]\s*/, '-'); corpo = corpo.replace(sr[0], ' '); }
    corpo = corpo.replace(/\([^)]*\d[^)]*\)/g, ' ');
    for (const { re } of RE_DESCANSO) corpo = corpo.replace(re, ' ');
    grupoLinha += 1;
    for (const parte of corpo.split(/\s*\+\s*/)) {
      const alts = parte.split(/\s*\/\s*|\s+ou\s+/i).map((a) => quantidadeDe(a, sec.tipo !== 'forca')).filter((a) => normalizar(a.texto).length >= 2);
      if (!alts.length) continue;
      sec.itens.push({
        linha: i, escrito: alts[0].texto, alternativas: alts.slice(1).map((a) => a.texto),
        qtd: alts[0].qtd ?? alts.find((a) => a.qtd)?.qtd ?? null, series, reps, grupoLinha,
      });
    }
    if (marcar) linhas.push({ i, texto: conteudo, tipo: 'item', secao: idx });
  };

  brutas.forEach((bruta, i) => {
    const t = bruta.trim();
    if (!t) { linhas.push({ i, texto: '', tipo: 'vazia', secao: secoes.length - 1 }); return; }
    const m = RE_CABECALHO.exec(t);
    const antesDoPonto = t.split(':')[0];
    const soPalavra = !m && !RE_QTD_INICIO.test(t) && !RE_SERIES_REPS.test(antesDoPonto) && !!tipoDoTitulo(antesDoPonto, tipoPadrao);
    if ((m && !/^\d/.test(m[2] ?? '')) || soPalavra) {
      const resto = m ? m[2] : t;
      const dois = resto.indexOf(':');
      const titulo = dois >= 0 ? resto.slice(0, dois) : resto;
      const anterior = secoes[secoes.length - 1];
      const tipoNovo = tipoDoTitulo(titulo, tipoPadrao);
      // Duas estações seguidas são duas seções, mesmo a primeira ainda vazia.
      if (soPalavra && anterior && !anterior.itens.length && !anterior.musicas.length && !(anterior.tipo === 'hiit' && tipoNovo === 'hiit')) {
        // "D) WOD" e, embaixo, "AMRAP 18 min": é a mesma seção.
        juntarPrescricao(anterior, lerPrescricao(titulo));
        const tipo = tipoNovo;
        if (tipo && (anterior.tipo === tipoPadrao || tipo !== 'wod')) anterior.tipo = tipo;
        if (tipo === 'hiit') anterior.estacao = estacaoDoTitulo(titulo);
        anterior.titulo = (anterior.titulo + ' ' + titulo.trim()).trim();
      } else {
        novaSecao(m ? m[1].toUpperCase() : '', titulo, i);
      }
      linhas.push({ i, texto: t, tipo: 'secao', secao: secoes.length - 1 });
      const conteudo = dois >= 0 ? resto.slice(dois + 1).trim() : '';
      if (conteudo) lerConteudo(conteudo, i, false);
      return;
    }
    lerConteudo(t, i, true);
  });

  return { secoes, linhas };
}

/* ───────────────────────────── a conferência ───────────────────────────── */

/**
 * @typedef {{tipo: 'erro'|'falta'|'repete'|'duvida'|'info', onde: string, linha?: number, texto: string}} Problema
 * @typedef {{texto: string, recursos: string[]}} Adaptacao o coach já resolveu a falta destes recursos no dia
 * @typedef {{escrito: string, alternativas: string[], linha: number, secao: Secao, leitura: Leitura, item: ItemQuadro|null,
 *   series: number, conta: boolean, chave: string, grupoLinha: number, qtd: {n: number, unidade: string}|null}} ItemLido
 * @typedef {{onde: string, aula: string, quadro: string, dias: string[], secoes: Secao[], linhas: LinhaLida[], itens: ItemLido[],
 *   seriesPorId: Record<string, number>, volume: Record<string, number>, minutos: number, vazia: boolean}} ColunaLida
 */

const cardio = (/** @type {ItemQuadro|null} */ it) => !!it && (it.cross?.padrao === 'cardio' || (!it.cross && (it.hiit ?? []).includes('cardio')));

/** Blocos de cada movimento do WOD (a mesma conta do "fiz como prescrito"). @param {Secao} s @param {number} movimentos */
export function blocosDoWod(s, movimentos) {
  if (s.formato === 'AMRAP') return Math.floor((s.minutos ?? 0) / MINUTOS_POR_RODADA_AMRAP);
  if (s.formato === 'EMOM') return Math.floor((s.minutos ?? 0) / Math.max(1, movimentos));
  if (s.formato === 'Chipper') return BLOCOS_CHIPPER;
  return s.rodadas ?? 1;
}

/**
 * Volume por músculo (`volumeDaSessao`): série × 1,0 no principal, × 0,5 no secundário.
 * @param {Record<string, number>} series @param {(id: string) => {musculoPrincipal: string[], musculosSecundarios: string[]}|undefined} musculos
 */
export function volumeDasSeries(series, musculos) {
  /** @type {Record<string, number>} */
  const v = {};
  for (const [id, n] of Object.entries(series)) {
    const m = musculos(id);
    if (!m || !(n > 0)) continue;
    const principais = new Set(m.musculoPrincipal);
    for (const x of principais) v[x] = (v[x] ?? 0) + n * PESO_PRINCIPAL;
    for (const x of new Set(m.musculosSecundarios)) if (!principais.has(x)) v[x] = (v[x] ?? 0) + n * PESO_SECUNDARIO;
  }
  return v;
}

/**
 * Lê e confere a semana inteira.
 * @param {{
 *   quadros: Record<string, {h?: string, metabolico?: string}>,
 *   extra?: {tipo?: string|null, dia?: string, texto?: string}|null,
 *   catalogo: {exercicios?: any[], hyrox?: any[]},
 *   apelidos?: Record<string, string>,
 *   inventario?: any,
 *   anterior?: {quadros?: Record<string, {h?: string, metabolico?: string}>}|null,
 *   adaptacoes?: Record<string, Adaptacao>,
 * }} entrada
 */
export function conferirSemana(entrada) {
  const indice = indiceDoCatalogo(entrada.catalogo);
  const apelidos = entrada.apelidos ?? {};
  const limites = limitesDoInventario(entrada.inventario);
  /** @type {Problema[]} */
  const problemas = [];
  /** @type {Record<string, ColunaLida>} */
  const colunas = {};

  for (const q of QUADROS) {
    const txt = entrada.quadros?.[q.id] ?? {};
    colunas[`${q.id}.h`] = lerColunaInteira({ onde: `${q.id}.h`, aula: q.h, quadro: q.id, dias: [...q.dias], texto: txt.h ?? '', tipoPadrao: 'forca', indice, apelidos });
    colunas[`${q.id}.m`] = lerColunaInteira({
      onde: `${q.id}.m`, aula: q.metabolico, quadro: q.id, dias: [q.diaMetabolico], texto: txt.metabolico ?? '',
      tipoPadrao: { Cross: 'wod', Hyrox: 'hyrox', HIIT: 'tabata' }[q.metabolico] ?? 'wod', indice, apelidos,
    });
  }
  const extra = entrada.extra;
  if (extra?.tipo && EXTRAS.includes(extra.tipo) && DIAS.includes(extra.dia ?? '')) {
    const q = QUADROS.find((x) => /** @type {readonly string[]} */ (x.dias).includes(/** @type {string} */ (extra.dia)));
    colunas.extra = lerColunaInteira({
      onde: 'extra', aula: extra.tipo, quadro: q?.id ?? '', dias: [/** @type {string} */ (extra.dia)], texto: extra.texto ?? '',
      tipoPadrao: extra.tipo === 'GAP' ? 'gap' : 'murph', indice, apelidos,
    });
  }

  // Leitura: o que o coach ainda precisa confirmar.
  for (const c of Object.values(colunas)) {
    for (const it of c.itens) {
      if (!it.leitura.id && it.leitura.como !== 'fora') {
        problemas.push({ tipo: 'duvida', onde: c.onde, linha: it.linha, texto: `"${it.escrito}" — qual exercício do catálogo é este?` });
      }
    }
  }

  /** @type {Record<string, Record<string, string[]>>} */
  const padroesH = {};
  for (const q of QUADROS) {
    const c = colunas[`${q.id}.h`];
    padroesH[q.h] = conferirH(c, problemas);
  }
  conferirCross(colunas['q1.m'], problemas);
  conferirHyrox(colunas['q2.m'], indice, problemas);
  conferirHiit(colunas['q3.m'], problemas);
  conferirQuinta(colunas['q2.h'], problemas);
  conferirRepeticoes(colunas, problemas, entrada.anterior ?? null, indice, apelidos);
  const equipamento = conferirEquipamento(colunas, limites, problemas, entrada.adaptacoes ?? {});
  for (const c of Object.values(colunas)) {
    if (!c.vazia && c.minutos > 60) problemas.push({ tipo: 'info', onde: c.onde, texto: `${c.aula}: a aula soma ≈ ${Math.round(c.minutos)} min, passa da hora.` });
  }

  return { colunas, problemas, padroesH, equipamento, limites, indice };
}

/**
 * @param {{onde: string, aula: string, quadro: string, dias: string[], texto: string, tipoPadrao: string, indice: Indice, apelidos: Record<string, string>}} o
 * @returns {ColunaLida}
 */
function lerColunaInteira(o) {
  const { secoes, linhas } = lerColuna(o.texto, o.tipoPadrao);
  const ehH = o.tipoPadrao === 'forca';
  /** @type {ItemLido[]} */
  const itens = [];
  /** @type {Record<string, number>} */
  const seriesPorId = {};
  let minutos = 0;
  for (const s of secoes) {
    const doWod = s.itens.length;
    /** @type {string|null} o unilateral da linha anterior na estação, à espera do outro lado */
    let ladoAnterior = null;
    for (const e of s.itens) {
      const leitura = lerNome(e.escrito, o.indice, o.apelidos, { hyrox: s.tipo === 'hyrox' });
      const item = leitura.id ? o.indice.porId.get(leitura.id) ?? null : null;
      const conta = !SECOES_SEM_CONTA.includes(s.tipo);
      // HIIT: o unilateral escrito duas vezes seguidas é o lado direito e o esquerdo — as séries já contaram.
      const outroLado = s.tipo === 'hiit' && !!item?.unilateral && ladoAnterior === item.id;
      ladoAnterior = s.tipo === 'hiit' && item?.unilateral && !outroLado ? item.id : null;
      const series = conta && !outroLado ? seriesDoItem(s, e, item, ehH, doWod) : 0;
      if (item && series > 0) seriesPorId[item.id] = (seriesPorId[item.id] ?? 0) + series;
      itens.push({
        escrito: e.escrito, alternativas: e.alternativas, linha: e.linha, secao: s, leitura, item, series, conta,
        chave: item ? item.id : `txt:${chaveSolta(e.escrito)}`, grupoLinha: e.grupoLinha, qtd: e.qtd,
      });
    }
    if (s.tipo === 'gap') {
      const rounds = s.roundsPorMusica ?? ROUNDS_POR_MUSICA;
      for (const m of s.musicas) {
        const g = GRUPOS_GAP[m.grupo];
        if (!g.musculoPrincipal.length) continue;
        const id = `gap:${m.grupo}`;
        seriesPorId[id] = (seriesPorId[id] ?? 0) + m.n * rounds * (SEGUNDOS_ROUND_TABATA / SEGUNDOS_POR_SERIE);
      }
    }
    minutos += minutosDaSecao(s, ehH);
  }
  const volume = volumeDasSeries(seriesPorId, (id) => (id.startsWith('gap:') ? GRUPOS_GAP[id.slice(4)] : o.indice.porId.get(id)));
  return {
    onde: o.onde, aula: o.aula, quadro: o.quadro, dias: o.dias, secoes, linhas, itens, seriesPorId, volume, minutos,
    vazia: !secoes.some((s) => s.itens.length || s.musicas.length),
  };
}

/** @param {Secao} s @param {ItemEscrito} e @param {ItemQuadro|null} item @param {boolean} ehH @param {number} movimentos */
function seriesDoItem(s, e, item, ehH, movimentos) {
  const meio = SEGUNDOS_ROUND_TABATA / SEGUNDOS_POR_SERIE;
  switch (s.tipo) {
    case 'forca': return e.series ?? s.series ?? (ehH ? SERIES_POR_EXERCICIO : SERIES_FORCA_METABOLICO);
    case 'aquecimento': return (s.rodadas ?? 1) * FATOR_AQUECIMENTO;
    // Cada vaga do HIIT: 4 rounds de 20 s = 2 séries. O unilateral ocupa 2 vagas, uma por lado: 2 séries por lado.
    case 'hiit': return (e.qtd?.unidade === 'reps' ? e.qtd.n : ROUNDS_HIIT_POR_EXERCICIO) * meio;
    case 'wod': return blocosDoWod(s, movimentos) * (cardio(item) ? FATOR_VOLUME.cardio : FATOR_VOLUME.wod);
    case 'hyrox': {
      const vezes = s.rodadas ?? 1;
      if (item?.hyrox) return vezes * FATOR_VOLUME.estacaoHyrox;
      return vezes * (cardio(item) ? FATOR_VOLUME.cardio : FATOR_VOLUME.wod);
    }
    case 'tabata': return (e.qtd?.unidade === 'reps' ? e.qtd.n : ROUNDS_HIIT_POR_EXERCICIO) * meio;
    case 'gap': return (e.qtd?.unidade === 'reps' ? e.qtd.n : (s.roundsPorMusica ?? ROUNDS_POR_MUSICA)) * meio;
    case 'murph':
      if (e.qtd?.unidade === 'reps') return e.qtd.n / REPS_POR_SERIE;
      if (e.qtd?.unidade === 'km' || e.qtd?.unidade === 'm') return FATOR_VOLUME.cardio * Math.max(1, Math.round(e.qtd.unidade === 'km' ? e.qtd.n : e.qtd.n / 1000));
      return 1;
    default: return 0;
  }
}

/** Tempo de uma seção, em minutos (o escrito; sem número, uma estimativa). @param {Secao} s @param {boolean} ehH */
function minutosDaSecao(s, ehH) {
  if (s.minutos) return s.minutos;
  if (!s.itens.length && !s.musicas.length && !SECOES_SEM_CONTA.includes(s.tipo)) return 0;
  switch (s.tipo) {
    case 'mobilidade': case 'aquecimento': case 'calma': return 5;
    case 'forca': {
      if (!ehH) return 12;
      const series = s.itens.reduce((a, e) => a + (e.series ?? s.series ?? SERIES_POR_EXERCICIO), 0);
      return (series * (SEGUNDOS_POR_SERIE + (s.descansoSeg ?? DESCANSO_PADRAO_SEG))) / 60;
    }
    case 'tabata': return Math.ceil(s.itens.length * ROUNDS_HIIT_POR_EXERCICIO / ROUNDS_POR_MUSICA) * 4;
    case 'hiit': return MUSICAS_POR_ESTACAO * MINUTOS_POR_MUSICA;
    case 'gap': return s.musicas.reduce((a, m) => a + m.n, 0) * 4;
    default: return 0;
  }
}

/** Os itens que contam (fora da preparação), com o exercício principal de cada linha. @param {ColunaLida} c */
const contados = (c) => c.itens.filter((i) => i.conta);

/** @param {ColunaLida} c @param {Problema[]} problemas */
function conferirH(c, problemas) {
  /** @type {Record<string, string[]>} */
  const porPadrao = Object.fromEntries(PADROES_H.map((p) => [p, []]));
  if (c.vazia) {
    problemas.push({ tipo: 'falta', onde: c.onde, texto: `${c.aula}: o quadro ainda está em branco.` });
    return porPadrao;
  }
  const lista = contados(c).filter((i) => i.secao.tipo === 'forca');
  for (const i of lista) {
    const inst = i.item?.instancia;
    if (inst && porPadrao[inst]) porPadrao[inst].push(i.item?.nome ?? i.escrito);
    else if (i.item && !inst) {
      problemas.push({
        tipo: 'info', onde: c.onde, linha: i.linha,
        texto: i.item.acessorio ? `${i.item.nome} é acessório: conta séries e volume, não ocupa padrão.` : `${i.item.nome} não tem vaga de H no catálogo: não conta padrão.`,
      });
    }
  }
  if (lista.length !== EXERCICIOS_POR_BLOCO) {
    problemas.push({
      tipo: 'falta', onde: c.onde,
      texto: `${c.aula}: ${lista.length} de ${EXERCICIOS_POR_BLOCO} exercícios${lista.length > EXERCICIOS_POR_BLOCO ? ' (passou)' : ''}.`,
    });
  }
  const faltam = PADROES_H.filter((p) => !porPadrao[p].length);
  if (faltam.length) problemas.push({ tipo: 'falta', onde: c.onde, texto: `${c.aula}: falta ${faltam.map((p) => NOME_PADRAO_H[p].toLowerCase()).join(', ')}.` });
  for (const p of PADROES_H) {
    if (porPadrao[p].length > 1) problemas.push({ tipo: 'info', onde: c.onde, texto: `${c.aula}: ${porPadrao[p].length} exercícios de ${NOME_PADRAO_H[p].toLowerCase()} (${porPadrao[p].join(', ')}).` });
  }
  const series = lista.reduce((a, i) => a + i.series, 0);
  if (series !== SERIES_POR_SESSAO) {
    problemas.push({ tipo: 'falta', onde: c.onde, texto: `${c.aula}: ${series} de ${SERIES_POR_SESSAO} séries${series > SERIES_POR_SESSAO ? ' (passou)' : ''}.` });
  }
  return porPadrao;
}

/** O WOD de uma coluna metabólica: movimentos, cardio, padrão, tempo. @param {ColunaLida} c @param {Problema[]} problemas */
function conferirWods(c, problemas) {
  for (const s of c.secoes.filter((x) => x.tipo === 'wod')) {
    const nome = `${c.aula}${s.letra ? ` (${s.letra})` : ''}`;
    const movs = c.itens.filter((i) => i.secao === s);
    if (!s.formato) {
      problemas.push({ tipo: 'info', onde: c.onde, linha: s.linha, texto: `${nome}: escreva o formato (AMRAP, EMOM, For Time ou Chipper) para contar o volume.` });
      continue;
    }
    const [min, max] = REGRA_FORMATO[s.formato].movimentos;
    if (movs.length < min || movs.length > max) {
      problemas.push({ tipo: 'falta', onde: c.onde, linha: s.linha, texto: `${nome}: o ${s.formato} tem ${movs.length} movimentos; a regra é ${min === max ? min : `${min} a ${max}`}.` });
    }
    if (movs.length && !movs.some((i) => cardio(i.item))) {
      problemas.push({ tipo: 'falta', onde: c.onde, linha: s.linha, texto: `${nome}: o WOD não tem cardio (corrida, remo, air bike, corda).` });
    }
    /** @type {Record<string, string[]>} */
    const porPadrao = {};
    for (const i of movs) {
      const p = i.item?.cross?.padrao;
      if (p && p !== 'cardio') (porPadrao[p] ??= []).push(i.item?.nome ?? i.escrito);
    }
    for (const [p, nomes] of Object.entries(porPadrao)) {
      if (nomes.length > 1) problemas.push({ tipo: 'repete', onde: c.onde, linha: s.linha, texto: `${nome}: ${nomes.join(' e ')} são do mesmo padrão (${p.replace('_', ' ')}).` });
    }
    if (s.formato !== 'Chipper' && s.formato !== 'For Time' && !s.minutos) {
      problemas.push({ tipo: 'info', onde: c.onde, linha: s.linha, texto: `${nome}: escreva o tempo do ${s.formato} (ex.: 18 min).` });
    } else if (s.minutos && s.minutos > TETO_MINUTOS[s.formato]) {
      problemas.push({ tipo: 'falta', onde: c.onde, linha: s.linha, texto: `${nome}: ${s.minutos} min passa do teto do ${s.formato} (${TETO_MINUTOS[s.formato]} min).` });
    }
  }
}

/** Terça: o Cross não usa Smith nem monocross. @param {ColunaLida} c @param {Problema[]} problemas */
function conferirCross(c, problemas) {
  if (c.vazia) { problemas.push({ tipo: 'falta', onde: c.onde, texto: 'Cross: o quadro ainda está em branco.' }); return; }
  for (const i of c.itens) {
    const proibidos = (i.item?.equipamentos ?? []).filter((e) => FORA_DO_CROSS.includes(e));
    if (proibidos.length) {
      problemas.push({ tipo: 'erro', onde: c.onde, linha: i.linha, texto: `Terça: ${i.item?.nome} usa ${proibidos.map((e) => NOME_RECURSO[e] ?? e).join(' e ')}, que ficam com o H1.` });
    }
  }
  conferirWods(c, problemas);
}

/** Quinta: as 8 estações do Hyrox. @param {ColunaLida} c @param {Indice} indice @param {Problema[]} problemas */
function conferirHyrox(c, indice, problemas) {
  if (c.vazia) { problemas.push({ tipo: 'falta', onde: c.onde, texto: 'Hyrox: o quadro ainda está em branco.' }); return; }
  const feitas = new Set(c.itens.filter((i) => i.item?.estacao).map((i) => i.item?.estacao));
  const faltam = indice.estacoes.filter((e) => !feitas.has(e.estacao));
  if (faltam.length) {
    problemas.push({ tipo: 'falta', onde: c.onde, texto: `Hyrox da quinta: ${feitas.size} de ${indice.estacoes.length} estações; falta ${faltam.map((e) => e.nome.split(/\s[—(]/)[0]).join(', ')}.` });
  }
  conferirWods(c, problemas);
}

/**
 * As vagas de uma estação do HIIT, em ordem: o unilateral ocupa duas seguidas.
 * @param {ColunaLida} c @param {Secao} s @returns {ItemLido[]}
 */
export function vagasDaEstacao(c, s) {
  const itens = c.itens.filter((i) => i.secao === s);
  /** @type {ItemLido[]} */
  const vagas = [];
  for (let k = 0; k < itens.length; k += 1) {
    const i = itens[k];
    if (!i.item?.unilateral) { vagas.push(i); continue; }
    // Escrito duas vezes seguidas ("Afundo reverso" / "Afundo reverso"): é o lado direito e o esquerdo.
    if (itens[k + 1]?.chave === i.chave) { vagas.push(i, itens[k + 1]); k += 1; } else vagas.push(i, i);
  }
  return vagas;
}

/**
 * Sábado: o HIIT da Semana do Box — 4 estações, 4 vagas cada, o TRX numa só.
 * @param {ColunaLida} c @param {Problema[]} problemas
 */
function conferirHiit(c, problemas) {
  if (c.vazia) { problemas.push({ tipo: 'falta', onde: c.onde, texto: 'HIIT: o quadro ainda está em branco.' }); return; }
  const estacoes = c.secoes.filter((s) => s.tipo === 'hiit');
  if (!estacoes.length) {
    problemas.push({ tipo: 'falta', onde: c.onde, texto: 'HIIT: escreva as 4 estações (Pernas, Core, Superiores e Cardio), com 4 vagas cada; o unilateral ocupa 2.' });
    conferirWods(c, problemas);
    return;
  }
  /** @type {Map<string, Secao>} */
  const vistas = new Map();
  for (const s of estacoes) {
    const est = /** @type {string} */ (s.estacao);
    const nome = NOME_ESTACAO_HIIT[est] ?? est;
    if (vistas.has(est)) problemas.push({ tipo: 'info', onde: c.onde, linha: s.linha, texto: `HIIT: a estação ${nome} aparece duas vezes.` });
    vistas.set(est, s);
    const vagas = vagasDaEstacao(c, s).length;
    if (vagas !== SLOTS_POR_ESTACAO) {
      problemas.push({
        tipo: 'falta', onde: c.onde, linha: s.linha,
        texto: `HIIT · ${nome}: ${vagas} de ${SLOTS_POR_ESTACAO} vagas${vagas > SLOTS_POR_ESTACAO ? ' (passou)' : ''}; o unilateral ocupa 2.`,
      });
    }
    for (const i of c.itens.filter((x) => x.secao === s && x.item)) {
      const doCatalogo = i.item?.hiit ?? [];
      if (doCatalogo.length && !doCatalogo.includes(est)) {
        problemas.push({ tipo: 'info', onde: c.onde, linha: i.linha, texto: `${i.item?.nome} é da estação ${doCatalogo.map((x) => NOME_ESTACAO_HIIT[x] ?? x).join(' ou ')} no catálogo, não de ${nome}.` });
      }
    }
  }
  const faltam = ESTACOES_HIIT.filter((e) => !vistas.has(e));
  if (faltam.length) problemas.push({ tipo: 'falta', onde: c.onde, texto: `HIIT: falta a estação ${faltam.map((e) => NOME_ESTACAO_HIIT[e]).join(', ')}.` });
  for (const r of RECURSOS_FIXOS_HIIT) {
    const com = [...new Set(estacoes.filter((s) => c.itens.some((i) => i.secao === s && consumoDoItem(i.item)[r])).map((s) => NOME_ESTACAO_HIIT[s.estacao ?? ''] ?? s.estacao))];
    if (com.length > 1) {
      problemas.push({ tipo: 'erro', onde: c.onde, texto: `HIIT: o ${NOME_RECURSO[r] ?? r} está em ${com.join(' e ')}; ele fica ancorado num canto e serve a uma estação só.` });
    }
  }
  const soltos = c.itens.filter((i) => i.conta && i.secao.tipo !== 'hiit' && i.secao.tipo !== 'aquecimento');
  if (soltos.length) problemas.push({ tipo: 'info', onde: c.onde, linha: soltos[0].linha, texto: `HIIT: ${soltos.map((i) => i.item?.nome ?? i.escrito).join(', ')} fora de uma estação.` });
}

/** O H2 também é dado na quinta, ao lado do Hyrox. @param {ColunaLida} c @param {Problema[]} problemas */
function conferirQuinta(c, problemas) {
  const lista = contados(c);
  const smith = lista.filter((i) => i.item?.equipamentos?.includes('smith'));
  if (smith.length > SMITH_NO_H2_DA_QUINTA) {
    problemas.push({ tipo: 'erro', onde: c.onde, texto: `Quinta: o H2 tem ${smith.length} exercícios no Smith (${smith.map((i) => i.item?.nome).join(', ')}); ao lado do Hyrox cabe ${SMITH_NO_H2_DA_QUINTA}.` });
  }
  for (const i of lista) {
    const eq = i.item?.equipamentos ?? [];
    if (eq.includes('monocross')) {
      problemas.push({ tipo: 'erro', onde: c.onde, linha: i.linha, texto: `Quinta: ${i.item?.nome} usa monocross, e o Hyrox fica com os 2.` });
      continue;
    }
    if (eq.includes('barra')) {
      problemas.push({ tipo: 'info', onde: c.onde, linha: i.linha, texto: `Quinta: ${i.item?.nome} — use a barra de 1,5 m (a de 2 m ocupa muito espaço ao lado do Hyrox).` });
    }
    const fora = eq.filter((e) => !CABE_NO_H2_DA_QUINTA.includes(e) && e !== 'monocross');
    if (fora.length) {
      problemas.push({ tipo: 'info', onde: c.onde, linha: i.linha, texto: `Quinta: ${i.item?.nome} usa ${fora.join(', ')}, fora do que cabe no espaço do H2 (Smith, barra 1,5 m, halteres, kettlebell, banco).` });
    }
  }
}

/** @param {Record<string, ColunaLida>} colunas @param {Problema[]} problemas @param {any} anterior @param {Indice} indice @param {Record<string, string>} apelidos */
function conferirRepeticoes(colunas, problemas, anterior, indice, apelidos) {
  /** @type {Map<string, {c: ColunaLida, i: ItemLido}[]>} */
  const onde = new Map();
  for (const c of Object.values(colunas)) {
    /** @type {Map<string, ItemLido>} */
    const vistos = new Map();
    for (const i of contados(c)) {
      const antes = vistos.get(i.chave);
      if (antes) {
        // Ensaiar no aquecimento o movimento do WOD não é repetir; o mesmo exercício duas vezes na aula é.
        const daMesmaLinha = antes.linha === i.linha;
        // No HIIT, o unilateral escrito duas vezes na mesma estação é o outro lado.
        const outroLado = antes.secao === i.secao && i.secao.tipo === 'hiit' && !!i.item?.unilateral;
        if (!daMesmaLinha && !outroLado && antes.secao.tipo !== 'aquecimento' && i.secao.tipo !== 'aquecimento') {
          problemas.push({ tipo: 'repete', onde: c.onde, linha: i.linha, texto: `${c.aula}: ${i.item?.nome ?? i.escrito} aparece duas vezes.` });
        }
        continue;
      }
      vistos.set(i.chave, i);
      const l = onde.get(i.chave) ?? [];
      l.push({ c, i });
      onde.set(i.chave, l);
    }
  }
  for (const lista of onde.values()) {
    if (lista.length < 2) continue;
    // Fora do catálogo, o nome escrito pode variar ("Stiff" e "Stiff barra"): mostra os dois.
    const nome = [...new Set(lista.map((x) => x.i.item?.nome ?? x.i.escrito))].join(' / ');
    const aulas = lista.map((x) => `${x.c.aula} (${x.c.dias.map((d) => NOME_DIA[d].toLowerCase()).join(' e ')})`);
    const soH = lista.every((x) => x.c.onde.endsWith('.h'));
    const texto = soH
      ? `${nome} está em ${aulas.join(' e ')}: o mesmo exercício não se repete na semana.`
      : `${nome} está em ${aulas.join(' e ')}: quem faz as duas aulas repete o exercício na semana.`;
    for (const x of lista) problemas.push({ tipo: 'repete', onde: x.c.onde, linha: x.i.linha, texto });
  }
  if (!anterior?.quadros) return;
  for (const q of QUADROS) {
    const antes = new Set();
    for (const [lado, txt] of [['h', anterior.quadros[q.id]?.h], ['m', anterior.quadros[q.id]?.metabolico]]) {
      if (!txt) continue;
      const tipo = lado === 'h' ? 'forca' : ({ Cross: 'wod', Hyrox: 'hyrox', HIIT: 'tabata' }[q.metabolico] ?? 'wod');
      for (const s of lerColuna(txt, tipo).secoes) {
        if (SECOES_SEM_CONTA.includes(s.tipo) || s.tipo === 'aquecimento') continue;
        for (const e of s.itens) {
          const l = lerNome(e.escrito, indice, apelidos, { hyrox: s.tipo === 'hyrox' });
          if (l.id) antes.add(`${lado}:${l.id}`);
        }
      }
    }
    for (const lado of ['h', 'm']) {
      const c = colunas[`${q.id}.${lado}`];
      if (c.aula === 'Hyrox') continue; // a prova repete as estações de propósito
      for (const i of contados(c).filter((x) => x.secao.tipo !== 'aquecimento')) {
        if (i.item && antes.has(`${lado}:${i.item.id}`)) {
          problemas.push({ tipo: 'info', onde: c.onde, linha: i.linha, texto: `${c.aula}: ${i.item.nome} repete a semana passada.` });
        }
      }
    }
  }
}

/* ───────────────────────────── equipamento ───────────────────────────── */

/** Os limites ativos do inventário gravado (total − manutenção), ou os de fábrica. @param {any} doc */
export function limitesDoInventario(doc) {
  /** @type {Record<string, number>} */
  const limites = { ...INVENTARIO_PADRAO };
  const ativos = doc?.limitesAtivos;
  const equip = doc?.equipamentos;
  for (const r of Object.keys(INVENTARIO_PADRAO)) {
    if (Number.isFinite(ativos?.[r])) limites[r] = ativos[r];
    else if (Number.isFinite(equip?.[r]?.total)) limites[r] = equip[r].total - (Number(equip[r].emManutencao) || 0);
  }
  return limites;
}

/** Unidades de cada recurso que um aluno (ou uma estação) usa. @param {ItemQuadro|null} it */
export function consumoDoItem(it) {
  /** @type {Record<string, number>} */
  const c = {};
  if (!it) return c;
  if (it.hyrox) return { ...(it.recursos ?? {}) };
  for (const e of it.equipamentos ?? []) {
    const r = RECURSO_DO_EQUIPAMENTO[e];
    if (r) c[r] = 1;
  }
  return c;
}

/** @param {Record<string, number>} a @param {Record<string, number>} b @param {'soma'|'max'} modo */
function juntar(a, b, modo) {
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = modo === 'soma' ? (r[k] ?? 0) + v : Math.max(r[k] ?? 0, v);
  return r;
}
/** @param {Record<string, number>} c @param {number} n */
const vezes = (c, n) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v * n]));

/**
 * O que o H ocupa: uma estação por exercício, montada a aula toda (os aparelhos
 * ficam com o H mesmo quando poucos alunos fazem o H).
 * @param {ColunaLida} c
 */
export function consumoDoH(c) {
  /** @type {Record<string, number>} */
  let total = {};
  for (const i of contados(c).filter((x) => x.secao.tipo !== 'aquecimento')) total = juntar(total, consumoDoItem(i.item), 'soma');
  return total;
}

/**
 * O pico do metabólico com `n` alunos. As seções vêm uma depois da outra (não
 * somam); dentro de cada uma, a regra da Semana do Box:
 *  - WOD escalonado (AMRAP, For Time, Chipper) e Tabata: a turma se espalha,
 *    n ÷ movimentos (para cima) em cada um, e os movimentos somam;
 *  - EMOM, aquecimento, GAP, Murph: todos no mesmo movimento ao mesmo tempo;
 *  - força: duplas revezando (n ÷ 2, para cima), cada linha do quadro com o
 *    maior consumo dos exercícios dela;
 *  - Hyrox: cada estação montada com o que ela pede;
 *  - HIIT: as 4 estações rodam juntas, com n ÷ 4 alunos (para cima) em cada;
 *    na vaga N toda estação está no mesmo exercício da sua fila, então a vaga
 *    N das 4 estações soma (`contarHiit`).
 * @param {ColunaLida} c @param {number} n
 */
export function consumoDoMetabolico(c, n) {
  /** @type {Record<string, number>} */
  let pico = {};
  const estacoes = c.secoes.filter((s) => s.tipo === 'hiit');
  if (estacoes.length) {
    // A turma do HIIT se divide pelas estações escritas (até as 4).
    const porEstacao = Math.max(1, Math.ceil(n / Math.min(ESTACOES_HIIT.length, estacoes.length)));
    const filas = estacoes.map((s) => vagasDaEstacao(c, s).filter((i) => i.leitura.como !== 'fora'));
    const vagas = Math.max(SLOTS_POR_ESTACAO, ...filas.map((f) => f.length));
    for (let k = 0; k < vagas; k += 1) {
      /** @type {Record<string, number>} */
      let naVaga = {};
      for (const f of filas) if (f[k]) naVaga = juntar(naVaga, vezes(consumoDoItem(f[k].item), porEstacao), 'soma');
      pico = juntar(pico, naVaga, 'max');
    }
  }
  for (const s of c.secoes) {
    if (s.tipo === 'hiit') continue;
    const itens = c.itens.filter((i) => i.secao === s && i.leitura.como !== 'fora');
    if (!itens.length) continue;
    /** @type {Record<string, number>} */
    let sec = {};
    if (s.tipo === 'hyrox') {
      const porMov = Math.ceil(n / Math.max(1, itens.length));
      /** @type {Record<string, number>} */
      const doGrupo = {};
      for (const i of itens) {
        const c = i.item?.hyrox ? consumoDoItem(i.item) : vezes(consumoDoItem(i.item), porMov);
        for (const [r, v] of Object.entries(c)) {
          // Sled Push e Sled Pull: o mesmo trenó, uma unidade para as duas estações.
          if (i.item?.hyrox && MESMO_APARELHO_HYROX[r]?.includes(i.item.estacao ?? '')) doGrupo[r] = Math.max(doGrupo[r] ?? 0, v);
          else sec[r] = (sec[r] ?? 0) + v;
        }
      }
      sec = juntar(sec, doGrupo, 'soma');
    } else if ((s.tipo === 'wod' && REGRA_FORMATO[s.formato ?? 'AMRAP']?.escalonado !== false) || s.tipo === 'tabata') {
      const porMov = Math.ceil(n / Math.max(1, itens.length));
      for (const i of itens) sec = juntar(sec, vezes(consumoDoItem(i.item), porMov), 'soma');
    } else if (s.tipo === 'forca') {
      const duplas = Math.ceil(n / ALUNOS_POR_EQUIPAMENTO_TECNICA);
      /** @type {Map<number, Record<string, number>>} */
      const porLinha = new Map();
      for (const i of itens) porLinha.set(i.grupoLinha, juntar(porLinha.get(i.grupoLinha) ?? {}, consumoDoItem(i.item), 'max'));
      for (const c1 of porLinha.values()) sec = juntar(sec, vezes(c1, duplas), 'max');
    } else {
      for (const i of itens) sec = juntar(sec, vezes(consumoDoItem(i.item), n), 'max');
    }
    pico = juntar(pico, sec, 'max');
  }
  return pico;
}

/**
 * Cada dia: o H (e o metabólico, quando tem) contra o inventário, em cada divisão
 * da turma de 6. `cabeAte` é o maior número de alunos no metabólico que cabe com o H.
 *
 * Adaptação (decisão do coach, 07/11/2026): o coach marca o dia como adaptado
 * para os recursos que faltavam ("banco substituído por caixa"). Esses recursos
 * saem da conta do dia e o aviso vira informativo; falta de OUTRO recurso
 * continua vermelha.
 * @param {Record<string, ColunaLida>} colunas @param {Record<string, number>} limites @param {Problema[]} problemas
 * @param {Record<string, Adaptacao>} [adaptacoes]
 */
function conferirEquipamento(colunas, limites, problemas, adaptacoes = {}) {
  /** @type {{dia: string, aulas: string[], cabeAte: number|null, faltas: {recurso: string, precisa: number, tem: number}[], consumoH: Record<string, number>, adaptado: Adaptacao|null}[]} */
  const dias = [];
  for (const q of QUADROS) {
    const h = colunas[`${q.id}.h`];
    const m = colunas[`${q.id}.m`];
    const consumoH = consumoDoH(h);
    // Os recursos que a regra do dia já cobra com texto próprio não aparecem de novo aqui.
    const jaCobrado = new Set(
      q.metabolico === 'Cross' ? FORA_DO_CROSS.filter((r) => m.itens.some((i) => i.item?.equipamentos?.includes(r)))
        : q.metabolico === 'Hyrox' && contados(h).some((i) => i.item?.equipamentos?.includes('monocross')) ? ['monocross'] : [],
    );
    for (const dia of q.dias) {
      const comMetabolico = dia === q.diaMetabolico && !m.vazia;
      const adaptacao = adaptacoes[dia]?.recursos?.length ? adaptacoes[dia] : null;
      const adaptados = new Set(adaptacao?.recursos ?? []);
      /** @param {number} n @param {boolean} [comAdaptados] */
      const faltasCom = (n, comAdaptados = false) => {
        const total = comMetabolico ? juntar(consumoH, consumoDoMetabolico(m, n), 'soma') : consumoH;
        return Object.entries(total)
          .filter(([r, v]) => v > (limites[r] ?? 0) && !(comMetabolico && jaCobrado.has(r)) && (comAdaptados || !adaptados.has(r)))
          .map(([r, v]) => ({ recurso: r, precisa: v, tem: limites[r] ?? 0 }));
      };
      // O dia só fica "adaptado" se ainda faltaria um dos recursos adaptados (com a turma cheia no metabólico).
      const nCheio = comMetabolico ? ALUNOS_POR_HORA - 1 : 0;
      const usada = adaptacao && faltasCom(nCheio, true).some((f) => adaptados.has(f.recurso)) ? adaptacao : null;
      const onde = comMetabolico ? m.onde : h.onde;
      if (usada) problemas.push({ tipo: 'info', onde, texto: `${NOME_DIA[dia]}: adaptado — ${usada.texto}` });
      if (!comMetabolico) {
        const faltas = h.vazia ? [] : faltasCom(0);
        for (const f of faltas) {
          problemas.push({ tipo: 'erro', onde: h.onde, texto: `${NOME_DIA[dia]}: o ${h.aula} precisa de ${f.precisa} ${NOME_RECURSO[f.recurso] ?? f.recurso}, e o box tem ${f.tem}.` });
        }
        dias.push({ dia, aulas: [h.aula], cabeAte: null, faltas, consumoH, adaptado: usada });
        continue;
      }
      let cabeAte = 0;
      /** @type {{recurso: string, precisa: number, tem: number}[]} */
      let primeiraFalta = [];
      for (let n = 1; n < ALUNOS_POR_HORA; n += 1) {
        const f = faltasCom(n);
        if (f.length) { primeiraFalta = f; break; }
        cabeAte = n;
      }
      const lado = `${m.aula} com o ${h.aula}`;
      if (primeiraFalta.length) {
        const falta = primeiraFalta.map((f) => `${f.precisa - f.tem} ${NOME_RECURSO[f.recurso] ?? f.recurso}`).join(', ');
        problemas.push({
          tipo: 'erro', onde: m.onde,
          texto: cabeAte === 0
            ? `${NOME_DIA[dia]}: o ${lado} não cabe nem com 1 aluno no ${m.aula} (falta ${falta}).`
            : `${NOME_DIA[dia]}: cabe até ${cabeAte} aluno${cabeAte > 1 ? 's' : ''} no ${m.aula} ao lado do ${h.aula}; com ${cabeAte + 1}, falta ${falta}.`,
        });
      }
      dias.push({ dia, aulas: [h.aula, m.aula], cabeAte, faltas: primeiraFalta, consumoH, adaptado: usada });
    }
  }
  return dias;
}

/* ───────────────────────────── o caminho do aluno ───────────────────────────── */

/** As aulas de cada dia, para montar o caminho do aluno. */
export function aulasDoDia(/** @type {string} */ dia) {
  const q = QUADROS.find((x) => /** @type {readonly string[]} */ (x.dias).includes(dia));
  if (!q) return [];
  return dia === q.diaMetabolico ? [`${q.id}.h`, `${q.id}.m`] : [`${q.id}.h`];
}

/** Caminhos prontos: o que a maioria dos alunos faz. */
export const CAMINHOS = [
  { id: 'alterna', nome: '6× alternando', aulas: { segunda: 'q1.h', terca: 'q1.m', quarta: 'q2.h', quinta: 'q2.m', sexta: 'q3.h', sabado: 'q3.m' } },
  { id: 'soH', nome: '3× só H', aulas: { segunda: 'q1.h', quarta: 'q2.h', sexta: 'q3.h' } },
  { id: 'soMetabolico', nome: '3× só metabólico', aulas: { terca: 'q1.m', quinta: 'q2.m', sabado: 'q3.m' } },
];

/**
 * O volume da semana de um aluno que faz estas aulas (`dia → coluna`).
 * @param {ReturnType<typeof conferirSemana>} conf @param {Record<string, string>} aulas @param {boolean} [comExtra]
 */
export function volumeDoCaminho(conf, aulas, comExtra = false) {
  /** @type {Record<string, number>} */
  const v = {};
  const lista = Object.values(aulas).filter(Boolean);
  if (comExtra && conf.colunas.extra) lista.push('extra');
  for (const k of lista) {
    for (const [m, n] of Object.entries(conf.colunas[k]?.volume ?? {})) v[m] = (v[m] ?? 0) + n;
  }
  return v;
}

/** Os números que fecham a semana: os 3 H contra 7 × 3. @param {ReturnType<typeof conferirSemana>} conf */
export function metasDaSemana(conf) {
  return QUADROS.map((q) => {
    const c = conf.colunas[`${q.id}.h`];
    const lista = contados(c).filter((i) => i.secao.tipo === 'forca');
    const padroes = PADROES_H.filter((p) => conf.padroesH[q.h][p].length).length;
    return {
      aula: q.h, exercicios: lista.length, series: lista.reduce((a, i) => a + i.series, 0), padroes,
      metaExercicios: EXERCICIOS_POR_BLOCO, metaSeries: SERIES_POR_SESSAO, metaPadroes: PADROES_H.length,
    };
  });
}
