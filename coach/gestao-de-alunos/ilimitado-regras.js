// @ts-check
/**
 * O plano Ilimitado na agenda (Fase 1 · etapa 6.3, decisão 11 do ESCOPO): o
 * aluno marca aula por aula.
 *
 * Puro, como o presenca-regras.js: cada função recebe a ficha e DEVOLVE o que
 * gravar e a linha do log, ou uma recusa (`{ recusa: { chave, texto } }`).
 *
 * AS REGRAS
 *   - Só a ficha com o plano Ilimitado marca; pausado não marca.
 *   - De hoje até 7 dias à frente, até 1h antes da aula.
 *   - Uma aula por dia (marcada, de grade fixa ou de reposição) e no máximo 6
 *     na semana (a falta não conta).
 *   - A turma precisa ter vaga: a grade fixa é garantida, o Ilimitado só pega o
 *     que sobra ou o que o "Não irei" liberou (a vaga é conferida por quem chama).
 *   - Desmarcar: com 2h ou mais, a vaga só fica livre; com menos, é falta.
 *     O no-show também é só falta (não há crédito a perder).
 *
 * ONDE MORA NA FICHA
 *   marcacoes { 'AAAA-MM-DD': { hora, em, foraDoPrazo?, desmarcadaEm?, antecedenciaMin?, noShow?, noShowEm?, noShowOrigem? } }
 *
 * @typedef {import('./checkin-regras.js').Relogio} Relogio
 */
import { antecedenciaMin, somarDias, textoAntecedencia, PRAZO_DESMARCAR_MIN } from './presenca-regras.js?v=39';
import { donoDoDia, outraAulaUsa, diasReivindicados, chaveIlimitado } from './checkin-regras.js?v=39';
import { datasDaSemana } from '../../compartilhado/regras/semana.js?v=39';
import { estaPausado } from '../../compartilhado/regras/planos.js';

/** As aulas dos próximos quantos dias (contando hoje) ele marca — o mesmo horizonte da reposição. */
export const JANELA_MARCACAO_DIAS = 7;
/** No máximo quantas aulas na semana (1 por dia, seg a sáb). */
export const LIMITE_SEMANA_ILIMITADO = 6;
/** Até quantos minutos antes da aula dá para marcar. */
export const ANTECEDENCIA_MARCACAO_MIN = 60;

/** O plano da ficha é o Ilimitado? @param {any} a */
export const ehIlimitado = (a) => !!a && !!a.plano && a.plano.vezes === 'ilimitado';

/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** @param {any} a @param {string} dia @param {string} texto */
const recusa = (a, dia, texto) => ({ recusa: { chave: `${a.id}|${chaveIlimitado(dia)}`, texto } });

/** A marcação tem falta (desmarcou fora do prazo ou não veio)? @param {any} m */
const temFalta = (m) => !!m && (m.foraDoPrazo || m.noShow);

/**
 * As aulas do aluno na semana do dia (seg a dom): as da grade fixa, as
 * reposições e as marcações — sem as que viraram falta.
 * @param {any} a @param {string} dia
 */
export function aulasNaSemana(a, dia) {
  const semana = datasDaSemana(new Date(dia + 'T00:00:00'));
  const datas = new Set(Object.values(semana));
  const marc = a.marcacoes || {};
  let n = 0;
  for (const [alvo, dono] of diasReivindicados(a, semana)) {
    if (!datas.has(alvo)) continue;
    if (String(dono).startsWith('ilimitado:') && temFalta(marc[alvo])) continue;
    n++;
  }
  return n;
}

/**
 * Pode marcar? A vaga é de quem chama (`vagas`, da turma), o resto é daqui.
 * @param {any} a @param {{ data: string, hora: string }} aula
 * @param {{ relogio: Relogio, vagas: number | null }} o
 * @returns {{ ok: true, antecedenciaMin: number } | { erro: string }}
 */
