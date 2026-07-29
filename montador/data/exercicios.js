// @ts-check
/**
 * CATÁLOGO DE EXERCÍCIOS — mapeado 1:1 ao inventário real do box.
 * Nenhum exercício referencia equipamento que o box não possui.
 *
 * Convenções firmadas na revisão do catálogo:
 *  - Acessório de polia é EQUIPAMENTO PRÓPRIO (pux_*): duas variantes que usam o
 *    mesmo puxador disputam a mesma estação, mesmo com torre de monocross livre.
 *  - Variante de equipamento NÃO é redundância: existe para o rodízio conseguir
 *    dividir a turma quando um aparelho já está ocupado.
 *  - "polia" foi padronizado para "monocross" (é o aparelho que o box tem).
 *  - FORÇA e HIPERTROFIA são a MESMA lista ('musculacao'). O que muda entre os dois
 *    dias é a prescrição (reps/séries/descanso) e um recorte automático: Força só
 *    usa exercício COMPOSTO e que aceite CARGA EXTERNA (ver `servePraForca`).
 *  - Os 8 exercícios da aula fixa de Hyrox ficam SÓ com a categoria 'hyrox' —
 *    são referência do coach e não devem alimentar o montador. A única exceção
 *    é o Wall ball shot, que o coach também usa nas outras modalidades.
 *  - 'gap' está fora de todos até o sistema de GAP ser desenhado na plataforma.
 *
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 * @typedef {import('../config/modalidades.js').ModalidadeId} ModalidadeId
 *
 * @typedef {Object} Exercicio
 * @property {string} id
 * @property {string} nome
 * @property {string} descricao
 * @property {Padrao} padrao                  Padrão principal de movimento
 * @property {string[]} musculosPrimarios
 * @property {string[]} musculosSecundarios
 * @property {Array<'musculacao'|'hiit'|'hyrox'|'hibrido'|'gap'|'mobilidade'|'tecnica'|'wod'|'cross'>} categorias
 *           'musculacao' = exercício de academia; serve a Força E Hipertrofia — o que separa
 *           as duas é a REGRA, não a lista (ver `servePraForca` abaixo). 'cross' = cross-training/
 *           WOD; nos built-in o token é 'wod', exibido como CROSS na Academia.
 * @property {string[]} equipamento           IDs de equipamentos.js
 * @property {'iniciante'|'intermediario'|'avancado'} nivel
 * @property {number} tempoMedioSeg           Tempo médio de execução de 1 série/rodada
 * @property {boolean} [unilateral]           Trabalha um lado por vez (conta como 2 no TABATA)
 * @property {boolean} [cardio]               Movimento metabólico p/ a estação CARDIO do HIIT
 * @property {boolean} [multiarticular]       Composto (vários grupos/articulações)? default true —
 *           só marcar `false` explicitamente nos isolados (usado pelo Híbrido p/ misturar os dois)
 * @property {boolean} [ocupaTudo]            Consome TODAS as unidades dos equipamentos que exige
 *           (caso do crossover, que usa as 2 torres de monocross ao mesmo tempo)
 * @property {string} [obs]
 */

import { EQUIP_COM_CARGA } from './equipamentos.js';

