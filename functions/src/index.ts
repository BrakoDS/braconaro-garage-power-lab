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
import { decidirRodada, extrairPreco, type ItemFeed, type Leitura, type ResultadoProduto } from './precos';

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
};

/** Uma rodada completa. Usada pelo agendamento e pelo botão — o mesmo código. */
async function rodar(): Promise<ResumoRodada> {
  const db = getFirestore();

  const vitrine = await db.doc('lojaPortal/atual').get();
  const produtos = (vitrine.exists ? (vitrine.data()?.produtos ?? []) : []) as
    { id?: string; url?: string }[];
  const alvos = produtos.filter((p) => p && typeof p.id === 'string' && typeof p.url === 'string' && p.url);

  // Vitrine vazia ou ilegível: não há o que sincronizar, e gravar um feed vazio
  // apagaria os preços bons de ontem.
  if (!alvos.length) {
    logger.warn('Preços: vitrine vazia ou ilegível, rodada abortada sem gravar.');
    return { total: 0, lidos: 0, falhas: 0, travou: true, mudaram: 0 };
  }

  const feedAntes = await db.doc('lojaPrecos/atual').get();
  const anterior = (feedAntes.exists ? (feedAntes.data()?.itens ?? {}) : {}) as Record<string, ItemFeed>;

  const resultados: ResultadoProduto[] = [];
  for (const p of alvos) {
    resultados.push({ id: p.id as string, leitura: await buscarProduto(p.url as string) });
    await dormir(PAUSA_MS);
  }

  const agora = Date.now();
  const { rodada, itens } = decidirRodada(resultados, anterior, agora);

  const mudaram = rodada.travou ? 0 : Object.entries(itens).filter(([id, it]) =>
    it.estado === 'ok' && anterior[id]?.preco !== it.preco).length;

  if (rodada.travou) {
    // Só o carimbo do problema. `itens` fica exatamente como estava.
    await db.doc('lojaPrecos/atual').set(
      { rodada, atualizadoEm: agora, travadaEm: agora },
      { merge: true },
    );
    logger.error('Preços: trava disparada.', rodada);
  } else {
    await db.doc('lojaPrecos/atual').set({ rodada, itens, atualizadoEm: agora });
    logger.info('Preços sincronizados.', { ...rodada, mudaram });
  }

  return { ...rodada, mudaram };
}

export const sincronizarPrecosDiario = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
    retryCount: 0, // se falhar hoje, tenta amanhã — não em loop, que é o que gera conta alta
  },
  async () => { await rodar(); },
);

export const atualizarPrecos = onCall(
  { region: 'southamerica-east1', memory: '256MiB', timeoutSeconds: 120, maxInstances: 1 },
  async (req): Promise<ResumoRodada> => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');

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

    return rodar();
  },
);
