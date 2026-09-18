/**
 * DISTRIBUIÇÃO PARA A TURMA — parte pura, sem rede e sem Firebase.
 *
 * A aula é coletiva e o treino é UM, mas a ficha que cada aluno recebe é dele.
 * Este módulo é a conta que transforma o treino da lousa na versão de cada um
 * dos até 8 alunos, a partir da MATRIZ DE INDIVIDUALIZAÇÃO.
 *
 * ── A matriz é a de `compartilhado/regras/matriz-individualizacao.js` ─────────
 * Este arquivo foi reescrito para ler exatamente a ficha que o coach já edita na
 * Gestão de Alunos: o campo `matrizIndividualizacao` DENTRO do documento do
 * aluno, não uma coleção separada. A primeira versão daqui inventava um formato
 * próprio (lista de substituições exercício-a-exercício e um mapa livre de 1RM)
 * porque a matriz real ainda não existia no repositório. Ela existe, é melhor, e
 * é ela que manda:
 *
 *   - LESÃO é REGIÃO + GRAVIDADE, não uma tabela de trocas por exercício. A
 *     tabela exigiria o coach prever cada exercício que pode cair no dia — ele
 *     nunca preencheria, e o que não se preenche não protege ninguém.
 *   - O que o computador executa são as três REGRAS declarativas: `impacto`,
 *     `tracao` e `mobilidade`. A lista de lesões acompanha a ficha como
 *     contexto para o coach ler, e é assim que `resumoDeAdaptacoes` a trata.
 *   - CARGA sai de TRÊS levantamentos de referência (agachamento, supino,
 *     terra) com 1RM medido ou estimado por Epley — não de um mapa livre
 *     exercício→kg, que o coach também nunca manteria atualizado.
 *
 * ── Por que as constantes estão COPIADAS aqui ────────────────────────────────
 * `functions/` é um pacote TypeScript separado que roda no servidor; o site é
 * servido estático. Não há import entre os dois (mesma restrição que o cabeçalho
 * de `pesquisa.ts` documenta em detalhe). Então os vocabulários e as duas contas
 * de carga são cópias de `compartilhado/regras/matriz-individualizacao.js`, e
 * `checar.ts` compara as duas para que a divergência apareça no CI.
 */
import { BLOCOS, normalizar, type BlocoId, type ExercicioLousa, type Sistema, type TreinoEstruturado } from './lousa';

/** Teto de alunos por turma — o mesmo `ALUNOS_POR_SESSAO` de `compartilhado/dados/equipamentos.js`. */
export const ALUNOS_POR_TURMA = 8;

/** O campo da matriz dentro do documento do aluno — `CAMPO` na fonte. */
export const CAMPO_MATRIZ = 'matrizIndividualizacao';

/** Incremento mínimo de carga: o par de anilhas mais leve do box. */
const PASSO_KG = 2.5;

/* ------------------------------------------------------------------ *
 * Vocabulários — cópias de compartilhado/regras/matriz-individualizacao.js
 * ------------------------------------------------------------------ */

export const NIVEIS = ['iniciante', 'intermediario', 'avancado'] as const;
export const FASES = ['forca', 'hipertrofia', 'condicionamento', 'resistencia', 'manutencao'] as const;
export const LEVANTAMENTOS = ['agachamento', 'supino', 'terra'] as const;
export const ZONAS_RIR = ['0-1', '1-2', '2-3', '3-4'] as const;
export const REGRAS_IMPACTO = ['livre', 'reduzir', 'converter_airbike'] as const;
export const REGRAS_TRACAO = ['barra', 'barra_assistida', 'puxada_alta'] as const;
export const REGIOES_LESAO = [
  'ombro', 'lombar', 'joelho', 'cervical', 'quadril', 'cotovelo', 'punho', 'tornozelo',
] as const;
export const GRAVIDADES = ['leve', 'moderada', 'severa'] as const;
export const RESTRICOES_MOBILIDADE = [
  'ombro_overhead', 'toracica', 'quadril', 'tornozelo', 'punho',
] as const;

