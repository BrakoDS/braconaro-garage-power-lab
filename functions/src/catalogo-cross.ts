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
  // Cardio sem equipamento (06/10/2026): no EMOM a turma inteira faz o mesmo
  // movimento no mesmo minuto, e air bike e cordas são 2 de cada — sem estes,
  // a corrida era o único cardio do EMOM com 6 alunos.
  shuttle_run: {
    ...SEM, nome: 'Shuttle run (ir e vir, 10 m)',
    musculoPrincipal: ['quadriceps', 'posterior_coxa'], musculosSecundarios: ['panturrilha', 'gluteo'],
    equipamentos: ['peso_corporal'],
    cross: { padrao: 'cardio', unidade: 'metros', rx: 100 },
  },

  /* ───────────── barra olímpica (do chão) ───────────── */
  power_clean: {
    ...SEM, nome: 'Power clean (barra)',
    musculoPrincipal: ['posterior_coxa', 'gluteo', 'quadriceps'], musculosSecundarios: ['trapezio', 'costas', 'core'],
    equipamentos: [...BARRA],
    cross: {
      padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '50/35 kg', scaled: '30/20 kg' },
      tecnica: {
        categoria: 'olimpico', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: 'EMOM 10 min: 3 power cleans por minuto, subindo a carga de leve a moderada.',
        objetivo: 'Recepção rápida da barra e extensão completa de quadril.',
        chave: 'mantenha a barra perto do corpo e estenda o quadril antes de puxar com os braços',
        carga: 'Leve a moderada, até a carga RX do WOD',
      },
    },
  },
  hang_power_clean: {
    ...SEM, nome: 'Hang power clean (barra)',
    musculoPrincipal: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['trapezio', 'quadriceps', 'core'],
    equipamentos: [...BARRA],
    cross: {
      padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '50/35 kg', scaled: '30/20 kg' },
      tecnica: {
        categoria: 'olimpico', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: 'EMOM 10 min: 3 hang power cleans por minuto, subindo a carga de leve a moderada.',
        objetivo: 'Extensão explosiva de quadril a partir do hang e cotovelos rápidos na recepção.',
        chave: 'deixe o quadril ser o motor e gire os cotovelos rápido para receber a barra',
        carga: 'Leve a moderada, até a carga RX do WOD',
      },
    },
  },
  ground_to_overhead: {
    ...SEM, nome: 'Ground to overhead (barra)',
    musculoPrincipal: ['ombro', 'gluteo', 'quadriceps'], musculosSecundarios: ['trapezio', 'triceps', 'core'],
    equipamentos: [...BARRA],
    cross: {
      padrao: 'olimpico', unidade: 'reps', rx: 8, carga: { rx: '40/30 kg', scaled: '25/15 kg' },
      tecnica: {
        categoria: 'olimpico', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: 'EMOM 10 min: 2 ground to overhead por minuto, subindo a carga de leve a moderada.',
        objetivo: 'Chão → ombro → acima da cabeça com a barra perto do corpo e o tronco firme.',
        chave: 'mantenha a barra perto do corpo do chão até em cima e o tronco firme na hora de travar',
        carga: 'Leve a moderada, até a carga RX do WOD',
      },
    },
  },
  push_press: {
    ...SEM, nome: 'Push press (barra, após o clean)',
    musculoPrincipal: ['ombro'], musculosSecundarios: ['triceps', 'quadriceps', 'core'],
    equipamentos: [...BARRA],
    cross: {
      padrao: 'empurrar', unidade: 'reps', rx: 10, carga: { rx: '40/30 kg', scaled: '25/15 kg' },
      tecnica: {
        categoria: 'barra', tipo: 'forca', minutos: 12, seriesEquivalentes: 5,
        dinamica: '5 × 5 subindo a carga (RPE 7–8), 2 min de descanso — duplas revezando a barra.',
        objetivo: 'Dip and drive: a força da perna passando para a barra acima da cabeça.',
        chave: 'faça o dip curto e o drive forte — a perna empurra, o ombro só termina',
        carga: 'Acima da carga RX do WOD nas últimas séries',
      },
    },
  },
  thruster_barra: {
    ...SEM, nome: 'Thruster (barra, após o clean)',
    musculoPrincipal: ['quadriceps', 'ombro'], musculosSecundarios: ['gluteo', 'triceps', 'core'],
    equipamentos: [...BARRA],
    cross: {
      padrao: 'corpo_todo', unidade: 'reps', rx: 10, carga: { rx: '40/30 kg', scaled: '25/15 kg' },
      tecnica: {
        categoria: 'barra', tipo: 'forca', minutos: 12, seriesEquivalentes: 5,
        dinamica: '5 × 3 subindo a carga (RPE 7–8), 2 min de descanso — duplas revezando a barra.',
        objetivo: 'Agachamento frontal ligado ao empurrar, sem pausa no fundo.',
        chave: 'deixe o quadril lançar a barra — é ele que poupa o ombro',
        carga: 'Acima da carga RX do WOD nas últimas séries',
      },
    },
  },
  sdhp_barra: {
    ...SEM, nome: 'Sumo deadlift high pull (barra)',
    musculoPrincipal: ['trapezio', 'posterior_coxa', 'gluteo'], musculosSecundarios: ['ombro', 'costas'],
    equipamentos: [...BARRA],
    cross: {
      padrao: 'puxar', unidade: 'reps', rx: 10, carga: { rx: '40/30 kg', scaled: '25/15 kg' },
      tecnica: {
        categoria: 'barra', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: '4 × 6 com carga moderada, 1 min de descanso — duplas revezando a barra.',
        objetivo: 'Sequência pernas → quadril → braços, com os cotovelos acima das mãos.',
        chave: 'use pernas, quadril e só então braços, com os cotovelos acima das mãos',
        carga: 'Moderada, a carga RX do WOD',
      },
    },
  },

  /* ───────────── kettlebell ───────────── */
  sdhp_kb: {
    ...SEM, nome: 'Sumo deadlift high pull (kettlebell)',
    musculoPrincipal: ['trapezio', 'gluteo'], musculosSecundarios: ['ombro', 'posterior_coxa'],
    equipamentos: ['kettlebell'],
    cross: {
      padrao: 'puxar', unidade: 'reps', rx: 12, carga: { rx: '16/12 kg', scaled: '12/8 kg' },
      tecnica: {
        categoria: 'kettlebell', tipo: 'tecnica', minutos: 10, seriesEquivalentes: 3,
        dinamica: '4 × 8 com carga moderada, 1 min de descanso.',
        objetivo: 'Sequência pernas → quadril → braços, com o kettlebell perto do corpo.',
        chave: 'use pernas, quadril e só então braços, com o kettlebell perto do corpo',
        carga: 'Moderada, a carga RX do WOD',
      },
    },
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
