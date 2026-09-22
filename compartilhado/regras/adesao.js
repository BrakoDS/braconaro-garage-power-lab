// @ts-check
/**
 * Adesão do aluno à rotina de hábitos — o que o coach precisa saber olhando.
 *
 * O app mobile grava um documento por aluno em `rotinas/{email}`:
 *
 *     { blocos: [ { id, nome, horario, dias:['seg',...], categoria, ... } ],
 *       concluidos: { 'YYYY-MM-DD': ['id-do-bloco', ...] } }
 *
 * `blocos` é o que foi **prescrito** (inclui os dois hábitos obrigatórios, água e
 * creatina, derivados do peso da última avaliação) e `concluidos` é o que foi
 * **cumprido**, dia a dia, com poda em ~90 dias. Este módulo transforma os dois
 * numa leitura que caiba num olhar: o percentual da semana, a sequência atual e
 * um mapa de consistência diária.
 *
 * Módulo puro: sem DOM e sem Firebase, para poder ser testado direto no Node
 * (veja adesao.test.js). Quem busca o documento é `coach/gestao-de-alunos/rotina-read.js`.
 *
 * DUAS HONESTIDADES que o módulo mantém, porque um painel que mente é pior que
 * painel nenhum:
 *
 *  1. **Dia sem histórico não é dia com 0%.** Antes do primeiro registro do
 *     aluno não há como saber se ele tinha rotina — esses dias saem como
 *     `semDado`, e não como falha. Do contrário, todo aluno novo apareceria
 *     vermelho por três meses.
 *  2. **Só conta o que está prescrito hoje.** Um id concluído que não existe mais
 *     em `blocos` (o aluno apagou o bloco) não entra na conta, e um bloco que não
 *     cai naquele dia da semana também não. A contrapartida é que mudar os dias de
 *     um bloco reescreve o passado dele — o documento não guarda versões, e
 *     inventar uma seria pior que assumir a atual.
 */

/** Ids dos dois hábitos obrigatórios, como `app-mobile/src/core/habitos.ts` os cria. */
export const ID_AGUA = 'gpl-hidratacao';
export const ID_CREATINA = 'gpl-creatina';
export const IDS_OBRIGATORIOS = [ID_AGUA, ID_CREATINA];

/** Sigla do dia da semana indexada por `Date#getDay()` — a mesma do app e do Portal. */
export const SIGLA_POR_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/** Ordem de leitura da semana: como o coach lê um calendário. */
export const ORDEM_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

export const SIGLA_CURTA = {
  seg: 'S', ter: 'T', qua: 'Q', qui: 'Q', sex: 'S', sab: 'S', dom: 'D',
};

/**
 * 'YYYY-MM-DD' no fuso local — a mesma chave que o app grava.
 *
 * Nunca `toISOString()`: às 21h de Brasília o UTC já é o dia seguinte, e a
 * conclusão de terça cairia na quarta.
 * @param {Date} [d]
 */
