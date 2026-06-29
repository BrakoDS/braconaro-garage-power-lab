// @ts-check
/**
 * Upload de fotos para o Firebase Storage (avatar do aluno e fotos de progresso).
 * As imagens são comprimidas (WebP) antes de subir; no Firestore guardamos só a
 * URL. Caminhos sob gestao/{uid}/... (ver /storage.rules).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

const V = '10.12.2';
let _st = null, _fns = null;

export function storageAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_st) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const stMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-storage.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _st = stMod.getStorage(app);
  _fns = { ref: stMod.ref, uploadBytes: stMod.uploadBytes, getDownloadURL: stMod.getDownloadURL, deleteObject: stMod.deleteObject };
}

/** Comprime um File de imagem para WebP via canvas. */
export async function comprimir(file, maxDim = 1200, q = 0.82) {
  const bmp = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob falhou'))), 'image/webp', q));
  } finally { bmp.close && bmp.close(); }
}

/** Envia um blob e retorna a URL de download. */
export async function enviar(path, blob) {
  await init();
  const r = _fns.ref(_st, path);
  await _fns.uploadBytes(r, blob, { contentType: 'image/webp' });
  return await _fns.getDownloadURL(r);
}

/** Remove um arquivo (silencioso se não existir). */
export async function apagar(path) {
  await init();
  try { await _fns.deleteObject(_fns.ref(_st, path)); } catch {}
}
