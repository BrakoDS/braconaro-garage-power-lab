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
  COLECOES_DO_ALUNO, diasFechadosAteHoje, idDoEventoDaFalta, idDoEventoDoFechamento, planoDaFaltaDaChamada, planoDasCaixas, planoDeDesfazerFalta, planoDoCreditoDeFechamento,
  planoDoPixNoServidor, type ColecaoDoAluno, type Escrita, type PlanoDoServidor, type RegrasDaGestao,
} from './caixas';
import { relogioDoBox, somarDias } from './presenca';

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
): Promise<{ alunos: number; pix: number; faltas: number; creditos: number }> {
  if (!servidorAplica((await db.doc(caminhoDoInterruptor(uid)).get()).data())) return { alunos: 0, pix: 0, faltas: 0, creditos: 0 };
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

  // As chamadas da Lousa de ontem e de hoje que o gatilho perdeu. Limitado de propósito: a chamada
  // fechada (ou refeita) há mais de um dia é com o gatilho, e o custo da varredura não cresce com o histórico.
  // A marca da versão aplicada deixa as já resolvidas passarem sem reler as fichas.
  const hoje = relogioDoBox(new Date(deps.agora())).hoje;
  let faltas = 0;
  for (const dia of [somarDias(hoje, -1), hoje]) {
    for (const d of (await db.collection(`lousa/${dia}/chamadas`).get()).docs) {
      try { faltas += (await aplicarFaltasDaChamada(db, uid, dia, d.id, deps)).faltas ?? 0; }
      catch (e) { deps.log.warn(`[chamada] ${dia} ${d.id}: não deu para aplicar agora — a próxima varredura tenta de novo.`, e); }
    }
  }
  let creditos = 0;
  try { creditos = (await aplicarCreditosDeFechamento(db, uid, deps)).creditos; }
  catch (e) { deps.log.warn('[fechamento] não deu para gerar os créditos agora — a próxima varredura tenta de novo.', e); }
  return { alunos, pix, faltas, creditos };
}

/* ================================================================== *
 * Etapa 2 · a falta da chamada da Lousa e o crédito de box fechado
 * ================================================================== */

const milis = (t: unknown): number => {
  const v = t as { toMillis?: () => number } | number | null | undefined;
  return typeof v === 'number' ? v : v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
};

/** A versão de uma chamada da Lousa: o `atualizadoEm` dela, em ms. Fechar de novo é outra versão. */
export const versaoDaChamada = (d: Dados | undefined): number => milis(d?.atualizadoEm) || milis(d?.fechadaEm);

/** O documento de uma chamada da Lousa (`lousa/{dia}/chamadas/{hora}`). */
export const caminhoDaChamada = (dia: string, hora: string) => `lousa/${dia}/chamadas/${hora}`;

/** A marca "esta versão da chamada já foi aplicada" (a varredura não relê as fichas por ela). */
const caminhoDaMarcaDaChamada = (uid: string, dia: string, hora: string) => `gestao/${uid}/chamadasAplicadas/${dia}_${hora.replace(/\W/g, '')}`;

/** Os dias de box fechado cujo crédito já foi gerado para todos (a varredura não relê as fichas por eles). */
const caminhoDaMarcaDoFechamento = (uid: string) => `gestao/${uid}/sistema/fechamento`;

/** As fichas do coach (a subcoleção) e a raiz da Gestão, lidas FORA de transação — só para escolher quem vale a transação. */
async function fichasEMetaDoCoach(db: Firestore, uid: string): Promise<{ meta: Dados; fichas: Dados[] }> {
  const meta = ((await db.doc(`gestao/${uid}`).get()).data() ?? {}) as Dados;
  const fichas = (await db.collection(`gestao/${uid}/alunos`).get()).docs.map((d) => ({ ...d.data(), id: d.id }) as Dados);
  return { meta, fichas };
}

export interface ResultadoDaChamada { aplicou: boolean; motivo?: string; faltas?: number; desfeitas?: number }

/** Os e-mails (normalizados) que a chamada lista, de qualquer jeito: presentes ou faltaram. */
export function emailsListadosNaChamada(chamada: Dados | null | undefined): Set<string> {
  const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return new Set([...lista(chamada?.presentes), ...lista(chamada?.faltaram)].map(normalizarEmail).filter(Boolean));
}

