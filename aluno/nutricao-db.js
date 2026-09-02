// @ts-check
/**
 * Nutrição Básica — persistência do gasto calórico de treino (lado aluno).
 *
 * Cada aluno tem um documento próprio em `gastoTreinos/{email}` com o nível de
 * atividade escolhido e a lista de lançamentos ({ id, data, calorias }). A
 * regra do Firestore permite ao aluno ler/gravar só o doc do próprio e-mail.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../montador/cloud-config.js';
import { FATOR_PADRAO, modoDoDoc } from './atividade.js';

const V = '10.12.2';
let _db = null, _fns = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc };
}

const emailKey = (e) => String(e || '').trim().toLowerCase();

/** Carrega { nivelAtividade, nivelModo, gastos:[], creatina:{checks:[]} } do aluno (defaults se ainda não existe). @param {string} email */
export async function carregarNutricao(email) {
  await init();
  const snap = await _fns.getDoc(_fns.doc(_db, 'gastoTreinos', emailKey(email)));
  const d = snap.exists() ? snap.data() : {};
  const checks = d.creatina && Array.isArray(d.creatina.checks) ? d.creatina.checks : [];
  return {
    nivelAtividade: d.nivelAtividade || FATOR_PADRAO,
    // 'auto' = o nível sai da presença; 'manual' = o aluno escolheu na mão.
    // Quem já usava a tela não tem esse campo — `modoDoDoc` decide olhando o
    // valor salvo, e o documento cru é o único lugar onde isso é possível.
    nivelModo: modoDoDoc(d),
    gastos: Array.isArray(d.gastos) ? d.gastos : [],
    creatina: { checks },
  };
}

/**
 * Grava nível + lançamentos + creatina.
 *
 * Com `merge` porque este documento não é mais só desta tela: o app do celular
 * (Garage App) grava a hidratação do dia no mesmo `gastoTreinos/{email}`. Sem o
 * merge, salvar aqui apagaria a água do aluno sem nenhum aviso.
 *
 * O `nivelAtividade` gravado é SEMPRE o fator numérico já resolvido, mesmo no
 * modo automático. O modo fica num campo à parte porque este documento é lido
 * por fora (painel do coach, Garage App): quem só quer o número continua
 * achando um número, e ainda por cima o certo.
 *
 * @param {string} email
 * @param {{nivelAtividade:string, nivelModo?:string, gastos:any[], creatina?:{checks:string[]}}} dados
 */
export async function salvarNutricao(email, dados) {
  await init();
  await _fns.setDoc(_fns.doc(_db, 'gastoTreinos', emailKey(email)), {
    nivelAtividade: dados.nivelAtividade || FATOR_PADRAO,
    nivelModo: dados.nivelModo === 'manual' ? 'manual' : 'auto',
    gastos: JSON.parse(JSON.stringify(dados.gastos || [])),
    creatina: { checks: Array.isArray(dados.creatina?.checks) ? dados.creatina.checks.slice() : [] },
    atualizadoEm: Date.now(),
  }, { merge: true });
}
