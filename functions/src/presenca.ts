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
export type StatusAula = 'confirmado' | 'presente' | 'desmarcou-no-prazo' | 'desmarcou-fora' | 'falta' | 'sem-chamada' | 'atestado' | 'fechado';

export const PRAZO_DESMARCAR_MIN = 120;
export const VALIDADE_CREDITO_DIAS = 30;
export const CAPACIDADE_PADRAO = 6;

/**
 * O último dia do mês de `iso`, no fuso local. IGUAL ao fimDoMes de
 * compartilhado/regras/semana.js (paridade): o crédito de reposição vale até o
 * fim do mês em que foi gerado.
 */
export function fimDoMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

/** O crédito nunca vale menos que isso (o mesmo prazo para marcar a reposição). IGUAL ao semana.js. */
export const VALIDADE_MINIMA_DIAS = 7;

/**
 * A validade do crédito que nasce em `iso`: até o fim do mês, nunca menos de 7
 * dias. IGUAL ao validadeDoCredito de compartilhado/regras/semana.js (paridade).
 */
export function validadeDoCredito(iso: string): string {
  const minimo = somarDias(iso, VALIDADE_MINIMA_DIAS);
  const fim = fimDoMes(iso);
  return minimo > fim ? minimo : fim;
}
/** Até quantos dias à frente o aluno pode avisar que não vem. */
export const HORIZONTE_AVISO_DIAS = 14;

const ORDEM_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
// 'sem-chamada' (o dia passou, nada gravado) segue ocupando, como a falta deduzida ocupava.
const OCUPA = new Set<StatusAula>(['confirmado', 'presente', 'falta', 'sem-chamada']);
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
    if (t.tipo === 'excecao') return t.antes === 'fora-do-prazo' ? 'desmarcou-fora' : t.antes === 'sem-chamada' ? 'sem-chamada' : 'falta';
    if (t.tipo === 'fechado') return 'fechado'; // box fechou: crédito, não atestado
    return 'atestado';
  }
  if (lista(a.presencas).includes(dia)) return 'presente';
  if (fa) return mapa(fa).tipo === 'fora-do-prazo' ? 'desmarcou-fora' : 'falta';
  if (aviso) return aviso.noPrazo ? 'desmarcou-no-prazo' : 'desmarcou-fora';
  if (fechados.has(dia)) return 'fechado';
  // Nada gravado e o dia passou: ninguém fechou a chamada. Não é falta (ver presenca-regras.js).
  if (dia < hoje) return 'sem-chamada';
  return 'confirmado';
}

function statusReposicao(a: Dados, rep: Dados, dia: string, hoje: string, fechados: Set<string>, aviso?: { noPrazo: boolean }): StatusAula {
  if (lista(a.presencas).includes(dia)) return 'presente';
  if (rep.foraDoPrazo) return 'desmarcou-fora';
  if (rep.noShow) return 'falta';
  if (aviso) return aviso.noPrazo ? 'desmarcou-no-prazo' : 'desmarcou-fora';
  if (fechados.has(dia)) return 'fechado';
  if (dia < hoje) return 'sem-chamada';
  return 'confirmado';
}

/**
 * Quem tem aula em `dia`: titulares da grade fixa e reposições marcadas. Com
 * `avisos`, o aviso que o coach ainda não aplicou já libera a vaga; com
 * `reservas`, a reposição que o aluno marcou e a Gestão ainda não aplicou já
 * ocupa a dela.
 */
