// @ts-check
/**
 * As regras do cadastro e dos planos (Fase 1 · etapa 6.1): pausar e voltar,
 * a dupla, o Instagram do mês, a indicação, o ajuste das semanas e a migração
 * das fichas de hoje.
 *
 * Puro, como o checkin-regras.js: cada função recebe a ficha e DEVOLVE o que
 * gravar (`patch`) e a linha do log, ou uma recusa (`{ recusa: texto }`). Quem
 * grava e registra é a tela (ui-plano.js). O valor de cada mês sai do
 * compartilhado/regras/planos.js.
 *
 * O QUE MORA NA FICHA (campos novos, todos do coach)
 *   plano          { vezes: 2|3|4|'ilimitado', prazo: 'mensal' }
 *   inicio         'AAAA-MM-DD'
 *   fundador       true para quem começou até 31/12/2026
 *   cortesia       { motivo, desde } — mensalidade zero, consumo pago
 *   pausas         [{ desde, ate?, motivo? }] — a última sem `ate` é a atual
 *   dupla, instagram, parceriaLocal, indicadoPor, indicacoes — os bônus
 *   semanasAjuste  { 'AAAA-MM': 0..4 } — a correção do coach na regra das semanas
 *
 * @typedef {{ tipo: string, resumo: string, extra?: Record<string, any> }} LinhaDoLog
 * @typedef {{ patch: Record<string, any>, log: LinhaDoLog }} Mudanca
 * @typedef {{ recusa: string }} Recusa
 */
import { pausaAtual, somarDiasIso, FUNDADOR_ATE, mesCurto } from '../../compartilhado/regras/planos.js';

