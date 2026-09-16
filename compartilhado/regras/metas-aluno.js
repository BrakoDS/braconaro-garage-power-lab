// @ts-check
/**
 * META SEMANAL DE SÉRIES POR GRUPO, para um aluno.
 *
 * Eixo NOVO, paralelo ao `MINIMO_SEMANAL` por padrão de movimento
 * (`montador-de-treino/config/frequencias.js`), que continua valendo para a
 * checagem do box. Este aqui é a conta do aluno: "quanto de perna a Ana precisa
 * fazer nesta semana", e é o que decide, na redistribuição por foco, de qual
 * grupo tirar série — o grupo em que ELE está mais acima da meta dele.
 *
 * Os números são ponto de partida, calibráveis num lugar só, como o README já
 * trata `META_SERIES_SEMANAIS`. O coach pode sobrescrever a meta de um aluno
 * específico na ficha: a tabela é o padrão, não a lei.
 */
import { GRUPOS } from './grupos.js';
import { objetivoDe } from '../config/objetivos.js';

/**
 * Meta por objetivo: [grupo comum, grupo em foco]. Spec do Montador v2, seção
 * "Metas semanais por grupo".
 * @type {Record<string, [number, number]>}
 */
export const META_SERIES_SEMANAIS = {
  hipertrofia: [10, 16],
  emagrecimento: [8, 12],
  condicionamento: [9, 14],
  saude: [8, 12],
};

/**
 * Aluno sem objetivo na ficha — hoje, a maioria. Recebe a meta mais modesta da
 * tabela em vez de meta nenhuma: sem número, a redistribuição por foco não teria
 * como escolher de onde tirar, e o volume do Portal apareceria sem referência.
 */
export const META_PADRAO = /** @type {[number, number]} */ ([8, 12]);

/** Até dois grupos em foco, e só grupos que existem. @param {any} perfil */
export function focoDe(perfil) {
  const foco = Array.isArray(perfil?.foco) ? perfil.foco : [];
  return foco.filter((g) => GRUPOS.includes(g)).slice(0, 2);
}

/**
 * A meta semanal de cada um dos sete grupos, para este aluno.
 *
 * @param {any} perfil  a ficha do aluno: { objetivo, foco[], metas? }
 * @returns {Record<string, number>} grupo → séries por semana
 */
export function metasDoAluno(perfil) {
  const obj = objetivoDe(perfil?.objetivo);
  const [comum, emFoco] = META_SERIES_SEMANAIS[obj?.id || ''] || META_PADRAO;
  const foco = new Set(focoDe(perfil));
  /** @type {Record<string, number>} */
  const metas = {};
  for (const g of GRUPOS) metas[g] = foco.has(g) ? emFoco : comum;
  // Sobrescrita da ficha: vale por grupo, e só para grupo que existe. O coach que
  // digita "perna: 20" está corrigindo a tabela para aquele aluno, e a correção
  // dele não pode ser ignorada por um número genérico.
  const manuais = perfil?.metas && typeof perfil.metas === 'object' ? perfil.metas : {};
  for (const [g, v] of Object.entries(manuais)) {
    const n = Number(v);
    if (GRUPOS.includes(g) && Number.isFinite(n) && n > 0) metas[g] = n;
  }
  return metas;
}

/**
 * Quanto cada grupo está acima (positivo) ou abaixo (negativo) da meta do aluno.
 *
 * É o que responde "de onde tirar série sem prejudicar ninguém": tira de quem
 * está mais acima. Grupo que o aluno ainda não treinou na semana entra como
 * negativo — ele é candidato a RECEBER, não a perder.
 * @param {Record<string, number>} feitoPorGrupo  o que ele já fez na semana
 * @param {any} perfil
 * @returns {Record<string, number>}
 */
export function saldoPorGrupo(feitoPorGrupo, perfil) {
  const metas = metasDoAluno(perfil);
  /** @type {Record<string, number>} */
  const saldo = {};
  for (const g of GRUPOS) saldo[g] = (Number(feitoPorGrupo?.[g]) || 0) - metas[g];
  return saldo;
}
