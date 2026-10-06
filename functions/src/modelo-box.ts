/**
 * MODELO DE DADOS DA SEMANA DO BOX — catálogo base, matriz semanal, inventário
 * e histórico mensal do aluno.
 *
 * ── Quem escreve o quê ───────────────────────────────────────────────────────
 * Os quatro caminhos abaixo são GRAVADOS SÓ PELAS CLOUD FUNCTIONS (Admin SDK).
 * Os clientes — site do coach, Portal do Aluno, app — só leem e chamam os
 * callables. É isso que garante que a contagem de equipamento e o volume por
 * músculo saiam de UMA conta só, no servidor: se o navegador pudesse gravar a
 * semana, ele também poderia gravar uma contagem de equipamento inventada.
 *
 *   catalogoExercicios/{exercicioId}           seed (`seed-catalogo.ts`); leitura de qualquer logado
 *   coaches/{uid}/semanas/{AAAA-Www}           `gerarMatrizSemanalBox` / `salvarSemanaBox` / `publicarSemanaBox`
 *   coaches/{uid}/inventario/atual             `salvarInventarioBox`
 *   treinoAluno/{email}/historico/{AAAA-MM}    `registrarSessaoAluno`
 *
 * ── Não confundir com ────────────────────────────────────────────────────────
 *  - `coaches/{uid}/catalogoExercicios/{chave}` (`catalogo.ts`): a memória que a
 *    LEITURA DE LOUSA aprende, por coach. Este catálogo da raiz é o de FÁBRICA,
 *    igual para todo coach, com instância de movimento e adaptações.
 *  - `academia/{uid}.inventario`: o inventário completo que a tela da Academia
 *    edita (37 itens, com cargas). O daqui guarda só os recursos que
 *    LIMITAM a montagem da semana (os 5 do bloco H, os 9 do HIIT e os 2 só do
 *    Cross/Hyrox) e o tamanho da turma.
 *
 * Os tipos usam o `Timestamp` do Admin SDK. Os clientes têm o Timestamp do SDK
 * web, que tem a mesma forma de leitura (`toDate()`, `seconds`).
 */
import type { Timestamp } from 'firebase-admin/firestore';

/* ───────────────────────────── vocabulário ───────────────────────────── */

/** Padrão de movimento — a "vaga" que um exercício ocupa no bloco principal. */
export const INSTANCIAS = [
  'empurrar_horizontal', 'puxar_horizontal', 'agachar', 'estender_quadril',
  'estabilizar_tronco', 'empurrar_vertical', 'puxar_vertical',
] as const;
export type Instancia = (typeof INSTANCIAS)[number];

/**
 * Músculos, nas MESMAS chaves de `compartilhado/config/musculos.js` (`MUSC_MAP`),
 * menos `estabilizadores`, que não é músculo e não soma volume. Chave em
 * snake_case porque vira nome de campo no mapa `volumeAcumulado`.
 */
export const MUSCULOS = [
  'peito', 'costas', 'ombro', 'trapezio', 'biceps', 'triceps', 'antebraco',
  'core', 'lombar', 'quadriceps', 'posterior_coxa', 'gluteo', 'panturrilha',
] as const;
export type Musculo = (typeof MUSCULOS)[number];

/** Peso de uma série no volume do músculo. Ver `volumeDaSessao` em `semana-box.ts`. */
export const PESO_PRINCIPAL = 1.0;
export const PESO_SECUNDARIO = 0.5;

/** Equipamento que um exercício exige. Lista fechada: o seed e a validação usam esta. */
export const EQUIPAMENTOS = [
  'smith', 'banco', 'monocross', 'flexora', 'extensora', 'cavalinho',
  'halteres', 'barra', 'anilhas', 'kettlebell', 'caixote', 'step', 'trx',
  'banco_scott', 'colchonete', 'peso_corporal',
  // HIIT (05/10/2026): o que as estações de TABATA usam além do que já existia.
  'wall_ball', 'corda_naval', 'corda_pular', 'sandbag', 'air_bike',
] as const;
export type Equipamento = (typeof EQUIPAMENTOS)[number];

/** Os recursos que o inventário LIMITA. O resto (halteres, colchonete…) o box tem de sobra. */
export const RECURSOS_INVENTARIO = ['smith', 'banco', 'monocross', 'maquinaLegs', 'cavalinho'] as const;
export type RecursoInventario = (typeof RECURSOS_INVENTARIO)[number];

/** Unidades de cada recurso quando o coach ainda não gravou o inventário. */
export const INVENTARIO_PADRAO: Readonly<Record<RecursoInventario, number>> = {
  smith: 2,
  banco: 2,
  monocross: 3,
  maquinaLegs: 1,
  cavalinho: 2,
};

/**
 * Que recurso do inventário cada equipamento consome.
 *
 * `flexora` e `extensora` caem os dois em `maquinaLegs`: é UMA máquina no box
 * (limite 1), então uma mesa flexora e uma cadeira extensora no mesmo dia já
 * disputam o mesmo aparelho. Equipamento fora deste mapa não é limitado.
 */
export const RECURSO_DO_EQUIPAMENTO: Readonly<Partial<Record<Equipamento, RecursoInventario>>> = {
  smith: 'smith',
  banco: 'banco',
  monocross: 'monocross',
  flexora: 'maquinaLegs',
  extensora: 'maquinaLegs',
  cavalinho: 'cavalinho',
};

/**
 * Os recursos que limitam o HIIT. Ficam FORA de `RECURSOS_INVENTARIO` de
 * propósito: o bloco H conta estação por exercício (um aparelho por estação),
 * o HIIT conta unidade por aluno — e o TRX de uma flexão no H1 não disputa com
 * nada. Misturar as listas faria o bloco H passar a contar TRX e kettlebell.
 */
export const RECURSOS_HIIT = [
  'kettlebell', 'wallBall', 'caixote', 'cordaNaval', 'cordaPular', 'sandbag', 'airbike', 'trx', 'halteres',
] as const;
export type RecursoHiit = (typeof RECURSOS_HIIT)[number];

