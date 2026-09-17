// @ts-check
/**
 * A MATRIZ DE INDIVIDUALIZAÇÃO — a ficha que o Motor lê antes de adaptar o dia.
 *
 * O treino é coletivo e é um só. `perfil-treino.js` já o adapta por aluno usando
 * objetivo, foco e restrição de exercício. O que faltava é o resto do que decide
 * a prescrição de verdade: a carga de referência, a zona de esforço, o que o
 * corpo dele não aceita e quanto ele já fez na semana. É isso que mora aqui.
 *
 * ── Por que nem tudo entrou neste objeto ─────────────────────────────────────
 * Nível, objetivo, foco e frequência JÁ SÃO campos do topo da ficha, e já são
 * lidos por `niveis.js`, por `perfil-treino.js` e pelo Portal. Copiá-los para
 * dentro da matriz criaria a segunda lista paralela do projeto — o coach
 * corrigiria o nível num lugar e o treino continuaria saindo pelo outro. Então
 * `matrizDe()` LÊ os dois níveis de campo e devolve uma coisa só, e quem grava
 * escreve cada valor no lugar de onde ele veio. A matriz guarda só o que é novo.
 *
 * ── Objetivo x fase ──────────────────────────────────────────────────────────
 * `aluno.objetivo` é o que o aluno quer ('Emagrecimento'), e não muda de mês em
 * mês. `matriz.perfil.fase` é o bloco em que ele está agora ('força'), e muda.
 * São coisas diferentes: alguém que treina para emagrecer pode passar seis
 * semanas num bloco de força. Guardar um só apagaria uma das duas verdades.
 *
 * Módulo puro: sem DOM, sem store, sem Firebase — como todo o resto de
 * `compartilhado/regras/`.
 *
 * @typedef {'iniciante'|'intermediario'|'avancado'} Nivel
 * @typedef {'forca'|'hipertrofia'|'condicionamento'|'resistencia'|'manutencao'} Fase
 * @typedef {'livre'|'reduzir'|'converter_airbike'} RegraImpacto
 * @typedef {'barra'|'barra_assistida'|'puxada_alta'} RegraTracao
 *
 * @typedef {Object} Referencia1RM
 * @property {number|null} kg         o peso levantado no teste
 * @property {number|null} reps       em quantas repetições
 * @property {number|null} rm         a máxima MEDIDA de verdade, quando existe
 * @property {number|null} rmEfetivo  o 1RM que vale: a medida, ou a estimativa.
 *           Derivado — nunca é gravado, para não congelar. É o que o Motor lê.
 * @property {string} medidoEm        'YYYY-MM-DD' — carga velha não é carga
 *
 * @typedef {Object} Lesao
 * @property {string} regiao       chave de `REGIOES_LESAO`
 * @property {'leve'|'moderada'|'severa'} gravidade
 * @property {string} desde        'YYYY-MM-DD' ou ''
 * @property {string} obs
 *
 * @typedef {Object} Matriz
 * @property {number} versao
 * @property {{nivel: Nivel|'', objetivo: string, fase: Fase|'', focoPrimario: string, focoSecundario: string, freqVezes: string}} perfil
 * @property {{referencia: Record<string, Referencia1RM>, rir: string, airbike: {rpm: number|null, calPorMin: number|null, obs: string}}} cargas
 * @property {{lesoes: Lesao[], impacto: RegraImpacto, tracao: RegraTracao, mobilidade: string[], obs: string}} adaptacoes
 * @property {{semanaId: string, correcoes: Record<string, number>, atualizadoEm: number}} historico
 * @property {number} atualizadoEm
 */
import { GRUPOS, GRUPO_LABEL } from './grupos.js';
import { NIVEIS, NIVEL_LABEL } from './niveis.js';
import { dataIso, segundaDaSemana } from './semana.js';

/** A chave do campo novo no documento do aluno. */
export const CAMPO = 'matrizIndividualizacao';

/** Versão do formato. Só muda quando um campo mudar de significado. */
export const VERSAO = 1;

/** Níveis, no formato `[valor, rótulo]` que a UI consome — vindos de `niveis.js`. */
export const OPCOES_NIVEL = NIVEIS.map((n) => [n, NIVEL_LABEL[n]]);

