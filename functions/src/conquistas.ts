/**
 * Motor de conquistas — a parte pura (sem Firestore), para o `checar-conquistas`
 * provar sem rede. Os gatilhos que leem e gravam ficam no `index.ts`.
 *
 * Entrada: os documentos do aluno que alimentam as medalhas, crus como estão
 * no Firestore. Saída: o que vai para `conquistas_aluno/{email}`.
 *
 * Quem decide se uma medalha foi conquistada é o `medalhas()` de
 * `gamificacao.ts` — a MESMA regra do app e do site. Aqui só se monta o
 * contexto, se acumula o histórico e se soma o XP.
 */
import {
  contadores, diasTreino, maxCaloriasSemana, maxCaloriasTreino, medalhas, mesesDesde, streakSemanas,
  type ContextoMedalhas, type Gasto,
} from './gamificacao';

/**
 * XP de cada medalha. É o `xpReward` do `ACHIEVEMENTS_CATALOG` do Portal
 * (`portal-aluno-web/src/lib/achievementsCatalog.ts`): o Portal mostra "+300 XP"
 * no card, e o saldo gravado aqui precisa bater. `checar-conquistas` confere os
 * dois e confere que toda medalha de `medalhas()` tem valor aqui.
 */
export const XP_POR_MEDALHA: Readonly<Record<string, number>> = {
  appPrimeiraVez: 50,
  primeiro: 50,
  aval1: 100,
  mes1: 100,
  mes3: 200,
  mes6: 400,
  mes12: 1000,
  cal500: 150,
  cal1000: 400,
  sem1000: 150,
  sem2000: 300,
  sem3000: 500,
  agua: 150,
  acucar: 200,
  desafio1: 150,
  desafio5: 500,
  semana3: 100,
  semana5: 200,
  mes10: 200,
  streak4: 300,
  streak8: 600,
  treinos50: 500,
  treinos100: 1000,
  aval3: 300,
  fb1: 50,
  fb10: 300,
};

type Doc = Record<string, unknown> | undefined;

