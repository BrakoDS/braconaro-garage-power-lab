// @ts-check
/**
 * A semana de treino do aluno — quem veio, quem trocou, quem faltou.
 *
 * Módulo puro: sem DOM e sem Firebase, para poder ser testado direto no Node
 * (veja semana.test.js). É usado dos dois lados: o painel de check-in do coach
 * desenha os quadrados a partir daqui, e o Portal do Aluno mostra os mesmos.
 *
 * O QUE PODE ACONTECER COM UMA AULA
 *
 * 1. CHECK-IN — o aluno veio no dia e na hora dele. O caso normal.
 *
 * 2. ALTERAR DIA — ele avisou antes que não pode, e a aula foi movida para outro
 *    dia e/ou outra hora, DENTRO DA MESMA SEMANA. Isso é final: se o novo
 *    horário passar sem presença, é falta, e nenhuma outra presença da semana a
 *    resgata. Quem marcou foi o coach; o sistema não discute.
 *
 * 3. ATESTADO — conta como falta, mas gera o direito de repor a aula, e essa
 *    reposição pode cair em qualquer semana. Enquanto não for agendada, fica
 *    como crédito pendente; agendada, vira um quadrado a mais na semana em que
 *    caiu, com check-in próprio.
 *
 * 4. FALTA — o prazo passou e nada aconteceu.
 *
 * COBERTURA AUTOMÁTICA é a rede para o dia em que ninguém marcou nada: uma
 * presença fora da grade cobre uma aula sem resolução, da mais antiga para a
 * mais nova. Só entra em aulas que o coach não tocou, e só usa presenças que
 * nenhuma outra sessão reservou.
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

/** O dia da semana ('seg'…'dom') de uma data ISO. */
export function chaveDoDia(iso) {
  return ORDEM_DIAS[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
}

/**
 * Uma remarcação já normalizada.
 *
 * O formato antigo era só a data (`'2026-09-03'`); o novo carrega a hora junto,
 * porque a troca pode ser só de horário no mesmo dia. Fichas gravadas antes
 * continuam entrando por aqui sem migração.
 * @param {any} v @returns {{data:string, hora:string}|null}
 */
function normalizarRemarcacao(v) {
  if (!v) return null;
  if (typeof v === 'string') return { data: v, hora: '' };
  return v.data ? { data: v.data, hora: v.hora || '' } : null;
}

/**
 * @typedef {Object} Quadrado
 * @property {'fixo'|'extra'|'reposicao'} tipo
 * @property {string} chave         dia da semana em que o quadrado aparece
 * @property {string} iso           data planejada da aula (nos extras, o dia em que veio)
 * @property {string} efetivo       data em que a aula vale — igual a `iso`, ou a remarcada
 * @property {string} horaPrevista  'HH:MM' em que ela deveria acontecer ('' se não houver)
 * @property {boolean} alterado     o coach mexeu nesta aula (dia e/ou hora)
 * @property {boolean} remarcado    o DIA mudou (hora-só não conta)
 * @property {'ok'|'falta'|'aguardando'|'atestado'} estado
 * @property {string} [origem]      nas reposições, a data da aula perdida que gerou o crédito
 * @property {string} [veioEm]      data em que ele veio, quando é diferente da planejada
 * @property {string} [hora]        hora do check-in de verdade
 */

/**
 * @typedef {Object} EntradaSemana
 * @property {string[]} [diasTreino]                 dias fixos ('seg'…'sab')
 * @property {Record<string,string>} [horarios]      dia da semana → 'HH:MM' da aula
 * @property {string[]} [presencas]                  datas com check-in
 * @property {Record<string,string>} [horas]         data → 'HH:MM' do check-in
 * @property {Record<string,any>} [remarcacoes]      data planejada → {data, hora}
 * @property {Record<string,any>} [atestados]        data da aula perdida → {reposicao?:{data,hora}}
 * @property {Date} [hoje]
 */

/**
 * Os créditos de reposição que ainda não foram agendados.
 * @param {Record<string,any>} [atestados]
 * @returns {string[]} datas das aulas perdidas, da mais antiga para a mais nova
 */
export function reposicoesPendentes(atestados = {}) {
  return Object.entries(atestados)
    .filter(([, v]) => !(v && v.reposicao && v.reposicao.data))
    .map(([iso]) => iso).sort();
}

/**
 * Monta os quadrados da semana de `hoje`.
 * @param {EntradaSemana} p
 * @returns {Quadrado[]} os dias fixos na ordem da semana, depois reposições e extras
 */
export function semanaDoAluno({
  diasTreino = [], horarios = {}, presencas = [], horas = {},
  remarcacoes = {}, atestados = {}, hoje = new Date(),
} = {}) {
  const daSemana = datasDaSemana(hoje);
  const hojeIso = dataIso(hoje);
  const isosDaSemana = new Set(Object.values(daSemana));

  const fixos = ORDEM_DIAS.filter((k) => diasTreino.includes(k));
  const presentes = new Set(presencas.filter((iso) => isosDaSemana.has(iso)));

  // Reposições agendadas que caem nesta semana. Entram como aula de verdade:
  // ocupam um dia, aparecem na grade e têm check-in próprio.
  const reposicoes = Object.entries(atestados)
    .map(([origem, v]) => ({ origem, rep: v && v.reposicao }))
    .filter((x) => x.rep && isosDaSemana.has(x.rep.data))
    .sort((a, b) => (a.rep.data < b.rep.data ? -1 : 1));

  // Cada aula reserva o dia em que ela vale. O que sobra dessas reservas é
  // presença solta, e só ela alimenta a cobertura automática — sem isso, a
  // presença de quinta poderia cobrir a segunda E ainda contar como a quinta.
  const reservados = new Set();
  for (const k of fixos) {
    const iso = daSemana[k];
    if (atestados[iso]) continue; // atestado não usa dia nenhum desta semana
    const r = normalizarRemarcacao(remarcacoes[iso]);
    reservados.add(r ? r.data : iso);
  }
  for (const { rep } of reposicoes) reservados.add(rep.data);
  const sobrando = [...presentes].filter((iso) => !reservados.has(iso)).sort();

  const quadrados = fixos.map((k) => {
    const iso = daSemana[k];
    const base = { tipo: /** @type {'fixo'} */ ('fixo'), chave: k, iso };

    // Atestado: falta com direito a repor. Não recebe cobertura automática — o
    // coach já disse o que aconteceu, e o crédito é a compensação.
    if (atestados[iso]) {
      return { ...base, efetivo: iso, horaPrevista: horarios[k] || '', alterado: true, remarcado: false, estado: /** @type {'atestado'} */ ('atestado') };
    }

    const r = normalizarRemarcacao(remarcacoes[iso]);
    const efetivo = r ? r.data : iso;
    const remarcado = efetivo !== iso;
    const horaPrevista = (r && r.hora) || horarios[chaveDoDia(efetivo)] || horarios[k] || '';
    const b = { ...base, efetivo, horaPrevista, alterado: !!r, remarcado };

    if (presentes.has(efetivo)) {
      return { ...b, estado: /** @type {'ok'} */ ('ok'), veioEm: remarcado ? efetivo : undefined, hora: horas[efetivo] };
    }
    if (r) {
      return { ...b, estado: /** @type {'falta'|'aguardando'} */ (efetivo < hojeIso ? 'falta' : 'aguardando') };
    }
    if (sobrando.length) {
      const veioEm = sobrando.shift();
      return { ...b, estado: /** @type {'ok'} */ ('ok'), veioEm, hora: horas[veioEm] };
    }
    return { ...b, estado: /** @type {'falta'|'aguardando'} */ (iso < hojeIso ? 'falta' : 'aguardando') };
  });

  const quadradosReposicao = reposicoes.map(({ origem, rep }) => ({
    tipo: /** @type {'reposicao'} */ ('reposicao'), chave: chaveDoDia(rep.data), iso: rep.data,
    efetivo: rep.data, horaPrevista: rep.hora || '', alterado: false, remarcado: false, origem,
    estado: /** @type {'ok'|'falta'|'aguardando'} */ (
      presentes.has(rep.data) ? 'ok' : rep.data < hojeIso ? 'falta' : 'aguardando'),
    hora: horas[rep.data],
  }));

  // O que sobrou depois de cobrir todas as aulas é treino a mais na semana.
  const extras = sobrando.map((iso) => ({
    tipo: /** @type {'extra'} */ ('extra'), chave: chaveDoDia(iso), iso, efetivo: iso,
    horaPrevista: '', alterado: false, remarcado: false,
    estado: /** @type {'ok'} */ ('ok'), hora: horas[iso],
  }));

  return [...quadrados, ...quadradosReposicao, ...extras];
}