export function avaliarMarcacao(a, { data, hora }, { relogio, vagas }) {
  if (!ehIlimitado(a)) return { erro: 'Só o plano Ilimitado marca aula por aula.' };
  if (estaPausado(a)) return { erro: 'Seu plano está pausado.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return { erro: 'Escolha o dia da aula.' };
  if (data < relogio.hoje || data > somarDias(relogio.hoje, JANELA_MARCACAO_DIAS - 1)) return { erro: `Dá para marcar só nas aulas dos próximos ${JANELA_MARCACAO_DIAS} dias.` };
  const ant = antecedenciaMin(relogio, data, hora);
  if (ant == null) return { erro: 'Escolha uma turma com horário.' };
  if (ant < ANTECEDENCIA_MARCACAO_MIN) return { erro: 'A aula só pode ser marcada até 1h antes.' };
  if ((a.marcacoes || {})[data]) return { erro: `Já há uma aula marcada em ${ddmm(data)}.` };
  if (donoDoDia(a, chaveIlimitado(data), data)) return { erro: `Já há uma aula em ${ddmm(data)} (uma por dia).` };
  if (aulasNaSemana(a, data) >= LIMITE_SEMANA_ILIMITADO) return { erro: `A semana de ${ddmm(data)} já tem ${LIMITE_SEMANA_ILIMITADO} aulas.` };
  if (vagas != null && vagas <= 0) return { erro: 'Turma lotada.' };
  return { ok: true, antecedenciaMin: ant };
}

/**
 * MARCAR — confere tudo e grava a aula do Ilimitado.
 * @param {any} a @param {{ data: string, hora: string }} aula
 * @param {{ relogio: Relogio, vagas: number | null, em: number }} o
 */
export function marcar(a, aula, { relogio, vagas, em }) {
  const r = avaliarMarcacao(a, aula, { relogio, vagas });
  if ('erro' in r) return recusa(a, aula.data, r.erro);
  return gravarMarcacao(a, aula.data, aula.hora, em);
}

/**
 * Grava a marcação já conferida pelo servidor (vaga e prazo). Aqui fica a trava
 * da ficha: Ilimitado, um por dia, o limite da semana.
 * @param {any} a @param {string} data @param {string} hora @param {number} em
 */
export function gravarMarcacao(a, data, hora, em) {
  if (!ehIlimitado(a)) return recusa(a, data, 'a ficha não é do plano Ilimitado');
  if ((a.marcacoes || {})[data]) return recusa(a, data, 'já há aula marcada nesse dia');
  if (donoDoDia(a, chaveIlimitado(data), data)) return recusa(a, data, 'já há outra aula nesse dia');
  if (aulasNaSemana(a, data) >= LIMITE_SEMANA_ILIMITADO) return recusa(a, data, 'a semana já tem 6 aulas');
  return {
    patch: { marcacoes: { ...(a.marcacoes || {}), [data]: { hora: hora || '', em } } },
    log: { tipo: 'marcacao', resumo: `Aula do Ilimitado marcada · ${ddmm(data)}${hora ? ' ' + hora : ''}`, extra: { dia: data } },
  };
}

/** A presença de `dia` sai, a menos que outra aula do aluno use o dia. @param {any} a @param {string} dia */
function semPresenca(a, dia) {
  const presencas = new Set(a.presencas || []);
  const presencaHoras = { ...(a.presencaHoras || {}) };
  if (!outraAulaUsa(a, chaveIlimitado(dia), dia)) { presencas.delete(dia); delete presencaHoras[dia]; }
  return { presencas: [...presencas].sort(), presencaHoras };
}

/**
 * O que desmarcar daria, sem gravar nada.
 * @param {any} a @param {string} dia @param {Relogio} aviso
 * @returns {{ noPrazo: boolean, antecedenciaMin: number } | null}
 */
export function previaDesmarcacaoIlimitado(a, dia, aviso) {
  const m = (a.marcacoes || {})[dia];
  if (!m) return null;
  const ant = antecedenciaMin(aviso, dia, m.hora);
  return ant == null ? null : { noPrazo: ant >= PRAZO_DESMARCAR_MIN, antecedenciaMin: ant };
}

/**
 * DESMARCAR — com 2h ou mais, a vaga fica livre (a marcação sai); com menos, é falta.
 * @param {any} a @param {string} dia @param {{ aviso: Relogio, em: number }} o
 */
export function desmarcarIlimitadoComAviso(a, dia, { aviso, em }) {
  const m = (a.marcacoes || {})[dia];
  if (!m) return null;
  if (temFalta(m)) return recusa(a, dia, 'Essa aula já tem falta registrada');
  const ant = antecedenciaMin(aviso, dia, m.hora);
  if (ant == null) return recusa(a, dia, 'Aula sem horário: não dá para medir o prazo');
  const quando = `${textoAntecedencia(ant)} · aula de ${ddmm(dia)}${m.hora ? ' ' + m.hora : ''}`;
  if (ant >= PRAZO_DESMARCAR_MIN) {
    const marcacoes = { ...(a.marcacoes || {}) };
    delete marcacoes[dia];
    return {
      patch: { marcacoes, ...semPresenca(a, dia) },
      log: { tipo: 'marcacao', resumo: `Desmarcou a aula do Ilimitado no prazo (${quando}) · vaga livre`, extra: { dia } },
    };
  }
  return {
    patch: { marcacoes: { ...(a.marcacoes || {}), [dia]: { ...m, foraDoPrazo: true, desmarcadaEm: em, antecedenciaMin: ant } }, ...semPresenca(a, dia) },
    log: { tipo: 'falta', resumo: `Desmarcou a aula do Ilimitado fora do prazo (${quando}) · falta`, extra: { dia } },
  };
}

/**
 * NO-SHOW — marcou e não veio: falta.
 * @param {any} a @param {string} dia @param {{ em: number, origem?: string }} o
 */
export function noShowIlimitado(a, dia, { em, origem }) {
  const m = (a.marcacoes || {})[dia];
  if (!m) return null;
  return {
    patch: { marcacoes: { ...(a.marcacoes || {}), [dia]: { ...m, noShow: true, noShowEm: em, ...(origem ? { noShowOrigem: origem } : {}) } }, ...semPresenca(a, dia) },
    log: { tipo: 'falta', resumo: `No-show na aula do Ilimitado de ${ddmm(dia)}${m.hora ? ' ' + m.hora : ''}`, extra: { dia } },
  };
}

/**
 * REABRIR — tira a falta (desmarcou fora do prazo ou no-show) e a presença.
 * @param {any} a @param {string} dia
 */
export function reabrirIlimitado(a, dia) {
  const m = (a.marcacoes || {})[dia];
  if (!m) return null;
  const { foraDoPrazo: _f, desmarcadaEm: _d, antecedenciaMin: _a, noShow: _n, noShowEm: _ne, noShowOrigem: _no, ...limpa } = m;
  return {
    patch: { marcacoes: { ...(a.marcacoes || {}), [dia]: limpa }, ...semPresenca(a, dia) },
    log: { tipo: 'presenca-removida', resumo: `Aula do Ilimitado de ${ddmm(dia)} reaberta`, extra: { dia } },
  };
}

/**
 * TIRAR — o coach tira a marcação da turma, sem falta (marcou errado).
 * @param {any} a @param {string} dia
 */
export function tirarMarcacao(a, dia) {
  if (!(a.marcacoes || {})[dia]) return null;
  const marcacoes = { ...(a.marcacoes || {}) };
  delete marcacoes[dia];
  return {
    patch: { marcacoes, ...semPresenca(a, dia) },
    log: { tipo: 'marcacao', resumo: `Aula do Ilimitado de ${ddmm(dia)} tirada pelo coach`, extra: { dia } },
  };
}
