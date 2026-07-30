// @ts-check
/**
 * SEMENTE (dados iniciais) da Academia.
 *
 * Transforma o inventário e o catálogo REAIS do montador
 * (montador/data/*.js) no formato editável usado por este app. Roda apenas
 * na primeira vez (quando não há dados locais nem na nuvem). A partir daí, a
 * fonte da verdade é o que você editar aqui (Firestore).
 */
import { EQUIPAMENTOS } from '../../montador/data/equipamentos.js';
import { EXERCICIOS } from '../../montador/data/exercicios.js';

/** Categorias do montador → rótulos do inventário desta app. */
export const CAT_MAP = {
  peso_livre: 'Peso livre',
  estacao: 'Máquina',
  cardio: 'Cardio',
  acessorio: 'Acessório',
  corporal: 'Corporal',
};

/** Músculos internos do montador → rótulos legíveis desta app. */
export const MUSC_MAP = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', trapezio: 'Trapézio',
  biceps: 'Bíceps', triceps: 'Tríceps', antebraco: 'Antebraço',
  core: 'Core/Abdômen', lombar: 'Lombar',
  quadriceps: 'Quadríceps', posterior_coxa: 'Posterior de coxa',
  gluteo: 'Glúteo', panturrilha: 'Panturrilha', estabilizadores: 'Estabilizadores',
};

/** Categorias do montador → tags de treino desta app (MUSCULAÇÃO, HYROX, HIIT, CROSS, GAP, MOBILIDADE). */
export const TAG_MAP = {
  musculacao: 'MUSCULAÇÃO', // serve a Força E Hipertrofia — a diferença é a regra, não a lista
  forca: 'MUSCULAÇÃO',      // legado: catálogos antigos separavam as duas
  hipertrofia: 'MUSCULAÇÃO',
  hyrox: 'HYROX',
  gap: 'GAP',
  hiit: 'HIIT',
  wod: 'CROSS',     // cross-training (WOD) — built-in usam o token 'wod'
  cross: 'CROSS',   // cross-training classificado pelo coach
  cardio: 'HIIT',
  mobilidade: 'MOBILIDADE', // alimenta o Aquecimento/Mobilidade (aba própria na Academia)
  // tecnica, hibrido → sem tag direta (são estruturais, não aparecem como filtro)
};

/**
 * TÉCNICAS DE TREINO — material de referência do box, não entra na geração.
 *
 * Diferente do inventário e do catálogo, isto não vem do montador: é conteúdo
 * escrito, que o coach edita com as palavras dele. Por isso a subida de versão de
 * semente só ACRESCENTA o que falta (ver `backfillTecnicas` em db.js) — nunca
 * reescreve uma técnica existente, ao contrário do que fazemos com exercício
 * semeado, onde o gerador depende dos metadados estarem certos.
 *
 * Atenção ao nome: a categoria `tecnica` do catálogo de exercícios é outra coisa
 * (marca levantamento técnico, ex.: clean, snatch). Não há relação entre as duas.
 *
 * @typedef {Object} Tecnica
 * @property {string} id
 * @property {string} nome
 * @property {string} resumo         Uma frase — o conceito.
 * @property {string} comoExecutar   Passo a passo da aplicação no treino.
 * @property {string} objetivo       Para que serve / quando aplicar.
 * @property {boolean} ativo
 */

