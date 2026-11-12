/**
 * AS FUNÇÕES POR TIME (Fase 1 · etapa 7, decisão 13 do ESCOPO, PLANO-FASE1-ETAPA7.md).
 *
 * A porta dos agentes à base: `agenteConsultar`, `agentePropor` e
 * `agenteRegistrar` (index.ts). Aqui fica o que não depende do Firestore, para o
 * `checar-agentes` provar sem rede:
 *
 *  - a IDENTIDADE: uma chave secreta por time (`Authorization: Bearer <chave>`),
 *    comparada sem vazar tempo. Chave errada ou ausente: 401, e a tentativa vai
 *    para o log;
 *  - o LIMITE: 60 chamadas por minuto por time, nesta instância (as funções
 *    rodam com no máximo uma instância);
 *  - o DESPACHO: o que cada função faz com o corpo, chamando as regras da
 *    Gestão (`agentes-regras.js`, copiado para lib/gestao) — o que um time pode
 *    consultar e propor, e os campos de cada consulta;
 *  - o LOG: toda chamada vira uma linha em `gestao/{coach}/agentesLog`, SEM os
 *    dados devolvidos (quem, o quê, quantos registros, se deu certo, quando).
 *
 * Os agentes só LEEM e PROPÕEM: nada aqui grava na ficha. A proposta vai para
 * `gestao/{coach}/propostas`, e o coach decide no painel de Aprovações.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** `import()` de verdade (o tsc em commonjs trocaria por `require`). */
const importar = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>;
const _regras = new Map<string, Promise<RegrasDosAgentes>>();

/**
 * As regras dos agentes, da cópia da Gestão em lib/gestao (copiar-regras-gestao.mjs).
 * Carrega uma vez por instância.
 * @param base a pasta da cópia (o `checar-agentes` aponta para o site, direto)
 */
export function regrasDosAgentes(base = join(__dirname, 'gestao')): Promise<RegrasDosAgentes> {
  const ja = _regras.get(base);
  if (ja) return ja;
  const de = (arquivo: string) => importar(pathToFileURL(join(base, 'coach', 'gestao-de-alunos', arquivo)).href);
  const carga = Promise.all([de('agentes-regras.js'), de('eventos.js')])
    .then(([ag, ev]) => ({ ...ag, novoEvento: ev.novoEvento }) as unknown as RegrasDosAgentes);
  _regras.set(base, carga);
  return carga;
}

export type Time = 'administrativo' | 'alunos';
export const TIMES: readonly Time[] = ['administrativo', 'alunos'];
export type Funcao = 'consultar' | 'propor' | 'registrar';

/** Chamadas por minuto, por time. */
export const LIMITE_POR_MINUTO = 60;

type Dados = Record<string, unknown>;

/** O resumo de 32 bytes de um texto: compara chaves de tamanhos diferentes no mesmo tempo. */
const resumo = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/**
 * O time dono da chave do cabeçalho `Authorization: Bearer <chave>`, ou null.
 * Chave vazia nos segredos nunca casa (um segredo não cadastrado não abre nada).
 */
export function timeDaChave(authorization: unknown, chaves: Record<Time, string>): Time | null {
  const m = /^Bearer\s+(\S+)$/i.exec(typeof authorization === 'string' ? authorization.trim() : '');
  if (!m) return null;
  const dada = resumo(m[1]);
  let achado: Time | null = null;
  // Compara com TODAS (sem parar na primeira): o tempo não diz qual time casou.
  for (const t of TIMES) {
    const chave = String(chaves[t] || '');
    if (chave.length >= 24 && timingSafeEqual(dada, resumo(chave))) achado = t;
  }
  return achado;
}

/** A janela de chamadas de cada time, nesta instância. */
export class Limite {
  private readonly janelas = new Map<Time, number[]>();
  constructor(private readonly porMinuto = LIMITE_POR_MINUTO) {}
  /** Conta a chamada; false quando passou do limite no último minuto. */
  aceitar(time: Time, agora: number): boolean {
    const desde = agora - 60_000;
    const lista = (this.janelas.get(time) ?? []).filter((t) => t > desde);
    if (lista.length >= this.porMinuto) { this.janelas.set(time, lista); return false; }
    lista.push(agora);
    this.janelas.set(time, lista);
    return true;
  }
}

/** As regras da Gestão que as funções usam (agentes-regras.js + eventos.js), copiadas no build. */
export interface RegrasDosAgentes {
  consultar(time: string, nome: string, params: Dados, ctx: Dados): { dados: unknown[]; registros: number; cortado: boolean; mes?: string } | { erro: string; status: number };
  validarProposta(time: string, corpo: unknown, fichas: Dados[], hojeIso: string): { proposta: { tipo: string; alunoId: string; alunoNome: string; dados: Dados; motivo: string } } | { erro: string; status: number };
  eventoDaProposta(p: Dados, time: string, em: number): Dados;
  validarRegistro(time: string, corpo: unknown): { resumo: string; motivo: string } | { erro: string; status: number };
  autorDoTime(time: string): Dados;
  novoEvento(p: Dados): Dados;
  CONSULTAS: Record<string, { times: readonly string[]; aluno?: boolean }>;
}

/** A linha do log de uma chamada: nunca os dados devolvidos. */
export interface LinhaDoLog {
  time: Time | 'desconhecido'; funcao: Funcao; em: number; ok: boolean; status: number;
  consulta?: string; tipo?: string; registros?: number; propostaId?: string; erro?: string;
}

