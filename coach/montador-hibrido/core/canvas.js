// @ts-check
/**
 * O QUADRO BRANCO — desenho livre no <canvas> e a exportação que vai para a IA.
 *
 * A metade de cima do arquivo é pura (conta de resolução, leitura de data URL,
 * escolha de formato) e está coberta por teste. A metade de baixo toca o DOM,
 * porque desenhar é tocar o DOM.
 *
 * DUAS ARMADILHAS que este módulo existe para não cair:
 *
 *  1. CANVAS TRANSPARENTE VIRA FUNDO PRETO EM JPEG. O canvas nasce transparente
 *     e o coach desenha traço preto nele; o quadro branco que ele vê é o CSS
 *     por baixo. Exportar direto em JPEG achata a transparência em PRETO — a IA
 *     receberia um retângulo preto com riscos pretos. Por isso `exportar()`
 *     compõe o desenho sobre branco num canvas de saída antes de codificar.
 *
 *  2. RESOLUÇÃO DE TELA ≠ RESOLUÇÃO DO CANVAS. Num tablet com DPR 2, um canvas
 *     de 800 CSS px desenhado a 800 px de verdade sai borrado, e caligrafia
 *     borrada é exatamente o que a leitura não perdoa. O canvas é criado em
 *     tamanho físico e o contexto é escalado — mas com TETO, senão um monitor
 *     grande em DPR 3 geraria uma imagem de vários MB que não caberia na chamada.
 */
import { CANETA_POR_ID, ESPESSURA, QUADRO } from './cores.js';

/** Qualidade da compressão, como o spec pede. */
export const QUALIDADE = 0.8;

/**
 * Teto de largura do canvas exportado, em pixels reais.
 *
 * 1600px é o ponto em que caligrafia média ainda é legível para o modelo e a
 * imagem comprimida fica na casa das centenas de KB. Acima disso o ganho de
 * leitura some e só sobra peso na chamada — que tem teto no servidor
 * (`MAX_BASE64`), e estourá-lo devolve erro em vez de treino.
 */
export const MAX_LARGURA_EXPORT = 1600;

/**
 * Dimensões reais do canvas a partir do tamanho em CSS px e do DPR.
 *
 * @param {{largura: number, altura: number, dpr?: number, maxPx?: number}} args
 * @returns {{largura: number, altura: number, escala: number}}
 */
export function dimensoesDoCanvas({ largura, altura, dpr = 1, maxPx = MAX_LARGURA_EXPORT }) {
  const l = Math.max(1, Math.round(Number(largura) || 1));
  const a = Math.max(1, Math.round(Number(altura) || 1));
  const d = Math.max(1, Number(dpr) || 1);
  // O teto corta o DPR, não o tamanho em CSS: o quadro continua ocupando a tela
  // inteira, só que renderizado com menos pixels por ponto.
  const escala = Math.min(d, maxPx / l);
  return {
    largura: Math.max(1, Math.round(l * escala)),
    altura: Math.max(1, Math.round(a * escala)),
    escala,
  };
}

/**
 * Separa `data:<mime>;base64,<dados>` nas duas partes.
 *
 * Devolve `null` em vez de lançar quando a string não é uma data URL: o único
 * jeito de isso acontecer é `toDataURL` ter falhado (canvas "sujo" por imagem
 * de outra origem, memória insuficiente), e nesse caso quem chamou precisa
 * decidir o que dizer ao coach — não receber uma exceção no meio do clique.
 *
 * @param {string} dataUrl
 * @returns {{mimeType: string, base64: string}|null}
 */
export function partesDoDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!m || !m[2]) return null;
  return { mimeType: m[1], base64: m[2] };
}