/** O bloco em que o aluno está agora. Ver "Objetivo x fase" no topo. */
export const FASES = [
  ['forca', 'Força'],
  ['hipertrofia', 'Hipertrofia'],
  ['condicionamento', 'Condicionamento'],
  ['resistencia', 'Resistência muscular'],
  ['manutencao', 'Manutenção'],
];

/**
 * Os três levantamentos de referência. Três e não trinta: é o que o coach mede
 * de verdade no box, e uma lista maior viraria campo vazio para sempre.
 */
export const LEVANTAMENTOS = [
  ['agachamento', 'Agachamento'],
  ['supino', 'Supino'],
  ['terra', 'Levantamento terra'],
];

/**
 * Zona de RIR habitual — quantas repetições ele costuma deixar na reserva.
 * É o eixo de INTENSIDADE que falta ao objetivo: dois alunos de hipertrofia com
 * a mesma carga treinam diferente se um para a 3 da falha e o outro a 1.
 */
export const ZONAS_RIR = [
  ['0-1', '0–1 · perto da falha'],
  ['1-2', '1–2 · pesado'],
  ['2-3', '2–3 · padrão'],
  ['3-4', '3–4 · com folga'],
];

export const REGIOES_LESAO = [
  ['ombro', 'Ombro'],
  ['lombar', 'Lombar'],
  ['joelho', 'Joelho'],
  ['cervical', 'Cervical'],
  ['quadril', 'Quadril'],
  ['cotovelo', 'Cotovelo'],
  ['punho', 'Punho'],
  ['tornozelo', 'Tornozelo'],
];

export const GRAVIDADES = [
  ['leve', 'Leve'],
  ['moderada', 'Moderada'],
  ['severa', 'Severa'],
];

/**
 * Regra de impacto: o que fazer quando o dia tem salto, corrida ou burpee.
 * `converter_airbike` é a conversão que o box já usa na prática — o aluno que
 * não pode saltar senta na Airbike pelo mesmo tempo.
 */
export const REGRAS_IMPACTO = [
  ['livre', 'Faz impacto normalmente'],
  ['reduzir', 'Reduzir impacto (sem salto; corrida leve)'],
  ['converter_airbike', 'Converter impacto para Airbike'],
];

/** Regra de tração: barra suspensa, barra assistida ou adaptação para puxada alta. */
export const REGRAS_TRACAO = [
  ['barra', 'Faz barra suspensa'],
  ['barra_assistida', 'Barra assistida (elástico)'],
  ['puxada_alta', 'Adaptar para puxada alta'],
];

/** Restrições de mobilidade, pelo que elas impedem — não pelo nome do teste. */
export const RESTRICOES_MOBILIDADE = [
  ['ombro_overhead', 'Ombro · overhead'],
  ['toracica', 'Torácica · rotação'],
  ['quadril', 'Quadril · profundidade'],
  ['tornozelo', 'Tornozelo · agachamento profundo'],
  ['punho', 'Punho · front squat / apoio'],
];

/* ---------- Conversões de carga ---------- */

/** Número finito e positivo, ou `null`. Campo de formulário chega como texto. */
function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 1RM estimado pela fórmula de Epley: kg × (1 + reps/30).
 *
 * Epley e não Brzycki porque o teste do box é submáximo de 3 a 8 repetições, e é
 * nessa faixa que as duas praticamente coincidem — com a vantagem de Epley não
 * despencar quando alguém digita 15 repetições. Acima de 12 a estimativa deixa
 * de valer para qualquer fórmula; quem chama decide se mostra o aviso.
 *
 * @param {any} kg @param {any} reps
 * @returns {number|null} arredondado a 0,5 kg
 */
export function e1rm(kg, reps) {
  const p = num(kg);
  const r = num(reps);
  if (!p || !r) return null;
  if (r === 1) return Math.round(p * 2) / 2;
  return Math.round(p * (1 + r / 30) * 2) / 2;
}