/**
 * A falta "não veio" de UM aluno da chamada, numa transação: relê o interruptor,
 * a chamada (o aluno ainda está em "faltaram"?), a ficha, os dias fechados e o
 * Registro da falta; grava só os campos que mudaram, o Registro e o Portal.
 * Devolve se gravou.
 */
async function aplicarFaltaDeUm(
  db: Firestore, uid: string, dia: string, hora: string, alunoId: string, email: string,
  { regras, agora }: { regras: RegrasDaGestao; agora: () => number },
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    if (!servidorAplica((await tx.get(db.doc(caminhoDoInterruptor(uid)))).data())) return false;
    const chamada = (await tx.get(db.doc(caminhoDaChamada(dia, hora)))).data();
    if (!chamada || !regras.emailsQueFaltaram(chamada).some((e) => normalizarEmail(e) === email)) return false;
    const fichaSnap = await tx.get(db.doc(`gestao/${uid}/alunos/${alunoId}`));
    if (!fichaSnap.exists) return false;
    const ficha = { ...fichaSnap.data(), id: fichaSnap.id } as Dados;
    const meta = ((await tx.get(db.doc(`gestao/${uid}`))).data() ?? {}) as Dados;
    // O Registro de id fixo (SEM a versão da chamada) é a lembrança de que esta chamada já gravou a falta
    // deste aluno nesta aula: se o coach a desfez à mão, fechar a chamada de novo não a põe de volta.
    if ((await tx.get(db.doc(`gestao/${uid}/eventos/${idDoEventoDaFalta(alunoId, dia, hora)}`))).exists) return false;
    const n = agora();
    const plano = planoDaFaltaDaChamada(regras, {
      ficha, dia, hora, hoje: relogioDoBox(new Date(n)).hoje, fechados: diasFechadosAteHoje(meta, '9999-12-31'), agora: n,
    });
    if (plano.acao === 'nada') return false;
    const portalRef = email ? db.doc(`portal/${email}`) : null;
    const portalExiste = portalRef ? (await tx.get(portalRef)).exists : false;
    gravarPlano(db, tx, uid, { fichaRef: db.doc(`gestao/${uid}/alunos/${alunoId}`), portalRef: portalExiste ? portalRef : null, plano });
    return true;
  });
}

/**
 * Tira a falta que a própria chamada gravou, de UM aluno que a chamada refeita não lista mais, numa
 * transação: relê o interruptor, a chamada (ele continua fora das duas listas?) e a ficha.
 */
async function desfazerFaltaDeUm(
  db: Firestore, uid: string, dia: string, hora: string, alunoId: string,
  { regras, agora }: { regras: RegrasDaGestao; agora: () => number },
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    if (!servidorAplica((await tx.get(db.doc(caminhoDoInterruptor(uid)))).data())) return false;
    const chamada = (await tx.get(db.doc(caminhoDaChamada(dia, hora)))).data();
    if (!chamada) return false;
    const fichaSnap = await tx.get(db.doc(`gestao/${uid}/alunos/${alunoId}`));
    if (!fichaSnap.exists) return false;
    const ficha = { ...fichaSnap.data(), id: fichaSnap.id } as Dados;
    const email = normalizarEmail(ficha.email);
    if (email && emailsListadosNaChamada(chamada).has(email)) return false; // voltou para a lista: quem decide é o "Veio" / a falta
    const plano = planoDeDesfazerFalta(regras, { ficha, dia, hora, versao: versaoDaChamada(chamada), agora: agora() });
    if (plano.acao === 'nada') return false;
    const portalRef = email ? db.doc(`portal/${email}`) : null;
    const portalExiste = portalRef ? (await tx.get(portalRef)).exists : false;
    gravarPlano(db, tx, uid, { fichaRef: db.doc(`gestao/${uid}/alunos/${alunoId}`), portalRef: portalExiste ? portalRef : null, plano });
    return true;
  });
}

