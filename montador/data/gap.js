// @ts-check
/**
 * BANCO DE MOVIMENTOS GAP (Glúteo · Abdômen · Perna).
 *
 * Aula de ginástica coletiva no protocolo TABATA (20"/10"), formato "Siga o Mestre".
 * São movimentos de PESO CORPORAL (não usam o inventário/Academia), organizados por
 * parte da aula. Metadados dirigem as variações que o gerador monta:
 *  - `unilateral`  : trabalha um lado por vez (vira Lado Direito / Lado Esquerdo).
 *  - `quicada`     : aceita a variação de 3 insistências (quicadas).
 *  - `isometrico`  : aceita a variação estática (segura).
 *  - `salto`       : a versão dinâmica é com salto (metabólica).
 *  - `soIsometrico`: só existe como estático (serve de "terceiro" bilateral em blocos unilaterais).
 *
 * `padrao` e `musculos` são os MESMOS campos do catálogo de exercícios — é o que
 * permite a aula de GAP entrar na conta de volume por músculo e no mínimo semanal
 * por padrão de movimento (ver `volumeGap` em core/gap.js). O padrão segue a parte
 * da aula (Pernas → quadríceps, Glúteo → posterior/glúteo, Abdômen → core); os
 * músculos é que carregam a nuance de cada movimento.
 *
 * ORDEM IMPORTA em `musculos`: o PRIMEIRO é o primário (conta 1,0 na série) e os
 * demais são secundários (0,5 cada) — a mesma convenção de core/volume.js.
 *
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 *
 * @typedef {Object} MovGap
 * @property {string} id
 * @property {string} nome
 * @property {Padrao} padrao
 * @property {string[]} musculos  [primário, ...secundários]
 * @property {boolean} [unilateral]
 * @property {boolean} [quicada]
 * @property {boolean} [isometrico]
 * @property {boolean} [salto]
 * @property {boolean} [soIsometrico]
 */

/**
 * Peso de estímulo de cada variação, relativo ao movimento dinâmico.
 *
 * São ESTIMATIVAS de treino, não medidas: a quicada segura o aluno no ângulo mais
 * difícil por mais tempo (daí +25%), o isométrico corta a fase concêntrica (−25%) e
 * o salto troca amplitude por potência (+25%). Mexer aqui recalibra o volume de
 * todas as aulas de GAP de uma vez.
 */
export const PESO_VARIACAO = {
  dinamica: 1,
  quicada: 1.25,
  salto: 1.25,
  isometrico: 0.75,
  unilateral: 1, // cada lado é um round próprio, então cada um vale um round cheio
};

/**
 * Quanto vale 1 round de TABATA em "séries" da contagem de volume.
 * Round = 20 s de trabalho; uma série de musculação (~10 reps) dá 30–40 s. Meia série
 * por round mantém as duas escalas comparáveis nas barras e no mínimo semanal.
 */
export const SERIES_POR_ROUND = 0.5;

