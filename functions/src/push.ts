/**
 * Push do chat: quando o coach responde, o celular do aluno recebe o aviso.
 *
 * O envio mora numa Cloud Function, e não na Central de Mensagens, porque a
 * API de push da Expo não responde ao preflight de CORS — o navegador recusa o
 * POST antes de ele sair. Aqui, de quebra, o coach não precisa de permissão para
 * ler `alunos/{email}`: quem lê o token é o Admin SDK.
 *
 * Este módulo é só a regra, sem rede, para o `checar.ts` provar.
 */

export const URL_PUSH_EXPO = 'https://exp.host/--/api/v2/push/send';

export const TITULO_PUSH = 'Coach - Garage Power Lab';

/** `ExponentPushToken[...]` — e a grafia antiga `ExpoPushToken[...]`, que a Expo ainda aceita. */
export function ehTokenExpo(v: unknown): v is string {
  return typeof v === 'string' && /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(v);
}

/** O token gravado pelo app em `alunos/{email}`, ou '' se não há um que preste. */
export function tokenDoAluno(doc: unknown): string {
  const t = (doc as { expoPushToken?: unknown } | null | undefined)?.expoPushToken;
  const limpo = typeof t === 'string' ? t.trim() : t;
  return ehTokenExpo(limpo) ? limpo : '';
}

/** Só a mensagem do coach, com texto, vira push — a do aluno não avisa o próprio aluno. */
export function textoParaNotificar(mensagem: unknown): string {
  const m = mensagem as { remetente?: unknown; texto?: unknown } | null | undefined;
  if (m?.remetente !== 'coach' || typeof m.texto !== 'string') return '';
  return m.texto.trim();
}

export interface PayloadPush {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: { tipo: 'chat' };
}

export function payloadDoPush(token: string, texto: string): PayloadPush {
  return { to: token, sound: 'default', title: TITULO_PUSH, body: texto, data: { tipo: 'chat' } };
}

/**
 * O que a Expo respondeu, em uma palavra para o log. A Expo devolve 200 mesmo
 * quando recusa o token: o erro vem dentro de `data`.
 */
export function lerRespostaExpo(corpo: unknown): { ok: boolean; erro: string } {
  const data = (corpo as { data?: unknown } | null | undefined)?.data;
  const ticket = (Array.isArray(data) ? data[0] : data) as
    { status?: unknown; message?: unknown; details?: { error?: unknown } } | undefined;
  if (ticket?.status === 'ok') return { ok: true, erro: '' };
  const erro = ticket?.details?.error ?? ticket?.message
    ?? (corpo as { errors?: { code?: unknown }[] } | null | undefined)?.errors?.[0]?.code;
  return { ok: false, erro: typeof erro === 'string' && erro ? erro : 'resposta-inesperada' };
}
