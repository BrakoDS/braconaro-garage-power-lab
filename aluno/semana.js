// @ts-check
/**
 * A semana de treino do aluno — quem veio, quem faltou, quem compensou.
 *
 * Módulo puro: sem DOM e sem Firebase, para poder ser testado direto no Node
 * (veja semana.test.js). Quem desenha os quadrados é o app.js.
 *
 * Regra combinada com o coach: o que conta é o número de treinos na semana, não
 * o comparecimento em cada dia marcado. Uma presença fora dos dias fixos "cobre"
 * uma falta num dia fixo — o quadrado continua verde e passa a dizer quando o
 * aluno realmente veio. Só fica vermelho o dia fixo que já passou e não teve
 * nenhuma presença sobrando para cobri-lo.
 */

/** Ordem da semana do box: começa na segunda. */
export const ORDEM_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

/** 'YYYY-MM-DD' de uma data, no fuso local. */
export function dataIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Segunda-feira da semana de uma data. */
export function segundaDaSemana(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0=dom..6=sab
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

/**
 * @typedef {Object} Quadrado
 * @property {string} chave     dia da semana ('seg'…'dom'); '' nos treinos extras
 * @property {string} iso       data do quadrado
 * @property {'ok'|'falta'|'aguardando'} estado
 * @property {string} [veioEm]  data em que o aluno veio, quando trocou de dia
 * @property {string} [hora]    hora do check-in, quando registrada
 * @property {boolean} extra    true = treino além dos dias fixos
 */

/**
 * Monta os quadrados da semana de `hoje`.
 *
 * @param {Object} p
 * @param {string[]} p.diasTreino    dias fixos do aluno (ex.: ['seg','ter','qua'])
 * @param {string[]} p.presencas     datas 'YYYY-MM-DD' com check-in
 * @param {Record<string,string>} [p.horas]  data → 'HH:MM' do check-in
 * @param {Date} [p.hoje]
 * @returns {Quadrado[]} os dias fixos na ordem da semana, seguidos dos extras
 */
export function semanaDoAluno({ diasTreino = [], presencas = [], horas = {}, hoje = new Date() } = {}) {
  const seg = segundaDaSemana(hoje);
  const hojeIso = dataIso(hoje);

  /** @type {Record<string,string>} chave do dia → data desta semana */
  const daSemana = {};
  ORDEM_DIAS.forEach((k, i) => { const d = new Date(seg); d.setDate(d.getDate() + i); daSemana[k] = dataIso(d); });
  const isosDaSemana = new Set(Object.values(daSemana));

  const fixos = ORDEM_DIAS.filter((k) => diasTreino.includes(k));
  const isosFixos = new Set(fixos.map((k) => daSemana[k]));
  const presentes = new Set(presencas.filter((iso) => isosDaSemana.has(iso)));

  // Presenças fora dos dias fixos ficam na fila para cobrir faltas, da mais
  // antiga para a mais nova — assim a compensação segue a ordem dos fatos.
  const sobrando = [...presentes].filter((iso) => !isosFixos.has(iso)).sort();

  const quadrados = fixos.map((k) => {
    const iso = daSemana[k];
    if (presentes.has(iso)) return { chave: k, iso, estado: 'ok', hora: horas[iso], extra: false };
    if (sobrando.length) {
      const veioEm = sobrando.shift();
      return { chave: k, iso, estado: 'ok', veioEm, hora: horas[veioEm], extra: false };
    }
    return { chave: k, iso, estado: iso < hojeIso ? 'falta' : 'aguardando', extra: false };
  });

  // O que sobrou depois de cobrir todas as faltas é treino a mais na semana.
  const extras = sobrando.map((iso) => ({
    chave: ORDEM_DIAS.find((k) => daSemana[k] === iso) || '',
    iso, estado: /** @type {'ok'} */ ('ok'), hora: horas[iso], extra: true,
  }));

  return [...quadrados, ...extras];
}