/** @type {Exercicio[]} */
export const EXERCICIOS = [
  // ===================== EMPURRAR =====================
  {
    id: 'supino_smith', nome: 'Supino reto no Smith',
    descricao: 'Empurrar horizontal na barra guiada, deitado no banco reto.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
    categorias: ['musculacao'], equipamento: ['smith', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'supino_inclinado_smith', nome: 'Supino inclinado no Smith',
    descricao: 'Banco a 30–45° sob a barra guiada — foco na porção superior do peito.',
    padrao: 'empurrar', musculosPrimarios: ['peito', 'ombro'], musculosSecundarios: ['triceps'],
    categorias: ['musculacao'], equipamento: ['smith', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'supino_halter', nome: 'Supino reto com halteres',
    descricao: 'Deitado no banco reto, empurrar halteres — mais amplitude e estabilização que o Smith.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro'],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'supino_inclinado_halter', nome: 'Supino inclinado com halteres',
    descricao: 'Banco a 30–45°, empurrar halteres para cima.',
    padrao: 'empurrar', musculosPrimarios: ['peito', 'ombro'], musculosSecundarios: ['triceps'],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'crucifixo_halter', nome: 'Crucifixo com halteres',
    descricao: 'Deitado no banco reto, abrir e fechar os braços em arco — isolamento do peitoral.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'crucifixo_inclinado_halter', nome: 'Crucifixo inclinado com halteres',
    descricao: 'Abertura no banco a 30–45° — foco na porção superior/clavicular do peito.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['ombro'],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'crucifixo_crossover_inferior', nome: 'Crucifixo no crossover inferior',
    descricao: 'Polias na altura baixa, cruzar os braços de baixo para cima — peito superior/clavicular.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['ombro'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_manopla'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false, ocupaTudo: true,
    obs: 'Ocupa as 2 torres de monocross ao mesmo tempo — bloqueia a estação inteira de polia.',
  },
  {
    id: 'crucifixo_crossover_medial', nome: 'Crucifixo no crossover medial',
    descricao: 'Polias na altura do ombro, cruzar os braços à frente do peito — peito medial.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_manopla'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false, ocupaTudo: true,
    obs: 'Ocupa as 2 torres de monocross ao mesmo tempo — bloqueia a estação inteira de polia.',
  },
  {
    id: 'crucifixo_crossover_superior', nome: 'Crucifixo no crossover superior',
    descricao: 'Polias na altura alta, cruzar os braços de cima para baixo — peito inferior/esternal.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_manopla'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false, ocupaTudo: true,
    obs: 'Ocupa as 2 torres de monocross ao mesmo tempo — bloqueia a estação inteira de polia.',
  },
  {
    id: 'desenvolvimento_smith', nome: 'Desenvolvimento militar no Smith',
    descricao: 'Empurrar vertical na barra guiada, em pé ou sentado.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: ['triceps'],
    categorias: ['musculacao'], equipamento: ['smith'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'desenvolvimento_halter', nome: 'Desenvolvimento militar com halteres',
    descricao: 'Empurrar halteres acima da cabeça, sentado no banco.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: ['triceps'],
    categorias: ['musculacao', 'hibrido'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'elevacao_lateral_halter', nome: 'Elevação lateral com halteres',
    descricao: 'Braços quase estendidos, elevar os halteres até a linha do ombro.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: [],
    categorias: ['musculacao', 'hibrido'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'elevacao_lateral_monocross', nome: 'Elevação lateral no monocross',
    descricao: 'Manopla na polia baixa, elevar o braço lateralmente — tensão constante do cabo.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_manopla'],
    nivel: 'intermediario', tempoMedioSeg: 30, unilateral: true, multiarticular: false,
  },
  {
    id: 'elevacao_frontal_halter', nome: 'Elevação frontal com halteres',
    descricao: 'Braços estendidos à frente, elevar até a linha dos olhos — deltoide anterior.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'crucifixo_invertido_halter', nome: 'Crucifixo invertido com halteres',
    descricao: 'Tronco inclinado à frente, abrir os braços para trás — isolamento de deltoide posterior.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: ['costas'],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'encolhimento_halter', nome: 'Encolhimento de trapézio com halteres',
    descricao: 'Halteres ao lado do corpo, elevar os ombros na vertical — trapézio superior.',
    padrao: 'empurrar', musculosPrimarios: ['trapezio'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_testa_halter', nome: 'Tríceps testa com halteres',
    descricao: 'Deitado no banco, descer os halteres até a testa flexionando só os cotovelos.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_testa_monocross', nome: 'Tríceps testa no monocross',
    descricao: 'Deitado/inclinado, estender a corda da polia sobre a testa — tensão constante do cabo.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_corda'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_testa_barra', nome: 'Tríceps testa (barra + banco)',
    descricao: 'Deitado no banco, descer a barra até a testa flexionando só os cotovelos (skullcrusher).',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_corda_monocross', nome: 'Tríceps corda no monocross',
    descricao: 'Cotovelos fixos ao tronco, estender a corda na polia alta.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao', 'hibrido'], equipamento: ['monocross', 'pux_corda'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_barra_monocross', nome: 'Tríceps barra no monocross',
    descricao: 'Barra reta de 60 cm na polia alta, estender os cotovelos junto ao tronco.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_60'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_coice_halter', nome: 'Tríceps coice com halteres',
    descricao: 'Tronco inclinado, cotovelo fixo atrás, estender o antebraço até o pico de contração.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_coice_monocross', nome: 'Tríceps coice no monocross',
    descricao: 'Manopla na polia, tronco inclinado e cotovelo fixo — coice com tensão constante.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_manopla'],
    nivel: 'iniciante', tempoMedioSeg: 30, unilateral: true, multiarticular: false,
  },
  {
    id: 'triceps_frances_halter', nome: 'Tríceps francês com halteres',
    descricao: 'Halter acima da cabeça, descer atrás da nuca e estender — foco na cabeça longa.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'triceps_mergulho_banco', nome: 'Tríceps mergulho no banco',
    descricao: 'Mãos na borda do banco, descer e subir o corpo flexionando os cotovelos.',
    padrao: 'empurrar', musculosPrimarios: ['triceps'], musculosSecundarios: ['peito', 'ombro'],
    categorias: ['musculacao'], equipamento: ['banco', 'corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'flexao', nome: 'Flexão de braço',
    descricao: 'Empurrar o peso do corpo no solo. Escala: joelhos ou no caixote.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro', 'core'],
    categorias: ['hiit', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'burpee', nome: 'Burpee',
    descricao: 'Flexão + salto, corpo inteiro. Clássico de WOD.',
    padrao: 'empurrar', musculosPrimarios: ['peito', 'quadriceps'], musculosSecundarios: ['core', 'ombro'],
    categorias: ['wod'], equipamento: ['corporal'],
    nivel: 'intermediario', tempoMedioSeg: 30, cardio: true,
  },
  {
    id: 'burpee_broad_jump', nome: 'Burpee Broad Jump',
    descricao: 'Burpee seguido de salto horizontal à frente, avançando a distância marcada.',
    padrao: 'empurrar', musculosPrimarios: ['peito', 'quadriceps'], musculosSecundarios: ['core', 'gluteo'],
    categorias: ['hyrox'], equipamento: ['corporal'],
    nivel: 'intermediario', tempoMedioSeg: 35, cardio: true,
    obs: 'Estação 4 da aula fixa de Hyrox — referência do coach, não entra no montador.',
  },
  {
    id: 'thruster_wallball', nome: 'Thruster com wall ball',
    descricao: 'Agachamento seguido de arremesso/empurrar a bola acima da cabeça.',
    padrao: 'empurrar', musculosPrimarios: ['ombro', 'quadriceps'], musculosSecundarios: ['gluteo', 'triceps'],
    categorias: ['hiit', 'wod'], equipamento: ['wall_ball'],
    nivel: 'intermediario', tempoMedioSeg: 30,
  },
  {
    id: 'landmine_press', nome: 'Landmine press (cavalinho)',
    descricao: 'Empurrar a barra apoiada no suporte de cavalinho, unilateral.',
    padrao: 'empurrar', musculosPrimarios: ['ombro', 'peito'], musculosSecundarios: ['triceps', 'core'],
    categorias: ['musculacao'], equipamento: ['cavalinho', 'barra_livre'],
    nivel: 'intermediario', tempoMedioSeg: 35, unilateral: true,
  },
  {
    id: 'flexao_trx', nome: 'Flexão no TRX',
    descricao: 'Flexão com as mãos nas alças — dificuldade regulada pelo ângulo do corpo.',
    padrao: 'empurrar', musculosPrimarios: ['peito'], musculosSecundarios: ['triceps', 'ombro', 'core'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['trx'],
    nivel: 'intermediario', tempoMedioSeg: 30,
  },
  {
    id: 'desenvolvimento_y_trx', nome: 'Desenvolvimento em Y no TRX',
    descricao: 'Corpo inclinado, abrir os braços em Y acima da cabeça — deltoide posterior e trapézio inferior.',
    padrao: 'empurrar', musculosPrimarios: ['ombro'], musculosSecundarios: ['trapezio', 'estabilizadores'],
    categorias: ['musculacao'], equipamento: ['trx'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },

  // ===================== PUXAR =====================
  {
    id: 'puxada_aberta_pronada', nome: 'Puxada aberta pronada (monocross)',
    descricao: 'Barra de 1,5 m em pegada pronada aberta, puxar de cima para baixo até o peito.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_15'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'puxada_aberta_supinada', nome: 'Puxada aberta supinada (monocross)',
    descricao: 'Mesma barra em pegada supinada — mais dorsal baixo e bíceps.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_15'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'puxada_fechada_triangulo', nome: 'Puxada fechada triângulo (monocross)',
    descricao: 'Triângulo de pegada neutra estreita, puxar até o peito.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_triangulo'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'puxada_aberta_neutra', nome: 'Puxada aberta neutra (monocross)',
    descricao: 'Puxador aberto de pegada neutra — ombro em posição mais confortável.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_neutro'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'puxada_braco_estendido', nome: 'Puxada com braço estendido no monocross',
    descricao: 'Cotovelos fixos, puxar a barra da polia alta até as coxas — isolamento de dorsal.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_15'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'remada_aberta_pronada', nome: 'Remada aberta pronada (monocross)',
    descricao: 'Sentado, puxar a barra de 1,5 m em pegada pronada até o abdômen.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_15'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_aberta_supinada', nome: 'Remada aberta supinada (monocross)',
    descricao: 'Mesma remada com pegada supinada — cotovelo mais rente ao corpo.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_15'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_fechada_triangulo', nome: 'Remada fechada triângulo (monocross)',
    descricao: 'Puxar o triângulo em direção ao abdômen, sentado.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_triangulo'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_aberta_neutra', nome: 'Remada aberta neutra (monocross)',
    descricao: 'Remada sentada com o puxador aberto neutro.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_neutro'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_cavalinho_fechada', nome: 'Remada cavalinho pegada fechada',
    descricao: 'Barra no suporte de cavalinho, puxar com o pegador fechado (neutro estreito).',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'antebraco'],
    categorias: ['musculacao'], equipamento: ['cavalinho', 'barra_livre', 'pux_cavalinho'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_cavalinho_aberta', nome: 'Remada cavalinho pegada aberta',
    descricao: 'Mesma remada com o pegador aberto — mais dorsal alto e deltoide posterior.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['ombro', 'biceps'],
    categorias: ['musculacao'], equipamento: ['cavalinho', 'barra_livre', 'pux_cavalinho'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'remada_curvada_barra', nome: 'Remada curvada com barra',
    descricao: 'Tronco inclinado, puxar a barra livre em direção ao abdômen.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'posterior_coxa'],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'anilhas'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'remada_halter_unilateral', nome: 'Remada unilateral com halter',
    descricao: 'Apoio no banco, puxar halter ao lado do tronco.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'core'],
    categorias: ['musculacao', 'hibrido'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 40, unilateral: true,
  },
  {
    id: 'face_pull_monocross', nome: 'Face pull na corda',
    descricao: 'Puxar a corda em direção ao rosto, foco em deltoide posterior.',
    padrao: 'puxar', musculosPrimarios: ['ombro', 'costas'], musculosSecundarios: ['estabilizadores'],
    categorias: ['musculacao', 'mobilidade'], equipamento: ['monocross', 'pux_corda'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'pullover_halter', nome: 'Pullover com halter',
    descricao: 'Deitado no banco, levar o halter atrás da cabeça e voltar — dorsal em alongamento.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['peito'],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_barra', nome: 'Rosca direta com barra',
    descricao: 'Pegada supinada na barra, flexionar até o ombro com cotovelos fixos — permite mais carga.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: ['antebraco'],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'anilhas'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_direta_halter', nome: 'Rosca direta com halteres',
    descricao: 'Cotovelos fixos ao tronco, flexionar os halteres até o ombro.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: [],
    categorias: ['musculacao', 'hibrido'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_martelo', nome: 'Rosca martelo com halteres',
    descricao: 'Pegada neutra (polegar para cima), flexionar os halteres — pega braquial/braquiorradial.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: ['antebraco'],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_monocross', nome: 'Rosca no monocross',
    descricao: 'Barra de 60 cm na polia baixa, flexionar mantendo tensão constante do cabo.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_barra_60'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_banco_45', nome: 'Rosca no banco 45° (inclinada)',
    descricao: 'Sentado no banco inclinado, braços atrás do tronco — alonga a cabeça longa do bíceps.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_concentrada', nome: 'Rosca concentrada',
    descricao: 'Sentado, cotovelo apoiado na face interna da coxa, flexionar um braço por vez.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['halter', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 30, unilateral: true, multiarticular: false,
  },
  {
    id: 'rosca_scott', nome: 'Rosca Scott',
    descricao: 'Braços apoiados no banco Scott, flexionar a barra — elimina a ajuda do tronco.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'banco_scott'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_inversa_barra', nome: 'Rosca inversa com barra',
    descricao: 'Pegada pronada na barra, flexionar até o ombro — braquiorradial e extensores do antebraço.',
    padrao: 'puxar', musculosPrimarios: ['antebraco'], musculosSecundarios: ['biceps'],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'anilhas'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'rosca_punho', nome: 'Rosca de punho (wrist curl)',
    descricao: 'Antebraços apoiados no banco, flexionar só os punhos com a barra.',
    padrao: 'puxar', musculosPrimarios: ['antebraco'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'banco'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'preensao_hand_grip', nome: 'Preensão no hand grip',
    descricao: 'Fechar o hand grip ajustável em repetições ou isometria — força de pegada.',
    padrao: 'puxar', musculosPrimarios: ['antebraco'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['hand_grip'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'skierg', nome: 'SkiErg (simulador de esqui)',
    descricao: 'Puxada vertical com os dois braços, adaptada nos 2 monocross lado a lado.',
    padrao: 'puxar', musculosPrimarios: ['costas', 'core'], musculosSecundarios: ['triceps', 'ombro'],
    categorias: ['hyrox'], equipamento: ['monocross'],
    nivel: 'intermediario', tempoMedioSeg: 35, cardio: true, ocupaTudo: true,
    obs: 'Estação 1 da aula fixa de Hyrox — usa as 2 torres de monocross. Referência do coach.',
  },
  {
    id: 'rowing', nome: 'Rowing (simulador de remo)',
    descricao: 'Remada de tração no monocross móvel, dedicado ao dia de Hyrox.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'quadriceps'],
    categorias: ['hyrox'], equipamento: ['monocross_movel'],
    nivel: 'intermediario', tempoMedioSeg: 35, cardio: true,
    obs: 'Estação 5 da aula fixa de Hyrox — 3º monocross, móvel. Referência do coach.',
  },
  {
    id: 'remada_trx', nome: 'Remada no TRX',
    descricao: 'Corpo inclinado sob as alças, puxar o tronco até as mãos.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'core'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['trx'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'rosca_trx', nome: 'Rosca bíceps no TRX',
    descricao: 'Corpo inclinado para trás, flexionar os cotovelos trazendo as mãos à testa.',
    padrao: 'puxar', musculosPrimarios: ['biceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['trx'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'sled_pull', nome: 'Sled Pull (puxar trenó)',
    descricao: 'Puxar o trenó carregado pela corda grossa, mão sobre mão, tronco firme.',
    padrao: 'puxar', musculosPrimarios: ['costas'], musculosSecundarios: ['biceps', 'core', 'posterior_coxa'],
    categorias: ['hyrox'], equipamento: ['sled', 'turf', 'anilha_olimpica_15', 'corda_naval_4m'],
    nivel: 'intermediario', tempoMedioSeg: 35,
    obs: 'Estação 3 da aula fixa de Hyrox — só 1 trenó. Referência do coach.',
  },

  // ===================== QUADRÍCEPS =====================
  {
    id: 'agachamento_smith', nome: 'Agachamento no Smith',
    descricao: 'Agachamento guiado, profundidade controlada.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo', 'posterior_coxa'],
    categorias: ['musculacao'], equipamento: ['smith'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'agachamento_frontal', nome: 'Agachamento frontal',
    descricao: 'Barra apoiada à frente dos ombros — tronco mais ereto e ênfase no quadríceps.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'anilhas'],
    nivel: 'intermediario', tempoMedioSeg: 40,
  },
  {
    id: 'bulgaro_caixote', nome: 'Agachamento búlgaro no caixote',
    descricao: 'Pé de trás apoiado no caixote, agachar unilateral.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['estabilizadores'],
    categorias: ['musculacao'], equipamento: ['caixote', 'halter'],
    nivel: 'avancado', tempoMedioSeg: 45, unilateral: true,
  },
  {
    id: 'leg_press_vertical_smith', nome: 'Vertical Leg Press no Smith',
    descricao: 'Deitado sob a barra guiada, empurrar a carga com os pés na vertical.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'],
    categorias: ['musculacao'], equipamento: ['smith'],
    nivel: 'intermediario', tempoMedioSeg: 40,
  },
  {
    id: 'cadeira_extensora', nome: 'Cadeira extensora',
    descricao: 'Sentado, estender os joelhos contra o rolo — isolamento de quadríceps.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['cadeira_extensora'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'afundo_halter', nome: 'Afundo com halteres',
    descricao: 'Passada à frente/trás segurando halteres.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['posterior_coxa'],
    categorias: ['musculacao', 'hibrido'], equipamento: ['halter'],
    nivel: 'intermediario', tempoMedioSeg: 40,
  },
  {
    id: 'sissy_squat', nome: 'Sissy squat',
    descricao: 'Joelhos à frente e tronco inclinado para trás, descer flexionando só os joelhos — isola o quadríceps.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['corporal'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'panturrilha_em_pe', nome: 'Panturrilha em pé (livre/step)',
    descricao: 'Ponta dos pés na borda do step, subir e descer em amplitude total (pode segurar halter).',
    padrao: 'quadriceps', musculosPrimarios: ['panturrilha'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['corporal', 'step'],
    nivel: 'iniciante', tempoMedioSeg: 25, multiarticular: false,
  },
  {
    id: 'panturrilha_smith', nome: 'Elevação de panturrilha no Smith',
    descricao: 'Em pé na barra guiada, subir na ponta dos pés em amplitude total.',
    padrao: 'quadriceps', musculosPrimarios: ['panturrilha'], musculosSecundarios: [],
    categorias: ['musculacao', 'hibrido'], equipamento: ['smith'],
    nivel: 'iniciante', tempoMedioSeg: 25, multiarticular: false,
  },
  {
    id: 'agachamento_salto', nome: 'Agachamento com salto (squat jump)',
    descricao: 'Agachar e saltar explosivamente, aterrissando suave.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['panturrilha'],
    categorias: ['hiit', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true,
  },
  {
    id: 'goblet_squat', nome: 'Agachamento goblet com kettlebell',
    descricao: 'Segurar KB junto ao peito e agachar.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['hiit', 'wod', 'hibrido'], equipamento: ['kettlebell'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'agachamento_livre', nome: 'Agachamento livre (peso corporal)',
    descricao: 'Air squat — usado em circuitos e aquecimento.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo'],
    categorias: ['hiit', 'wod', 'mobilidade'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'skater', nome: 'Skater (saltos laterais)',
    descricao: 'Saltos laterais de uma perna à outra, como patinador.',
    padrao: 'quadriceps', musculosPrimarios: ['gluteo', 'quadriceps'], musculosSecundarios: ['panturrilha', 'estabilizadores'],
    categorias: ['hiit', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true,
  },
  {
    id: 'box_step_up', nome: 'Step-up no caixote',
    descricao: 'Subir no caixote de 30 cm alternando as pernas, com ou sem carga.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['panturrilha'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['caixote'],
    nivel: 'iniciante', tempoMedioSeg: 35, unilateral: true,
  },
  {
    id: 'wall_ball_shot', nome: 'Wall ball shot',
    descricao: 'Agachar e arremessar a bola no alvo da parede.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'ombro'], musculosSecundarios: ['gluteo'],
    categorias: ['hyrox', 'hiit', 'wod'], equipamento: ['wall_ball'],
    nivel: 'iniciante', tempoMedioSeg: 30,
    obs: 'Estação 8 do Hyrox — única das 8 que o coach também usa nas outras modalidades.',
  },
  {
    id: 'sandbag_lunges', nome: 'Sandbag Lunges (avanço com saco de areia)',
    descricao: 'Passada/afundo à frente com o saco de areia apoiado nos ombros; o joelho de trás toca o chão a cada repetição.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['posterior_coxa', 'core', 'estabilizadores'],
    categorias: ['hyrox'], equipamento: ['sandbag'],
    nivel: 'intermediario', tempoMedioSeg: 35,
    obs: 'Estação 7 da aula fixa de Hyrox — só 1 sandbag. Referência do coach.',
  },
  {
    id: 'agachamento_trx', nome: 'Agachamento no TRX',
    descricao: 'Segurar as alças e agachar com assistência — boa porta de entrada para o iniciante.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['trx'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'afundo_trx', nome: 'Afundo no TRX',
    descricao: 'Pé de trás na alça suspensa, descer em afundo unilateral.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['estabilizadores'],
    categorias: ['musculacao'], equipamento: ['trx'],
    nivel: 'intermediario', tempoMedioSeg: 40, unilateral: true,
  },
  {
    id: 'sled_push', nome: 'Sled Push (empurrar trenó)',
    descricao: 'Empurrar o trenó carregado por uma distância no turf. Passos curtos e potentes, trenó baixo.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: ['ombro', 'triceps', 'core'],
    categorias: ['hyrox'], equipamento: ['sled', 'turf', 'anilha_olimpica_15'],
    nivel: 'intermediario', tempoMedioSeg: 35,
    obs: 'Estação 2 da aula fixa de Hyrox — só 1 trenó. Referência do coach.',
  },

  // ===================== POSTERIOR / GLÚTEO =====================
  {
    id: 'terra_barra_livre', nome: 'Levantamento terra (barra livre)',
    descricao: 'Levantar a barra do chão, dobradiça de quadril.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa', 'gluteo', 'costas'], musculosSecundarios: ['core', 'antebraco'],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'anilhas'],
    nivel: 'avancado', tempoMedioSeg: 45,
  },
  {
    id: 'rdl_smith', nome: 'Levantamento terra romeno no Smith',
    descricao: 'Quadril para trás, barra desce rente às pernas.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['costas'],
    categorias: ['musculacao'], equipamento: ['smith'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'rdl_halter', nome: 'Levantamento terra romeno com halteres',
    descricao: 'Mesma dobradiça de quadril com halteres — libera o Smith no rodízio.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['costas'],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'rdl_barra', nome: 'Levantamento terra romeno com barra',
    descricao: 'Dobradiça de quadril com barra livre — permite mais carga que a versão com halteres.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa', 'gluteo'], musculosSecundarios: ['costas'],
    categorias: ['musculacao'], equipamento: ['barra_livre', 'anilhas'],
    nivel: 'intermediario', tempoMedioSeg: 40,
  },
  {
    id: 'good_morning_barra', nome: 'Good morning (barra)',
    descricao: 'Barra nas costas, flexão de tronco com joelhos semi.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['musculacao', 'tecnica'], equipamento: ['barra_livre'],
    nivel: 'intermediario', tempoMedioSeg: 35,
  },
  {
    id: 'mesa_flexora', nome: 'Mesa flexora',
    descricao: 'Sentado/deitado, flexionar os joelhos contra o rolo — isolamento de posterior de coxa.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['mesa_flexora'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'flexora_nordica', nome: 'Flexora nórdica (nordic curl)',
    descricao: 'Ajoelhado com pés presos, descer o tronco freando com o posterior e voltar.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa'], musculosSecundarios: ['gluteo'],
    categorias: ['musculacao'], equipamento: ['colchonete'],
    nivel: 'avancado', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'elevacao_pelvica', nome: 'Elevação pélvica (hip thrust)',
    descricao: 'Ombros no banco, empurrar o quadril com carga sobre o quadril.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo'], musculosSecundarios: ['posterior_coxa'],
    categorias: ['musculacao'], equipamento: ['banco', 'halter'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'ponte_gluteo', nome: 'Ponte de glúteo no chão',
    descricao: 'Deitado com os pés no chão, elevar o quadril até a linha do tronco — versão peso corporal do hip thrust.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo'], musculosSecundarios: ['posterior_coxa', 'core'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'coice_gluteo_monocross', nome: 'Coice de glúteo no monocross',
    descricao: 'Tornozeleira na polia baixa, estender o quadril para trás — isolamento de glúteo máximo.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo'], musculosSecundarios: ['posterior_coxa'],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_tornozeleira'],
    nivel: 'iniciante', tempoMedioSeg: 30, unilateral: true, multiarticular: false,
  },
  {
    id: 'abducao_quadril_monocross', nome: 'Abdução de quadril no monocross',
    descricao: 'Tornozeleira na polia baixa, afastar a perna para o lado — isolamento de glúteo médio.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_tornozeleira'],
    nivel: 'iniciante', tempoMedioSeg: 30, unilateral: true, multiarticular: false,
  },
  {
    id: 'agachamento_sumo', nome: 'Agachamento sumô',
    descricao: 'Base ampla e pontas dos pés abertas, agachar com halter entre as pernas — adutores e glúteo.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo', 'quadriceps'], musculosSecundarios: ['posterior_coxa'],
    categorias: ['musculacao'], equipamento: ['halter'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'kb_swing', nome: 'Kettlebell swing',
    descricao: 'Dobradiça de quadril explosiva levando a KB à altura dos ombros.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo', 'posterior_coxa'], musculosSecundarios: ['core', 'ombro'],
    categorias: ['hiit', 'wod', 'hibrido'], equipamento: ['kettlebell'],
    nivel: 'iniciante', tempoMedioSeg: 30,
  },
  {
    id: 'extensao_lombar', nome: 'Extensão lombar (superman)',
    descricao: 'Deitado de bruços, elevar tronco e pernas simultaneamente — eretores da espinha.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['lombar'], musculosSecundarios: ['gluteo'],
    categorias: ['musculacao'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'flexao_joelho_trx', nome: 'Flexão de joelho no TRX (hamstring curl)',
    descricao: 'Deitado com os calcanhares nas alças, flexionar os joelhos elevando o quadril.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['posterior_coxa'], musculosSecundarios: ['gluteo', 'core'],
    categorias: ['musculacao'], equipamento: ['trx'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },

  // ===================== CORE =====================
  {
    id: 'abdominal_supra', nome: 'Abdominal Supra (Crunch)',
    descricao: 'Deitado, elevar o tronco flexionando a coluna — reto abdominal superior.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: [],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'abdominal_infra', nome: 'Abdominal Infra (Elevação de pernas)',
    descricao: 'Deitado, elevar as pernas estendidas tirando o quadril do chão — porção inferior.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: [],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'abdominal_remador', nome: 'Abdominal Remador',
    descricao: 'Sentado, aproximar joelhos e tronco ao mesmo tempo, como uma remada.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['quadriceps'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['colchonete'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'abdominal_monocross', nome: 'Abdominal no monocross (cable crunch)',
    descricao: 'Ajoelhado sob a polia alta com a corda, flexionar a coluna contra a carga.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: [],
    categorias: ['musculacao'], equipamento: ['monocross', 'pux_corda'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'russian_twist', nome: 'Russian twist',
    descricao: 'Sentado, rotação de tronco segurando anilha.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: [],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['anilhas', 'colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'abdominal_bicicleta', nome: 'Abdominal bicicleta',
    descricao: 'Deitado, alternar cotovelo e joelho opostos em ritmo contínuo — oblíquos.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: [],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 30, multiarticular: false,
  },
  {
    id: 'prancha', nome: 'Prancha isométrica',
    descricao: 'Manter alinhamento corpo-reto apoiado nos antebraços.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['ombro'],
    categorias: ['hiit', 'wod', 'mobilidade'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 40,
  },
  {
    id: 'prancha_lateral', nome: 'Prancha lateral',
    descricao: 'Apoio lateral no antebraço, estabilizar quadril.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['estabilizadores'],
    categorias: ['hiit', 'wod', 'mobilidade'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'mountain_climber', nome: 'Mountain climber (escalador)',
    descricao: 'Em prancha alta, levar os joelhos ao peito alternadamente, ritmo acelerado.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['ombro', 'quadriceps'],
    categorias: ['hiit', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true,
  },
  {
    id: 'pallof_press', nome: 'Pallof press',
    descricao: 'Anti-rotação: empurrar a manopla da polia à frente resistindo à rotação.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['estabilizadores'],
    categorias: ['musculacao', 'tecnica'], equipamento: ['monocross', 'pux_manopla'],
    nivel: 'intermediario', tempoMedioSeg: 35, multiarticular: false,
  },
  {
    id: 'fallout_trx', nome: 'Fallout no TRX',
    descricao: 'Em pé inclinado, estender os braços à frente resistindo à extensão da lombar.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['ombro', 'estabilizadores'],
    categorias: ['musculacao', 'hiit', 'wod'], equipamento: ['trx'],
    nivel: 'intermediario', tempoMedioSeg: 30, multiarticular: false,
  },

  // ===================== ESTABILIZADORES / CONDICIONAMENTO =====================
  {
    id: 'air_bike_sprint', nome: 'Air bike (sprint/cals)',
    descricao: 'Tiro de calorias na bike de ar.',
    padrao: 'estabilizadores', musculosPrimarios: ['quadriceps', 'core'], musculosSecundarios: ['ombro', 'costas'],
    categorias: ['hyrox', 'hiit', 'wod'], equipamento: ['air_bike'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true, obs: 'Só 2 bikes — no máximo 1 estação de bike por treino.',
  },
  {
    id: 'corda_naval', nome: 'Battle ropes (corda naval)',
    descricao: 'Ondas alternadas/duplas para condicionamento de ombro e core.',
    padrao: 'estabilizadores', musculosPrimarios: ['ombro', 'core'], musculosSecundarios: ['antebraco'],
    categorias: ['hiit', 'wod'], equipamento: ['corda_naval'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true, obs: 'Só 2 — gargalo de estação.',
  },
  {
    id: 'corrida_100m', nome: 'Corrida 100 m (rua)',
    descricao: 'Trecho de corrida intercalado entre estações (estilo Hyrox).',
    padrao: 'estabilizadores', musculosPrimarios: ['quadriceps', 'posterior_coxa'], musculosSecundarios: ['panturrilha', 'gluteo'],
    categorias: ['hyrox', 'hiit'], equipamento: ['corrida'],
    nivel: 'iniciante', tempoMedioSeg: 35, cardio: true,
  },
  {
    id: 'farmer_carry', nome: 'Farmer carry',
    descricao: 'Caminhar segurando carga pesada nas duas mãos.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores', 'antebraco'], musculosSecundarios: ['core', 'costas'],
    categorias: ['hyrox', 'hibrido'], equipamento: ['kettlebell'],
    nivel: 'iniciante', tempoMedioSeg: 40,
    obs: 'Estação 6 da aula fixa de Hyrox — referência do coach.',
  },
  {
    id: 'high_knees', nome: 'High knees (joelho alto)',
    descricao: 'Corrida estacionária levando os joelhos à altura do quadril, rápido.',
    padrao: 'estabilizadores', musculosPrimarios: ['quadriceps', 'core'], musculosSecundarios: ['panturrilha'],
    categorias: ['hiit', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true,
  },
  {
    id: 'polichinelo', nome: 'Polichinelo (jumping jacks)',
    descricao: 'Saltos abrindo e fechando pernas e braços, ritmo contínuo.',
    padrao: 'estabilizadores', musculosPrimarios: ['panturrilha', 'ombro'], musculosSecundarios: ['quadriceps', 'core'],
    categorias: ['hiit', 'wod'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 30, cardio: true,
  },
  {
    id: 'suitcase_carry', nome: 'Suitcase carry (unilateral)',
    descricao: 'Caminhar com carga em uma mão só — anti-flexão lateral.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores', 'core'], musculosSecundarios: ['antebraco'],
    categorias: ['wod'], equipamento: ['kettlebell'],
    nivel: 'intermediario', tempoMedioSeg: 40, unilateral: true,
  },

  // ===================== MOBILIDADE / TÉCNICA =====================
  // Fora da revisão do catálogo de treino: alimentam o aquecimento (Treino Manual e
  // gerador). Uma lista dedicada de mobilidade/aquecimento será desenhada à parte.
  {
    id: 'dead_bug', nome: 'Dead bug',
    descricao: 'Deitado, estender braço e perna opostos mantendo lombar neutra.',
    padrao: 'core', musculosPrimarios: ['core'], musculosSecundarios: ['estabilizadores'],
    categorias: ['mobilidade', 'tecnica'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'bird_dog', nome: 'Bird dog',
    descricao: 'Quatro apoios, estender braço e perna opostos.',
    padrao: 'estabilizadores', musculosPrimarios: ['estabilizadores'], musculosSecundarios: ['core', 'gluteo'],
    categorias: ['mobilidade', 'tecnica'], equipamento: ['colchonete'],
    nivel: 'iniciante', tempoMedioSeg: 35,
  },
  {
    id: 'mob_ombro_elastico', nome: 'Mobilidade de ombro com elástico',
    descricao: 'Passadas e aberturas com elástico para aquecer o ombro.',
    padrao: 'estabilizadores', musculosPrimarios: ['ombro'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['elastico'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
  {
    id: 'mob_bastao', nome: 'Mobilidade torácica com bastão',
    descricao: 'Rotações e overhead com o bastão.',
    padrao: 'estabilizadores', musculosPrimarios: ['core', 'ombro'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['bastao'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
  {
    id: 'mob_quadril_90_90', nome: 'Mobilidade de quadril 90/90',
    descricao: 'Sentado no chão, rotação interna/externa de quadril alternando os lados.',
    padrao: 'posterior_gluteo', musculosPrimarios: ['gluteo'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
  {
    id: 'mob_agachamento_cossaco', nome: 'Agachamento cossaco (mobilidade)',
    descricao: 'Agachamento lateral profundo alternando o lado, mobiliza quadril e adutor.',
    padrao: 'quadriceps', musculosPrimarios: ['quadriceps', 'gluteo'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
  {
    id: 'mob_tornozelo', nome: 'Mobilidade de tornozelo (ankle rock)',
    descricao: 'Joelho à frente do pé apoiado na parede, balanço controlado no tornozelo.',
    padrao: 'quadriceps', musculosPrimarios: ['panturrilha'], musculosSecundarios: [],
    categorias: ['mobilidade'], equipamento: ['corporal'],
    nivel: 'iniciante', tempoMedioSeg: 60,
  },
];

/**
 * O exercício de musculação serve a um dia de FORÇA?
 *
 * Força e Hipertrofia saem da mesma lista ('musculacao'); o recorte é automático e
 * vale só para Força, que pede carga alta (80–95% de 1RM) em poucas reps:
 *  - COMPOSTO: `multiarticular !== false`. Rosca, panturrilha, cadeira extensora e
 *    abdominal são acessórios de volume, não levantamentos de força.
 *  - COM CARGA: pelo menos um equipamento da lista `EQUIP_COM_CARGA`. Derruba os
 *    compostos de peso corporal (TRX, ponte de glúteo, mergulho no banco), que são
 *    ótimos em hipertrofia mas não escalam para força máxima.
 * Hipertrofia usa a lista inteira, sem recorte.
 * @param {Exercicio} e
 * @returns {boolean}
 */
export function servePraForca(e) {
  if (e.multiarticular === false) return false;
  return (e.equipamento || []).some((id) => EQUIP_COM_CARGA.has(id));
}

/**
 * O exercício entra num treino desta modalidade?
 *
 * Ponto ÚNICO de decisão — Força e Hipertrofia compartilham a lista 'musculacao' e
 * só Força aplica o recorte de `servePraForca`. As demais modalidades continuam
 * casando a categoria pelo próprio id.
 * @param {Exercicio} e
 * @param {string} modalidade
 * @returns {boolean}
 */
export function serveModalidade(e, modalidade) {
  if (modalidade === 'forca') return e.categorias.includes('musculacao') && servePraForca(e);
  if (modalidade === 'hipertrofia') return e.categorias.includes('musculacao');
  return e.categorias.includes(/** @type {any} */ (modalidade));
}

/** @type {Record<string, Exercicio>} */
export const EXERCICIO_POR_ID = Object.fromEntries(EXERCICIOS.map((e) => [e.id, e]));

/**
 * Catálogo BASE (imutável) — os exercícios reais do box, com o schema completo
 * (padrão de movimento, nível, tempo, músculos primários/secundários). Serve de
 * fallback offline e de fonte desses campos para o catálogo efetivo (ver ui/catalogo.js).
 * @type {Exercicio[]}
 */
export const EXERCICIOS_BASE = EXERCICIOS.slice();
/** @type {Record<string, Exercicio>} */
export const EXERCICIO_BASE_POR_ID = { ...EXERCICIO_POR_ID };

/**
 * Renomeações e remoções aplicadas na reconstrução do catálogo. Usado pela Academia
 * (`academia/db.js`) para migrar o catálogo do coach sem criar duplicatas: cada
 * entrada casa por id antigo OU pelo nome antigo (o id de um exercício criado na
 * Academia é o slug do nome). `para: null` = o exercício sai do catálogo.
 * @type {Array<{de: string[], para: string|null}>}
 */
export const MIGRACOES_CATALOGO = [
  // renomeados no catálogo base
  { de: ['crossover_polia', 'Crossover na polia'], para: 'crucifixo_crossover_inferior' },
  { de: ['triceps_testa_polia', 'Tríceps testa na polia'], para: 'triceps_testa_monocross' },
  { de: ['puxada_alta_monocross', 'Puxada alta no monocross'], para: 'puxada_aberta_pronada' },
  { de: ['remada_baixa_monocross', 'Remada baixa no monocross (triângulo)', 'Remada baixa (triângulo)'], para: 'remada_fechada_triangulo' },
  { de: ['remada_cavalinho', 'Remada cavalinho'], para: 'remada_cavalinho_fechada' },
  { de: ['rosca_polia', 'Rosca na polia (monocross)', 'Rosca na polia'], para: 'rosca_monocross' },
  { de: ['abducao_quadril_polia', 'Abdução de quadril na polia'], para: 'abducao_quadril_monocross' },
  { de: ['coice_gluteo_polia', 'Coice de glúteo na polia (kickback)', 'Coice de glúteo na polia'], para: 'coice_gluteo_monocross' },
  // ids reais dos exercícios criados pelo coach na Academia (lidos do banco dele)
  { de: ['supino_inclinado_no_smith'], para: 'supino_inclinado_smith' },
  { de: ['triceps_testa_com_hateres'], para: 'triceps_testa_halter' },
  { de: ['triceps_mergulho_no_banco'], para: 'triceps_mergulho_banco' },
  { de: ['elevacao_frontal_com_halteres'], para: 'elevacao_frontal_halter' },
  { de: ['elevacao_lateral_no_monocross'], para: 'elevacao_lateral_monocross' },
  { de: ['vertical_leg_press_no_smith'], para: 'leg_press_vertical_smith' },
  { de: ['remada_baixa_no_monocross_aberta'], para: 'remada_aberta_pronada' },
  { de: ['abdominal_supra_crunch'], para: 'abdominal_supra' },
  { de: ['abdominal_infra_elevacao_de_pernas'], para: 'abdominal_infra' },
  { de: ['abdominal_na_polia_cable_crunch'], para: 'abdominal_monocross' },
  { de: ['skierg_simulador_de_esqui'], para: 'skierg' },
  { de: ['rowing_simulador_de_remo'], para: 'rowing' },
  // renomeados que o coach havia criado na Academia (id = slug do nome antigo)
  { de: ['Tríceps barra na polia', 'Tríceps barra (polia)'], para: 'triceps_barra_monocross' },
  { de: ['Tríceps coice na polia', 'Tríceps coice (polia)'], para: 'triceps_coice_monocross' },
  { de: ['Tríceps corda (monocross)', 'Tríceps corda na polia'], para: 'triceps_corda_monocross' },
  { de: ['Tríceps francês (halter)'], para: 'triceps_frances_halter' },
  { de: ['Crucifixo inclinado (halteres)'], para: 'crucifixo_inclinado_halter' },
  { de: ['Puxada com braço estendido (polia)'], para: 'puxada_braco_estendido' },
  { de: ['Abdominal na Polia', 'Abdominal na polia'], para: 'abdominal_monocross' },
  { de: ['Elevação lateral na polia', 'Elevação lateral (polia)'], para: 'elevacao_lateral_monocross' },
  { de: ['Levantamento terra romeno (Smith)'], para: 'rdl_smith' },
  { de: ['Landmine press (barra no cavalinho)'], para: 'landmine_press' },
  { de: ['Desenvolvimento com halteres'], para: 'desenvolvimento_halter' },
  { de: ['Rosca martelo (halteres)'], para: 'rosca_martelo' },
  { de: ['Agachamento goblet (kettlebell)'], para: 'goblet_squat' },
  { de: ['Face pull na corda (monocross)'], para: 'face_pull_monocross' },
  { de: ['Pallof press (monocross)'], para: 'pallof_press' },
  { de: ['Russian twist (anilha)'], para: 'russian_twist' },
  { de: ['Farmer carry (KB/halteres)'], para: 'farmer_carry' },
  // removido
  { de: ['turkish_get_up', 'Turkish get-up (kettlebell)', 'Turkish get-up'], para: null },
];

/**
 * Substitui o catálogo em uso (em memória) pelo `lista`, mantendo as MESMAS
 * referências de `EXERCICIOS` e `EXERCICIO_POR_ID` — assim quem já importou esses
 * bindings (gerador.js, ui/app.js) passa a enxergar o catálogo novo sem re-importar.
 * Passar lista vazia/inválida restaura o catálogo base (segurança offline).
 * @param {Exercicio[]} lista
 */
export function aplicarCatalogo(lista) {
  const fonte = Array.isArray(lista) && lista.length ? lista : EXERCICIOS_BASE;
  EXERCICIOS.length = 0;
  EXERCICIOS.push(...fonte);
  for (const k of Object.keys(EXERCICIO_POR_ID)) delete EXERCICIO_POR_ID[k];
  for (const e of EXERCICIOS) EXERCICIO_POR_ID[e.id] = e;
}
