/**
 * Pix dinâmico — as duas portas de verdade do `pix-servico.ts`: o Firestore
 * (Admin SDK) e a API do Mercado Pago. É a única parte do Pix que fala com
 * rede; a regra inteira está em `pix.ts` e `pix-servico.ts`.
 *
 * Caminhos:
 *   gestao/{uid}                         o meta da Gestão (ou o blob v1)
 *   gestao/{uid}/alunos/{id}             as fichas (v2)
 *   gestao/{uid}/cobrancasPix/{payment}  o livro-caixa do Pix — só o servidor
 *                                        cria e aprova; a Gestão do coach lê e
 *                                        marca `aplicadaEm` (regra {sub=**} do coach)
 *   portal/{email}                       a fatia do Portal — `pagamentos[mês]`
 */
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { COACH_UIDS, normalizarEmail } from './acesso';
import { ehGestaoV2 } from './gestao-leitura';
import type { CobrancaPix, Ficha, PedidoPix } from './pix';
import type { AlunoNaGestao, ClienteMp, RepoPix } from './pix-servico';

type Dados = Record<string, unknown>;

/**
 * Todas as fichas do coach — v2 (subcoleção) primeiro, e o array v1 do meta
 * para quem faltar (a mesma ordem de `fichasDaGestao`). O box inteiro é lido
 * porque a conta de um responsável soma os dependentes.
 */
async function fichasDoCoach(db: Firestore, uid: string): Promise<Ficha[]> {
  const raiz = db.doc(`gestao/${uid}`);
  const meta = await raiz.get().then((s) => (s.exists ? (s.data() ?? null) : null));
  const porId = new Map<string, Ficha>();
  if (ehGestaoV2(meta)) {
    for (const d of (await raiz.collection('alunos').get()).docs) porId.set(d.id, { ...(d.data() as Dados), id: d.id } as Ficha);
  }
  const legado = (meta as Dados | null)?.alunos;
  if (Array.isArray(legado)) {
    for (const a of legado) {
      if (!a || typeof a !== 'object' || (a as Dados).id == null) continue;
      const id = String((a as Dados).id);
      if (!porId.has(id)) porId.set(id, { ...(a as Dados), id } as Ficha);
    }
  }
  return [...porId.values()];
}

export function repoFirestore(db: Firestore): RepoPix {
  const cobrancas = (uid: string) => db.collection(`gestao/${uid}/cobrancasPix`);
  return {
    async alunoPorEmail(email): Promise<AlunoNaGestao | null> {
      for (const uid of COACH_UIDS) {
        const todos = await fichasDoCoach(db, uid);
        const ficha = todos.find((f) => normalizarEmail(f.email) === email);
        if (ficha) return { uid, ficha, todos };
      }
      return null;
    },
    async alunoPorId(uid, alunoId) {
      const todos = await fichasDoCoach(db, uid);
      const ficha = todos.find((f) => f.id === alunoId);
      return ficha ? { uid, ficha, todos } : null;
    },
    async cobrancasDoAluno(uid, alunoId) {
      // Igualdade num campo só: não pede índice composto (o projeto não publica índices).
      const q = await cobrancas(uid).where('alunoId', '==', alunoId).get();
      return q.docs.map((d) => d.data() as CobrancaPix);
    },
    async salvarCobranca(uid, c) {
      await cobrancas(uid).doc(c.paymentId).set(c);
    },
    async atualizarCobranca(uid, paymentId, campos) {
      await cobrancas(uid).doc(paymentId).update(campos);
    },
    async transicionar(uid, paymentId, fn) {
      const ref = cobrancas(uid).doc(paymentId);
      return db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return { existe: false, mudou: false };
        const patch = fn(s.data() as CobrancaPix);
        if (!patch) return { existe: true, mudou: false };
        tx.update(ref, patch);
        return { existe: true, mudou: true };
      });
    },
    async marcarPagoNoPortal(email, mesId) {
      const e = normalizarEmail(email);
      if (!e) return;
      try {
        // FieldPath: o mês tem hífen, e não pode virar caminho com ponto.
        await db.doc(`portal/${e}`).update(new FieldPath('pagamentos', mesId), true);
      } catch (err) {
        // Aluno sem Portal publicado: nada a marcar (code 5 = NOT_FOUND).
        if ((err as { code?: number }).code !== 5) throw err;
      }
    },
  };
}

/* ================================================================== *
 * Mercado Pago
 * ================================================================== */

const API_MP = 'https://api.mercadopago.com';
const TIMEOUT_MP_MS = 15_000;

/** Uma chamada à API do Mercado Pago. O erro diz o status e a mensagem dela — nunca o token. */
async function chamar(o: OpcoesMp, metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), o.timeoutMs);
  try {
    const r = await fetch(`${o.base}${caminho}`, {
      method: metodo,
      signal: controle.signal,
      headers: { Authorization: `Bearer ${o.token}`, 'Content-Type': 'application/json', ...extra },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    let json: Record<string, unknown> = {};
    try { json = texto ? JSON.parse(texto) : {}; } catch { /* corpo não-JSON: fica vazio */ }
    if (!r.ok) throw new Error(`Mercado Pago ${metodo} ${caminho.split('?')[0]} → ${r.status}: ${String(json.message ?? json.error ?? texto).slice(0, 200)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

interface OpcoesMp { token: string; base: string; timeoutMs: number }

/**
 * O cliente da API. `base` e `timeoutMs` só mudam nos testes (um Mercado Pago
 * falso local, em `checar-pix-http`); em produção é sempre a API oficial.
 */
export function clienteMercadoPago(token: string, teste: { base?: string; timeoutMs?: number } = {}): ClienteMp {
  const o: OpcoesMp = { token, base: teste.base ?? API_MP, timeoutMs: teste.timeoutMs ?? TIMEOUT_MP_MS };
  return {
    criarPix: (p: PedidoPix) => chamar(o, 'POST', '/v1/payments', p.corpo, { 'X-Idempotency-Key': p.chaveIdempotencia }),
    buscarPagamento: (id) => chamar(o, 'GET', `/v1/payments/${encodeURIComponent(id)}`),
    cancelarPagamento: async (id) => { await chamar(o, 'PUT', `/v1/payments/${encodeURIComponent(id)}`, { status: 'cancelled' }); },
  };
}
