// @ts-check
/**
 * FEED DE PREÇOS da Garage Store — leitura e fusão.
 *
 * O preço tem dois donos possíveis e eles não podem brigar: o que o coach
 * digitou vive no catálogo dele e chega aqui dentro de `lojaPortal/atual`; o que
 * o robô leu do Mercado Livre vive em `lojaPrecos/atual`. Este módulo é onde os
 * dois se encontram, e a regra é simples: **feed vence, catálogo é o fallback**.
 * Se o robô escrevesse direto na vitrine, o próximo "Publicar" do coach desfaria
 * o trabalho dele — foi por isso que os documentos são separados.
 *
 * Usado tanto pela vitrine pública quanto pela prévia do coach — pela mesma razão
 * que `vitrine-card.js` é compartilhado: prévia que não roda o código real não é
 * prévia.
 */
import { firebaseConfig } from '../montador/cloud-config.js';
import { lojaCloudAtiva } from './loja-portal.js';

const V = '10.12.2';
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Aplica o feed sobre a lista de produtos.
 *
 * Produto com leitura falhada é REMOVIDO: melhor sumir da vitrine do que exibir
 * um preço que a gente sabe que não confere. Ele volta sozinho quando uma rodada
 * conseguir lê-lo de novo — não depende de o coach reativar nada.
 *
 * @param {any[]} produtos
 * @param {any} feed  o documento `lojaPrecos/atual`, ou null
 * @returns {any[]}
 */
export function fundirPrecos(produtos, feed) {
  const lista = Array.isArray(produtos) ? produtos : [];
  const itens = feed && typeof feed.itens === 'object' && !Array.isArray(feed.itens) ? feed.itens : null;
  if (!itens) return lista.slice();

  const saida = [];
  for (const p of lista) {
    const it = itens[p.id];
    if (!it) { saida.push(p); continue; }
    if (it.estado === 'falhou') continue;
    if (typeof it.preco !== 'number' || !Number.isFinite(it.preco)) { saida.push(p); continue; }
    saida.push({ ...p, preco: it.preco, verificadoEm: it.verificadoEm });
  }
  return saida;
}

/**
 * Idade do preço, em português de gente. String vazia quando não há carimbo —
 * quem chama decide o que mostrar no lugar.
 * @param {number|null|undefined} ms
 * @param {number} [agora]
 */
export function rotuloVerificado(ms, agora = Date.now()) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const hoje = new Date(agora);
  const dia = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (dia(d) === dia(hoje)) return 'verificado hoje';
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (dia(d) === dia(ontem)) return 'verificado ontem';
  return `verificado em ${d.getDate()}/${MES[d.getMonth()]}`;
}

/**
 * Estado da última rodada, para a faixa do Painel da Gestão.
 *
 * Quando falhas: o carimbo vem de `atualizadoEm` — a rodada gravou preços.
 * Quando trava: o backend deliberadamente NÃO escreve `atualizadoEm` (mexer
 * nele mentiria dizendo que os preços são de hoje quando nenhum foi conferido),
 * então o carimbo da trava vem de `travadaEm` (ver `functions/src/index.ts`).
 *
 * @param {any} feed
 * @param {any[]} produtos  para conseguir NOMEAR os produtos que falharam
 * @returns {{ tipo: 'nunca'|'ok'|'falhas'|'travou', texto: string }}
 */
export function estadoPrecos(feed, produtos) {
  if (!feed || !feed.rodada) {
    return { tipo: 'nunca', texto: 'Os preços ainda não foram verificados nenhuma vez.' };
  }
  const { total, lidos, falhas, travou } = feed.rodada;

  if (travou) {
    const quando = rotuloVerificado(feed.travadaEm).replace('verificado ', '') || 'agora';
    return {
      tipo: 'travou',
      texto: `A leitura falhou em ${falhas} de ${total} ${quando}. Nada foi alterado — ` +
        'os preços continuam os da última rodada boa. Provável mudança no site do Mercado Livre.',
    };
  }

  const quando = rotuloVerificado(feed.atualizadoEm).replace('verificado ', '') || 'agora';

  if (falhas > 0) {
    const nomes = Object.entries(feed.itens || {})
      .filter(([, it]) => it && it.estado === 'falhou')
      .map(([id]) => (produtos || []).find((p) => p.id === id)?.nome)
      .filter(Boolean);
    // `quando` já vem com "em" embutido para datas ("em 20/ago") — necessário
    // depois de "verificados" e de "falhou em N de M", mas duplicaria a
    // preposição depois de "desde" ("desde em 20/ago"). Tira o "em" só aqui.
    const desde = quando.replace(/^em /, '');
    return {
      tipo: 'falhas',
      texto: `${falhas} produto${falhas === 1 ? '' : 's'} fora da vitrine desde ${desde}` +
        (nomes.length ? `: ${nomes.join(', ')}` : '') + '.',
    };
  }

  return { tipo: 'ok', texto: `Preços verificados ${quando} · ${lidos} de ${total}` };
}

/* ============================================================
   Acesso à nuvem
   ============================================================ */
let _db = null, _fns = null;

async function init() {
  if (_db) return;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  _db = fsMod.getFirestore(app);
  _fns = { doc: fsMod.doc, getDoc: fsMod.getDoc };
}

/**
 * Lê `lojaPrecos/atual`. Devolve null em qualquer problema — a vitrine cai no catálogo.
 * @returns {Promise<any|null>}
 */
export async function carregarPrecos() {
  if (!lojaCloudAtiva()) return null;
  try {
    await init();
    const snap = await _fns.getDoc(_fns.doc(_db, 'lojaPrecos', 'atual'));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('Carregar preços:', e?.code || e);
    return null;
  }
}

/**
 * Manda a Cloud Function reler os preços agora. Só o coach logado consegue.
 *
 * A rodada em si pode levar até ~165 s (ver `PRAZO_RODADA_MS` em
 * `functions/src/index.ts`), bem acima do timeout padrão de 70 s do SDK web
 * para `httpsCallable`. Sem passar um timeout explícito o coach veria um erro
 * no navegador enquanto a função ainda está rodando com sucesso do lado do
 * servidor — e clicaria de novo, gerando concorrência. Por isso o terceiro
 * argumento abaixo.
 *
 * @returns {Promise<{
 *   total: number, lidos: number, falhas: number, travou: boolean, mudaram: number,
 *   veioDoCache: boolean,
 * }>}
 *   `veioDoCache` é `true` quando a chamada caiu no cooldown de 60 s entre
 *   rodadas manuais: nada foi buscado agora, o resumo é da última rodada gravada.
 */
export async function pedirAtualizacao() {
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fnMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  const fns = fnMod.getFunctions(app, 'southamerica-east1');
  const chamar = fnMod.httpsCallable(fns, 'atualizarPrecos', { timeout: 300000 });
  return (await chamar()).data;
}
