// @ts-check
/**
 * A semana de treino do aluno — quem veio, quem faltou, quem trocou de dia.
 *
 * Módulo puro: sem DOM e sem Firebase, para poder ser testado direto no Node
 * (veja semana.test.js). É usado dos dois lados: o painel de check-in do coach
 * desenha os quadrados a partir daqui, e o Portal do Aluno mostra os mesmos.
 *
 * DUAS FORMAS DE UM TREINO MUDAR DE DIA
 *
 * 1. REMARCAÇÃO EXPLÍCITA — o coach diz, no check-in, que a sessão de segunda
 *    aconteceu (ou vai acontecer) na quinta. Isso é final: se a quinta passar
 *    sem presença, a segunda é falta, e nenhuma outra presença da semana a
 *    resgata. Quem marcou foi o coach; o sistema não discute.
 *
 * 2. COBERTURA AUTOMÁTICA — a rede para o dia em que ninguém marcou nada. Uma
 *    presença fora da grade cobre uma falta num dia fixo, da mais antiga para a
 *    mais nova. Só entra em sessões que o coach não tocou, e só usa presenças
 *    que nenhuma remarcação reservou.
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

/** As 7 datas da semana de `d`, indexadas por 'seg'…'dom'. @returns {Record<string,string>} */
export function datasDaSemana(d = new Date()) {
  const seg = segundaDaSemana(d);
  /** @type {Record<string,string>} */
  const mapa = {};
  ORDEM_DIAS.forEach((k, i) => { const x = new Date(seg); x.setDate(x.getDate() + i); mapa[k] = dataIso(x); });
  return mapa;
}

/**
 * @typedef {Object} Quadrado
 * @property {string} chave         dia da semana ('seg'…'dom'); nos extras, o dia em que veio
 * @property {string} iso           data planejada da sessão (a data do quadrado)
 * @property {'ok'|'falta'|'aguardando'} estado
 * @property {string} efetivo       data em que a sessão vale — igual a `iso`, ou a remarcada
 * @property {boolean} remarcado    o coach mudou o dia desta sessão
 * @property {string} [veioEm]      data em que o aluno veio, quando é diferente da planejada
 * @property {string} [hora]        hora do check-in, quando registrada
 * @property {boolean} extra        true = treino além dos dias fixos
 */

/**
 * Monta os quadrados da semana de `hoje`.
 *
 * @param {Object} p
 * @param {string[]} p.diasTreino    dias fixos do aluno (ex.: ['seg','ter','qua'])
 * @param {string[]} p.presencas     datas 'YYYY-MM-DD' com check-in
 * @param {Record<string,string>} [p.horas]        data → 'HH:MM' do check-in
 * @param {Record<string,string>} [p.remarcacoes]  data planejada → data escolhida pelo coach
 * @param {Date} [p.hoje]
 * @returns {Quadrado[]} os dias fixos na ordem da semana, seguidos dos extras
 */
export function semanaDoAluno({ diasTreino = [], presencas = [], horas = {}, remarcacoes = {}, hoje = new Date() } = {}) {
  const daSemana = datasDaSemana(hoje);
  const hojeIso = dataIso(hoje);
  const isosDaSemana = new Set(Object.values(daSemana));

  const fixos = ORDEM_DIAS.filter((k) => diasTreino.includes(k));
  const presentes = new Set(presencas.filter((iso) => isosDaSemana.has(iso)));

  // Cada sessão reserva o dia em que ela vale — o próprio, ou o remarcado. O que
  // fica de fora dessas reservas é presença solta, e só ela alimenta a cobertura
  // automática. Sem esta reserva, a presença de quinta poderia cobrir a segunda
  // por conta própria E ainda contar como o cumprimento da quinta.
  const reservados = new Set(fixos.map((k) => remarcacoes[daSemana[k]] || daSemana[k]));
  const sobrando = [...presentes].filter((iso) => !reservados.has(iso)).sort();

  const quadrados = fixos.map((k) => {
    const iso = daSemana[k];
    const efetivo = remarcacoes[iso] || iso;
    const remarcado = efetivo !== iso;
    const base = { chave: k, iso, efetivo, remarcado, extra: false };

    if (presentes.has(efetivo)) {
      return { ...base, estado: /** @type {'ok'} */ ('ok'), veioEm: remarcado ? efetivo : undefined, hora: horas[efetivo] };
    }
    // Remarcada e ainda sem presença: quem decide é o prazo do dia REMARCADO.
    // A cobertura automática não entra aqui — o coach já disse onde essa sessão vive.
    if (remarcado) {
      return { ...base, estado: /** @type {'falta'|'aguardando'} */ (efetivo < hojeIso ? 'falta' : 'aguardando') };
    }
    if (sobrando.length) {
      const veioEm = sobrando.shift();
      return { ...base, estado: /** @type {'ok'} */ ('ok'), veioEm, hora: horas[veioEm] };
    }
    return { ...base, estado: /** @type {'falta'|'aguardando'} */ (iso < hojeIso ? 'falta' : 'aguardando') };
  });

  // O que sobrou depois de cobrir todas as faltas é treino a mais na semana.
  const extras = sobrando.map((iso) => ({
    chave: ORDEM_DIAS.find((k) => daSemana[k] === iso) || '',
    iso, efetivo: iso, remarcado: false,
    estado: /** @type {'ok'} */ ('ok'), hora: horas[iso], extra: true,
  }));

  return [...quadrados, ...extras];
}
