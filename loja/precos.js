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
 * O item só vale para o link de onde veio. A chave do feed é o `id`, e o `id` é
 * o slug do nome de quando o produto foi criado: ele SOBREVIVE à edição da ficha
 * (`academia/db.js` preserva o id ao atualizar). Reapontar um produto existente
 * para outra URL mantém o mesmo `id` — e sem conferir a URL o aluno veria o
 * produto novo com o preço do antigo, ainda por cima com a legenda "verificado
 * hoje" fazendo o número errado parecer mais confiável que o preço digitado.
 * Divergiu a URL, o item é ignorado e vale o catálogo, que é o certo: o robô
 * nunca leu aquele link.
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
    if (!ehDoMesmoLink(it, p)) { saida.push(p); continue; }
    if (it.estado === 'falhou') continue;
    if (typeof it.preco !== 'number' || !Number.isFinite(it.preco)) { saida.push(p); continue; }
    saida.push({ ...p, preco: it.preco, verificadoEm: it.verificadoEm });
  }
  return saida;
}

/**
 * O item do feed fala do link que este produto tem hoje?
 *
 * Item SEM `url` é aceito — é o feed gravado antes de o campo existir. Recusá-lo
 * tiraria da vitrine, de uma vez e no deploy, todo preço lido até agora: os
 * itens `ok` cairiam no preço do catálogo e os `falhou` voltariam a aparecer. O
 * risco de manter é o cenário raro (coach reapontou a URL de uma ficha existente
 * desde a última rodada) e dura até a primeira rodada bem-sucedida seguinte, que
 * regrava o feed com `url` — não necessariamente às 05:00: uma rodada que TRAVA
 * não regrava os itens, e clicar em "Atualizar preços" logo após o deploy fecha
 * a janela na hora, sem esperar a madrugada. O risco de recusar é certo e vale
 * para os 22 produtos. Por isso a tolerância só existe para o item antigo: item
 * novo sempre tem `url` e é sempre conferido. De quebra, é essa tolerância que
 * desacopla os dois deploys: o front (`loja/precos.js`) pode ir ao ar antes ou
 * depois das functions, em qualquer ordem — o que não seria verdade se o item
 * sem `url` fosse recusado, porque aí o deploy do front na frente do das
 * functions já esvaziaria a vitrine sozinho.
 *
 * @param {any} item
 * @param {any} produto
 */
function ehDoMesmoLink(item, produto) {
  if (typeof item.url !== 'string' || !item.url) return true;
  // Comparação literal: o robô lê exatamente a string que está em
  // `lojaPortal/atual`, a mesma que chega aqui. Normalizar mais (caixa, query,
  // barra final) só criaria chance de dois links diferentes casarem.
  return item.url.trim() === String(produto.url || '').trim();
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
 * Os seis motivos de falha, agrupados pelo que o COACH faz a respeito.
 *
 * Ele não precisa saber a diferença entre `sem-og` e `sem-card` — precisa saber
 * se confere o link, se troca o produto, se espera, ou se chama alguém. Por
 * isso os três motivos de página quebrada (`sem-og`, `sem-card`,
 * `titulo-nao-bate`) viram uma frase só: a decisão é a mesma nos três. Já
 * `sem-preco` fica separado: a página foi entendida perfeitamente (o título
 * casou), só que sem preço — típico de anúncio esgotado ou pausado, e a ação é
 * trocar o produto, não esperar o site "se resolver". E `prazo` fica separado
 * porque a resposta é oposta a tudo isso — mandá-lo conferir um link que a
 * rodada nem chegou a abrir é fazê-lo perder tempo com um limite nosso.
 */
/** @type {Record<string, string>} */
const GRUPO_DO_MOTIVO = {
  http: 'link',
  prazo: 'prazo',
  'sem-og': 'pagina',
  'sem-card': 'pagina',
  'titulo-nao-bate': 'pagina',
  'sem-preco': 'esgotado',
};

/** Ordem fixa: primeiro o que o coach resolve, por último o que só depende de nós. */
const MOTIVOS = [
  ['link', 'o link não respondeu', 'vale conferir se ainda está no ar'],
  ['esgotado', 'o anúncio está sem preço — pode ter esgotado ou saído do ar', 'vale conferir'],
  ['pagina', 'a página do Mercado Livre veio diferente do esperado', 'se repetir amanhã, avise quem cuida do site'],
  // Sem promessa de conserto automático: a rodada percorre os produtos sempre
  // na mesma ordem, então quem estoura o prazo são sempre os últimos da lista
  // — e na rodada seguinte são os últimos de novo. Se a lentidão persistir, os
  // mesmos produtos passam fome indefinidamente; "a próxima rodada pega" seria
  // uma promessa que a rotina não cumpre.
  ['prazo', 'a verificação não deu tempo de chegar até o fim', 'é limite nosso, não do link — se voltar a acontecer, avise quem cuida do site'],
];

/**
 * A parte da faixa que explica POR QUE os produtos caíram.
 *
 * Devolve string vazia quando nenhum item traz `motivo` — feed antigo não vira
 * causa inventada. Com mais de um grupo, cada frase carrega os seus produtos:
 * juntar tudo num rótulo só esconderia que um deles pede uma ação e o outro não.
 *
 * @param {{ nome?: string, motivo?: string }[]} falhados
 */
function fraseDosMotivos(falhados) {
  const grupos = MOTIVOS
    .map(([chave, causa, conselho]) => {
      const doGrupo = falhados.filter((f) => GRUPO_DO_MOTIVO[String(f.motivo)] === chave);
      return { causa, conselho, quantos: doGrupo.length, nomes: doGrupo.map((f) => f.nome).filter(Boolean) };
    })
    .filter((g) => g.quantos > 0);
  if (!grupos.length) return '';

  return grupos.map((g) => {
    // Um grupo só: os nomes já vieram listados na frase anterior, repeti-los aqui
    // seria ruído. Vários: sem os nomes o coach não sabe qual produto é qual caso.
    const quais = grupos.length > 1 && g.nomes.length ? ` (${g.nomes.join(', ')})` : '';
    return ` ${g.causa.charAt(0).toUpperCase()}${g.causa.slice(1)}${quais} — ${g.conselho}.`;
  }).join('');
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
    const falhados = Object.entries(feed.itens || {})
      .filter(([, it]) => it && it.estado === 'falhou')
      .map(([id, it]) => ({ nome: (produtos || []).find((p) => p.id === id)?.nome, motivo: it.motivo }));
    const nomes = falhados.map((f) => f.nome).filter(Boolean);
    // `quando` já vem com "em" embutido para datas ("em 20/ago") — necessário
    // depois de "verificados" e de "falhou em N de M", mas duplicaria a
    // preposição depois de "desde" ("desde em 20/ago"). Tira o "em" só aqui.
    const desde = quando.replace(/^em /, '');
    return {
      tipo: 'falhas',
      texto: `${falhas} produto${falhas === 1 ? '' : 's'} fora da vitrine desde ${desde}` +
        (nomes.length ? `: ${nomes.join(', ')}` : '') + '.' + fraseDosMotivos(falhados),
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
