/**
 * Criação da conta de login do aluno, pela Gestão.
 *
 * Desde 22/09/2026 o cadastro público do Firebase Auth está desligado: nenhum
 * navegador cria conta. Só o Admin SDK cria, e ele roda aqui, atrás de três
 * travas que ficam neste módulo para o `checar.ts` provar sem rede:
 *
 *  1. quem chama é o coach, pelo UID — a MESMA lista do `ehCoach()` das
 *     regras (o `checar.ts` confere que as duas não se desencontram);
 *  2. o e-mail é de um aluno da Gestão DESSE coach — a função não cria conta
 *     para um endereço qualquer, mesmo que o coach digite errado;
 *  3. conta que já existe não é tocada: nem senha, nem nome, nem verificação.
 *     O que volta é só um link novo para o aluno (re)definir a senha.
 */

/** UIDs de coach. Igual ao `ehCoach()` de firestore.rules e storage.rules. */
export const COACH_UIDS: readonly string[] = ['G6gfpahorCfptVxOM26sCjxMOqb2'];

export function ehCoachPorUid(uid: unknown): boolean {
  return typeof uid === 'string' && COACH_UIDS.includes(uid);
}

/**
 * E-mail normalizado como a Gestão e as regras o usam (id dos documentos), ou ''
 * quando não parece e-mail. Não é validação de RFC: é o bastante para recusar
 * lixo antes de gastar uma chamada ao Auth.
 */
export function normalizarEmail(v: unknown): string {
  if (typeof v !== 'string') return '';
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

export interface AlunoDaGestao {
  id: string;
  nome: string;
}

/**
 * O aluno com este e-mail dentro do documento `gestao/{uid}`, ou null.
 *
 * Aluno inativo também serve: é o coach que decide reativar alguém, e travar
 * aqui só obrigaria a mudar o status antes de mandar o acesso.
 */
export function alunoDaGestao(doc: unknown, email: string): AlunoDaGestao | null {
  const alunos = (doc as { alunos?: unknown } | null)?.alunos;
  if (!email || !Array.isArray(alunos)) return null;
  for (const a of alunos) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    if (normalizarEmail(r.email) === email) {
      return { id: String(r.id ?? ''), nome: typeof r.nome === 'string' ? r.nome.trim() : '' };
    }
  }
  return null;
}
