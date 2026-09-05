/**
 * Pesquisa de exercício, mobilidade ou técnica — parte pura, sem rede e sem
 * Firebase, irmã de `analise.ts` (mesma separação: o pedaço testável em `npm
 * run checar` fica fora de `index.ts`, que só sabe falar com a OpenAI).
 *
 * O que este módulo resolve: o coach digita, no Treino Livre, um exercício que
 * não existe no catálogo do box. `montarSchema`/`instrucoes` preparam a chamada
 * ao Responses API; `extrairProposta` lê a resposta e devolve uma proposta no
 * VOCABULÁRIO FECHADO da Academia dele — pronta para o coach revisar e, com um
 * clique, cadastrar (Task 4). Cadastro em si e chamada de rede são as próximas
 * tasks; aqui só o schema e a leitura.
 *
 * Por que a proposta sem `padrao` resolvível é RECUSADA (lança erro) em vez de
 * aceita com o campo vazio: `converter()` em `montador/ui/catalogo.js:44`
 * devolve `null` para todo exercício sem padrão — ele desaparece do gerador, do
 * Treino Manual e da busca do Livre, EM SILÊNCIO. O coach cadastraria achando
 * que deu certo. Mesma lógica para `equipamentoIds`: só vale o que está no
 * inventário real do box (é ele que sustenta a conta de viabilidade — "cabem 8
 * alunas nessa estação?"), então id fora da lista é descartado, nunca inventado
 * nem corrigido.
 *
 * Os demais vocabulários fechados (músculo, tag, nível) já toleram ruído: um
 * valor a mais que a IA imaginou é descartado em silêncio do array, porque
 * recusar a proposta inteira por causa de UM músculo errado é pior que perder
 * aquele músculo.
 *
 * ATENÇÃO — DUPLICAÇÃO DE VERDADE, DOCUMENTADA DE PROPÓSITO:
 * `functions/` é um pacote TypeScript separado (próprio `package.json`), sem
 * acesso aos `.js` do site — o site é servido estático, as functions rodam no
 * servidor. Por isso os vocabulários abaixo são CÓPIAS, não imports, da fonte
 * real:
 *   - `PADROES`         ← `montador/config/padroes.js` (`PADROES`, 6 valores;
 *                          são as CHAVES, e é nesse formato que a Academia
 *                          grava `exercicio.padrao` — ver `academia/db.js`
 *                          `seedData()`, campo `padrao: x.padrao || ...`).
 *   - `MUSCULOS_LABEL`  ← as 11 chaves de `MUSCULOS` (mesmo arquivo), passadas
 *                          pelo mapa `MUSC_MAP` de `academia/data/seed.js`
 *                          (rótulo legível). A Academia grava o RÓTULO, não a
 *                          chave — ver `seedData()`, campo `musculos:
 *                          [...].map((m) => MUSC_MAP[m])` — e é essa forma que
 *                          `montador/ui/catalogo.js` (`MUSC_INV`) espera de
 *                          volta na hora de converter para o motor.
 *   - `TAGS`            ← `academia/db.js` (`TAGS`, 6 valores).
 *   - `NIVEIS`          ← `montador/data/exercicios.js` (typedef `Exercicio.nivel`).
 * Se uma dessas listas mudar na fonte e ninguém lembrar de mudar aqui, a
 * pesquisa passa a recusar ou descartar coisa válida — nada explode, mas o
 * vocabulário diverge em silêncio. Um jeito melhor (fora do escopo desta task):
 * gerar este arquivo por um script de build que lê os `.js` do site, em vez de
 * copiar à mão.
 */

/** `PADROES` de `montador/config/padroes.js` — chaves, não rótulos. */
const PADROES = [
  'empurrar', 'puxar', 'quadriceps', 'posterior_gluteo', 'core', 'estabilizadores',
] as const;

/**
 * Rótulos de `MUSCULOS` (`montador/config/padroes.js`) já traduzidos pelo
 * `MUSC_MAP` de `academia/data/seed.js` — é o rótulo que a Academia grava em
 * `exercicio.musculos`, não a chave interna do montador.
 */
const MUSCULOS_LABEL = [
  'Peito', 'Ombro', 'Tríceps', 'Costas', 'Bíceps', 'Quadríceps',
  'Posterior de coxa', 'Glúteo', 'Panturrilha', 'Core/Abdômen', 'Antebraço',
] as const;

