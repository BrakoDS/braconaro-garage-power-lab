/**
 * Leitura da Gestão de Alunos nas DUAS formas, durante a migração.
 *
 *   v1: gestao/{uid} = { seq, alunos[], produtos, feriados }      (blob único)
 *   v2: gestao/{uid} = { schema: 2, seq, produtos, feriados }     (meta)
 *       gestao/{uid}/alunos/{alunoId}                             (uma ficha por doc)
 *
 * O blob v1 está chegando perto do teto de 1 MB do Firestore e vai ser
 * desmembrado (docs/superpowers/specs/2026-10-06-refatoracao-gestao-design.md).
 * As funções sobem ANTES do cliente que migra, então precisam entender os dois
 * formatos — e cair no v1 sozinhas enquanto a migração não virou a chave.
 *
 * A ordem da decisão importa: a subcoleção só é consultada quando o meta diz
 * `schema: 2`. Durante a cópia, ela existe pela metade; até a virada, quem fala
 * a verdade é o array. Depois da virada o array sai do meta, e o fallback vira
 * um no-op — ele continua aqui para a ficha que, por qualquer motivo, a cópia
 * não levou.
 *
 * A regra fica atrás de `FonteGestao` para o `checar.ts` provar os casos sem
 * rede; `fonteFirestore` é a única parte que fala com o banco.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { alunoDaGestao, normalizarEmail, type AlunoDaGestao } from './acesso';

/** Valor de `schema` no meta quando os alunos já moram na subcoleção. */
export const SCHEMA_GESTAO_V2 = 2;

/**
 * Campo da ficha v2 com o e-mail normalizado (`normalizarEmail`). É por ele que
 * o servidor acha o aluno — consulta de igualdade no Firestore diferencia
 * maiúscula, e o `email` da ficha é o que o coach digitou. O cliente v2 grava os
 * dois.
 */
export const CAMPO_EMAIL_NORM = 'emailNorm';

type Dados = Record<string, unknown>;

export interface FonteGestao {
  /** O documento raiz `gestao/{uid}` (blob na v1, meta na v2), ou null. */
  meta(): Promise<Dados | null>;
  /** A ficha da subcoleção cujo `emailNorm` é este e-mail, ou null. */
  fichaPorEmail(email: string): Promise<{ id: string; dados: Dados } | null>;
  /** As fichas da subcoleção com estes ids. As que não existem ficam de fora. */
  fichasPorId(ids: string[]): Promise<Map<string, Dados>>;
}

export function ehGestaoV2(meta: unknown): boolean {
  return !!meta && typeof meta === 'object' && (meta as Dados).schema === SCHEMA_GESTAO_V2;
}

/**
 * Serve de id de documento? Sem `/` (que desceria para outra coleção — um id
 * "001/avaliacoes/3" leria uma avaliação no lugar da ficha), sem `.`/`..` e sem
 * o formato reservado `__x__`. Id que não serve simplesmente não é procurado na v2.
 */
export function ehIdDeDoc(id: string): boolean {
  return !!id && id.length <= 1500 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
}

/**
 * O aluno com este e-mail na Gestão do coach, ou null — v2 primeiro, v1 depois.
 *
 * Mesmo contrato do `alunoDaGestao` (acesso.ts): aluno inativo também conta.
 */
export async function acharAlunoDaGestao(fonte: FonteGestao, email: string): Promise<AlunoDaGestao | null> {
  const e = normalizarEmail(email);
  if (!e) return null;
  const meta = await fonte.meta();
  if (ehGestaoV2(meta)) {
    const f = await fonte.fichaPorEmail(e);
    if (f) return { id: f.id, nome: typeof f.dados.nome === 'string' ? f.dados.nome.trim() : '' };
  }
  return alunoDaGestao(meta, e);
}

/**
 * As fichas destes alunos, por id — v2 primeiro, e o array v1 para quem faltar.
 *
 * Só os ids pedidos entram no mapa. No v1, aluno repetido no array fica com a
 * ÚLTIMA ocorrência, como o `new Map(alunos.map(...))` que esta função substitui.
 */
export async function fichasDaGestao(fonte: FonteGestao, ids: string[]): Promise<Map<string, Dados>> {
  const pedidos = new Set(ids.filter((id) => typeof id === 'string' && id));
  const meta = await fonte.meta();
  const porId = new Map<string, Dados>();

  const naV2 = [...pedidos].filter(ehIdDeDoc);
  if (ehGestaoV2(meta) && naV2.length) {
    for (const [id, dados] of await fonte.fichasPorId(naV2)) {
      if (pedidos.has(id)) porId.set(id, { ...dados, id });
    }
  }

  const achadosNaV2 = new Set(porId.keys());
  const legado = meta?.alunos;
  if (Array.isArray(legado)) {
    for (const a of legado) {
      if (!a || typeof a !== 'object' || (a as Dados).id == null) continue;
      const id = String((a as Dados).id);
      if (pedidos.has(id) && !achadosNaV2.has(id)) porId.set(id, a as Dados);
    }
  }
  return porId;
}

/**
 * A `FonteGestao` de verdade, sobre o Firestore do Admin SDK. O meta é lido uma
 * vez só por fonte, mesmo que as duas buscas acima o peçam.
 */
export function fonteFirestore(db: Firestore, uid: string): FonteGestao {
  const raiz = db.doc(`gestao/${uid}`);
  const fichas = raiz.collection('alunos');
  let meta: Promise<Dados | null> | null = null;
  return {
    meta: () => (meta ??= raiz.get().then((s) => (s.exists ? (s.data() ?? null) : null))),
    async fichaPorEmail(email) {
      const q = await fichas.where(CAMPO_EMAIL_NORM, '==', email).limit(1).get();
      const d = q.docs[0];
      return d ? { id: d.id, dados: d.data() } : null;
    },
    async fichasPorId(ids) {
      if (!ids.length) return new Map();
      const snaps = await db.getAll(...ids.map((id) => fichas.doc(id)));
      return new Map(snaps.filter((s) => s.exists).map((s): [string, Dados] => [s.id, s.data() ?? {}]));
    },
  };
}
