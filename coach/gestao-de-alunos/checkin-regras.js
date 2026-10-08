// @ts-check
/**
 * As regras do Check-in — o que cada ação faz com a ficha do aluno.
 *
 * Puro: cada função recebe a ficha (e o relógio, quando importa) e DEVOLVE o
 * que mudar e a linha do log da aba Registros. Não grava, não registra, não
 * desenha, e não altera a ficha recebida. Quem aplica é a tela
 * (ui-tela-checkin.js): `db.atualizar(id, r.patch)` e `reg(r.log…)`.
 *
 * A grade da semana (ver `semanaDoAluno` em compartilhado/regras/semana.js):
 * cada aula fixa da semana é um quadrado, e cada quadrado responde "essa aula
 * aconteceu?" com uma de três saídas —
 *   CHECK-IN     ele compareceu na aula, no dia e na hora dela;
 *   ALTERAR DIA  avisou antes que não pode; a aula muda de dia e/ou de hora,
 *                DENTRO DA SEMANA;
 *   ATESTADO     conta como falta, mas ele ganha o direito de repor a aula — e
 *                essa reposição pode cair em qualquer semana.
 * Sem nenhuma delas, o prazo passa e a aula vira falta.
 *
 * O que fica gravado na ficha:
 *   presencas      ['AAAA-MM-DD', …] — os dias em que ele veio (ordenados);
 *   presencaHoras  { 'AAAA-MM-DD': 'HH:MM' } — a hora do check-in feito no dia;
 *   remarcacoes    { diaPlanejado: { data, hora } } (antigo: só a data, string);
 *   atestados      { diaPlanejado: { em, reposicao: { data, hora } | null } }.
 *
 * @typedef {{ tipo: string, resumo: string, extra?: Record<string, any> }} LinhaDoLog
 * @typedef {{ patch: Record<string, any>, log: LinhaDoLog }} Mudanca
 *   o que gravar na ficha e o que registrar
 * @typedef {{ recusa: { chave: string, texto: string } }} Recusa
 *   a ação não foi feita; `texto` vai no quadrado `chave` (`${id}|${dia}`)
 * @typedef {{ hoje: string, agora: string }} Relogio
 *   hoje: 'AAAA-MM-DD'; agora: 'HH:MM'
 */
import { datasDaSemana, chaveDoDia } from '../../compartilhado/regras/semana.js';