/**
 * A carga de trabalho para um percentual do 1RM, já arredondada ao que dá para
 * montar na barra (múltiplo de 2,5 kg — é o par de anilhas mais leve do box).
 * @param {any} rm @param {any} pct
 * @returns {number|null}
 */
export function cargaDe1RM(rm, pct) {
  const m = num(rm);
  const p = num(pct);
  if (!m || !p) return null;
  return Math.round((m * p) / 100 / 2.5) * 2.5;
}

/* ---------- Leitura ---------- */

/** Só os valores que a lista conhece; o resto vira o padrão. */
function daLista(lista, valor, padrao = '') {
  return lista.some(([v]) => v === valor) ? valor : padrao;
}

/** `{peito: 0, costas: 0, …}` — os sete grupos, sempre todos. */
export function zerarGrupos() {
  /** @type {Record<string, number>} */
  const o = {};
  for (const g of GRUPOS) o[g] = 0;
  return o;
}

/** A semana corrente, identificada pela segunda-feira dela ('YYYY-MM-DD'). */
export function semanaId(d = new Date()) {
  return dataIso(segundaDaSemana(d));
}

/** @param {any} l @returns {Lesao|null} */
function lesaoDe(l) {
  const regiao = daLista(REGIOES_LESAO, l?.regiao);
  if (!regiao) return null;
  return {
    regiao,
    gravidade: /** @type {any} */ (daLista(GRAVIDADES, l?.gravidade, 'leve')),
    desde: String(l?.desde || ''),
    obs: String(l?.obs || '').trim(),
  };
}

/**
 * A matriz COMPLETA de um aluno — o que o Motor recebe.
 *
 * Nunca devolve `undefined` em campo nenhum: ficha antiga (que é a maioria hoje)
 * sai daqui com a matriz inteira em branco, e branco quer dizer "sem adaptação",
 * nunca erro. O Motor não pode ter que perguntar se o campo existe antes de ler.
 *
 * @param {any} aluno a ficha da Gestão
 * @returns {Matriz}
 */
export function matrizDe(aluno) {
  const m = (aluno && aluno[CAMPO]) || {};
  const foco = Array.isArray(aluno?.foco) ? aluno.foco.filter((g) => GRUPOS.includes(g)) : [];
  /** @type {Record<string, Referencia1RM>} */
  const referencia = {};
  for (const [id] of LEVANTAMENTOS) {
    const r = (m.cargas && m.cargas.referencia && m.cargas.referencia[id]) || {};
    const kg = num(r.kg);
    const reps = num(r.reps);
    const rm = num(r.rm);
    referencia[id] = {
      kg,
      reps,
      rm,
      // A máxima medida ganha da estimada: se o coach testou de verdade, ela vale
      // mais que a conta em cima de uma série submáxima. As duas ficam em campos
      // diferentes porque a estimativa TEM de continuar seguindo peso e reps — se
      // ela virasse o valor do campo de máxima, mudar as reps depois não mudaria
      // mais nada, e o 1RM ficaria parado no primeiro teste para sempre.
      rmEfetivo: rm ?? e1rm(kg, reps),
      medidoEm: String(r.medidoEm || ''),
    };
  }
  const hist = m.historico || {};
  // Esparso de propósito: só entra o grupo que o coach corrigiu. Um mapa com os
  // sete zerados diria "ele não fez nada" sobre grupo nenhum — e zero é uma
  // correção legítima ("não fez perna"), que precisa ser distinguível de ausência.
  /** @type {Record<string, number>} */
  const correcoes = {};
  for (const [g, v] of Object.entries(hist.correcoes || {})) {
    const n = Number(v);
    if (GRUPOS.includes(g) && Number.isFinite(n) && n >= 0) correcoes[g] = Math.round(n);
  }
  return {
    versao: Number(m.versao) || VERSAO,
    perfil: {
      // Os quatro vêm do topo da ficha, que é onde o resto do sistema já os lê.
      nivel: /** @type {any} */ (daLista(OPCOES_NIVEL, aluno?.nivel)),
      objetivo: String(aluno?.objetivo || ''),
      fase: /** @type {any} */ (daLista(FASES, m.perfil?.fase)),
      focoPrimario: foco[0] || '',
      focoSecundario: foco[1] || '',
      freqVezes: String(aluno?.freqVezes || ''),
    },
    cargas: {
      referencia,
      rir: daLista(ZONAS_RIR, m.cargas?.rir),
      airbike: {
        rpm: num(m.cargas?.airbike?.rpm),
        calPorMin: num(m.cargas?.airbike?.calPorMin),
        obs: String(m.cargas?.airbike?.obs || '').trim(),
      },
    },
    adaptacoes: {
      lesoes: /** @type {Lesao[]} */ (
        (Array.isArray(m.adaptacoes?.lesoes) ? m.adaptacoes.lesoes : []).map(lesaoDe).filter(Boolean)
      ),
      impacto: /** @type {any} */ (daLista(REGRAS_IMPACTO, m.adaptacoes?.impacto, 'livre')),
      tracao: /** @type {any} */ (daLista(REGRAS_TRACAO, m.adaptacoes?.tracao, 'barra')),
      mobilidade: (Array.isArray(m.adaptacoes?.mobilidade) ? m.adaptacoes.mobilidade : [])
        .filter((k) => RESTRICOES_MOBILIDADE.some(([v]) => v === k)),
      obs: String(m.adaptacoes?.obs || '').trim(),
    },
    historico: {
      semanaId: String(hist.semanaId || ''),
      correcoes,
      atualizadoEm: Number(hist.atualizadoEm) || 0,
    },
    atualizadoEm: Number(m.atualizadoEm) || 0,
  };
}

