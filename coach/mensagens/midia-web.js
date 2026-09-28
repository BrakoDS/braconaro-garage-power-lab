// @ts-check
/**
 * Foto, vídeo e voz no navegador do coach — já no ponto de subir.
 *
 * O espelho do `utils/midia.ts` + `useGravadorDeVoz.ts` do app:
 *   - a foto passa pelo canvas: reduzida a 1280 px de largura e salva em JPEG
 *     0.8, como no app. Vale também para o print colado com Ctrl+V (PNG), que
 *     sai daqui como JPEG — a regra do Storage não precisa de outro formato;
 *   - o vídeo vai como está (comprimir vídeo no navegador não é viável), só
 *     MP4/MOV, com a duração lida do arquivo e uma capa tirada de um quadro
 *     do começo;
 *   - a voz sai do `MediaRecorder` em AAC/MP4, o único formato gravável no
 *     navegador que o iPhone toca. Navegador que só grava WebM/Opus (Firefox)
 *     não grava: o 🎤 desliga com o `AVISO_NAVEGADOR`.
 *
 * Nada aqui fala com o Firebase: devolve blobs e sai do caminho.
 */
import {
  MidiaRecusada,
  formatoDeGravacao,
  validarMidia,
  videoAceito,
  vozCompativel,
} from './chat.js';

/** @typedef {import('./chat.js').TipoMidia} TipoMidia */

/**
 * O que a tela entrega ao `enviarMidia`.
 * @typedef {{
 *   tipo: TipoMidia,
 *   blob: Blob,
 *   nome: string,
 *   mimeType: string,
 *   duracao?: number,
 *   capa?: Blob,
 *   previaUrl?: string,
 * }} MidiaPronta
 *   `previaUrl` é um `blob:` local para a miniatura da fila — quem usa revoga.
 */

const FOTO_LARGURA = 1280;
const FOTO_QUALIDADE = 0.8;
const CAPA_LARGURA = 480;
/** Quanto esperamos o vídeo abrir para ler a duração e tirar a capa. */
const VIDEO_PRAZO_MS = 8_000;

export const AVISO_NAVEGADOR = 'Para gravar áudios compatíveis com os celulares dos alunos, utilize Chrome, Edge ou Safari.';

/** @param {HTMLCanvasElement} canvas @param {number} qualidade @returns {Promise<Blob>} */
function canvasEmJpeg(canvas, qualidade) {
  return new Promise((resolver, rejeitar) => {
    canvas.toBlob((b) => (b ? resolver(b) : rejeitar(new Error('toBlob falhou'))), 'image/jpeg', qualidade);
  });
}

/**
 * Reduz (só encolhe) e salva em JPEG. Fundo branco por baixo: PNG com
 * transparência (print) viraria preto no JPEG.
 * @param {Blob} arquivo @returns {Promise<MidiaPronta>}
 */
async function prepararFoto(arquivo) {
  /** @type {ImageBitmap} */
  let bmp;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new MidiaRecusada('Não deu para abrir essa imagem no navegador (HEIC do iPhone?). Exporte em JPG ou PNG e mande de novo.');
  }
  try {
    const escala = Math.min(1, FOTO_LARGURA / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * escala));
    canvas.height = Math.max(1, Math.round(bmp.height * escala));
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await canvasEmJpeg(canvas, FOTO_QUALIDADE);
    const motivo = validarMidia('imagem', { bytes: blob.size });
    if (motivo) throw new MidiaRecusada(motivo);
    return { tipo: 'imagem', blob, nome: 'foto.jpg', mimeType: 'image/jpeg', previaUrl: URL.createObjectURL(blob) };
  } finally {
    bmp.close();
  }
}

/**
 * Espera um evento do elemento, ou desiste no prazo.
 * @param {HTMLMediaElement} el @param {string} evento @returns {Promise<boolean>}
 */
function esperar(el, evento) {
  return new Promise((resolver) => {
    const fim = (/** @type {boolean} */ ok) => {
      clearTimeout(prazo);
      el.removeEventListener(evento, bom);
      el.removeEventListener('error', ruim);
      resolver(ok);
    };
    const bom = () => fim(true);
    const ruim = () => fim(false);
    const prazo = setTimeout(() => fim(false), VIDEO_PRAZO_MS);
    el.addEventListener(evento, bom, { once: true });
    el.addEventListener('error', ruim, { once: true });
  });
}

/**
 * A duração e a capa do vídeo, lidas de um `<video>` fora da tela. Sem
 * duração, o vídeo vai assim mesmo (a regra aceita sem `duracao`); sem capa,
 * o balão mostra o primeiro quadro que o player carregar.
 * @param {Blob} arquivo @returns {Promise<{ duracao?: number, capa?: Blob }>}
 */
