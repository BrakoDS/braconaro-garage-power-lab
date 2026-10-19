/**
 * A rodada do check-in da uGym: o que `sincronizarUgym` (index.ts) roda a cada
 * minuto. A regra está em `ugym.ts`; o HTTP, em `ugym-cliente.ts`.
 *
 *   1. As aulas de hoje no FitControl (relidas de hora em hora; no meio, vêm
 *      do estado guardado).
 *   2. Nenhuma aula na janela (30 min antes … 60 min depois)? A rodada acaba
 *      aqui, sem chamar o FitControl.
 *   3. As reservas de cada aula na janela; o check-in novo de aluno conhecido
 *      vira item em `checkinsUgym/{email}`. Aluno sem e-mail conhecido relê a
 *      lista de membros (no máximo de 30 em 30 min).
 *   4. Itens, livro e estado vão num LOTE SÓ: ou o item nasce e a reserva entra
 *      no livro, ou nenhum dos dois — a Gestão consome o item, e o livro é o que
 *      impede a próxima rodada de recriá-lo.
 *
 * O estado mora em `integracaoUgym/{coachUid}` (só o servidor grava; o coach
 * lê): o livro (`vistos`), o cache de e-mails e de aulas, os `pendentes` (quem
 * fez check-in sem e-mail que ligue à ficha) e a `ultimaRodada` — com o erro,
 * quando o login ou a forma da resposta falham.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { ClienteUgym } from './ugym-cliente';
import {
  AULAS_VALIDAS_MS, aulasNaJanela, CAMPOS_ESPERADOS, camposFaltando, checkinsNovos, ErroUgym, MEMBROS_VALIDOS_MS, podarLivro,
  type AulaUgym, type ItemCheckinUgym, type PendenteUgym, type ReservaUgym,
} from './ugym';
import type { Relogio } from './presenca';

type Dados = Record<string, unknown>;

export interface EstadoUgym {
  vistos: Record<string, string>;
  emails: Record<string, string>;
  emailsEm: number;
  aulas: { dia: string; lista: AulaUgym[]; em: number } | null;
  pendentes: Record<string, PendenteUgym>;
}

export interface UltimaRodada {
  em: number; hoje: string; aulasNaJanela: number; reservas: number; checkins: number; pendentes: number;
  erro: { motivo: string; mensagem: string } | null;
}

export interface RepoUgym {
  lerEstado(coachUid: string): Promise<EstadoUgym>;
  /** Tudo num lote: os itens novos, o estado inteiro e a última rodada. */
  gravar(coachUid: string, itens: Array<{ email: string; id: string; item: ItemCheckinUgym }>, estado: EstadoUgym, rodada: UltimaRodada): Promise<void>;
  /** Só a última rodada (o erro) — sem mexer no livro. */
  gravarRodada(coachUid: string, rodada: UltimaRodada): Promise<void>;
}

export interface DepsUgym {
  cliente: ClienteUgym;
  repo: RepoUgym;
  coachUid: string;
  agora: number;
  relogio: Relogio;
  log: { info: (m: string, d?: unknown) => void; warn: (m: string, d?: unknown) => void };
}

/** Linha com campo faltando = a API mudou. Para antes de ler errado. */
function conferirFormato(linhas: Dados[], campos: readonly string[], qual: string): void {
  if (!linhas.length) return;
  const faltam = camposFaltando(linhas[0], campos);
  if (faltam.length) throw new ErroUgym('formato', `${qual} sem ${faltam.join(', ')} — o FitControl mudou?`);
}

/**
 * Uma rodada. Nunca lança: o erro (login, rede, formato) vai para
 * `ultimaRodada.erro` e para o log, e a próxima rodada tenta de novo.
 */