/** O nome do dia da semana, por extenso. */
export const DIA_EXT = Object.freeze({ seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' });

/** 'AAAA-MM-DD' → 'DD/MM', o formato do log. @param {string} iso */
const ddmm = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };

/** As presenças como lista ordenada, sem repetição. @param {Set<string>} s */
const ordenadas = (s) => [...s].sort();

/* ============================================================
   Onde cada aula acontece
   ============================================================ */

/**
 * A data em que uma aula acontece de fato — a dela, ou a que o coach trocou.
 * @param {any} a @param {string} diaPlanejado
 */
export function diaEfetivo(a, diaPlanejado) {
  const r = (a.remarcacoes || {})[diaPlanejado];
  if (typeof r === 'string') return r;
  return (r && r.data) || diaPlanejado;
}

/**
 * Em que dia cada aula da semana acontece: Map(dia → aula que o ocupa). Usado
 * para não dar o mesmo dia a duas aulas. Atestado não ocupa dia nenhum; a
 * reposição agendada ocupa o dia dela, em nome da aula que a gerou.
 * @param {any} a @param {Record<string, string>} semana datasDaSemana(...)
 * @returns {Map<string, string>}
 */
export function diasReivindicados(a, semana) {
  const rem = a.remarcacoes || {}, atest = a.atestados || {};
  const mapa = new Map();
  for (const k of (a.diasTreino || [])) {
    const iso = semana[k];
    if (!iso || atest[iso]) continue;
    const r = rem[iso];
    mapa.set(typeof r === 'string' ? r : (r && r.data) || iso, iso);
  }
  for (const [origem, v] of Object.entries(atest)) {
    if (v && v.reposicao && v.reposicao.data) mapa.set(v.reposicao.data, origem);
  }
  return mapa;
}

/** A semana (seg…dom) que contém `iso`. @param {string} iso */
const semanaDe = (iso) => datasDaSemana(new Date(iso + 'T00:00:00'));

/**
 * Alguma OUTRA aula também acontece em `dia`? Então a presença daquele dia é
 * das duas, e desfazer uma não pode apagá-la.
 * @param {any} a @param {string} diaPlanejado a aula em questão @param {string} dia
 */
export function outraAulaUsa(a, diaPlanejado, dia) {
  for (const [alvo, dono] of diasReivindicados(a, semanaDe(dia))) {
    if (alvo === dia && dono !== diaPlanejado) return true;
  }
  return false;
}

/**
 * Qual OUTRA aula já usa `diaAlvo` — ou null, se o dia está livre.
 *
 * Um dia só pode fechar UMA aula. Sem esta trava, mandar duas aulas para o mesmo
 * dia deixaria a mesma presença valendo por dois treinos — e o "2 de 4 treinos
 * desta semana", que é a manchete da Gestão e do Portal, contaria uma visita
 * como duas. A semana que importa é a do DIA ALVO, e não a que está na tela:
 * uma reposição para dali a duas semanas confere a agenda daquela semana.
 * @param {any} a @param {string} diaPlanejado @param {string} diaAlvo
 */
export function donoDoDia(a, diaPlanejado, diaAlvo) {
  const dono = diasReivindicados(a, semanaDe(diaAlvo)).get(diaAlvo);
  return !dono || dono === diaPlanejado ? null : dono;
}

/** @param {any} a @param {string} diaPlanejado @param {string} dono @returns {Recusa} */
function recusaDiaOcupado(a, diaPlanejado, dono) {
  return { recusa: { chave: `${a.id}|${diaPlanejado}`, texto: `${DIA_EXT[chaveDoDia(dono)]} já usa esse dia` } };
}

/* ============================================================
   As ações
   ============================================================ */

/**
 * CHECK-IN — o aluno compareceu na aula. A presença é gravada no dia em que a
 * aula acontece (o dela, ou o trocado), e não na data que está na tela: quem
 * responde "aconteceu?" é a aula, não o calendário.
 *
 * A hora só é gravada quando a aula é hoje: confirmando uma aula passada, o
 * relógio de agora não diz nada sobre quando o aluno chegou. Fazer check-in
 * numa aula com atestado é dizer que ela aconteceu — o crédito de reposição
 * perde o sentido e sai junto.
 * @param {any} a @param {string} diaPlanejado (na reposição: o dia dela)
 * @param {Relogio & { ehReposicao?: boolean }} o
 * @returns {Mudanca}
 */
export function checkin(a, diaPlanejado, { ehReposicao = false, hoje, agora }) {
  const dia = ehReposicao ? diaPlanejado : diaEfetivo(a, diaPlanejado);
  const presencas = new Set(a.presencas || []);
  const horas = { ...(a.presencaHoras || {}) };
  presencas.add(dia);
  if (dia === hoje && !horas[dia]) horas[dia] = agora;
  const atestados = { ...(a.atestados || {}) };
  if (!ehReposicao) delete atestados[diaPlanejado];
  return {
    patch: { presencas: ordenadas(presencas), presencaHoras: horas, atestados },
    log: {
      tipo: 'presenca',
      resumo: ehReposicao ? `Check-in da reposição · ${ddmm(dia)}` : dia === hoje ? 'Check-in' : `Check-in · aula de ${ddmm(dia)}`,
      extra: { dia, chave: `presenca:${a.id}:${dia}` },
    },
  };
}

/**
 * ALTERAR DIA — move a aula para outro dia e/ou hora, dentro da semana. Voltar
 * ao dia E à hora originais é desfazer a troca, não gravar uma igual. Trocar o
 * dia substitui o atestado que houvesse.
 * @param {any} a @param {string} diaPlanejado @param {string} data @param {string} [hora]
 * @returns {Mudanca | Recusa}
 */
export function trocarDia(a, diaPlanejado, data, hora) {
  if (data !== diaPlanejado) {
    const dono = donoDoDia(a, diaPlanejado, data);
    if (dono) return recusaDiaOcupado(a, diaPlanejado, dono);
  }
  const remarcacoes = { ...(a.remarcacoes || {}) };
  const horaOriginal = (a.horarios || {})[chaveDoDia(diaPlanejado)] || '';
  if (data === diaPlanejado && (!hora || hora === horaOriginal)) delete remarcacoes[diaPlanejado];
  else remarcacoes[diaPlanejado] = { data, hora: hora || '' };
  const atestados = { ...(a.atestados || {}) };
  delete atestados[diaPlanejado];
  return {
    patch: { remarcacoes, atestados },
    log: {
      tipo: 'troca-aula',
      resumo: remarcacoes[diaPlanejado]
        ? `Aula de ${ddmm(diaPlanejado)} → ${ddmm(data)}${hora ? ' ' + hora : ''}`
        : `Aula de ${ddmm(diaPlanejado)} voltou ao horário original`,
      extra: { dia: diaPlanejado },
    },
  };
}

/**
 * ATESTADO — falta, com direito a repor a aula em qualquer semana. O atestado é
 * a resolução da aula: a troca de dia que houvesse sai, e a presença que
 * porventura estivesse gravada também (a menos que outra aula use o dia).
 * @param {any} a @param {string} diaPlanejado @param {{ em: number }} o em: o instante do lançamento
 * @returns {Mudanca}
 */
export function atestado(a, diaPlanejado, { em }) {
  const atestados = { ...(a.atestados || {}), [diaPlanejado]: { em, reposicao: null } };
  const efetivo = diaEfetivo(a, diaPlanejado);
  const usaOutra = outraAulaUsa(a, diaPlanejado, efetivo);
  const remarcacoes = { ...(a.remarcacoes || {}) };
  delete remarcacoes[diaPlanejado];
  const presencas = new Set(a.presencas || []);
  const horas = { ...(a.presencaHoras || {}) };
  if (!usaOutra) { presencas.delete(efetivo); delete horas[efetivo]; }
  return {
    patch: { atestados, remarcacoes, presencas: ordenadas(presencas), presencaHoras: horas },
    log: { tipo: 'atestado', resumo: `Atestado · aula de ${ddmm(diaPlanejado)}`, extra: { dia: diaPlanejado, chave: `atestado:${a.id}:${diaPlanejado}` } },
  };
}

/**
 * DESFAZER — devolve a aula ao estado aberto: some a troca, some o atestado, e
 * some a presença que ELA registrou — a menos que outra aula da semana também
 * aconteça naquele dia, caso em que a presença é das duas e fica.
 *
 * Uma reposição é identificada pela aula que a gerou (`origem`), não pela data
 * em que foi encaixada. Passando a data, ela se veria na lista de aulas do dia e
 * concluiria que "outra aula usa esse dia" — segurando a própria presença.
 * @param {any} a @param {string} diaPlanejado (na reposição: o dia dela)
 * @param {{ ehReposicao?: boolean, origem?: string }} [o]
 * @returns {Mudanca}
 */
export function desfazer(a, diaPlanejado, { ehReposicao = false, origem } = {}) {
  const efetivo = ehReposicao ? diaPlanejado : diaEfetivo(a, diaPlanejado);
  const identidade = ehReposicao ? origem : diaPlanejado;
  const usaOutra = outraAulaUsa(a, identidade, efetivo);
  const remarcacoes = { ...(a.remarcacoes || {}) };
  const atestados = { ...(a.atestados || {}) };
  if (!ehReposicao) { delete remarcacoes[diaPlanejado]; delete atestados[diaPlanejado]; }
  const presencas = new Set(a.presencas || []);
  const horas = { ...(a.presencaHoras || {}) };
  if (!usaOutra) { presencas.delete(efetivo); delete horas[efetivo]; }
  return {
    patch: { remarcacoes, atestados, presencas: ordenadas(presencas), presencaHoras: horas },
    log: { tipo: 'presenca-removida', resumo: `Aula de ${ddmm(efetivo)} desfeita`, extra: { dia: efetivo } },
  };
}

/**
 * Agenda a reposição de um atestado numa data qualquer (pode ser outra semana).
 * null: faltou a data, ou não há atestado nessa aula.
 * @param {any} a @param {string} origem a aula do atestado @param {string} data @param {string} [hora]
 * @returns {Mudanca | Recusa | null}
 */
export function agendarReposicao(a, origem, data, hora) {
  if (!data) return null;
  const dono = donoDoDia(a, origem, data);
  if (dono) return recusaDiaOcupado(a, origem, dono);
  const atestados = { ...(a.atestados || {}) };
  if (!atestados[origem]) return null;
  atestados[origem] = { ...atestados[origem], reposicao: { data, hora: hora || '' } };
  return {
    patch: { atestados },
    log: { tipo: 'reposicao', resumo: `Reposição da aula de ${ddmm(origem)} marcada para ${ddmm(data)}${hora ? ' ' + hora : ''}`, extra: { dia: data } },
  };
}

/**
 * Desmarca a reposição: o crédito volta para a fila, livre para outra data. A
 * presença do dia da reposição sai junto (se ninguém mais usa o dia).
 * null: não há atestado nessa aula.
 * @param {any} a @param {string} origem
 * @returns {Mudanca | null}
 */
export function desmarcarReposicao(a, origem) {
  const atestados = { ...(a.atestados || {}) };
  if (!atestados[origem]) return null;
  const rep = atestados[origem].reposicao;
  const usaOutra = rep && rep.data ? outraAulaUsa(a, origem, rep.data) : true;
  atestados[origem] = { ...atestados[origem], reposicao: null };
  const presencas = new Set(a.presencas || []);
  const horas = { ...(a.presencaHoras || {}) };
  if (rep && rep.data && !usaOutra) { presencas.delete(rep.data); delete horas[rep.data]; }
  return {
    patch: { atestados, presencas: ordenadas(presencas), presencaHoras: horas },
    log: { tipo: 'reposicao', resumo: `Reposição da aula de ${ddmm(origem)} desmarcada` },
  };
}

/**
 * Presença simples, para o aluno SEM dias de treino cadastrados: marca ou
 * desmarca `dia`. A hora vai num mapa à parte, e não dentro de `presencas`:
 * essa lista é consultada com `.includes(data)` em meia dúzia de lugares (aqui,
 * na gamificação, no Portal) e virar objeto quebraria todos de uma vez.
 * @param {any} a @param {string} dia @param {Relogio} relogio
 * @returns {Mudanca}
 */
export function alternarPresenca(a, dia, { hoje, agora }) {
  const set = new Set(a.presencas || []);
  const horas = { ...(a.presencaHoras || {}) };
  const marcando = !set.has(dia);
  if (marcando) { set.add(dia); if (dia === hoje) horas[dia] = agora; }
  else { set.delete(dia); delete horas[dia]; }
  return {
    patch: { presencas: ordenadas(set), presencaHoras: horas },
    log: marcando
      ? { tipo: 'presenca', resumo: dia === hoje ? 'Check-in' : `Check-in · aula de ${ddmm(dia)}`, extra: { dia, chave: `presenca:${a.id}:${dia}` } }
      : { tipo: 'presenca-removida', resumo: `Check-in de ${ddmm(dia)} desfeito`, extra: { dia } },
  };
}

/* ============================================================
   Quem sumiu
   ============================================================ */

/** Dias sem vir a partir dos quais o aluno "sumiu". */
export const SUMIDO_DIAS = 7;

/** O último dia em que veio, ou null. @param {any} a */
export function ultimaPresenca(a) {
  const p = (a.presencas || []).slice().sort();
  return p.length ? p[p.length - 1] : null;
}

/** Dias inteiros de `iso` até `hoje`. @param {string} iso @param {string} hoje */
export function diasDesde(iso, hoje) {
  return Math.round((new Date(hoje + 'T00:00:00').getTime() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
}

/**
 * Quem está há SUMIDO_DIAS ou mais sem vir (ou nunca veio), do mais sumido
 * para o menos — quem nunca veio primeiro.
 * @param {any[]} alunos @param {string} hoje
 * @returns {{ nome: string, dias: number | null }[]} dias: null = nunca veio
 */
export function quemSumiu(alunos, hoje) {
  return alunos
    .map((a) => ({ nome: a.nome, u: ultimaPresenca(a) }))
    .filter((s) => !s.u || diasDesde(s.u, hoje) >= SUMIDO_DIAS)
    .map((s) => ({ nome: s.nome, dias: s.u ? diasDesde(s.u, hoje) : null }))
    .sort((x, y) => (y.dias ?? 99999) - (x.dias ?? 99999));
}