async function lerVideo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    if (!(await esperar(video, 'loadedmetadata'))) return {};
    const duracao = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    let capa;
    try {
      video.currentTime = Math.min(0.5, (duracao ?? 1) / 2);
      if (await esperar(video, 'seeked') && video.videoWidth > 0) {
        const escala = Math.min(1, CAPA_LARGURA / video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * escala);
        canvas.height = Math.round(video.videoHeight * escala);
        /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(video, 0, 0, canvas.width, canvas.height);
        capa = await canvasEmJpeg(canvas, 0.7);
      }
    } catch (e) {
      console.warn('Chat: o vídeo vai sem capa.', e);
    }
    return { duracao, capa };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Um arquivo escolhido no 📎 (ou colado) pronto para subir. Lança
 * `MidiaRecusada` com o motivo quando não dá: formato que o celular não toca,
 * arquivo grande ou longo demais, imagem que o navegador não abre.
 * @param {File} arquivo @returns {Promise<MidiaPronta>}
 */
export async function prepararArquivo(arquivo) {
  if (arquivo.type.startsWith('image/')) return prepararFoto(arquivo);
  if (arquivo.type.startsWith('video/') || /\.(mp4|m4v|mov)$/i.test(arquivo.name)) {
    if (!videoAceito(arquivo.type, arquivo.name)) {
      throw new MidiaRecusada('Esse formato de vídeo não toca no celular do aluno. Mande em MP4 ou MOV.');
    }
    // O tamanho barra antes de abrir o vídeo: 300 MB nem chegam a ser lidos.
    const grande = validarMidia('video', { bytes: arquivo.size });
    if (grande) throw new MidiaRecusada(grande);
    const { duracao, capa } = await lerVideo(arquivo);
    const longo = validarMidia('video', { bytes: arquivo.size, duracao });
    if (longo) throw new MidiaRecusada(longo);
    return {
      tipo: 'video',
      blob: arquivo,
      nome: arquivo.name,
      mimeType: arquivo.type,
      duracao,
      capa,
      previaUrl: capa ? URL.createObjectURL(capa) : undefined,
    };
  }
  throw new MidiaRecusada('Mande uma foto (JPG, PNG…) ou um vídeo (MP4 ou MOV).');
}

/* ---------- voz ---------- */

/**
 * O navegador grava voz num formato que o celular do aluno toca? Sem isso,
 * o 🎤 fica desligado com o `AVISO_NAVEGADOR`.
 */
export function suportaGravacao() {
  return typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && !!formatoDeGravacao((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Uma gravação em andamento.
 * @typedef {{
 *   segundos: () => number,
 *   parar: () => Promise<{ blob: Blob, duracao: number }>,
 *   cancelar: () => void,
 * }} Gravacao
 */

/**
 * Pede o microfone e começa a gravar em AAC/MP4. Lança `MidiaRecusada` com a
 * explicação quando o navegador bloqueia o microfone, não acha um, ou grava
 * num codec que o iPhone não toca.
 * @returns {Promise<Gravacao>}
 */
export async function iniciarGravacao() {
  const formato = formatoDeGravacao((t) => MediaRecorder.isTypeSupported(t));
  if (typeof MediaRecorder === 'undefined' || !formato) throw new MidiaRecusada(AVISO_NAVEGADOR);

  /** @type {MediaStream} */
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const nome = /** @type {any} */ (e)?.name;
    throw new MidiaRecusada(nome === 'NotAllowedError' || nome === 'SecurityError'
      ? 'O navegador bloqueou o microfone. Libere no cadeado ao lado do endereço e tente de novo.'
      : 'Não achei um microfone neste computador.');
  }
  const soltar = () => stream.getTracks().forEach((t) => t.stop());

  /** @type {MediaRecorder} */
  let gravador;
  try {
    gravador = new MediaRecorder(stream, { mimeType: formato, audioBitsPerSecond: 64_000 });
  } catch {
    soltar();
    throw new MidiaRecusada(AVISO_NAVEGADOR);
  }
  /** @type {Blob[]} */
  const partes = [];
  gravador.ondataavailable = (ev) => { if (ev.data.size) partes.push(ev.data); };
  const inicio = performance.now();
  gravador.start(1000);

  // O que o navegador disse que ia gravar pode não ser o que grava: um
  // `audio/mp4` cheio de Opus não toca no iPhone.
  if (gravador.mimeType && !vozCompativel(gravador.mimeType)) {
    gravador.ondataavailable = null;
    gravador.stop();
    soltar();
    throw new MidiaRecusada(AVISO_NAVEGADOR);
  }

  const segundos = () => (performance.now() - inicio) / 1000;
  return {
    segundos,
    parar: () => new Promise((resolver) => {
      const duracao = segundos();
      gravador.onstop = () => {
        soltar();
        resolver({ blob: new Blob(partes, { type: 'audio/mp4' }), duracao });
      };
      gravador.stop();
    }),
    cancelar: () => {
      gravador.ondataavailable = null;
      gravador.onstop = null;
      if (gravador.state !== 'inactive') gravador.stop();
      soltar();
    },
  };
}
