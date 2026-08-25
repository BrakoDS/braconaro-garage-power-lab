/**
 * Cloud Functions do Garage Power Lab.
 *
 * Hoje só a análise de foto de refeição. Ela existe como função — e não como
 * chamada direta do app — por um motivo só: a chave da OpenAI não pode ir para
 * dentro do aplicativo. Qualquer variável embutida no bundle é legível por quem
 * instala o app ("These variables will be visible in plain-text in your compiled
 * application", doc do Expo), e uma chave de API vazada é gasto na conta do box.
 *
 * Aqui a chave fica no Secret Manager, o app nunca a vê, e ainda ganhamos duas
 * coisas que não existiriam do outro jeito: teto de uso por aluno e troca de
 * provedor de IA sem republicar o app na loja.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { extrairAnalise, INSTRUCOES, SCHEMA, type Analise } from './analise';
import {
  decidirRodada, ehLinkMercadoLivre, extrairPreco,
  type ItemFeed, type Leitura, type ResultadoProduto, type Rodada,
} from './precos';

initializeApp();

/**
 * Região e concorrência.
 *
 * `maxInstances` é trava de custo, não de performance: sem ela um erro em loop
 * no app (ou alguém abusando) escalaria sem teto no plano Blaze.
 */
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 5 });

const CHAVE_OPENAI = defineSecret('OPENAI_API_KEY');

/** Trocar aqui muda o modelo sem tocar no app. */
const MODELO = 'gpt-4o-mini';
const URL_OPENAI = 'https://api.openai.com/v1/responses';

/** Quantas análises cada aluno pode fazer por dia. */
const LIMITE_DIARIO = 20;

/** Teto do base64 aceito (~2 MB de imagem). O app já manda ~200 KB. */
const MAX_BASE64 = 2_800_000;

/** Quanto esperamos pela OpenAI antes de desistir. */
const TIMEOUT_MS = 45_000;

/** 'YYYY-MM-DD' no fuso do box — o mesmo dia que o app usa. */
function diaSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Consome uma análise da cota do aluno.
 *
 * Mora em `nutricaoUso/{email}`, que o aluno NÃO pode escrever — se o contador
 * ficasse no documento dele, zerar o próprio limite seria trivial. A função usa
 * o Admin SDK, que passa por cima das regras.
 *
 * A transação garante que dois toques rápidos não gastem o mesmo slot duas
 * vezes.
 */
async function consumirCota(email: string): Promise<number> {
  const db = getFirestore();
  const ref = db.collection('nutricaoUso').doc(email);
  const hoje = diaSaoPaulo();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? (snap.data() ?? {}) : {};
    const mesmoDia = d.dia === hoje;
    const usadas = mesmoDia && typeof d.usadas === 'number' ? d.usadas : 0;

    if (usadas >= LIMITE_DIARIO) {
      throw new HttpsError(
        'resource-exhausted',
        `Você já usou as ${LIMITE_DIARIO} análises de hoje. Amanhã tem mais — ` +
        'enquanto isso dá para registrar a refeição na mão.',
      );
    }

    tx.set(ref, {
      dia: hoje,
      usadas: usadas + 1,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    return LIMITE_DIARIO - (usadas + 1);
  });
}

