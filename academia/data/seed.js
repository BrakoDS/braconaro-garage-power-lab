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
  {
    id: 'pre_exaustao',
    nome: 'Pré-Exaustão',
    resumo: 'Exercício isolador realizado antes de um exercício composto para o mesmo músculo.',
    comoExecutar: [
      '1. Faça um exercício isolador (ex.: voador / crucifixo) até próximo da falha.',
      '2. Sem descanso entre eles, vá direto para o exercício composto (ex.: supino reto).',
      '3. Espere reduzir bastante a carga do composto — o músculo alvo já chega cansado, e isso é o ponto.',
    ].join('\n'),
    objetivo: 'Garantir que o músculo alvo seja o fator limitante no exercício principal, sem fadigar os sinergistas primeiro.',
    ativo: true,
  },
  {
    id: 'pos_exaustao',
    nome: 'Pós-Exaustão',
    resumo: 'Exercício composto seguido imediatamente por um exercício isolador.',
    comoExecutar: [
      '1. Realize a série no exercício composto (ex.: agachamento).',
      '2. Em seguida, sem pausa, faça o isolador (ex.: cadeira extensora).',
      '3. O par inteiro conta como uma série. Só descanse ao final dele.',
    ].join('\n'),
    objetivo: 'Esgotar totalmente as fibras musculares do agrupamento alvo após o exercício principal.',
    ativo: true,
  },
  {
    id: 'tri_set',
    nome: 'Tri-set',
    resumo: 'Três exercícios diferentes executados em sequência para o mesmo grupo muscular, sem descanso.',
    comoExecutar: [
      '1. Deixe os três exercícios montados antes de começar.',
      '2. Faça a série do exercício A, passe imediatamente para o B e depois para o C.',
      '3. O descanso só ocorre após finalizar os três.',
      'No box: três estações reservadas por aluno saem caro no rodízio. Funciona melhor fora do horário de pico, ou combinando um de peso corporal para não travar aparelho.',
    ].join('\n'),
    objetivo: 'Alto acúmulo de estresse metabólico e volume em um curto espaço de tempo.',
    ativo: true,
  },
  {
    id: 'serie_gigante',
    nome: 'Série Gigante (Giant Set)',
    resumo: 'Sequência de 4 ou mais exercícios para o mesmo grupo muscular realizados sem pausa.',
    comoExecutar: [
      '1. Realize 1 série de cada um dos 4 ou mais exercícios, seguidos.',
      '2. Descanse de 2 a 3 minutos ao final do circuito.',
      '3. Repita a sequência.',
      'Mesmo alerta do tri-set, ampliado: 4 aparelhos presos por aluno inviabiliza turma cheia. Reserve para atendimento individual ou monte com halteres e peso corporal.',
    ].join('\n'),
    objetivo: 'Máximo recrutamento de fibras, trabalho de resistência muscular e alto gasto calórico.',
    ativo: true,
  },
  {
    id: 'fst_7',
    nome: 'FST-7 (Fascia Stretch Training 7)',
    resumo: '7 séries do mesmo exercício com descansos curtos (30 a 45 s) ao final do treino do grupo muscular.',
    comoExecutar: [
      '1. No ÚLTIMO exercício daquele músculo, faça 7 séries de 8 a 12 repetições.',
      '2. Use carga moderada — o objetivo é o bombeamento, não o peso.',
      '3. Descanse exatamente 30 a 45 segundos entre cada série. Cronômetro na mão.',
      'Prende um aparelho por uns 8 a 10 minutos. Escolha um que não seja gargalo do rodízio.',
    ].join('\n'),
    objetivo: 'Mapear e expandir a fáscia muscular através do bombeamento máximo de sangue (pump).',
    ativo: true,
  },
  {
    id: 'cluster_set',
    nome: 'Cluster Set',
    resumo: 'Séries fracionadas em pequenos blocos com micro-pausas intra-série (10 a 20 segundos).',
    comoExecutar: [
      '1. Escolha uma carga que você faria por 4 a 6 repetições.',
      '2. Faça 2 repetições e descanse 15 segundos.',
      '3. Mais 2 repetições, mais 15 segundos de descanso.',
      '4. Mais 2 repetições — 6 no total, com uma carga que normalmente daria 4 ou 5.',
      'Diferença para o rest-pause: aqui a pausa vem ANTES da falha, de propósito, para manter a qualidade de cada repetição.',
    ].join('\n'),
    objetivo: 'Permitir maior volume total de treino com cargas pesadas sem perder a explosão e o rendimento.',
    ativo: true,
  },
  {
    id: 'excentrica_lenta',
    nome: 'Excêntrica Lenta (Negativa)',
    resumo: 'Foco na cadência e controle da fase de alongamento do músculo (fase excêntrica).',
    comoExecutar: [
      '1. Faça a fase concêntrica (a subida) em velocidade normal.',
      '2. Controle a fase excêntrica (a descida) levando de 3 a 5 segundos.',
      '3. Repita em TODAS as repetições da série — se a cadência cair, a série acabou.',
      'Conte alto para o aluno nas primeiras vezes. Sozinho, quase todo mundo acelera a descida sem perceber.',
    ].join('\n'),
    objetivo: 'Aumentar a tensão mecânica e provocar maior estímulo para hipertrofia.',
    ativo: true,
  },
  {
    id: 'repeticoes_parciais',
    nome: 'Repetições Parciais',
    resumo: 'Continuação do exercício em amplitude reduzida após atingir a falha em amplitude total.',
    comoExecutar: [
      '1. Execute até não conseguir mais nenhuma repetição completa com boa técnica.',
      '2. Continue fazendo repetições curtas (metade do movimento) até a exaustão.',
      '3. Encerre quando nem a parcial sair com controle — parcial não é sinônimo de movimento solto.',
    ].join('\n'),
    objetivo: 'Extrair o máximo de fadiga metabólica do músculo quando a amplitude total não é mais possível.',
    ativo: true,
  },
];