export type Nivel = (typeof NIVEIS)[number];
export type Fase = (typeof FASES)[number];
export type Levantamento = (typeof LEVANTAMENTOS)[number];
export type RegraImpacto = (typeof REGRAS_IMPACTO)[number];
export type RegraTracao = (typeof REGRAS_TRACAO)[number];

/** Rótulo legível de cada regra, para o aviso que o coach lê na prévia. */
const ROTULO_IMPACTO: Record<RegraImpacto, string> = {
  livre: 'Faz impacto normalmente',
  reduzir: 'Reduzir impacto (sem salto; corrida leve)',
  converter_airbike: 'Converter impacto para Airbike',
};
const ROTULO_TRACAO: Record<RegraTracao, string> = {
  barra: 'Faz barra suspensa',
  barra_assistida: 'Barra assistida (elástico)',
  puxada_alta: 'Adaptar para puxada alta',
};
const ROTULO_MOBILIDADE: Record<string, string> = {
  ombro_overhead: 'Ombro · overhead',
  toracica: 'Torácica · rotação',
  quadril: 'Quadril · profundidade',
  tornozelo: 'Tornozelo · agachamento profundo',
  punho: 'Punho · front squat / apoio',
};

/* ------------------------------------------------------------------ *
 * As duas contas de carga — cópias da fonte
 * ------------------------------------------------------------------ */

