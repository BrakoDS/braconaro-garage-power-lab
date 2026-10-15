/**
 * AS ESTAÇÕES DO HYROX — o formato de prova adaptado ao box.
 *
 * As 8 estações na ordem da prova, a corrida antes de cada uma (com a air bike
 * no lugar) e a prescrição. Ficam FORA de `catalogoExercicios/` de propósito:
 * são estações de prova, com prescrição própria, e não exercícios avulsos que
 * o H, o HIIT ou o Cross sorteiam.
 *
 * ── A quinta do Garage Power Lab (decisão do coach, 15/10/2026) ─────────────
 * O aluno escolhe o MODELO (Cardio Focus, Strength Focus, Doubles) e o NÍVEL
 * (Start, Fit, Garage Open, Pro). A tabela abaixo é a do coach:
 *  - corrida, SkiErg e Rowing têm o número de cada modelo;
 *  - as estações que vêm em FAIXA (Sled 12,5–25 m, Wall Balls 30–50…) usam o
 *    menor valor no Cardio e o maior no Strength e no Doubles (`faixa`);
 *  - Sled, Farmers e Sandbag andam na pista do box: distâncias em múltiplos de
 *    12,5 m (`PISTA_HYROX_M`), arredondadas da faixa do coach;
 *  - Doubles = o TOTAL da dupla, que divide entre os dois (a corrida é junta);
 *  - as cargas são por nível, feminino e masculino;
 *  - a air bike no lugar da corrida é em calorias (20 m = 1 cal), em todo
 *    nível e modelo.
 * Equipamento: o SkiErg é feito nos 2 monocross com puxada para baixo (o
 * simulador da casa, até 2 alunos por vez — `CAPACIDADE_SKIERG`; o transbordo
 * vai para a corda naval); o Rowing, no remo indoor oficial — sem substituta.
 *
 * `recursos`: as unidades do inventário que a estação precisa ATIVAS.
 * `substituta`: o que roda quando o equipamento está em manutenção (ou quando
 * o coach escolhe). Burpee Broad Jump e Rowing não têm.
 */
import {
  METROS_POR_CAL_AIRBIKE, MODELOS_HYROX, NIVEIS_HYROX, PISTA_HYROX_M,
  type CargaHyrox, type CorridaHyrox, type EstacaoHyrox, type ModeloHyrox, type Musculo, type NivelHyrox,
  type PrescricaoModelosHyrox, type RecursoBox, type TipoHyrox,
} from './modelo-box';

export interface VarianteHyrox {
  nome: string;
  tipo: TipoHyrox;
  /** A prescrição por modelo × nível. */
  modelos: PrescricaoModelosHyrox;
  /** As cargas por nível (F e M); `null` sem carga. */
  cargas: Record<NivelHyrox, CargaHyrox> | null;
  /** O resumo da carga em uma linha. */
  carga: string;
  nota: string;
  /** Distância na pista do box: múltiplos de `PISTA_HYROX_M`, também quando o formato corta pela metade. */
  piso: boolean;
  recursos: Partial<Record<RecursoBox, number>>;
}

export interface DadosEstacaoHyrox extends VarianteHyrox {
  /** Posição na prova, 1 a 8. */
  n: number;
  /** A estação da competição. */
  base: string;
  substituta: VarianteHyrox | null;
}

const nivel = <T>(iniciante: T, intermediario: T, avancado: T, competicao: T): Record<NivelHyrox, T> =>
  ({ iniciante, intermediario, avancado, competicao });

/** [Cardio, Strength, Doubles] de um nível. */
type TrioModelos = readonly [number, number, number];

/** A tabela do coach: o trio [Cardio, Strength, Doubles] de cada nível (Start, Fit, Garage Open, Pro). */
const tabela = (start: TrioModelos, fit: TrioModelos, open: TrioModelos, pro: TrioModelos): PrescricaoModelosHyrox =>
  Object.fromEntries(MODELOS_HYROX.map((m, i) => [m, nivel(start[i], fit[i], open[i], pro[i])])) as PrescricaoModelosHyrox;

/** Estação em faixa: o menor valor no Cardio, o maior no Strength e no Doubles. */
const faixa = (min: number, max: number): TrioModelos => [min, max, max];

/** Na pista do box: o múltiplo de 12,5 m mais perto (nunca menos que uma ida). */
export const naPista = (metros: number): number => Math.max(PISTA_HYROX_M, Math.round(metros / PISTA_HYROX_M) * PISTA_HYROX_M);

/** Faixa de uma estação de piso, já na pista. */
const faixaPiso = (min: number, max: number): TrioModelos => faixa(naPista(min), naPista(max));