/**
 * GARAGE STORE — produtos afiliados de exemplo.
 *
 * Entram DESATIVADOS de propósito: os links apontam para a BUSCA da loja, não para
 * um produto com o código de afiliado do coach. Servem de molde — ele troca a URL
 * pela dele, ajusta foto e preço, e só então ativa. Produto inativo não é publicado
 * na vitrine pública, então o box nunca vai ao ar com produto de mentira.
 *
 * A imagem é um SVG embutido (`data:`), não um link para foto de terceiro: nada de
 * hotlink que some, nada de 404 na estreia.
 *
 * @typedef {Object} Produto
 * @property {string} id
 * @property {string} nome
 * @property {string} url        link de afiliado
 * @property {string} categoria
 * @property {number|string} preco
 * @property {string} imagem
 * @property {string} dica       comentário do coach
 * @property {boolean} ativo
 */
const placeholder = (rotulo) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#16181d"/>`
  + `<text x="200" y="196" fill="#e8b339" font-family="sans-serif" font-size="34" font-weight="bold" text-anchor="middle">${rotulo}</text>`
  + `<text x="200" y="232" fill="#8b929d" font-family="sans-serif" font-size="17" text-anchor="middle">troque a foto</text></svg>`);

/** @type {Produto[]} */
export const LOJA_SEED = [
  {
    id: 'creatina_monohidratada',
    nome: 'Creatina monohidratada 300 g',
    url: 'https://lista.mercadolivre.com.br/creatina-monohidratada',
    categoria: 'Suplementos',
    preco: 89.9,
    imagem: placeholder('EXEMPLO'),
    dica: 'A mesma creatina que usamos no box. 5 g por dia, todo dia — inclusive no dia sem treino.',
    ativo: false,
  },
  {
    id: 'corda_pular',
    nome: 'Corda de pular com rolamento',
    url: 'https://lista.mercadolivre.com.br/corda-de-pular-crossfit',
    categoria: 'Acessórios',
    preco: 49.9,
    imagem: placeholder('EXEMPLO'),
    dica: 'Para treinar double under em casa. Pegue uma com cabo de aço e rolamento — as de corda grossa não giram rápido o bastante.',
    ativo: false,
  },
  {
    id: 'halter_ajustavel',
    nome: 'Halteres ajustáveis (par)',
    url: 'https://lista.mercadolivre.com.br/halter-ajustavel',
    categoria: 'Equipamentos',
    preco: 399,
    imagem: placeholder('EXEMPLO'),
    dica: 'Resolve o treino em casa quando você não puder vir ao box. Um par ajustável ocupa o espaço de um e cobre várias cargas.',
    ativo: false,
  },
  {
    id: 'camiseta_dry_fit',
    nome: 'Camiseta dry fit para treino',
    url: 'https://lista.mercadolivre.com.br/camiseta-dry-fit-masculina',
    categoria: 'Vestuário',
    preco: 59.9,
    imagem: placeholder('EXEMPLO'),
    dica: 'Tecido que seca rápido faz diferença real no HIIT e no Hyrox. Algodão encharca e pesa.',
    ativo: false,
  },
];

/** @returns {{inventario: any[], exercicios: any[], tecnicas: Tecnica[], garageStore: Produto[]}} */
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

  return {
    inventario,
    exercicios,
    tecnicas: TECNICAS_SEED.map((t) => ({ ...t })),
    garageStore: LOJA_SEED.map((p) => ({ ...p })),
  };
}