/**
 * Os recursos que SÓ o Cross e o Hyrox usam (06/10/2026). O resto do que eles
 * pegam (kettlebell, wall ball, sandbag, monocross…) é o MESMO equipamento do
 * HIIT e do bloco H, contado nas mesmas linhas do inventário: um kettlebell é
 * um kettlebell, em qualquer aula.
 *  - `barraOlimpica`: barra com anilhas, um aluno por barra. Sem rack no box —
 *    todo movimento de barra sai do chão.
 *  - `sled`: o trenó do Hyrox, no turf.
 */
export const RECURSOS_CROSS_HYROX = ['barraOlimpica', 'sled'] as const;
export type RecursoCrossHyrox = (typeof RECURSOS_CROSS_HYROX)[number];

/** Tudo o que o inventário guarda: os recursos do bloco H, os do HIIT e os do Cross/Hyrox. */
export const RECURSOS_BOX = [...RECURSOS_INVENTARIO, ...RECURSOS_HIIT, ...RECURSOS_CROSS_HYROX] as const;
export type RecursoBox = RecursoInventario | RecursoHiit | RecursoCrossHyrox;

/** Unidades de fábrica dos recursos só do Cross/Hyrox (cadastro antigo: 4 barras, 1 trenó). */
export const INVENTARIO_CROSS_HYROX_PADRAO: Readonly<Record<RecursoCrossHyrox, number>> = {
  barraOlimpica: 4,
  sled: 1,
};

/** O que limita o WOD do Cross: os recursos do HIIT e as barras. */
export type RecursoCross = RecursoHiit | 'barraOlimpica';
export const RECURSOS_CROSS: readonly RecursoCross[] = [...RECURSOS_HIIT, 'barraOlimpica'];

/**
 * Recursos do HIIT FIXOS NO ESPAÇO: as unidades ficam ancoradas juntas (os 2
 * TRX lado a lado, na mesma estrutura) e não mudam de lugar. Se duas estações
 * usassem o recurso, os alunos delas se juntariam no mesmo canto do box e a
 * divisão em 4 estações quebraria. Então ele serve a UMA estação por HIIT —
 * além do limite de unidades por slot, que continua valendo. Decisão do coach,
 * 05/10/2026. Outro recurso ancorado entra só aqui.
 */
export const RECURSOS_FIXOS_HIIT: readonly RecursoHiit[] = ['trx'];

/**
 * Inventário do HIIT ditado pelo coach em 05/10/2026. Os halteres são os do
 * cadastro antigo (`compartilhado/dados/equipamentos.js`: torres de 1–10 kg,
 * 4 pares ao mesmo tempo). Kettlebell e wall ball contam UNIDADES, de qualquer
 * peso: os pesos ficam na observação, para o coach ver na aba Inventário.
 */
export const INVENTARIO_HIIT_PADRAO: Readonly<Record<RecursoHiit, number>> = {
  kettlebell: 10,
  wallBall: 4,
  caixote: 4,
  cordaNaval: 2,
  cordaPular: 2,
  sandbag: 1,
  airbike: 2,
  trx: 2,
  halteres: 4,
};

/** Observação de fábrica de um recurso (quando o coach ainda não escreveu a dele). */
export const OBSERVACAO_PADRAO: Readonly<Partial<Record<RecursoBox, string>>> = {
  kettlebell: '8 kg · 2× 10 kg · 2× 12 kg · 2× 16 kg · 18 kg · 20 kg · 22 kg',
  wallBall: '2× 10 lb · 2× 14 lb',
  cordaNaval: '4 m',
  sandbag: '20 kg',
  trx: 'instalados',
  halteres: 'pares, torres de 1 a 10 kg',
  barraOlimpica: '2× 2,0 m · 2× 1,5 m, com anilhas',
  sled: 'no turf de 5 m',
};

/** Que recurso do HIIT cada equipamento consome. Equipamento fora daqui não limita o HIIT. */
export const RECURSO_HIIT_DO_EQUIPAMENTO: Readonly<Partial<Record<Equipamento, RecursoHiit>>> = {
  kettlebell: 'kettlebell',
  wall_ball: 'wallBall',
  caixote: 'caixote',
  corda_naval: 'cordaNaval',
  corda_pular: 'cordaPular',
  sandbag: 'sandbag',
  air_bike: 'airbike',
  trx: 'trx',
  halteres: 'halteres',
};

/** Que recurso do Cross cada equipamento consome: os do HIIT e a barra. */
export const RECURSO_CROSS_DO_EQUIPAMENTO: Readonly<Partial<Record<Equipamento, RecursoCross>>> = {
  ...RECURSO_HIIT_DO_EQUIPAMENTO,
  barra: 'barraOlimpica',
};

/**
 * Tamanho da turma quando o coach ainda não gravou o dele (decisão de
 * 05/10/2026: 6). É o número que o HIIT usa para saber quantos alunos dividem
 * uma estação — ver `alunosPorEstacao` em `gerador-hiit.ts`.
 */
export const ALUNOS_POR_AULA_PADRAO = 6;
export const ALUNOS_POR_AULA_MAX = 40;

/** As restrições para as quais o catálogo sugere troca. */
export const ADAPTACOES = ['joelho', 'lombar', 'ombro', 'mobilidade'] as const;
export type Adaptacao = (typeof ADAPTACOES)[number];

export const MODALIDADES = ['H1', 'H2', 'H3', 'Hyrox', 'Cross', 'HIIT'] as const;
export type Modalidade = (typeof MODALIDADES)[number];

/** As sessões de FORÇA — as únicas que têm bloco principal de 6 exercícios. */
export const SESSOES_H = ['H1', 'H2', 'H3'] as const;
export type SessaoH = (typeof SESSOES_H)[number];

/** As sessões metabólicas: sinalizadas no dia, sem bloco principal. */
export const SESSOES_METABOLICAS = ['Cross', 'Hyrox', 'HIIT'] as const;
export type SessaoMetabolica = (typeof SESSOES_METABOLICAS)[number];