/**
 * A chamada da Lousa de `dia` e `hora` grava a falta de quem ficou em "faltaram"
 * (o gatilho chama ao fechar, a varredura chama para as de hoje e ontem).
 *
 * Só com o interruptor em 'servidor'. Fora do dia certo não há risco: a regra
 * (`faltaDaChamada`) recusa quem avisou, quem já tem presença, quem não tinha
 * aula naquele horário e o dia de box fechado.
 *
 * A falta entra NO MÁXIMO UMA VEZ por aluno e aula (o Registro tem id fixo, sem a versão da
 * chamada): se o coach a tirou à mão, fechar de novo não a repõe. "Veio" corrige pelo check-in.
 * E quando a versão nova da chamada não lista mais o aluno (nem em "presentes", nem em
 * "faltaram": tirado da turma, ou "Cancelar aula" depois de fechar), a falta que a própria
 * Lousa gravou para aquela aula sai (`origem: 'lousa'`; a do coach nunca é tocada).
 *
 * A marca `chamadasAplicadas/{dia}_{hora}` guarda a versão aplicada: a varredura
 * seguinte pula a chamada sem reler as fichas. Fechar de novo grava outra versão
 * e a chamada é reavaliada inteira. Hoje, antes da hora da aula, a marca não é gravada
 * (a regra recusa a falta até a aula começar): a varredura tenta de novo depois.
 */
export async function aplicarFaltasDaChamada(
  db: Firestore, uid: string, dia: string, hora: string,
  deps: { regras: RegrasDaGestao; agora: () => number; log: Registro },
): Promise<ResultadoDaChamada> {
  const { regras, agora, log } = deps;
  if (!servidorAplica((await db.doc(caminhoDoInterruptor(uid)).get()).data())) return { aplicou: false, motivo: 'interruptor com a Gestão' };
  const chamada = (await db.doc(caminhoDaChamada(dia, hora)).get()).data();
  if (!chamada) return { aplicou: false, motivo: 'sem chamada' };
  const versao = versaoDaChamada(chamada);
  const emails = regras.emailsQueFaltaram(chamada).map(normalizarEmail).filter(Boolean);
  const marca = await db.doc(caminhoDaMarcaDaChamada(uid, dia, hora)).get();
  if (marca.exists && marca.data()?.versao === versao) return { aplicou: false, motivo: 'chamada já aplicada' };

  const { meta, fichas } = await fichasEMetaDoCoach(db, uid);
  const n = agora();
  const relogio = relogioDoBox(new Date(n));
  const hoje = relogio.hoje;
  const fechados = diasFechadosAteHoje(meta, '9999-12-31');
  let faltas = 0, desfeitas = 0;
  for (const { key, aluno } of regras.casarCaixasComFichas(emails, fichas).pares) {
    // A prévia sem transação só escolhe quem vale a transação; quem decide é a leitura dentro dela.
    const previa = planoDaFaltaDaChamada(regras, { ficha: aluno, dia, hora, hoje, fechados, agora: n });
    if (previa.acao === 'nada') continue;
    if (await aplicarFaltaDeUm(db, uid, dia, hora, String(aluno.id), normalizarEmail(key), deps)) faltas++;
  }
  // Quem a chamada refeita não lista mais: a falta que a própria Lousa gravou sai.
  const listados = emailsListadosNaChamada(chamada);
  for (const f of fichas) {
    const email = normalizarEmail(f.email);
    if (email && listados.has(email)) continue;
    if (planoDeDesfazerFalta(regras, { ficha: f, dia, hora, versao, agora: n }).acao === 'nada') continue;
    if (await desfazerFaltaDeUm(db, uid, dia, hora, String(f.id), deps)) desfeitas++;
  }
  const cedo = dia === hoje && relogio.agora < hora; // a regra recusa a falta até a aula começar
  if (!cedo) await db.doc(caminhoDaMarcaDaChamada(uid, dia, hora)).set({ versao, em: n, faltas, desfeitas });
  if (faltas || desfeitas) log.info('Chamada da Lousa aplicada pelo servidor.', { dia, hora, faltas, desfeitas });
  return { aplicou: faltas + desfeitas > 0, faltas, desfeitas };
}

/**
 * O crédito de reposição de UM aluno pelos dias de box fechado PENDENTES (os que a
 * varredura recebeu: depois do corte `desde` e ainda sem a marca de resolvido),
 * numa transação: relê a ficha e pula o dia cujo Registro (id fixo) já existe — se
 * o coach desfez o crédito à mão, ele não volta. Devolve quantos créditos gravou.
 */