export async function sincronizarCheckinsUgym(d: DepsUgym): Promise<UltimaRodada> {
  const { hoje } = d.relogio;
  const rodada: UltimaRodada = { em: d.agora, hoje, aulasNaJanela: 0, reservas: 0, checkins: 0, pendentes: 0, erro: null };
  let estado: EstadoUgym | null = null;
  try {
    estado = await d.repo.lerEstado(d.coachUid);
    let mudou = false;

    // 1. As aulas de hoje.
    let aulas = estado.aulas && estado.aulas.dia === hoje && d.agora - estado.aulas.em < AULAS_VALIDAS_MS ? estado.aulas.lista : null;
    if (!aulas) {
      const r = await d.cliente.aulasDoDia(hoje);
      conferirFormato(r.linhas, CAMPOS_ESPERADOS.aula, 'A lista de aulas');
      aulas = r.aulas;
      estado = { ...estado, aulas: { dia: hoje, lista: aulas, em: d.agora } };
      mudou = true;
    }

    // 2. A janela.
    const janela = aulasNaJanela(aulas, d.relogio);
    rodada.aulasNaJanela = janela.length;
    if (!janela.length) {
      if (mudou) await d.repo.gravar(d.coachUid, [], estado, rodada);
      return rodada;
    }

    // 3. As reservas e os check-ins.
    const reservas: ReservaUgym[] = [];
    for (const aula of janela) {
      const r = await d.cliente.reservasDaAula(aula.id);
      conferirFormato(r.linhas, CAMPOS_ESPERADOS.reserva, 'A lista de reservas');
      reservas.push(...r.reservas);
    }
    rodada.reservas = reservas.length;

    let emails = estado.emails;
    let emailsEm = estado.emailsEm;
    const vistos = estado.vistos;
    const semEmail = reservas.some((r) => r.checkin && !(r.id in vistos) && !emails[r.alunoUgymId]);
    if (semEmail && d.agora - emailsEm >= MEMBROS_VALIDOS_MS) {
      const m = await d.cliente.emailsDosMembros();
      conferirFormato(m.linhas, CAMPOS_ESPERADOS.membro, 'A lista de membros');
      emails = m.emails;
      emailsEm = d.agora;
    }

    const novos = checkinsNovos(reservas, { emails, vistos, coachUid: d.coachUid, em: d.agora });
    rodada.checkins = novos.itens.length;
    rodada.pendentes = Object.keys(novos.pendentes).length;

    // 4. Um lote só.
    // Pendente é só de hoje, e sai assim que o cadastro na uGym ganha e-mail.
    const pendentes = Object.fromEntries(Object.entries({ ...estado.pendentes, ...novos.pendentes })
      .filter(([id, p]) => p && p.dia === hoje && !emails[id]));
    estado = { ...estado, emails, emailsEm, pendentes, vistos: podarLivro({ ...vistos, ...novos.vistos }, hoje) };
    await d.repo.gravar(d.coachUid, novos.itens, estado, rodada);
    if (novos.itens.length || rodada.pendentes) d.log.info('Check-in da uGym.', { checkins: novos.itens.length, pendentes: rodada.pendentes, aulas: janela.map((a) => a.id) });
    return rodada;
  } catch (e) {
    const erro = e instanceof ErroUgym ? { motivo: e.motivo, mensagem: e.message } : { motivo: 'interno', mensagem: String((e as Error)?.message ?? e).slice(0, 200) };
    rodada.erro = erro;
    d.log.warn('Check-in da uGym: rodada falhou.', erro);
    try { await d.repo.gravarRodada(d.coachUid, rodada); } catch { /* o log já registrou */ }
    return rodada;
  }
}

/* ============================================================
   O Firestore
   ============================================================ */

const ESTADO_VAZIO: EstadoUgym = { vistos: {}, emails: {}, emailsEm: 0, aulas: null, pendentes: {} };

const mapa = (v: unknown): Dados => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Dados) : {});

/** O estado guardado, tolerante a documento novo ou incompleto. */
export function lerEstadoDoDoc(d: unknown): EstadoUgym {
  const x = mapa(d);
  const aulas = mapa(x.aulas);
  return {
    vistos: mapa(x.vistos) as Record<string, string>,
    emails: mapa(x.emails) as Record<string, string>,
    emailsEm: typeof x.emailsEm === 'number' ? x.emailsEm : 0,
    aulas: typeof aulas.dia === 'string' && Array.isArray(aulas.lista) && typeof aulas.em === 'number'
      ? { dia: aulas.dia, lista: aulas.lista as AulaUgym[], em: aulas.em } : null,
    pendentes: mapa(x.pendentes) as Record<string, PendenteUgym>,
  };
}

export function repoUgymFirestore(db: Firestore): RepoUgym {
  const estadoRef = (uid: string) => db.doc(`integracaoUgym/${uid}`);
  return {
    async lerEstado(uid) {
      const s = await estadoRef(uid).get();
      return s.exists ? lerEstadoDoDoc(s.data()) : { ...ESTADO_VAZIO };
    },
    async gravar(uid, itens, estado, rodada) {
      const lote = db.batch();
      for (const { email, id, item } of itens) {
        lote.set(db.doc(`checkinsUgym/${email}`), { itens: { [id]: item }, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
      }
      lote.set(estadoRef(uid), { ...estado, ultimaRodada: rodada, atualizadoEm: FieldValue.serverTimestamp() });
      await lote.commit();
    },
    async gravarRodada(uid, rodada) {
      await estadoRef(uid).set({ ultimaRodada: rodada, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    },
  };
}
