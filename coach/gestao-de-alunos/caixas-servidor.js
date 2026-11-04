// @ts-check
/**
 * Quem aplica as caixas — a Gestão aberta ou o servidor (Fase 1 · etapa 1).
 *
 * As caixas (o Pix aprovado em `cobrancasPix`, os check-ins da uGym e da
 * Lousa, o "Não irei" e a reposição marcada pelo aluno) eram aplicadas na ficha
 * SÓ pela Gestão aberta. Agora o servidor também sabe aplicar
 * (functions/src/caixas-servico.ts, com os mesmos arquivos de regra daqui), e
 * um interruptor diz quem aplica:
 *
 *   gestao/{uid}/sistema/caixas = { aplicador: 'gestao' | 'servidor' }
 *
 *   'gestao' (ou sem o documento): a Gestão aplica, como sempre — e o servidor não;
 *   'servidor': o servidor aplica — e a Gestão para (ouve o interruptor ao vivo).
 *
 * Voltar para 'gestao' é o "desfazer" da etapa, sem deploy.
 *
 * O recibo: quando é o servidor que dá a baixa do Pix, o 'acao-registrada' não
 * nasce aqui. A Gestão lê os pagamentos que o servidor registrou nos eventos e
 * repete a ação — a Fila de mensagens sugere o recibo com a mesma chave
 * anti-spam de sempre (um por aluno por mês).
 */
import { CLOUD_ATIVO, firebaseConfig } from '../../compartilhado/firebase/config.js';

/** @typedef {'gestao' | 'servidor'} Aplicador */

/** O aplicador do documento do interruptor (qualquer coisa estranha = 'gestao'). @param {any} dados @returns {Aplicador} */
export function aplicadorDe(dados) {
  return dados && dados.aplicador === 'servidor' ? 'servidor' : 'gestao';
}

/** Por quanto tempo um pagamento do servidor ainda vira sugestão de recibo (o mesmo PRAZO_PENDENTE da Fila). */
export const JANELA_RECIBO_MS = 7 * 86400000;

/**
 * Os eventos de pagamento do servidor que viram ação (para o recibo), dos que
 * ainda não foram repetidos nesta sessão.
 * @param {any[]} eventos os documentos de `eventos` @param {Set<string>} jaVistos @param {number} agora
 * @returns {any[]}
 */
export function pagamentosDoServidor(eventos, jaVistos, agora) {
  return (eventos || []).filter((e) => e && e.origem === 'servidor' && e.tipo === 'pagamento'
    && e.dados && typeof e.dados.mesId === 'string' && Number(e.dados.valor) > 0
    && Number(e.em) >= agora - JANELA_RECIBO_MS && !jaVistos.has(e.id));
}

const V = '10.12.2';
/** @type {any} */ let F = null;
/** @type {any} */ let _db = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = F.getFirestore(app);
}

const nuvem = () => !!(CLOUD_ATIVO && firebaseConfig && firebaseConfig.apiKey);

/**
 * Ouve o interruptor. Chama `aoMudar` já com o valor atual e a cada troca.
 * Sem nuvem, ou se a leitura falhar, fica 'gestao' (o comportamento de sempre).
 * @param {string} uid @param {(a: Aplicador) => void} aoMudar
 */
export async function ouvirAplicador(uid, aoMudar) {
  if (!nuvem() || !uid) { aoMudar('gestao'); return () => {}; }
  try {
    await init();
    return F.onSnapshot(
      F.doc(_db, 'gestao', uid, 'sistema', 'caixas'),
      (/** @type {any} */ s) => aoMudar(aplicadorDe(s.exists() ? s.data() : null)),
      (/** @type {any} */ e) => { console.warn('[caixas] não deu para ler o interruptor — a Gestão aplica.', e?.code || e); aoMudar('gestao'); },
    );
  } catch (e) {
    console.warn('[caixas] interruptor indisponível — a Gestão aplica.', e);
    aoMudar('gestao');
    return () => {};
  }
}

/**
 * Ouve os eventos recentes e entrega os pagamentos que o servidor registrou
 * (cada um uma vez por sessão).
 * @param {string} uid @param {(evs: any[]) => void} aoChegar
 */
export async function ouvirPagamentosDoServidor(uid, aoChegar) {
  if (!nuvem() || !uid) return () => {};
  const vistos = new Set();
  try {
    await init();
    const desde = Date.now() - JANELA_RECIBO_MS;
    const q = F.query(F.collection(_db, 'gestao', uid, 'eventos'), F.where('em', '>=', desde));
    return F.onSnapshot(q, (/** @type {any} */ s) => {
      const novos = pagamentosDoServidor(s.docs.map((/** @type {any} */ d) => ({ ...d.data(), id: d.id })), vistos, Date.now());
      for (const e of novos) vistos.add(e.id);
      if (novos.length) aoChegar(novos);
    }, (/** @type {any} */ e) => console.warn('[caixas] não deu para ouvir os pagamentos do servidor.', e?.code || e));
  } catch (e) {
    console.warn('[caixas] pagamentos do servidor indisponíveis.', e);
    return () => {};
  }
}
