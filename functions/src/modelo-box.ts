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
 *    edita (37 itens, com cargas). O daqui guarda só os cinco recursos que
 *    LIMITAM a montagem da semana.
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
 * Como cada sessão metabólica aparece no dia. O CONTEÚDO (movimentos) ainda é
 * do coach: os templates de Hyrox/HIIT/WOD do montador antigo não foram portados.
 * Textos de `compartilhado/config/modalidades.js` e `config/wod-formatos.js`.
 */
export const FORMATO_METABOLICO: Readonly<Record<SessaoMetabolica, { formato: string; descricao: string }>> = {
  Cross: { formato: 'WOD', descricao: 'AMRAP, EMOM, For Time ou Chipper — movimentos a definir pelo coach.' },
  Hyrox: { formato: 'For Time', descricao: 'Formato da competição: corrida intercalada com estações funcionais.' },
  HIIT: { formato: 'TABATA', descricao: '4 estações TABATA (Inferiores · Core · Superiores · Cardio), 16 rounds cada.' },
};

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
}

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
  atualizadoEm: Timestamp;
  publicadoEm?: Timestamp;
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
}

/** Um exercício trocado pela trava de equipamento. */
export interface TrocaEquipamento {
  sessao: SessaoH;
  posicao: number;
  de: string;
  para: string;
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
  equipamentos: Record<RecursoInventario, StatusRecurso>;
  /** CALCULADO: `total - emManutencao`. É o limite que a semana respeita. */
  limitesAtivos: Record<RecursoInventario, number>;
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