/** @type {Tecnica[]} */
export const TECNICAS_SEED = [
  {
    id: 'drop_set',
    nome: 'Drop Set',
    resumo: 'Chegar à falha, tirar carga na hora e seguir até falhar de novo, sem descanso.',
    comoExecutar: [
      '1. Execute a série normalmente até a falha concêntrica (não conseguir mais subir o peso com técnica).',
      '2. Reduza a carga em 20–30% imediatamente — o intervalo é só o tempo de trocar a anilha ou o pino.',
      '3. Sem descanso, continue até a nova falha.',
      '4. Pode encadear 2 ou 3 quedas de carga. A última é sempre a mais leve.',
      'No box: mais rápido no halter e no monocross (pino) do que na barra livre, onde trocar anilha custa tempo demais.',
    ].join('\n'),
    objetivo: 'Hipertrofia — estende a série além da falha e aumenta o tempo sob tensão sem precisar de mais séries.',
    ativo: true,
  },
  {
    id: 'bi_set',
    nome: 'Bi-set',
    resumo: 'Dois exercícios seguidos, sem pausa entre eles.',
    comoExecutar: [
      '1. Deixe os dois exercícios montados ANTES de começar — o bi-set morre se o aluno tiver que procurar equipamento no meio.',
      '2. Execute o primeiro exercício até o número de repetições previsto.',
      '3. Passe direto para o segundo, sem descanso.',
      '4. Só então descanse. O par inteiro conta como uma série.',
      'Duas montagens: mesmo grupo muscular (dois de peito) para esgotar; ou antagonistas (peito + costas) para manter a intensidade em cada um.',
    ].join('\n'),
    objetivo: 'Densidade — mais volume no mesmo tempo de aula. Bom quando a turma está cheia e o rodízio precisa andar.',
    ativo: true,
  },
  {
    id: 'pico_contracao',
    nome: 'Pico de Contração',
    resumo: 'Segurar 2 a 3 segundos no ponto de maior tensão, a cada repetição.',
    comoExecutar: [
      '1. Suba até o ponto de encurtamento máximo do músculo.',
      '2. Segure 2 a 3 segundos apertando o músculo de propósito — sem travar a articulação nem prender a respiração.',
      '3. Desça controlado e repita.',
      'Espere usar bem menos carga que o normal: a pausa é o estímulo, e peso demais faz o aluno roubar justamente onde ele deveria segurar.',
    ].join('\n'),
    objetivo: 'Conexão mente-músculo e hipertrofia. Ótimo em isolados (rosca, crucifixo, elevação lateral, coice de glúteo).',
    ativo: true,
  },
  {
    id: 'rest_pause',
    nome: 'Rest-Pause',
    resumo: 'Falhar, descansar 10 a 15 segundos e arrancar mais algumas repetições com a mesma carga.',
    comoExecutar: [
      '1. Execute até a falha.',
      '2. Descanse 10 a 15 segundos — sem soltar a posição, só respirando.',
      '3. Retome com a MESMA carga e faça as repetições que saírem (normalmente 2 a 5).',
      '4. Repita o ciclo 1 ou 2 vezes.',
      'Diferença para o drop set: aqui a carga não muda, o que muda é o descanso curto.',
    ].join('\n'),
    objetivo: 'Força e hipertrofia com carga alta. Exige aluno experiente e, em barra livre ou smith, segurança de parceiro.',
    ativo: true,
  },
];

/** @returns {{inventario: any[], exercicios: any[]}} */
export function seedData() {
  const inventario = EQUIPAMENTOS.map((e) => ({
    id: e.id,
    nome: e.nome,
    categoria: CAT_MAP[e.categoria] || 'Acessório',
    quantidade: Number.isFinite(e.unidades) ? e.unidades : 1,
    area: '',
    obs: e.obs || '',
  }));

  const exercicios = EXERCICIOS.map((x) => ({
    id: x.id,
    nome: x.nome,
    equipamentoIds: Array.isArray(x.equipamento) ? x.equipamento.slice() : [],
    tags: [...new Set((x.categorias || []).map((c) => TAG_MAP[c]).filter(Boolean))],
    musculos: [...new Set([...(x.musculosPrimarios || []), ...(x.musculosSecundarios || [])].map((m) => MUSC_MAP[m]).filter(Boolean))],
    // Campos que o gerador do montador precisa (padrão de movimento, nível e tempo).
    // Ficam salvos na Academia para que o coach possa editá-los e para que exercícios
    // criados aqui também alimentem a geração full body.
    padrao: x.padrao || '',
    nivel: x.nivel || 'intermediario',
    tempoMedioSeg: Number.isFinite(x.tempoMedioSeg) ? x.tempoMedioSeg : 35,
    // Composto ou isolado: decide se o exercício entra no dia de FORÇA e como o
    // Híbrido mistura os blocos. Editável na Academia, por isso vai na semente.
    multiarticular: x.multiarticular !== false,
    // Ocupa o aparelho inteiro (crossover, SkiErg): o motor de viabilidade reserva
    // TODO o estoque do equipamento p/ essa estação. Editável na Academia.
    ocupaTudo: x.ocupaTudo === true,
    obs: x.descricao || '',
  }));

  return { inventario, exercicios, tecnicas: TECNICAS_SEED.map((t) => ({ ...t })) };
}
