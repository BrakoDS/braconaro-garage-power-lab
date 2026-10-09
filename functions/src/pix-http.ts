/**
 * Pix dinâmico — a borda HTTP das duas funções, fora do `index.ts` para ser
 * testada de verdade: o `checar-pix-http` sobe um Express (o mesmo par express
 * 4 + qs do runtime das Functions), faz POSTs reais e confere o que volta.
 *
 * O `index.ts` só registra: `onCall` → `executarGerarPix`, `onRequest` →
 * `responderWebhook`. Os segredos e o Firestore entram por `criarDeps`, chamado
 * só quando a requisição chega (o segredo só existe em tempo de execução).
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { ErroPix, gerarPix, processarWebhook, type ClienteMp, type Log, type RepoPix, type RespostaPix } from './pix-servico';

export interface DepsPix { repo: RepoPix; mp: ClienteMp; agora: number; ehCoach: (uid: string) => boolean; log: Log & { error(msg: string, extra?: object): void } }

/** O pedido do `onCall`, como o Firebase entrega (só o que usamos). */
export interface PedidoCallable { auth?: { uid?: string; token?: { email?: unknown } } | null; data?: unknown }

/**
 * `gerarPixCobranca`: o erro previsto vira `HttpsError` com a mensagem para o
 * aluno; o imprevisto vira `internal` genérico — o detalhe vai só para o log.
 */
export async function executarGerarPix(req: PedidoCallable, criarDeps: () => DepsPix): Promise<RespostaPix> {
  const d = (req.data ?? {}) as { alunoId?: unknown; mesId?: unknown };
  const deps = criarDeps();
  try {
    return await gerarPix({ uid: req.auth?.uid, email: req.auth?.token?.email, alunoId: d.alunoId, mesId: d.mesId }, deps);
  } catch (e) {
    if (e instanceof ErroPix) throw new HttpsError(e.codigo, e.message);
    deps.log.error('gerarPixCobranca falhou.', { erro: String((e as Error)?.message || e) });
    throw new HttpsError('internal', 'Não foi possível gerar o Pix agora.');
  }
}

/** O que o Express entrega e o que respondemos (só o que usamos). */
export interface ReqHttp { method: string; headers: Record<string, unknown>; query: Record<string, unknown>; body: unknown }
export interface ResHttp { status(codigo: number): { send(corpo: string): unknown } }

/**
 * `webhookMercadoPago`: só POST; 200/401 conforme `processarWebhook`; erro de
 * rede ou do Mercado Pago → 500, para o Mercado Pago reenviar mais tarde.
 */
export async function responderWebhook(req: ReqHttp, res: ResHttp, criarDeps: () => DepsPix & { segredo: string }): Promise<void> {
  if (req.method !== 'POST') { res.status(405).send('use POST'); return; }
  const deps = criarDeps();
  try {
    const r = await processarWebhook({ headers: req.headers, query: achatarQuery(req.query), corpo: req.body }, deps);
    res.status(r.status).send(r.resultado);
  } catch (e) {
    deps.log.error('webhookMercadoPago falhou.', { erro: String((e as Error)?.message || e) });
    res.status(500).send('erro ao processar');
  }
}

/**
 * `?data.id=123`: o qs do express 4 entrega a chave `data.id` como está. Se um
 * parser com pontos ligados entregar `{ data: { id } }`, a chave volta ao
 * formato que a regra lê — o id do pagamento não pode sumir no caminho.
 */
function achatarQuery(q: Record<string, unknown>): Record<string, unknown> {
  const data = q.data as { id?: unknown } | undefined;
  if (q['data.id'] === undefined && data && typeof data === 'object' && data.id !== undefined) return { ...q, 'data.id': data.id };
  return q;
}
