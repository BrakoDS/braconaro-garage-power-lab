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
 *    LIMITAM a montagem da semana (os 5 do bloco H e os 9 do HIIT) e o tamanho
 *    da turma.
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

/** Tudo o que o inventário guarda: os recursos do bloco H e os do HIIT. */
export const RECURSOS_BOX = [...RECURSOS_INVENTARIO, ...RECURSOS_HIIT] as const;
export type RecursoBox = RecursoInventario | RecursoHiit;

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
 * Como cada sessão metabólica aparece no dia. O CONTEÚDO (movimentos) ainda é
 * do coach: os templates de Hyrox/HIIT/WOD do montador antigo não foram portados.
 * Textos de `compartilhado/config/modalidades.js` e `config/wod-formatos.js`.
 */
export const FORMATO_METABOLICO: Readonly<Record<SessaoMetabolica, { formato: string; descricao: string }>> = {
  Cross: { formato: 'WOD', descricao: 'AMRAP, EMOM, For Time ou Chipper — movimentos a definir pelo coach.' },
  Hyrox: { formato: 'For Time', descricao: 'Formato da competição: corrida intercalada com estações funcionais.' },
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
 * Exercício que só existe no HIIT (burpee, air bike): não ocupa vaga de força,
 * então não tem instância. O bloco H nunca o vê — `lerExercicioCatalogo` o
 * descarta, e só `lerItemCatalogo` o lê.
 */
export interface ExercicioSoHiit extends Omit<ExercicioCatalogo, 'instancia' | 'hiit'> {
  instancia: null;
  hiit: DadosHiit;
}

/** Um documento de `catalogoExercicios/`: de força (com instância) ou só de HIIT. */
export type ItemCatalogo = ExercicioCatalogo | ExercicioSoHiit;

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
}

/** Um slot de estação do HIIT. Unilateral aparece em dois slots seguidos, D e depois E. */
export interface SlotHiit {
  exercicioId: string;
  nome: string;
  lado: 'D' | 'E' | null;
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
  /** Na ordem sorteada — é a ordem em que a lousa e o app mostram. */
  estacoes: EstacaoProgramada[];
  /** CALCULADO: alunos por aula ÷ 4, para cima. A conta de equipamento usa este número. */
  alunosPorEstacao: number;
  /** CALCULADO: o pico de cada recurso num mesmo round, somando as 4 estações. */
  consumo: Partial<Record<RecursoHiit, number>>;
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
  avisos: string[];
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
