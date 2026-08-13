// @ts-check
/**
 * ANÁLISE DO HISTÓRICO — semana a semana e o fechamento do mês.
 *
 * O calendário diz O QUE foi feito em cada dia; isto diz SE a soma dos dias
 * sustenta o resultado. É a pergunta que aparece depois de editar um treino
 * salvo: "quebrei a estrutura da semana?".
 *
 * Módulo puro: recebe os snapshots já salvos e devolve números e diagnóstico.
 * Não conhece localStorage, DOM nem o formato interno de cada modalidade — só
 * `volPorPadrao`, que TODA modalidade grava.
 *
 * @typedef {import('../config/padroes.js').Padrao} Padrao
 * @typedef {{dateId:string, modalidade:string, volPorPadrao?:Record<string,number>}} TreinoSalvo
 */
import { PADROES, PADRAO_LABEL } from '../config/padroes.js';
import { MINIMO_SEMANAL } from '../config/frequencias.js';

/** Padrões que entram na conta. `estabilizadores` tem mínimo 0 — é informativo. */
const PADROES_COBRADOS = PADROES.filter((p) => (MINIMO_SEMANAL[p] || 0) > 0);

/** Soma o volume por padrão de uma lista de treinos. @param {TreinoSalvo[]} treinos */
export function somarVolume(treinos) {
  /** @type {Record<string, number>} */
  const acc = Object.fromEntries(PADROES.map((p) => [p, 0]));
  for (const t of treinos) {
    for (const p of PADROES) acc[p] += (t.volPorPadrao?.[p] || 0);
  }
  for (const p of PADROES) acc[p] = Math.round(acc[p] * 10) / 10;
  return acc;
}

/**
 * Diagnóstico de UMA semana: o que fechou, o que faltou, e o que fazer a respeito.
 *
 * O excesso só vira alerta quando há déficit em outro lugar. Passar do mínimo não
 * é problema — o mínimo é piso, não teto; o que denuncia desequilíbrio é um padrão
 * dobrado enquanto outro está pela metade.
 *
 * @param {TreinoSalvo[]} treinos  Treinos da semana (seg–dom)
 * @returns {{nTreinos:number, volPorPadrao:Record<string,number>,
 *   faltas:{padrao:string, tem:number, meta:number, falta:number}[],
 *   fechada:boolean, status:'vazia'|'fechada'|'incompleta'|'desequilibrada',
 *   recomendacao:string}}
 */
export function analisarSemana(treinos) {
  const vol = somarVolume(treinos);
  const nTreinos = treinos.length;

  const faltas = PADROES_COBRADOS
    .map((p) => ({ padrao: p, tem: vol[p], meta: MINIMO_SEMANAL[p], falta: Math.max(0, MINIMO_SEMANAL[p] - vol[p]) }))
    .filter((f) => f.falta > 0)
    .sort((a, b) => b.falta - a.falta);

  const fechada = faltas.length === 0;
  if (!nTreinos) {
    return { nTreinos, volPorPadrao: vol, faltas, fechada: false, status: 'vazia', recomendacao: '' };
  }

  // Desequilíbrio: algum padrão passou do dobro do mínimo ENQUANTO outro não
  // chegou nem à metade. Só aí o excesso é sintoma de alguma coisa.
  const dobrados = PADROES_COBRADOS.filter((p) => vol[p] >= MINIMO_SEMANAL[p] * 2);
  const pelaMetade = faltas.filter((f) => f.tem < f.meta / 2);
  const desequilibrada = dobrados.length > 0 && pelaMetade.length > 0;

  const nome = (p) => (PADRAO_LABEL[p] || p);
  let recomendacao;
  let status;

  if (fechada) {
    status = 'fechada';
    recomendacao = `Semana fechada em todos os padrões, com ${nTreinos} treino${nTreinos > 1 ? 's' : ''}. Nada a corrigir.`;
  } else if (desequilibrada) {
    status = 'desequilibrada';
    const sobra = dobrados.map(nome).join(' e ');
    const falta = pelaMetade.slice(0, 2).map((f) => `${nome(f.padrao)} (${f.tem}/${f.meta})`).join(' e ');
    recomendacao = `Desequilíbrio: ${sobra} passou do dobro do mínimo enquanto ${falta} não chegou à metade. `
      + `No próximo dia, troque um exercício de ${sobra.toLowerCase()} por ${pelaMetade[0].padrao === 'core' ? 'core' : nome(pelaMetade[0].padrao).toLowerCase()} — a troca livre faz isso sem regerar o treino.`;
  } else {
    status = 'incompleta';
    const top = faltas.slice(0, 2);
    const lista = top.map((f) => `${nome(f.padrao)} (faltam ${Math.round(f.falta)})`).join(' e ');
    // 4 séries é o que um exercício rende num dia típico — é a unidade em que o
    // coach pensa ("mais um exercício de puxada"), não séries soltas.
    const exercicios = Math.ceil(top.reduce((a, f) => a + f.falta, 0) / 4);
    recomendacao = `Faltam ${lista}. `
      + (nTreinos >= 4
        ? `Com ${nTreinos} treinos na semana, o caminho é trocar exercício num dia já salvo em vez de acrescentar aula.`
        : `Cabe ${exercicios} exercício${exercicios > 1 ? 's' : ''} a mais — um dia de Hipertrofia ou Híbrido cobre.`);
  }

  return { nTreinos, volPorPadrao: vol, faltas, fechada, status, recomendacao };
}