/** Número finito e positivo, ou `null`. Vírgula decimal é aceita, como na fonte. */
function num(v: unknown): number | null {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 1RM estimado por Epley: kg × (1 + reps/30). Mesma escolha da fonte — o teste
 * do box é submáximo de 3 a 8 repetições, faixa em que Epley e Brzycki
 * praticamente coincidem, com a vantagem de Epley não despencar em 15 reps.
 */
export function e1rm(kg: unknown, reps: unknown): number | null {
  const p = num(kg);
  const r = num(reps);
  if (!p || !r) return null;
  if (r === 1) return Math.round(p * 2) / 2;
  return Math.round(p * (1 + r / 30) * 2) / 2;
}

/** Carga de trabalho para um percentual do 1RM, arredondada ao que dá para montar na barra. */
export function cargaDe1RM(rm: unknown, pct: unknown): number | null {
  const m = num(rm);
  const p = num(pct);
  if (!m || !p) return null;
  return Math.round((m * p) / 100 / PASSO_KG) * PASSO_KG;
}

/* ------------------------------------------------------------------ *
 * A matriz, como o servidor a lê
 * ------------------------------------------------------------------ */

export type Referencia1RM = {
  kg: number | null;
  reps: number | null;
  rm: number | null;
  /** A máxima medida, ou a estimada. Derivado — nunca gravado, sempre recalculado. */
  rmEfetivo: number | null;
  medidoEm: string;
};

export type Lesao = {
  regiao: string;
  gravidade: string;
  desde: string;
  obs: string;
};

export type MatrizAluno = {
  alunoId: string;
  nome: string;
  email: string;
  nivel: Nivel | '';
  objetivo: string;
  fase: Fase | '';
  freqVezes: string;
  referencia: Record<string, Referencia1RM>;
  rir: string;
  lesoes: Lesao[];
  impacto: RegraImpacto;
  tracao: RegraTracao;
  mobilidade: string[];
  obsAdaptacoes: string;
};

const naLista = <T extends string>(lista: readonly T[], v: unknown, padrao: T | '' = ''): T | '' =>
  (lista as readonly string[]).includes(String(v)) ? (v as T) : padrao;

const texto = (v: unknown, max = 240): string => (typeof v === 'string' ? v : '').trim().slice(0, max);

/** Uma matriz em branco — aluno sem ficha preenchida, que hoje é a maioria. */
export function matrizPadrao(alunoId: string, nome = '', email = ''): MatrizAluno {
  const referencia: Record<string, Referencia1RM> = {};
  for (const id of LEVANTAMENTOS) referencia[id] = { kg: null, reps: null, rm: null, rmEfetivo: null, medidoEm: '' };
  return {
    alunoId, nome: nome || alunoId, email, nivel: '', objetivo: '', fase: '', freqVezes: '',
    referencia, rir: '', lesoes: [], impacto: 'livre', tracao: 'barra', mobilidade: [], obsAdaptacoes: '',
  };
}

/**
 * Lê a ficha do aluno da Gestão e devolve a matriz achatada.
 *
 * Espelha `matrizDe()` da fonte, inclusive na parte que mais importa: os campos
 * do TOPO da ficha (nível, objetivo, frequência) são lidos do topo, não de
 * dentro da matriz — é lá que o coach os edita e é lá que o resto do sistema já
 * os lê. E `rmEfetivo` é sempre RECALCULADO aqui: gravado, ele congelaria no
 * primeiro teste e a carga do aluno pararia no tempo.
 *
 * Nunca devolve `undefined` em campo nenhum. Ficha antiga sai daqui com a matriz
 * inteira em branco, e branco quer dizer "sem adaptação", nunca erro.
 */
export function lerMatriz(alunoDaGestao: unknown, alunoId: string): MatrizAluno {
  const a = (alunoDaGestao && typeof alunoDaGestao === 'object' ? alunoDaGestao : {}) as Record<string, unknown>;
  const m = (a[CAMPO_MATRIZ] && typeof a[CAMPO_MATRIZ] === 'object' ? a[CAMPO_MATRIZ] : {}) as Record<string, unknown>;
  const cargas = (m.cargas && typeof m.cargas === 'object' ? m.cargas : {}) as Record<string, unknown>;
  const adapt = (m.adaptacoes && typeof m.adaptacoes === 'object' ? m.adaptacoes : {}) as Record<string, unknown>;
  const refBruta = (cargas.referencia && typeof cargas.referencia === 'object' ? cargas.referencia : {}) as Record<string, unknown>;

  const referencia: Record<string, Referencia1RM> = {};
  for (const id of LEVANTAMENTOS) {
    const r = (refBruta[id] && typeof refBruta[id] === 'object' ? refBruta[id] : {}) as Record<string, unknown>;
    const kg = num(r.kg);
    const reps = num(r.reps);
    const rm = num(r.rm);
    referencia[id] = { kg, reps, rm, rmEfetivo: rm ?? e1rm(kg, reps), medidoEm: texto(r.medidoEm, 10) };
  }

  const lesoes: Lesao[] = (Array.isArray(adapt.lesoes) ? adapt.lesoes : []).flatMap((l): Lesao[] => {
    const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
    const regiao = naLista(REGIOES_LESAO, o.regiao);
    if (!regiao) return [];
    return [{
      regiao,
      gravidade: naLista(GRAVIDADES, o.gravidade, 'leve'),
      desde: texto(o.desde, 10),
      obs: texto(o.obs),
    }];
  });

  const perfil = (m.perfil && typeof m.perfil === 'object' ? m.perfil : {}) as Record<string, unknown>;

  return {
    alunoId,
    nome: texto(a.nome, 120) || alunoId,
    email: texto(a.email, 160).toLowerCase(),
    nivel: naLista(NIVEIS, a.nivel),
    objetivo: texto(a.objetivo, 60),
    fase: naLista(FASES, perfil.fase),
    freqVezes: texto(a.freqVezes, 10),
    referencia,
    rir: naLista(ZONAS_RIR, cargas.rir),
    lesoes,
    impacto: naLista(REGRAS_IMPACTO, adapt.impacto, 'livre') as RegraImpacto,
    tracao: naLista(REGRAS_TRACAO, adapt.tracao, 'barra') as RegraTracao,
    mobilidade: (Array.isArray(adapt.mobilidade) ? adapt.mobilidade : [])
      .filter((k): k is string => typeof k === 'string' && (RESTRICOES_MOBILIDADE as readonly string[]).includes(k)),
    obsAdaptacoes: texto(adapt.obs),
  };
}

/* ------------------------------------------------------------------ *
 * Do exercício da lousa para o levantamento de referência
 * ------------------------------------------------------------------ */

/**
 * Os termos que ligam um exercício escrito na lousa a um dos três levantamentos.
 *
 * Deliberadamente curto e literal. A tentação é mapear meio catálogo aqui
 * ("leg press puxa de agachamento", "crucifixo puxa de supino"), mas o 1RM de
 * agachamento NÃO prevê a carga de leg press — a alavanca é outra — e o número
 * sairia preciso e errado. Exercício que não casa com nenhum termo simplesmente
 * não recebe kg, e a ficha mostra a orientação da lousa. É a mesma escolha que
 * `cargaDeTrabalho` faz para o aluno sem 1RM.
 */
const TERMOS_LEVANTAMENTO: Record<Levantamento, string[]> = {
  agachamento: ['agachamento', 'agacho', 'squat'],
  supino: ['supino', 'bench press', 'bench'],
  terra: ['levantamento terra', 'terra', 'deadlift', 'stiff'],
};

/** O levantamento de referência de um exercício, ou `null`. */
export function levantamentoDe(nomeExercicio: string): Levantamento | null {
  const n = normalizar(nomeExercicio);
  if (!n) return null;
  for (const id of LEVANTAMENTOS) {
    if (TERMOS_LEVANTAMENTO[id].some((t) => n.includes(t))) return id;
  }
  return null;
}

/**
 * Percentual-base do 1RM por bloco, em cada sistema — a parte da AULA.
 *
 * Mobilidade (A) e aquecimento (B) não aparecem: não se baliza carga de
 * alongamento, e inventar 30% de 1RM para uma ativação daria um número preciso e
 * errado. Força (C) e Metcon (D) aparecem porque é neles que o coach escreve
 * carga na lousa — e o metcon é sempre mais leve que a força no MESMO sistema,
 * porque lá a carga concorre com o relógio.
 */
export const PERCENTUAL_POR_BLOCO: Record<Sistema, Partial<Record<BlocoId, number>>> = {
  Hipertrofia: { C: 70, D: 50 },
  Hyrox: { C: 65, D: 45 },
  HIIT: { C: 55, D: 40 },
  GAP: { C: 50, D: 35 },
};

/**
 * Ajuste pela FASE do aluno — o bloco em que ELE está agora, que é diferente do
 * objetivo dele e diferente do sistema da aula (ver "Objetivo x fase" na fonte).
 * Quem está num bloco de força puxa mais pesado na mesma aula que quem está em
 * manutenção.
 */
export const FATOR_FASE: Record<string, number> = {
  forca: 1.10,
  hipertrofia: 1.0,
  condicionamento: 0.90,
  resistencia: 0.85,
  manutencao: 0.90,
};

/**
 * Ajuste pelo NÍVEL. Iniciante desce porque a técnica ainda está sendo
 * construída e o 1RM dele é, na prática, uma estimativa; avançado sobe pouco, de
 * propósito — 5% é o que cabe sem transformar a aula coletiva em prescrição de
 * atleta.
 */
export const FATOR_NIVEL: Record<string, number> = {
  iniciante: 0.90,
  intermediario: 1.0,
  avancado: 1.05,
};

/**
 * Teto e piso do percentual final.
 *
 * Fase e nível são dois multiplicadores, e dois multiplicadores se compõem:
 * iniciante (0,90) em resistência (0,85) sobre 70% daria 53%, e avançado (1,05)
 * em força (1,10) daria 81%. O piso e o teto existem para que a composição nunca
 * saia dessa faixa — 90% do 1RM numa aula de oito pessoas não é prescrição, é
 * acidente esperando acontecer.
 */
export const PCT_MIN = 30;
export const PCT_MAX = 85;

/**
 * A carga de trabalho do aluno naquela linha, ou `null`.
 *
 * `null` é resposta legítima e comum: aluno novo não tem 1RM, mobilidade não tem
 * carga, metade do metcon é peso corporal e a maioria dos exercícios não é um
 * dos três levantamentos de referência. A ficha mostra a orientação da lousa
 * nesses casos — o que NÃO pode acontecer é aparecer um número tirado de
 * estimativa, porque o aluno confia no número impresso.
 */
export function cargaDeTrabalho(
  matriz: MatrizAluno,
  nomeExercicio: string,
  sistema: Sistema,
  bloco: BlocoId,
): { cargaKg: number | null; percentual: number | null; levantamento: Levantamento | null } {
  const vazio = { cargaKg: null, percentual: null, levantamento: null };
  const base = PERCENTUAL_POR_BLOCO[sistema]?.[bloco];
  if (!base) return vazio;

  const levantamento = levantamentoDe(nomeExercicio);
  if (!levantamento) return vazio;

  const rm = matriz.referencia[levantamento]?.rmEfetivo;
  if (!rm) return { ...vazio, levantamento };

  const bruto = base * (FATOR_FASE[matriz.fase] ?? 1) * (FATOR_NIVEL[matriz.nivel] ?? 1);
  const percentual = Math.round(Math.min(PCT_MAX, Math.max(PCT_MIN, bruto)));
  const cargaKg = cargaDe1RM(rm, percentual);
  return cargaKg ? { cargaKg, percentual, levantamento } : { ...vazio, levantamento };
}

/* ------------------------------------------------------------------ *
 * As três regras de adaptação
 * ------------------------------------------------------------------ */

/** Movimentos de impacto — salto, corrida e afins. */
const TERMOS_IMPACTO = [
  'burpee', 'salto', 'saltos', 'pular', 'pulo', 'jump', 'box jump', 'corda',
  'corrida', 'sprint', 'polichinelo', 'skipping', 'tuck jump', 'agachamento com salto',
];
/** Movimentos de tração vertical. */
const TERMOS_TRACAO = ['barra fixa', 'pull up', 'pullup', 'puxada', 'chin up', 'muscle up'];
/** Movimentos que cada restrição de mobilidade toca. */
const TERMOS_MOBILIDADE: Record<string, string[]> = {
  ombro_overhead: ['desenvolvimento', 'overhead', 'arranco', 'snatch', 'push press', 'thruster', 'elevacao acima'],
  toracica: ['rotacao', 'russian twist', 'lenhador', 'giro'],
  quadril: ['agachamento', 'agacho', 'squat', 'afundo', 'avanco'],
  tornozelo: ['agachamento profundo', 'agachamento', 'squat', 'pistol'],
  punho: ['front squat', 'apoio', 'flexao', 'burpee', 'prancha'],
};

const casa = (nome: string, termos: string[]): boolean => {
  const n = normalizar(nome);
  return !!n && termos.some((t) => n.includes(t));
};

export type LinhaDoAluno = {
  bloco: BlocoId;
  blocoNome: string;
  nome: string;
  series: number;
  reps: string;
  implemento: string;
  observacao: string;
  cargaKg: number | null;
  percentual: number | null;
  /** Qual dos três levantamentos balizou a carga, quando balizou. */
  levantamento: Levantamento | null;
  /** A zona de RIR habitual do aluno, quando ele tem uma. */
  rir: string;
  /** Por que esta linha está diferente da turma. Vazio = igual à lousa. */
  motivos: string[];
};

export type FichaDoAluno = {
  alunoId: string;
  nome: string;
  email: string;
  nivel: string;
  fase: string;
  rir: string;
  linhas: LinhaDoAluno[];
  /** Exercícios que o aluno NÃO faz, com o motivo. */
  removidos: { nome: string; motivo: string }[];
  avisos: string[];
};

/**
 * Aplica as regras declarativas a uma linha.
 *
 * O que TROCA o exercício é só `converter_airbike` sobre um movimento de
 * impacto: é a conversão que o box já faz na prática — quem não pode saltar
 * senta na Airbike pelo mesmo tempo. As demais regras viram AVISO na linha, e
 * não substituição, porque a decisão ("usa elástico", "não desce tanto") é do
 * coach no momento da aula, e um sistema que trocasse o exercício sozinho
 * estaria decidindo por ele com menos informação do que ele tem.
 */
function adaptar(ex: ExercicioLousa, m: MatrizAluno): { nome: string; motivos: string[] } {
  const motivos: string[] = [];
  let nome = ex.nome;

  if (m.impacto !== 'livre' && casa(ex.nome, TERMOS_IMPACTO)) {
    if (m.impacto === 'converter_airbike') {
      motivos.push(`Impacto convertido: ${ex.nome} ➔ Airbike (${ROTULO_IMPACTO.converter_airbike})`);
      nome = 'Airbike';
    } else {
      motivos.push(`${ROTULO_IMPACTO.reduzir} — adaptar ${ex.nome} sem fase aérea`);
    }
  }

  if (m.tracao !== 'barra' && casa(ex.nome, TERMOS_TRACAO)) {
    motivos.push(`Tração: ${ROTULO_TRACAO[m.tracao]}`);
  }

  for (const k of m.mobilidade) {
    if (casa(ex.nome, TERMOS_MOBILIDADE[k] || [])) {
      motivos.push(`Mobilidade — ${ROTULO_MOBILIDADE[k]}: reduzir amplitude`);
    }
  }

  return { nome, motivos };
}

/** A ficha completa de um aluno a partir do treino da lousa. */
export function fichaDoAluno(treino: TreinoEstruturado, matriz: MatrizAluno): FichaDoAluno {
  const nomeDoBloco = new Map<string, string>(BLOCOS.map((b) => [b.id, b.nome]));
  const linhas: LinhaDoAluno[] = [];
  const removidos: { nome: string; motivo: string }[] = [];

  for (const b of treino.blocos) {
    for (const ex of b.exercicios) {
      const { nome, motivos } = adaptar(ex, matriz);
      const { cargaKg, percentual, levantamento } = cargaDeTrabalho(matriz, nome, treino.sistema, ex.bloco);
      if (cargaKg !== null && percentual !== null) {
        const rm = matriz.referencia[levantamento as Levantamento];
        const origem = rm?.rm ? '1RM medido' : '1RM estimado (Epley)';
        motivos.push(`Carga: ${percentual}% de ${rm?.rmEfetivo}kg — ${origem} de ${levantamento}`);
      }
      linhas.push({
        bloco: ex.bloco,
        blocoNome: b.nome || nomeDoBloco.get(ex.bloco) || ex.bloco,
        nome,
        series: ex.series,
        reps: ex.reps,
        implemento: ex.implemento,
        observacao: ex.observacao,
        cargaKg,
        percentual,
        levantamento,
        rir: matriz.rir,
        motivos,
      });
    }
  }

  const avisos: string[] = [];
  const temAlgum1RM = LEVANTAMENTOS.some((id) => matriz.referencia[id]?.rmEfetivo);
  if (!temAlgum1RM) {
    avisos.push('Sem 1RM de referência na matriz: as cargas saem como orientação da lousa, sem número em kg.');
  }
  // A lista de lesões acompanha a ficha como CONTEXTO — ela não dispara troca
  // sozinha (quem executa são impacto/tração/mobilidade). Sem este aviso, uma
  // lesão cadastrada sem a regra correspondente não apareceria em lugar nenhum,
  // e o coach acharia que o sistema a considerou.
  if (matriz.lesoes.length) {
    const lista = matriz.lesoes.map((l) => `${l.regiao} (${l.gravidade})`).join(', ');
    avisos.push(`Lesões na ficha: ${lista}. Confira se as regras de impacto e tração cobrem o caso.`);
  }
  if (matriz.obsAdaptacoes) avisos.push(`Observação da matriz: ${matriz.obsAdaptacoes}`);
  if (!matriz.nivel) avisos.push('Aluno sem nível na ficha — a carga saiu sem o ajuste de nível.');

  return {
    alunoId: matriz.alunoId,
    nome: matriz.nome,
    email: matriz.email,
    nivel: matriz.nivel,
    fase: matriz.fase,
    rir: matriz.rir,
    linhas,
    removidos,
    avisos,
  };
}

/** As fichas da turma inteira — o que a prévia mostra e o lote grava. */
export function distribuir(treino: TreinoEstruturado, matrizes: MatrizAluno[]): FichaDoAluno[] {
  return matrizes.slice(0, ALUNOS_POR_TURMA).map((m) => fichaDoAluno(treino, m));
}

/* ------------------------------------------------------------------ *
 * As turmas do dia — a distribuição em lote
 * ------------------------------------------------------------------ */

/**
 * Teto de alunos numa distribuição, somando TODAS as turmas.
 *
 * Um lote do Firestore aceita 500 operações. Cada aluno custa duas (a ficha ao
 * lado do treino e a fatia do Portal), mais uma do documento do treino: 200
 * alunos = 401 operações, com folga confortável. Acima disso o lote seria
 * recusado pelo Firestore com um erro que não diz nada ao coach — melhor recusar
 * antes, com um texto que explica o que fazer.
 */
export const MAX_ALUNOS_NO_LOTE = 200;

/** Formato de horário de aula aceito ('19:00'). */
const EH_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export type TurmaEntrada = { classTime: string; studentIds: string[] };

/** A ficha com o horário da turma dela — é o que a tela agrupa de volta. */
export type FichaComHorario = FichaDoAluno & { classTime: string };

/** Lista de ids, sem repetição, sem vazio e sem espaço em volta. */
function idsValidos(v: unknown): string[] {
  return Array.isArray(v)
    ? [...new Set(v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()))]
    : [];
}

