// @ts-check
/**
 * CATÁLOGO DE EXERCÍCIOS — a regra de EXIBIÇÃO da aba Catálogo, sem DOM (o teste
 * roda no Node). Quem decide o que é válido é o servidor: as listas fechadas
 * (músculos, equipamentos, vagas, estações, padrões) chegam no `vocabulario` do
 * `listarCatalogoBox`, e `salvarExercicioCatalogo` revalida tudo. Aqui só ficam os
 * RÓTULOS em português e o agrupamento por modalidade.
 */

/** As abas da lista. `hyrox` mostra as 8 estações da prova (só leitura). */
export const MODALIDADES_CATALOGO = /** @type {const} */ ([
  { id: 'forca', nome: 'Força · H1–H3' },
  { id: 'hiit', nome: 'HIIT' },
  { id: 'cross', nome: 'Cross' },
  { id: 'hyrox', nome: 'Hyrox' },
  { id: 'todos', nome: 'Todos' },
]);

/** @type {Record<string, string>} */
export const ROTULO_MUSCULO = {
  peito: 'Peito', costas: 'Costas', ombro: 'Ombro', trapezio: 'Trapézio', biceps: 'Bíceps', triceps: 'Tríceps',
  antebraco: 'Antebraço', core: 'Core', lombar: 'Lombar', quadriceps: 'Quadríceps', posterior_coxa: 'Posterior de coxa',
  gluteo: 'Glúteo', panturrilha: 'Panturrilha',
};

/** @type {Record<string, string>} */
export const ROTULO_EQUIPAMENTO = {
  smith: 'Smith', banco: 'Banco', monocross: 'Monocross', flexora: 'Mesa flexora', extensora: 'Cadeira extensora',
  cavalinho: 'Cavalinho (landmine)', halteres: 'Halteres', barra: 'Barra', anilhas: 'Anilhas', kettlebell: 'Kettlebell',
  caixote: 'Caixote', step: 'Step', trx: 'TRX', banco_scott: 'Banco Scott', colchonete: 'Colchonete',
  peso_corporal: 'Peso corporal', wall_ball: 'Wall ball', corda_naval: 'Corda naval', corda_pular: 'Corda de pular',
  sandbag: 'Sandbag', air_bike: 'Air bike',
};

/** A vaga do bloco H (instância de movimento). @type {Record<string, string>} */
export const ROTULO_INSTANCIA = {
  agachar: 'Agachar', estender_quadril: 'Estender quadril', empurrar_horizontal: 'Empurrar horizontal',
  empurrar_vertical: 'Empurrar vertical', puxar_horizontal: 'Puxar horizontal', puxar_vertical: 'Puxar vertical',
  estabilizar_tronco: 'Estabilizar tronco',
};

/** @type {Record<string, string>} */
export const ROTULO_ESTACAO_HIIT = { pernas: 'Pernas', core: 'Core', superiores: 'Superiores', cardio: 'Cardio' };

/** @type {Record<string, string>} */
export const ROTULO_PADRAO_CROSS = {
  cardio: 'Cardio', agachar: 'Agachar', quadril: 'Quadril', empurrar: 'Empurrar', puxar: 'Puxar',
  corpo_todo: 'Corpo todo', olimpico: 'Olímpico', core: 'Core',
};

/** @type {Record<string, string>} */
export const ROTULO_UNIDADE = { reps: 'reps', metros: 'm', calorias: 'cal', segundos: 's' };

/** @type {Record<string, string>} */
export const ROTULO_ADAPTACAO = { joelho: 'Joelho', lombar: 'Lombar', ombro: 'Ombro', mobilidade: 'Mobilidade' };

/** @type {Record<string, string>} */
export const ROTULO_FOCO = { olimpico: 'olímpico', barra: 'barra', kettlebell: 'kettlebell', ginastica: 'ginástica' };

/** O rótulo, ou a própria chave (valor novo no servidor aparece cru, mas aparece). @param {Record<string, string>} mapa @param {string} chave */
export const rotulo = (mapa, chave) => mapa[chave] ?? String(chave).replace(/_/g, ' ');

