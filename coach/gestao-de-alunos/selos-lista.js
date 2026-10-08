// @ts-check
/**
 * Os selos da lista de alunos que vêm de FORA da ficha — o total de treino
 * queimado na semana (kcal, registrado no app/Portal) e as medalhas — e o
 * ranking do box, publicado com o mesmo mapa de gastos.
 *
 * Duas metades:
 *   - as contas, puras: `kcalDaSemana` e `medalhasPorAluno`;
 *   - `atualizarSelosDaLista()`, que busca na nuvem (uma consulta por coleção,
 *     para o box inteiro), faz as contas, entrega à lista e publica o ranking.
 *     Chamada no login, depois do sync (boot.js). Silenciosa em falha: sem
 *     selo, a lista funciona igual.
 */
import * as db from './db.js?v=11';
import { carregarTodosGastos } from './nutricao-read.js?v=11';
import { carregarTodasConclusoes } from './desafios-read.js?v=11';
import { carregarSemanasPausadas } from '../../compartilhado/firebase/semanas-pausadas.js';
import { publicarRanking } from './ranking-sync.js?v=11';
import { medalhasDaFicha } from '../../compartilhado/regras/gamificacao.js?v=11';
import { isoLocal, semanaSegSab } from './util/formato.js?v=11';
import { definirKcalDaSemana, definirMedalhas } from './ui-lista.js?v=11';

/** Calorias como número (aceita vírgula); 0 se não der. @param {unknown} v */
const kcal = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/**
 * O total de treino queimado entre `ini` e `fim` ('AAAA-MM-DD', inclusive),
 * por e-mail. Quem não queimou nada fica de fora (sem selo).
 * @param {Map<string, any[]>} gastosPorEmail @param {string} ini @param {string} fim
 * @returns {Map<string, number>}
 */
export function kcalDaSemana(gastosPorEmail, ini, fim) {
  const m = new Map();
  gastosPorEmail.forEach((gastos, email) => {
    const total = (gastos || []).filter((g) => g.data >= ini && g.data <= fim).reduce((s, g) => s + kcal(g.calorias), 0);
    if (total > 0) m.set(email, total);
  });
  return m;
}

/**
 * Quantas medalhas cada aluno já tem (a mesma conta da aba Progresso,
 * `medalhasDaFicha`), por id. Quem não tem nenhuma fica de fora.
 * @param {any[]} alunos @param {Map<string, any[]>} gastosPorEmail
 * @param {Map<string, any[]>} conclusoesPorEmail @param {string[]} pausadas
 * @returns {Map<string, number>}
 */
export function medalhasPorAluno(alunos, gastosPorEmail, conclusoesPorEmail, pausadas) {
  const mm = new Map();
  for (const a of alunos) {
    const email = (a.email || '').trim().toLowerCase();
    const gastos = email ? (gastosPorEmail.get(email) || []) : [];
    const conclusoes = email ? (conclusoesPorEmail.get(email) || []) : [];
    const n = medalhasDaFicha(a, { gastos, conclusoes, pausadas }).filter((m) => m.ok).length;
    if (n > 0) mm.set(a.id, n);
  }
  return mm;
}

/** Busca, conta e entrega os selos à lista; publica o ranking do box. */
export async function atualizarSelosDaLista() {
  let bruto;
  try {
    bruto = await carregarTodosGastos(); // Map(email → gastos[])
    const dias = semanaSegSab().map(isoLocal);
    definirKcalDaSemana(kcalDaSemana(bruto, dias[0], dias[5]));
    publicarRanking(db.listar(), bruto); // o ranking do box usa o mesmo mapa
  } catch (e) { console.warn('Nutrição (lista):', /** @type {any} */ (e)?.code || e); return; }
  try {
    const conclusoes = await carregarTodasConclusoes(); // Map(email → concluidos[])
    // Semanas do box em branco (recesso): pausam a sequência, como no app e no Portal.
    const pausadas = await carregarSemanasPausadas();
    definirMedalhas(medalhasPorAluno(db.listar(), bruto, conclusoes, pausadas));
  } catch (e) { console.warn('Medalhas (lista):', /** @type {any} */ (e)?.code || e); }
}