/** `TAGS` de `academia/db.js`. */
const TAGS = ['MUSCULAÇÃO', 'HYROX', 'HIIT', 'CROSS', 'GAP', 'MOBILIDADE'] as const;

/** `Exercicio.nivel` de `montador/data/exercicios.js`. */
const NIVEIS = ['iniciante', 'intermediario', 'avancado'] as const;

/** Nível padrão quando a IA manda algo fora do vocabulário — mesmo fallback de `academia/db.js` (`x.nivel || 'intermediario'`). */
const NIVEL_PADRAO = 'intermediario';

/** `tempoMedioSeg` só é aceito nesta faixa; fora dela cai no padrão do contexto. */
const TEMPO_MIN = 5;
const TEMPO_MAX = 600;
/** Padrão de exercício "normal" — mesmo valor usado em boa parte de `montador/data/exercicios.js`. */
const TEMPO_PADRAO_EXERCICIO = 35;
/** Padrão de mobilidade/aquecimento — dentro da faixa de 20–60s que `instrucoes()` pede à IA. */
const TEMPO_PADRAO_MOBILIDADE = 40;

export type Equip = { id: string; nome: string };
export type Contexto = 'exercicio' | 'mobilidade' | 'tecnica';

export type PropostaExercicio = {
  tipo: 'exercicio';
  nome: string; padrao: string; musculos: string[]; tags: string[];
  equipamentoIds: string[]; nivel: string; tempoMedioSeg: number; obs: string;
  equipamentoFaltante: string[]; fontes: string[];
};
export type PropostaTecnica = {
  tipo: 'tecnica';
  nome: string; resumo: string; comoExecutar: string; objetivo: string;
  fontes: string[];
};
export type Proposta = PropostaExercicio | PropostaTecnica;

/** `contexto === 'tecnica'` pede o schema de técnica; os outros dois pedem o de exercício. */
const ehTecnica = (contexto: Contexto): boolean => contexto === 'tecnica';

/**
 * Schema JSON compatível com `strict: true` da OpenAI: todo campo em
 * `required`, `additionalProperties: false`. Nenhum campo das interfaces acima
 * é opcional (não há `?`), então não há união com `null` a fazer aqui — a regra
 * geral do projeto (ver `SCHEMA` em `analise.ts`) só se aplicaria se algum
 * campo fosse de fato dispensável, e não é o caso.
 *
 * O único campo cujo formato muda em runtime é `equipamentoIds`: o `enum` é
 * fechado no inventário RECEBIDO (nem um id a mais que o box realmente tem).
 * Inventário vazio não vira `enum: []` — um enum vazio é impossível de
 * satisfazer e travaria o schema à toa — vira array de string sem `enum`; quem
 * garante que nada inventado passa é `extrairProposta`, que descarta todo id
 * fora do inventário de qualquer forma.
 */
export function montarSchema(contexto: Contexto, equipamentos: Equip[]): object {
  const ids = equipamentos.map((e) => e.id);
  const equipamentoIdsSchema = ids.length
    ? { type: 'array', items: { type: 'string', enum: ids } }
    : { type: 'array', items: { type: 'string' } };

  if (ehTecnica(contexto)) {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['tipo', 'nome', 'resumo', 'comoExecutar', 'objetivo', 'fontes'],
      properties: {
        tipo: { type: 'string', enum: ['tecnica'] },
        nome: { type: 'string' },
        resumo: { type: 'string' },
        comoExecutar: { type: 'string' },
        objetivo: { type: 'string' },
        fontes: { type: 'array', items: { type: 'string' } },
      },
    };
  }

  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'tipo', 'nome', 'padrao', 'musculos', 'tags', 'equipamentoIds',
      'nivel', 'tempoMedioSeg', 'obs', 'equipamentoFaltante', 'fontes',
    ],
    properties: {
      tipo: { type: 'string', enum: ['exercicio'] },
      nome: { type: 'string' },
      padrao: { type: 'string', enum: [...PADROES] },
      musculos: { type: 'array', items: { type: 'string', enum: [...MUSCULOS_LABEL] } },
      tags: { type: 'array', items: { type: 'string', enum: [...TAGS] } },
      equipamentoIds: equipamentoIdsSchema,
      nivel: { type: 'string', enum: [...NIVEIS] },
      tempoMedioSeg: { type: 'number' },
      obs: { type: 'string' },
      equipamentoFaltante: { type: 'array', items: { type: 'string' } },
      fontes: { type: 'array', items: { type: 'string' } },
    },
  };
}

