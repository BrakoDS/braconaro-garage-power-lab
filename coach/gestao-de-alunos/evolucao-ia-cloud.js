// @ts-check
/**
 * A chamada de `analisarEvolucaoFotos` (functions/src/index.ts): o avaliador de
 * evolução por fotos, só para a conta do coach. O pedido sai pronto de
 * `pedidoParaIA` (evolucao-fotos.js); aqui é só o transporte e a tradução dos
 * erros para a tela.
 */
import { firebaseConfig } from '../../compartilhado/firebase/config.js';

const V = '10.12.2';
const REGIAO = 'southamerica-east1';

/** A função espera até 100 s pela OpenAI; o navegador espera um pouco mais que ela. */
const TIMEOUT_MS = 130_000;

const ERROS = {
  'functions/permission-denied': 'Só a conta do coach usa o avaliador de evolução.',
  'functions/unauthenticated': 'Sua sessão expirou. Faça login de novo.',
  'functions/deadline-exceeded': 'A análise demorou demais. Tente de novo com menos fotos.',
  'functions/not-found': 'O avaliador ainda não foi publicado (função analisarEvolucaoFotos).',
  'functions/internal': 'O servidor não conseguiu analisar as fotos. Se o botão é novo, pode faltar publicar a função analisarEvolucaoFotos.',
};

let _chamar = null;
async function chamavel() {
  if (_chamar) return _chamar;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fnMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _chamar = fnMod.httpsCallable(fnMod.getFunctions(app, REGIAO), 'analisarEvolucaoFotos', { timeout: TIMEOUT_MS });
  return _chamar;
}

/**
 * Manda as fotos e devolve o relatório. Lança `Error` com a mensagem para a tela.
 * @param {any} pedido
 * @returns {Promise<{ relatorio: { qualidade: { nivel: string, avisos: string[] }, evolucao: string[], atencao: string[], feedback: string }, restantes: number, fotos: number }>}
 */
export async function analisarEvolucao(pedido) {
  const chamar = await chamavel();
  try {
    const r = await chamar(pedido);
    return /** @type {any} */ (r).data;
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    console.error('analisarEvolucaoFotos:', code, /** @type {any} */ (e)?.message);
    // invalid-argument, failed-precondition, resource-exhausted e unavailable trazem o texto da própria função.
    throw new Error(ERROS[/** @type {keyof typeof ERROS} */ (code)] || /** @type {any} */ (e)?.message || 'Não deu para analisar as fotos agora.');
  }
}
