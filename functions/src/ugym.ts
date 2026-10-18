/**
 * Check-in pelo app da uGym — as regras puras: ler as respostas do FitControl,
 * decidir quais aulas consultar agora e transformar o check-in de lá no item
 * que a Gestão aplica na ficha.
 *
 * Nada aqui fala com rede ou banco: o `checar-ugym.ts` prova tudo sem internet.
 * O HTTP está em `ugym-cliente.ts`; a orquestração e o Firestore, em
 * `ugym-servico.ts`. O mapa da API (lido do painel em 17/10/2026) está no
 * functions/README.md, seção "Check-in pelo app da uGym".
 *
 * RESERVA NÃO É PRESENÇA
 *
 * O FitControl devolve, por aula, as reservas (`memberDate`) e, nelas, a hora
 * do check-in (`memberCheckinDate`, null enquanto não houver). Só a segunda vira
 * item: reservar e não vir continua sendo falta, pela régua de sempre.
 *
 * O SERVIDOR NÃO GRAVA NA FICHA
 *
 * A Gestão sobe a ficha inteira e apagaria a escrita. O check-in vai para
 * `checkinsUgym/{email}.itens[`ugym|${reserva}`]`, como o aviso de ausência vai
 * para `avisosAusencia`, e a Gestão aplica (`coach/gestao-de-alunos/ugym-merge.js`).
 */
import { constants, publicEncrypt } from 'node:crypto';
import type { Relogio } from './presenca';

type Dados = Record<string, unknown>;

/** Quanto antes do início uma aula já é consultada (o aluno chega cedo). */
export const ANTES_DA_AULA_MIN = 30;
/** Quanto depois do fim ela ainda é consultada (check-in atrasado, coach que confirma depois). */
export const DEPOIS_DA_AULA_MIN = 60;
/** Por quantos dias a reserva já processada fica no livro (as consultas são só de hoje). */
export const DIAS_NO_LIVRO = 7;
/** De quanto em quanto tempo a lista de aulas do dia é relida (a grade muda pouco). */
export const AULAS_VALIDAS_MS = 60 * 60_000;
/** De quanto em quanto tempo, no máximo, a lista de membros é relida atrás de um aluno novo. */
export const MEMBROS_VALIDOS_MS = 30 * 60_000;

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/;

const mapa = (v: unknown): Dados => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Dados) : {});
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/* ============================================================
   As respostas do FitControl
   ============================================================ */

/** Por que uma chamada falhou: a sessão caiu (refazer o login), a API recusou, ou a resposta não tem a forma conhecida. */
export type MotivoErroUgym = 'sessao' | 'api' | 'formato' | 'rede';

export class ErroUgym extends Error {
  constructor(readonly motivo: MotivoErroUgym, mensagem: string, readonly codigo?: number) {
    super(mensagem);
    this.name = 'ErroUgym';
  }
}

/**
 * O envelope `{ errcode, data, errmsg }`. Os códigos 2001 e 3001 (ou `code`
 * 401/403) são os que o próprio painel trata como sessão expirada — é o mesmo
 * teste do interceptor dele.
 */
export function abrirResposta(json: unknown): unknown {
  const r = mapa(json);
  if ('errcode' in r) {
    const codigo = Number(r.errcode);
    if (codigo === 0) return r.data;
    const msg = texto(r.errmsg).slice(0, 120) || `errcode ${codigo}`;
    if (codigo === 2001 || codigo === 3001) throw new ErroUgym('sessao', msg, codigo);
    throw new ErroUgym('api', msg, codigo);
  }
  if (typeof r.code === 'number') {
    if (r.code === 200) return r.data;
    if (r.code === 401 || r.code === 403) throw new ErroUgym('sessao', `code ${r.code}`, r.code);
    throw new ErroUgym('api', texto(r.msg).slice(0, 120) || `code ${r.code}`, r.code);
  }
  throw new ErroUgym('formato', 'Resposta do FitControl sem errcode.');
}

/** Uma página de `{ list, total }`. Sem `list`, a API mudou — melhor parar do que ler errado. */
export function abrirPagina(data: unknown): { lista: Dados[]; total: number } {
  const d = mapa(data);
  if (!Array.isArray(d.list)) throw new ErroUgym('formato', 'Resposta do FitControl sem data.list.');
  const total = Number(d.total);
  return { lista: d.list.map(mapa), total: Number.isFinite(total) ? total : d.list.length };
}

