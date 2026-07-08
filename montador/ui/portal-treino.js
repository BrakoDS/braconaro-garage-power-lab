// @ts-check
/**
 * Publicação do programa da semana para o Portal do Aluno.
 *
 * O programa é IGUAL para todos os alunos, então vira um doc COMPARTILHADO
 * `treinoPortal/{mesId}` (padrão dos murais avisosPortal/rankingPortal). O aluno
 * autenticado lê o doc do mês atual e mostra o treino de hoje no seu nível.
 * Reusa o app Firebase já inicializado pelo cloud.js (login do coach).
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
  _fns = { doc: fsMod.doc, setDoc: fsMod.setDoc };
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
 * Publica os programas de um mês em `treinoPortal/{mesId}`.
 * @param {string} mesId @param {Array<any>} programasDoMes  (de store.listarProgramasDoMes)
 */
export async function publicarTreinoDoMes(mesId, programasDoMes) {
  if (!CLOUD_ATIVO || !firebaseConfig?.apiKey || !mesId || !programasDoMes?.length) return;
  try {
    await init();
    const semanas = {};
    for (const p of programasDoMes) {
      semanas[p.semana] = { grade: p.grade || {}, dias: (p.dias || []).map(diaEnxuto) };
    }
    await _fns.setDoc(_fns.doc(_db, 'treinoPortal', mesId), {
      mesId, semanas, atualizadoEm: Date.now(),
    });
  } catch (e) {
    console.warn('Publicar treino no portal:', e?.code || e);
  }
}