/** Segunda a sábado. O índice é o deslocamento em dias a partir da segunda. */
export const DIAS_SEMANA = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Quantos exercícios o bloco principal de uma sessão H tem. */
export const EXERCICIOS_POR_BLOCO = 6;

/** Cadência quando o coach não escreve outra: 3 s excêntrica, 0 pausa, 1 s concêntrica, 0 pausa. */
export const CADENCIA_PADRAO = '3010';

/* ───────────────────────── matriz e grade (decisão do coach, 05/10/2026) ───────────────────────── */

/**
 * As 6 instâncias de cada sessão H, NA ORDEM do bloco. A ordem importa: é a
 * ordem das estações, e o reparo de equipamento troca primeiro o exercício
 * conflitante MAIS PARA O FIM do bloco.
 */
export const MATRIZ_H: Readonly<Record<SessaoH, { nome: string; instancias: readonly Instancia[] }>> = {
  H1: {
    nome: 'Força Base — Agachar/Empurrar',
    instancias: ['agachar', 'empurrar_horizontal', 'empurrar_vertical', 'puxar_horizontal', 'estender_quadril', 'puxar_vertical'],
  },
  H2: {
    nome: 'Força Base — Cadeia Posterior/Puxar',
    instancias: ['estender_quadril', 'puxar_horizontal', 'puxar_vertical', 'agachar', 'empurrar_horizontal', 'estabilizar_tronco'],
  },
  H3: {
    nome: 'Consolidação Full Body',
    instancias: ['agachar', 'estender_quadril', 'empurrar_horizontal', 'puxar_horizontal', 'empurrar_vertical', 'puxar_vertical'],
  },
};

/**
 * A grade fixa do box. O PRIMEIRO treino de cada dia é a aula principal; os
 * demais são alternativa (catch-up de quem perdeu a sessão H da semana).
 */
export const GRADE_SEMANAL: Readonly<Record<DiaSemana, readonly Modalidade[]>> = {
  segunda: ['H1'],
  terca: ['Cross', 'H1'],
  quarta: ['H2'],
  quinta: ['Hyrox'],
  sexta: ['H3', 'HIIT'],
  sabado: ['HIIT', 'H3'],
};

/**
 * Prescrição do bloco de força quando o gerador monta a semana (4 × 8–12,
 * cadência 3010). `entreSeriesSeg` é o descanso PADRÃO de cada exercício; as
 * exceções estão logo abaixo. O coach ajusta no rascunho antes de publicar.
 */
export const PRESCRICAO_FORCA = {
  series: 4,
  repeticoes: '8-12',
  cadencia: CADENCIA_PADRAO,
  descansos: { entreSeriesSeg: 90, entreExerciciosSeg: 90 },
} as const;

/**
 * Compostos pesados: as duas PRIMEIRAS vagas do H1 (agachar, empurrar
 * horizontal) e do H2 (estender quadril, puxar horizontal) descansam 120 s.
 * Por posição, e não por instância: o agachar do H3 e do H2 não é a abertura
 * pesada da sessão. Decisão do coach, 05/10/2026.
 */
export const DESCANSO_COMPOSTO_PESADO_SEG = 120;
export const VAGAS_COMPOSTO_PESADO: Readonly<Record<SessaoH, readonly number[]>> = { H1: [1, 2], H2: [1, 2], H3: [] };

/** Descanso por instância, que vence a posição. Core (H2) descansa 45 s. */
export const DESCANSO_POR_INSTANCIA: Readonly<Partial<Record<Instancia, number>>> = { estabilizar_tronco: 45 };

/**
 * Como cada sessão metabólica aparece no dia (o cabeçalho). O conteúdo mora em
 * `DiaProgramado.hiit`, `.cross` e `.hyrox`, montado pelo gerador.
 * Textos de `compartilhado/config/modalidades.js` e `config/wod-formatos.js`.
 */
export const FORMATO_METABOLICO: Readonly<Record<SessaoMetabolica, { formato: string; descricao: string }>> = {
  Cross: { formato: 'WOD', descricao: 'AMRAP, EMOM, For Time ou Chipper, com RX e Scaled.' },
  Hyrox: { formato: 'For Time', descricao: 'Formato da competição: corrida intercalada com estações funcionais, em 4 níveis.' },
  HIIT: { formato: 'TABATA', descricao: '4 estações TABATA (Pernas · Core · Superiores · Cardio), 16 rounds cada.' },
};

/* ───────────────────────── HIIT (decisão do coach, 05/10/2026) ───────────────────────── */

/**
 * As 4 estações do HIIT. A turma se divide entre elas e todas rodam AO MESMO
 * TEMPO, na mesma música: no round N, toda estação está no mesmo slot. É isso
 * que faz o equipamento ser conferido também ENTRE estações, slot a slot.
 */
export const ESTACOES_HIIT = ['pernas', 'core', 'superiores', 'cardio'] as const;
export type EstacaoHiit = (typeof ESTACOES_HIIT)[number];

export const NOME_ESTACAO_HIIT: Readonly<Record<EstacaoHiit, string>> = {
  pernas: 'Pernas',
  core: 'Core',
  superiores: 'Superiores',
  cardio: 'Cardio',
};

/** Slots por estação. Exercício unilateral ocupa dois (lado direito, depois esquerdo). */
export const SLOTS_POR_ESTACAO = 4;

/** O texto que o app e a lousa mostram em cada estação. Ditado pelo coach. */
export const PROTOCOLO_HIIT = '2 Músicas de Tabata (16 rounds no total). 4x cada exercício.';

/* ───────────────────────── CROSS (decisão do coach, 06/10/2026) ───────────────────────── */

export const FORMATOS_CROSS = ['AMRAP', 'EMOM', 'For Time', 'Chipper'] as const;
export type FormatoCross = (typeof FORMATOS_CROSS)[number];

/**
 * Padrão dominante de um movimento do WOD. Um WOD não repete padrão (dois
 * hinges seguidos acabam com a lombar) e tem ao menos um `cardio` (o
 * monoestrutural: corrida, air bike, corda).
 */
