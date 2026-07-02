// @ts-check
/**
 * Mescla da caixa de entrada do aluno (lado coach).
 *
 * Lê `portalInbox/{email}` de cada aluno com e-mail, aplica no registro do
 * coach (foto nova → fotoUrl; feedbacks → a.feedbacks, sem duplicar) e apaga a
 * caixa. Silencioso: se a nuvem/regra falhar, não quebra o app do coach.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';

const V = '10.12.2';
let _db = null, _fns = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, deleteDoc: fsMod.deleteDoc };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/**
 * Processa as caixas de entrada e aplica as mudanças via `aplicar(id, patch)`.
 * @param {any[]} alunos @param {(id:string, patch:any)=>void} aplicar
 * @returns {Promise<number>} quantos alunos tiveram novidade
 */
export async function mergarInboxes(alunos, aplicar) {
  if (!cloudAtivo()) return 0;
  let n = 0;
  try {
    await init();
    const comEmail = (alunos || []).filter((a) => emailKey(a.email));
    await Promise.all(comEmail.map(async (a) => {
      const key = emailKey(a.email);
      const snap = await _fns.getDoc(_fns.doc(_db, 'portalInbox', key));
      if (!snap.exists()) return;
      const inbox = snap.data() || {};
      const patch = {};
      if (inbox.fotoNova) patch.fotoUrl = inbox.fotoNova;
      const novos = Array.isArray(inbox.feedbacks) ? inbox.feedbacks : [];
      if (novos.length) {
        const atuais = Array.isArray(a.feedbacks) ? a.feedbacks : [];
        const ids = new Set(atuais.map((f) => f && f.id));
        const add = novos.filter((f) => f && !ids.has(f.id));
        if (add.length) patch.feedbacks = [...atuais, ...add].sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0));
      }
      if (Object.keys(patch).length) { aplicar(a.id, patch); n++; }
      await _fns.deleteDoc(_fns.doc(_db, 'portalInbox', key)); // esvazia a caixa já processada
    }));
  } catch (e) {
    console.warn('Falha ao mesclar a caixa do Portal do Aluno:', e?.code || e);
  }
  return n;
}
