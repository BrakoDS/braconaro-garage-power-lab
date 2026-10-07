/**
 * CATÁLOGO SÓ DE HIIT — exercícios que não ocupam vaga de força (sem `instancia`)
 * e que o `seed-catalogo.ts` grava em `catalogoExercicios/` junto com o
 * `CATALOGO_BASE`.
 *
 * Origem (05/10/2026):
 *  - MIGRADOS: os exercícios com categoria 'hiit' do Montador antigo
 *    (`compartilhado/dados/exercicios.js`), com a estação que o
 *    `grupoTabata` de `hiitTabata.js` dava a cada um. Os que já existiam no
 *    catálogo de força (TRX, ponte, step-up, abdominais) ganharam `hiit` lá, em
 *    `catalogo-base.ts`, e não se repetem aqui.
 *  - NOVOS: para o equipamento que o coach listou e o Montador não usava (corda
 *    de pular, sandbag, kettlebell unilateral, halteres). Ponto de partida para
 *    o coach revisar, como as adaptações do catálogo de força.
 *
 * Equipamento traduzido como no `catalogo-base.ts`: `corporal` e `corrida` →
 * `peso_corporal`. O músculo `estabilizadores` do catálogo antigo não soma
 * volume e ficou de fora.
 *
 * `cross` (06/10/2026): os que também entram no WOD do Cross — ver `catalogo-cross.ts`.
 */
import type { ExercicioSoHiit } from './modelo-box';

const SEM = { adaptacoes: {}, instancia: null } as const;

