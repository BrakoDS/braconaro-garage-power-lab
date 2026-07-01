// @ts-check
/**
 * Publicação do Portal do Aluno (lado coach).
 *
 * Para cada aluno que tenha e-mail, grava uma "fatia" só dele em
 * `portal/{email}` (Firestore) — que o próprio aluno lê no app /aluno.
 * A fonte da verdade continua sendo `gestao/{uid}`; isto é só a projeção
 * de leitura para o aluno. Reaproveita o app Firebase já inicializado.
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
  _fns = { doc: fsMod.doc, setDoc: fsMod.setDoc };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** A fatia publicada de um aluno (o que o portal precisa mostrar). */
function fatia(a) {
  return {
    id: a.id, nome: a.nome || '', email: emailKey(a.email), fotoUrl: a.fotoUrl || '',
    status: a.status || 'ativo', objetivo: a.objetivo || '', nivel: a.nivel || '',
    sexo: a.sexo || '', nascimento: a.nascimento || '', altura: a.altura || '',
    mensalidade: a.mensalidade || '', vencimento: a.vencimento || '', pagamentos: a.pagamentos || {},
    presencas: a.presencas || [],
    avaliacoes: a.avaliacoes || [],
    atualizadoEm: Date.now(),
  };
}

/**
 * Publica/atualiza `portal/{email}` de todos os alunos que têm e-mail.
 * Silencioso: se a nuvem/regra falhar, não quebra o app do coach.
 * @param {any[]} alunos
 */
export async function publicarPortal(alunos) {
  if (!cloudAtivo()) return;
  try {
    await init();
    const comEmail = (alunos || []).filter((a) => emailKey(a.email));
    await Promise.all(comEmail.map((a) =>
      _fns.setDoc(_fns.doc(_db, 'portal', emailKey(a.email)), JSON.parse(JSON.stringify(fatia(a))))
    ));
  } catch (e) {
    console.warn('Falha ao publicar o Portal do Aluno:', e?.code || e);
  }
}
