/**
 * Cloud Functions do Garage Power Lab.
 *
 * Análise de foto de refeição, sincronização de preços da loja, pesquisa de
 * exercício e o Montador de Treinos Híbrido (leitura da lousa, variabilidade,
 * distribuição para a turma e consolidação de volume). As que falam com a
 * OpenAI existem como função — e não como chamada direta do app — por um motivo
 * só: a chave da OpenAI não pode ir para dentro do aplicativo. Qualquer variável embutida no bundle é legível por quem
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
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { extrairAnalise, INSTRUCOES, SCHEMA, type Analise } from './analise';
import {
  decidirRodada, ehLinkMercadoLivre, extrairPreco,
  type ItemFeed, type Leitura, type ResultadoProduto, type Rodada,
} from './precos';
import {
  montarSchema, instrucoes, extrairProposta,
  type Equip, type Contexto, type Proposta,
} from './pesquisa';
// `montarSchema`/`instrucoes` da lousa entram com apelido porque a pesquisa já
// exporta esses dois nomes. Apelidar aqui é melhor que renomear no módulo: cada
// arquivo continua nomeando as próprias peças do jeito óbvio, e é só neste
// ponto — onde os dois convivem — que a ambiguidade precisa ser desfeita.
import {
  montarSchema as montarSchemaLousa, instrucoes as instrucoesLousa, extrairTreino,
  type TreinoEstruturado,
} from './lousa';
import { analisarVariabilidade, type ResultadoVariabilidade, type TreinoHistorico } from './variabilidade';
import {
  distribuir, lerMatriz, matrizPadrao, ALUNOS_POR_TURMA,
  type FichaDoAluno, type MatrizAluno,
} from './distribuicao';
import {
  chaveMes, chaveSemana, consolidar, faixaDaSemana, faixaDoMes,
  type TreinoParaVolume,
} from './volume-agregado';

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

/** Quantas pesquisas de exercício/mobilidade/técnica o coach pode fazer por dia. */
const LIMITE_PESQUISA = 60;

/**
 * Cota diária da pesquisa de exercício — mesmo padrão transacional de
 * `consumirCota` acima, num documento PRÓPRIO (`pesquisaUso/{email}`, não
 * `nutricaoUso`): são cotas de coisas diferentes, e misturar as duas faria uma
 * pesquisa do coach gastar o limite de análise de refeição do aluno (ou o
 * contrário, um aluno comendo o teto da pesquisa do coach).
 *
 * Este limite NÃO é proteção contra abuso de terceiro — a pesquisa é
 * `permission-denied` para qualquer email fora de `EMAILS_COACH`, e o próprio
 * coach pediu isto para uso pessoal dele ("somente eu irei usar esse
 * sistema"). Com um único usuário autorizado não existe "mal-intencionado" do
 * qual se defender. A cota está aqui contra BUG: um laço de renderização, um
 * clique que reenvia, um retry de rede — nada disso tem freio próprio, e sem
 * este teto qualquer um deles queimaria o crédito do mês na OpenAI numa
 * tarde. Se no futuro alguém olhar para 60/dia achando pouco para "proteção
 * contra abuso" e for aumentar por esse motivo: o motivo está errado, o
 * número não é sobre abuso.
 */