export const PADROES_CROSS = ['cardio', 'agachar', 'quadril', 'empurrar', 'puxar', 'corpo_todo', 'olimpico', 'core'] as const;
export type PadraoCross = (typeof PADROES_CROSS)[number];

export const UNIDADES_CROSS = ['reps', 'metros', 'calorias', 'segundos'] as const;
export type UnidadeCross = (typeof UNIDADES_CROSS)[number];

/**
 * Cada formato do WOD:
 *  - `movimentos`: quantos o gerador sorteia ([mín, máx]); abaixo do mínimo a semana não publica;
 *  - `fator`: multiplica o RX-base do catálogo (a quantidade de UMA rodada de AMRAP);
 *  - `escalonado`: a turma se ESPALHA pelos movimentos (AMRAP, For Time,
 *    Chipper: cada aluno está num ponto do WOD) ou faz TODA o mesmo movimento
 *    no mesmo minuto (EMOM). Muda a conta de equipamento — ver `conta-cross.ts`.
 */
export const REGRA_FORMATO_CROSS: Readonly<Record<FormatoCross, {
  movimentos: readonly [number, number]; fator: number; escalonado: boolean; descricao: string;
}>> = {
  AMRAP: {
    movimentos: [3, 4], fator: 1, escalonado: true,
    descricao: 'Máximo de rodadas possíveis no tempo — o cronômetro corre até o fim.',
  },
  EMOM: {
    movimentos: [3, 4], fator: 0.6, escalonado: false,
    descricao: 'A cada minuto, um movimento na ordem; a lista reinicia até fechar o tempo. Descanse o que sobrar do minuto.',
  },
  'For Time': {
    movimentos: [3, 4], fator: 1, escalonado: true,
    descricao: 'Complete as rodadas o mais rápido possível, dentro do time cap.',
  },
  // 2 (e não 2,5) desde 06/10/2026: com a Técnica / Força antes, o cap é 15 min.
  Chipper: {
    movimentos: [5, 5], fator: 2, escalonado: true,
    descricao: 'Uma lista longa, na ordem, cada movimento uma vez só — dentro do time cap.',
  },
};

/** Scaled = RX × este fator (−30%), arredondado como o RX. Decisão do coach, 06/10/2026. */
export const FATOR_SCALED = 0.7;

/** Duração do WOD (AMRAP, EMOM) ou time cap (For Time, Chipper), em minutos. */
export const MINUTOS_CROSS = { min: 5, max: 60 } as const;
/** Rodadas do For Time e voltas na lista do EMOM. */
export const RODADAS_CROSS = { min: 1, max: 10 } as const;

/**
 * Teto do WOD (duração ou time cap). A aula de Cross tem 60 min e o bloco de
 * Técnica / Força (10–12 min) vem antes: o WOD fica em até 15. Decisão do coach, 06/10/2026.
 */
export const MINUTOS_MAX_WOD = 15;

/* ── Técnica / Força: o bloco ANTES do WOD, no movimento principal do dia ── */

/**
 * De que tipo é o movimento-foco, NA ORDEM DE PRIORIDADE: o gerador escolhe
 * para a Técnica / Força o movimento do WOD da categoria mais à frente (o mais
 * técnico do dia). Decisão do coach, 06/10/2026.
 */
export const CATEGORIAS_FOCO = ['olimpico', 'barra', 'kettlebell', 'ginastica'] as const;
export type CategoriaFoco = (typeof CATEGORIAS_FOCO)[number];

/** O que o bloco trabalha: técnica (EMOM leve), força (séries pesadas) ou skill (ginástica estrita). */
export const TIPOS_TECNICA = ['tecnica', 'forca', 'skill'] as const;
export type TipoTecnica = (typeof TIPOS_TECNICA)[number];
export const NOME_TIPO_TECNICA: Readonly<Record<TipoTecnica, string>> = { tecnica: 'Técnica', forca: 'Força', skill: 'Skill' };

/** Duração do bloco, em minutos (10–12 pelo coach; a faixa aceita é um pouco maior). */
export const MINUTOS_TECNICA = { min: 5, max: 20 } as const;

/**
 * Na Técnica / Força a turma trabalha em DUPLAS revezando o equipamento entre
 * as séries: cada movimento precisa de turma ÷ 2 (para cima) unidades. Com 6
 * alunos, 3 barras. Decisão do coach, 06/10/2026.
 */
export const ALUNOS_POR_EQUIPAMENTO_TECNICA = 2;

/**
 * O bloco de Técnica / Força de um movimento — só nos que podem ser o foco da
 * aula (cardio nunca é). A dinâmica é FIXA por movimento (decisão do coach).
 */
export interface DadosTecnica {
  categoria: CategoriaFoco;
  tipo: TipoTecnica;
  /** 'EMOM 10 min: 3 power cleans por minuto, subindo a carga de leve a moderada.' */
  dinamica: string;
  minutos: number;
  /** 'Recepção rápida da barra e extensão completa de quadril.' */
  objetivo: string;
  /** Texto da carga sugerida, quando tem. */
  carga?: string;
  /**
   * O detalhe técnico que salva o WOD, no imperativo e em minúscula — entra
   * no fim da Estratégia do Coach ('deixe o quadril lançar a barra — é ele
   * que poupa o ombro'). Ausente: a estratégia usa o `objetivo`.
   */
  chave?: string;
}

/** Como um exercício entra no WOD do Cross. */
export interface DadosCross {
  padrao: PadraoCross;
  unidade: UnidadeCross;
  /** RX de UMA rodada de AMRAP. Os outros formatos multiplicam por `REGRA_FORMATO_CROSS[f].fator`. */
  rx: number;
  /** Texto da carga, quando o movimento tem carga ('40/30 kg' = homem/mulher). */
  carga?: { rx: string; scaled: string };
  /** Unidades por ALUNO, quando não for 1 de cada recurso dos `equipamentos` (farmer = 2 kettlebells). */
  consumoPorAluno?: Partial<Record<RecursoCross, number>>;
  /** Só nos movimentos que podem ser o foco da Técnica / Força. */
  tecnica?: DadosTecnica;
}