/** Comparação que ignora caixa e acento (a mesma ideia do `nomeComparavel` do servidor). @param {string} s */
export const comparavel = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * O exercício bate com a busca? Procura no nome, nos músculos e nos
 * equipamentos (rótulos), para "smith" ou "glúteo" acharem o que se espera.
 * @param {any} e @param {string} busca
 */
export function bateComBusca(e, busca) {
  const termo = comparavel(busca);
  if (!termo) return true;
  const texto = comparavel([
    e.nome,
    ...e.musculoPrincipal.map((m) => rotulo(ROTULO_MUSCULO, m)),
    ...e.musculosSecundarios.map((m) => rotulo(ROTULO_MUSCULO, m)),
    ...e.equipamentos.map((q) => rotulo(ROTULO_EQUIPAMENTO, q)),
  ].join(' '));
  return termo.split(' ').every((t) => texto.includes(t));
}

/** O exercício entra nessa modalidade? @param {any} e @param {string} modalidade */
export function daModalidade(e, modalidade) {
  if (modalidade === 'forca') return !!e.instancia;
  if (modalidade === 'hiit') return !!e.hiit?.length;
  if (modalidade === 'cross') return !!e.cross;
  return modalidade === 'todos';
}

/**
 * Quantos exercícios em cada aba (ativos / total) — o número que aparece na aba.
 * @param {any[]} exercicios @returns {Record<string, {ativos: number, total: number}>}
 */
export function contagemPorModalidade(exercicios, hyrox = 0) {
  /** @type {Record<string, {ativos: number, total: number}>} */
  const r = {};
  for (const { id } of MODALIDADES_CATALOGO) {
    const doGrupo = id === 'hyrox' ? [] : exercicios.filter((e) => daModalidade(e, id));
    r[id] = id === 'hyrox' ? { ativos: hyrox, total: hyrox } : { ativos: doGrupo.filter((e) => e.ativo).length, total: doGrupo.length };
  }
  return r;
}

/**
 * Os grupos da lista para a aba escolhida, já filtrados pela busca e pelos
 * desativados. Força agrupa pela VAGA (na ordem do vocabulário do servidor);
 * HIIT pela estação (um exercício de duas estações aparece nas duas); Cross pelo
 * padrão. Grupo vazio some.
 * @param {any[]} exercicios
 * @param {{modalidade: string, busca?: string, mostrarInativos?: boolean, vocabulario?: any}} o
 * @returns {{chave: string, titulo: string, subtitulo: string, itens: any[]}[]}
 */
export function gruposDoCatalogo(exercicios, { modalidade, busca = '', mostrarInativos = true, vocabulario = null }) {
  const visiveis = exercicios.filter((e) => daModalidade(e, modalidade) && (mostrarInativos || e.ativo) && bateComBusca(e, busca));
  /** @param {string} chave @param {string} titulo @param {string} subtitulo @param {(e: any) => boolean} filtro */
  const grupo = (chave, titulo, subtitulo, filtro) => ({ chave, titulo, subtitulo, itens: visiveis.filter(filtro) });
  let grupos;
  if (modalidade === 'forca') {
    const ordem = vocabulario?.instancias ?? Object.keys(ROTULO_INSTANCIA);
    grupos = ordem.map((i) => {
      const sessoes = exercicios.find((e) => e.instancia === i)?.sessoes ?? [];
      return grupo(i, rotulo(ROTULO_INSTANCIA, i), sessoes.length ? `Vaga do ${sessoes.join(' · ')}` : '', (e) => e.instancia === i);
    });
  } else if (modalidade === 'hiit') {
    const ordem = vocabulario?.estacoesHiit ?? Object.keys(ROTULO_ESTACAO_HIIT);
    grupos = ordem.map((s) => grupo(s, `Estação ${rotulo(ROTULO_ESTACAO_HIIT, s)}`, '', (e) => e.hiit?.includes(s)));
  } else if (modalidade === 'cross') {
    const ordem = vocabulario?.padroesCross ?? Object.keys(ROTULO_PADRAO_CROSS);
    grupos = ordem.map((p) => grupo(p, rotulo(ROTULO_PADRAO_CROSS, p), '', (e) => e.cross?.padrao === p));
  } else {
    grupos = [grupo('todos', 'Todos os exercícios', '', () => true)];
  }
  return grupos.filter((g) => g.itens.length);
}