/**
 * Lê as turmas do pedido, aceitando os DOIS formatos.
 *
 * `turmas: [{classTime, studentIds}]` é o formato novo — o coach distribui os
 * três horários do dia de uma vez. `{classTime, studentIds}` no topo é o antigo,
 * de uma turma só, e continua aceito de propósito: o site publica sozinho pelo
 * GitHub Pages e as functions sobem num deploy separado, então existe uma janela
 * em que um lado é novo e o outro é velho. Aceitar os dois faz a ORDEM do deploy
 * deixar de importar; recusar o antigo transformaria essa janela em erro na cara
 * do coach.
 *
 * Turma sem horário ou sem aluno é descartada: a ficha é publicada por horário
 * no Portal, e gravar com `classTime` vazio faria o treino chegar ao aluno sem
 * dizer de que aula ele é.
 */
export function lerTurmas(dados: { turmas?: unknown; studentIds?: unknown; classTime?: unknown }): TurmaEntrada[] {
  if (Array.isArray(dados?.turmas)) {
    return dados.turmas
      .flatMap((t): TurmaEntrada[] => {
        const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        const classTime = typeof o.classTime === 'string' && EH_HORA.test(o.classTime) ? o.classTime : '';
        const studentIds = idsValidos(o.studentIds);
        return classTime && studentIds.length ? [{ classTime, studentIds }] : [];
      })
      .sort((a, b) => a.classTime.localeCompare(b.classTime));
  }

  const studentIds = idsValidos(dados?.studentIds);
  const classTime = typeof dados?.classTime === 'string' && EH_HORA.test(dados.classTime) ? dados.classTime : '';
  return studentIds.length ? [{ classTime, studentIds }] : [];
}