export function isoDia(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @param {Date} d @param {number} n */
function somarDias(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Normaliza o documento vindo do Firestore — ele pode ser editado à mão, e nada
 * na forma dele é garantido.
 * @param {any} dados
 * @returns {{ blocos: any[], concluidos: Record<string, string[]> }}
 */
export function normalizarRotina(dados) {
  const d = dados || {};
  const blocos = (Array.isArray(d.blocos) ? d.blocos : [])
    .filter((b) => b && typeof b.id === 'string')
    .map((b) => ({
      id: b.id,
      nome: typeof b.nome === 'string' && b.nome.trim() ? b.nome.trim() : b.id,
      horario: typeof b.horario === 'string' ? b.horario : '',
      dias: (Array.isArray(b.dias) ? b.dias : []).filter((x) => SIGLA_POR_DIA.includes(x)),
      categoria: typeof b.categoria === 'string' ? b.categoria : '',
      detalhe: typeof b.detalhe === 'string' ? b.detalhe : '',
    }));

  /** @type {Record<string, string[]>} */
  const concluidos = {};
  const bruto = d.concluidos && typeof d.concluidos === 'object' ? d.concluidos : {};
  for (const [iso, ids] of Object.entries(bruto)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Array.isArray(ids)) continue;
    const limpos = ids.filter((x) => typeof x === 'string');
    if (limpos.length) concluidos[iso] = limpos;
  }
  return { blocos, concluidos };
}

/** Os blocos previstos num dia da semana. @param {any[]} blocos @param {string} sigla */
export function blocosDoDia(blocos, sigla) {
  return (blocos || []).filter((b) => Array.isArray(b.dias) && b.dias.includes(sigla));
}

/**
 * Faixa de intensidade do heatmap. `null` quando não há o que pintar.
 * @param {number|null} pct
 * @returns {0|1|2|3|4|null}
 */
export function nivelDeAdesao(pct) {
  if (pct == null) return null;
  if (pct >= 100) return 4;
  if (pct >= 80) return 3;
  if (pct >= 50) return 2;
  if (pct > 0) return 1;
  return 0;
}

/**
 * O primeiro dia com registro — de onde o histórico do aluno começa a valer.
 * @param {{concluidos: Record<string, string[]>}} rotina
 * @returns {string|null}
 */
export function desdeQuando(rotina) {
  const dias = Object.keys(rotina.concluidos || {}).sort();
  return dias.length ? dias[0] : null;
}

/**
 * @typedef {object} DiaAdesao
 * @property {string} iso
 * @property {string} sigla
 * @property {number} previstos
 * @property {number} feitos
 * @property {number|null} pct
 * @property {0|1|2|3|4|null} nivel
 * @property {boolean} semDado  antes do primeiro registro, ou dia sem bloco previsto
 * @property {boolean} hoje     o dia ainda está em curso
 */

/**
 * A adesão de um dia.
 * @param {{blocos:any[], concluidos:Record<string,string[]>}} rotina
 * @param {Date} dia
 * @param {{ desde?: string|null, hoje?: string }} [ctx]
 * @returns {DiaAdesao}
 */
export function adesaoDoDia(rotina, dia, ctx = {}) {
  const iso = isoDia(dia);
  const sigla = SIGLA_POR_DIA[dia.getDay()];
  const desde = ctx.desde === undefined ? desdeQuando(rotina) : ctx.desde;
  const hojeIso = ctx.hoje || isoDia();

  const previstosBlocos = blocosDoDia(rotina.blocos, sigla);
  const ids = new Set(previstosBlocos.map((b) => b.id));
  const marcados = rotina.concluidos[iso] || [];
  const feitos = marcados.filter((id) => ids.has(id)).length;

  // Sem rotina prescrita para o dia, ou antes de o aluno ter qualquer registro,
  // não há adesão para medir — e chamar isso de 0% seria inventar uma falha.
  const semDado = previstosBlocos.length === 0 || !desde || iso < desde;
  const pct = semDado ? null : Math.round((feitos / previstosBlocos.length) * 100);

  return {
    iso,
    sigla,
    previstos: previstosBlocos.length,
    feitos,
    pct,
    nivel: nivelDeAdesao(pct),
    semDado,
    hoje: iso === hojeIso,
  };
}

/**
 * Os últimos `dias` dias, do mais antigo para o mais novo.
 *
 * Alinhado à segunda-feira: o heatmap é desenhado em colunas de semana, e uma
 * coluna que começa numa quarta faz o olho comparar dias diferentes.
 *
 * @param {{blocos:any[], concluidos:Record<string,string[]>}} rotina
 * @param {{ dias?: number, hoje?: Date }} [opcoes]
 * @returns {{ dias: DiaAdesao[], semanas: DiaAdesao[][] }}
 */
export function mapaDeAdesao(rotina, { dias = 56, hoje = new Date() } = {}) {
  const desde = desdeQuando(rotina);
  const hojeIso = isoDia(hoje);

  // Recua até a segunda-feira da semana mais antiga da janela.
  const primeiro = somarDias(hoje, -(dias - 1));
  const recuo = (primeiro.getDay() + 6) % 7; // 0 = segunda
  const inicio = somarDias(primeiro, -recuo);

  /** @type {DiaAdesao[]} */
  const lista = [];
  for (let d = inicio; isoDia(d) <= hojeIso; d = somarDias(d, 1)) {
    lista.push(adesaoDoDia(rotina, d, { desde, hoje: hojeIso }));
  }

  /** @type {DiaAdesao[][]} */
  const semanas = [];
  for (let i = 0; i < lista.length; i += 7) semanas.push(lista.slice(i, i + 7));
  return { dias: lista, semanas };
}

/**
 * Agregado de uma janela de dias: quantos blocos eram previstos, quantos saíram.
 * @param {{blocos:any[], concluidos:Record<string,string[]>}} rotina
 * @param {number} dias
 * @param {Date} hoje
 */
function janela(rotina, dias, hoje) {
  const desde = desdeQuando(rotina);
  const hojeIso = isoDia(hoje);
  let previstos = 0;
  let feitos = 0;
  let comDado = 0;
  for (let i = 0; i < dias; i++) {
    const dia = adesaoDoDia(rotina, somarDias(hoje, -i), { desde, hoje: hojeIso });
    if (dia.semDado) continue;
    comDado++;
    previstos += dia.previstos;
    feitos += dia.feitos;
  }
  return {
    previstos,
    feitos,
    comDado,
    pct: previstos ? Math.round((feitos / previstos) * 100) : null,
  };
}

/**
 * Quantos dias seguidos o aluno fechou 100%.
 *
 * O dia de hoje só entra se já estiver completo: às 09h da manhã ninguém cumpriu
 * a rotina inteira ainda, e zerar a sequência por isso seria punir o relógio.
 * @param {{blocos:any[], concluidos:Record<string,string[]>}} rotina
 * @param {Date} hoje
 */
export function sequenciaAtual(rotina, hoje = new Date()) {
  const desde = desdeQuando(rotina);
  const hojeIso = isoDia(hoje);
  const deHoje = adesaoDoDia(rotina, hoje, { desde, hoje: hojeIso });

  let n = 0;
  let i = deHoje.pct === 100 ? 0 : 1;
  for (; i < 120; i++) {
    const dia = adesaoDoDia(rotina, somarDias(hoje, -i), { desde, hoje: hojeIso });
    if (dia.semDado) break;      // fora do histórico: a sequência não continua nem quebra
    if (dia.pct !== 100) break;
    n++;
  }
  return n;
}

/**
 * Adesão bloco a bloco numa janela, do pior para o melhor.
 *
 * É o que responde "está cumprindo o quê?" depois de o heatmap responder "está
 * cumprindo?". Os dois hábitos obrigatórios vêm marcados para o painel poder
 * destacá-los — são os que o coach prescreveu pela avaliação física.
 *
 * @param {{blocos:any[], concluidos:Record<string,string[]>}} rotina
 * @param {{ dias?: number, hoje?: Date }} [opcoes]
 */
export function adesaoPorBloco(rotina, { dias = 7, hoje = new Date() } = {}) {
  const desde = desdeQuando(rotina);
  const hojeIso = isoDia(hoje);

  return rotina.blocos
    .map((bloco) => {
      let previstos = 0;
      let feitos = 0;
      for (let i = 0; i < dias; i++) {
        const dia = somarDias(hoje, -i);
        const iso = isoDia(dia);
        if (!desde || iso < desde) continue;
        if (!bloco.dias.includes(SIGLA_POR_DIA[dia.getDay()])) continue;
        previstos++;
        if ((rotina.concluidos[iso] || []).includes(bloco.id)) feitos++;
      }
      return {
        id: bloco.id,
        nome: bloco.nome,
        obrigatorio: IDS_OBRIGATORIOS.includes(bloco.id),
        detalhe: bloco.detalhe,
        previstos,
        feitos,
        pct: previstos ? Math.round((feitos / previstos) * 100) : null,
      };
    })
    .filter((b) => b.previstos > 0)
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Tudo o que o card de adesão precisa, numa chamada.
 * @param {any} dados o documento `rotinas/{email}` cru
 * @param {{ hoje?: Date, janelaMapa?: number }} [opcoes]
 */
export function resumoDeAdesao(dados, { hoje = new Date(), janelaMapa = 56 } = {}) {
  const rotina = normalizarRotina(dados);
  const desde = desdeQuando(rotina);

  return {
    /** false quando o aluno nunca publicou rotina — o painel pede o app, não acusa falta. */
    temRotina: rotina.blocos.length > 0,
    /** false quando há rotina mas nenhum dia registrado ainda. */
    temHistorico: !!desde,
    desde,
    blocos: rotina.blocos.length,
    obrigatorios: rotina.blocos.filter((b) => IDS_OBRIGATORIOS.includes(b.id)).map((b) => b.id),
    semana: janela(rotina, 7, hoje),
    mes: janela(rotina, 30, hoje),
    sequencia: sequenciaAtual(rotina, hoje),
    porBloco: adesaoPorBloco(rotina, { dias: 7, hoje }),
    mapa: mapaDeAdesao(rotina, { dias: janelaMapa, hoje }),
  };
}