/** 'AAAA-MM-DD HH:MM[:SS]' (ou com T) → dia e hora de parede; número = instante (s ou ms) no fuso do box. */
export function relogioDoTexto(v: unknown, relogioDoInstante: (d: Date) => Relogio): Relogio | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return relogioDoInstante(new Date(v < 1e12 ? v * 1000 : v));
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(texto(v));
  return m ? { hoje: m[1], agora: `${m[2]}:${m[3]}` } : null;
}

export interface AulaUgym { id: string; nome: string; dia: string; inicio: string; fim: string }

/**
 * As aulas de `sportsClasses/list`. Aula sem id ou sem horário de início é
 * descartada; sem fim, vale uma hora.
 */
export function lerAulas(linhas: Dados[], relogioDoInstante: (d: Date) => Relogio): AulaUgym[] {
  const out: AulaUgym[] = [];
  for (const l of linhas) {
    const id = texto(l.id);
    const ini = relogioDoTexto(l.classStartDate, relogioDoInstante);
    if (!id || !ini) continue;
    const fim = relogioDoTexto(l.classEndDate, relogioDoInstante);
    out.push({
      id, nome: texto(l.className), dia: ini.hoje, inicio: ini.agora,
      fim: fim && fim.hoje === ini.hoje ? fim.agora : somarMinutos(ini.agora, 60),
    });
  }
  return out;
}

export interface ReservaUgym {
  id: string; aulaId: string; alunoUgymId: string; noid: string;
  /** A aula: dia e hora de início. */
  dia: string; hora: string;
  /** A hora do check-in, ou null (só reservou). */
  checkin: Relogio | null;
}

/** As reservas de `sportsClasses/memberList`. Sem id, sem aluno ou sem aula, fora. */
export function lerReservas(linhas: Dados[], relogioDoInstante: (d: Date) => Relogio): ReservaUgym[] {
  const out: ReservaUgym[] = [];
  for (const l of linhas) {
    const id = texto(l.id), aulaId = texto(l.memberClassId), alunoUgymId = texto(l.memberStudentId);
    const aula = relogioDoTexto(l.memberClassStartDate, relogioDoInstante);
    if (!id || !aulaId || !alunoUgymId || !aula) continue;
    out.push({
      id, aulaId, alunoUgymId, noid: texto(l.memberStudentNoid).slice(0, 60),
      dia: aula.hoje, hora: aula.agora, checkin: relogioDoTexto(l.memberCheckinDate, relogioDoInstante),
    });
  }
  return out;
}

/**
 * Os membros de `sportsDeviceStudent/list`: id do aluno na uGym → e-mail
 * (minúsculo). É o e-mail que liga a reserva à ficha — o mesmo que o aluno usa
 * no Portal. Sem e-mail válido, o aluno não entra.
 */
export function emailsDosMembros(linhas: Dados[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of linhas) {
    const id = texto(l.studentId) || texto(l.id);
    const email = texto(l.studentEmail).toLowerCase();
    if (id && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) out[id] = email;
  }
  return out;
}

/* ============================================================
   Quando consultar
   ============================================================ */

function minutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 'HH:MM' + n minutos, sem passar da meia-noite. */
export function somarMinutos(hora: string, n: number): string {
  const t = Math.min(23 * 60 + 59, Math.max(0, (minutos(hora) ?? 0) + n));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * As aulas de hoje que valem uma consulta agora: de ANTES_DA_AULA_MIN antes do
 * início até DEPOIS_DA_AULA_MIN depois do fim. Fora disso, a rodada não chama
 * o FitControl.
 */
export function aulasNaJanela(aulas: AulaUgym[], relogio: Relogio): AulaUgym[] {
  const agora = minutos(relogio.agora);
  if (agora == null) return [];
  return aulas.filter((a) => {
    const ini = minutos(a.inicio), fim = minutos(a.fim);
    return a.dia === relogio.hoje && ini != null && fim != null
      && agora >= ini - ANTES_DA_AULA_MIN && agora <= fim + DEPOIS_DA_AULA_MIN;
  });
}

/* ============================================================
   Do check-in ao item
   ============================================================ */

/** O que a Gestão recebe em `checkinsUgym/{email}.itens[id]`. */
export interface ItemCheckinUgym {
  coachUid: string;
  origem: 'ugym';
  /** A aula na uGym: dia e hora de início — é por eles que a Gestão acha a aula da ficha. */
  dia: string; hora: string;
  /** A hora do check-in no app (relógio do box) — vira `presencaHoras`. */
  checkin: Relogio;
  aulaUgym: string; reservaUgym: string;
  em: number;
}

/** Quem fez check-in na uGym e não tem e-mail que ligue à ficha. O coach vê e corrige o cadastro lá. */
export interface PendenteUgym { noid: string; dia: string; hora: string }

export interface RodadaUgym {
  itens: Array<{ email: string; id: string; item: ItemCheckinUgym }>;
  pendentes: Record<string, PendenteUgym>;
  /** As reservas que viraram item agora (entram no livro, para não voltar na próxima rodada). */
  vistos: Record<string, string>;
}

/**
 * Das reservas lidas, os check-ins novos. Fica de fora: só reserva (sem
 * check-in), reserva já no livro (`vistos`), check-in de outro dia que não o da
 * aula (dado estranho — não arrisca) e aluno sem e-mail (vai para `pendentes`,
 * e não entra no livro: quando o cadastro na uGym ganhar e-mail, a próxima
 * rodada aplica).
 */
export function checkinsNovos(
  reservas: ReservaUgym[],
  { emails, vistos, coachUid, em }: { emails: Record<string, string>; vistos: Record<string, unknown>; coachUid: string; em: number },
): RodadaUgym {
  const out: RodadaUgym = { itens: [], pendentes: {}, vistos: {} };
  for (const r of reservas) {
    if (!r.checkin || r.id in vistos || r.id in out.vistos) continue;
    if (r.checkin.hoje !== r.dia) continue;
    const email = emails[r.alunoUgymId];
    if (!email) { out.pendentes[r.alunoUgymId] = { noid: r.noid, dia: r.dia, hora: r.hora }; continue; }
    out.itens.push({
      email, id: `ugym|${r.id}`,
      item: { coachUid, origem: 'ugym', dia: r.dia, hora: r.hora, checkin: r.checkin, aulaUgym: r.aulaId, reservaUgym: r.id, em },
    });
    out.vistos[r.id] = r.dia;
  }
  return out;
}

/** O livro sem as reservas de mais de DIAS_NO_LIVRO dias (as consultas são só do dia). */
export function podarLivro(vistos: Record<string, unknown>, hoje: string): Record<string, string> {
  const corte = somarDiasIso(hoje, -DIAS_NO_LIVRO);
  return Object.fromEntries(Object.entries(vistos).filter(([, d]) => typeof d === 'string' && EH_DATA.test(d) && d >= corte)) as Record<string, string>;
}

function somarDiasIso(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ============================================================
   A senha do login
   ============================================================ */

/**
 * A senha como o painel manda: RSA (PKCS#1 v1.5, o padrão do JSEncrypt) com a
 * chave pública de `/pc/loginSecret`, em base64 — e esse base64 de novo em
 * base64 (o painel passa o resultado do JSEncrypt pelo js-base64).
 */
export function cifrarSenha(senha: string, chavePublicaBase64: string): string {
  const corpo = chavePublicaBase64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(corpo)) throw new ErroUgym('formato', 'Chave pública do login inválida.');
  const pem = `-----BEGIN PUBLIC KEY-----\n${corpo.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----\n`;
  const rsa = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(senha, 'utf8')).toString('base64');
  return Buffer.from(rsa, 'utf8').toString('base64');
}

/** Para a varredura do formato: o que a rodada lê de cada aula, sem nada pessoal. */
export const CAMPOS_ESPERADOS = Object.freeze({
  aula: ['id', 'className', 'classStartDate', 'classEndDate'],
  reserva: ['id', 'memberClassId', 'memberStudentId', 'memberClassStartDate', 'memberCheckinDate'],
  membro: ['studentEmail'],
});

/** Os campos esperados que faltam numa linha — para o alerta "a API mudou". */
export function camposFaltando(linha: Dados, campos: readonly string[]): string[] {
  return campos.filter((c) => !(c in linha));
}