/**
 * Prompt de instruções, no mesmo espírito de `INSTRUCOES` em `analise.ts`: uma
 * frase de contexto do box, o vocabulário fechado por extenso (a IA só pode
 * escolher dali) e as regras que o `extrairProposta` cobra na leitura.
 */
export function instrucoes(contexto: Contexto, equipamentos: Equip[]): string {
  const listaEquip = equipamentos.length
    ? equipamentos.map((e) => e.nome).join(', ')
    : '(nenhum — este box ainda não tem equipamento cadastrado)';

  if (ehTecnica(contexto)) {
    return [
      'Você ajuda o coach do Garage Power Lab a cadastrar uma técnica de treino',
      '(recurso de intensidade, tipo Drop Set ou Bi-set) que ele digitou e não',
      'existe na Academia dele.',
      '',
      'Devolva:',
      '- "resumo": uma frase, o conceito da técnica.',
      '- "comoExecutar": passo a passo NUMERADO, um passo por linha ("1. ...",',
      '  "2. ...", etc.), terminando com uma última linha SEM número contendo o',
      '  detalhe prático de aplicar isso NUM BOX (que equipamento facilita, o que',
      '  atrapalha o rodízio da turma) — é o formato que as técnicas já',
      '  cadastradas usam, e uma técnica fora dele destoa das outras.',
      '- "objetivo": para que serve / quando aplicar, em uma frase.',
      '- "fontes": URLs (começando com http) de onde você tirou a informação;',
      '  lista vazia se não tiver fonte confiável.',
    ].join('\n');
  }

  const foco = contexto === 'mobilidade'
    ? [
      'É um exercício de MOBILIDADE ou aquecimento — inclua a tag "MOBILIDADE" em',
      '"tags" e estime "tempoMedioSeg" como aquecimento (entre 20 e 60 segundos).',
    ].join('\n')
    : 'É um exercício de treino de força/condicionamento — estime "tempoMedioSeg" da execução de UMA série.';

  return [
    'Você ajuda o coach do Garage Power Lab a cadastrar um exercício que ele',
    'digitou no Treino Livre e que não existe no catálogo do box.',
    '',
    `Padrões de movimento aceitos: ${PADROES.join(', ')}.`,
    `Músculos aceitos: ${MUSCULOS_LABEL.join(', ')}.`,
    `Tags de modalidade aceitas: ${TAGS.join(', ')}.`,
    `Níveis aceitos: ${NIVEIS.join(', ')}.`,
    `Equipamento que este box TEM: ${listaEquip}.`,
    '',
    foco,
    '',
    'Regras:',
    '- "padrao" é obrigatório e tem que ser um dos padrões aceitos acima — sem',
    '  isso o exercício não aparece no gerador de treino nem na busca do coach.',
    '- Em "equipamentoIds" marque SÓ equipamento da lista acima. O que o',
    '  exercício normalmente pede e este box NÃO tem vai em texto livre (o nome',
    '  do aparelho, não um id) em "equipamentoFaltante".',
    '- "obs" em uma ou duas frases: como executa + o detalhe prático que evita',
    '  lesão ou perda de tempo — o mesmo tom das descrições curtas do catálogo',
    '  do box (ex.: "Empurrar horizontal na barra guiada, deitado no banco reto.").',
    '- "fontes": URLs (começando com http) de onde você tirou a informação;',
    '  lista vazia se não tiver fonte confiável.',
  ].join('\n');
}

/** Junta o texto da resposta — o mesmo caminho duplo de `textoDaResposta` em `analise.ts`. */
function textoDaResposta(r: Record<string, unknown>): string {
  if (typeof r.output_text === 'string' && r.output_text.trim()) return r.output_text;

  let texto = '';
  if (Array.isArray(r.output)) {
    for (const bloco of r.output) {
      const conteudo = (bloco as { content?: unknown })?.content;
      if (!Array.isArray(conteudo)) continue;
      for (const parte of conteudo) {
        const t = (parte as { text?: unknown })?.text;
        if (typeof t === 'string') texto += t;
      }
    }
  }
  return texto;
}

