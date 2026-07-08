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
 * @typedef {Object} MovGap
 * @property {string} id
 * @property {string} nome
 * @property {boolean} [unilateral]
 * @property {boolean} [quicada]
 * @property {boolean} [isometrico]
 * @property {boolean} [salto]
 * @property {boolean} [soIsometrico]
 */

/** @type {MovGap[]} — aquecimento: dinâmicos/metabólicos, entram em trio. */
export const GAP_AQUECIMENTO = [
  { id: 'corrida_joelho', nome: 'Corrida estacionária com joelho alto' },
  { id: 'butt_kick', nome: 'Calcanhar no glúteo (butt kick)' },
  { id: 'desloc_lateral', nome: 'Deslocamento lateral com toque no solo' },
  { id: 'polichinelo', nome: 'Polichinelo' },
  { id: 'chute_frontal', nome: 'Chute frontal alternado' },
  { id: 'skipping', nome: 'Skipping (corrida saltada)' },
  { id: 'joelho_cruzado', nome: 'Joelho ao cotovelo cruzado (em pé)' },
  { id: 'agacha_toque', nome: 'Agachamento com toque no solo' },
];

/** @type {MovGap[]} — Pernas: agachamentos, avanços, unilaterais. */
export const GAP_PERNAS = [
  { id: 'agachamento', nome: 'Agachamento', quicada: true, isometrico: true, salto: true },
  { id: 'sumo', nome: 'Agachamento sumô', quicada: true, isometrico: true },
  { id: 'agacha_estreito', nome: 'Agachamento pés juntos', quicada: true, isometrico: true },
  { id: 'avanco_lateral', nome: 'Avanço lateral (lunge lateral)', unilateral: true },
  { id: 'recuo_joelho', nome: 'Recuo com elevação de joelho', unilateral: true },
  { id: 'afundo_frente', nome: 'Afundo à frente', unilateral: true },
  { id: 'afundo_bulgaro', nome: 'Afundo búlgaro (pé atrás elevado)', unilateral: true },
  { id: 'squat_jack', nome: 'Agachamento com abertura (squat jack)' },
  { id: 'patinador', nome: 'Patinador (salto lateral)' },
  { id: 'cadeira_parede', nome: 'Cadeirinha na parede (wall sit)', isometrico: true, soIsometrico: true },
  { id: 'panturrilha_agacha', nome: 'Meia sentada com elevação de panturrilha' },
];

/** @type {MovGap[]} — Glúteo: ponte, coice, concha, abdução. */
export const GAP_GLUTEO = [
  { id: 'ponte', nome: 'Ponte de glúteo (elevação de quadril)', quicada: true, isometrico: true },
  { id: 'ponte_pesju', nome: 'Ponte de glúteo com joelhos abertos (abdução)', quicada: true, isometrico: true },
  { id: 'chute_gluteo_pe', nome: 'Chute de glúteo para trás em pé', unilateral: true },
  { id: 'coice_4apoios', nome: 'Coice em 4 apoios (donkey kick)', unilateral: true },
  { id: 'coice_ceu', nome: 'Coice para o céu (perna estendida, 4 apoios)', unilateral: true },
  { id: 'abducao_4apoios', nome: 'Abdução em 4 apoios (fire hydrant)', unilateral: true },
  { id: 'concha', nome: 'Concha (clam) deitado de lado', unilateral: true },
  { id: 'abducao_pe', nome: 'Abdução de perna em pé', unilateral: true },
  { id: 'ponte_marcha', nome: 'Ponte com marcha (eleva um joelho alternado)' },
  { id: 'prancha_gluteo', nome: 'Prancha com contração de glúteo (estática)', isometrico: true, soIsometrico: true },
];

/** @type {MovGap[]} — Abdômen: dinâmicos e isométricos, entram em trio. */
export const GAP_ABDOMEN = [
  { id: 'canivete', nome: 'Canivete (V-up)' },
  { id: 'escalador', nome: 'Escalador (mountain climber)' },
  { id: 'giro_russo', nome: 'Giro russo (russian twist)' },
  { id: 'tesoura', nome: 'Tesoura vertical de pernas' },
  { id: 'bicicleta', nome: 'Abdominal bicicleta' },
  { id: 'eleva_pernas', nome: 'Elevação de pernas (infra)' },
  { id: 'toque_calcanhar', nome: 'Toque no calcanhar (oblíquo)' },
  { id: 'barquinho', nome: 'Barquinho isométrico (hollow hold)', soIsometrico: true },
  { id: 'abs_v_iso', nome: 'Abdômen em "V" isométrico (segura o V)', soIsometrico: true },
  { id: 'prancha_toque', nome: 'Prancha com toque no ombro' },
];
