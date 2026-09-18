// @ts-check
/**
 * O DESFAZER DA LOUSA — uma pilha de estados do quadro inteiro.
 *
 * A lousa tem DUAS camadas (o texto digitado e o traço desenhado) e um botão de
 * Limpar que zera as duas. Um desfazer que só soubesse de traço — como o
 * "↶ Traço" que existia antes — deixava o coach sem saída nos dois casos que
 * mais doem: apagar texto sem querer e clicar em Limpar por engano.
 *
 * ── Por que snapshot, e não o desfazer do navegador ─────────────────────────
 * `document.execCommand('undo')` desfaz o texto, mas com a granularidade que o
 * navegador escolher, e sem saber que existe um canvas por cima. Um botão só,
 * atendendo às duas camadas, precisaria adivinhar qual das duas foi a última a
 * mudar e torcer para a pilha interna do navegador estar no mesmo ponto que a
 * nossa. Guardar o estado inteiro do quadro é maior em memória e exato: desfazer
 * é restaurar, não reproduzir.
 *
 * O preço é a memória, e por isso a pilha tem TETO. Passando dele, o mais antigo
 * cai — o coach nunca vai querer voltar trinta passos numa lousa que ele acabou
 * de escrever, e uma pilha sem limite cresceria com cada tecla digitada durante
 * a aula inteira.
 *
 * Módulo puro: guarda o que recebe, sem saber o que é. Quem sabe ler e restaurar
 * o canvas e o editor é `ui/lousa.js`.
 *
 * @template T
 * @typedef {{chave: string, estado: T}} Passo
 */

/** Quantos passos para trás a lousa guarda. */
export const MAX_PASSOS = 30;

/**
 * Cria a pilha.
 *
 * @template T
 * @param {{max?: number}} [opcoes]
 */
export function criarHistorico({ max = MAX_PASSOS } = {}) {
  /** @type {Passo<T>[]} */
  let pilha = [];
  const teto = Math.max(2, Number(max) || MAX_PASSOS);

  return {
    /**
     * Guarda um estado do quadro.
     *
     * `chave` é a assinatura barata do estado — quem chama a monta. Estado igual
     * ao do topo é IGNORADO: sem isso, cada tecla digitada empilharia um passo
     * e o coach teria de clicar em Desfazer cinquenta vezes para apagar uma
     * palavra.
     *
     * @param {string} chave @param {T} estado
     * @returns {boolean} entrou na pilha?
     */
    registrar(chave, estado) {
      const topo = pilha[pilha.length - 1];
      if (topo && topo.chave === chave) return false;
      pilha.push({ chave, estado });
      // O mais antigo cai primeiro. `shift` num array de 30 é barato e mantém a
      // ordem óbvia — uma fila circular aqui seria otimização sem problema.
      if (pilha.length > teto) pilha.shift();
      return true;
    },

    /**
     * Desfaz: tira o estado atual e devolve o anterior.
     *
     * Devolve `null` quando só resta o estado inicial — desfazer o começo não
     * tem para onde ir, e devolver o próprio estado atual faria o botão parecer
     * quebrado (clica e nada muda).
     *
     * @returns {T|null}
     */
    desfazer() {
      if (pilha.length < 2) return null;
      pilha.pop();
      return pilha[pilha.length - 1].estado;
    },

    /** Tem para onde voltar? É o que liga e desliga o botão. */
    podeDesfazer() { return pilha.length >= 2; },

    /** Quantos estados guardados (inclui o atual). */
    tamanho() { return pilha.length; },

    /**
     * Zera a pilha e começa de novo neste estado.
     *
     * Usado ao abrir um treino do Calendário: o quadro passou a ser OUTRO
     * documento, e deixar o histórico do treino anterior permitiria desfazer de
     * um treino para dentro do outro.
     *
     * @param {string} chave @param {T} estado
     */
    recomecar(chave, estado) {
      pilha = [{ chave, estado }];
    },
  };
}