/** O que cada função precisa do mundo (o Firestore em produção, memória no `checar-agentes`). */
export interface DepsDosAgentes {
  regras: RegrasDosAgentes;
  chaves: Record<Time, string>;
  limite: Limite;
  agora: () => number;
  hojeIso: () => string;
  /** As fichas e o que a consulta pede (avaliações do aluno, ocupação, consentimentos), lidos só quando a consulta precisa. */
  lerContexto(consulta: string, params: Dados): Promise<Dados & { fichas: Dados[] }>;
  lerFichas(): Promise<Dados[]>;
  gravarProposta(id: string, doc: Dados, evento: Dados): Promise<void>;
  gravarEvento(evento: Dados): Promise<void>;
  gravarLog(linha: LinhaDoLog): Promise<void>;
  novoId(): string;
}

export interface Resposta { status: number; corpo: Dados }

const erro = (status: number, mensagem: string): Resposta => ({ status, corpo: { ok: false, erro: mensagem } });

/** O corpo JSON da requisição (o Express já entrega objeto; texto cru também serve). */
function corpoDe(body: unknown): Dados | null {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Dados;
  if (typeof body === 'string') { try { const v = JSON.parse(body); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }
  return null;
}

/**
 * Atende uma chamada de agente: método, chave, limite, despacho e log. Toda
 * chamada — também a recusada — vira uma linha do log.
 */
export async function atenderAgente(
  funcao: Funcao, req: { method?: string; headers: Record<string, unknown>; body?: unknown }, deps: DepsDosAgentes,
): Promise<Resposta> {
  const em = deps.agora();
  const registrar = async (linha: Omit<LinhaDoLog, 'funcao' | 'em'>) => {
    try { await deps.gravarLog({ funcao, em, ...linha }); } catch { /* o log não derruba a resposta */ }
  };
  if (req.method !== 'POST') return erro(405, 'Use POST, com o corpo em JSON.');
  const time = timeDaChave(req.headers.authorization ?? req.headers.Authorization, deps.chaves);
  if (!time) {
    await registrar({ time: 'desconhecido', ok: false, status: 401, erro: 'chave inválida' });
    return erro(401, 'Chave do time inválida.');
  }
  if (!deps.limite.aceitar(time, em)) {
    await registrar({ time, ok: false, status: 429, erro: 'limite por minuto' });
    return erro(429, `Limite de ${LIMITE_POR_MINUTO} chamadas por minuto. Tente de novo em instantes.`);
  }
  const corpo = corpoDe(req.body);
  if (!corpo) {
    await registrar({ time, ok: false, status: 400, erro: 'corpo inválido' });
    return erro(400, 'O corpo precisa ser um objeto JSON.');
  }
  try {
    if (funcao === 'consultar') {
      const consulta = String(corpo.consulta ?? '');
      const params = { mes: corpo.mes, aluno: corpo.aluno };
      // A consulta que não existe ou não é do time é recusada ANTES de ler a base.
      const def = Object.prototype.hasOwnProperty.call(deps.regras.CONSULTAS, consulta) ? deps.regras.CONSULTAS[consulta] : null;
      const ctx = def && def.times.includes(time) ? await deps.lerContexto(consulta, params) : { fichas: [], hojeIso: deps.hojeIso() };
      const r = deps.regras.consultar(time, consulta, params, { ...ctx, hojeIso: deps.hojeIso() });
      if ('erro' in r) { await registrar({ time, consulta, ok: false, status: r.status, erro: r.erro }); return erro(r.status, r.erro); }
      await registrar({ time, consulta, ok: true, status: 200, registros: r.registros });
      return { status: 200, corpo: { ok: true, ...r } };
    }
    if (funcao === 'propor') {
      const fichas = await deps.lerFichas();
      const v = deps.regras.validarProposta(time, corpo, fichas, deps.hojeIso());
      if ('erro' in v) { await registrar({ time, tipo: String(corpo.tipo ?? ''), ok: false, status: v.status, erro: v.erro }); return erro(v.status, v.erro); }
      const id = deps.novoId();
      const p = v.proposta;
      const doc = { id, time, ...p, situacao: 'proposta', em };
      const aluno = fichas.find((a) => String(a.id) === p.alunoId) ?? { id: p.alunoId, nome: p.alunoNome };
      const evento = deps.regras.novoEvento({ ...deps.regras.eventoDaProposta(p, time, em), origem: 'servidor', aluno, em, chave: `proposta:${id}` });
      await deps.gravarProposta(id, doc, evento);
      await registrar({ time, tipo: p.tipo, ok: true, status: 200, propostaId: id });
      return { status: 200, corpo: { ok: true, propostaId: id, situacao: 'proposta' } };
    }
    const v = deps.regras.validarRegistro(time, corpo);
    if ('erro' in v) { await registrar({ time, ok: false, status: v.status, erro: v.erro }); return erro(v.status, v.erro); }
    const evento = deps.regras.novoEvento({
      tipo: 'agente', origem: 'servidor', aluno: { id: 'box', nome: 'Box (todos os alunos)' }, em, resumo: v.resumo,
      autor: deps.regras.autorDoTime(time), ...(v.motivo ? { motivo: v.motivo } : {}),
    });
    await deps.gravarEvento(evento);
    await registrar({ time, ok: true, status: 200 });
    return { status: 200, corpo: { ok: true } };
  } catch (e) {
    await registrar({ time, ok: false, status: 500, erro: 'erro interno' });
    throw e;
  }
}
