// @ts-check
/**
 * Caixa de entrada do aluno → coach (lado aluno).
 *
 * O aluno só pode ESCREVER na própria fatia (portal/{email}) via coach, então
 * o que ele envia (foto nova, feedback pós-treino) vai para `portalInbox/{email}`,
 * uma caixa que o app do coach lê e mescla em gestao/{uid} (e depois limpa).
 * A regra do Firestore permite ao aluno ler/gravar só o doc do próprio e-mail.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';
import { comprimir, enviar } from '../alunos/storage-alunos.js';

const V = '10.12.2';
let _db = null, _fns = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, setDoc: fsMod.setDoc, arrayUnion: fsMod.arrayUnion };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/**
 * Comprime + envia a foto de perfil ao Storage e registra a URL na caixa.
 * Retorna a URL de download (para atualizar a UI na hora).
 * @param {string} email @param {File} file
 */
export async function enviarFotoPerfil(email, file) {
  const key = emailKey(email);
  const blob = await comprimir(file, 640, 0.85);
  const url = await enviar(`portal/${key}/avatar.webp`, blob);
  await init();
  await _fns.setDoc(_fns.doc(_db, 'portalInbox', key), { fotoNova: url, atualizadoEm: Date.now() }, { merge: true });
  return url;
}

/**
 * Anexa um feedback pós-treino à caixa (arrayUnion não duplica).
 * @param {string} email @param {{id:string,data:string,esforco:number,dor:string,obs:string,criadoEm:number}} fb
 */
export async function enviarFeedback(email, fb) {
  const key = emailKey(email);
  await init();
  await _fns.setDoc(_fns.doc(_db, 'portalInbox', key), { feedbacks: _fns.arrayUnion(fb), atualizadoEm: Date.now() }, { merge: true });
}
