// @ts-check
/**
 * Publicação do treino do dia para o Portal do Aluno.
 *
 * O treino é IGUAL para todos os alunos, então vira um doc COMPARTILHADO
 * `treinoPortal/{mesId}` (padrão dos murais avisosPortal/rankingPortal). Cada
 * treino salvo entra em `dias[dateId]` ('YYYY-MM-DD'); o aluno autenticado lê o
 * doc do mês atual e mostra o treino da data de hoje no seu nível. Reusa o app
 * Firebase já inicializado pelo cloud.js (login do coach).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../cloud-config.js';

const V = '10.12.2';
let _db = null, _fns = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, setDoc: fsMod.setDoc, updateDoc: fsMod.updateDoc, deleteField: fsMod.deleteField };
}

/** Enxuga um dia salvo para o que o Portal precisa (mantém o formato do dia). */
function diaEnxuto(d) {
  const base = { dia: d.dia, modalidade: d.modalidade };
  if (d.hyrox) return { ...base, hyrox: d.hyrox };
  if (d.hiit) return { ...base, hiit: d.hiit };
  if (d.gap) return { ...base, gap: d.gap };
  if (d.hibrido) return { ...base, hibrido: d.hibrido };
  return {
    ...base,
    exercicios: (d.exercicios || []).map((e) => ({
      nome: e.nome, padrao: e.padrao, reps: e.reps, descansoSeg: e.descansoSeg, niveis: e.niveis,
    })),
    finalizador: d.finalizador || null,
  };
}

/**
 * Publica UM treino numa data em `treinoPortal/{mesId}.dias[dateId]` (merge — não
 * mexe nos outros dias do mês). @param {string} dateId 'YYYY-MM-DD' @param {any} diaSnap
 */
export async function publicarTreino(dateId, diaSnap) {
  if (!CLOUD_ATIVO || !firebaseConfig?.apiKey || !dateId || !diaSnap) return;
  const mesId = dateId.slice(0, 7);
  try {
    await init();
    await _fns.setDoc(_fns.doc(_db, 'treinoPortal', mesId), {
      mesId, dias: { [dateId]: diaEnxuto(diaSnap) }, atualizadoEm: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.warn('Publicar treino no portal:', e?.code || e);
  }
}

/**
 * Remove um treino de uma data em `treinoPortal/{mesId}` (apaga só aquele dia).
 * @param {string} dateId 'YYYY-MM-DD'
 */
export async function removerTreinoPortal(dateId) {
  if (!CLOUD_ATIVO || !firebaseConfig?.apiKey || !dateId) return;
  const mesId = dateId.slice(0, 7);
  try {
    await init();
    await _fns.updateDoc(_fns.doc(_db, 'treinoPortal', mesId), {
      [`dias.${dateId}`]: _fns.deleteField(), atualizadoEm: Date.now(),
    });
  } catch (e) {
    console.warn('Remover treino no portal:', e?.code || e);
  }
}
