// @ts-check
/**
 * AS EXCEÇÕES DO ALUNO — `treinoAluno/{email}`, o mesmo documento que o coach
 * grava no montador quando ajusta o dia de alguém ("hoje você faz 2 séries de
 * agachamento").
 *
 * Só o que fugiu da regra mora lá. A versão comum do aluno é calculada aqui no
 * aparelho dele, a partir do treino publicado e do perfil que já está em
 * `portal/{email}` — é isso que evita 8 versões gravadas por dia.
 *
 * Mesmo padrão de `cargas-db.js`: leitura sob demanda, cache na sessão, e falha
 * de rede devolve vazio em vez de derrubar a tela do treino.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../compartilhado/firebase/config.js';

const V = '10.12.2';
let _db = null, _fns = null;
/** @type {Record<string, any>|null} */
let _cache = null;

const emailKey = (/** @type {string} */ e) => String(e || '').trim().toLowerCase();

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc };
}

/**
 * Todas as exceções do aluno, por data. Uma leitura por sessão: o aluno navega
 * pelo cronograma, e cada toque numa data não pode virar uma ida ao banco.
 * @param {string} email
 * @returns {Promise<Record<string, any>>}
 */
export async function carregarAjustes(email) {
  if (_cache) return _cache;
  if (!CLOUD_ATIVO || !firebaseConfig?.apiKey || !email) return {};
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'treinoAluno', emailKey(email)));
    _cache = (snap.exists() && snap.data()?.ajustes) || {};
    return _cache;
  } catch (e) {
    // Aluno sem documento, sem permissão ou sem rede: o treino do dia continua
    // aparecendo, com o número da turma. Melhor que uma tela vazia.
    console.warn('Ajustes do treino:', e?.code || e);
    return {};
  }
}

/** Esquece o cache (troca de sessão). */
export function limparCache() { _cache = null; }
