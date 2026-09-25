// @ts-check
/**
 * Chat Coach ↔ Aluno no Firestore (lado coach) — ver `chat.js` para o formato.
 *
 *   chats/{email}                  o resumo da conversa — a lista da Central sai daqui
 *   chats/{email}/mensagens/{id}   as mensagens
 *
 * A regra (`firestore.rules`, bloco `chats`) deixa o coach ler todas as
 * conversas e escrever só como 'coach'; ninguém edita nem apaga mensagem.
 *
 * A resposta e o resumo vão num lote só, como no app: ou os dois chegam, ou
 * nenhum — a lista nunca aponta para uma mensagem que não existe.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import {
  LIMITE_CONVERSAS,
  LIMITE_HISTORICO,
  emailKey,
  normalizarConversa,
  normalizarMensagem,
  novaMensagem,
  ordenarConversas,
  ordenarMensagens,
  resumoDoChat,
} from './chat.js';

const V = '10.12.2';
/** @type {any} */ let _db = null;
/** @type {any} */ let _fs = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  _fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = _fs.getFirestore(app);
}

/**
 * Escuta a lista de conversas, da mais recente para a mais antiga. Devolve a
 * função que para de escutar.
 * @param {(conversas: import('./chat.js').Conversa[]) => void} aoMudar
 * @param {(e: any) => void} aoErrar
 * @returns {Promise<() => void>}
 */
export async function ouvirConversas(aoMudar, aoErrar) {
  await init();
  const q = _fs.query(
    _fs.collection(_db, 'chats'),
    _fs.orderBy('atualizadoEm', 'desc'),
    _fs.limit(LIMITE_CONVERSAS),
  );
  return _fs.onSnapshot(q, (/** @type {any} */ snap) => {
    const lista = [];
    for (const d of snap.docs) {
      const c = normalizarConversa(d.id, d.data());
      if (c) lista.push(c);
    }
    aoMudar(ordenarConversas(lista));
  }, aoErrar);
}

/**
 * Escuta as últimas mensagens de um aluno, em ordem cronológica. Com os
 * metadados, a resposta ainda a caminho chega marcada `pendente`, e chega de
 * novo quando o servidor confirma.
 * @param {string} email
 * @param {(mensagens: import('./chat.js').Mensagem[]) => void} aoMudar
 * @param {(e: any) => void} aoErrar
 * @returns {Promise<() => void>}
 */
export async function ouvirMensagens(email, aoMudar, aoErrar) {
  await init();
  const q = _fs.query(
    _fs.collection(_db, 'chats', emailKey(email), 'mensagens'),
    _fs.orderBy('timestamp'),
    _fs.limitToLast(LIMITE_HISTORICO),
  );
  return _fs.onSnapshot(q, { includeMetadataChanges: true }, (/** @type {any} */ snap) => {
    const lista = [];
    for (const d of snap.docs) {
      const m = normalizarMensagem(d.id, d.data());
      if (m) lista.push(d.metadata.hasPendingWrites ? { ...m, pendente: true } : m);
    }
    aoMudar(ordenarMensagens(lista));
  }, aoErrar);
}

/**
 * Manda a resposta do coach e atualiza o resumo da conversa. Lança se o texto
 * é vazio ou se a regra recusou.
 * @param {string} email @param {string} texto
 */
export async function enviarResposta(email, texto) {
  const id = emailKey(email);
  const nova = novaMensagem(texto, 'coach');
  if (!id || !nova) throw new Error('mensagem-vazia');
  await init();
  const lote = _fs.writeBatch(_db);
  lote.set(_fs.doc(_fs.collection(_db, 'chats', id, 'mensagens')), nova);
  lote.set(_fs.doc(_db, 'chats', id), resumoDoChat(id, nova), { merge: true });
  await lote.commit();
}
