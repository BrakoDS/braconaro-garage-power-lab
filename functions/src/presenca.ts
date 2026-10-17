/**
 * Presença do lado do ALUNO: "Não irei ao treino" e a ocupação dos horários.
 *
 * Port, em TypeScript, do pedaço de `coach/gestao-de-alunos/presenca-regras.js`
 * que o servidor precisa — onde cada aula acontece, o prazo de 2h e a contagem
 * das turmas. `checar-presenca.ts` roda os dois lados sobre as mesmas fichas e
 * compara: o aluno não pode ouvir "no prazo" do servidor e o coach ver "fora do
 * prazo" no painel. O PORQUÊ de cada regra mora no original.
 *
 * O aviso do aluno NÃO grava na ficha (a ficha é do coach, e a Gestão sobe a
 * ficha inteira — uma escrita do servidor ali seria apagada pela próxima
 * gravação dela). Ele vai para `avisosAusencia/{email}`, com o relógio do
 * SERVIDOR, e a Gestão aplica na ficha a mesma regra (`ausencias-merge.js`).
 *
 * Puro: sem Firestore. As datas são 'AAAA-MM-DD' e as horas 'HH:MM' de parede
 * (fuso do box); a conta é feita em UTC só para não depender do fuso da máquina.
 */

type Dados = Record<string, unknown>;

export interface Relogio { hoje: string; agora: string }
export interface Onde { data: string; hora: string }
export type TipoAula = 'titular' | 'reposicao';
export type StatusAula = 'confirmado' | 'presente' | 'desmarcou-no-prazo' | 'desmarcou-fora' | 'falta' | 'atestado' | 'fechado';

export const PRAZO_DESMARCAR_MIN = 120;
export const VALIDADE_CREDITO_DIAS = 30;
export const CAPACIDADE_PADRAO = 6;
/** Até quantos dias à frente o aluno pode avisar que não vem. */
export const HORIZONTE_AVISO_DIAS = 14;

const ORDEM_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
const OCUPA = new Set<StatusAula>(['confirmado', 'presente', 'falta']);
export const EH_DATA = /^\d{4}-\d{2}-\d{2}$/;

const mapa = (v: unknown): Dados => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Dados) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ============================================================
   Relógio
   ============================================================ */

function utc(iso: string): Date { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); }

/** 'AAAA-MM-DD' + n dias. */
export function somarDias(iso: string, n: number): string {
  const d = utc(iso); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 'seg'…'dom' de uma data. */
export function chaveDoDia(iso: string): string {
  return ORDEM_DIAS[(utc(iso).getUTCDay() + 6) % 7];
}

/** As 7 datas (seg…dom) da semana de `iso`. */
export function datasDaSemana(iso: string): Record<string, string> {
  const seg = somarDias(iso, -((utc(iso).getUTCDay() + 6) % 7));
  return Object.fromEntries(ORDEM_DIAS.map((k, i) => [k, somarDias(seg, i)]));
}

function minutosDe(dia: string, hora: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia || '');
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora || '');
  if (!d || !h) return null;
  return Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]) / 60000;
}

/** Minutos de `relogio` até a aula (negativo: já começou); null sem hora. */
export function antecedenciaMin(relogio: Relogio, dia: string, hora: string): number | null {
  const aula = minutosDe(dia, hora), agora = minutosDe(relogio.hoje, relogio.agora);
  return aula == null || agora == null ? null : aula - agora;
}

/** O relógio de parede do box (São Paulo) num instante. */
export function relogioDoBox(instante: Date): Relogio {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instante).map((x) => [x.type, x.value]));
  return { hoje: `${p.year}-${p.month}-${p.day}`, agora: `${p.hour}:${p.minute}` };
}

/* ============================================================
   Onde cada aula acontece
   ============================================================ */

function diaEfetivo(a: Dados, plan: string): string {
  const r = mapa(a.remarcacoes)[plan];
  if (typeof r === 'string') return r;
  return texto(mapa(r).data) || plan;
}

/** Onde a aula planejada para `plan` acontece (a desmarcada fica onde estava). */
export function ondeAcontece(a: Dados, plan: string): Onde {
  const reg = mapa(mapa(a.atestados)[plan] ?? mapa(a.faltas)[plan]);
  const aula = mapa(reg.aula);
  if (texto(aula.data)) return { data: texto(aula.data), hora: texto(aula.hora) };
  const r = mapa(a.remarcacoes)[plan];
  const data = diaEfetivo(a, plan);
  const horarios = mapa(a.horarios);
  const hora = texto(mapa(r).hora) || texto(horarios[chaveDoDia(data)]) || texto(horarios[chaveDoDia(plan)]);
  return { data, hora };
}

