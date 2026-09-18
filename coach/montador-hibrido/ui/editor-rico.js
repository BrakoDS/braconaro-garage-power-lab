// @ts-check
/**
 * O QUADRO DIGITÁVEL — um `contenteditable` que entende as três canetas do box.
 *
 * Substituiu a `<textarea>`: escrever à mão no canvas com o mouse é improdutivo,
 * e o coach precisa DIGITAR a maior parte do treino. Mas a cor não podia ir
 * embora junto — ela é dado (vermelho é intensidade, azul é série), e é o que a
 * IA lê. Então o texto digitado passou a ser colorido também.
 *
 * ── Por que `execCommand`, que é "obsoleto" ──────────────────────────────────
 * `document.execCommand('foreColor')` está marcado como deprecated há anos e
 * continua sendo o ÚNICO jeito de colorir uma seleção num contenteditable sem
 * escrever um editor de texto rico inteiro: a alternativa é cirurgia manual de
 * `Range` (partir nós de texto na borda da seleção, costurar os `<span>`,
 * refazer a seleção depois) — centenas de linhas e uma classe de bug nova num
 * projeto que não tem uma dependência sequer. Nenhum navegador removeu o método,
 * e a substituição padronizada nunca chegou. Se um dia sair, é este arquivo que
 * muda, e só ele.
 *
 * ── As duas armadilhas que este módulo existe para não cair ──────────────────
 *  1. CLICAR NA BARRA TIRA O FOCO DO EDITOR, e com o foco vai a seleção — o
 *     `foreColor` chegaria sem ter o que colorir. `preventDefault` no
 *     `mousedown` dos botões faz o foco nunca sair, e é por isso que a cor se
 *     aplica ao que estava selecionado.
 *  2. COLAR TRAZ HTML DE FORA. Um treino copiado do WhatsApp ou do Word entra
 *     com fonte, fundo, tabela e, em tese, marcação executável. Todo `paste` é
 *     interceptado e reinserido como TEXTO PURO.
 */
import { CANETAS, CANETA_POR_ID } from '../core/cores.js';
import { normalizarCor, compactar, textoPlano, COR_PADRAO } from '../core/texto-rico.js';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Elementos que valem uma quebra de linha ao serem fechados. */
const BLOCOS = new Set(['DIV', 'P', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);

/**
 * @typedef {Object} EditorRico
 * @property {() => import('../core/texto-rico.js').Segmento[]} segmentos
 * @property {() => string} texto
 * @property {(cor: string) => void} pintar
 * @property {(segmentos: any[]) => void} carregar
 * @property {() => void} limpar
 * @property {() => boolean} vazio
 * @property {() => void} focar
 * @property {(cb: () => void) => void} aoMudar
 */

/**
 * Liga o quadro digitável a um elemento.
 * @param {HTMLElement} raiz o `[contenteditable]`
 * @returns {EditorRico}
 */
export function criarEditor(raiz) {
  raiz.setAttribute('contenteditable', 'true');
  raiz.setAttribute('spellcheck', 'false');
  // `styleWithCSS` faz o navegador emitir `<span style="color:…">` em vez do
  // `<font color>` do século passado. Sem isso, `getComputedStyle` ainda lê a
  // cor certa, mas o HTML guardado fica com tag que nenhum sanitizador moderno
  // espera.
  try { document.execCommand('styleWithCSS', false, 'true'); } catch { /* navegador antigo: segue */ }

  /** @type {(() => void)|null} */
  let aoMudarCb = null;
  const avisar = () => { if (aoMudarCb) aoMudarCb(); };

  /**
   * Percorre o editor e devolve o texto em trechos com cor.
   *
   * A cor sai de `getComputedStyle(...).color` do elemento PAI de cada nó de
   * texto, e não de um atributo: assim o aninhamento que o navegador cria
   * sozinho (um span dentro de outro, um negrito no meio) resolve-se sem este
   * código ter de entender a árvore que ele montou.
   */
  function segmentos() {
    /** @type {import('../core/texto-rico.js').Segmento[]} */
    const out = [];

    /** @param {Node} no */
    const andar = (no) => {
      for (const filho of Array.from(no.childNodes)) {
        if (filho.nodeType === Node.TEXT_NODE) {
          const texto = filho.textContent || '';
          if (!texto) continue;
          const pai = /** @type {HTMLElement|null} */ (filho.parentElement);
          const cor = pai ? normalizarCor(getComputedStyle(pai).color) : COR_PADRAO;
          out.push({ texto, cor });
          continue;
        }
        if (filho.nodeType !== Node.ELEMENT_NODE) continue;
        const el = /** @type {HTMLElement} */ (filho);
        if (el.tagName === 'BR') { out.push({ texto: '\n', cor: COR_PADRAO }); continue; }
        // A quebra vem ANTES do conteúdo do bloco, não depois: o contenteditable
        // guarda a primeira linha solta e as seguintes em <div>, então quebrar no
        // fechamento acrescentaria uma linha vazia no fim a cada parágrafo.
        if (BLOCOS.has(el.tagName) && out.length) out.push({ texto: '\n', cor: COR_PADRAO });
        andar(el);
      }
    };

    andar(raiz);
    // Sem `compactar` aqui: o espaço em branco entre trechos precisa sobreviver
    // (ele separa palavras). Quem junta para o prompt é `paraPrompt`.
    return out.filter((s) => s.texto !== '');
  }

  /** Aplica a cor à seleção, ou define a cor do que for digitado a seguir. */
  function pintar(corId) {
    const caneta = CANETA_POR_ID[corId];
    if (!caneta) return;
    raiz.focus();
    try {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('foreColor', false, caneta.cor);
    } catch (e) {
      console.warn('Não deu para pintar o texto:', e);
    }
    avisar();
  }

  /** Enche o quadro a partir de trechos coloridos (o Calendário reabrindo um treino). */
  function carregar(segs) {
    const html = compactar(segs || [])
      .map((s) => {
        const corpo = esc(s.texto).replace(/\n/g, '<br>');
        return s.cor === COR_PADRAO ? corpo : `<span style="color:${CANETA_POR_ID[s.cor].cor}">${corpo}</span>`;
      })
      .join('');
    raiz.innerHTML = html;
    avisar();
  }

  // ---- colar vira texto puro ----
  raiz.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const texto = ev.clipboardData?.getData('text/plain') ?? '';
    if (!texto) return;
    // `insertText` mantém a cor ativa no cursor, então o que o coach colar entra
    // na caneta que ele estava usando — que é o comportamento de um quadro.
    try { document.execCommand('insertText', false, texto); } catch { raiz.textContent += texto; }
  });

  // ---- Enter sai como quebra simples ----
  // Sem isto o navegador cria um <div> novo por linha, e cada um herda (ou
  // perde) a cor de um jeito diferente conforme o navegador.
  raiz.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    ev.preventDefault();
    try { document.execCommand('insertLineBreak'); } catch { document.execCommand('insertHTML', false, '<br>'); }
  });

  raiz.addEventListener('input', avisar);

  return {
    segmentos,
    texto: () => textoPlano(segmentos()),
    pintar,
    carregar,
    limpar() { raiz.innerHTML = ''; avisar(); },
    vazio: () => !raiz.textContent?.trim(),
    focar: () => raiz.focus(),
    aoMudar(cb) { aoMudarCb = cb; },
  };
}

/** As canetas, para a barra de ferramentas montar os botões. */
export { CANETAS };
