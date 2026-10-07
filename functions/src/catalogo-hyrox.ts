/**
 * AS ESTAÇÕES DO HYROX — o formato de prova adaptado ao box.
 *
 * Portado de `coach/montador-de-treino/core/hyrox.js` (o template do montador
 * antigo): as 8 estações na ordem da prova, a prescrição por nível e a corrida
 * com a alternativa na air bike. Ficam FORA de `catalogoExercicios/` de
 * propósito: são estações de prova, com prescrição própria por nível, e não
 * exercícios avulsos que o H, o HIIT ou o Cross sorteiam.
 *
 * O que é novo (06/10/2026):
 *  - o nível 'competicao' (o 'competitivo' do montador antigo);
 *  - `recursos`: as unidades do inventário que a estação precisa ATIVAS;
 *  - `substituta`: o que roda quando o equipamento está em manutenção (ou
 *    quando o coach escolhe). Burpee Broad Jump não usa equipamento e não tem.
 *    Ponto de partida para o coach revisar, como as adaptações do catálogo.
 *
 * Os halteres pesados do Farmer's (12,5–17,5 kg) não são os das torres de
 * 1–10 kg que o inventário conta: a estação não pede recurso, e a substituta
 * com kettlebells fica para quando o coach quiser.
 */
import type { CorridaHyrox, EstacaoHyrox, Musculo, NivelHyrox, RecursoBox, TipoHyrox } from './modelo-box';

export interface VarianteHyrox {
  nome: string;
  tipo: TipoHyrox;
  prescricao: Record<NivelHyrox, number>;
  carga: string;
  nota: string;
  recursos: Partial<Record<RecursoBox, number>>;
}

export interface DadosEstacaoHyrox extends VarianteHyrox {
  /** Posição na prova, 1 a 8. */
  n: number;
  /** A estação da competição. */
  base: string;
  substituta: VarianteHyrox | null;
}

/** Corrida de UMA rodada por nível (tiros de 50 m ida e volta), e a air bike equivalente. */
export const CORRIDA_HYROX: Readonly<Record<NivelHyrox, CorridaHyrox>> = {
  iniciante: { metros: 100, bikeSeg: 48 },
  intermediario: { metros: 300, bikeSeg: 60 },
  avancado: { metros: 500, bikeSeg: 120 },
  competicao: { metros: 1000, bikeSeg: 240 },
};

const nivel = (iniciante: number, intermediario: number, avancado: number, competicao: number) =>
  ({ iniciante, intermediario, avancado, competicao });