/** Os documentos do aluno que entram no cálculo (ausente = `undefined`). */
export interface DocsDoAluno {
  /** `portal/{email}`: presenças, avaliações, criadoEm, pagamentos, feedbacksCount. */
  portal?: Doc;
  /** `gastoTreinos/{email}`: treinos lançados (datas e calorias). */
  gastoTreinos?: Doc;
  /** `desafios/{email}`: desafios concluídos. */
  desafios?: Doc;
  /** `rotinas/{email}`: `primeiroAcessoApp` (medalha exclusiva do app). */
  rotinas?: Doc;
}

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objeto = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function numero(v: unknown): number | null {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** `criadoEm` em ms. Aceita número (o que a Gestão grava hoje) e Timestamp do Firestore. */
function emMs(v: unknown): number | null {
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return numero(v);
}

/* ---------- Marco zero do lançamento ---------- */

/**
 * Data de corte da gamificação: o lançamento oficial, 01/10/2026. O que
 * aconteceu antes não conta para medalha nem XP (com duas exceções, abaixo).
 *
 * É data de CALENDÁRIO do box, no mesmo formato 'YYYY-MM-DD' que presenças,
 * treinos e avaliações já usam — e não meia-noite UTC, que em São Paulo ainda
 * seria 30/09 às 21h. Comparar as strings é comparar os dias.
 */
export const DATA_DE_CORTE = '2026-10-01';

/** Mês de corte, no formato das chaves de `portal.pagamentos` ('YYYY-MM'). */
const MES_DE_CORTE = DATA_DE_CORTE.slice(0, 7);

/**
 * O mesmo corte como instante: 00:00 de 01/10/2026 em São Paulo (UTC-3; o
 * Brasil não tem horário de verão desde 2019). Serve aos campos em ms
 * (`criadoEm`, `concluidos[].em`) e ao `ultimaAtualizacao` gravado.
 */
export const INICIO_DO_MARCO_ZERO_MS = Date.parse(`${DATA_DE_CORTE}T00:00:00-03:00`);

const aPartirDoCorte = (data: unknown): boolean => typeof data === 'string' && data >= DATA_DE_CORTE;

/**
 * O contexto do `medalhas()`, montado como o site (`painel-do-aluno/app.js`) e
 * o app (`ConquistasScreen`) montam — mas só com o que aconteceu a partir do
 * MARCO ZERO. A regra das medalhas (`gamificacao.ts`) não muda: quem filtra é
 * esta função, nos dados de entrada. Assim a cópia continua idêntica ao
 * original do site, e o `checar-conquistas` segue provando a paridade.
 *
 * - Presenças e treinos lançados: só dias >= corte (frequência, streak, total,
 *   calorias por treino e por semana).
 * - Desafios: só os concluídos a partir do corte.
 * - Meses de casa: contam a partir do corte (ou da entrada, se depois). Das duas
 *   réguas que existiam — tempo desde a entrada (app) e meses pagos (site) —
 *   vale a maior, cada uma recortada no marco zero.
 * - EXCEÇÃO "1ª vez no app": vale o primeiro acesso de qualquer data.
 * - EXCEÇÃO "1ª avaliação": quem tem QUALQUER avaliação mantém a medalha de
 *   primeira avaliação; para as seguintes ("3 avaliações") só contam as feitas
 *   a partir do corte.
 * - Feedbacks: `feedbacksCount` é só um contador, sem datas — não há como
 *   recortá-lo. Por ora entra como está (ver o README das functions).
 */
export function contextoDoAluno(docs: DocsDoAluno): ContextoMedalhas {
  const portal = objeto(docs.portal);
  const presencas = lista(portal.presencas).filter((d): d is string => aPartirDoCorte(d));
  const gastos = (lista(objeto(docs.gastoTreinos).gastos).filter(ehObjeto) as Gasto[])
    .filter((g) => aPartirDoCorte(g.data));
  const dias = diasTreino(presencas, gastos);
  const c = contadores(dias);

  // `em` (ms) é quando o aluno concluiu; desafio antigo sem `em` cai para a semana dele.
  const concluidos = lista(objeto(docs.desafios).concluidos).filter(ehObjeto).filter((x) => {
    const em = emMs(x.em);
    return em !== null ? em >= INICIO_DO_MARCO_ZERO_MS : aPartirDoCorte(x.semana);
  });

  const inicioDaCasa = Math.max(emMs(portal.criadoEm) ?? 0, INICIO_DO_MARCO_ZERO_MS);
  const mesesPagos = Object.entries(objeto(portal.pagamentos))
    .filter(([mes, pago]) => mes >= MES_DE_CORTE && Boolean(pago)).length;

  const avaliacoes = lista(portal.avaliacoes).map(objeto).filter((a) => typeof a.dataRealizada === 'string');
  const avaliacoesNovas = avaliacoes.filter((a) => aPartirDoCorte(a.dataRealizada)).length;

  return {
    total: c.total,
    mes: c.mes,
    semana: c.semana,
    streak: streakSemanas(dias),
    // Exceção da 1ª avaliação: qualquer histórico vale 1; as demais só a partir do corte.
    nAvaliacoes: Math.max(avaliacoesNovas, avaliacoes.length > 0 ? 1 : 0),
    desafios: concluidos.length,
    desAgua: concluidos.filter((x) => x.categoria === 'agua').length,
    desAcucar: concluidos.filter((x) => x.categoria === 'acucar').length,
    meses: Math.max(mesesDesde(inicioDaCasa), mesesPagos),
    calMaxTreino: maxCaloriasTreino(gastos),
    calMaxSemana: maxCaloriasSemana(gastos),
    feedbacks: numero(portal.feedbacksCount) ?? 0,
    // Exceção do 1º acesso ao app: vale de qualquer data.
    usouApp: Boolean(objeto(docs.rotinas).primeiroAcessoApp),
  };
}

/**
 * As medalhas já gravadas que continuam valendo: só as de um documento gravado
 * a partir do marco zero. Um `conquistas_aluno` de antes do lançamento (teste
 * manual, concessão antiga) é ignorado, e o próximo cálculo o reescreve do zero
 * — sem isso, o acúmulo ("medalha não se perde") carregaria o pré-lançamento
 * para sempre. Documento sem `ultimaAtualizacao` legível conta como antigo.
 */
export function desbloqueiosValidos(gravado: Doc): string[] {
  const atual = objeto(gravado);
  const quando = typeof atual.ultimaAtualizacao === 'string' ? Date.parse(atual.ultimaAtualizacao) : NaN;
  if (!(quando >= INICIO_DO_MARCO_ZERO_MS)) return [];
  return lista(atual.conquistasDesbloqueadas).filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export interface ResultadoConquistas {
  conquistasDesbloqueadas: string[];
  xpAtual: number;
}

/**
 * Junta o que o aluno já tinha com o que ele merece agora.
 *
 * Medalha conquistada NÃO se perde: várias regras olham para a janela atual
 * ("5 treinos numa semana", "4 semanas seguidas") e deixariam de valer na
 * semana seguinte. Ids já gravados que o `medalhas()` não conhece (concedidos à
 * mão pelo coach, por exemplo) também ficam; só não somam XP.
 *
 * O XP é sempre DERIVADO das medalhas: para dar XP a alguém, conceda a medalha.
 *
 * `gravado` é o `conquistas_aluno/{email}` atual; o que ele tem de antes do
 * marco zero é descartado (`desbloqueiosValidos`).
 */
export function calcularConquistas(ctx: ContextoMedalhas, gravado: Doc): ResultadoConquistas {
  const todas = medalhas(ctx);
  const ordem = todas.map((m) => m.id);
  const conjunto = new Set([...desbloqueiosValidos(gravado), ...todas.filter((m) => m.ok).map((m) => m.id)]);
  // Ordem estável (a do catálogo; desconhecidas no fim, em ordem alfabética):
  // assim "não mudou nada" é comparação direta e o documento não é regravado à toa.
  const conquistasDesbloqueadas = [
    ...ordem.filter((id) => conjunto.has(id)),
    ...[...conjunto].filter((id) => !ordem.includes(id)).sort(),
  ];
  const xpAtual = conquistasDesbloqueadas.reduce((soma, id) => soma + (XP_POR_MEDALHA[id] ?? 0), 0);
  return { conquistasDesbloqueadas, xpAtual };
}

/** O documento gravado já está igual ao resultado? Evita regravar (e mexer no `ultimaAtualizacao`) à toa. */
export function mudou(gravado: Doc, resultado: ResultadoConquistas): boolean {
  const atual = objeto(gravado);
  return atual.xpAtual !== resultado.xpAtual
    || JSON.stringify(lista(atual.conquistasDesbloqueadas)) !== JSON.stringify(resultado.conquistasDesbloqueadas);
}

/** Fuso do box. As regras usam a data LOCAL (semana, mês, streak), e a função roda em UTC. */
export const FUSO_DO_BOX = 'America/Sao_Paulo';

/**
 * Roda `calculo` no fuso do box e devolve o fuso anterior em seguida.
 *
 * Precisa ser SÍNCRONO (sem `await` dentro): o `process.env.TZ` vale para o
 * processo inteiro, e uma instância atende várias execuções ao mesmo tempo. Sem
 * pausa no meio, nenhuma outra função roda enquanto o fuso está trocado.
 */
export function noFusoDoBox<T>(calculo: () => T): T {
  const anterior = process.env.TZ;
  process.env.TZ = FUSO_DO_BOX;
  try {
    return calculo();
  } finally {
    if (anterior === undefined) delete process.env.TZ;
    else process.env.TZ = anterior;
  }
}