async function aplicarCreditosDeUm(
  db: Firestore, uid: string, alunoId: string, pendentes: string[],
  { regras, agora }: { regras: RegrasDaGestao; agora: () => number },
): Promise<number> {
  return db.runTransaction(async (tx) => {
    if (!servidorAplica((await tx.get(db.doc(caminhoDoInterruptor(uid)))).data())) return 0;
    const fichaSnap = await tx.get(db.doc(`gestao/${uid}/alunos/${alunoId}`));
    if (!fichaSnap.exists) return 0;
    const ficha = { ...fichaSnap.data(), id: fichaSnap.id } as Dados;
    const n = agora();
    const hoje = relogioDoBox(new Date(n)).hoje;
    const dias: string[] = [];
    for (const dia of pendentes) {
      if (!(await tx.get(db.doc(`gestao/${uid}/eventos/${idDoEventoDoFechamento(alunoId, dia)}`))).exists) dias.push(dia);
    }
    if (!dias.length) return 0;
    const plano = planoDoCreditoDeFechamento(regras, { ficha, dias, hoje, agora: n });
    if (!plano.creditos) return 0;
    const email = normalizarEmail(ficha.email);
    const portalRef = email ? db.doc(`portal/${email}`) : null;
    const portalExiste = portalRef ? (await tx.get(portalRef)).exists : false;
    gravarPlano(db, tx, uid, { fichaRef: db.doc(`gestao/${uid}/alunos/${alunoId}`), portalRef: portalExiste ? portalRef : null, plano });
    return plano.creditos;
  });
}

/**
 * Dia de box fechado: +1 crédito de reposição a quem tinha aula titular
 * (`creditosDeFechamento` da Gestão), com a validade de sempre. Roda na
 * varredura, só com o interruptor em 'servidor'. Só os dias que já chegaram:
 * um fechamento marcado para a semana que vem não dá crédito adiantado.
 *
 * A trava da regra é `atestados[dia]`; o Registro de id fixo evita que o crédito
 * desfeito à mão volte; e a marca `sistema/fechamento` guarda os dias já
 * resolvidos, para a varredura não reler as fichas todo ciclo. Sem dia fechado
 * pendente, só o documento da Gestão é lido.
 */
export async function aplicarCreditosDeFechamento(
  db: Firestore, uid: string,
  deps: { regras: RegrasDaGestao; agora: () => number; log: Registro },
): Promise<{ alunos: number; creditos: number }> {
  const { regras, agora, log } = deps;
  if (!servidorAplica((await db.doc(caminhoDoInterruptor(uid)).get()).data())) return { alunos: 0, creditos: 0 };
  const n = agora();
  const hoje = relogioDoBox(new Date(n)).hoje;
  const meta = ((await db.doc(`gestao/${uid}`).get()).data() ?? {}) as Dados;
  const marca = (await db.doc(caminhoDaMarcaDoFechamento(uid)).get()).data();
  const resolvidos = (marca?.aplicados ?? {}) as Record<string, unknown>;
  // `desde`: o corte que o dono define sem deploy (sistema/fechamento.desde = 'AAAA-MM-DD'): dia fechado antes dele é ignorado.
  const dias = diasFechadosAteHoje(meta, hoje, typeof marca?.desde === 'string' ? marca.desde : null).filter((d) => !(d in resolvidos));
  if (!dias.length) return { alunos: 0, creditos: 0 };

  const { fichas } = await fichasEMetaDoCoach(db, uid);
  let alunos = 0, creditos = 0;
  for (const f of fichas) {
    // A prévia sem transação só escolhe quem vale a transação.
    if (!planoDoCreditoDeFechamento(regras, { ficha: f, dias, hoje, agora: n }).creditos) continue;
    const c = await aplicarCreditosDeUm(db, uid, String(f.id), dias, deps);
    if (c) { alunos++; creditos += c; }
  }
  await db.doc(caminhoDaMarcaDoFechamento(uid)).set({ aplicados: Object.fromEntries(dias.map((d) => [d, n])) }, { merge: true });
  if (creditos) log.info('Créditos de box fechado gerados pelo servidor.', { dias, alunos, creditos });
  return { alunos, creditos };
}