/** O bloco de Técnica / Força como gravado. Tudo CALCULADO do catálogo, menos o id. */
export interface TecnicaProgramada extends Omit<DadosTecnica, 'carga'> {
  /** O movimento-foco — é um dos movimentos do WOD. */
  exercicioId: string;
  nome: string;
  carga: string | null;
  /** Para a reconferência do inventário (duplas revezando: turma ÷ 2 × isto). */
  consumoPorAluno: Partial<Record<RecursoCross, number>>;
  /** Os OUTROS movimentos do WOD que também podem ser o foco — a tela oferece a troca. */
  alternativas: { exercicioId: string; nome: string; categoria: CategoriaFoco }[];
}

/** Um movimento do WOD, como gravado. Tudo CALCULADO do catálogo e do formato, menos o id. */
export interface MovimentoCross {
  exercicioId: string;
  nome: string;
  padrao: PadraoCross;
  unidade: UnidadeCross;
  rx: number;
  scaled: number;
  /** Unilateral: a quantidade é POR LADO. */
  porLado: boolean;
  carga: { rx: string; scaled: string } | null;
  /** Para a reconferência do inventário não reler o catálogo, como no HIIT. */
  consumoPorAluno: Partial<Record<RecursoCross, number>>;
}

/** O WOD do Cross da semana. */
export interface WodProgramado {
  formato: FormatoCross;
  /** `REGRA_FORMATO_CROSS[formato].descricao`. */
  descricao: string;
  /** AMRAP/EMOM: duração. For Time/Chipper: time cap. No EMOM é movimentos × rodadas. */
  minutos: number;
  /** For Time: rodadas. EMOM: voltas na lista. AMRAP e Chipper: null. */
  rodadas: number | null;
  movimentos: MovimentoCross[];
  /**
   * O bloco ANTES do WOD, no movimento principal do dia. `null` = nenhum
   * movimento do WOD serve de foco (a semana não publica). Ausente = WOD
   * gravado antes do bloco existir.
   */
  tecnica?: TecnicaProgramada | null;
  /**
   * A Estratégia do Coach: o parágrafo que liga a Técnica / Força ao WOD
   * (`estrategia-cross.ts`). CALCULADA pelo servidor a cada gravação.
   * `null` = WOD sem foco. Ausente = WOD gravado antes de existir.
   */
  estrategia?: string | null;
}

/**
 * Equipamento do Cross acima do limite. `exercicios` são os movimentos que
 * somam (ou o que sozinho passa, no EMOM). `bloco: 'tecnica'` = na Técnica /
 * Força (duplas revezando); ausente = no WOD.
 */
export interface AlertaCross {
  recurso: RecursoCross;
  usado: number;
  limite: number;
  exercicios: string[];
  bloco?: 'tecnica';
}
export interface AlertaCrossDaSemana extends AlertaCross {
  dias: DiaSemana[];
}

/* ───────────────────────── HYROX (decisão do coach, 06/10/2026) ───────────────────────── */

/** Os 4 níveis do Hyrox. 'competicao' é a prescrição de prova (1 km por corrida). */
export const NIVEIS_HYROX = ['iniciante', 'intermediario', 'avancado', 'competicao'] as const;
export type NivelHyrox = (typeof NIVEIS_HYROX)[number];
export const NOME_NIVEL_HYROX: Readonly<Record<NivelHyrox, string>> = {
  iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado', competicao: 'Competição',
};

/** As 8 estações da prova, NA ORDEM da prova. Os dados de cada uma estão em `catalogo-hyrox.ts`. */
export const ESTACOES_HYROX = [
  'skierg', 'sled_push', 'sled_pull', 'burpee_broad_jump', 'remo', 'farmers_carry', 'sandbag_lunges', 'wall_ball',
] as const;
export type EstacaoHyrox = (typeof ESTACOES_HYROX)[number];

export const TIPOS_HYROX = ['reps', 'metros', 'calorias', 'segundos'] as const;
export type TipoHyrox = (typeof TIPOS_HYROX)[number];

export const FORMATOS_HYROX = ['prova', 'metadeA', 'metadeB', 'compromised'] as const;
export type FormatoHyrox = (typeof FORMATOS_HYROX)[number];

/**
 * Os formatos do Hyrox, em rodízio semana a semana:
 *  - `estacoes`: as estações FIXAS do formato, ou um número = quantas o gerador sorteia das 8;
 *  - `rodadas`: quantas vezes a lista de estações se repete;
 *  - `fatorCorrida` / `fatorEstacao`: multiplicam a prescrição do nível.
 */
export const REGRA_FORMATO_HYROX: Readonly<Record<FormatoHyrox, {
  nome: string; descricao: string; estacoes: readonly EstacaoHyrox[] | number;
  rodadas: number; fatorCorrida: number; fatorEstacao: number;
}>> = {
  prova: {
    nome: 'Prova completa',
    descricao: 'As 8 estações na ordem da prova, com uma corrida antes de cada uma. For time.',
    estacoes: ESTACOES_HYROX, rodadas: 1, fatorCorrida: 1, fatorEstacao: 1,
  },
  metadeA: {
    nome: 'Metade A',
    descricao: 'Estações 1 a 4 da prova, com a corrida dobrada antes de cada uma. For time.',
    estacoes: ESTACOES_HYROX.slice(0, 4), rodadas: 1, fatorCorrida: 2, fatorEstacao: 1,
  },
  metadeB: {
    nome: 'Metade B',
    descricao: 'Estações 5 a 8 da prova, com a corrida dobrada antes de cada uma. For time.',
    estacoes: ESTACOES_HYROX.slice(4), rodadas: 1, fatorCorrida: 2, fatorEstacao: 1,
  },
  compromised: {
    nome: 'Compromised running',
    descricao: '4 estações sorteadas, 2 rodadas: corrida + metade da estação, sem pausa. Treina correr cansado.',
    estacoes: 4, rodadas: 2, fatorCorrida: 1, fatorEstacao: 0.5,
  },
};

