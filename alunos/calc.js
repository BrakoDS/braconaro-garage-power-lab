// @ts-check
/**
 * Cálculos antropométricos da avaliação.
 * % de gordura: Pollock 3 dobras (Jackson & Pollock) → densidade → Siri.
 * IMC, RCQ, massa gorda/magra e classificações.
 */
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Sexo normalizado a partir do cadastro do aluno: 'M' | 'F' | null. */
export function sexoCod(aluno) {
  const s = (aluno?.sexo || '').toLowerCase();
  if (s.startsWith('masc')) return 'M';
  if (s.startsWith('fem')) return 'F';
  return null;
}

/** Dobras do protocolo Pollock 3, por sexo. */
export const DOBRAS_M = [
  { key: 'peitoral', label: 'Peitoral' },
  { key: 'abdominal', label: 'Abdominal' },
  { key: 'coxa', label: 'Coxa' },
];
export const DOBRAS_F = [
  { key: 'triceps', label: 'Tríceps' },
  { key: 'suprailiaca', label: 'Supra-ilíaca' },
  { key: 'coxa', label: 'Coxa' },
];
export function dobrasDoSexo(cod) { return cod === 'F' ? DOBRAS_F : DOBRAS_M; }

/** Perímetros (conjunto essencial). */
export const PERIMETROS = [
  { key: 'cintura', label: 'Cintura' },
  { key: 'abdomen', label: 'Abdômen' },
  { key: 'quadril', label: 'Quadril' },
  { key: 'bracoContraido', label: 'Braço contraído' },
  { key: 'coxa', label: 'Coxa' },
  { key: 'panturrilha', label: 'Panturrilha' },
];

export function idadeDe(iso) {
  if (!iso) return null;
  const n = new Date(iso + 'T00:00:00'); const h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) i--;
  return i >= 0 && i < 130 ? i : null;
}

export function imc(peso, estaturaCm) {
  const p = num(peso), e = num(estaturaCm);
  if (!p || !e) return null;
  const m = e / 100;
  return p / (m * m);
}
export function classifImc(v) {
  if (v == null) return '';
  if (v < 18.5) return 'Abaixo do peso';
  if (v < 25) return 'Peso normal';
  if (v < 30) return 'Sobrepeso';
  if (v < 35) return 'Obesidade I';
  if (v < 40) return 'Obesidade II';
  return 'Obesidade III';
}

/** Densidade corporal — Pollock 3 dobras (J&P). soma em mm, idade em anos. */
export function densidade3(soma, idade, cod) {
  if (!soma || !idade || !cod) return null;
  if (cod === 'M') return 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * idade;
  return 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * idade;
}
/** % de gordura por Siri a partir da densidade. */
export function siri(D) { return D ? 495 / D - 450 : null; }

/** Classificação geral do % de gordura (faixas ACSM/ACE), por sexo. */
export function classifGordura(perc, cod) {
  if (perc == null || !cod) return '';
  const M = [[6, 'Essencial'], [14, 'Atletas'], [18, 'Bom'], [25, 'Aceitável'], [Infinity, 'Acima do ideal']];
  const F = [[14, 'Essencial'], [21, 'Atletas'], [25, 'Bom'], [32, 'Aceitável'], [Infinity, 'Acima do ideal']];
  for (const [lim, nome] of (cod === 'F' ? F : M)) if (perc < lim) return nome;
  return '';
}

export function rcq(cintura, quadril) {
  const c = num(cintura), q = num(quadril);
  if (!c || !q) return null;
  return c / q;
}
export function classifRcq(v, cod) {
  if (v == null || !cod) return '';
  const lim = cod === 'F' ? 0.85 : 0.90;
  if (v < lim) return 'Risco baixo';
  if (v < lim + 0.10) return 'Risco moderado';
  return 'Risco alto';
}

/** Calcula todos os resultados de uma avaliação (com o aluno para sexo/idade). */
export function calcular(av, aluno) {
  const cod = sexoCod(aluno);
  const idade = aluno?.nascimento ? idadeDe(aluno.nascimento) : num(aluno?.idade);
  const dobras = av?.dobras || {};
  const vals = dobrasDoSexo(cod).map((d) => num(dobras[d.key]));
  const completo = vals.length && vals.every((v) => v != null);
  const soma = completo ? vals.reduce((s, v) => s + v, 0) : null;
  const D = densidade3(soma, idade, cod);
  const perc = siri(D);
  const peso = num(av?.peso);
  const massaGorda = (perc != null && peso != null) ? peso * perc / 100 : null;
  const massaMagra = (massaGorda != null && peso != null) ? peso - massaGorda : null;
  const bmi = imc(av?.peso, av?.estatura);
  const per = av?.perimetros || {};
  const r = rcq(per.cintura, per.quadril);
  return {
    cod, idade, soma,
    imc: bmi, imcClass: classifImc(bmi),
    perc, percClass: classifGordura(perc, cod),
    massaGorda, massaMagra,
    rcq: r, rcqClass: classifRcq(r, cod),
    faltaSexo: !cod, faltaIdade: !idade,
  };
}
