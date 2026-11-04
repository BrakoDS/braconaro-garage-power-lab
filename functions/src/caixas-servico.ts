/**
 * As caixas aplicadas pelo servidor — a parte que fala com o Firestore
 * (Fase 1 · etapa 1). A regra está em `caixas.ts` (que roda os arquivos da
 * Gestão); aqui, a transação.
 *
 * Cada aplicação é UMA transação, por aluno (ou por Pix):
 *   1. lê o interruptor (`gestao/{uid}/sistema/caixas`) — sem 'servidor', não
 *      faz nada (quem aplica é a Gestão);
 *   2. lê as fichas do coach (a ficha do aluno e, para o Pix, as dos dependentes)
 *      e as caixas daquele aluno;
 *   3. grava na ficha SÓ os campos que mudaram, com o carimbo `atualizadoEm`;
 *   4. tira das caixas os itens consumidos;
 *   5. grava as linhas dos Registros (id fixo na Gestão; aqui, por rodada);
 *   6. atualiza os mesmos campos em `portal/{email}`, se o aluno tem Portal.
 *
 * Duas aplicações ao mesmo tempo (o gatilho e a varredura) não aplicam duas
 * vezes: o Firestore refaz a transação que perdeu a corrida, e na segunda
 * leitura os itens já saíram da caixa.
 */
