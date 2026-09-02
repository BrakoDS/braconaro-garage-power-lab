// @ts-check
/**
 * Meta mínima de água do aluno — cálculo puro (sem DOM, sem Firebase).
 *
 * Duas contas, não uma: o corpo pede um tanto por dia só para funcionar, e o
 * treino cobra o que sai no suor. Mostrar um número só faria o aluno beber de
 * menos no dia de treino ou de mais no dia de descanso.
 *
 * Base de 35 ml por quilo — a faixa usual para adulto ativo é 30 a 40 ml/kg, e
 * quem treina fica no meio dela. O acréscimo de 500 ml cobre uma sessão de
 * cerca de uma hora; a perda real por hora de exercício fica entre 500 ml e
 * 1 litro dependendo do calor, então este é o piso, não o teto.
 *
 * É orientação geral. Quem tem restrição de líquido por rim ou coração segue a
 * orientação médica, não esta conta — e a tela diz isso.
 */

export const ML_POR_KG = 35;
export const ML_TREINO = 500;
export const GARRAFA_ML = 500;

/**
 * A meta em mililitros, para o dia com treino e para o dia sem.
 *
 * Arredonda a 50 ml: `35 × 82,4 = 2.884` é uma precisão que a conta não tem, e
 * um número redondo é o que o aluno consegue mirar com a garrafa dele.
 *
 * @param {number|string} pesoKg
 * @returns {{base:number, comTreino:number, mlPorKg:number, mlTreino:number}|null}
 */
export function metaAgua(pesoKg, { mlPorKg = ML_POR_KG, mlTreino = ML_TREINO } = {}) {
  const peso = parseFloat(String(pesoKg ?? '').replace(',', '.'));
  if (!Number.isFinite(peso) || peso <= 0) return null;
  const base = Math.round((peso * mlPorKg) / 50) * 50;
  return { base, comTreino: base + mlTreino, mlPorKg, mlTreino };
}

/** Mililitros em litros, com uma casa e vírgula: 2850 → "2,9". */
export function emLitros(ml) {
  const l = Math.round((Number(ml) || 0) / 100) / 10;
  return l.toFixed(1).replace('.', ',');
}

/**
 * Quantas garrafas de `tamanho` ml. Arredonda para CIMA de propósito: este é um
 * mínimo, e uma garrafa a menos por dia é justamente o erro que ele evita.
 */
export function emGarrafas(ml, tamanho = GARRAFA_ML) {
  const t = Number(tamanho) || GARRAFA_ML;
  return Math.max(1, Math.ceil((Number(ml) || 0) / t));
}