/**
 * O formato de saída.
 *
 * WEBP primeiro porque comprime melhor a mesma lousa (traço sólido sobre fundo
 * chapado é o caso em que ele ganha mais do JPEG), e o servidor aceita os dois.
 * A detecção é por RESULTADO e não por `navigator`: um navegador que não
 * suporta webp em `toDataURL` devolve silenciosamente um PNG, e perguntar a ele
 * se suporta não é confiável. Se o que voltou não for webp, o JPEG assume.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{dataUrl: string, mimeType: string}}
 */
export function codificar(canvas) {
  const webp = canvas.toDataURL('image/webp', QUALIDADE);
  if (webp.startsWith('data:image/webp')) return { dataUrl: webp, mimeType: 'image/webp' };
  return { dataUrl: canvas.toDataURL('image/jpeg', QUALIDADE), mimeType: 'image/jpeg' };
}

/* ------------------------------------------------------------------ *
 * A lousa (toca o DOM)
 * ------------------------------------------------------------------ */


/**
 * @typedef {Object} Lousa
 * @property {(id: string) => void} usar         troca a ferramenta ('preto'|'vermelho'|'azul'|'borracha')
 * @property {() => string} ferramenta           a ferramenta ativa
 * @property {() => void} limpar                 apaga tudo
 * @property {() => any[]} tracos                a pilha de traços, para o histórico
 * @property {(lista: any[]) => void} restaurar  volta a um estado guardado
 * @property {() => boolean} vazia               nada foi desenhado?
 * @property {() => {base64: string, mimeType: string}|null} exportar
 * @property {() => string} miniatura            data URL para a prévia lado a lado
 * @property {() => void} redimensionar
 * @property {(cb: () => void) => void} aoMudar  avisa a tela que o desenho mudou
 */

/**
 * Liga o desenho livre a um <canvas>.
 *
 * O histórico de traços é guardado como BITMAP por traço (`ImageData` seria
 * pesado demais; `toDataURL` por traço, lento). Guardamos a pilha de traços em
 * coordenadas e redesenhamos: é o que permite desfazer e, principalmente,
 * REDIMENSIONAR sem perder o desenho — um canvas redimensionado é um canvas
 * apagado, e o coach que gira o tablet perderia a lousa inteira.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Lousa}
 */
