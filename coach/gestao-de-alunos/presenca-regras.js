// @ts-check
/**
 * As regras do Painel de Presença (tela Turmas) — a turma de cada horário, o
 * prazo de desmarcar e os créditos de reposição.
 *
 * Puro, como o checkin-regras.js: cada função recebe a ficha (e o relógio) e
 * DEVOLVE o que gravar e a linha do log, ou uma recusa. Quem grava é a tela
 * (ui-tela-turmas.js).
 *
 * AS REGRAS DO BOX
 *   1. Quem tem grade fixa (`diasTreino` + `horarios`) está na turma do seu
 *      horário automaticamente — a turma é calculada, não cadastrada.
 *   2. Desmarcou com PRAZO_DESMARCAR_MIN (2h) ou mais de antecedência: a vaga
 *      fica livre e ele ganha +1 crédito de reposição, que vale
 *      VALIDADE_CREDITO_DIAS (30 dias).
 *   3. Desmarcou com menos de 2h, ou não veio (no-show): falta, sem crédito.
 *      O coach pode abrir uma exceção e conceder o crédito mesmo assim.
 *   4. Reposição só se agenda até ANTECEDENCIA_REPOSICAO_MIN (1h) antes do
 *      treino, numa turma com vaga, e dentro da validade do crédito.
 *
 * ONDE MORA NA FICHA
 *   O crédito é uma entrada de `atestados` — o mesmo mapa do atestado médico,
 *   que já sabe agendar reposição e já é lido pelo Portal e pelo app. O que
 *   muda é `tipo` ('desmarcacao' | 'excecao') e `expira`:
 *     atestados[diaPlanejado] = { em, tipo, aula: {data, hora}, expira, reposicao }
 *   A falta sem crédito vai num mapa à parte:
 *     faltas[diaPlanejado] = { em, tipo: 'fora-do-prazo' | 'no-show', aula }
 *   `aula` guarda onde a aula estava quando foi desmarcada: a remarcação sai,
 *   mas a turma daquele dia continua mostrando quem desmarcou.
 *
 * O RELÓGIO é sempre o do box ('AAAA-MM-DD' + 'HH:MM', hora local): o prazo é
 * a diferença entre duas horas de parede, sem fuso no meio.
 *
 * @typedef {import('./checkin-regras.js').Mudanca} Mudanca
 * @typedef {import('./checkin-regras.js').Recusa} Recusa
 * @typedef {import('./checkin-regras.js').Relogio} Relogio
 * @typedef {'confirmado'|'presente'|'desmarcou-no-prazo'|'desmarcou-fora'|'falta'|'atestado'|'fechado'} StatusAula
 * @typedef {{ data: string, hora: string }} Onde
 * @typedef {Object} AulaNaTurma
 * @property {any} aluno                    a ficha
 * @property {'titular'|'reposicao'} tipo
 * @property {string} chave                 titular: o dia planejado; reposição: a aula que gerou o crédito
 * @property {string} hora                  'HH:MM' da turma ('' = sem horário na ficha)
 * @property {StatusAula} status
 * @property {any} [credito]                a entrada de `atestados`, quando há crédito
 * @property {any} [registro]               a entrada de `faltas`, quando o coach lançou a falta
 * @property {boolean} [automatica]         falta calculada (o dia passou), não lançada
 * @property {string} [horaCheckin]
 * @typedef {{ id: string, nome: string, telefone?: string, hora: string, status: 'confirmado'|'presente'|'falta'|'cancelada', em: number }} Experimental
 */
import { datasDaSemana, chaveDoDia } from '../../compartilhado/regras/semana.js';
import { diaEfetivo, outraAulaUsa, agendarReposicao, desmarcarReposicao } from './checkin-regras.js?v=25';

/**
 * O mesmo `creditoVencido` do semana.js, de propósito aqui: o semana.js é
 * carregado SEM versão (o compartilhado também o importa), e um navegador com
 * a cópia antiga em cache derrubaria a Gestão inteira num import que ela não
 * exporta. @param {any} credito @param {string} hojeIso
 */
const creditoVencido = (credito, hojeIso) => !!(credito && credito.expira && credito.expira < hojeIso);