export const DADOS_ESTACAO_HYROX: Readonly<Record<EstacaoHyrox, DadosEstacaoHyrox>> = {
  skierg: {
    n: 1, base: 'SkiErg', nome: 'SkiErg (simulador de esqui)', tipo: 'reps', prescricao: nivel(60, 80, 100, 250),
    carga: 'carga moderada (polia)',
    nota: 'Nos monocross lado a lado. Ritmo de esqui: puxada explosiva, tronco à frente.',
    recursos: { monocross: 1 },
    substituta: {
      nome: 'Battle rope (corda naval)', tipo: 'segundos', prescricao: nivel(45, 60, 75, 150),
      carga: 'corda de 4 m', nota: 'Ondas alternadas, ritmo constante — a mesma puxada de tronco do SkiErg.',
      recursos: { cordaNaval: 1 },
    },
  },
  sled_push: {
    n: 2, base: 'Sled Push', nome: 'Sled Push (empurrar trenó)', tipo: 'metros', prescricao: nivel(20, 30, 40, 100),
    carga: 'trenó + 15–45 kg (1 a 3 anilhas por nível)',
    nota: 'Trenó baixo, tronco firme, passos curtos e potentes no turf de 5 m.',
    recursos: { sled: 1 },
    substituta: {
      nome: 'Plate push (anilha no turf)', tipo: 'metros', prescricao: nivel(20, 30, 40, 100),
      carga: 'anilha de 15–20 kg', nota: 'Mãos na anilha, quadril baixo, empurra no turf como o trenó.',
      recursos: {},
    },
  },
  sled_pull: {
    n: 3, base: 'Sled Pull', nome: 'Sled Pull (puxar trenó)', tipo: 'metros', prescricao: nivel(20, 30, 40, 100),
    carga: 'trenó + 15–45 kg, puxar pela corda',
    nota: 'Puxe a corda mão sobre mão, quadril baixo e tronco estável.',
    recursos: { sled: 1, cordaNaval: 1 },
    substituta: {
      nome: 'Remada no TRX', tipo: 'reps', prescricao: nivel(15, 20, 25, 50),
      carga: 'peso corporal (ângulo pelo nível)', nota: 'Corpo em prancha, puxa o peito até as alças.',
      recursos: { trx: 1 },
    },
  },
  burpee_broad_jump: {
    n: 4, base: 'Burpee Broad Jump', nome: 'Burpee Broad Jump', tipo: 'metros', prescricao: nivel(20, 40, 60, 100),
    carga: 'peso corporal',
    nota: 'Como na prova (avança em metros): a cada rep, peito ao chão + salto para a frente.',
    recursos: {},
    substituta: null,
  },
  remo: {
    n: 5, base: 'Rowing', nome: 'Rowing (simulador de remo)', tipo: 'reps', prescricao: nivel(60, 80, 100, 250),
    carga: 'carga leve/moderada (polia)',
    nota: 'No 3º monocross (o móvel). Cadência de remo: rápido e ritmado.',
    recursos: { monocross: 1 },
    substituta: {
      nome: 'Air bike', tipo: 'calorias', prescricao: nivel(10, 15, 20, 40),
      carga: '—', nota: 'Ritmo forte e constante, braços e pernas juntos.',
      recursos: { airbike: 1 },
    },
  },
  farmers_carry: {
    n: 6, base: 'Farmers Carry', nome: 'Farmer’s carry (halteres pesados)', tipo: 'metros', prescricao: nivel(80, 100, 150, 200),
    carga: 'halteres pesados (12,5–17,5 kg)',
    nota: 'Tronco firme, ombros para trás, passos curtos.',
    recursos: {},
    substituta: {
      nome: 'Farmer’s carry com kettlebells', tipo: 'metros', prescricao: nivel(80, 100, 150, 200),
      carga: '2 kettlebells (16–22 kg)', nota: 'Tronco firme, ombros para trás, passos curtos.',
      recursos: { kettlebell: 2 },
    },
  },
  sandbag_lunges: {
    n: 7, base: 'Sandbag Lunges', nome: 'Sandbag Lunges (avanço com saco de areia)', tipo: 'metros', prescricao: nivel(20, 30, 40, 100),
    carga: 'sandbag 20 kg nos ombros',
    nota: 'Saco apoiado nos ombros; joelho de trás toca o chão, tronco ereto.',
    recursos: { sandbag: 1 },
    substituta: {
      nome: 'Afundo andando com kettlebell (goblet)', tipo: 'metros', prescricao: nivel(20, 30, 40, 100),
      carga: 'kettlebell 12–20 kg no peito', nota: 'Joelho de trás toca o chão, tronco ereto.',
      recursos: { kettlebell: 1 },
    },
  },
  wall_ball: {
    n: 8, base: 'Wall Balls', nome: 'Wall ball', tipo: 'reps', prescricao: nivel(30, 50, 75, 100),
    carga: 'bola 10–14 lb',
    nota: 'Agachou → arremessou ao alvo; recebe já agachando.',
    recursos: { wallBall: 1 },
    substituta: {
      nome: 'Thruster com halteres', tipo: 'reps', prescricao: nivel(30, 50, 75, 100),
      carga: 'par de halteres 5–10 kg', nota: 'Agachamento completo e empurra acima da cabeça num movimento só.',
      recursos: { halteres: 1 },
    },
  },
};

/* ─────────────── Os músculos de cada estação (volume do aluno, 06/10/2026) ───────────────
 * O volume do Hyrox entra na MESMA conta da força (`volumeDaSessao`: 1,0 por
 * músculo principal, 0,5 por secundário). Primeira versão para o coach revisar.
 *
 * Substituta que JÁ é exercício do catálogo (corda naval, remada no TRX, air
 * bike, farmer com kettlebells, afundo com kettlebell, thruster com halteres)
 * usa exatamente os músculos de lá — `checar-cross` trava a igualdade. A
 * corrida e a air bike da corrida também: são `corrida` e `air_bike_sprint`.
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
  // A remada do simulador: perna empurra, costas puxam.
  remo: {
    estacao: mus(['costas', 'quadriceps'], ['posterior_coxa', 'gluteo', 'biceps', 'core']),
    substituta: mus(['quadriceps', 'core'], ['ombro', 'costas']),
  },
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