import { FieldPath, FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { normalizarEmail } from './acesso';
import {
  COLECOES_DO_ALUNO, planoDasCaixas, planoDoPixNoServidor, type ColecaoDoAluno, type Escrita, type PlanoDoServidor, type RegrasDaGestao,
} from './caixas';

type Dados = Record<string, unknown>;

/** O documento do interruptor. */
export const caminhoDoInterruptor = (uid: string) => `gestao/${uid}/sistema/caixas`;

/** 'servidor' liga a aplicação aqui; qualquer outra coisa (ou nada) deixa com a Gestão. */
export function servidorAplica(dados: unknown): boolean {
  return !!dados && typeof dados === 'object' && (dados as Dados).aplicador === 'servidor';
}

export interface Registro { info(msg: string, extra?: unknown): void; warn(msg: string, extra?: unknown): void }

export interface ResultadoDaAplicacao {
  aplicou: boolean;
  motivo?: string;
  escritas?: number;
  eventos?: number;
  consumidos?: number;
}

/** Os pares (campo, valor) do `update` do Admin SDK, com o carimbo no fim. */
function paresDoUpdate(escritas: Escrita[]): unknown[] {
  const pares: unknown[] = [];
  for (const e of escritas) pares.push(new FieldPath(...e.caminho), e.apagar ? FieldValue.delete() : e.valor);
  pares.push(new FieldPath('atualizadoEm'), FieldValue.serverTimestamp());
  return pares;
}

function update(tx: Transaction, ref: DocumentReference, pares: unknown[]): void {
  const [campo, valor, ...resto] = pares;
  (tx.update as (r: DocumentReference, c: unknown, v: unknown, ...m: unknown[]) => Transaction)(ref, campo, valor, ...resto);
}

/** Grava o plano: ficha, caixas, Registros e Portal. Só escritas — as leituras vêm antes. */
function gravarPlano(
  db: Firestore, tx: Transaction, uid: string,
  { fichaRef, portalRef, plano, caixaRefs }: { fichaRef: DocumentReference; portalRef: DocumentReference | null; plano: PlanoDoServidor; caixaRefs?: Partial<Record<ColecaoDoAluno, DocumentReference>> },
): number {
  if (plano.escritas.length) update(tx, fichaRef, paresDoUpdate(plano.escritas));
  let consumidos = 0;
  for (const [colecao, chaves] of Object.entries(plano.consumir) as [ColecaoDoAluno, string[]][]) {
    const ref = caixaRefs && caixaRefs[colecao];
    if (!ref || !chaves.length) continue;
    update(tx, ref, chaves.flatMap((k) => [new FieldPath('itens', k), FieldValue.delete()]));
    consumidos += chaves.length;
  }
  for (const ev of plano.eventos) tx.set(db.doc(`gestao/${uid}/eventos/${String(ev.id)}`), ev);
  if (portalRef && Object.keys(plano.portal).length) tx.update(portalRef, plano.portal);
  return consumidos;
}

/**
 * Aplica as caixas de UM aluno (o e-mail é o id do documento da caixa, como o
 * aparelho gravou). Caixa sem ficha fica intacta, como na Gestão.
 */
export async function aplicarCaixasDoAluno(
  db: Firestore, uid: string, idDaCaixa: string,
  { regras, agora, log }: { regras: RegrasDaGestao; agora: () => number; log: Registro },
): Promise<ResultadoDaAplicacao> {
  const r = await db.runTransaction(async (tx) => {
    const interruptor = await tx.get(db.doc(caminhoDoInterruptor(uid)));
    if (!servidorAplica(interruptor.data())) return { aplicou: false, motivo: 'interruptor com a Gestão' } as ResultadoDaAplicacao & { ignorados?: PlanoDoServidor['ignorados'] };

    const caixaRefs = Object.fromEntries(COLECOES_DO_ALUNO.map((c) => [c, db.doc(`${c}/${idDaCaixa}`)])) as Record<ColecaoDoAluno, DocumentReference>;
    const caixasLidas = await Promise.all(COLECOES_DO_ALUNO.map((c) => tx.get(caixaRefs[c])));
    const caixas = Object.fromEntries(COLECOES_DO_ALUNO.map((c, i) => [c, caixasLidas[i].exists ? caixasLidas[i].data() : undefined]));
    if (!Object.values(caixas).some((d) => d && d.itens && Object.keys(d.itens).length)) return { aplicou: false, motivo: 'caixas vazias' };

    const fichas = (await tx.get(db.collection(`gestao/${uid}/alunos`))).docs.map((d) => ({ ...d.data(), id: d.id }));
    const par = regras.casarCaixasComFichas([idDaCaixa], fichas).pares[0];
    if (!par) return { aplicou: false, motivo: 'sem ficha com este e-mail' };
    const ficha = par.aluno;
    const plano = planoDasCaixas(regras, { ficha, caixas, coachUid: uid, agora: agora() });
    if (!plano.escritas.length && !plano.eventos.length && !Object.keys(plano.consumir).length) return { aplicou: false, motivo: 'nada deste coach' };

    const email = normalizarEmail(ficha.email);
    const portalRef = email ? db.doc(`portal/${email}`) : null;
    const portalExiste = portalRef ? (await tx.get(portalRef)).exists : false;
    const consumidos = gravarPlano(db, tx, uid, {
      fichaRef: db.doc(`gestao/${uid}/alunos/${String(ficha.id)}`), portalRef: portalExiste ? portalRef : null, plano, caixaRefs,
    });
    return { aplicou: true, escritas: plano.escritas.length, eventos: plano.eventos.length, consumidos, ignorados: plano.ignorados };
  });
  const { ignorados, ...resultado } = r as ResultadoDaAplicacao & { ignorados?: PlanoDoServidor['ignorados'] };
  for (const i of ignorados || []) log.warn(`[caixas] ${idDaCaixa} ${i.colecao} ${i.chave}: ignorado — ${i.motivo}`);
  if (resultado.aplicou) log.info('Caixas aplicadas pelo servidor.', { caixa: idDaCaixa, ...resultado });
  return resultado;
}

/**
 * Aplica um Pix do livro-caixa (`gestao/{uid}/cobrancasPix/{paymentId}` com
 * `avisarGestao`): a baixa do mês, ou o aviso. Depois desliga a bandeira, como
 * a Gestão fazia (`marcarPixTratado`).
 */
export async function aplicarPixDaCobranca(
  db: Firestore, uid: string, paymentId: string,
  { regras, agora, log }: { regras: RegrasDaGestao; agora: () => number; log: Registro },
): Promise<ResultadoDaAplicacao> {
  const r = await db.runTransaction(async (tx): Promise<ResultadoDaAplicacao> => {
    const interruptor = await tx.get(db.doc(caminhoDoInterruptor(uid)));
    if (!servidorAplica(interruptor.data())) return { aplicou: false, motivo: 'interruptor com a Gestão' };
    const cobRef = db.doc(`gestao/${uid}/cobrancasPix/${paymentId}`);
    const cob = await tx.get(cobRef);
    const c = cob.data();
    if (!c || c.avisarGestao !== true) return { aplicou: false, motivo: 'nada a tratar' };

    const fichas = (await tx.get(db.collection(`gestao/${uid}/alunos`))).docs.map((d) => ({ ...d.data(), id: d.id }));
    const ficha = fichas.find((f) => f.id === String(c.alunoId)) || null;
    const n = agora();
    const plano = planoDoPixNoServidor(regras, { cobranca: { ...c, paymentId }, ficha, todos: fichas, agora: n });
    const email = ficha ? normalizarEmail((ficha as Dados).email) : '';
    const portalRef = email ? db.doc(`portal/${email}`) : null;
    const portalExiste = portalRef ? (await tx.get(portalRef)).exists : false;
    if (ficha) {
      gravarPlano(db, tx, uid, { fichaRef: db.doc(`gestao/${uid}/alunos/${String(ficha.id)}`), portalRef: portalExiste ? portalRef : null, plano });
    }
    tx.update(cobRef, { avisarGestao: false, aplicadaEm: n });
    return { aplicou: plano.acao !== 'nada', motivo: plano.acao === 'nada' ? plano.motivo : plano.acao, escritas: plano.escritas.length, eventos: plano.eventos.length };
  });
  if (r.aplicou) log.info('Pix aplicado pelo servidor.', { paymentId, ...r });
  else if (r.motivo === 'sem ficha' || r.motivo === 'aluno não existe mais na Gestão') log.warn('[caixas] Pix de um aluno que não está mais na Gestão.', { paymentId });
  return r;
}

/**
 * A varredura (rede de segurança dos gatilhos): aplica o que estiver nas caixas
 * e os Pix com `avisarGestao`. Sem o interruptor em 'servidor', não lê nada além
 * dele.
 */
export async function aplicarTudoQueEstiverPendente(
  db: Firestore, uid: string,
  deps: { regras: RegrasDaGestao; agora: () => number; log: Registro },
): Promise<{ alunos: number; pix: number }> {
  if (!servidorAplica((await db.doc(caminhoDoInterruptor(uid)).get()).data())) return { alunos: 0, pix: 0 };
  const ids = new Set<string>();
  for (const c of COLECOES_DO_ALUNO) {
    for (const d of (await db.collection(c).get()).docs) {
      const itens = (d.data() || {}).itens;
      if (itens && typeof itens === 'object' && Object.values(itens).some((v) => v && (v as Dados).coachUid === uid)) ids.add(d.id);
    }
  }
  let alunos = 0;
  for (const id of ids) if ((await aplicarCaixasDoAluno(db, uid, id, deps)).aplicou) alunos++;
  // Igualdade num campo só: não pede índice composto (o projeto não publica índices).
  const pendentes = await db.collection(`gestao/${uid}/cobrancasPix`).where('avisarGestao', '==', true).get();
  let pix = 0;
  for (const d of pendentes.docs) if ((await aplicarPixDaCobranca(db, uid, d.id, deps)).aplicou) pix++;
  return { alunos, pix };
}
