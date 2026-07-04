// @ts-check
/**
 * Guarda de acesso do Coach.
 *
 * Os apps do coach (coach/alunos/montador/academia) compartilham o MESMO login
 * Firebase com o Portal do Aluno. Sem guarda, uma conta de aluno passa no gate
 * do coach (embora as regras do Firestore já impeçam ler os dados do coach).
 * Aqui bloqueamos o acesso: "é coach" = possui dados de coach no Firestore
 * (gestao/{uid} ou coaches/{uid}), com uma lista de e-mails como reforço.
 * Assim nunca trancamos um coach ativo (ele sempre tem esses dados).
 */
import { firebaseConfig } from '../cloud-config.js';
import { sair } from './cloud.js';

/** E-mails sempre liberados como coach (reforço; o principal é possuir dados). */
export const COACH_EMAILS = ['braconaro@gmail.com'];

const V = '10.12.2';
let _db = null, _fns = null;
async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc };
}

/** É coach? Dono de gestao/{uid} ou coaches/{uid}, ou e-mail autorizado. @param {any} user */
export async function ehCoach(user) {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  if (COACH_EMAILS.includes(email)) return true;
  try {
    await init();
    const g = await _fns.getDoc(_fns.doc(_db, 'gestao', user.uid));
    if (g.exists()) return true;
    const c = await _fns.getDoc(_fns.doc(_db, 'coaches', user.uid));
    return c.exists();
  } catch {
    // erro de rede/regra: só libera e-mail conhecido (aluno fica bloqueado)
    return COACH_EMAILS.includes(email);
  }
}

/** Mostra "área restrita" no lugar do app, com atalho para o Portal do Aluno. */
export function bloquearNaoCoach() {
  const app = document.getElementById('app') || document.getElementById('hub');
  if (app) app.setAttribute('hidden', '');
  let gate = document.getElementById('gate');
  if (!gate) { gate = document.createElement('div'); gate.id = 'gate'; document.body.appendChild(gate); }
  gate.style.display = 'flex';
  gate.innerHTML = `
    <div class="gate-box" style="text-align:center;max-width:360px">
      <div class="brand"><b>BRACONARO</b> · Área restrita</div>
      <p style="color:var(--mut,#a1a1aa);margin:14px 0 18px;line-height:1.5">Esta área é exclusiva do coach. Sua conta é de <b>aluno</b> — seu espaço é o Portal do Aluno.</p>
      <a class="btn" href="../aluno/index.html" style="display:block">Ir para o Portal do Aluno</a>
      <a href="#" id="blk-sair" style="display:inline-block;margin-top:16px;color:var(--mut,#a1a1aa);font-size:.85rem">Sair desta conta</a>
    </div>`;
  document.getElementById('blk-sair')?.addEventListener('click', async (e) => { e.preventDefault(); try { await sair(); } catch {} location.reload(); });
}

/** Bloqueia (e mostra a tela) se o usuário logado não for coach. @returns {Promise<boolean>} true se bloqueou */
export async function bloquearSeNaoCoach(user) {
  if (!user) return false;
  if (await ehCoach(user)) return false;
  bloquearNaoCoach();
  return true;
}
