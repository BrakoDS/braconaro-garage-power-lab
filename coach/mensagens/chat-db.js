// @ts-check
/**
 * Chat Coach ↔ Aluno no Firestore (lado coach) — ver `chat.js` para o formato.
 *
 *   chats/{email}                  o resumo da conversa — a lista da Central sai daqui
 *   chats/{email}/mensagens/{id}   as mensagens
 *
 * A regra (`firestore.rules`, bloco `chats`) deixa o coach ler todas as
 * conversas e escrever só como 'coach'. Por update, o coach edita a resposta
 * dele e marca 'entregue' / 'lido' na do aluno; apagar tira o documento.
 *
 * A resposta e o resumo vão num lote só, como no app: ou os dois chegam, ou
 * nenhum — a lista nunca aponta para uma mensagem que não existe.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import {
  LIMITE_CONVERSAS,
  LIMITE_HISTORICO,
  edicaoDaMensagem,
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

/**
 * Remetente e hora da mensagem alterada, quando ela é a última da conversa: o
 * resumo que a lista mostra tem o texto dela e precisa acompanhar a troca.
 * @typedef {Pick<import('./chat.js').NovaMensagem, 'remetente'|'timestamp'>} UltimaDaConversa
 */

/**
 * Troca o texto de uma resposta do coach e marca `editado`. Lança se o texto é
 * vazio ou se a regra recusou.
 * @param {string} email @param {string} idMensagem @param {string} texto @param {UltimaDaConversa} [ultima]
 */
export async function editarMensagem(email, idMensagem, texto, ultima) {
  const id = emailKey(email);
  const edicao = edicaoDaMensagem(texto);
  if (!id || !idMensagem || !edicao) throw new Error('mensagem-vazia');
  await init();
  const lote = _fs.writeBatch(_db);
  lote.update(_fs.doc(_db, 'chats', id, 'mensagens', idMensagem), { ...edicao });
  if (ultima) lote.set(_fs.doc(_db, 'chats', id), resumoDoChat(id, { ...ultima, texto: edicao.texto }), { merge: true });
  await lote.commit();
}

/**
 * Apaga uma resposta do coach para os dois lados: o documento sai do
 * Firestore. `resumo` é o que `resumoAposApagar` devolveu — se ela era a
 * última, o resumo passa para a anterior (ou sai, se a conversa ficou vazia)
 * no mesmo lote, para a lista nunca mostrar o texto de uma mensagem apagada.
 * @param {string} email @param {string} idMensagem
 * @param {import('./chat.js').NovaMensagem|null} [resumo]
 */
export async function apagarMensagem(email, idMensagem, resumo) {
  const id = emailKey(email);
  if (!id || !idMensagem) throw new Error('mensagem-invalida');
  await init();
  const mensagem = _fs.doc(_db, 'chats', id, 'mensagens', idMensagem);
  if (resumo === undefined) { await _fs.deleteDoc(mensagem); return; }
  const lote = _fs.writeBatch(_db);
  lote.delete(mensagem);
  if (resumo) lote.set(_fs.doc(_db, 'chats', id), resumoDoChat(id, resumo));
  else lote.delete(_fs.doc(_db, 'chats', id));
  await lote.commit();
}

/**
 * Marca as mensagens do aluno como 'entregue' ou 'lido' — os ticks do lado dele.
 * @param {string} email @param {string[]} ids @param {'entregue'|'lido'} status
 */
export async function marcarStatus(email, ids, status) {
  const id = emailKey(email);
  if (!id || !ids.length) return;
  await init();
  // Um lote aguenta 500 escritas; a conversa escuta no máximo LIMITE_HISTORICO (200).
  const lote = _fs.writeBatch(_db);
  for (const idMensagem of ids) lote.update(_fs.doc(_db, 'chats', id, 'mensagens', idMensagem), { status });
  await lote.commit();
}
