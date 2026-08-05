/**
 * Cloud Functions do Braconaro Garage Power Lab.
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
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { extrairAnalise, INSTRUCOES, SCHEMA, type Analise } from './analise';

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
