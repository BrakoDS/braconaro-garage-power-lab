/**
 * CATÁLOGO SÓ DE CROSS — movimentos do WOD que não ocupam vaga de força nem
 * estação de HIIT, e que o `seed-catalogo.ts` grava em `catalogoExercicios/`
 * junto com o `CATALOGO_BASE` e o `CATALOGO_HIIT`.
 *
 * Origem (06/10/2026): os movimentos de barra que o coach aprovou (todos saem
 * do CHÃO — o box não tem rack), a corrida e o farmer com kettlebells. O resto
 * do pool do Cross são exercícios que já existiam e ganharam `cross` no próprio
 * item (`catalogo-base.ts` e `catalogo-hiit.ts`).
 *
 * `cross.rx` é a quantidade de UMA rodada de AMRAP; os outros formatos
 * multiplicam (`REGRA_FORMATO_CROSS`). A carga é texto homem/mulher ('40/30 kg').
 * Ponto de partida para o coach revisar, como as adaptações do catálogo.
 */
import type { ExercicioSoCross } from './modelo-box';

const SEM = { adaptacoes: {}, instancia: null } as const;
const BARRA = ['barra', 'anilhas'] as const;

export const CATALOGO_CROSS: Readonly<Record<string, ExercicioSoCross>> = {
  /* ───────────── cardio ───────────── */
  corrida: {
    ...SEM, nome: 'Corrida (rua)',
    musculoPrincipal: ['quadriceps', 'posterior_coxa'], musculosSecundarios: ['panturrilha', 'gluteo'],
    equipamentos: ['peso_corporal'],
    cross: { padrao: 'cardio', unidade: 'metros', rx: 200 },
  },

  /* ───────────── barra olímpica (do chão) ───────────── */
  power_clean: {
    ...SEM, nome: 'Power clean (barra)',
    musculoPrincipal: ['posterior_coxa', 'gluteo', 'quadriceps'], musculosSecundarios: ['trapezio', 'costas', 'core'],
    equipamentos: [...BARRA],
    cross: { padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '50/35 kg', scaled: '30/20 kg' } },
  },
  hang_power_clean: {
    ...SEM, nome: 'Hang power clean (barra)',
    musculoPrincipal: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['trapezio', 'quadriceps', 'core'],
    equipamentos: [...BARRA],
    cross: { padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '50/35 kg', scaled: '30/20 kg' } },
  },
  ground_to_overhead: {
    ...SEM, nome: 'Ground to overhead (barra)',
    musculoPrincipal: ['ombro', 'gluteo', 'quadriceps'], musculosSecundarios: ['trapezio', 'triceps', 'core'],
    equipamentos: [...BARRA],
    cross: { padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '40/30 kg', scaled: '25/15 kg' } },
  },
  push_press: {
    ...SEM, nome: 'Push press (barra, após o clean)',
    musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps', 'quadriceps', 'core'],
    equipamentos: [...BARRA],
    cross: { padrao: 'empurrar', unidade: 'reps', rx: 10, carga: { rx: '40/30 kg', scaled: '25/15 kg' } },
  },
  thruster_barra: {
    ...SEM, nome: 'Thruster (barra, após o clean)',
    musculoPrincipal: ['quadriceps', 'ombro'], musculosSecundarios: ['gluteo', 'triceps', 'core'],
    equipamentos: [...BARRA],
    cross: { padrao: 'corpo_todo', unidade: 'reps', rx: 10, carga: { rx: '40/30 kg', scaled: '25/15 kg' } },
  },
  sdhp_barra: {
    ...SEM, nome: 'Sumo deadlift high pull (barra)',
    musculoPrincipal: ['trapezio', 'posterior_coxa', 'gluteo'], musculosSecundarios: ['ombro', 'costas'],
    equipamentos: [...BARRA],
    cross: { padrao: 'puxar', unidade: 'reps', rx: 10, carga: { rx: '40/30 kg', scaled: '25/15 kg' } },
  },

  /* ───────────── kettlebell ───────────── */
  sdhp_kb: {
    ...SEM, nome: 'Sumo deadlift high pull (kettlebell)',
    musculoPrincipal: ['trapezio', 'gluteo'], musculosSecundarios: ['ombro', 'posterior_coxa'],
    equipamentos: ['kettlebell'],
    cross: { padrao: 'puxar', unidade: 'reps', rx: 12, carga: { rx: '16/12 kg', scaled: '12/8 kg' } },
  },
  farmer_carry_kb: {
    ...SEM, nome: 'Farmer carry (2 kettlebells)',
    musculoPrincipal: ['antebraco', 'trapezio'], musculosSecundarios: ['core'],
    equipamentos: ['kettlebell'],
    cross: {
      padrao: 'core', unidade: 'metros', rx: 50,
      carga: { rx: '2× 16/12 kg', scaled: '2× 12/8 kg' }, consumoPorAluno: { kettlebell: 2 },
    },
  },
};