/**
 * As correções de volume que valem para a SEMANA CORRENTE.
 *
 * Correção de semana passada não é status atual — é lixo que faria o Motor achar
 * que o aluno já fez 14 séries de perna numa segunda-feira de manhã. Quando o
 * `semanaId` gravado não é o de hoje, as correções deixam de valer, e `vencido`
 * diz que isso aconteceu — para a tela poder explicar o campo vazio em vez de só
 * mostrá-lo.
 *
 * @param {Matriz|any} matriz  o retorno de `matrizDe`
 * @param {Date} [agora]
 * @returns {{semanaId: string, correcoes: Record<string, number>, atualizadoEm: number, vencido: boolean}}
 */
export function historicoDaSemana(matriz, agora = new Date()) {
  const hoje = semanaId(agora);
  const h = matriz?.historico || {};
  const vencido = !!h.semanaId && h.semanaId !== hoje;
  if (h.semanaId === hoje) {
    return { semanaId: h.semanaId, correcoes: { ...h.correcoes }, atualizadoEm: Number(h.atualizadoEm) || 0, vencido: false };
  }
  return { semanaId: hoje, correcoes: {}, atualizadoEm: 0, vencido };
}

/**
 * O VOLUME DA SEMANA que o Motor deve usar: o que o sistema contou, corrigido
 * onde o coach disse que a conta estava errada.
 *
 * Quem manda é o número DERIVADO. Ele sai dos treinos que realmente aconteceram
 * (`volumeDaSemanaDoAluno` no montador, `volumeDaSemana` no Portal) e é a mesma
 * conta que `versaoDoAluno` já consumia antes desta ficha existir. Guardar uma
 * segunda contagem digitada ao lado dele criaria dois números para o mesmo fato,
 * e o Motor teria de escolher em silêncio.
 *
 * A correção do coach entra por cima, grupo a grupo, porque existe o que a conta
 * não enxerga: o aluno que treinou peito em casa, o que parou no meio da aula, o
 * que fez a mais no sábado. Grupo sem correção continua com o número derivado —
 * e zero digitado é uma correção de verdade ("não fez perna"), não ausência.
 *
 * @param {Matriz|any} matriz            a ficha do aluno (`matrizDe`), ou nada
 * @param {Record<string, number>} derivado  o que o sistema contou
 * @param {Date} [agora]
 * @returns {Record<string, number>} os sete grupos, sempre todos
 */
export function volumePorGrupo(matriz, derivado = {}, agora = new Date()) {
  const { correcoes } = historicoDaSemana(matriz, agora);
  const out = zerarGrupos();
  for (const g of GRUPOS) {
    const corrigido = correcoes[g];
    out[g] = Number.isFinite(corrigido) ? corrigido : (Number(derivado?.[g]) || 0);
  }
  return out;
}