/** Antecedência mínima para desmarcar e ganhar o crédito, em minutos. */
export const PRAZO_DESMARCAR_MIN = 120;
/** Até quantos minutos antes da aula uma reposição pode ser agendada. */
export const ANTECEDENCIA_REPOSICAO_MIN = 60;
/** Por quantos dias o crédito de reposição vale, contando do dia em que nasceu. */
export const VALIDADE_CREDITO_DIAS = 30;
/** Vagas de uma turma quando o coach não definiu outra. */
export const CAPACIDADE_PADRAO = 6;

/** O nome de cada status, como aparece na tela. */
export const STATUS = Object.freeze({
  'confirmado': 'Confirmado',
  'presente': 'Presente',
  'desmarcou-no-prazo': 'Desmarcou no prazo',
  'desmarcou-fora': 'Desmarcou fora do prazo',
  'falta': 'Falta',
  'atestado': 'Atestado',
  'fechado': 'Box fechado',
});

/** Quem conta como vaga ocupada. Desmarcou (no prazo ou fora) e atestado liberam. */
const OCUPA = new Set(['confirmado', 'presente', 'falta']);

/* ============================================================
   Relógio
   ============================================================ */

/** 'AAAA-MM-DD' + 'HH:MM' → minutos corridos (hora de parede). null sem hora válida. */
function minutosDe(/** @type {string} */ dia, /** @type {string} */ hora) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia || ''));
  const h = /^(\d{1,2}):(\d{2})$/.exec(String(hora || ''));
  if (!d || !h) return null;
  return Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]) / 60000;
}

/**
 * Quantos minutos faltam de `relogio` até a aula (negativo: já começou).
 * null quando a aula não tem hora.
 * @param {Relogio} relogio @param {string} dia @param {string} hora
 */
export function antecedenciaMin(relogio, dia, hora) {
  const aula = minutosDe(dia, hora), agora = minutosDe(relogio.hoje, relogio.agora);
  return aula == null || agora == null ? null : aula - agora;
}

/** 'AAAA-MM-DD' + n dias. @param {string} iso @param {number} n */
export function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };

/** 130 → '2h10', 45 → '45min', negativo → 'depois do início'. @param {number} min */
export function textoAntecedencia(min) {
  if (min < 0) return 'depois do início';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''} antes` : `${m}min antes`;
}

/* ============================================================
   A turma de cada horário
   ============================================================ */

/**
 * Onde a aula planejada para `diaPlanejado` acontece: o dia e a hora. Uma aula
 * já desmarcada fica onde estava quando foi desmarcada (`aula`).
 * @param {any} a @param {string} diaPlanejado @returns {Onde}
 */
export function ondeAcontece(a, diaPlanejado) {
  const reg = (a.atestados || {})[diaPlanejado] || (a.faltas || {})[diaPlanejado];
  if (reg && reg.aula && reg.aula.data) return { data: reg.aula.data, hora: reg.aula.hora || '' };
  const r = (a.remarcacoes || {})[diaPlanejado];
  const data = diaEfetivo(a, diaPlanejado);
  const horarios = a.horarios || {};
  const hora = (r && typeof r === 'object' && r.hora) || horarios[chaveDoDia(data)] || horarios[chaveDoDia(diaPlanejado)] || '';
  return { data, hora };
}

/**
 * O status do titular na aula de `dia`.
 * @param {any} a @param {string} plan o dia planejado @param {string} dia @param {string} hoje @param {Set<string>} fechados
 * @returns {Pick<AulaNaTurma, 'status'|'credito'|'registro'|'automatica'|'horaCheckin'>}
 */
function statusTitular(a, plan, dia, hoje, fechados) {
  const at = (a.atestados || {})[plan], fa = (a.faltas || {})[plan];
  if (at) {
    if (at.tipo === 'desmarcacao') return { status: 'desmarcou-no-prazo', credito: at };
    if (at.tipo === 'excecao') return { status: at.antes === 'fora-do-prazo' ? 'desmarcou-fora' : 'falta', credito: at };
    return { status: 'atestado', credito: at };
  }
  // A presença ganha da falta lançada: é o coach corrigindo o que marcou.
  if ((a.presencas || []).includes(dia)) return { status: 'presente', horaCheckin: (a.presencaHoras || {})[dia] };
  if (fa) return { status: fa.tipo === 'fora-do-prazo' ? 'desmarcou-fora' : 'falta', registro: fa };
  if (fechados.has(dia)) return { status: 'fechado' };
  if (dia < hoje) return { status: 'falta', automatica: true };
  return { status: 'confirmado' };
}

/**
 * O status de quem veio repor em `dia`.
 * @param {any} a @param {any} credito a entrada de `atestados` @param {string} dia @param {string} hoje @param {Set<string>} fechados
 * @returns {Pick<AulaNaTurma, 'status'|'credito'|'automatica'|'horaCheckin'>}
 */
function statusReposicao(a, credito, dia, hoje, fechados) {
  const rep = credito.reposicao;
  if ((a.presencas || []).includes(dia)) return { status: 'presente', credito, horaCheckin: (a.presencaHoras || {})[dia] };
  if (rep.foraDoPrazo) return { status: 'desmarcou-fora', credito };
  if (rep.noShow) return { status: 'falta', credito };
  if (fechados.has(dia)) return { status: 'fechado', credito };
  if (dia < hoje) return { status: 'falta', credito, automatica: true };
  return { status: 'confirmado', credito };
}

/**
 * Todo mundo que tem aula em `dia`: os titulares da grade fixa (no dia em que a
 * aula acontece de fato) e quem marcou reposição para o dia.
 * @param {any[]} alunos os ativos @param {string} dia
 * @param {{ hoje: string, fechados?: string[] }} o
 * @returns {AulaNaTurma[]}
 */
export function aulasDoDia(alunos, dia, { hoje, fechados = [] }) {
  const semana = datasDaSemana(new Date(dia + 'T00:00:00'));
  const fech = new Set(fechados);
  /** @type {AulaNaTurma[]} */
  const out = [];
  for (const a of alunos) {
    for (const k of a.diasTreino || []) {
      const plan = semana[k];
      if (!plan) continue;
      const onde = ondeAcontece(a, plan);
      if (onde.data !== dia) continue;
      out.push({ aluno: a, tipo: 'titular', chave: plan, hora: onde.hora, ...statusTitular(a, plan, dia, hoje, fech) });
    }
    for (const [origem, v] of Object.entries(a.atestados || {})) {
      const rep = v && v.reposicao;
      if (!rep || rep.data !== dia) continue;
      out.push({ aluno: a, tipo: 'reposicao', chave: origem, hora: rep.hora || '', ...statusReposicao(a, v, dia, hoje, fech) });
    }
  }
  return out;
}

/**
 * As vagas de uma turma: a definida para o horário, a padrão do box, ou 6.
 * @param {{ padrao?: number, porHorario?: Record<string, number> } | null | undefined} config @param {string} hora
 */
export function capacidadeDaTurma(config, hora) {
  const c = config || {};
  const n = (c.porHorario || {})[hora];
  if (Number.isFinite(n) && n >= 0) return Number(n);
  return Number.isFinite(c.padrao) && Number(c.padrao) >= 0 ? Number(c.padrao) : CAPACIDADE_PADRAO;
}

/**
 * As turmas do dia, uma por horário, em ordem (sem horário por último).
 * @param {any[]} alunos @param {string} dia
 * @param {{ hoje: string, fechados?: string[], experimentais?: Experimental[], config?: any, horasExtras?: string[] }} o
 *   horasExtras: horários que o coach abriu à mão (aparecem mesmo vazios)
 */
export function turmasDoDia(alunos, dia, { hoje, fechados = [], experimentais = [], config = null, horasExtras = [] }) {
  const aulas = aulasDoDia(alunos, dia, { hoje, fechados });
  const horas = new Set([...aulas.map((x) => x.hora), ...experimentais.map((x) => x.hora || ''), ...horasExtras]);
  const nome = (/** @type {AulaNaTurma} */ x) => String(x.aluno.nome || '');
  return [...horas]
    .sort((x, y) => (x === '' ? 1 : y === '' ? -1 : x < y ? -1 : x > y ? 1 : 0))
    .map((hora) => {
      const daTurma = aulas.filter((x) => x.hora === hora).sort((x, y) => nome(x).localeCompare(nome(y), 'pt-BR'));
      const exps = experimentais.filter((x) => (x.hora || '') === hora);
      const capacidade = capacidadeDaTurma(config, hora);
      const ocupadas = daTurma.filter((x) => OCUPA.has(x.status)).length + exps.filter((x) => x.status !== 'cancelada').length;
      return { hora, capacidade, ocupadas, vagas: Math.max(0, capacidade - ocupadas), lotada: ocupadas >= capacidade, aulas: daTurma, experimentais: exps };
    });
}

/* ============================================================
   Créditos
   ============================================================ */

/**
 * Os créditos que o aluno ainda pode usar: sem reposição marcada e dentro da
 * validade, do que vence primeiro para o que vence por último (atestado
 * médico, que não vence, no fim).
 * @param {any} a @param {string} hoje
 * @returns {{ origem: string, tipo: string, expira: string | null }[]}
 */
export function creditosDisponiveis(a, hoje) {
  return Object.entries(a.atestados || {})
    .filter(([, v]) => v && !(v.reposicao && v.reposicao.data) && !creditoVencido(v, hoje))
    .map(([origem, v]) => ({ origem, tipo: v.tipo || 'atestado', expira: v.expira || null }))
    .sort((x, y) => (x.expira || '9999') < (y.expira || '9999') ? -1 : (x.expira || '9999') > (y.expira || '9999') ? 1 : x.origem < y.origem ? -1 : 1);
}

/* ============================================================
   As ações
   ============================================================ */

/** @param {any} a @param {string} chave @param {string} texto @returns {Recusa} */
const recusa = (a, chave, texto) => ({ recusa: { chave: `${a.id}|${chave}`, texto } });

/** A presença de `dia` sai, a menos que outra aula do aluno use o dia. */
function semPresenca(/** @type {any} */ a, /** @type {string} */ identidade, /** @type {string} */ dia) {
  const presencas = new Set(a.presencas || []);
  const presencaHoras = { ...(a.presencaHoras || {}) };
  if (!outraAulaUsa(a, identidade, dia)) { presencas.delete(dia); delete presencaHoras[dia]; }
  return { presencas: [...presencas].sort(), presencaHoras };
}

/**
 * O que a desmarcação daria, sem gravar nada — para a tela mostrar antes do
 * coach confirmar ("faltam 3h10: gera crédito").
 * @param {any} a @param {string} diaPlanejado @param {Relogio} aviso quando o aluno avisou
 * @returns {{ noPrazo: boolean, antecedenciaMin: number } | null} null: aula sem horário
 */
export function previaDesmarcacao(a, diaPlanejado, aviso) {
  const onde = ondeAcontece(a, diaPlanejado);
  const ant = antecedenciaMin(aviso, onde.data, onde.hora);
  return ant == null ? null : { noPrazo: ant >= PRAZO_DESMARCAR_MIN, antecedenciaMin: ant };
}

/**
 * DESMARCAR — o titular avisou que não vem. O prazo conta da hora em que ele
 * AVISOU (`aviso`), não da hora em que o coach lançou: a mensagem das 5h lida
 * às 8h continua no prazo de uma aula das 9h.
 *   ≥ 2h: a vaga fica livre e nasce o crédito (30 dias, a contar do aviso);
 *   < 2h: falta, sem crédito.
 * @param {any} a @param {string} diaPlanejado
 * @param {{ aviso: Relogio, em: number }} o em: o instante do lançamento
 * @returns {Mudanca | Recusa}
 */
export function desmarcar(a, diaPlanejado, { aviso, em }) {
  if ((a.atestados || {})[diaPlanejado]) return recusa(a, diaPlanejado, 'Essa aula já tem crédito de reposição');
  const onde = ondeAcontece(a, diaPlanejado);
  const ant = antecedenciaMin(aviso, onde.data, onde.hora);
  if (ant == null) return recusa(a, diaPlanejado, 'Aula sem horário na ficha: defina o horário para medir o prazo');
  const noPrazo = ant >= PRAZO_DESMARCAR_MIN;

  const atestados = { ...(a.atestados || {}) };
  const faltas = { ...(a.faltas || {}) };
  const remarcacoes = { ...(a.remarcacoes || {}) };
  delete remarcacoes[diaPlanejado];
  const expira = somarDias(aviso.hoje, VALIDADE_CREDITO_DIAS);
  if (noPrazo) {
    delete faltas[diaPlanejado];
    atestados[diaPlanejado] = { em, tipo: 'desmarcacao', aula: onde, antecedenciaMin: ant, expira, reposicao: null };
  } else {
    faltas[diaPlanejado] = { em, tipo: 'fora-do-prazo', aula: onde, antecedenciaMin: ant };
  }
  const quando = `${textoAntecedencia(ant)} · aula de ${ddmm(onde.data)}${onde.hora ? ' ' + onde.hora : ''}`;
  return {
    patch: { atestados, faltas, remarcacoes, ...semPresenca(a, diaPlanejado, onde.data) },
    log: noPrazo
      ? { tipo: 'desmarcacao', resumo: `Desmarcou no prazo (${quando}) · +1 crédito até ${ddmm(expira)}`, extra: { dia: diaPlanejado, chave: `atestado:${a.id}:${diaPlanejado}` } }
      : { tipo: 'falta', resumo: `Desmarcou fora do prazo (${quando}) · sem crédito`, extra: { dia: diaPlanejado, chave: `falta:${a.id}:${diaPlanejado}` } },
  };
}

/**
 * DESMARCAR A REPOSIÇÃO — a mesma régua de 2h. No prazo, o crédito volta para
 * a fila (com a validade que já tinha); fora do prazo, a reposição vira falta
 * e o crédito foi gasto.
 * @param {any} a @param {string} origem a aula que gerou o crédito
 * @param {{ aviso: Relogio, em: number }} o
 * @returns {Mudanca | Recusa | null} null: não há reposição marcada
 */
export function desmarcarReposicaoComAviso(a, origem, { aviso, em }) {
  const v = (a.atestados || {})[origem];
  const rep = v && v.reposicao;
  if (!rep || !rep.data) return null;
  const ant = antecedenciaMin(aviso, rep.data, rep.hora);
  if (ant == null) return recusa(a, origem, 'Reposição sem horário: não dá para medir o prazo');
  const quando = `${textoAntecedencia(ant)} · reposição de ${ddmm(rep.data)}${rep.hora ? ' ' + rep.hora : ''}`;
  if (ant >= PRAZO_DESMARCAR_MIN) {
    const r = desmarcarReposicao(a, origem);
    return r && { patch: r.patch, log: { tipo: 'reposicao', resumo: `Desmarcou a reposição no prazo (${quando}) · o crédito volta`, extra: { dia: rep.data } } };
  }
  const atestados = { ...(a.atestados || {}), [origem]: { ...v, reposicao: { ...rep, foraDoPrazo: true, desmarcadaEm: em, antecedenciaMin: ant } } };
  return {
    patch: { atestados, ...semPresenca(a, origem, rep.data) },
    log: { tipo: 'falta', resumo: `Desmarcou a reposição fora do prazo (${quando}) · crédito perdido`, extra: { dia: rep.data } },
  };
}

/**
 * NO-SHOW — não veio e não avisou. Falta, sem crédito.
 * @param {any} a @param {string} diaPlanejado @param {{ em: number }} o
 * @returns {Mudanca | Recusa}
 */
export function marcarNoShow(a, diaPlanejado, { em }) {
  if ((a.atestados || {})[diaPlanejado]) return recusa(a, diaPlanejado, 'Essa aula já tem crédito de reposição');
  const onde = ondeAcontece(a, diaPlanejado);
  const faltas = { ...(a.faltas || {}), [diaPlanejado]: { em, tipo: 'no-show', aula: onde } };
  const remarcacoes = { ...(a.remarcacoes || {}) };
  delete remarcacoes[diaPlanejado];
  return {
    patch: { faltas, remarcacoes, ...semPresenca(a, diaPlanejado, onde.data) },
    log: { tipo: 'falta', resumo: `No-show · aula de ${ddmm(onde.data)}${onde.hora ? ' ' + onde.hora : ''}`, extra: { dia: diaPlanejado, chave: `falta:${a.id}:${diaPlanejado}` } },
  };
}

/**
 * NO-SHOW NA REPOSIÇÃO — o crédito foi gasto.
 * @param {any} a @param {string} origem @param {{ em: number }} o
 * @returns {Mudanca | null}
 */
export function noShowReposicao(a, origem, { em }) {
  const v = (a.atestados || {})[origem];
  const rep = v && v.reposicao;
  if (!rep || !rep.data) return null;
  const atestados = { ...(a.atestados || {}), [origem]: { ...v, reposicao: { ...rep, noShow: true, noShowEm: em } } };
  return {
    patch: { atestados, ...semPresenca(a, origem, rep.data) },
    log: { tipo: 'falta', resumo: `No-show na reposição de ${ddmm(rep.data)}${rep.hora ? ' ' + rep.hora : ''} · crédito perdido`, extra: { dia: rep.data } },
  };
}

/**
 * CONCEDER CRÉDITO (exceção) — o coach dá o crédito a quem não teria direito:
 * desmarcou fora do prazo, ou faltou. Vale 30 dias a partir de hoje.
 * @param {any} a @param {string} diaPlanejado @param {{ hoje: string, em: number }} o
 * @returns {Mudanca | Recusa}
 */
export function concederCredito(a, diaPlanejado, { hoje, em }) {
  if ((a.atestados || {})[diaPlanejado]) return recusa(a, diaPlanejado, 'Essa aula já tem crédito de reposição');
  const fa = (a.faltas || {})[diaPlanejado];
  const onde = ondeAcontece(a, diaPlanejado);
  const expira = somarDias(hoje, VALIDADE_CREDITO_DIAS);
  const atestados = { ...(a.atestados || {}), [diaPlanejado]: { em, tipo: 'excecao', antes: fa ? fa.tipo : 'no-show', aula: onde, expira, reposicao: null } };
  const faltas = { ...(a.faltas || {}) };
  delete faltas[diaPlanejado];
  const remarcacoes = { ...(a.remarcacoes || {}) };
  delete remarcacoes[diaPlanejado];
  return {
    patch: { atestados, faltas, remarcacoes },
    log: { tipo: 'credito', resumo: `Crédito de reposição concedido (exceção) · aula de ${ddmm(onde.data)} · vale até ${ddmm(expira)}`, extra: { dia: diaPlanejado, chave: `atestado:${a.id}:${diaPlanejado}` } },
  };
}

/**
 * CONCEDER CRÉDITO NA REPOSIÇÃO (exceção) — a reposição perdida (fora do prazo
 * ou no-show) devolve o crédito, com 30 dias a partir de hoje.
 * @param {any} a @param {string} origem @param {{ hoje: string, em: number }} o
 * @returns {Mudanca | null}
 */
export function concederCreditoReposicao(a, origem, { hoje, em }) {
  const v = (a.atestados || {})[origem];
  const rep = v && v.reposicao;
  if (!rep || !rep.data) return null;
  const expira = somarDias(hoje, VALIDADE_CREDITO_DIAS);
  const atestados = { ...(a.atestados || {}), [origem]: { ...v, reposicao: null, expira, excecaoEm: em } };
  return {
    patch: { atestados, ...semPresenca(a, origem, rep.data) },
    log: { tipo: 'credito', resumo: `Crédito devolvido (exceção) · reposição de ${ddmm(rep.data)} · vale até ${ddmm(expira)}`, extra: { dia: rep.data } },
  };
}

/**
 * AGENDAR REPOSIÇÃO NA TURMA — usa um crédito para pôr o aluno numa turma.
 * Confere, nesta ordem: o crédito existe e está livre, não venceu, a aula cai
 * dentro da validade, a turma tem horário, faltam 1h ou mais, e há vaga. O
 * resto (o dia já ocupado por outra aula dele) é com `agendarReposicao`.
 * @param {any} a @param {string} origem @param {Onde} turma
 * @param {{ relogio: Relogio, vagas: number }} o
 * @returns {Mudanca | Recusa | null}
 */
export function agendarReposicaoNaTurma(a, origem, { data, hora }, { relogio, vagas }) {
  const v = (a.atestados || {})[origem];
  if (!v) return recusa(a, origem, 'Crédito não encontrado');
  if (v.reposicao && v.reposicao.data) return recusa(a, origem, 'Esse crédito já tem reposição marcada');
  if (creditoVencido(v, relogio.hoje)) return recusa(a, origem, `Crédito vencido em ${ddmm(v.expira)}`);
  if (v.expira && data > v.expira) return recusa(a, origem, `O crédito vale até ${ddmm(v.expira)}`);
  const ant = antecedenciaMin(relogio, data, hora);
  if (ant == null) return recusa(a, origem, 'Escolha uma turma com horário');
  if (ant < ANTECEDENCIA_REPOSICAO_MIN) return recusa(a, origem, 'Reposição só pode ser marcada até 1h antes da aula');
  if (vagas <= 0) return recusa(a, origem, 'Turma lotada');
  return agendarReposicao(a, origem, data, hora);
}

/**
 * DESFAZER NA TURMA — devolve a reposição ao estado "confirmado": tira a marca
 * de desmarcada fora do prazo ou de no-show (e a presença, se houver).
 * @param {any} a @param {string} origem
 * @returns {Mudanca | null}
 */
export function reabrirReposicao(a, origem) {
  const v = (a.atestados || {})[origem];
  const rep = v && v.reposicao;
  if (!rep || !rep.data) return null;
  const { foraDoPrazo: _f, desmarcadaEm: _d, antecedenciaMin: _a, noShow: _n, noShowEm: _ne, ...limpa } = rep;
  const atestados = { ...(a.atestados || {}), [origem]: { ...v, reposicao: limpa } };
  return {
    patch: { atestados, ...semPresenca(a, origem, rep.data) },
    log: { tipo: 'presenca-removida', resumo: `Reposição de ${ddmm(rep.data)} reaberta`, extra: { dia: rep.data } },
  };
}

/* ============================================================
   Aula experimental (quem ainda não é aluno — mora no documento do box)
   ============================================================ */

/**
 * Põe uma aula experimental na turma. Precisa de nome e de vaga.
 * @param {Experimental[]} lista as do dia
 * @param {{ nome: string, telefone?: string, hora: string }} dados
 * @param {{ id: string, em: number, vagas: number }} o
 * @returns {{ lista: Experimental[] } | { recusa: string }}
 */
export function adicionarExperimental(lista, { nome, telefone = '', hora }, { id, em, vagas }) {
  const n = String(nome || '').trim();
  if (!n) return { recusa: 'Escreva o nome de quem vem experimentar' };
  if (!hora) return { recusa: 'Escolha uma turma com horário' };
  if (vagas <= 0) return { recusa: 'Turma lotada' };
  return { lista: [...lista, { id, nome: n, telefone: String(telefone || '').trim(), hora, status: 'confirmado', em }] };
}

/**
 * Muda o status de uma experimental (presente, falta, cancelada, confirmado).
 * @param {Experimental[]} lista @param {string} id @param {Experimental['status']} status
 */
export function statusExperimental(lista, id, status) {
  return lista.map((x) => (x.id === id ? { ...x, status } : x));
}

/** Tira a experimental da lista. @param {Experimental[]} lista @param {string} id */
export function removerExperimental(lista, id) {
  return lista.filter((x) => x.id !== id);
}

/** Dias de aula experimental guardados no documento do box. */
export const GUARDAR_EXPERIMENTAIS_DIAS = 90;

/**
 * Tira do mapa os dias mais velhos que GUARDAR_EXPERIMENTAIS_DIAS: o documento
 * do box tem teto de 1 MB, e a experimental antiga já virou aluno ou lead.
 * @param {Record<string, Experimental[]>} mapa @param {string} hoje
 */
export function podarExperimentais(mapa, hoje) {
  const corte = somarDias(hoje, -GUARDAR_EXPERIMENTAIS_DIAS);
  return Object.fromEntries(Object.entries(mapa || {}).filter(([dia, l]) => dia >= corte && Array.isArray(l) && l.length));
}

/* ============================================================
   O resumo do dia
   ============================================================ */

/**
 * Os números de uma turma, para os cartões do topo.
 * @param {{ aulas: AulaNaTurma[], experimentais: Experimental[] }} turma
 */
export function resumoDaTurma({ aulas, experimentais }) {
  const conta = (/** @type {StatusAula} */ s) => aulas.filter((x) => x.status === s).length;
  return {
    confirmados: conta('confirmado') + experimentais.filter((x) => x.status === 'confirmado').length,
    presentes: conta('presente') + experimentais.filter((x) => x.status === 'presente').length,
    desmarcaram: conta('desmarcou-no-prazo') + conta('desmarcou-fora') + experimentais.filter((x) => x.status === 'cancelada').length,
    faltas: conta('falta') + experimentais.filter((x) => x.status === 'falta').length,
  };
}