export const CATALOGO_HIIT: Readonly<Record<string, ExercicioSoHiit>> = {
  /* ───────────── pernas ───────────── */
  agachamento_livre: {
    ...SEM, nome: 'Agachamento livre (peso corporal)',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['pernas'] },
    cross: { padrao: 'agachar', unidade: 'reps', rx: 20 },
  },
  goblet_squat: {
    ...SEM, nome: 'Agachamento goblet com kettlebell',
    musculoPrincipal: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    equipamentos: ['kettlebell'], hiit: { estacoes: ['pernas'] },
    cross: {
      padrao: 'agachar', unidade: 'reps', rx: 12, carga: { rx: '16/12 kg', scaled: '12/8 kg' },
      tecnica: {
        categoria: 'kettlebell', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: '4 × 8 com 2 s de pausa embaixo, 1 min de descanso.',
        objetivo: 'Profundidade com o tronco ereto e os joelhos na linha dos pés.',
        chave: 'desça com o tronco ereto e suba empurrando o chão, sem pressa no fundo',
        carga: 'Moderada, a carga RX do WOD',
      },
    },
  },
  kb_swing: {
    ...SEM, nome: 'Kettlebell swing',
    musculoPrincipal: ['gluteo', 'posterior_coxa'], musculosSecundarios: ['core', 'ombro'],
    equipamentos: ['kettlebell'], hiit: { estacoes: ['pernas'] },
    cross: {
      padrao: 'quadril', unidade: 'reps', rx: 15, carga: { rx: '16/12 kg', scaled: '12/8 kg' },
      tecnica: {
        categoria: 'kettlebell', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: '4 × 10 com carga moderada, 1 min de descanso.',
        objetivo: 'Dobradiça de quadril (não é agachamento) e lombar neutra no topo.',
        chave: 'suba o kettlebell com o quadril, não com o braço, e feche o glúteo no topo',
        carga: 'Moderada, a carga RX do WOD',
      },
    },
  },
  wall_ball_shot: {
    ...SEM, nome: 'Wall ball shot',
    musculoPrincipal: ['quadriceps', 'ombro'], musculosSecundarios: ['gluteo'],
    equipamentos: ['wall_ball'], hiit: { estacoes: ['pernas'] },
    cross: { padrao: 'corpo_todo', unidade: 'reps', rx: 15, carga: { rx: '14/10 lb', scaled: '10 lb, alvo mais baixo' } },
  },
  sandbag_clean: {
    ...SEM, nome: 'Clean com sandbag',
    musculoPrincipal: ['gluteo', 'posterior_coxa'], musculosSecundarios: ['quadriceps', 'costas', 'trapezio'],
    equipamentos: ['sandbag'], hiit: { estacoes: ['pernas'] },
    cross: { padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '20 kg', scaled: '20 kg' } },
  },
  afundo_kb: {
    ...SEM, nome: 'Afundo com kettlebell', unilateral: true,
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['core'],
    equipamentos: ['kettlebell'], hiit: { estacoes: ['pernas'] },
    cross: { padrao: 'agachar', unidade: 'reps', rx: 10, carga: { rx: '16/12 kg', scaled: 'sem carga' } },
  },
  afundo_reverso: {
    ...SEM, nome: 'Afundo reverso (peso corporal)', unilateral: true,
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: [],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['pernas'] },
    cross: { padrao: 'agachar', unidade: 'reps', rx: 10 },
  },

  /* ───────────── core ───────────── */
  abdominal_supra: {
    ...SEM, nome: 'Abdominal Supra (Crunch)',
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['colchonete'], hiit: { estacoes: ['core'] },
    cross: { padrao: 'core', unidade: 'reps', rx: 15 },
  },
  abdominal_remador: {
    ...SEM, nome: 'Abdominal Remador',
    musculoPrincipal: ['core'], musculosSecundarios: ['quadriceps'],
    equipamentos: ['colchonete'], hiit: { estacoes: ['core'] },
    cross: { padrao: 'core', unidade: 'reps', rx: 12 },
  },
  abdominal_bicicleta: {
    ...SEM, nome: 'Abdominal bicicleta',
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['colchonete'], hiit: { estacoes: ['core'] },
  },
  prancha: {
    ...SEM, nome: 'Prancha isométrica',
    musculoPrincipal: ['core'], musculosSecundarios: ['ombro'],
    equipamentos: ['colchonete'], hiit: { estacoes: ['core'] },
  },
  prancha_lateral: {
    ...SEM, nome: 'Prancha lateral', unilateral: true,
    musculoPrincipal: ['core'], musculosSecundarios: [],
    equipamentos: ['colchonete'], hiit: { estacoes: ['core'] },
  },

  /* ───────────── superiores ───────────── */
  flexao: {
    ...SEM, nome: 'Flexão de braço',
    musculoPrincipal: ['peito'], musculosSecundarios: ['triceps', 'ombro', 'core'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['superiores'] },
    cross: {
      padrao: 'empurrar', unidade: 'reps', rx: 12,
      tecnica: {
        categoria: 'ginastica', tipo: 'skill', minutos: 10, seriesEquivalentes: 3,
        dinamica: 'EMOM 10 min: 5–8 flexões estritas (escala: joelho no chão ou mãos no caixote).',
        objetivo: 'Corpo em prancha, peito no chão e cotovelos a 45°.',
        chave: 'mantenha o corpo em prancha e, quando cansar, escale antes de deixar o quadril cair',
      },
    },
  },
  flexao_pike: {
    ...SEM, nome: 'Flexão pike',
    musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['superiores'] },
    cross: {
      padrao: 'empurrar', unidade: 'reps', rx: 10,
      tecnica: {
        categoria: 'ginastica', tipo: 'skill', minutos: 10, seriesEquivalentes: 3,
        dinamica: 'EMOM 10 min: 5–8 flexões pike estritas (escala: pés no chão, menos inclinação).',
        objetivo: 'Força de ombro na posição invertida, cabeça passando à frente das mãos.',
        chave: 'mantenha o quadril alto e a cabeça passando à frente das mãos — pare a série antes da falha',
      },
    },
  },
  thruster_wallball: {
    ...SEM, nome: 'Thruster com wall ball',
    musculoPrincipal: ['ombro', 'quadriceps'], musculosSecundarios: ['gluteo', 'triceps'],
    equipamentos: ['wall_ball'], hiit: { estacoes: ['superiores'] },
  },
  thruster_halteres: {
    ...SEM, nome: 'Thruster com halteres',
    musculoPrincipal: ['ombro', 'quadriceps'], musculosSecundarios: ['gluteo', 'triceps'],
    equipamentos: ['halteres'], hiit: { estacoes: ['superiores'] },
    cross: { padrao: 'corpo_todo', unidade: 'reps', rx: 12, carga: { rx: 'par de 10/7 kg', scaled: 'par de 5/3 kg' } },
  },
  remada_unilateral_kb: {
    ...SEM, nome: 'Remada unilateral com kettlebell', unilateral: true,
    musculoPrincipal: ['costas'], musculosSecundarios: ['biceps', 'core'],
    equipamentos: ['kettlebell'], hiit: { estacoes: ['superiores'] },
    cross: { padrao: 'puxar', unidade: 'reps', rx: 10, carga: { rx: '16/12 kg', scaled: '12/8 kg' } },
  },
  desenvolvimento_unilateral_kb: {
    ...SEM, nome: 'Desenvolvimento unilateral com kettlebell', unilateral: true,
    musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps', 'core'],
    equipamentos: ['kettlebell'], hiit: { estacoes: ['superiores'] },
    cross: {
      padrao: 'empurrar', unidade: 'reps', rx: 8, carga: { rx: '12/8 kg', scaled: '8/6 kg' },
      tecnica: {
        categoria: 'kettlebell', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: '4 × 6 por lado com carga moderada, 1 min de descanso.',
        objetivo: 'Ombro estável e core firme no empurrar de um braço só.',
        chave: 'firme o core e feche a costela, para o ombro empurrar sem a lombar compensar',
        carga: 'Moderada, a carga RX do WOD',
      },
    },
  },

  /* ───────────── cardio ───────────── */
  burpee: {
    ...SEM, nome: 'Burpee',
    musculoPrincipal: ['quadriceps', 'peito'], musculosSecundarios: ['core', 'ombro', 'triceps'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'corpo_todo', unidade: 'reps', rx: 10 },
  },
  pular_corda: {
    ...SEM, nome: 'Pular corda (speed rope)',
    musculoPrincipal: ['panturrilha'], musculosSecundarios: ['ombro'],
    equipamentos: ['corda_pular'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'cardio', unidade: 'reps', rx: 50 },
  },
  air_bike_sprint: {
    ...SEM, nome: 'Air bike (sprint/cals)',
    musculoPrincipal: ['quadriceps', 'core'], musculosSecundarios: ['ombro', 'costas'],
    equipamentos: ['air_bike'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'cardio', unidade: 'calorias', rx: 12 },
  },
  corda_naval: {
    ...SEM, nome: 'Battle ropes (corda naval)',
    musculoPrincipal: ['ombro', 'core'], musculosSecundarios: ['antebraco'],
    equipamentos: ['corda_naval'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'cardio', unidade: 'segundos', rx: 30 },
  },
  box_jump: {
    ...SEM, nome: 'Box jump',
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['panturrilha', 'posterior_coxa'],
    equipamentos: ['caixote'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'agachar', unidade: 'reps', rx: 12, carga: { rx: 'caixote 60/50 cm', scaled: 'step-up no caixote' } },
  },
  agachamento_salto: {
    ...SEM, nome: 'Agachamento com salto (squat jump)',
    musculoPrincipal: ['quadriceps', 'gluteo'], musculosSecundarios: ['panturrilha'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'agachar', unidade: 'reps', rx: 15 },
  },
  skater: {
    ...SEM, nome: 'Skater (saltos laterais)',
    musculoPrincipal: ['gluteo', 'quadriceps'], musculosSecundarios: ['panturrilha'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
  },
  mountain_climber: {
    ...SEM, nome: 'Mountain climber (escalador)',
    musculoPrincipal: ['core'], musculosSecundarios: ['ombro', 'quadriceps'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'cardio', unidade: 'reps', rx: 30 },
  },
  high_knees: {
    ...SEM, nome: 'High knees (joelho alto)',
    musculoPrincipal: ['quadriceps', 'core'], musculosSecundarios: ['panturrilha'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'cardio', unidade: 'reps', rx: 40 },
  },
  polichinelo: {
    ...SEM, nome: 'Polichinelo (jumping jacks)',
    musculoPrincipal: ['panturrilha', 'ombro'], musculosSecundarios: ['quadriceps', 'core'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
    cross: { padrao: 'cardio', unidade: 'reps', rx: 40 },
  },
  corrida_100m: {
    ...SEM, nome: 'Corrida 100 m (rua)',
    musculoPrincipal: ['quadriceps', 'posterior_coxa'], musculosSecundarios: ['panturrilha', 'gluteo'],
    equipamentos: ['peso_corporal'], hiit: { estacoes: ['cardio'] },
  },
};