/** A corrida de UMA rodada num nível, com a alternativa na air bike (mesmo esforço, sem impacto). */
export interface CorridaHyrox {
  metros: number;
  bikeSeg: number;
}

/** Uma estação do Hyrox como gravada. Tudo CALCULADO de `catalogo-hyrox.ts` e do formato, menos `estacao` e `substituta`. */
export interface EstacaoHyroxProgramada {
  estacao: EstacaoHyrox;
  /** Posição na prova, 1 a 8. */
  n: number;
  /** O da estação ou, com `substituta`, o da substituta. */
  nome: string;
  /** A estação da competição ('Sled Push'). */
  base: string;
  tipo: TipoHyrox;
  prescricao: Record<NivelHyrox, number>;
  carga: string;
  nota: string;
  /** A estação foi trocada pela substituta (equipamento em manutenção, ou escolha do coach). */
  substituta: boolean;
  /** Unidades de cada recurso que a estação precisa ativas. */
  recursos: Partial<Record<RecursoBox, number>>;
}

/** O Hyrox da semana. */
export interface HyroxProgramado {
  formato: FormatoHyrox;
  nome: string;
  descricao: string;
  rodadas: number;
  /** Corrida antes de cada estação, por nível (já com o `fatorCorrida`). */
  corrida: Record<NivelHyrox, CorridaHyrox>;
  /** Na ordem da prova. */
  estacoes: EstacaoHyroxProgramada[];
}

/** Estação do Hyrox sem o equipamento que precisa (sled em manutenção). */
export interface AlertaHyrox {
  estacao: EstacaoHyrox;
  recurso: RecursoBox;
  precisa: number;
  limite: number;
  /** A estação tem substituta (e ela não está em uso) — a tela oferece a troca. */
  temSubstituta: boolean;
}
export interface AlertaHyroxDaSemana extends AlertaHyrox {
  dias: DiaSemana[];
}

/* ───────────────────────── catalogoExercicios/{id} ───────────────────────── */

export interface ExercicioCatalogo {
  nome: string;
  instancia: Instancia;
  /** Cada série soma `PESO_PRINCIPAL` (1,0) a cada um destes. */
  musculoPrincipal: Musculo[];
  /** Cada série soma `PESO_SECUNDARIO` (0,5) a cada um destes. */
  musculosSecundarios: Musculo[];
  equipamentos: Equipamento[];
  /** Restrição → id de outro exercício DESTE catálogo para trocar. */
  adaptacoes: Partial<Record<Adaptacao, string>>;
  /** Um lado por vez. No HIIT ocupa 2 slots (D e E). Ausente = bilateral. */
  unilateral?: boolean;
  /** Só nos exercícios que servem ao HIIT. */
  hiit?: DadosHiit;
  /** Só nos exercícios que servem ao WOD do Cross. */
  cross?: DadosCross;
}

/**
 * Como um exercício entra no HIIT. `estacoes` é a "tag" (hiit_pernas, hiit_core…)
 * em forma de lista fechada: o servidor recusa estação desconhecida em vez de
 * deixar um erro de digitação tirar o exercício do sorteio sem ninguém ver.
 */
export interface DadosHiit {
  estacoes: EstacaoHiit[];
  /**
   * Unidades por ALUNO, quando não for 1 de cada recurso que os `equipamentos`
   * usam (ex.: `{ kettlebell: 2 }` num exercício com dois kettlebells).
   */
  consumoPorAluno?: Partial<Record<RecursoHiit, number>>;
}

/**
 * Exercício que não ocupa vaga de força (burpee, air bike, power clean), então
 * não tem instância: serve ao HIIT, ao Cross ou aos dois — e tem `hiit` ou
 * `cross`. O bloco H nunca o vê — `lerExercicioCatalogo` o descarta, e só
 * `lerItemCatalogo` o lê.
 */
export interface ExercicioSemForca extends Omit<ExercicioCatalogo, 'instancia'> {
  instancia: null;
}

/** Exercício sem força que serve ao HIIT (`catalogo-hiit.ts`). */
export interface ExercicioSoHiit extends ExercicioSemForca {
  hiit: DadosHiit;
}

/** Exercício sem força que só serve ao Cross (`catalogo-cross.ts`). */
export interface ExercicioSoCross extends ExercicioSemForca {
  cross: DadosCross;
}

/** Um documento de `catalogoExercicios/`: de força (com instância) ou sem força (HIIT e/ou Cross). */
export type ItemCatalogo = ExercicioCatalogo | ExercicioSemForca;

/* ───────────────────── coaches/{uid}/semanas/{AAAA-Www} ───────────────────── */

export type StatusSemana = 'rascunho' | 'publicado';

/** Um exercício do bloco principal, como gravado (nome copiado do catálogo). */
export interface ExercicioProgramado {
  exercicioId: string;
  /** Cópia do catálogo na hora de salvar — o aluno lê a semana sem ler o catálogo. */
  nome: string;
  series: number;
  /** Texto porque o coach escreve faixa: '8-10', '12', 'até a falha'. */
  repeticoes: string;
  /** Descanso entre as séries DESTE exercício. Sem valor no pedido, vale o `descansos.entreSeriesSeg` do dia. */
  descansoSeg: number;
  /** CALCULADO (catálogo): a vaga que o exercício ocupa. Para a tela não precisar ler o catálogo. */
  instancia: Instancia;
  /** CALCULADO (catálogo): os recursos limitados que ele ocupa — é o que a tela destaca num alerta. */
  recursos: RecursoInventario[];
}

export interface Descansos {
  /** Entre séries do mesmo exercício. */
  entreSeriesSeg: number;
  /** Ao trocar de estação. */
  entreExerciciosSeg: number;
}

export type PapelSessao = 'principal' | 'alternativa';