/**
 * O que impede gravar este lote, ou `null` quando pode ir.
 *
 * O aluno repetido em duas turmas é o caso perigoso: o Firestore aplica as duas
 * escritas do mesmo documento no MESMO lote e a última vence, em silêncio. O
 * coach receberia "gravado" e o aluno veria a aula errada.
 */
export function validarTurmas(turmas: TurmaEntrada[]): string | null {
  if (!turmas.length) return 'Selecione pelo menos um aluno da turma.';

  for (const t of turmas) {
    if (t.studentIds.length > ALUNOS_POR_TURMA) {
      return `A turma das ${t.classTime} tem ${t.studentIds.length} alunos — o teto por aula é ${ALUNOS_POR_TURMA}.`;
    }
  }

  const todos = turmas.flatMap((t) => t.studentIds);
  if (new Set(todos).size !== todos.length) {
    return 'Há aluno em mais de um horário. Deixe cada aluno numa turma só.';
  }
  if (todos.length > MAX_ALUNOS_NO_LOTE) {
    return `São ${todos.length} alunos de uma vez; o limite por distribuição é ${MAX_ALUNOS_NO_LOTE}. Divida em dois envios.`;
  }
  return null;
}

/** Todos os ids das turmas, na ordem em que serão gravados. */
export function alunosDasTurmas(turmas: TurmaEntrada[]): string[] {
  return turmas.flatMap((t) => t.studentIds);
}

/** Aluno → horário da turma dele, para carimbar a ficha. */
export function horarioPorAluno(turmas: TurmaEntrada[]): Map<string, string> {
  return new Map(turmas.flatMap((t) => t.studentIds.map((id): [string, string] => [id, t.classTime])));
}