/** Avisos ainda não aplicados pelo coach, por aula (`${tipo}|${chave}` → no prazo?). */
export type AvisosPendentes = Record<string, { noPrazo: boolean }>;

export interface AulaNaTurma { alunoId: string; tipo: TipoAula; chave: string; hora: string; status: StatusAula }

function statusTitular(a: Dados, plan: string, dia: string, hoje: string, fechados: Set<string>, aviso?: { noPrazo: boolean }): StatusAula {
  const at = mapa(a.atestados)[plan], fa = mapa(a.faltas)[plan];
  if (at) {
    const t = mapa(at);
    if (t.tipo === 'desmarcacao') return 'desmarcou-no-prazo';
    if (t.tipo === 'excecao') return t.antes === 'fora-do-prazo' ? 'desmarcou-fora' : 'falta';
    return 'atestado';
  }
  if (lista(a.presencas).includes(dia)) return 'presente';
  if (fa) return mapa(fa).tipo === 'fora-do-prazo' ? 'desmarcou-fora' : 'falta';
  if (aviso) return aviso.noPrazo ? 'desmarcou-no-prazo' : 'desmarcou-fora';
  if (fechados.has(dia)) return 'fechado';
  if (dia < hoje) return 'falta';
  return 'confirmado';
}

function statusReposicao(a: Dados, rep: Dados, dia: string, hoje: string, fechados: Set<string>, aviso?: { noPrazo: boolean }): StatusAula {
  if (lista(a.presencas).includes(dia)) return 'presente';
  if (rep.foraDoPrazo) return 'desmarcou-fora';
  if (rep.noShow) return 'falta';
  if (aviso) return aviso.noPrazo ? 'desmarcou-no-prazo' : 'desmarcou-fora';
  if (fechados.has(dia)) return 'fechado';
  if (dia < hoje) return 'falta';
  return 'confirmado';
}

/**
 * Quem tem aula em `dia`: titulares da grade fixa e reposições marcadas. Com
 * `avisos`, o aviso que o coach ainda não aplicou já libera a vaga.
 */
export function aulasDoDia(
  alunos: Dados[], dia: string,
  { hoje, fechados = [], avisos = {} }: { hoje: string; fechados?: string[]; avisos?: Record<string, AvisosPendentes> },
): AulaNaTurma[] {
  const semana = datasDaSemana(dia);
  const fech = new Set(fechados);
  const out: AulaNaTurma[] = [];
  for (const a of alunos) {
    const id = String(a.id ?? '');
    const doAluno = avisos[id] ?? {};
    for (const k of lista(a.diasTreino)) {
      const plan = semana[String(k)];
      if (!plan) continue;
      const onde = ondeAcontece(a, plan);
      if (onde.data !== dia) continue;
      out.push({ alunoId: id, tipo: 'titular', chave: plan, hora: onde.hora, status: statusTitular(a, plan, dia, hoje, fech, doAluno[`titular|${plan}`]) });
    }
    for (const [origem, v] of Object.entries(mapa(a.atestados))) {
      const rep = mapa(mapa(v).reposicao);
      if (rep.data !== dia) continue;
      out.push({ alunoId: id, tipo: 'reposicao', chave: origem, hora: texto(rep.hora), status: statusReposicao(a, rep, dia, hoje, fech, doAluno[`reposicao|${origem}`]) });
    }
  }
  return out;
}

/** As vagas de uma turma: a do horário, a padrão do box, ou 6. */
export function capacidadeDaTurma(config: unknown, hora: string): number {
  const c = mapa(config);
  const n = mapa(c.porHorario)[hora];
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n;
  return typeof c.padrao === 'number' && Number.isFinite(c.padrao) && c.padrao >= 0 ? c.padrao : CAPACIDADE_PADRAO;
}

export interface Ocupacao { dia: string; hora: string; capacidade: number; ocupadas: number; vagas: number }

/**
 * A ocupação das turmas de `dia` — só números, sem nome de ninguém: é isso
 * que o aluno pode ver dos outros. Turma sem horário fica de fora.
 */