export const analisarRefeicao = onCall(
  { secrets: [CHAVE_OPENAI], timeoutSeconds: 60, memory: '512MiB' },
  async (req): Promise<{ analise: Analise; restantes: number }> => {
    // Só aluno logado. Sem isto, qualquer um na internet gastaria a cota do box.
    const email = req.auth?.token?.email;
    if (!req.auth || typeof email !== 'string' || !email) {
      throw new HttpsError('unauthenticated', 'Entre na sua conta para usar a análise por foto.');
    }

    const dados = (req.data ?? {}) as { imagemBase64?: unknown; mimeType?: unknown };
    const base64 = typeof dados.imagemBase64 === 'string' ? dados.imagemBase64 : '';
    if (!base64) {
      throw new HttpsError('invalid-argument', 'Nenhuma imagem recebida.');
    }
    if (base64.length > MAX_BASE64) {
      throw new HttpsError('invalid-argument', 'A foto é grande demais. Tente novamente.');
    }
    const mime = dados.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

    const restantes = await consumirCota(email.trim().toLowerCase());

    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

    try {
      const resposta = await fetch(URL_OPENAI, {
        method: 'POST',
        signal: controle.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CHAVE_OPENAI.value()}`,
        },
        body: JSON.stringify({
          model: MODELO,
          instructions: INSTRUCOES,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: 'Analise este prato.' },
                {
                  type: 'input_image',
                  image_url: `data:${mime};base64,${base64}`,
                  detail: 'low', // 'low' basta para reconhecer prato e corta o custo
                },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'analise_refeicao',
              strict: true,
              schema: SCHEMA,
            },
          },
          max_output_tokens: 900,
        }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => '');
        // O corpo pode conter detalhe da conta; fica no log, não vai para o aluno.
        logger.error('OpenAI recusou a análise.', { status: resposta.status, corpo: corpo.slice(0, 500) });
        throw new HttpsError(
          'unavailable',
          'O Coach IA está indisponível agora. Dá para registrar a refeição na mão.',
        );
      }

      const analise = extrairAnalise(await resposta.json());
      logger.info('Refeição analisada.', { itens: analise.items.length, restantes });
      return { analise, restantes };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      const abortou = e instanceof Error && e.name === 'AbortError';
      logger.error('Falha ao analisar refeição.', { erro: String(e) });
      throw new HttpsError(
        'unavailable',
        abortou
          ? 'A análise demorou demais. Tente de novo ou registre na mão.'
          : 'Não deu para analisar a foto agora. Dá para registrar a refeição na mão.',
      );
    } finally {
      clearTimeout(timer);
    }
  },
);

/* ============================================================
   SINCRONIZAÇÃO DE PREÇOS DA GARAGE STORE
   ============================================================

   Por que a função escreve num documento próprio (`lojaPrecos/atual`) em vez de
   corrigir o preço direto na vitrine: `lojaPortal/atual` é sobrescrito INTEIRO
   pelo app de gestão a cada "Publicar", com os preços que o coach digitou. Se o
   robô escrevesse lá, o próximo clique do coach desfaria o trabalho dele. Cada
   um com seu documento, a vitrine funde os dois na leitura, e o indicador de
   "alterações pendentes" da gestão continua dizendo a verdade.

   A lista de produtos vem do próprio `lojaPortal/atual`, que é de leitura
   pública: a função não precisa de acesso nenhum ao catálogo privado do coach. */

const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Quanto esperamos por um link antes de desistir dele. */
const TIMEOUT_LINK_MS = 15_000;

/** Pausa entre um link e o outro. Não é exigência do ML — é boa educação. */
const PAUSA_MS = 400;

/**
 * Prazo da rodada inteira.
 *
 * Não está aqui para deixar a sincronização mais rápida — está aqui para
 * garantir que `decidirRodada` sempre seja chamada. O laço é sequencial, e no
 * pior caso (todos os links pendurados até o timeout de 15 s) 22 produtos
 * levariam ~330 s, acima dos 300 s de `timeoutSeconds`. Sem prazo, o cenário
 * exato para o qual a trava de 1/3 existe — o ML engasgando ou bloqueando em
 * massa — mata a instância antes da decisão: nada é gravado, nenhum log de
 * trava sai, e com `retryCount: 0` o dia se perde em silêncio.
 *
 * Estourado o prazo, os produtos restantes entram como falha de motivo `prazo`
 * sem serem buscados. Assim o total continua completo, a trava dispara como foi
 * projetada, e a gravação ainda cabe com folga dentro de `timeoutSeconds`.
 *
 * O número erra de propósito para o lado folgado: como as falhas de prazo
 * contam na trava de 1/3, um prazo curto trava a rodada sozinho por latência,
 * sem nenhuma falha real de leitura — com 22 produtos e todas as páginas lidas
 * com SUCESSO, 90 s travavam a partir de ~7 s por página (13 buscados, 9 fora
 * do prazo), e o log acusaria o Mercado Livre por um limite nosso. Medido em
 * produção em 25/08/2026: 32 s para 22 produtos, ~1,45 s por página. Com
 * 150 s, o prazo só começa a descartar produtos acima de ~7 s por página e só
 * trava a rodada acima de ~11 s por página — folga de 5-7x sobre o medido. NÃO
 * apertar: apertar recompra o risco de a rodada travar por latência e acusar o
 * Mercado Livre de um limite que é nosso, sem ganho nenhum em troca — o teto do
 * laço já fica em ~165 s (prazo + um link pendurado), bem dentro dos 300 s de
 * `timeoutSeconds`.
 */
const PRAZO_RODADA_MS = 150_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca um produto e devolve a leitura. Erro de rede/HTTP vira motivo `http`. */
async function buscarProduto(url: string): Promise<Leitura> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_LINK_MS);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: controle.signal,
      headers: { 'User-Agent': UA_NAVEGADOR, 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    if (!r.ok) return { ok: false, motivo: 'http' };
    return extrairPreco(await r.text());
  } catch {
    return { ok: false, motivo: 'http' };
  } finally {
    clearTimeout(timer);
  }
}

type ResumoRodada = {
  total: number; lidos: number; falhas: number; travou: boolean; mudaram: number;
  /** `true` quando nada foi buscado agora: é o resumo da última rodada gravada. */
  veioDoCache: boolean;
};

/** Uma rodada completa. Usada pelo agendamento e pelo botão — o mesmo código. */
async function rodar(): Promise<ResumoRodada> {
  const db = getFirestore();

  const vitrine = await db.doc('lojaPortal/atual').get();
  const produtos = (vitrine.exists ? (vitrine.data()?.produtos ?? []) : []) as
    { id?: string; url?: string }[];

  const alvos: { id: string; url: string }[] = [];
  let descartados = 0;
  for (const p of produtos) {
    if (!p || typeof p.id !== 'string' || !p.id) continue;
    if (!ehLinkMercadoLivre(p.url)) { descartados += 1; continue; }
    alvos.push({ id: p.id, url: p.url });
  }

  // Descartar em silêncio faz um produto sumir do feed sem explicação: se o
  // coach cadastrar um link da Amazon (ou colar um `http://` do ML), ele fica
  // sem preço sincronizado e nada no log diz por quê.
  if (descartados > 0) {
    logger.info('Preços: produtos fora do Mercado Livre ignorados.', {
      descartados, doMercadoLivre: alvos.length,
    });
  }

  // Vitrine vazia, ilegível ou sem nenhum produto do ML: não há o que
  // sincronizar, e gravar um feed vazio apagaria os preços bons de ontem.
  if (!alvos.length) {
    logger.warn('Preços: nenhum produto do Mercado Livre na vitrine, rodada abortada sem gravar.');
    return { total: 0, lidos: 0, falhas: 0, travou: true, mudaram: 0, veioDoCache: false };
  }

  const feedAntes = await db.doc('lojaPrecos/atual').get();
  const anterior = (feedAntes.exists ? (feedAntes.data()?.itens ?? {}) : {}) as Record<string, ItemFeed>;

  const inicio = Date.now();
  const resultados: ResultadoProduto[] = [];
  let estourou = false;
  for (let i = 0; i < alvos.length; i += 1) {
    if (!estourou && Date.now() - inicio > PRAZO_RODADA_MS) {
      estourou = true;
      logger.warn('Preços: prazo da rodada estourado; o restante entra como falha.', {
        buscados: i, total: alvos.length,
      });
    }
    if (estourou) {
      resultados.push({ id: alvos[i].id, url: alvos[i].url, leitura: { ok: false, motivo: 'prazo' } });
      continue;
    }
    // A URL vai junto do resultado para o item do feed poder gravá-la: o `id`
    // sobrevive à edição do produto, então só a URL prova que o preço lido é
    // deste link (ver `ItemFeed.url` em `precos.ts`). É de propósito que aqui vai
    // `alvos[i].url` — a URL de ANTES do redirecionamento, a mesma que está
    // publicada na vitrine — e não a URL final que o `fetch` resolveu: os links
    // são encurtados (`meli.la/xxx`) e resolvem para um endereço completamente
    // diferente, que nunca bateria com `produto.url` em `ehDoMesmoLink`
    // (`loja/precos.js`). Trocar para a URL resolvida faz todo item parecer
    // "de outro link" e todo preço cair no catálogo em silêncio — sem erro, sem
    // log, sem trava, porque os testes cobrem a decisão da rodada, não esta
    // montagem.
    resultados.push({ id: alvos[i].id, url: alvos[i].url, leitura: await buscarProduto(alvos[i].url) });
    // Só ENTRE produtos: depois do último a pausa é orçamento de instância no lixo.
    if (i < alvos.length - 1) await dormir(PAUSA_MS);
  }

  const agora = Date.now();
  const { rodada, itens } = decidirRodada(resultados, anterior, agora);

  // Produto que não existia no feed anterior foi LIDO pela primeira vez, não
  // "mudou" — sem o teste de número, a primeira execução relataria mudaram: 22.
  const mudaram = rodada.travou ? 0 : Object.entries(itens).filter(([id, it]) => {
    const antes = anterior[id]?.preco;
    return it.estado === 'ok' && typeof antes === 'number' && antes !== it.preco;
  }).length;

  if (rodada.travou) {
    // Só o carimbo do problema. `itens` fica exatamente como estava — e
    // `atualizadoEm` também: nenhum preço foi conferido, e mexer nele faria o
    // campo mentir justamente nos dias em que a trava disparou. Quem precisa
    // falar da trava lê `travadaEm`.
    await db.doc('lojaPrecos/atual').set({ rodada, travadaEm: agora }, { merge: true });
    logger.error('Preços: trava disparada.', rodada);
  } else {
    await db.doc('lojaPrecos/atual').set({ rodada, itens, atualizadoEm: agora });
    logger.info('Preços sincronizados.', { ...rodada, mudaram });
  }

  return { ...rodada, mudaram, veioDoCache: false };
}

export const sincronizarPrecosDiario = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    // Folga sobre o PRAZO_RODADA_MS de 150 s: o teto do laço é ~165 s e a
    // gravação ainda cabe, em vez de a plataforma matar a instância antes da
    // decisão. Os dois números andam juntos — mexer num exige mexer no outro.
    timeoutSeconds: 300,
    maxInstances: 1,
    // Ver `atualizarPrecos`: `maxInstances` NÃO serializa requisições, só
    // instâncias. Uma instância só, com a concorrência padrão, aceitaria 80
    // execuções simultâneas do mesmo `rodar` — e uma execução atrasada do
    // agendador coincidindo com um retry viraria duas rodadas em paralelo
    // contra o ML. `concurrency: 1` é o que garante uma rodada por vez.
    concurrency: 1,
    retryCount: 0, // se falhar hoje, tenta amanhã — não em loop, que é o que gera conta alta
  },
  async () => { await rodar(); },
);

/**
 * Contas autorizadas a disparar a rodada manual.
 *
 * A checagem por documento abaixo continua valendo, mas sozinha não distingue o
 * coach de qualquer usuário logado: as regras do Firestore deixam qualquer conta
 * autenticada criar o próprio `academia/{uid}`, então a condição é
 * auto-provisionável pelo console do navegador. E esta função não é barata — ela
 * gasta rede contra um site de terceiro e pode queimar o IP de saída da função
 * contra o ML. A allowlist é server-side justamente por isso.
 */
const EMAILS_COACH = ['braconaro@gmail.com'];

/** Intervalo mínimo entre duas rodadas manuais. */
const COOLDOWN_MS = 60_000;

/**
 * Por que `concurrency: 1`, e a armadilha que ele conserta.
 *
 * `maxInstances: 1` limita INSTÂNCIAS, não requisições simultâneas — não
 * serializa nada. Com `memory: '256MiB'` a CPU é 1, e a concorrência padrão
 * passa a ser 80 requisições atendidas pela MESMA instância (documentado em
 * `firebase-functions/lib/v2/options.d.ts`: "A value of null restores the
 * default concurrency (80 when CPU >= 1, 1 otherwise)").
 *
 * O estrago é concreto: a rodada leva de 30 a 100 s e o botão fica sem resposta,
 * então o coach clica cinco vezes. As cinco chamadas entram juntas, as cinco leem
 * o MESMO carimbo velho, as cinco passam pelo cooldown, e as cinco raspam em
 * paralelo — 110 requisições em rajada contra o Mercado Livre, que é exatamente
 * o muro de "suspicious-traffic" que `loja-gestao/loja-url.js` documenta.
 *
 * Com `concurrency: 1` a sequência ler-carimbo → decidir → gravar do cooldown
 * passa a ser de fato serializada, e o segundo clique encontra o carimbo novo.
 * É o que dispensa uma transação aqui.
 */
export const atualizarPrecos = onCall(
  {
    region: 'southamerica-east1',
    memory: '256MiB',
    // Acompanha o PRAZO_RODADA_MS de 150 s, igual ao agendamento.
    timeoutSeconds: 300,
    maxInstances: 1,
    concurrency: 1,
  },
  async (req): Promise<ResumoRodada> => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');

    const token = req.auth?.token;
    const email = typeof token?.email === 'string' ? token.email.trim().toLowerCase() : '';
    // `email_verified` pode não vir no token; só recusamos quando ele diz `false`.
    const naAllowlist = !!email && EMAILS_COACH.includes(email) && token?.email_verified !== false;
    if (!naAllowlist) {
      throw new HttpsError('permission-denied', 'Só o coach pode atualizar os preços.');
    }

    // Mesma condição que as regras do Firestore usam para autorizar escrita em
    // lojaPortal: quem publica a vitrine é quem pode mandar reler os preços.
    const db = getFirestore();
    const [academia, gestao] = await Promise.all([
      db.doc(`academia/${uid}`).get(),
      db.doc(`gestao/${uid}`).get(),
    ]);
    if (!academia.exists && !gestao.exists) {
      throw new HttpsError('permission-denied', 'Só o coach pode atualizar os preços.');
    }

    // Freio contra repetição: cada clique custa 22 requisições ao ML e segura a
    // instância até o timeout. O precedente do arquivo é `consumirCota` na
    // análise de refeição — chamada cara não fica sem freio. O agendamento não
    // passa por aqui: ele roda uma vez por dia e não é o vetor de abuso.
    const feed = await db.doc('lojaPrecos/atual').get();
    const d: Record<string, unknown> = feed.exists ? (feed.data() ?? {}) : {};
    const ultima = Math.max(
      typeof d.atualizadoEm === 'number' ? d.atualizadoEm : 0,
      typeof d.travadaEm === 'number' ? d.travadaEm : 0,
    );
    if (ultima > 0 && Date.now() - ultima < COOLDOWN_MS) {
      const bruta = (typeof d.rodada === 'object' && d.rodada !== null
        ? d.rodada : {}) as Partial<Rodada>;
      const num = (v: unknown) => (typeof v === 'number' ? v : 0);
      logger.info('Preços: cooldown ativo, devolvendo a última rodada sem raspar.');
      return {
        total: num(bruta.total),
        lidos: num(bruta.lidos),
        falhas: num(bruta.falhas),
        travou: bruta.travou === true,
        mudaram: 0, // nada foi lido agora, então nada mudou agora
        veioDoCache: true,
      };
    }

    return rodar();
  },
);
