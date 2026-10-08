// @ts-check
/**
 * Anamnese e PAR-Q: os campos, os nomes de cada um e a triagem.
 *
 * Puro (sem DOM, sem banco) e fonte única: o formulário das abas, a ficha em
 * PDF e a linha da aba Registros leem daqui. Antes, a lista de perguntas do
 * PAR-Q morava duas vezes (app.js e pdf.js) — uma pergunta reescrita num lugar
 * e não no outro faria o PDF mostrar uma triagem que o coach nunca aplicou.
 *
 * `rotulo` é o do formulário; `curto` é o que aparece no PDF e no log
 * ("Anamnese editada · Sono (h/noite), Medicamentos").
 */

/**
 * @typedef {{ k: string, rotulo: string, curto: string,
 *   tipo: 'texto'|'numero'|'select'|'area', opcoes?: string[] }} CampoAnamnese
 */

/** @type {[string, CampoAnamnese[]][]} as seções do formulário, na ordem da tela */
export const ANAMNESE_SECOES = [
  ['Treino & rotina', [
    { k: 'experiencia', rotulo: 'Experiência com treino', curto: 'Experiência', tipo: 'select', opcoes: ['Iniciante', 'Intermediário', 'Avançado', 'Retornando'] },
    { k: 'historicoTreino', rotulo: 'Histórico de treino (tempo, modalidades)', curto: 'Histórico de treino', tipo: 'texto' },
    { k: 'rotina', rotulo: 'Profissão / rotina de trabalho', curto: 'Profissão / rotina', tipo: 'texto' },
    { k: 'sono', rotulo: 'Horas de sono / noite', curto: 'Sono (h/noite)', tipo: 'numero' },
    { k: 'estresse', rotulo: 'Nível de estresse', curto: 'Estresse', tipo: 'select', opcoes: ['Baixo', 'Moderado', 'Alto'] },
  ]],
  ['Hábitos', [
    { k: 'refeicoes', rotulo: 'Refeições por dia', curto: 'Refeições/dia', tipo: 'numero' },
    { k: 'hidratacao', rotulo: 'Hidratação (L/dia)', curto: 'Hidratação (L/dia)', tipo: 'numero' },
    { k: 'tabagismo', rotulo: 'Tabagismo', curto: 'Tabagismo', tipo: 'select', opcoes: ['Não', 'Sim', 'Ex-fumante'] },
    { k: 'alcool', rotulo: 'Álcool', curto: 'Álcool', tipo: 'select', opcoes: ['Não', 'Socialmente', 'Frequente'] },
  ]],
  ['Saúde', [
    { k: 'doencas', rotulo: 'Doenças / condições / cirurgias prévias', curto: 'Doenças / cirurgias', tipo: 'area' },
    { k: 'medicamentos', rotulo: 'Medicamentos em uso', curto: 'Medicamentos', tipo: 'area' },
    { k: 'histFamiliar', rotulo: 'Histórico familiar (cardíaco, diabetes, hipertensão…)', curto: 'Histórico familiar', tipo: 'area' },
    { k: 'doresLesoes', rotulo: 'Dores ou lesões atuais', curto: 'Dores / lesões atuais', tipo: 'area' },
  ]],
  ['Objetivo', [
    { k: 'objetivoDetalhe', rotulo: 'Objetivo detalhado / expectativas', curto: 'Objetivo detalhado', tipo: 'area' },
  ]],
];

/** Todos os campos da anamnese, na ordem da tela. */
export const ANAMNESE_CAMPOS = ANAMNESE_SECOES.flatMap(([, campos]) => campos);

/** [chave, nome curto] — o formato que o PDF usa. */
export const ANAMNESE_LABELS = ANAMNESE_CAMPOS.map((c) => [c.k, c.curto]);

/** As 7 perguntas do PAR-Q, na ordem: a resposta i mora em `respostas['q' + i]`. */
export const PARQ_PERGUNTAS = [
  'Algum médico já disse que você possui um problema cardíaco e que só deveria praticar atividade física sob supervisão médica?',
  'Você sente dor no peito quando pratica atividade física?',
  'No último mês, você sentiu dor no peito sem estar praticando atividade física?',
  'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
  'Você tem algum problema ósseo ou articular que poderia piorar com a mudança na atividade física?',
  'Você toma atualmente algum medicamento para pressão arterial ou problema cardíaco?',
  'Você sabe de alguma outra razão pela qual não deveria praticar atividade física?',
];

/**
 * O resultado da triagem a partir das respostas marcadas.
 *  - 'vazio': nada respondido ainda;
 *  - 'alerta': algum "Sim" (já basta um, mesmo com a triagem incompleta);
 *  - 'ok': as 7 respondidas, todas "Não";
 *  - 'incompleto': falta responder alguma, nenhum "Sim" até aqui.
 * @param {Record<string, string>} [respostas] @returns {'vazio'|'alerta'|'ok'|'incompleto'}
 */
export function triagemParq(respostas = {}) {
  let faltam = 0, algumSim = false;
  for (let i = 0; i < PARQ_PERGUNTAS.length; i++) {
    const v = respostas['q' + i];
    if (!v) faltam++; else if (v === 'sim') algumSim = true;
  }
  if (faltam === PARQ_PERGUNTAS.length) return 'vazio';
  if (algumSim) return 'alerta';
  return faltam === 0 ? 'ok' : 'incompleto';
}

/**
 * O PAR-Q como um objeto raso — `{ q0, …, q6, data, obs }` — para comparar
 * campo a campo. Comparar o objeto aninhado inteiro dependeria da ordem das
 * chaves, e a nuvem devolve os mapas em outra ordem.
 * @param {any} p
 */
export function parqRaso(p) {
  // Sempre as nove chaves ('' quando não há): a comparação percorre as chaves
  // do "depois", e uma resposta que sumisse passaria em branco.
  const resp = (p && p.respostas) || {};
  /** @type {Record<string, string>} */ const o = {};
  for (let i = 0; i < PARQ_PERGUNTAS.length; i++) o['q' + i] = resp['q' + i] || '';
  o.data = (p && p.data) || '';
  o.obs = (p && p.obs) || '';
  return o;
}

/** @type {Record<string, string>} */
const CURTO_ANAMNESE = Object.fromEntries(ANAMNESE_LABELS);
/** @type {Record<string, string>} */
const CURTO_PARQ = {
  ...Object.fromEntries(PARQ_PERGUNTAS.map((_, i) => ['q' + i, `Pergunta ${i + 1}`])),
  data: 'Data da triagem', obs: 'Observações',
};
const ORDEM_ANAMNESE = Object.keys(CURTO_ANAMNESE);
const ORDEM_PARQ = Object.keys(CURTO_PARQ);

/** Os nomes na ordem da tela; chave desconhecida vai para o fim, como veio. */
const nomes = (campos, curto, ordem) => [...campos]
  .sort((x, y) => (ordem.indexOf(x) + 1 || 1e9) - (ordem.indexOf(y) + 1 || 1e9))
  .map((k) => curto[k] || k);

/** "Anamnese editada · Sono (h/noite), Medicamentos" @param {string[]} campos */
export function resumoAnamnese(campos) {
  return `Anamnese editada · ${nomes(campos, CURTO_ANAMNESE, ORDEM_ANAMNESE).join(', ')}`;
}

/** "PAR-Q editado · Pergunta 3, Data da triagem" @param {string[]} campos */
export function resumoParq(campos) {
  return `PAR-Q editado · ${nomes(campos, CURTO_PARQ, ORDEM_PARQ).join(', ')}`;
}