export function ocupacaoDoDia(
  alunos: Dados[], dia: string,
  o: { hoje: string; fechados?: string[]; experimentais?: unknown; config?: unknown; avisos?: Record<string, AvisosPendentes> },
): Ocupacao[] {
  const aulas = aulasDoDia(alunos, dia, o);
  const exps = lista(mapa(o.experimentais)[dia]).map(mapa).filter((x) => texto(x.hora));
  const horas = [...new Set([...aulas.map((x) => x.hora), ...exps.map((x) => texto(x.hora))])].filter(Boolean).sort();
  return horas.map((hora) => {
    const capacidade = capacidadeDaTurma(o.config, hora);
    const ocupadas = aulas.filter((x) => x.hora === hora && OCUPA.has(x.status)).length
      + exps.filter((x) => texto(x.hora) === hora && x.status !== 'cancelada').length;
    return { dia, hora, capacidade, ocupadas, vagas: Math.max(0, capacidade - ocupadas) };
  });
}

/* ============================================================
   "Não irei ao treino"
   ============================================================ */

export interface ResultadoAusencia {
  aula: Onde; noPrazo: boolean; antecedenciaMin: number;
  /** Titular no prazo: até quando vale o crédito novo. Reposição no prazo: o crédito volta com a validade que já tinha. */
  expira: string | null;
}

/**
 * O aluno avisa que não vem. Confere que a aula é dele, ainda está em aberto,
 * tem horário, não começou e cai nos próximos HORIZONTE_AVISO_DIAS dias; e diz
 * o que o aviso dá — a mesma régua de 2h do coach (`desmarcar` /
 * `desmarcarReposicaoComAviso`).
 */
export function avaliarAusencia(a: Dados, tipo: TipoAula, chave: string, relogio: Relogio): ResultadoAusencia | { erro: string } {
  if (!EH_DATA.test(chave)) return { erro: 'Aula inválida.' };
  let aula: Onde;
  let expiraReposicao: string | null = null;
  if (tipo === 'titular') {
    if (!lista(a.diasTreino).includes(chaveDoDia(chave))) return { erro: 'Essa aula não é da sua grade.' };
    if (mapa(a.atestados)[chave]) return { erro: 'Essa aula já foi desmarcada (você tem o crédito de reposição dela).' };
    if (mapa(a.faltas)[chave]) return { erro: 'Essa aula já está registrada como falta.' };
    aula = ondeAcontece(a, chave);
  } else {
    const credito = mapa(mapa(a.atestados)[chave]);
    const rep = mapa(credito.reposicao);
    if (!texto(rep.data)) return { erro: 'Você não tem reposição marcada para essa aula.' };
    if (rep.foraDoPrazo || rep.noShow) return { erro: 'Essa reposição já está registrada como falta.' };
    aula = { data: texto(rep.data), hora: texto(rep.hora) };
    expiraReposicao = texto(credito.expira) || null;
  }
  if (lista(a.presencas).includes(aula.data)) return { erro: 'Você já fez check-in nessa aula.' };
  const ant = antecedenciaMin(relogio, aula.data, aula.hora);
  if (ant == null) return { erro: 'Essa aula não tem horário definido — fale com o coach.' };
  if (ant <= 0) return { erro: 'Essa aula já começou.' };
  if (aula.data > somarDias(relogio.hoje, HORIZONTE_AVISO_DIAS)) return { erro: `Dá para avisar só das aulas dos próximos ${HORIZONTE_AVISO_DIAS} dias.` };
  const noPrazo = ant >= PRAZO_DESMARCAR_MIN;
  return {
    aula, noPrazo, antecedenciaMin: ant,
    expira: !noPrazo ? null : tipo === 'titular' ? somarDias(relogio.hoje, VALIDADE_CREDITO_DIAS) : expiraReposicao,
  };
}

/**
 * Os avisos que a Gestão ainda não aplicou, dos documentos `avisosAusencia/*`:
 * só os deste coach, por aluno e por aula (`${tipo}|${chave}`).
 */
export function avisosPorAluno(docs: unknown[], coachUid: string): Record<string, AvisosPendentes> {
  const out: Record<string, AvisosPendentes> = {};
  for (const doc of docs) {
    for (const [k, v] of Object.entries(mapa(mapa(doc).itens))) {
      const i = mapa(v);
      if (i.coachUid !== coachUid || !texto(i.alunoId)) continue;
      (out[texto(i.alunoId)] ??= {})[k] = { noPrazo: i.noPrazo === true };
    }
  }
  return out;
}