/** O mesmo número em todo modelo (substitutas que não vêm da tabela do coach). */
const igualEmTodoModelo = (porNivel: Record<NivelHyrox, number>): PrescricaoModelosHyrox =>
  Object.fromEntries(MODELOS_HYROX.map((m) => [m, { ...porNivel }])) as PrescricaoModelosHyrox;

const carga = (f: string, m: string): CargaHyrox => ({ f, m });

/** 'F 60 a 102–152 kg · M 90 a 152–202 kg': do Start ao Pro, para o resumo de uma linha. */
const resumoCargas = (c: Record<NivelHyrox, CargaHyrox>) =>
  `F ${c.iniciante.f} a ${c.competicao.f} · M ${c.iniciante.m} a ${c.competicao.m} (pelo nível)`;

/** A corrida antes de cada estação, em metros: [Cardio, Strength, Doubles] por nível. A dupla corre JUNTA. */
export const CORRIDA_MODELOS_HYROX: Readonly<PrescricaoModelosHyrox> = tabela(
  [300, 200, 200], [400, 300, 300], [500, 300, 500],
  // Pro no Cardio: a faixa do coach é 500–600 m; 600 para ficar acima do Garage Open.
  [600, 400, 400],
);

/** A air bike no lugar de uma corrida, em calorias (20 m = 1 cal). */
export const caloriasDaCorrida = (metros: number): number => Math.max(1, Math.round(metros / METROS_POR_CAL_AIRBIKE));

/**
 * A corrida de uma rodada por nível no formato de antes (`corrida` gravada, que
 * o app de antes lê): a do Cardio Focus, com a air bike em segundos (100 m = 30 s).
 */
export const CORRIDA_HYROX: Readonly<Record<NivelHyrox, CorridaHyrox>> = Object.fromEntries(
  NIVEIS_HYROX.map((n) => [n, { metros: CORRIDA_MODELOS_HYROX.cardio[n], bikeSeg: Math.round(CORRIDA_MODELOS_HYROX.cardio[n] * 0.3) }]),
) as Record<NivelHyrox, CorridaHyrox>;

const CARGAS_SLED_PUSH = nivel(carga('60 kg', '90 kg'), carga('80 kg', '120 kg'), carga('102 kg', '152 kg'), carga('102–152 kg', '152–202 kg'));
const CARGAS_SLED_PULL = nivel(carga('40 kg', '60 kg'), carga('60 kg', '80 kg'), carga('78 kg', '103 kg'), carga('78–103 kg', '103–153 kg'));
const CARGAS_FARMERS = nivel(carga('2× 8 kg', '2× 12 kg'), carga('2× 12 kg', '2× 18–20 kg'), carga('2× 16 kg', '2× 24 kg'), carga('2× 16–24 kg', '2× 24–32 kg'));
const CARGAS_SANDBAG = nivel(
  carga('peso corporal ou saco 5 kg', 'peso corporal ou saco 10 kg'), carga('8 kg', '15 kg'), carga('10 kg', '20 kg'), carga('10–20 kg', '20–30 kg'),
);
const CARGAS_WALL_BALL = nivel(carga('3 kg', '4 kg'), carga('4 kg', '6 kg'), carga('4 kg', '6 kg'), carga('4–6 kg', '6–9 kg'));

const SLED = tabela(faixaPiso(12.5, 25), faixaPiso(25, 50), faixaPiso(25, 50), faixaPiso(37.5, 50));
const FARMERS = tabela(faixaPiso(60, 100), faixaPiso(80, 150), faixaPiso(100, 200), faixaPiso(120, 200));
const SANDBAG = tabela(faixaPiso(25, 50), faixaPiso(40, 75), faixaPiso(50, 100), faixaPiso(60, 100));
const WALL_BALL = tabela(faixa(30, 50), faixa(40, 75), faixa(50, 100), faixa(60, 100));
const ERG = tabela([300, 450, 600], [400, 600, 800], [500, 750, 1000], [600, 1000, 1000]);

