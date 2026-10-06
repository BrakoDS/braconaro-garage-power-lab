// @ts-check
/**
 * As semanas em que o box FECHOU — a Semana do Box publicada com os 6 dias sem
 * aula (feriado, recesso, evento). Elas PAUSAM a sequência (`streakSemanas` em
 * `compartilhado/regras/gamificacao.js`): sem treino, não quebram.
 *
 * O servidor grava `emBranco: true` na semana (`semanaEmBrancoNosDias`), então
 * aqui é uma consulta pequena — `status == 'publicado' && emBranco == true` —,
 * que a regra do Firestore libera para qualquer aluno logado e para o coach.
 * Mesma leitura do app e do Portal web. Silencioso em falha: sem a lista, a
 * regra de sempre.
 */
import { firebaseConfig } from './config.js';

const V = '10.12.2';

/**
 * O coach dono da Semana do Box (`coaches/{uid}/semanas`). O mesmo UID da lista
 * de `ehCoach()` nas regras — `regras.test.js` confere.
 */
export const COACH_UID_BOX = 'G6gfpahorCfptVxOM26sCjxMOqb2';

/** 2026-W45 → '2026-11-02' (a segunda-feira, ISO 8601). */
export function segundaDaSemanaIso(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(id));
  if (!m) return '';
  const ano = Number(m[1]);
  const quatro = new Date(Date.UTC(ano, 0, 4));
  const seg1 = new Date(quatro.getTime() - ((quatro.getUTCDay() + 6) % 7) * 864e5);
  return new Date(seg1.getTime() + (Number(m[2]) - 1) * 7 * 864e5).toISOString().slice(0, 10);
}

/** @type {Promise<string[]> | null} */
let _lido = null;

/** As segundas-feiras ('AAAA-MM-DD') das semanas em branco publicadas. Lê uma vez por página. */
export function carregarSemanasPausadas() {
  if (_lido) return _lido;
  _lido = (async () => {
    try {
      const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
      const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
      const q = fs.query(fs.collection(fs.getFirestore(app), 'coaches', COACH_UID_BOX, 'semanas'),
        fs.where('status', '==', 'publicado'), fs.where('emBranco', '==', true));
      const snap = await fs.getDocs(q);
      return snap.docs.map((d) => segundaDaSemanaIso(d.id)).filter(Boolean);
    } catch (e) {
      console.warn('Semanas em branco indisponíveis: a sequência segue sem pausa.', e?.code || e);
      return [];
    }
  })();
  return _lido;
}