/* ---------- Escrita ---------- */

/**
 * Separa uma matriz editada nos dois lugares onde ela mora.
 *
 * `topo` são os campos que já existiam na ficha e que o resto do sistema lê —
 * eles voltam para o topo do documento, e não para dentro da matriz. `matriz` é
 * só o que é novo. Quem chama passa os dois juntos para `db.atualizar`.
 *
 * O foco sai daqui como ARRAY ORDENADO (`[primário, secundário]`), que é o
 * formato que `focoDe()` já espera — a ordem é a informação nova, porque "foco
 * primário" é o que o coach quer ver acontecer primeiro no dia.
 *
 * @param {Matriz|any} entrada
 * @returns {{topo: any, matriz: any}}
 */
export function separarParaGravar(entrada) {
  // `matrizDe` sabe ler os dois níveis de campo; para reaproveitar a limpeza
  // inteira, monta-se uma ficha de mentira com cada valor no lugar certo.
  const m = matrizDe({
    nivel: entrada?.perfil?.nivel,
    objetivo: entrada?.perfil?.objetivo,
    freqVezes: entrada?.perfil?.freqVezes,
    foco: [entrada?.perfil?.focoPrimario, entrada?.perfil?.focoSecundario].filter(Boolean),
    [CAMPO]: entrada,
  });
  const foco = [m.perfil.focoPrimario, m.perfil.focoSecundario]
    .filter(Boolean)
    // O mesmo grupo nos dois selects é erro de clique, não "foco dobrado".
    .filter((g, i, arr) => arr.indexOf(g) === i);
  // `rmEfetivo` fica de fora do que se grava: valor derivado dentro do documento
  // é valor que envelhece sozinho. Quem lê chama `matrizDe` e recebe a conta
  // refeita com o peso e as repetições que estão lá agora.
  /** @type {any} */
  const referencia = {};
  for (const [id] of LEVANTAMENTOS) {
    const { kg, reps, rm, medidoEm } = m.cargas.referencia[id];
    referencia[id] = { kg, reps, rm, medidoEm };
  }
  return {
    topo: {
      nivel: m.perfil.nivel,
      objetivo: m.perfil.objetivo,
      freqVezes: m.perfil.freqVezes,
      foco,
    },
    matriz: {
      versao: VERSAO,
      perfil: { fase: m.perfil.fase },
      cargas: { referencia, rir: m.cargas.rir, airbike: m.cargas.airbike },
      adaptacoes: m.adaptacoes,
      historico: m.historico,
      atualizadoEm: Date.now(),
    },
  };
}

/* ---------- Rótulos, para a UI e para o resumo ---------- */

/** O rótulo de um valor numa das listas deste módulo. */
export function rotulo(lista, valor) {
  return (lista.find(([v]) => v === valor) || [])[1] || '';
}

/**
 * Um resumo em uma linha do que o Motor vai fazer diferente com este aluno.
 * Vazio quer dizer "nada de especial" — e é assim que a maioria das fichas está.
 * @param {Matriz|any} m
 */
export function resumoDeAdaptacoes(m) {
  const partes = [];
  const a = m?.adaptacoes || {};
  if (a.impacto && a.impacto !== 'livre') partes.push(rotulo(REGRAS_IMPACTO, a.impacto));
  if (a.tracao && a.tracao !== 'barra') partes.push(rotulo(REGRAS_TRACAO, a.tracao));
  if (a.lesoes?.length) partes.push(a.lesoes.map((l) => rotulo(REGIOES_LESAO, l.regiao)).join(', '));
  if (a.mobilidade?.length) partes.push(`mobilidade: ${a.mobilidade.map((k) => rotulo(RESTRICOES_MOBILIDADE, k)).join(', ')}`);
  return partes.join(' · ');
}

/** Os sete grupos com rótulo, para a tabela do histórico. */
export const GRUPOS_COM_ROTULO = GRUPOS.map((g) => [g, GRUPO_LABEL[g]]);