export function criarLousa(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: false }));
  /** @type {{ferramenta: string, pontos: {x: number, y: number}[]}[]} */
  let tracos = [];
  /** @type {{ferramenta: string, pontos: {x: number, y: number}[]}|null} */
  let atual = null;
  let ferramentaAtiva = 'preto';
  let escala = 1;
  /** @type {(() => void)|null} */
  let aoMudarCb = null;

  const avisar = () => { if (aoMudarCb) aoMudarCb(); };

  function aplicarEstilo(ferramenta) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (ferramenta === 'borracha') {
      // `destination-out` apaga de verdade (devolve transparência), em vez de
      // pintar branco por cima. Pintar branco pareceria funcionar na tela e
      // depois apareceria como mancha branca opaca na exportação sobre branco —
      // só que cobrindo traços que deveriam ter sido apagados de verdade.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = ESPESSURA.borracha;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      return;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = ESPESSURA.caneta;
    ctx.strokeStyle = CANETA_POR_ID[ferramenta]?.cor || CANETA_POR_ID.preto.cor;
  }

  function desenharTraco(t) {
    if (t.pontos.length < 2) {
      // Um toque sem arrasto é um ponto: sem este caso, pingar o "i" não marca nada.
      if (!t.pontos.length) return;
      aplicarEstilo(t.ferramenta);
      ctx.beginPath();
      ctx.arc(t.pontos[0].x, t.pontos[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      return;
    }
    aplicarEstilo(t.ferramenta);
    ctx.beginPath();
    ctx.moveTo(t.pontos[0].x, t.pontos[0].y);
    for (const p of t.pontos.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function redesenhar() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(escala, escala);
    for (const t of tracos) desenharTraco(t);
    ctx.globalCompositeOperation = 'source-over';
  }

  function redimensionar() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = dimensoesDoCanvas({ largura: r.width, altura: r.height, dpr: window.devicePixelRatio || 1 });
    canvas.width = d.largura;
    canvas.height = d.altura;
    escala = d.escala;
    redesenhar();
  }

  /** Coordenada do ponteiro em CSS px relativos ao canvas (a escala é aplicada no contexto). */
  function posicao(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    atual = { ferramenta: ferramentaAtiva, pontos: [posicao(ev)] };
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!atual) return;
    ev.preventDefault();
    atual.pontos.push(posicao(ev));
    // Redesenha só o traço em andamento, não a pilha inteira: com 200 traços na
    // lousa, redesenhar tudo a cada movimento do dedo engasga no tablet.
    desenharTraco(atual);
    ctx.globalCompositeOperation = 'source-over';
  });

  const terminar = (ev) => {
    if (!atual) return;
    if (ev?.pointerId != null && canvas.hasPointerCapture?.(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
    tracos.push(atual);
    atual = null;
    redesenhar();
    avisar();
  };
  canvas.addEventListener('pointerup', terminar);
  canvas.addEventListener('pointercancel', terminar);
  canvas.addEventListener('pointerleave', terminar);

  return {
    usar(id) { ferramentaAtiva = id; },
    ferramenta() { return ferramentaAtiva; },
    limpar() { tracos = []; atual = null; redesenhar(); avisar(); },
    vazia() { return tracos.length === 0; },

    /**
     * A pilha de traços, para o histórico guardar.
     *
     * Cópia RASA de propósito: o traço é imutável depois de terminado (ninguém
     * volta a mexer nos pontos dele), então copiar o array basta para o
     * histórico ter uma foto própria. Cópia profunda duplicaria milhares de
     * pontos a cada tecla digitada.
     */
    tracos() { return [...tracos]; },

    /** Volta a pilha de traços a um estado guardado. */
    restaurar(lista) {
      tracos = Array.isArray(lista) ? [...lista] : [];
      atual = null;
      redesenhar();
      avisar();
    },
    redimensionar,
    aoMudar(cb) { aoMudarCb = cb; },

    exportar() {
      if (!tracos.length) return null;
      const saida = document.createElement('canvas');
      saida.width = canvas.width;
      saida.height = canvas.height;
      const sctx = /** @type {CanvasRenderingContext2D} */ (saida.getContext('2d'));
      // O branco PRIMEIRO: é o fundo do quadro, e sem ele o JPEG achata a
      // transparência em preto (ver o cabeçalho do arquivo).
      sctx.fillStyle = QUADRO;
      sctx.fillRect(0, 0, saida.width, saida.height);
      sctx.drawImage(canvas, 0, 0);
      try {
        const { dataUrl, mimeType } = codificar(saida);
        const partes = partesDoDataUrl(dataUrl);
        return partes ? { base64: partes.base64, mimeType } : null;
      } catch (e) {
        console.error('Falha ao exportar a lousa:', e);
        return null;
      }
    },

    /**
     * A imagem do traço para a prévia — PNG TRANSPARENTE, ao contrário de
     * `exportar()`.
     *
     * A diferença é o que faz a prévia funcionar: lá o desenho é sobreposto ao
     * texto que o coach digitou, e um PNG com fundo branco chapado cobriria o
     * texto inteiro — o lado A do comparativo mostraria só o rabisco, para um
     * coach que escreveu o treino todo. O branco de `exportar()` continua
     * existindo porque lá o destino é JPEG, que não tem transparência (e a
     * achataria em preto).
     */
    miniatura() {
      try {
        return {
          dataUrl: tracos.length ? canvas.toDataURL('image/png') : '',
          proporcao: canvas.height ? canvas.width / canvas.height : 2,
        };
      } catch (e) {
        console.error('Falha ao gerar a miniatura da lousa:', e);
        return { dataUrl: '', proporcao: 2 };
      }
    },
  };
}