export interface SessaoForcaDoDia {
  sessao: SessaoH;
  papel: PapelSessao;
  /** Rótulo de `MATRIZ_H` ('Força Base — Agachar/Empurrar'). */
  nome: string;
}

export interface BlocoMetabolico {
  modalidade: SessaoMetabolica;
  papel: PapelSessao;
  formato: string;
  descricao: string;
}

export interface DiaProgramado {
  /** O primeiro é a aula principal; os demais, alternativa. Vazio = dia sem aula. */
  treinos: Modalidade[];
  /** Exatamente `EXERCICIOS_POR_BLOCO` quando o dia tem sessão H; vazio quando não tem. */
  blocoPrincipal: ExercicioProgramado[];
  /** CALCULADO: a sessão H do dia (no máximo uma), ou null. */
  sessaoForca: SessaoForcaDoDia | null;
  /** CALCULADO: Cross/Hyrox/HIIT do dia, sinalizados. */
  blocosMetabolicos: BlocoMetabolico[];
  cadencia: string;
  descansos: Descansos;
  /** CALCULADO no servidor: unidades de cada recurso que o bloco ocupa ao mesmo tempo. */
  consumoEquipamentos: Partial<Record<RecursoInventario, number>>;
  /**
   * As estações do HIIT, só em dia com HIIT na grade. O MESMO HIIT na sexta e
   * no sábado, como o H3. `null` em semana gerada antes do gerador do HIIT: o
   * dia só sinaliza o HIIT (`blocosMetabolicos`) e o coach passa na aula.
   */
  hiit: HiitProgramado | null;
  /** O WOD, só em dia com Cross na grade. `null` em semana de antes do gerador do Cross. */
  cross: WodProgramado | null;
  /** O Hyrox, só em dia com Hyrox na grade. `null` em semana de antes do gerador do Hyrox. */
  hyrox: HyroxProgramado | null;
  /**
   * Por que o dia NÃO tem aula (feriado, recesso, evento) — só em dia sem
   * `treinos`. O aluno vê o aviso no lugar do treino. `null` = dia com aula;
   * ausente = semana de antes do aviso.
   */
  aviso?: AvisoDoDia | null;
}

/* ───────────────────── Semana em branco (decisão do coach, 06/10/2026) ───────────────────── */

/**
 * Dia sem aula: feriado, recesso ou evento (o Murph, por exemplo). O status
 * da semana continua `rascunho`/`publicado` — a regra do Firestore libera a
 * semana ao aluno por `status == 'publicado'`; o motivo mora no DIA.
 */
export const TIPOS_AVISO = ['feriado', 'recesso', 'evento'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];
export const NOME_TIPO_AVISO: Readonly<Record<TipoAviso, string>> = { feriado: 'Feriado', recesso: 'Recesso', evento: 'Evento' };
/** Texto livre do aviso (orientações e horário de um evento cabem). */
export const MAX_TEXTO_AVISO = 500;

export interface AvisoDoDia {
  tipo: TipoAviso;
  /** 'Recesso de fim de ano', 'Murph — sábado 8h na praça'. Pode ser vazio. */
  texto: string;
}

/** Um slot de estação do HIIT. Unilateral aparece em dois slots seguidos, D e depois E. */
export interface SlotHiit {
  exercicioId: string;
  /** Cópia do catálogo, como no bloco H. */
  nome: string;
  /** CALCULADO: 'D' e 'E' no unilateral (dois slots seguidos); null no bilateral. */
  lado: 'D' | 'E' | null;
  /**
   * CALCULADO (catálogo): unidades de cada recurso por ALUNO. Fica gravado para
   * a reconferência do inventário (turma ou limite novo) não precisar reler o
   * catálogo — como o `consumoEquipamentos` do bloco H.
   */
  consumoPorAluno: Partial<Record<RecursoHiit, number>>;
}

export interface EstacaoProgramada {
  estacao: EstacaoHiit;
  /** `NOME_ESTACAO_HIIT` — 'Pernas'. */
  nome: string;
  /** `PROTOCOLO_HIIT`. */
  protocolo: string;
  /** Exatamente `SLOTS_POR_ESTACAO` quando completa. */
  slots: SlotHiit[];
}

/** O HIIT da semana: UM só, que aparece na sexta (alternativa) e no sábado (principal). */
export interface HiitProgramado {
  /** As 4 estações, na ordem sorteada — é a ordem em que a lousa e o app mostram. */
  estacoes: EstacaoProgramada[];
}

/**
 * Equipamento do HIIT acima do limite. `slot` é o slot (1–4) em que as estações
 * juntas passam do limite; `null` quando um exercício SOZINHO já passa (sandbag
 * para 2 alunos, com 1 sandbag no box).
 */
export interface AlertaHiit {
  recurso: RecursoHiit;
  usado: number;
  limite: number;
  slot: number | null;
  exercicios: string[];
  /**
   * Só no alerta ESPACIAL (recurso de `RECURSOS_FIXOS_HIIT` em mais de uma
   * estação): as estações que o usam. Aí `usado` é o número de estações,
   * `limite` é 1 e `slot` é null. Ausente = alerta de unidades.
   */
  estacoes?: EstacaoHiit[];
}

/** Um alerta do HIIT na semana: o mesmo HIIT está na sexta e no sábado, e o alerta sai uma vez com os dois dias. */
export interface AlertaHiitDaSemana extends AlertaHiit {
  dias: DiaSemana[];
}

/** Um exercício que nem sozinho cabe no inventário (sandbag para 2 alunos) e ficou fora do sorteio. */
export interface ForaPorEquipamento {
  exercicioId: string;
  nome: string;
  recurso: RecursoHiit;
  precisa: number;
  limite: number;
}

