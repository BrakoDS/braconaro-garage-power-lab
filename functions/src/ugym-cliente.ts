/**
 * O cliente HTTP do FitControl (o painel web da uGym). SÓ LEITURA: lista as
 * aulas do dia, as reservas de uma aula e os membros — nunca cria, apaga ou
 * desvincula nada lá.
 *
 * A API é a interna do painel (não há API oficial): `POST /api/pc/...` com
 * `language` no corpo e o token no cabeçalho `Authorization`, sem "Bearer". O
 * login é o do painel (`loginSecret` → senha em RSA → `loginByEmail`). O token
 * fica só na memória da instância; sessão expirada (errcode 2001/3001) refaz o
 * login uma vez. Nenhum erro leva a senha ou o token.
 */
import {
  abrirPagina, abrirResposta, cifrarSenha, emailsDosMembros, ErroUgym, lerAulas, lerReservas,
  type AulaUgym, type ReservaUgym,
} from './ugym';
import type { Relogio } from './presenca';

type Dados = Record<string, unknown>;

const API_UGYM = 'https://fitcontrol.ugym.com.br/api';
const TIMEOUT_UGYM_MS = 15_000;
/** O idioma das mensagens da API (3 = o padrão do painel). */
const IDIOMA = 3;
const POR_PAGINA = 100;
/** Teto de páginas por listagem — o box tem ~20 alunos; passar disso é dado estranho. */
const MAX_PAGINAS = 20;

export interface ClienteUgym {
  /** As aulas de um dia (`AAAA-MM-DD`). */
  aulasDoDia(dia: string): Promise<{ aulas: AulaUgym[]; linhas: Dados[] }>;
  /** As reservas (e check-ins) de uma aula. */
  reservasDaAula(aulaId: string): Promise<{ reservas: ReservaUgym[]; linhas: Dados[] }>;
  /** id do aluno na uGym → e-mail. */
  emailsDosMembros(): Promise<{ emails: Record<string, string>; linhas: Dados[] }>;
}

interface OpcoesUgym {
  usuario: string; senha: string; base: string; timeoutMs: number;
  relogioDoInstante: (d: Date) => Relogio;
}

async function http(o: OpcoesUgym, metodo: 'GET' | 'POST', caminho: string, corpo: Dados | undefined, token: string): Promise<unknown> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), o.timeoutMs);
  try {
    const url = metodo === 'GET' ? `${o.base}${caminho}?language=${IDIOMA}` : `${o.base}${caminho}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = token;
    if (corpo) headers['Content-Type'] = 'application/json';
    let r: Response;
    try {
      r = await fetch(url, { method: metodo, signal: controle.signal, headers, body: corpo ? JSON.stringify({ ...corpo, language: IDIOMA }) : undefined });
    } catch {
      throw new ErroUgym('rede', `FitControl ${caminho}: ${controle.signal.aborted ? 'tempo esgotado' : 'sem conexão'}.`);
    }
    const texto = await r.text();
    if (r.status === 401 || r.status === 403) throw new ErroUgym('sessao', `FitControl ${caminho} → ${r.status}`, r.status);
    if (!r.ok) throw new ErroUgym('api', `FitControl ${caminho} → ${r.status}`, r.status);
    let json: unknown;
    try { json = JSON.parse(texto); } catch { throw new ErroUgym('formato', `FitControl ${caminho}: resposta não é JSON.`); }
    return abrirResposta(json);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * O cliente. `base`, `timeoutMs` e o relógio só mudam nos testes (um
 * FitControl falso local).
 */
export function clienteFitControl(
  credenciais: { usuario: string; senha: string },
  relogioDoInstante: (d: Date) => Relogio,
  teste: { base?: string; timeoutMs?: number } = {},
): ClienteUgym & { entradas: () => number } {
  const o: OpcoesUgym = {
    usuario: credenciais.usuario, senha: credenciais.senha, relogioDoInstante,
    base: teste.base ?? API_UGYM, timeoutMs: teste.timeoutMs ?? TIMEOUT_UGYM_MS,
  };
  let token = '';
  let entradas = 0;

  async function entrar(): Promise<string> {
    if (!o.usuario || !o.senha) throw new ErroUgym('sessao', 'Credenciais da uGym não configuradas.');
    const chave = await http(o, 'GET', '/pc/loginSecret', undefined, '');
    if (typeof chave !== 'string' || !chave) throw new ErroUgym('formato', 'loginSecret sem chave pública.');
    const dados = await http(o, 'POST', '/pc/loginByEmail', { username: o.usuario, password: cifrarSenha(o.senha, chave) }, '');
    const t = (dados && typeof dados === 'object' ? (dados as Dados).token : null);
    if (typeof t !== 'string' || !t) throw new ErroUgym('formato', 'loginByEmail sem token.');
    entradas++;
    return t;
  }

  /** Uma chamada autenticada; sessão expirada → um login novo e uma segunda tentativa. */
  async function chamar(caminho: string, corpo: Dados): Promise<unknown> {
    if (!token) token = await entrar();
    try {
      return await http(o, 'POST', caminho, corpo, token);
    } catch (e) {
      if (!(e instanceof ErroUgym) || e.motivo !== 'sessao') throw e;
      token = await entrar();
      return http(o, 'POST', caminho, corpo, token);
    }
  }

  /** Todas as páginas de uma listagem (`firstNum`/`num`). */
  async function todas(caminho: string, filtro: Dados): Promise<Dados[]> {
    const out: Dados[] = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const { lista, total } = abrirPagina(await chamar(caminho, { firstNum: p * POR_PAGINA, num: POR_PAGINA, ...filtro }));
      out.push(...lista);
      if (lista.length < POR_PAGINA || out.length >= total) return out;
    }
    return out;
  }

  return {
    async aulasDoDia(dia) {
      const linhas = await todas('/pc/sportsClasses/list', { startDate: dia, endDate: dia });
      return { aulas: lerAulas(linhas, o.relogioDoInstante).filter((a) => a.dia === dia), linhas };
    },
    async reservasDaAula(aulaId) {
      const id = Number(aulaId);
      const linhas = await todas('/pc/sportsClasses/memberList', { memberClassId: Number.isFinite(id) ? id : aulaId });
      return { reservas: lerReservas(linhas, o.relogioDoInstante).filter((r) => r.aulaId === aulaId), linhas };
    },
    async emailsDosMembros() {
      const linhas = await todas('/pc/sportsDeviceStudent/list', {});
      return { emails: emailsDosMembros(linhas), linhas };
    },
    entradas: () => entradas,
  };
}
