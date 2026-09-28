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
 *
 * Mídia (Etapa 17.3): o arquivo sobe ao Storage primeiro, com progresso, em
 * `chats/{email}/{timestamp}_{tipo}.{ext}` (nome único: a regra do Storage não
 * tem `update`), e só então nasce a mensagem. Apagar a mensagem apaga o
 * arquivo também — como faxina, sem travar se o Storage recusar.
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';
import {
  LIMITE_CONVERSAS,
  LIMITE_HISTORICO,
  MidiaRecusada,
  UPLOAD_PARADO,
  caminhoDaCapa,
  caminhoDaMidia,
  edicaoDaMensagem,
  emailKey,
  formatoDoArquivo,
  normalizarConversa,
  normalizarMensagem,
  novaMensagem,
  novaMensagemDeMidia,
  ordenarConversas,
  ordenarMensagens,
  porcentagem,
  resumoDoChat,
  uploadParado,
  validarMidia,
} from './chat.js';

const V = '10.12.2';
/** @type {any} */ let _app = null;
/** @type {any} */ let _db = null;
/** @type {any} */ let _fs = null;
/** @type {any} */ let _st = null;
/** @type {any} */ let _stMod = null;

export function cloudAtivo() {
  return !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);
}

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  _fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  _app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = _fs.getFirestore(_app);
}

/** O Storage só carrega quando a primeira mídia sobe (ou é apagada). */
async function initStorage() {
  await init();
  if (_st) return;
  _stMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-storage.js`);
  _st = _stMod.getStorage(_app);
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
 * `arquivos` são os endereços da mídia dela (arquivo e capa): saem do Storage
 * depois que a mensagem saiu.
 * @param {string} email @param {string} idMensagem
 * @param {import('./chat.js').NovaMensagem|null} [resumo] @param {string[]} [arquivos]
 */
export async function apagarMensagem(email, idMensagem, resumo, arquivos = []) {
  const id = emailKey(email);
  if (!id || !idMensagem) throw new Error('mensagem-invalida');
  await init();
  const mensagem = _fs.doc(_db, 'chats', id, 'mensagens', idMensagem);
  if (resumo === undefined) {
    await _fs.deleteDoc(mensagem);
  } else {
    const lote = _fs.writeBatch(_db);
    lote.delete(mensagem);
    if (resumo) lote.set(_fs.doc(_db, 'chats', id), resumoDoChat(id, resumo));
    else lote.delete(_fs.doc(_db, 'chats', id));
    await lote.commit();
  }
  await apagarArquivos(arquivos);
}

/**
 * Faxina no Storage: apaga cada arquivo (por URL ou caminho) sem travar quem
 * chamou — o que falhar fica registrado no console e pronto.
 * @param {string[]} arquivos
 */
async function apagarArquivos(arquivos) {
  if (!arquivos.length) return;
  try {
    await initStorage();
  } catch (e) {
    console.warn('Chat: Storage indisponível — os arquivos ficaram.', e);
    return;
  }
  await Promise.all(arquivos.map(async (a) => {
    try {
      await _stMod.deleteObject(_stMod.ref(_st, a));
    } catch (e) {
      if (/** @type {any} */ (e)?.code !== 'storage/object-not-found') {
        console.warn('Chat: o arquivo da mensagem ficou no Storage.', /** @type {any} */ (e)?.code || e);
      }
    }
  }));
}

/**
 * Sobe um blob ao Storage e devolve o download URL. O `aoProgredir` recebe
 * 0–100. O SDK sozinho insistiria por até 10 min sem rede; o vigia cancela
 * antes, quando nenhum byte anda por `UPLOAD_PARADO_MS`.
 * @param {string} caminho @param {Blob} blob @param {string} contentType
 * @param {(pct: number) => void} [aoProgredir] @returns {Promise<string>}
 */
async function subirArquivo(caminho, blob, contentType, aoProgredir) {
  await initStorage();
  const destino = _stMod.ref(_st, caminho);
  const tarefa = _stMod.uploadBytesResumable(destino, blob, { contentType });
  let parou = false;
  let ultimoAvanco = Date.now();
  const vigia = setInterval(() => {
    if (uploadParado(ultimoAvanco, Date.now())) {
      parou = true;
      tarefa.cancel();
    }
  }, 5_000);
  try {
    await new Promise((resolver, rejeitar) => {
      tarefa.on(
        'state_changed',
        (/** @type {any} */ s) => {
          ultimoAvanco = Date.now();
          aoProgredir?.(porcentagem(s.bytesTransferred, s.totalBytes));
        },
        (/** @type {any} */ e) => rejeitar(parou ? new Error(UPLOAD_PARADO) : e),
        () => resolver(undefined),
      );
    });
  } finally {
    clearInterval(vigia);
  }
  return _stMod.getDownloadURL(destino);
}

/**
 * Manda foto, vídeo ou voz do coach: sobe o arquivo (e a capa do vídeo) com
 * progresso e, só depois, grava a mensagem e o resumo num lote. Lança
 * `MidiaRecusada` se o arquivo passa dos tetos, `upload-parado` se a rede cair
 * no upload, ou o erro da regra. Se a regra recusar a mensagem, o arquivo que
 * subiu é apagado — não fica órfão no Storage.
 * @param {string} email @param {import('./midia-web.js').MidiaPronta} midia
 * @param {(pct: number) => void} [aoProgredir]
 */
export async function enviarMidia(email, midia, aoProgredir) {
  const id = emailKey(email);
  if (!id) throw new Error('conversa-invalida');
  const motivo = validarMidia(midia.tipo, { bytes: midia.blob.size, duracao: midia.duracao });
  if (motivo) throw new MidiaRecusada(motivo);

  const agora = Date.now();
  const { ext, contentType } = formatoDoArquivo(midia.tipo, midia.mimeType, midia.nome);
  const caminho = caminhoDaMidia(id, agora, midia.tipo, ext);
  const mediaUrl = await subirArquivo(caminho, midia.blob, contentType, aoProgredir);

  // A capa é enfeite: se não subir, o vídeo vai sem ela.
  /** @type {string|undefined} */
  let thumbUrl;
  if (midia.tipo === 'video' && midia.capa) {
    thumbUrl = await subirArquivo(caminhoDaCapa(id, agora), midia.capa, 'image/jpeg').catch((e) => {
      console.warn('Chat: a capa do vídeo não subiu.', e?.code || e);
      return undefined;
    });
  }

  const nova = novaMensagemDeMidia(midia.tipo, mediaUrl, 'coach', { duracao: midia.duracao, thumbUrl }, agora);
  if (!nova) throw new Error('midia-sem-endereco');
  await init();
  const lote = _fs.writeBatch(_db);
  lote.set(_fs.doc(_fs.collection(_db, 'chats', id, 'mensagens')), nova);
  lote.set(_fs.doc(_db, 'chats', id), resumoDoChat(id, nova), { merge: true });
  try {
    await lote.commit();
  } catch (e) {
    await apagarArquivos([caminho, ...(thumbUrl ? [caminhoDaCapa(id, agora)] : [])]);
    throw e;
  }
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