export interface SemanaBox {
  status: StatusSemana;
  /** Segunda 00:00 e sábado 23:59:59.999 no fuso do box. */
  dataInicio: Timestamp;
  dataFim: Timestamp;
  /** 'AAAA-MM' da segunda-feira — o filtro do histórico mensal do box. */
  anoMes: string;
  dias: Record<DiaSemana, DiaProgramado>;
  /** CALCULADO: o que passa do inventário ativo. Semana com alerta não publica. */
  alertas: AlertaEquipamento[];
  /** CALCULADO: equipamento do HIIT acima do limite. Também impede publicar. */
  alertasHiit: AlertaHiitDaSemana[];
  /** CALCULADO: equipamento do WOD acima do limite. Também impede publicar. */
  alertasCross: AlertaCrossDaSemana[];
  /** CALCULADO: estação do Hyrox sem o equipamento. Também impede publicar. */
  alertasHyrox: AlertaHyroxDaSemana[];
  /** CALCULADO: a turma usada na conta do HIIT e do Cross (`alunosPorAula` do inventário). */
  alunosPorAula: number;
  /** CALCULADO: por que ainda não publica (vazio = pode). A tela mostra, quem decide é `publicarSemanaBox`. */
  problemasParaPublicar: string[];
  /** CALCULADO: os limites ativos do inventário usados na última conta ("Smith 2/2" na tela). */
  limitesUsados: Record<RecursoInventario, number>;
  /** Só em semana saída do gerador; some quando o coach salva uma edição à mão. */
  geracao?: GeracaoSemana;
  atualizadoEm: Timestamp;
  publicadoEm?: Timestamp;
}

/** O que o gerador decidiu, guardado para a tela mostrar ao reabrir o rascunho. */
export interface GeracaoSemana {
  variacao: number;
  semanaAnterior: string | null;
  trocas: TrocaEquipamento[];
  /** Do bloco H e do HIIT (estes começam com 'HIIT:'). */
  avisos: string[];
  /** Exercícios de HIIT que ficaram fora do sorteio por equipamento. */
  hiitFora: ForaPorEquipamento[];
}

/* ───────────────────────── gerarMatrizSemanalBox ───────────────────────── */

/**
 * O que o cliente manda. SÓ isto: a semana (pela chave ou por qualquer data
 * dela). Escolha de exercício, rodízio e trava de equipamento são do servidor.
 */
export interface PedidoGerarMatriz {
  semanaId?: string;
  /** 'AAAA-MM-DD' de qualquer dia da semana desejada. */
  data?: string;
  /** Outro sorteio para a mesma semana (0 = o padrão). */
  variacao?: number;
  /** Sobrescrever um rascunho que já existe. Semana publicada nunca é sobrescrita. */
  substituirRascunho?: boolean;
  /**
   * Semana EM BRANCO: os 6 dias sem aula, com este aviso, sem sorteio
   * (feriado, recesso, evento). O coach programa um dia depois, se quiser
   * (`programarDiaBox`).
   */
  emBranco?: AvisoDoDia;
}

/** Um exercício trocado pela trava de equipamento. */
export interface TrocaEquipamento {
  sessao: SessaoH;
  posicao: number;
  de: string;
  para: string;
  /** Nomes do catálogo, para a tela não traduzir id. */
  deNome: string;
  paraNome: string;
  recurso: RecursoInventario;
}

export interface RespostaGerarMatriz {
  semanaId: string;
  status: 'rascunho';
  semanaAnterior: string | null;
  dias: Record<DiaSemana, DiaProgramado>;
  alertas: AlertaEquipamento[];
  trocas: TrocaEquipamento[];
  avisos: string[];
  problemasParaPublicar: string[];
  limitesUsados: Record<RecursoInventario, number>;
  alertasHiit: AlertaHiitDaSemana[];
  alunosPorAula: number;
  hiitFora: ForaPorEquipamento[];
  alertasCross: AlertaCrossDaSemana[];
  alertasHyrox: AlertaHyroxDaSemana[];
}

export interface AlertaEquipamento {
  dia: DiaSemana;
  recurso: RecursoInventario;
  usado: number;
  limite: number;
}

/* ───────────────────────── coaches/{uid}/inventario/atual ───────────────────────── */

export interface StatusRecurso {
  /** Unidades que o box tem. */
  total: number;
  /** Unidades paradas para conserto. */
  emManutencao: number;
  observacao: string;
}

export interface InventarioBox {
  /** Os recursos do bloco H e os do HIIT (`RECURSOS_BOX`). */
  equipamentos: Record<RecursoBox, StatusRecurso>;
  /** CALCULADO: `total - emManutencao`. É o limite que a semana respeita. */
  limitesAtivos: Record<RecursoBox, number>;
  /** Tamanho máximo da turma. Sem valor gravado, `ALUNOS_POR_AULA_PADRAO` (6). */
  alunosPorAula: number;
  atualizadoEm: Timestamp;
}

/* ─────────────────── treinoAluno/{email}/historico/{AAAA-MM} ─────────────────── */

export interface PresencaAluno {
  /** `${data}_${modalidade}` — registrar a mesma sessão de novo SUBSTITUI. */
  sessaoId: string;
  /** 'AAAA-MM-DD', derivada de semana + dia (não vem do aparelho). */
  data: string;
  semanaId: string;
  dia: DiaSemana;
  modalidade: Modalidade;
  coachUid: string;
  /** Séries válidas que o aluno fez, por exercício. */
  series: Record<string, number>;
  /** Volume desta sessão por músculo — `volumeAcumulado` é a soma destes. */
  volume: Partial<Record<Musculo, number>>;
  registradoEm: Timestamp;
}

export interface FeedbackExercicio {
  sessaoId: string;
  data: string;
  exercicioId: string;
  /** Percepção subjetiva de esforço, 0–10. */
  pse: number | null;
  /** Repetições em reserva que o aluno reportou, 0–10. */
  rirReportado: number | null;
  comentario: string;
}

export interface HistoricoMensalAluno {
  anoMes: string;
  /** Séries válidas ponderadas (principal 1,0; secundário 0,5) por músculo, no mês. */
  volumeAcumulado: Partial<Record<Musculo, number>>;
  presencas: PresencaAluno[];
  feedbacks: FeedbackExercicio[];
  atualizadoEm: Timestamp;
}