/**
 * Agrupa os treinos de um mês por semana (seg–dom), na ordem do calendário.
 *
 * Uma semana pode atravessar a virada do mês. Aqui só entram os dias DO MÊS
 * exibido — a análise é da página que o coach está vendo, e trazer dias de fora
 * faria o número não bater com o calendário logo acima.
 *
 * @param {string} mesId 'YYYY-MM'
 * @param {TreinoSalvo[]} treinosDoMes
 * @returns {{semana:number, rotulo:string, treinos:TreinoSalvo[]}[]}
 */
export function agruparPorSemana(mesId, treinosDoMes) {
  const [ano, mes] = mesId.split('-').map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();

  /** Nº da semana do mês (1..6), contando semanas que começam na segunda. */
  const semanaDe = (dia) => {
    const primeiro = new Date(ano, mes - 1, 1).getDay(); // 0=dom
    const desloc = (primeiro === 0 ? 6 : primeiro - 1);   // quantos dias antes da 1ª segunda
    return Math.floor((dia + desloc - 1) / 7) + 1;
  };

  /** @type {Map<number, TreinoSalvo[]>} */
  const grupos = new Map();
  for (const t of treinosDoMes) {
    const dia = Number(t.dateId.slice(8, 10));
    const s = semanaDe(dia);
    if (!grupos.has(s)) grupos.set(s, []);
    grupos.get(s).push(t);
  }

  const dd = (n) => String(n).padStart(2, '0');
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([semana, treinos]) => {
      // Faixa de dias daquela semana dentro do mês, para o rótulo.
      const dias = treinos.map((t) => Number(t.dateId.slice(8, 10)));
      const ini = Math.min(...dias);
      const fim = Math.min(diasNoMes, Math.max(...dias));
      return { semana, rotulo: `Semana ${semana} · ${dd(ini)}–${dd(fim)}`, treinos };
    });
}

/**
 * Fechamento do mês.
 *
 * O mínimo do mês NÃO é o semanal × 4 fixo: é × o número de semanas que de fato
 * tiveram treino. Cobrar 4 semanas de um mês em que o box rodou 2 produziria um
 * déficit inventado, e o coach aprenderia a ignorar o painel.
 *
 * @param {string} mesId @param {TreinoSalvo[]} treinosDoMes
 */
export function analisarMes(mesId, treinosDoMes) {
  const semanas = agruparPorSemana(mesId, treinosDoMes);
  const vol = somarVolume(treinosDoMes);
  const nSemanas = semanas.length;

  /** @type {Record<string, number>} */
  const porModalidade = {};
  for (const t of treinosDoMes) porModalidade[t.modalidade] = (porModalidade[t.modalidade] || 0) + 1;

  const metas = PADROES_COBRADOS.map((p) => ({
    padrao: p,
    tem: vol[p],
    meta: MINIMO_SEMANAL[p] * nSemanas,
    pct: nSemanas ? Math.round((vol[p] / (MINIMO_SEMANAL[p] * nSemanas)) * 100) : 0,
  }));

  // O campeão e o esquecido são medidos em % da meta, não em séries brutas: o
  // mínimo de core é 3 e o de puxar é 9, então comparar séries diretas diria
  // sempre que o core é o mais fraco, o que é falso.
  const ordenado = [...metas].sort((a, b) => b.pct - a.pct);
  const maisTrabalhado = ordenado[0] || null;
  const menosTrabalhado = ordenado[ordenado.length - 1] || null;

  const analises = semanas.map((s) => analisarSemana(s.treinos));
  const semanasFechadas = analises.filter((a) => a.fechada).length;

  return {
    mesId,
    nTreinos: treinosDoMes.length,
    nSemanas,
    mediaPorSemana: nSemanas ? Math.round((treinosDoMes.length / nSemanas) * 10) / 10 : 0,
    porModalidade,
    volPorPadrao: vol,
    metas,
    maisTrabalhado,
    menosTrabalhado,
    semanasFechadas,
    // Diferença entre o campeão e o esquecido, em pontos percentuais da meta —
    // é o número que denuncia desequilíbrio estrutural mais rápido que a lista.
    amplitude: maisTrabalhado && menosTrabalhado ? maisTrabalhado.pct - menosTrabalhado.pct : 0,
  };
}