/** Tenta o JSON inteiro; falhando, recorta do primeiro '{' ao último '}' (mesma tática de `analise.ts`). */
function lerJson(texto: string): unknown | null {
  try {
    return JSON.parse(texto);
  } catch {
    const i = texto.indexOf('{');
    const f = texto.lastIndexOf('}');
    if (i < 0 || f <= i) return null;
    try {
      return JSON.parse(texto.slice(i, f + 1));
    } catch {
      return null;
    }
  }
}

const ERRO_LEITURA = 'Não deu para ler a resposta da pesquisa. Tente de novo.';
const ERRO_SEM_NOME = 'A pesquisa voltou sem nome.';
const ERRO_SEM_PADRAO = 'A pesquisa não conseguiu classificar o padrão de movimento. Cadastre em /academia.';

/** String não vazia após trim; qualquer outra coisa vira `''`. */
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Array de string filtrado pelo vocabulário fechado `lista` — item fora dela some, em silêncio. */
function arrayFiltrado(v: unknown, lista: readonly string[]): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && (lista as string[]).includes(x));
}

/** Array de string livre (equipamentoFaltante, fontes antes do filtro de http) — só garante o tipo. */
function arrayDeString(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/** Só aceita fonte que pareça URL (começa com "http") — o resto é descartado, não é instrução executável. */
const fontesValidas = (v: unknown): string[] => arrayDeString(v).filter((s) => s.startsWith('http'));

function numEmFaixa(v: unknown, padrao: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= TEMPO_MIN && n <= TEMPO_MAX ? n : padrao;
}

/**
 * Transforma a resposta bruta da OpenAI numa proposta pronta para a tela
 * revisar. Ao contrário de `extrairAnalise` (que devolve vazio em silêncio),
 * aqui falha lança `Error` com mensagem legível: a pesquisa é uma ação que o
 * coach pediu agora, então "não deu certo, tente de novo" é a resposta certa —
 * devolver uma proposta capenga (sem padrão, sem nome) seria pior, porque ele
 * cadastraria achando que deu tudo certo.
 */
export function extrairProposta(
  respostaOpenAI: unknown, contexto: Contexto, equipamentos: Equip[],
): Proposta {
  if (!respostaOpenAI || typeof respostaOpenAI !== 'object') throw new Error(ERRO_LEITURA);

  const bruto = textoDaResposta(respostaOpenAI as Record<string, unknown>);
  if (!bruto.trim()) throw new Error(ERRO_LEITURA);

  const json = lerJson(bruto);
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(ERRO_LEITURA);

  const d = json as Record<string, unknown>;
  const nome = texto(d.nome);
  if (!nome) throw new Error(ERRO_SEM_NOME);

  if (ehTecnica(contexto)) {
    const proposta: PropostaTecnica = {
      tipo: 'tecnica',
      nome,
      resumo: texto(d.resumo),
      comoExecutar: texto(d.comoExecutar),
      objetivo: texto(d.objetivo),
      fontes: fontesValidas(d.fontes),
    };
    return proposta;
  }

  const padrao = texto(d.padrao);
  if (!(PADROES as readonly string[]).includes(padrao)) throw new Error(ERRO_SEM_PADRAO);

  const idsDoInventario = new Set(equipamentos.map((e) => e.id));
  const equipamentoIds = arrayDeString(d.equipamentoIds).filter((id) => idsDoInventario.has(id));

  const tempoPadrao = contexto === 'mobilidade' ? TEMPO_PADRAO_MOBILIDADE : TEMPO_PADRAO_EXERCICIO;
  const nivel = texto(d.nivel);

  const proposta: PropostaExercicio = {
    tipo: 'exercicio',
    nome,
    padrao,
    musculos: arrayFiltrado(d.musculos, MUSCULOS_LABEL),
    tags: arrayFiltrado(d.tags, TAGS),
    equipamentoIds,
    // Nível fora do vocabulário cai no mesmo padrão que `academia/db.js` já usa
    // para exercício sem nível (`x.nivel || 'intermediario'") — não há "array"
    // do qual descartar um valor único, então o equivalente a "descartar em
    // silêncio" é usar o padrão do resto do catálogo.
    nivel: (NIVEIS as readonly string[]).includes(nivel) ? nivel : NIVEL_PADRAO,
    tempoMedioSeg: numEmFaixa(d.tempoMedioSeg, tempoPadrao),
    obs: texto(d.obs),
    equipamentoFaltante: arrayDeString(d.equipamentoFaltante),
    fontes: fontesValidas(d.fontes),
  };
  return proposta;
}