export const DADOS_ESTACAO_HYROX: Readonly<Record<EstacaoHyrox, DadosEstacaoHyrox>> = {
  skierg: {
    n: 1, base: 'SkiErg', nome: 'SkiErg (monocross)', tipo: 'metros', modelos: ERG, piso: false,
    cargas: null, carga: 'monocross com puxada para baixo · até 2 por vez; com os dois ocupados, corda naval',
    nota: 'O SkiErg da casa: os 2 monocross lado a lado, com puxada para baixo — até 2 alunos ao mesmo tempo. '
      + 'Chegou com os dois ocupados? Faça a corda naval (a substituta), sem esperar. Puxada explosiva, tronco à frente.',
    recursos: { monocross: 1 },
    substituta: {
      nome: 'Battle rope (corda naval)', tipo: 'segundos', modelos: igualEmTodoModelo(nivel(45, 60, 75, 150)), piso: false,
      cargas: null, carga: 'corda de 4 m', nota: 'Monocross parados: ondas alternadas, ritmo constante — a mesma puxada de tronco.',
      recursos: { cordaNaval: 1 },
    },
  },
  sled_push: {
    n: 2, base: 'Sled Push', nome: 'Sled Push (empurrar trenó)', tipo: 'metros', modelos: SLED, piso: true,
    cargas: CARGAS_SLED_PUSH, carga: resumoCargas(CARGAS_SLED_PUSH),
    nota: 'Trenó baixo, tronco firme, passos curtos e potentes. Distância em idas de 12,5 m na pista.',
    recursos: { sled: 1 },
    substituta: {
      nome: 'Plate push (anilha no turf)', tipo: 'metros', modelos: SLED, piso: true,
      cargas: null, carga: 'anilha de 15–20 kg', nota: 'Mãos na anilha, quadril baixo, empurra no turf como o trenó.',
      recursos: {},
    },
  },
  sled_pull: {
    n: 3, base: 'Sled Pull', nome: 'Sled Pull (puxar trenó)', tipo: 'metros', modelos: SLED, piso: true,
    cargas: CARGAS_SLED_PULL, carga: resumoCargas(CARGAS_SLED_PULL),
    nota: 'Puxe a corda mão sobre mão, quadril baixo e tronco estável. Distância em idas de 12,5 m na pista.',
    recursos: { sled: 1, cordaNaval: 1 },
    substituta: {
      nome: 'Remada no TRX', tipo: 'reps', modelos: igualEmTodoModelo(nivel(15, 20, 25, 50)), piso: false,
      cargas: null, carga: 'peso corporal (ângulo pelo nível)', nota: 'Corpo em prancha, puxa o peito até as alças.',
      recursos: { trx: 1 },
    },
  },
  burpee_broad_jump: {
    n: 4, base: 'Burpee Broad Jump', nome: 'Burpee Broad Jump', tipo: 'metros',
    modelos: tabela(faixa(20, 40), faixa(30, 60), faixa(40, 80), faixa(50, 80)), piso: false,
    cargas: null, carga: 'peso corporal',
    nota: 'Como na prova (avança em metros): a cada rep, peito ao chão + salto para a frente. No Start, pode trocar por burpees simples.',
    recursos: {},
    substituta: null,
  },
  remo: {
    n: 5, base: 'Rowing', nome: 'Rowing (remo indoor oficial)', tipo: 'metros', modelos: ERG, piso: false,
    cargas: null, carga: 'remo indoor oficial',
    nota: 'No remo oficial da casa. Cadência de prova: empurra com a perna, depois puxa.',
    recursos: { remo: 1 },
    substituta: null,
  },
  farmers_carry: {
    n: 6, base: 'Farmers Carry', nome: 'Farmer’s carry', tipo: 'metros', modelos: FARMERS, piso: true,
    cargas: CARGAS_FARMERS, carga: resumoCargas(CARGAS_FARMERS),
    nota: 'Tronco firme, ombros para trás, passos curtos. Distância em idas de 12,5 m na pista.',
    recursos: {},
    substituta: {
      nome: 'Farmer’s carry com kettlebells', tipo: 'metros', modelos: FARMERS, piso: true,
      cargas: null, carga: '2 kettlebells (16–22 kg)', nota: 'Tronco firme, ombros para trás, passos curtos.',
      recursos: { kettlebell: 2 },
    },
  },
  sandbag_lunges: {
    n: 7, base: 'Sandbag Lunges', nome: 'Sandbag Lunges (avanço com saco de areia)', tipo: 'metros', modelos: SANDBAG, piso: true,
    cargas: CARGAS_SANDBAG, carga: resumoCargas(CARGAS_SANDBAG),
    nota: 'Saco apoiado nos ombros; joelho de trás toca o chão, tronco ereto. Distância em idas de 12,5 m na pista.',
    recursos: { sandbag: 1 },
    substituta: {
      nome: 'Afundo andando com kettlebell (goblet)', tipo: 'metros', modelos: SANDBAG, piso: true,
      cargas: null, carga: 'kettlebell 12–20 kg no peito', nota: 'Joelho de trás toca o chão, tronco ereto.',
      recursos: { kettlebell: 1 },
    },
  },
  wall_ball: {
    n: 8, base: 'Wall Balls', nome: 'Wall ball', tipo: 'reps', modelos: WALL_BALL, piso: false,
    cargas: CARGAS_WALL_BALL, carga: resumoCargas(CARGAS_WALL_BALL),
    nota: 'Agachou → arremessou ao alvo; recebe já agachando.',
    recursos: { wallBall: 1 },
    substituta: {
      nome: 'Thruster com halteres', tipo: 'reps', modelos: WALL_BALL, piso: false,
      cargas: null, carga: 'par de halteres 5–10 kg', nota: 'Agachamento completo e empurra acima da cabeça num movimento só.',
      recursos: { halteres: 1 },
    },
  },
};