/** @type {MovGap[]} — aquecimento: dinâmicos/metabólicos, entram em trio. */
export const GAP_AQUECIMENTO = [
  { id: 'corrida_joelho', nome: 'Corrida estacionária com joelho alto', padrao: 'estabilizadores', musculos: ['quadriceps', 'core'] },
  { id: 'butt_kick', nome: 'Calcanhar no glúteo (butt kick)', padrao: 'estabilizadores', musculos: ['posterior_coxa', 'panturrilha'] },
  { id: 'desloc_lateral', nome: 'Deslocamento lateral com toque no solo', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'] },
  { id: 'polichinelo', nome: 'Polichinelo', padrao: 'estabilizadores', musculos: ['panturrilha', 'ombro'] },
  { id: 'chute_frontal', nome: 'Chute frontal alternado', padrao: 'estabilizadores', musculos: ['quadriceps', 'core'] },
  { id: 'skipping', nome: 'Skipping (corrida saltada)', padrao: 'estabilizadores', musculos: ['quadriceps', 'panturrilha'] },
  { id: 'joelho_cruzado', nome: 'Joelho ao cotovelo cruzado (em pé)', padrao: 'core', musculos: ['core'] },
  { id: 'agacha_toque', nome: 'Agachamento com toque no solo', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'] },
];

/** @type {MovGap[]} — Pernas: agachamentos, avanços, unilaterais. */
export const GAP_PERNAS = [
  { id: 'agachamento', nome: 'Agachamento', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'], quicada: true, isometrico: true, salto: true },
  { id: 'sumo', nome: 'Agachamento sumô', padrao: 'quadriceps', musculos: ['gluteo', 'quadriceps'], quicada: true, isometrico: true },
  { id: 'agacha_estreito', nome: 'Agachamento pés juntos', padrao: 'quadriceps', musculos: ['quadriceps'], quicada: true, isometrico: true },
  { id: 'avanco_lateral', nome: 'Avanço lateral (lunge lateral)', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'], unilateral: true },
  { id: 'recuo_joelho', nome: 'Recuo com elevação de joelho', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo', 'core'], unilateral: true },
  { id: 'afundo_frente', nome: 'Afundo à frente', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'], unilateral: true },
  { id: 'afundo_bulgaro', nome: 'Afundo búlgaro (pé atrás elevado)', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'], unilateral: true },
  { id: 'squat_jack', nome: 'Agachamento com abertura (squat jack)', padrao: 'quadriceps', musculos: ['quadriceps', 'gluteo'] },
  { id: 'patinador', nome: 'Patinador (salto lateral)', padrao: 'quadriceps', musculos: ['gluteo', 'quadriceps', 'panturrilha'] },
  { id: 'cadeira_parede', nome: 'Cadeirinha na parede (wall sit)', padrao: 'quadriceps', musculos: ['quadriceps'], isometrico: true, soIsometrico: true },
  { id: 'panturrilha_agacha', nome: 'Meia sentada com elevação de panturrilha', padrao: 'quadriceps', musculos: ['panturrilha', 'quadriceps'] },
];

/** @type {MovGap[]} — Glúteo: ponte, coice, concha, abdução. */
export const GAP_GLUTEO = [
  { id: 'ponte', nome: 'Ponte de glúteo (elevação de quadril)', padrao: 'posterior_gluteo', musculos: ['gluteo', 'posterior_coxa'], quicada: true, isometrico: true },
  { id: 'ponte_pesju', nome: 'Ponte de glúteo com joelhos abertos (abdução)', padrao: 'posterior_gluteo', musculos: ['gluteo'], quicada: true, isometrico: true },
  { id: 'chute_gluteo_pe', nome: 'Chute de glúteo para trás em pé', padrao: 'posterior_gluteo', musculos: ['gluteo'], unilateral: true },
  { id: 'coice_4apoios', nome: 'Coice em 4 apoios (donkey kick)', padrao: 'posterior_gluteo', musculos: ['gluteo'], unilateral: true },
  { id: 'coice_ceu', nome: 'Coice para o céu (perna estendida, 4 apoios)', padrao: 'posterior_gluteo', musculos: ['gluteo', 'posterior_coxa'], unilateral: true },
  { id: 'abducao_4apoios', nome: 'Abdução em 4 apoios (fire hydrant)', padrao: 'posterior_gluteo', musculos: ['gluteo'], unilateral: true },
  { id: 'concha', nome: 'Concha (clam) deitado de lado', padrao: 'posterior_gluteo', musculos: ['gluteo'], unilateral: true },
  { id: 'abducao_pe', nome: 'Abdução de perna em pé', padrao: 'posterior_gluteo', musculos: ['gluteo'], unilateral: true },
  { id: 'ponte_marcha', nome: 'Ponte com marcha (eleva um joelho alternado)', padrao: 'posterior_gluteo', musculos: ['gluteo', 'core'] },
  { id: 'prancha_gluteo', nome: 'Prancha com contração de glúteo (estática)', padrao: 'posterior_gluteo', musculos: ['gluteo', 'core'], isometrico: true, soIsometrico: true },
];

/** @type {MovGap[]} — Abdômen: dinâmicos e isométricos, entram em trio. */
export const GAP_ABDOMEN = [
  { id: 'canivete', nome: 'Canivete (V-up)', padrao: 'core', musculos: ['core'] },
  { id: 'escalador', nome: 'Escalador (mountain climber)', padrao: 'core', musculos: ['core', 'ombro'] },
  { id: 'giro_russo', nome: 'Giro russo (russian twist)', padrao: 'core', musculos: ['core'] },
  { id: 'tesoura', nome: 'Tesoura vertical de pernas', padrao: 'core', musculos: ['core', 'quadriceps'] },
  { id: 'bicicleta', nome: 'Abdominal bicicleta', padrao: 'core', musculos: ['core'] },
  { id: 'eleva_pernas', nome: 'Elevação de pernas (infra)', padrao: 'core', musculos: ['core'] },
  { id: 'toque_calcanhar', nome: 'Toque no calcanhar (oblíquo)', padrao: 'core', musculos: ['core'] },
  { id: 'barquinho', nome: 'Barquinho isométrico (hollow hold)', padrao: 'core', musculos: ['core'], soIsometrico: true },
  { id: 'abs_v_iso', nome: 'Abdômen em "V" isométrico (segura o V)', padrao: 'core', musculos: ['core'], soIsometrico: true },
  { id: 'prancha_toque', nome: 'Prancha com toque no ombro', padrao: 'core', musculos: ['core', 'ombro', 'estabilizadores'] },
];

/** Índice id → movimento, usado pelo cálculo de volume. @type {Record<string, MovGap>} */
export const MOV_GAP_POR_ID = Object.fromEntries(
  [...GAP_AQUECIMENTO, ...GAP_PERNAS, ...GAP_GLUTEO, ...GAP_ABDOMEN].map((m) => [m.id, m])
);
