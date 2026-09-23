// @ts-check
/**
 * Mescla da caixa de entrada do aluno (lado coach).
 *
 * Lê `portalInbox/{email}` de cada aluno com e-mail, aplica no registro do
 * coach (foto nova → fotoUrl; feedbacks → a.feedbacks, sem duplicar; presenças
 * avisadas pelo app → a.presencas) e apaga a caixa. Silencioso: se a nuvem ou a
 * regra falhar, não quebra o app do coach.
 *
 * Quem chama (app.js) republica o Portal logo depois, então o que entra aqui
 * volta para o aluno na mesma rodada.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

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

/** Só 'YYYY-MM-DD' entra: a caixa é escrita pelo aparelho do aluno. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Junta as presenças que o Garage App avisou às que a ficha já tem.
 *
 * Mesma estrutura do check-in manual (`toggleCheckin`/`fazerCheckin` do app.js):
 * lista de 'YYYY-MM-DD' única e ordenada. A HORA não entra — o `presencaHoras` só
 * é preenchido quando o coach confirma a aula no próprio dia, e a hora em que o
 * aluno lançou as calorias não diz quando ele chegou ao box. Sem hora, o Portal
 * cai no horário fixo da grade dele, que é o comportamento certo.
 *
 * Devolve `null` quando nada mudou — um dia que o coach já tinha marcado não é
 * novidade e não deve disparar gravação nem redesenho.
 *
 * @param {any} atuais as presenças que já estão na ficha
 * @param {any} vindas o que veio na caixa de entrada
 * @returns {string[]|null}
 */
export function mesclarPresencas(atuais, vindas) {
  const novas = (Array.isArray(vindas) ? vindas : [])
    .filter((d) => typeof d === 'string' && DATA_ISO.test(d));
  if (!novas.length) return null;
  const set = new Set(Array.isArray(atuais) ? atuais : []);
  const antes = set.size;
  novas.forEach((d) => set.add(d));
  return set.size > antes ? [...set].sort() : null;
}

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

      // Presença que o Garage App avisou: o aluno lançou o treino daquele dia.
      //
      // O app NÃO pode escrever `portal/{email}` — a regra do Firestore libera a
      // escrita só para quem tem `gestao/{uid}`, e é assim de propósito: presença
      // é registro do coach. Então ele manda a data pela caixa e quem aplica na
      // ficha é aqui.
      //
      // Mesma estrutura do check-in manual (`toggleCheckin`/`fazerCheckin` do
      // app.js): lista de 'YYYY-MM-DD' única e ordenada. A HORA não entra — o
      // `presencaHoras` só é preenchido quando o coach confirma a aula no dia, e
      // a hora em que o aluno lançou as calorias não diz quando ele chegou. Sem
      // hora, o Portal cai no horário fixo da grade dele, que é o certo.
      const presencas = mesclarPresencas(a.presencas, inbox.presencas);
      if (presencas) patch.presencas = presencas;

      if (Object.keys(patch).length) { aplicar(a.id, patch); n++; }
      await _fns.deleteDoc(_fns.doc(_db, 'portalInbox', key)); // esvazia a caixa já processada
    }));
  } catch (e) {
    console.warn('Falha ao mesclar a caixa do Portal do Aluno:', e?.code || e);
  }
  return n;
}