/** A prescrição de um modelo num nível (a do Cardio Focus é a `prescricao` de antes). */
export const prescricaoHyrox = (v: Pick<VarianteHyrox, 'modelos'>, modelo: ModeloHyrox, n: NivelHyrox): number => v.modelos[modelo][n];

/* ─────────────── Os músculos de cada estação (volume do aluno, 06/10/2026) ───────────────
 * O volume do Hyrox entra na MESMA conta da força (`volumeDaSessao`: 1,0 por
 * músculo principal, 0,5 por secundário). Primeira versão para o coach revisar.
 *
 * Substituta que JÁ é exercício do catálogo (corda naval, remada no TRX,
 * farmer com kettlebells, afundo com kettlebell, thruster com halteres) usa
 * exatamente os músculos de lá — `checar-cross` trava a igualdade. A corrida e
 * a air bike da corrida também: são `corrida` e `air_bike_sprint`.
 */
export interface MusculosHyrox {
  musculoPrincipal: Musculo[];
  musculosSecundarios: Musculo[];
}

const mus = (musculoPrincipal: Musculo[], musculosSecundarios: Musculo[]): MusculosHyrox => ({ musculoPrincipal, musculosSecundarios });

export const MUSCULOS_HYROX: Readonly<Record<EstacaoHyrox, { estacao: MusculosHyrox; substituta: MusculosHyrox | null }>> = {
  // Puxada de tronco (grande dorsal) e o core que dobra; os tríceps empurram o fim do movimento.
  skierg: { estacao: mus(['costas', 'core'], ['triceps', 'ombro', 'gluteo']), substituta: mus(['ombro', 'core'], ['antebraco']) },
  // Empurrar o trenó: perna e glúteo; braço e core travam o corpo.
  sled_push: {
    estacao: mus(['quadriceps', 'gluteo'], ['panturrilha', 'ombro', 'triceps', 'core']),
    substituta: mus(['quadriceps', 'gluteo'], ['panturrilha', 'ombro', 'triceps', 'core']),
  },
  // Puxar a corda mão sobre mão: costas e bíceps; a pegada e a base de perna seguram.
  sled_pull: {
    estacao: mus(['costas', 'biceps'], ['antebraco', 'posterior_coxa', 'gluteo', 'core']),
    substituta: mus(['costas'], ['biceps', 'core']),
  },
  // Agachar, saltar à frente e descer ao chão: perna, glúteo e peito.
  burpee_broad_jump: { estacao: mus(['quadriceps', 'gluteo', 'peito'], ['ombro', 'triceps', 'core', 'panturrilha']), substituta: null },
  // A remada do remo indoor: perna empurra, costas puxam. Sem substituta (o remo é oficial da casa).
  remo: { estacao: mus(['costas', 'quadriceps'], ['posterior_coxa', 'gluteo', 'biceps', 'core']), substituta: null },
  // Carregar peso: pegada e trapézio; o core segura o tronco.
  farmers_carry: { estacao: mus(['antebraco', 'trapezio'], ['core']), substituta: mus(['antebraco', 'trapezio'], ['core']) },
  // Avanço com o saco nas costas: perna e glúteo; posterior, core e trapézio seguram.
  sandbag_lunges: {
    estacao: mus(['quadriceps', 'gluteo'], ['posterior_coxa', 'core', 'trapezio']),
    substituta: mus(['quadriceps', 'gluteo'], ['core']),
  },
  // Agachar e arremessar a bola: perna e ombro.
  wall_ball: { estacao: mus(['quadriceps', 'ombro'], ['gluteo']), substituta: mus(['ombro', 'quadriceps'], ['gluteo', 'triceps']) },
};

/** A corrida antes de cada estação (`corrida` do catálogo) e a air bike no lugar dela (`air_bike_sprint`). */
export const MUSCULOS_CORRIDA_HYROX: Readonly<{ corrida: MusculosHyrox; bike: MusculosHyrox }> = {
  corrida: mus(['quadriceps', 'posterior_coxa'], ['panturrilha', 'gluteo']),
  bike: mus(['quadriceps', 'core'], ['ombro', 'costas']),
};