async function consumirCotaPesquisa(email: string): Promise<number> {
  const db = getFirestore();
  const ref = db.collection('pesquisaUso').doc(email);
  const hoje = diaSaoPaulo();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? (snap.data() ?? {}) : {};
    const mesmoDia = d.dia === hoje;
    const usadas = mesmoDia && typeof d.usadas === 'number' ? d.usadas : 0;

    if (usadas >= LIMITE_PESQUISA) {
      throw new HttpsError(
        'resource-exhausted',
        `Limite de segurança de ${LIMITE_PESQUISA} pesquisas por dia atingido — é trava contra ` +
        'bug (loop, clique duplicado), não limite de uso normal. Dá para cadastrar na mão em /academia.',
      );
    }

    tx.set(ref, {
      dia: hoje,
      usadas: usadas + 1,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    return LIMITE_PESQUISA - (usadas + 1);
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
    // (`garage-store/precos.js`). Trocar para a URL resolvida faz todo item parecer
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
 * o muro de "suspicious-traffic" que `coach/gestao-garage-store/loja-url.js` documenta.
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

/* ============================================================
   PESQUISA DE EXERCÍCIO / MOBILIDADE / TÉCNICA (Treino Livre)
   ============================================================

   O coach digita, no Treino Livre, um exercício que não existe no catálogo do
   box. Esta função pesquisa (opcionalmente na web) e devolve uma PROPOSTA no
   vocabulário fechado da Academia dele, pronta para revisão na tela — o
   cadastro em si é a próxima etapa. `montarSchema`/`instrucoes`/
   `extrairProposta` (`pesquisa.ts`) são a parte pura testada em `npm run
   checar`; aqui só a chamada de rede e as travas que só existem em produção
   (allowlist, cota, timeout). */

/** Um termo digitado por engano ('a') ou colado inteiro ('Descrição completa...') não é pesquisa válida. */
const TERMO_MIN = 2;
const TERMO_MAX = 80;
/** Teto de itens de equipamento aceitos — o inventário real do box não chega perto disto. */
const MAX_EQUIPAMENTOS = 200;

const CONTEXTOS_VALIDOS: readonly Contexto[] = ['exercicio', 'mobilidade', 'tecnica'];

/** Sem ferramenta: pergunta fechada, resposta curta — 15 s bastam e sobra margem no `timeoutSeconds`. */
const TIMEOUT_PESQUISA_SEM_BUSCA_MS = 15_000;
/** Com `web_search`: a OpenAI navega antes de responder — 45 s, igual ao teto de `analisarRefeicao`. */
const TIMEOUT_PESQUISA_COM_BUSCA_MS = 45_000;

/**
 * `equipamentos` truncado e saneado: no máximo `MAX_EQUIPAMENTOS`, e só o item
 * que tem `id`/`nome` de verdade sobrevive. Truncar em vez de recusar segue o
 * espírito do resto do arquivo (`base64.length > MAX_BASE64` também corta, não
 * derruba a chamada) — um inventário grande demais não é ataque, é só um box
 * com catálogo extenso, e a pesquisa funciona igual com os 200 primeiros.
 */
function validarEquipamentos(v: unknown): Equip[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_EQUIPAMENTOS)
    .map((e): Equip | null => {
      if (!e || typeof e !== 'object') return null;
      // `typeof === 'string'` e não `String(...)`: coagir faria um id numérico
      // virar "42" e um objeto virar "[object Object]", e esse lixo entraria no
      // `enum` do schema e no prompt. O que não é string não é id — descarta.
      const bruto = e as Record<string, unknown>;
      if (typeof bruto.id !== 'string' || typeof bruto.nome !== 'string') return null;
      const id = bruto.id.trim();
      const nome = bruto.nome.trim();
      return id && nome ? { id, nome } : null;
    })
    .filter((e): e is Equip => e !== null);
}

/** Resultado de uma chamada ao Responses API — sucesso com o JSON já decodificado, ou falha com o suficiente para decidir o que fazer a seguir. */
type ChamadaOpenAI =
  | { ok: true; json: unknown }
  | { ok: false; status: number; corpo: string; abortou: boolean };

async function chamarResponses(corpo: object, timeoutMs: number): Promise<ChamadaOpenAI> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const resposta = await fetch(URL_OPENAI, {
      method: 'POST',
      signal: controle.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CHAVE_OPENAI.value()}`,
      },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      return { ok: false, status: resposta.status, corpo: texto, abortou: false };
    }
    return { ok: true, json: await resposta.json() };
  } catch (e) {
    return { ok: false, status: 0, corpo: String(e), abortou: e instanceof Error && e.name === 'AbortError' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * O RISCO DOCUMENTADO NO SPEC: a documentação da OpenAI é ambígua sobre usar
 * `tools` (busca na web) junto de `text.format` estrito na MESMA chamada. Há
 * fonte afirmando que são mutuamente exclusivos — mas isso é confirmado para o
 * `response_format` do Chat Completions antigo, não claramente para o
 * `text.format` do Responses API (que é o que usamos aqui). Por isso o caminho
 * de UMA chamada é o principal, e esta função só entra em cena quando a
 * própria API reclamar.
 *
 * Não temos como testar isto contra a API real nesta task: a chave vive no
 * Secret Manager e a função exige a conta do coach logada — não é algo que dá
 * para simular localmente. Por isso a heurística abaixo é deliberadamente
 * conservadora: só reconhece incompatibilidade num erro 400 que fale de
 * FERRAMENTA e de FORMATO ao mesmo tempo. Se a OpenAI usar um texto de erro
 * diferente do que imaginamos, esta função simplesmente não reconhece o caso
 * — a pesquisa falha do jeito normal (mensagem de indisponibilidade), nunca
 * trava ou entra num loop silencioso.
 */
function pareceIncompatibilidadeFerramentaFormato(status: number, _corpo: string): boolean {
  // QUALQUER 400 na via com busca aciona o recuo, sem tentar reconhecer o texto
  // do erro. Casar string de mensagem de API é frágil pelo motivo de sempre: se a
  // OpenAI escrever o erro com outras palavras, o recuo nunca dispara, a busca na
  // web simplesmente não funciona, e o único vestígio fica num log que ninguém lê
  // — enquanto a via rápida segue ok e esconde o problema.
  //
  // Recuar sem perguntar é barato: a segunda via não é recursiva (roda uma vez),
  // a cota é debitada uma vez por invocação e não por chamada de rede, e um 400
  // estrutural (schema errado, por exemplo) falha nas duas etapas igualmente, sem
  // laço. O pior caso é uma tentativa extra que também falha; o pior caso da
  // heurística de texto era a feature nascer morta em produção.
  return status === 400;
}

/** Mesmo caminho duplo de `textoDaResposta` em `analise.ts`/`pesquisa.ts` — aqui só para ler o RESUMO em texto livre da primeira chamada da via de duas chamadas, que não passa por `extrairProposta`. */
function textoBruto(r: unknown): string {
  if (!r || typeof r !== 'object') return '';
  const o = r as Record<string, unknown>;
  if (typeof o.output_text === 'string' && o.output_text.trim()) return o.output_text;
  let texto = '';
  if (Array.isArray(o.output)) {
    for (const bloco of o.output) {
      const conteudo = (bloco as { content?: unknown })?.content;
      if (!Array.isArray(conteudo)) continue;
      for (const parte of conteudo) {
        const t = (parte as { text?: unknown })?.text;
        if (typeof t === 'string') texto += t;
      }
    }
  }
  return texto;
}

/** A via rápida: uma chamada só, com ou sem `web_search` conforme `buscarNaWeb`. */
async function pesquisarUmaChamada(
  termo: string, contexto: Contexto, equipamentos: Equip[], buscarNaWeb: boolean,
): Promise<ChamadaOpenAI> {
  const corpo: Record<string, unknown> = {
    model: MODELO,
    instructions: instrucoes(contexto, equipamentos),
    input: [{ role: 'user', content: [{ type: 'input_text', text: `Pesquise e prepare o cadastro de: ${termo}` }] }],
    text: {
      format: {
        type: 'json_schema',
        name: 'pesquisa_item',
        strict: true,
        schema: montarSchema(contexto, equipamentos),
      },
    },
    // Com busca a resposta tende a vir mais longa (o modelo cita o que achou antes do JSON final).
    max_output_tokens: buscarNaWeb ? 1500 : 700,
  };
  if (buscarNaWeb) corpo.tools = [{ type: 'web_search' }];

  const timeoutMs = buscarNaWeb ? TIMEOUT_PESQUISA_COM_BUSCA_MS : TIMEOUT_PESQUISA_SEM_BUSCA_MS;
  return chamarResponses(corpo, timeoutMs);
}

/**
 * O recuo de duas chamadas — só acionado quando a primeira devolve o erro de
 * incompatibilidade acima. Primeira chamada: `web_search` ligado, SEM formato
 * estrito, pedindo um resumo em texto livre do que a busca encontrou. Segunda
 * chamada: sem ferramenta, com o mesmo schema estrito da via rápida,
 * convertendo aquele resumo na proposta estruturada — a mesma forma que
 * `extrairProposta` já sabe ler.
 */
async function pesquisarDuasChamadas(
  termo: string, contexto: Contexto, equipamentos: Equip[],
): Promise<ChamadaOpenAI> {
  const alvo = contexto === 'tecnica' ? 'uma técnica de treino'
    : contexto === 'mobilidade' ? 'um exercício de mobilidade/aquecimento'
      : 'um exercício de treino';

  const primeira = await chamarResponses({
    model: MODELO,
    instructions: [
      `Pesquise na web sobre "${termo}", ${alvo} que o coach do Garage Power Lab quer cadastrar.`,
      'Devolva um RESUMO em texto corrido (não em JSON, sem formatação) com o que encontrar:',
      'como se executa, para que serve, padrão de movimento predominante, músculos envolvidos,',
      'equipamento tipicamente usado, e as URLs das fontes. Um parágrafo curto basta — outra',
      'etapa vai converter este resumo no cadastro estruturado.',
    ].join('\n'),
    input: [{ role: 'user', content: [{ type: 'input_text', text: termo }] }],
    tools: [{ type: 'web_search' }],
    max_output_tokens: 1200,
  }, TIMEOUT_PESQUISA_COM_BUSCA_MS);
  if (!primeira.ok) return primeira;

  const resumo = textoBruto(primeira.json).trim();
  if (!resumo) {
    // Sem resumo não há o que converter na segunda chamada — mesmo tratamento
    // de "falha" da função, para o coach ver a mensagem amigável de sempre.
    return { ok: false, status: 0, corpo: 'A busca voltou sem texto para resumir.', abortou: false };
  }

  return chamarResponses({
    model: MODELO,
    instructions: instrucoes(contexto, equipamentos),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `Termo original digitado pelo coach: "${termo}".\n\nResumo da pesquisa na web:\n${resumo}`,
      }],
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'pesquisa_item',
        strict: true,
        schema: montarSchema(contexto, equipamentos),
      },
    },
    max_output_tokens: 700,
  }, TIMEOUT_PESQUISA_SEM_BUSCA_MS);
}

export const pesquisarItem = onCall(
  // 120 s cobre o pior caso real: a via de duas chamadas soma os timeouts de
  // rede dos dois passos (45 s + 15 s) mais a folga de processamento — bem
  // abaixo do teto, ao contrário do cálculo apertado de `PRAZO_RODADA_MS`
  // acima, porque aqui não há um laço de dezenas de itens sequenciais.
  { secrets: [CHAVE_OPENAI], timeoutSeconds: 120, memory: '512MiB' },
  async (req): Promise<{ proposta: Proposta; restantes: number; buscou: boolean }> => {
    // Allowlist do coach — mesmo padrão de `atualizarPrecos` acima. Esta busca
    // gasta rede contra a OpenAI (custo real) e, com `buscarNaWeb`, contra a
    // web também; "somente eu irei usar esse sistema" foi pedido explícito do
    // coach, e é esta checagem que transforma o pedido em trava de verdade —
    // sem ela, qualquer conta autenticada (as regras do Firestore deixam
    // qualquer uma criar o próprio `academia/{uid}`) poderia chamar a função.
    const token = req.auth?.token;
    const email = typeof token?.email === 'string' ? token.email.trim().toLowerCase() : '';
    const naAllowlist = !!email && EMAILS_COACH.includes(email) && token?.email_verified !== false;
    if (!naAllowlist) {
      throw new HttpsError('permission-denied', 'Só o coach usa a pesquisa.');
    }

    // Entrada validada, não confiada: quem chama é sempre o app, mas o app
    // pode ter um bug, e a função é a última linha antes da chamada paga à
    // OpenAI.
    const dados = (req.data ?? {}) as {
      termo?: unknown; contexto?: unknown; equipamentos?: unknown; buscarNaWeb?: unknown;
    };

    const termo = typeof dados.termo === 'string' ? dados.termo.trim() : '';
    if (termo.length < TERMO_MIN || termo.length > TERMO_MAX) {
      throw new HttpsError('invalid-argument', `O termo pesquisado deve ter entre ${TERMO_MIN} e ${TERMO_MAX} caracteres.`);
    }

    const contexto = dados.contexto as Contexto;
    if (!CONTEXTOS_VALIDOS.includes(contexto)) {
      throw new HttpsError('invalid-argument', 'Contexto inválido — use exercicio, mobilidade ou tecnica.');
    }

    const equipamentos = validarEquipamentos(dados.equipamentos);
    const buscarNaWeb = dados.buscarNaWeb === true;

    const restantes = await consumirCotaPesquisa(email);

    try {
      let resultado = await pesquisarUmaChamada(termo, contexto, equipamentos, buscarNaWeb);

      if (!resultado.ok && buscarNaWeb && pareceIncompatibilidadeFerramentaFormato(resultado.status, resultado.corpo)) {
        logger.warn('Pesquisa: OpenAI recusou ferramenta + formato estrito juntos; caindo para a via de duas chamadas.', {
          status: resultado.status, corpo: resultado.corpo.slice(0, 500),
        });
        resultado = await pesquisarDuasChamadas(termo, contexto, equipamentos);
      }

      if (!resultado.ok) {
        // O corpo pode conter detalhe da conta OpenAI; fica só no log, nunca vai para o coach.
        logger.error('OpenAI recusou a pesquisa.', { status: resultado.status, corpo: resultado.corpo.slice(0, 500) });
        throw new HttpsError(
          'unavailable',
          resultado.abortou
            ? 'A pesquisa demorou demais. Tente de novo ou cadastre em /academia.'
            : 'O Coach IA está indisponível agora. Dá para cadastrar em /academia.',
        );
      }

      const proposta = extrairProposta(resultado.json, contexto, equipamentos);
      logger.info('Pesquisa concluída.', { contexto, buscarNaWeb, restantes });
      return { proposta, restantes, buscou: buscarNaWeb };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      // `extrairProposta` lança Error com mensagem já legível (ver pesquisa.ts)
      // — é segura para o coach ver, ao contrário do corpo cru da OpenAI acima.
      logger.error('Falha ao processar a pesquisa.', { erro: String(e) });
      throw new HttpsError(
        'unavailable',
        e instanceof Error && e.message ? e.message : 'Não deu para concluir a pesquisa agora. Cadastre em /academia.',
      );
    }
  },
);

/* ============================================================
   MONTADOR DE TREINOS HÍBRIDO — Lousa do Coach & Dashboard de Volume
   ============================================================

   Quatro funções, uma por etapa do fluxo do coach:

     parseWorkoutLousa           quadro branco  ➔ treino estruturado
     checkWorkoutVariability     treino novo    ➔ alertas da semana
     distributeWorkoutToStudents treino aprovado ➔ ficha de cada aluno
     aggregateVolumeMetrics      (gatilho)       ➔ consolidado de volume

   Onde os dados moram, e por que aqui:

     coaches/{uid}/lousas/{workoutId}                  o treino da lousa
     coaches/{uid}/lousas/{workoutId}/fichas/{alunoId} a ficha de cada aluno
     coaches/{uid}/matriz_individualizacao/{alunoId}   lesões, restrições, 1RM
     coaches/{uid}/volumeAgregado/{chave}              semana e mês consolidados
     treinoAluno/{email}                               a fatia que o Portal lê

   Tudo debaixo de `coaches/{uid}` de propósito: a regra que já existe em
   `firestore.rules` (`match /coaches/{uid}` + `match /{sub=**}`) cobre qualquer
   subcoleção nova com o mesmo dono e o mesmo acesso, então esta ferramenta
   inteira nasce sem afrouxar uma linha das regras. `treinoAluno/{email}` é a
   única exceção, e é intencional: é a coleção que o aluno já lê no Portal, e a
   regra dela já autoriza o coach a escrever.
   ============================================================ */

/**
 * Quem pode usar a ferramenta.
 *
 * O spec pede `token.admin === true`, e é a primeira coisa checada. Mas a
 * claim `admin` precisa ser gravada por fora (Admin SDK ou console) e HOJE
 * nenhuma conta deste projeto a tem — publicar só com ela deixaria a
 * ferramenta inacessível até alguém rodar um script que não existe. Por isso a
 * allowlist de `EMAILS_COACH`, já usada por `pesquisarItem` e `atualizarPrecos`,
 * vale como segunda porta: o mesmo critério do resto do sistema, nem mais
 * aberto nem mais fechado. Quando a claim existir, ela passa a mandar sozinha e
 * esta segunda condição vira redundância inofensiva.
 */
function exigirCoach(req: { auth?: { uid?: string; token?: Record<string, unknown> } }): { uid: string; email: string } {
  const uid = req.auth?.uid;
  const token = req.auth?.token;
  if (!uid || !token) {
    throw new HttpsError('unauthenticated', 'Entre na sua conta de coach para usar o Montador Híbrido.');
  }
  const email = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
  const ehAdmin = token.admin === true;
  const naAllowlist = !!email && EMAILS_COACH.includes(email) && token.email_verified !== false;
  if (!ehAdmin && !naAllowlist) {
    throw new HttpsError('permission-denied', 'Só o coach usa o Montador Híbrido.');
  }
  return { uid, email };
}

/** Quantas leituras de lousa o coach pode fazer por dia. */
const LIMITE_LOUSA = 40;

/**
 * Cota diária da leitura de lousa, em documento PRÓPRIO (`lousaUso/{email}`).
 *
 * Mesmo raciocínio de `consumirCotaPesquisa`, e pelo mesmo motivo de separar:
 * uma lousa relida três vezes numa tarde não pode comer o teto da pesquisa de
 * exercício (nem o contrário). O freio é contra BUG — um clique duplo, um
 * retry de rede, um laço de render — e não contra abuso de terceiro, que a
 * checagem de coach acima já resolve.
 */
async function consumirCotaLousa(email: string): Promise<number> {
  const db = getFirestore();
  const ref = db.collection('lousaUso').doc(email);
  const hoje = diaSaoPaulo();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? (snap.data() ?? {}) : {};
    const mesmoDia = d.dia === hoje;
    const usadas = mesmoDia && typeof d.usadas === 'number' ? d.usadas : 0;

    if (usadas >= LIMITE_LOUSA) {
      throw new HttpsError(
        'resource-exhausted',
        `Você já usou as ${LIMITE_LOUSA} leituras de lousa de hoje. Dá para montar o treino na mão no Montador de Treinos.`,
      );
    }

    tx.set(ref, { dia: hoje, usadas: usadas + 1, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    return LIMITE_LOUSA - (usadas + 1);
  });
}

/**
 * Formatos aceitos do canvas.
 *
 * A COMPRESSÃO acontece no navegador (`core/canvas.js`, `toDataURL(tipo, 0.8)`)
 * e não aqui, por uma razão de transporte: o canvas cru de um quadro 1600×900 é
 * um PNG de vários MB, e comprimir no servidor significaria SUBIR esses MB
 * primeiro — a chamada estouraria o limite do callable antes de a função rodar.
 * Comprimindo antes, a mesma lousa vai como JPEG de ~150 KB. À função cabe
 * então recusar o que não veio no formato combinado.
 */
const MIMES_LOUSA = ['image/jpeg', 'image/webp'] as const;

/** Teto de caracteres do texto digitado na lousa. */
const MAX_TEXTO_LOUSA = 4000;

export const parseWorkoutLousa = onCall(
  { secrets: [CHAVE_OPENAI], timeoutSeconds: 120, memory: '512MiB' },
  async (req): Promise<{ treino: TreinoEstruturado; restantes: number }> => {
    const { email } = exigirCoach(req);

    const dados = (req.data ?? {}) as { textInput?: unknown; canvasImageBase64?: unknown; mimeType?: unknown };
    const textInput = typeof dados.textInput === 'string' ? dados.textInput.trim().slice(0, MAX_TEXTO_LOUSA) : '';
    const imagem = typeof dados.canvasImageBase64 === 'string' ? dados.canvasImageBase64 : '';

    // Um dos dois basta: o coach que só digitou não precisa desenhar, e o que
    // só desenhou não precisa digitar. Nenhum dos dois é a lousa vazia.
    if (!textInput && !imagem) {
      throw new HttpsError('invalid-argument', 'A lousa está vazia — escreva o treino ou desenhe no quadro antes de reconhecer.');
    }
    if (imagem && imagem.length > MAX_BASE64) {
      throw new HttpsError('invalid-argument', 'O desenho da lousa ficou grande demais. Limpe o quadro e desenhe de novo.');
    }
    const mime = MIMES_LOUSA.includes(dados.mimeType as typeof MIMES_LOUSA[number])
      ? (dados.mimeType as string)
      : 'image/jpeg';

    const restantes = await consumirCotaLousa(email || `uid:${req.auth?.uid}`);

    const conteudo: Record<string, unknown>[] = [
      { type: 'input_text', text: textInput ? 'Leia a lousa e o texto digitado.' : 'Leia a lousa desenhada.' },
    ];
    if (imagem) {
      // `detail: 'high'`, ao contrário da análise de refeição: ali basta
      // reconhecer "isso é arroz"; aqui é preciso LER caligrafia pequena e
      // distinguir a cor da caneta, e em 'low' a imagem é reamostrada a ponto
      // de "3x8" e "3×3" virarem o mesmo borrão.
      conteudo.push({ type: 'input_image', image_url: `data:${mime};base64,${imagem}`, detail: 'high' });
    }

    const chamada = await chamarResponses({
      model: MODELO,
      instructions: instrucoesLousa(textInput),
      input: [{ role: 'user', content: conteudo }],
      text: {
        format: { type: 'json_schema', name: 'treino_lousa', strict: true, schema: montarSchemaLousa() },
      },
      max_output_tokens: 2000,
    }, TIMEOUT_MS);

    if (!chamada.ok) {
      // O corpo pode trazer detalhe da conta OpenAI: fica no log, nunca no erro do coach.
      logger.error('OpenAI recusou a leitura da lousa.', { status: chamada.status, corpo: chamada.corpo.slice(0, 500) });
      throw new HttpsError(
        'unavailable',
        chamada.abortou
          ? 'A leitura da lousa demorou demais. Tente de novo — ou monte o treino no Montador de Treinos.'
          : 'O reconhecimento está indisponível agora. Dá para montar o treino no Montador de Treinos.',
      );
    }

    try {
      const treino = extrairTreino(chamada.json);
      logger.info('Lousa lida.', {
        sistema: treino.sistema,
        blocos: treino.blocos.length,
        series: treino.estimativaSeries,
        substituicoes: treino.substituicoes.length,
        restantes,
      });
      return { treino, restantes };
    } catch (e) {
      // `extrairTreino` lança com mensagem já escrita para o coach ler.
      logger.error('Falha ao estruturar a lousa.', { erro: String(e) });
      throw new HttpsError('unavailable', e instanceof Error && e.message ? e.message : 'Não deu para estruturar a lousa agora.');
    }
  },
);

/** Quantos dias de histórico a checagem de variabilidade olha para trás. */
const JANELA_DIAS = 7;
/** Teto de treinos lidos na janela — uma semana não tem mais que isso, e o limite protege contra coleção corrompida. */
const MAX_HISTORICO = 30;

/** 'YYYY-MM-DD' somado de N dias, sem depender de fuso local. */
function somarDias(dateId: string, dias: number): string {
  const t = Date.parse(`${dateId}T12:00:00Z`);
  if (!Number.isFinite(t)) return dateId;
  return new Date(t + dias * 864e5).toISOString().slice(0, 10);
}

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/;

export const checkWorkoutVariability = onCall(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (req): Promise<ResultadoVariabilidade> => {
    const { uid } = exigirCoach(req);

    const dados = (req.data ?? {}) as { structuredWorkout?: unknown; weekStartDate?: unknown };
    const weekStartDate = typeof dados.weekStartDate === 'string' && EH_DATA.test(dados.weekStartDate)
      ? dados.weekStartDate
      : diaSaoPaulo();

    // O treino chega do cliente porque a checagem roda ANTES de salvar — é
    // justamente para o coach decidir se salva assim. Passa por `extrairTreino`
    // de novo (o cliente manda o objeto já estruturado, mas nada garante que
    // chegou inteiro) para que a análise nunca opere em cima de campo torto.
    let treino: TreinoEstruturado;
    try {
      treino = extrairTreino({ output_text: JSON.stringify(normalizarParaLeitura(dados.structuredWorkout)) });
    } catch {
      throw new HttpsError('invalid-argument', 'Treino inválido — reconheça a lousa antes de checar a variabilidade.');
    }

    const inicio = somarDias(weekStartDate, -JANELA_DIAS);
    const db = getFirestore();
    let historico: TreinoHistorico[] = [];
    try {
      const snap = await db.collection(`coaches/${uid}/lousas`)
        .where('dateId', '>=', inicio)
        .where('dateId', '<=', weekStartDate)
        .limit(MAX_HISTORICO)
        .get();
      historico = snap.docs.flatMap((d): TreinoHistorico[] => {
        const v = d.data() ?? {};
        if (!v.treino || typeof v.treino !== 'object') return [];
        return [{
          id: d.id,
          dateId: typeof v.dateId === 'string' ? v.dateId : '',
          geradoEm: typeof v.geradoEm === 'string' ? v.geradoEm : `${v.dateId}T12:00:00.000Z`,
          treino: v.treino as TreinoEstruturado,
        }];
      });
    } catch (e) {
      // Sem histórico a checagem perde profundidade, mas não perde sentido —
      // saturação e redundância ainda leem o treino novo. Falhar a chamada
      // inteira porque o índice não existe deixaria o coach travado na tela.
      logger.warn('Histórico da semana indisponível — analisando só o treino novo.', { erro: String(e) });
    }

    const agoraIso = new Date().toISOString();
    const resultado = analisarVariabilidade(treino, historico, agoraIso);
    logger.info('Variabilidade checada.', { alertas: resultado.alertas.length, historico: historico.length });
    return resultado;
  },
);

/**
 * O treino que o cliente manda volta ao formato que `extrairTreino` lê (lista
 * achatada de exercícios), em vez de a função ganhar um segundo leitor.
 *
 * Um leitor só significa uma regra só: as regras globais do box, o descarte de
 * músculo inventado e o padrão de série por bloco valem igual na primeira
 * leitura e em toda revalidação. Um segundo caminho seria a chance de um
 * "pull-up" entrar pela porta dos fundos.
 */
function normalizarParaLeitura(bruto: unknown): Record<string, unknown> {
  const t = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const blocos = Array.isArray(t.blocos) ? t.blocos : [];
  const exercicios = blocos.flatMap((b) => {
    const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    return Array.isArray(o.exercicios) ? o.exercicios : [];
  });
  return { sistema: t.sistema, titulo: t.titulo, avisos: t.avisos ?? [], exercicios };
}

/** Formato de horário de aula aceito ('19:00'). */
const EH_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const distributeWorkoutToStudents = onCall(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (req): Promise<{ fichas: FichaDoAluno[]; gravadas: number; semMatriz: string[]; dryRun: boolean }> => {
    const { uid } = exigirCoach(req);

    const dados = (req.data ?? {}) as { workoutId?: unknown; studentIds?: unknown; classTime?: unknown; dryRun?: unknown };
    // `dryRun` é o que sustenta a PRÉVIA da turma na tela do coach ("como este
    // treino fica para a Ana?") sem gravar nada. Existe como parâmetro, e não
    // como um segundo cálculo no navegador, porque a prévia tem de sair da
    // MESMA conta do envio: reimplementar lesão, restrição e balizamento de 1RM
    // no cliente criaria duas regras, e o coach aprovaria uma para mandar outra.
    const dryRun = dados.dryRun === true;
    const workoutId = typeof dados.workoutId === 'string' ? dados.workoutId.trim() : '';
    if (!workoutId) throw new HttpsError('invalid-argument', 'Salve o treino antes de distribuir para a turma.');

    const studentIds = Array.isArray(dados.studentIds)
      ? [...new Set(dados.studentIds.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()))]
      : [];
    if (!studentIds.length) throw new HttpsError('invalid-argument', 'Selecione pelo menos um aluno da turma.');
    if (studentIds.length > ALUNOS_POR_TURMA) {
      throw new HttpsError('invalid-argument', `A turma tem no máximo ${ALUNOS_POR_TURMA} alunos por aula.`);
    }
    const classTime = typeof dados.classTime === 'string' && EH_HORA.test(dados.classTime) ? dados.classTime : '';

    const db = getFirestore();
    const treinoRef = db.doc(`coaches/${uid}/lousas/${workoutId}`);
    const treinoSnap = await treinoRef.get();
    if (!treinoSnap.exists) throw new HttpsError('not-found', 'Treino não encontrado — salve a lousa de novo.');

    const doc = treinoSnap.data() ?? {};
    const treino = doc.treino as TreinoEstruturado | undefined;
    if (!treino || !Array.isArray(treino.blocos)) {
      throw new HttpsError('failed-precondition', 'O treino salvo está incompleto. Reconheça a lousa de novo.');
    }
    const dateId = typeof doc.dateId === 'string' && EH_DATA.test(doc.dateId) ? doc.dateId : diaSaoPaulo();

    // Uma leitura por aluno, em paralelo: são no máximo 8, e `getAll` obrigaria
    // a montar as referências antes de saber quais existem.
    const semMatriz: string[] = [];
    const matrizes: MatrizAluno[] = await Promise.all(studentIds.map(async (id) => {
      const snap = await db.doc(`coaches/${uid}/matriz_individualizacao/${id}`).get();
      if (!snap.exists) {
        // Aluno sem matriz recebe o treino da turma como está, e o coach vê o
        // aviso na prévia. Recusar a distribuição inteira por causa de um aluno
        // novo deixaria a turma sem treino por um cadastro que falta.
        semMatriz.push(id);
        return matrizPadrao(id);
      }
      return lerMatriz(snap.data(), id);
    }));

    const fichas = distribuir(treino, matrizes);

    if (dryRun) {
      logger.info('Distribuição pré-visualizada.', { workoutId, alunos: fichas.length });
      return { fichas, gravadas: 0, semMatriz, dryRun: true };
    }

    // GRAVAÇÃO EM LOTE: as fichas da turma inteira entram ou não entram juntas.
    // Sem o lote, uma falha de rede no quinto aluno deixaria quatro com o treino
    // de hoje e quatro com o de ontem — e ninguém saberia quais.
    const lote = db.batch();
    let gravadas = 0;
    for (const f of fichas) {
      lote.set(treinoRef.collection('fichas').doc(f.alunoId), {
        ...f, workoutId, dateId, classTime, distribuidoEm: FieldValue.serverTimestamp(),
      });
      gravadas++;
      // O Portal do Aluno lê por e-mail. Sem e-mail na matriz a ficha continua
      // salva ao lado do treino (o coach a vê e imprime), só não chega ao app.
      if (f.email) {
        lote.set(db.doc(`treinoAluno/${f.email}`), {
          hibrido: { [dateId]: { workoutId, classTime, titulo: treino.titulo, sistema: treino.sistema, linhas: f.linhas, avisos: f.avisos } },
          atualizadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    lote.set(treinoRef, {
      distribuido: { em: FieldValue.serverTimestamp(), alunos: studentIds, classTime },
    }, { merge: true });

    try {
      await lote.commit();
    } catch (e) {
      logger.error('Falha ao gravar a distribuição da turma.', { erro: String(e), workoutId });
      throw new HttpsError('unavailable', 'Não deu para enviar o treino para a turma agora. Tente de novo em instantes.');
    }

    logger.info('Treino distribuído.', { workoutId, alunos: fichas.length, semMatriz: semMatriz.length });
    return { fichas, gravadas, semMatriz, dryRun: false };
  },
);

/**
 * CONSOLIDAÇÃO DE VOLUME — gatilho, não chamada.
 *
 * Roda em `coaches/{uid}/lousas/{workoutId}`, depois de o treino ser gravado ou
 * apagado, e refaz a semana e o mês daquele treino. É assíncrono de propósito:
 * o coach não espera por isto para salvar a lousa, e o dashboard lê o
 * consolidado pronto em duas leituras em vez de varrer o mês inteiro a cada
 * abertura.
 *
 * Não há laço de gatilho: a escrita vai para `volumeAgregado`, outra coleção,
 * que não dispara este mesmo trigger.
 */
export const aggregateVolumeMetrics = onDocumentWritten(
  { document: 'coaches/{uid}/lousas/{workoutId}', timeoutSeconds: 120, memory: '256MiB' },
  async (evento) => {
    const uid = evento.params.uid;
    const depois = evento.data?.after?.data();
    const antes = evento.data?.before?.data();

    // No apagamento só existe `antes` — e é a semana DELE que precisa ser
    // refeita, senão o volume do treino removido fica no consolidado para sempre.
    const dateId = (typeof depois?.dateId === 'string' && depois.dateId)
      || (typeof antes?.dateId === 'string' && antes.dateId)
      || '';
    if (!EH_DATA.test(dateId)) {
      logger.warn('Treino sem dateId utilizável — consolidação ignorada.', { uid, workoutId: evento.params.workoutId });
      return;
    }

    const db = getFirestore();
    const colecao = db.collection(`coaches/${uid}/lousas`);

    /** Lê os treinos de uma faixa de datas e devolve no formato da consolidação. */
    const lerFaixa = async (inicio: string, fim: string): Promise<TreinoParaVolume[]> => {
      const snap = await colecao.where('dateId', '>=', inicio).where('dateId', '<=', fim).get();
      return snap.docs.flatMap((d): TreinoParaVolume[] => {
        const v = d.data() ?? {};
        const t = v.treino as TreinoEstruturado | undefined;
        if (!t || !Array.isArray(t.blocos)) return [];
        return [{
          dateId: typeof v.dateId === 'string' ? v.dateId : '',
          sistema: t.sistema,
          exercicios: t.blocos.flatMap((b) => (b.exercicios || []).map((ex) => ({
            series: ex.series, grupamentos: ex.grupamentos || [], implemento: ex.implemento || '',
          }))),
        }];
      });
    };

    try {
      // Metas do coach, quando ele sobrescreveu a tabela padrão.
      const conf = await db.doc(`coaches/${uid}`).get();
      const metasDoCoach = (conf.data()?.config?.metasVolume ?? {}) as Record<string, number>;

      const semana = faixaDaSemana(dateId);
      const mes = faixaDoMes(dateId);
      const [treinosSemana, treinosMes] = await Promise.all([
        lerFaixa(semana.inicio, semana.fim),
        lerFaixa(mes.inicio, mes.fim),
      ]);

      const chaveS = chaveSemana(dateId);
      const chaveM = chaveMes(dateId);
      const lote = db.batch();
      lote.set(db.doc(`coaches/${uid}/volumeAgregado/${chaveS}`), consolidar(treinosSemana, 'semana', chaveS, semana, metasDoCoach));
      lote.set(db.doc(`coaches/${uid}/volumeAgregado/${chaveM}`), consolidar(treinosMes, 'mes', chaveM, mes, metasDoCoach));
      await lote.commit();

      logger.info('Volume consolidado.', { uid, semana: chaveS, mes: chaveM, treinosSemana: treinosSemana.length });
    } catch (e) {
      // Gatilho não tem usuário esperando: registrar e sair é melhor que
      // relançar, que faria o Functions repetir a mesma leitura pesada em loop.
      logger.error('Falha ao consolidar volume.', { uid, dateId, erro: String(e) });
    }
  },
);