/**
 * A linha "onde entra" do exercício: vaga do H, estações do HIIT, padrão do Cross.
 * @param {any} e @returns {string[]}
 */
export function ondeEntra(e) {
  const partes = [];
  if (e.instancia) partes.push(`Força: ${rotulo(ROTULO_INSTANCIA, e.instancia)}${e.sessoes?.length ? ` (${e.sessoes.join(', ')})` : ''}`);
  if (e.hiit?.length) partes.push(`HIIT: ${e.hiit.map((s) => rotulo(ROTULO_ESTACAO_HIIT, s)).join(', ')}`);
  if (e.cross) {
    const c = e.cross;
    partes.push(`Cross: ${rotulo(ROTULO_PADRAO_CROSS, c.padrao)} · ${c.rx} ${rotulo(ROTULO_UNIDADE, c.unidade)}`
      + `${c.carga ? ` · ${c.carga.rx}` : ''}${c.foco ? ` · foco da técnica (${rotulo(ROTULO_FOCO, c.foco)})` : ''}`);
  }
  return partes;
}

/** Mais de uma vez no formulário (checkbox): sempre lista. @param {unknown} v @returns {string[]} */
const lista = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map(String);

/**
 * Os campos do formulário (objeto plano, como o `FormData` vira) → o pedido do
 * `salvarExercicioCatalogo`. Sem `id` = criar, e aí vão também a vaga de força,
 * as estações do HIIT e o Cross. O servidor revalida tudo.
 * @param {Record<string, any>} f
 */
export function pedidoDoFormulario(f) {
  /** @type {Record<string, string>} */
  const adaptacoes = {};
  for (const a of Object.keys(ROTULO_ADAPTACAO)) if (f[`adapt_${a}`]) adaptacoes[a] = String(f[`adapt_${a}`]);
  /** @type {Record<string, any>} */
  const pedido = {
    nome: String(f.nome ?? '').trim(),
    musculoPrincipal: lista(f.principal),
    musculosSecundarios: lista(f.secundario),
    equipamentos: lista(f.equip),
    adaptacoes,
    unilateral: f.unilateral === 'on' || f.unilateral === true,
  };
  if (f.id) return { id: String(f.id), ...pedido };
  if (f.instancia) pedido.instancia = String(f.instancia);
  const estacoes = lista(f.estacao);
  if (estacoes.length) pedido.hiit = { estacoes };
  if (f.cross === 'on' || f.cross === true) {
    const rx = Number(f.cross_rx);
    pedido.cross = { padrao: String(f.cross_padrao ?? ''), unidade: String(f.cross_unidade ?? ''), rx: Number.isFinite(rx) ? rx : 0 };
    const cargaRx = String(f.cross_carga_rx ?? '').trim();
    const cargaScaled = String(f.cross_carga_scaled ?? '').trim();
    if (cargaRx || cargaScaled) pedido.cross.carga = { rx: cargaRx, scaled: cargaScaled };
  }
  return pedido;
}

/**
 * O formulário de volta a partir de um pedido que o servidor recusou — para
 * reabrir com o que o coach digitou, e não com o exercício de antes.
 * @param {Record<string, any>} pedido @param {any} [atual] o exercício que estava sendo editado
 */
export function exercicioDoPedido(pedido, atual = null) {
  return {
    ...(atual ?? {}),
    id: pedido.id ?? atual?.id ?? '',
    nome: pedido.nome,
    musculoPrincipal: pedido.musculoPrincipal,
    musculosSecundarios: pedido.musculosSecundarios,
    equipamentos: pedido.equipamentos,
    unilateral: pedido.unilateral,
    adaptacoes: Object.entries(pedido.adaptacoes ?? {}).map(([adaptacao, exercicioId]) => ({ adaptacao, exercicioId })),
    instancia: pedido.instancia ?? atual?.instancia ?? null,
    hiit: pedido.hiit?.estacoes ?? atual?.hiit ?? null,
    cross: pedido.cross ? { ...pedido.cross, carga: pedido.cross.carga ?? null } : atual?.cross ?? null,
  };
}
