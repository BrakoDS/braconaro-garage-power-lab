// @ts-check
/**
 * AS CORES DA FERRAMENTA, em um lugar só.
 *
 * Por que em JS e não só no CSS: as três canetas não são decoração. A cor com
 * que o coach escreveu é DADO — vermelho é intensidade, azul é série, preto é
 * exercício —, e esse dado atravessa o canvas (que pinta o traço), o prompt da
 * IA (que interpreta a cor) e a prévia (que colore o card estruturado de volta).
 * Três lugares lendo o mesmo hexadecimal de fontes diferentes é a garantia de
 * que um dia eles divergem, e o vermelho da lousa deixaria de ser o vermelho do
 * card sem ninguém notar.
 *
 * A moldura escura continua vindo do CSS (`app.css`), porque ali a cor é só
 * aparência e ninguém precisa dela em tempo de execução.
 */

/** @typedef {'preto'|'vermelho'|'azul'} CanetaId */

/**
 * As três canetas do quadro, na ordem da barra de ferramentas.
 * `significado` não é legenda bonita: é o texto que a tela mostra ao coach e
 * o mesmo conceito que o prompt da função descreve para a IA.
 */
export const CANETAS = [
  {
    id: /** @type {CanetaId} */ ('preto'),
    rotulo: 'Preto',
    cor: '#1A1A1A',
    significado: 'Títulos, exercícios e blocos (A · Mobilidade, B · Aquecimento, C · Força, D · Metcon)',
    atalho: '1',
  },
  {
    id: /** @type {CanetaId} */ ('vermelho'),
    rotulo: 'Vermelho',
    cor: '#D32F2F',
    significado: 'Intensidade, RIR, descansos e observações de carga',
    atalho: '2',
  },
  {
    id: /** @type {CanetaId} */ ('azul'),
    rotulo: 'Azul',
    cor: '#1976D2',
    significado: 'Séries, repetições, subdivisões da turma e estações dos 8 alunos',
    atalho: '3',
  },
];

/** Mapa id → caneta, para quem já sabe qual quer. */
export const CANETA_POR_ID = Object.fromEntries(CANETAS.map((c) => [c.id, c]));

/** Fórmica do quadro. A lousa é branca de verdade: é ela que a IA vai ler. */
export const QUADRO = '#FFFFFF';

/**
 * Espessura de cada ferramenta, em pixels do canvas.
 *
 * A borracha é MUITO mais grossa que as canetas de propósito: apagar com um
 * traço de 3px no dedo, num tablet, é impossível — o coach passaria dez vezes
 * no mesmo lugar. 28px apaga do jeito que um apagador de quadro apaga.
 */
export const ESPESSURA = { caneta: 3, borracha: 28 };

/**
 * Cor de cada bloco no treino estruturado.
 *
 * Mantida separada das canetas de propósito: o bloco não é uma cor de caneta
 * (o coach escreve os quatro em preto), é uma etapa da aula. Usar o vermelho da
 * caneta para marcar o bloco Metcon faria o coach ler "intensidade" onde está
 * escrito "etapa".
 */
export const COR_BLOCO = { A: '#6E7781', B: '#1976D2', C: '#FFC700', D: '#D32F2F' };