export function aulasDoDia(
  alunos: Dados[], dia: string,
  { hoje, fechados = [], avisos = {}, reservas = {} }: {
    hoje: string; fechados?: string[]; avisos?: Record<string, AvisosPendentes>; reservas?: Record<string, ReservasPendentes>;
  },
): AulaNaTurma[] {
  const semana = datasDaSemana(dia);
  const fech = new Set(fechados);
  const out: AulaNaTurma[] = [];
  for (const ficha of alunos) {
    const id = String(ficha.id ?? '');
    const a = comReservas(ficha, reservas[id]);
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

/**
 * A grade de horários do box quando o coach ainda não mexeu nela — a MESMA de
 * `coach/gestao-de-alunos/presenca-regras.js` (o checar-presenca compara).
 * Seg a sex 6h–10h e 15h–17h; à noite 10 min depois da hora (18:10, 19:10,
 * 20:10; na sexta a última é 18:10); sábado 8h, 10h e 12:30.
 */
const MANHA = ['06:00', '07:00', '08:00', '09:00', '10:00'];
const TARDE = ['15:00', '16:00', '17:00'];
export const GRADE_PADRAO: Readonly<Record<string, readonly string[]>> = Object.freeze({
  seg: [...MANHA, ...TARDE, '18:10', '19:10', '20:10'],
  ter: [...MANHA, ...TARDE, '18:10', '19:10', '20:10'],
  qua: [...MANHA, ...TARDE, '18:10', '19:10', '20:10'],
  qui: [...MANHA, ...TARDE, '18:10', '19:10', '20:10'],
  sex: [...MANHA, ...TARDE, '18:10'],
  sab: ['08:00', '10:00', '12:30'],
  dom: [],
});

/** Os horários fixos de turma de um dia da semana: a grade salva pelo coach (`meta.turmas.grade`) ou a padrão. */
export function horasDaGrade(config: unknown, diaChave: string): string[] {
  const g = mapa(mapa(config).grade);
  const salva = g[diaChave];
  const horas = Array.isArray(salva) ? salva : [...(GRADE_PADRAO[diaChave] ?? [])];
  return horas.filter((h): h is string => typeof h === 'string' && /^\d{2}:\d{2}$/.test(h)).sort();
}

export interface Ocupacao { dia: string; hora: string; capacidade: number; ocupadas: number; vagas: number }

/**
 * A ocupação das turmas de `dia` — só números, sem nome de ninguém: é isso
 * que o aluno pode ver dos outros. Entram as turmas da grade do box (mesmo
 * vazias), as que têm aluno e as de aula experimental; turma sem horário fica
 * de fora.
 */
export function ocupacaoDoDia(
  alunos: Dados[], dia: string,
  o: {
    hoje: string; fechados?: string[]; experimentais?: unknown; config?: unknown;
    avisos?: Record<string, AvisosPendentes>; reservas?: Record<string, ReservasPendentes>;
  },
): Ocupacao[] {
  const aulas = aulasDoDia(alunos, dia, o);
  const exps = lista(mapa(o.experimentais)[dia]).map(mapa).filter((x) => texto(x.hora));
  const horas = [...new Set([...horasDaGrade(o.config, chaveDoDia(dia)), ...aulas.map((x) => x.hora), ...exps.map((x) => texto(x.hora))])]
    .filter(Boolean).sort();
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
    expira: !noPrazo ? null : tipo === 'titular' ? validadeDoCredito(relogio.hoje) : expiraReposicao,
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

/* ============================================================
   Reposição marcada pelo aluno
   ============================================================ */

/** Até quantos minutos antes da aula o aluno marca a reposição (o mesmo do coach). */
export const ANTECEDENCIA_REPOSICAO_MIN = 60;
/** Até quantos dias à frente: o mesmo horizonte da ocupação que ele vê. */
export const HORIZONTE_REPOSICAO_DIAS = 7;

/**
 * A reposição que o aluno marcou e a Gestão ainda não aplicou na ficha:
 * `reposicoesAluno/{email}.itens[origem]`, por aula de origem do crédito.
 */
export interface ReservaPendente { origem: string; data: string; hora: string }
export type ReservasPendentes = Record<string, ReservaPendente>;

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const creditoVencido = (v: Dados, hoje: string) => !!texto(v.expira) && texto(v.expira) < hoje;
const temReposicao = (v: unknown) => !!texto(mapa(mapa(v).reposicao).data);

/**
 * A ficha como vai ficar quando a Gestão aplicar o que está pendente: a
 * reserva vira `atestados[origem].reposicao` e, com `avisos` (os itens brutos
 * de `avisosAusencia/{email}`), o "Não irei" no prazo vira o crédito dele.
 */
export function comReservas(a: Dados, reservas: ReservasPendentes = {}, avisos: Dados = {}): Dados {
  if (!Object.keys(reservas).length && !Object.keys(avisos).length) return a;
  const atestados: Dados = { ...mapa(a.atestados) };
  for (const v of Object.values(avisos)) {
    const i = mapa(v);
    const chave = texto(i.chave);
    if (i.tipo !== 'titular' || i.noPrazo !== true || !chave || atestados[chave]) continue;
    atestados[chave] = { tipo: 'desmarcacao', expira: texto(i.expira) || null, reposicao: null };
  }
  for (const r of Object.values(reservas)) {
    const v = atestados[r.origem];
    if (temReposicao(v)) continue;
    // Sem o crédito na ficha: ele ainda é um "Não irei" que a Gestão não aplicou.
    atestados[r.origem] = { ...(v ? mapa(v) : { tipo: 'desmarcacao', expira: null }), reposicao: { data: r.data, hora: r.hora } };
  }
  return { ...a, atestados };
}

/** As reservas que a Gestão ainda não aplicou, de `reposicoesAluno/*`: só as deste coach, por aluno. */
export function reservasPorAluno(docs: unknown[], coachUid: string): Record<string, ReservasPendentes> {
  const out: Record<string, ReservasPendentes> = {};
  for (const doc of docs) {
    for (const v of Object.values(mapa(mapa(doc).itens))) {
      const i = mapa(v);
      if (i.coachUid !== coachUid || !texto(i.alunoId) || !texto(i.origem) || !EH_DATA.test(texto(i.data))) continue;
      (out[texto(i.alunoId)] ??= {})[texto(i.origem)] = { origem: texto(i.origem), data: texto(i.data), hora: texto(i.hora) };
    }
  }
  return out;
}

/** Os créditos livres e no prazo, do que vence primeiro ao que não vence (atestado médico). */
export function creditosLivres(a: Dados, hoje: string): { origem: string; expira: string | null }[] {
  return Object.entries(mapa(a.atestados))
    .filter(([, v]) => v && !temReposicao(v) && !creditoVencido(mapa(v), hoje))
    .map(([origem, v]) => ({ origem, expira: texto(mapa(v).expira) || null }))
    .sort((x, y) => ((x.expira ?? '9999') + x.origem < (y.expira ?? '9999') + y.origem ? -1 : 1));
}

/**
 * Alguma aula do aluno já usa `dia`? Um dia só fecha UMA aula (a mesma trava
 * do coach, `donoDoDia` em checkin-regras.js): a da grade que não foi
 * desmarcada, no dia em que acontece, e as reposições marcadas.
 */
export function diaJaTemAula(a: Dados, dia: string): boolean {
  const atestados = mapa(a.atestados), remarcacoes = mapa(a.remarcacoes);
  const semana = datasDaSemana(dia);
  for (const k of lista(a.diasTreino)) {
    const plan = semana[String(k)];
    if (!plan || atestados[plan]) continue;
    const r = remarcacoes[plan];
    if ((typeof r === 'string' ? r : texto(mapa(r).data) || plan) === dia) return true;
  }
  return Object.values(atestados).some((v) => texto(mapa(mapa(v).reposicao).data) === dia);
}

export interface ResultadoReposicao { origem: string; expira: string | null; aula: Onde; antecedenciaMin: number }

/**
 * O aluno marca a reposição numa turma. `a` já vem com o pendente
 * (`comReservas`); `vagas` é a da turma naquele dia e horário, ou null quando
 * não há turma ali. Confere, como `agendarReposicaoNaTurma` do coach: a turma
 * existe e não começou, falta 1h ou mais, cai nos próximos 7 dias, o dia está
 * livre, há vaga e um crédito que vale até a data. O crédito usado é o que
 * vence primeiro.
 */
export function avaliarReposicao(
  a: Dados, aula: Onde, { relogio, vagas }: { relogio: Relogio; vagas: number | null },
): ResultadoReposicao | { erro: string } {
  if (!EH_DATA.test(aula.data) || !/^\d{2}:\d{2}$/.test(aula.hora)) return { erro: 'Turma inválida.' };
  if (vagas == null) return { erro: 'Não há turma nesse dia e horário.' };
  const ant = antecedenciaMin(relogio, aula.data, aula.hora);
  if (ant == null || ant <= 0) return { erro: 'Essa aula já começou.' };
  if (ant < ANTECEDENCIA_REPOSICAO_MIN) return { erro: 'A reposição só pode ser marcada até 1h antes da aula.' };
  if (aula.data > somarDias(relogio.hoje, HORIZONTE_REPOSICAO_DIAS - 1)) return { erro: `Dá para marcar só nas aulas dos próximos ${HORIZONTE_REPOSICAO_DIAS} dias.` };
  if (diaJaTemAula(a, aula.data)) return { erro: 'Você já tem aula nesse dia.' };
  if (vagas <= 0) return { erro: 'Turma lotada.' };
  const creditos = creditosLivres(a, relogio.hoje);
  if (!creditos.length) return { erro: 'Você não tem crédito de reposição.' };
  const credito = creditos.find((c) => !c.expira || aula.data <= c.expira);
  // Sem crédito que chegue até a data: todos têm validade, e o último vence antes.
  if (!credito) return { erro: `O seu crédito vale até ${ddmm(texto(creditos[creditos.length - 1].expira))}. Escolha uma aula até lá.` };
  return { origem: credito.origem, expira: credito.expira, aula, antecedenciaMin: ant };
}