const ehDia = (/** @type {any} */ d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const ehMes = (/** @type {any} */ m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} d */
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** O mês seguinte a 'AAAA-MM'. @param {string} mesId */
export function mesSeguinte(mesId) {
  const [a, m] = mesId.split('-').map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
}

/** Dias de `de` até `ate` (ate − de). @param {string} de @param {string} ate */
export function diasEntre(de, ate) {
  const ms = (/** @type {string} */ d) => { const [a, m, dia] = d.split('-').map(Number); return Date.UTC(a, m - 1, dia); };
  return Math.round((ms(ate) - ms(de)) / 86400000);
}

/* ============================================================
   Pausa
   ============================================================ */

/**
 * Os créditos congelam na pausa (decisão 9): cada crédito de reposição ou
 * atestado em aberto no começo da pausa ganha na validade os dias pausados.
 * Aberto = tem `expira`, não tem reposição marcada e ainda valia no 1º dia da
 * pausa. O atestado antigo, sem `expira`, nunca vence e fica como está.
 * @param {Record<string, any>} atestados @param {string} desde @param {string} ate
 * @returns {{ atestados: Record<string, any>, congelados: number }}
 */
export function congelarCreditos(atestados, desde, ate) {
  const dias = diasEntre(desde, ate);
  /** @type {Record<string, any>} */ const out = {};
  let congelados = 0;
  for (const [k, e] of Object.entries(atestados || {})) {
    if (dias > 0 && e && ehDia(e.expira) && !e.reposicao && e.expira >= desde) {
      out[k] = { ...e, expira: somarDiasIso(e.expira, dias) };
      congelados++;
    } else out[k] = e;
  }
  return { atestados: out, congelados };
}

/**
 * Pausa o plano a partir de `desde` (o 1º dia sem treino).
 * @param {any} a @param {{ desde: string, motivo?: string }} o
 * @returns {Mudanca | Recusa}
 */
export function pausar(a, { desde, motivo = '' }) {
  if (!ehDia(desde)) return { recusa: 'Escolha o dia em que a pausa começa.' };
  if ((a.status || 'ativo') === 'inativo') return { recusa: 'A ficha está inativa: não há o que pausar.' };
  if ((a.status || 'ativo') === 'pausado' || pausaAtual(a)) return { recusa: 'O plano já está pausado.' };
  const pausas = Array.isArray(a.pausas) ? a.pausas : [];
  const ultima = pausas[pausas.length - 1];
  if (ultima && ehDia(ultima.ate) && desde < ultima.ate) return { recusa: `A pausa não pode começar antes da última volta (${ddmm(ultima.ate)}).` };
  const m = String(motivo || '').trim();
  return {
    patch: { status: 'pausado', pausas: [...pausas, { desde, ...(m ? { motivo: m } : {}) }] },
    log: { tipo: 'pausa', resumo: `Plano pausado desde ${ddmm(desde)}`, extra: { dia: desde, ...(m ? { motivo: m } : {}) } },
  };
}

/**
 * Volta da pausa em `ate` (o dia em que volta a treinar). Fecha a pausa e
 * estende a validade dos créditos em aberto pelos dias pausados.
 * @param {any} a @param {{ ate: string }} o
 * @returns {Mudanca | Recusa}
 */
export function voltar(a, { ate }) {
  const p = pausaAtual(a);
  if (!p) return { recusa: 'O plano não está pausado.' };
  if (!ehDia(ate)) return { recusa: 'Escolha o dia da volta.' };
  if (ate <= p.desde) return { recusa: `A volta tem de ser depois do começo da pausa (${ddmm(p.desde)}).` };
  const pausas = a.pausas.map((/** @type {any} */ x) => (x === p ? { ...x, ate } : x));
  const { atestados, congelados } = congelarCreditos(a.atestados || {}, p.desde, ate);
  const dias = diasEntre(p.desde, ate);
  const creditos = congelados ? ` · ${congelados === 1 ? '1 crédito ganhou' : `${congelados} créditos ganharam`} ${dias} dias de validade` : '';
  return {
    patch: { status: 'ativo', pausas, ...(congelados ? { atestados } : {}) },
    log: { tipo: 'volta', resumo: `Voltou da pausa em ${ddmm(ate)} (${dias} dias pausado)${creditos}`, extra: { dia: ate } },
  };
}

/* ============================================================
   Bônus que o coach dá com um botão
   ============================================================ */

/**
 * O que difere na grade de dois alunos (o casal tem de treinar no mesmo dia e
 * horário). '' quando é igual.
 * @param {any} a @param {any} b
 */
export function gradeDiferente(a, b) {
  const grade = (/** @type {any} */ x) => (x.diasTreino || []).map((/** @type {string} */ d) => `${d} ${(x.horarios || {})[d] || ''}`.trim()).sort();
  const ga = grade(a), gb = grade(b);
  const so = (/** @type {string[]} */ xs, /** @type {string[]} */ ys) => xs.filter((x) => !ys.includes(x));
  const difA = so(ga, gb), difB = so(gb, ga);
  if (!difA.length && !difB.length) return '';
  const nome = (/** @type {any} */ x) => String(x.nome || x.id).split(' ')[0];
  return [difA.length ? `${nome(a)}: ${difA.join(', ')}` : '', difB.length ? `${nome(b)}: ${difB.join(', ')}` : ''].filter(Boolean).join(' · ');
}

/**
 * Liga a dupla (10% para os dois enquanto estiverem ligados).
 * @param {any} a @param {any} b
 * @returns {{ patchA: Record<string, any>, patchB: Record<string, any>, logA: LinhaDoLog, logB: LinhaDoLog, aviso: string } | Recusa}
 */
export function ligarDupla(a, b) {
  if (!b || b.id === a.id) return { recusa: 'Escolha outro aluno para a dupla.' };
  if (a.dupla && a.dupla.id) return { recusa: `${a.nome || a.id} já faz dupla com ${a.dupla.nome || a.dupla.id}.` };
  if (b.dupla && b.dupla.id) return { recusa: `${b.nome || b.id} já faz dupla com ${b.dupla.nome || b.dupla.id}.` };
  return {
    patchA: { dupla: { id: b.id, nome: b.nome || '' } },
    patchB: { dupla: { id: a.id, nome: a.nome || '' } },
    logA: { tipo: 'bonus', resumo: `Dupla ligada com ${b.nome || b.id} (10%)` },
    logB: { tipo: 'bonus', resumo: `Dupla ligada com ${a.nome || a.id} (10%)` },
    aviso: gradeDiferente(a, b),
  };
}

/**
 * Desliga a dupla dos dois (o outro pode já não existir).
 * @param {any} a @param {any} [b]
 */
export function desligarDupla(a, b) {
  const outro = (a.dupla && a.dupla.nome) || (b && b.nome) || 'o parceiro';
  return {
    patchA: { dupla: null },
    patchB: b && b.dupla && b.dupla.id === a.id ? { dupla: null } : null,
    logA: { tipo: 'bonus', resumo: `Dupla com ${outro} desligada` },
    logB: { tipo: 'bonus', resumo: `Dupla com ${a.nome || a.id} desligada` },
  };
}

/**
 * Marca (ou desmarca) os 4 stories de um mês: 5% na fatura do mês seguinte.
 * @param {any} a @param {string} mesId o mês dos stories
 * @returns {Mudanca | Recusa}
 */
export function alternarInstagram(a, mesId) {
  if (!ehMes(mesId)) return { recusa: 'Mês inválido.' };
  const atual = Array.isArray(a.instagram) ? a.instagram : [];
  const tinha = atual.includes(mesId);
  const instagram = tinha ? atual.filter((m) => m !== mesId) : [...atual, mesId].sort();
  return {
    patch: { instagram },
    log: { tipo: 'bonus', resumo: tinha ? `Instagram de ${mesCurto(mesId)} desmarcado` : `Instagram de ${mesCurto(mesId)}: 5% em ${mesCurto(mesSeguinte(mesId))}` },
  };
}

/**
 * As indicações de um aluno: quem ele indicou, se o indicado pagou a 1ª
 * mensalidade até o dia 10 (o corte) e se o coach já deu os 30%.
 * @param {any} indicador @param {any[]} todos
 * @returns {{ indicado: any, mes: string, pagoEm: string, elegivel: boolean, mesDoBonus: string, dado: boolean }[]}
 */
export function indicacoesDe(indicador, todos) {
  const dadas = Array.isArray(indicador.indicacoes) ? indicador.indicacoes : [];
  return (todos || [])
    .filter((x) => x && x.id !== indicador.id && x.indicadoPor && x.indicadoPor.id === indicador.id && ehMes(x.indicadoPor.mes))
    .map((x) => {
      const mes = x.indicadoPor.mes;
      const rec = x.recebimentos && x.recebimentos[mes];
      const pagoEm = x.pagamentos && x.pagamentos[mes] && rec && ehDia(rec.data) ? rec.data : '';
      return { indicado: x, mes, pagoEm, elegivel: !!pagoEm && pagoEm <= `${mes}-10`, mesDoBonus: mesSeguinte(mes), dado: dadas.some((i) => i && i.id === x.id) };
    });
}

/**
 * Dá os 30% da indicação a quem indicou, no mês do bônus.
 * @param {any} indicador @param {any} indicado @param {string} mes
 * @returns {Mudanca | Recusa}
 */
export function darIndicacao(indicador, indicado, mes) {
  if (!ehMes(mes)) return { recusa: 'Mês inválido.' };
  const dadas = Array.isArray(indicador.indicacoes) ? indicador.indicacoes : [];
  if (dadas.some((i) => i && i.id === indicado.id)) return { recusa: 'Essa indicação já foi dada.' };
  return {
    patch: { indicacoes: [...dadas, { mes, id: indicado.id, nome: indicado.nome || '' }] },
    log: { tipo: 'bonus', resumo: `Indicação de ${indicado.nome || indicado.id}: 30% em ${mesCurto(mes)}` },
  };
}

/**
 * Tira os 30% de uma indicação dada.
 * @param {any} indicador @param {string} indicadoId
 * @returns {Mudanca | Recusa}
 */
export function tirarIndicacao(indicador, indicadoId) {
  const dadas = Array.isArray(indicador.indicacoes) ? indicador.indicacoes : [];
  const i = dadas.find((x) => x && x.id === indicadoId);
  if (!i) return { recusa: 'Essa indicação não foi dada.' };
  return {
    patch: { indicacoes: dadas.filter((x) => x !== i) },
    log: { tipo: 'bonus', resumo: `Indicação de ${i.nome || indicadoId} retirada (era ${mesCurto(i.mes)})` },
  };
}

/**
 * Corrige à mão as semanas de um mês (null volta à regra).
 * @param {any} a @param {string} mesId @param {number|null} n
 * @returns {Mudanca | Recusa}
 */
export function ajustarSemanas(a, mesId, n) {
  if (!ehMes(mesId)) return { recusa: 'Mês inválido.' };
  if (n != null && !(Number.isInteger(n) && n >= 0 && n <= 4)) return { recusa: 'As semanas vão de 0 a 4.' };
  const atual = { ...(a.semanasAjuste || {}) };
  if (n == null) delete atual[mesId]; else atual[mesId] = n;
  return {
    patch: { semanasAjuste: atual },
    log: { tipo: 'plano', resumo: n == null ? `Semanas de ${mesCurto(mesId)} voltaram à regra` : `Semanas de ${mesCurto(mesId)}: ${n} de 4 (ajuste do coach)` },
  };
}

/* ============================================================
   Migração das fichas de hoje (Parte H do plano)
   ============================================================ */

/** O dia (no fuso do box) de um carimbo em ms. @param {number} ms */
const diaDoBox = (ms) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * A data de início de uma ficha que ainda não tem: a mais antiga entre a
 * criação da ficha, o 1º mês pago (dia 1) e a 1ª presença. '' sem nenhum dado.
 * @param {any} f
 */
export function inicioDaFicha(f) {
  const datas = [];
  const criado = Number(f.criadoEm);
  if (criado > 0) datas.push(diaDoBox(criado));
  const meses = Object.keys(f.pagamentos || {}).filter((m) => ehMes(m) && f.pagamentos[m]).sort();
  if (meses.length) datas.push(`${meses[0]}-01`);
  const pres = (Array.isArray(f.presencas) ? f.presencas : []).filter(ehDia).sort();
  if (pres.length) datas.push(pres[0]);
  return datas.sort()[0] || '';
}

/** O valor de hoje que diz o plano, quando a ficha não tem a frequência. */
const VEZES_PELO_VALOR = Object.freeze({ 115: 2, 130: 3, 150: 4 });

/**
 * O plano de uma ficha que ainda não tem: pela frequência; sem ela, pelo valor
 * (115 → 2x, 130 → 3x, 150 → 4x). null quando não dá para saber.
 * @param {any} f
 */
export function planoDaFicha(f) {
  const v = Number(f.freqVezes);
  if (v === 2 || v === 3 || v === 4) return { vezes: v, prazo: 'mensal' };
  if (v >= 5) return { vezes: 'ilimitado', prazo: 'mensal' };
  const pelo = VEZES_PELO_VALOR[/** @type {115|130|150} */ (Number(String(f.mensalidade ?? '').replace(',', '.')))];
  return pelo ? { vezes: pelo, prazo: 'mensal' } : null;
}

/**
 * O que a migração grava numa ficha (só o que ela ainda não tem). As inativas
 * ganham início e plano, mas não a marca de fundador (decisão de 11/11).
 * @param {any} f
 * @returns {Record<string, any>} vazio quando não há o que gravar
 */
export function migracaoDaFicha(f) {
  /** @type {Record<string, any>} */ const patch = {};
  const inativa = (f.status || 'ativo') === 'inativo';
  const inicio = ehDia(f.inicio) ? f.inicio : inicioDaFicha(f);
  if (!ehDia(f.inicio) && inicio) patch.inicio = inicio;
  if (!f.plano) { const p = planoDaFicha(f); if (p) patch.plano = p; }
  if (f.fundador == null && !inativa && (!inicio || inicio <= FUNDADOR_ATE)) patch.fundador = true;
  if (!f.cortesia && f.parceria && Number(f.parceria.percentual) >= 100) {
    patch.cortesia = { motivo: String(f.parceria.nome || '').trim() || 'Parceria', desde: inicio || '' };
  }
  return patch;
}

/**
 * O fundador de uma ficha nova: começou até 31/12/2026.
 * @param {string} inicio
 */
export const fundadorPeloInicio = (inicio) => ehDia(inicio) && inicio <= FUNDADOR_ATE;
