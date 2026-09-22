/**
 * Leitura da resposta da IA — parte pura, sem rede e sem Firebase.
 *
 * Separada de `index.ts` para poder ser exercitada no Node (`npm run checar`).
 * É o pedaço com mais chance de quebrar em silêncio: o modelo pode devolver
 * texto antes do JSON, a resposta pode vir truncada no limite de tokens, e o
 * envelope da API pode mudar de forma. Nenhuma dessas falhas pode virar tela de
 * erro para o aluno — no pior caso ele recebe zero itens e preenche na mão.
 */

export const CATEGORIAS = [
  'café da manhã', 'almoço', 'jantar', 'lanche', 'pré-treino', 'pós-treino',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export interface ItemAnalisado {
  name: string;
  quantityGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Analise {
  suggestedCategory: Categoria;
  items: ItemAnalisado[];
}

/** Prato com mais itens que isto é erro de leitura, não refeição. */
const MAX_ITENS = 15;

/**
 * O schema que a OpenAI é obrigada a seguir.
 *
 * Com `strict: true` o modelo não devolve texto solto nem campo a mais, o que
 * elimina de saída o caso "JSON malformado". O parse defensivo continua
 * existindo porque resposta truncada e mudança de envelope não somem por causa
 * de schema.
 */
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestedCategory', 'items'],
  properties: {
    suggestedCategory: { type: 'string', enum: [...CATEGORIAS] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantityGrams', 'calories', 'protein', 'carbs', 'fat'],
        properties: {
          name: { type: 'string' },
          quantityGrams: { type: 'number' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
      },
    },
  },
} as const;

/**
 * O que a IA recebe como instrução.
 *
 * O prompt é HÍBRIDO porque a foto que o aluno manda é de duas naturezas
 * diferentes, e tratá-las igual estraga as duas: prato é estimativa visual
 * (nunca vai bater no grama), rótulo é leitura de número impresso (bate
 * exatamente, e errar ali é erro bobo). Pedir "estime" diante de uma tabela
 * nutricional faz o modelo chutar valores "típicos" do alimento por cima do que
 * está escrito na embalagem — perde-se a única foto em que dava para acertar de
 * verdade.
 *
 * Os dois caminhos desembocam no MESMO formato de item, de propósito: para o
 * resto do sistema (parser, app, somas) rótulo e prato são a mesma coisa, e
 * `quantityGrams` continua sendo "o peso a que estes números se referem" — no
 * prato, o peso estimado; no rótulo, a porção declarada. É isso que deixa a
 * trava de proporção do app funcionar igual nos dois casos.
 */
export const INSTRUCOES = [
  'Você é nutricionista esportivo do Garage Power Lab.',
  'A foto pode ser de duas coisas. Antes de qualquer número, decida qual delas é:',
  '',
  'CASO A — PRATO DE COMIDA (alimento à vista, sem rótulo legível): ESTIME.',
  '- Identifique os alimentos visíveis e estime o peso em gramas de cada um.',
  '- A partir do peso, estime as calorias e os macronutrientes (proteína,',
  '  carboidrato e gordura), todos em gramas.',
  '- Estime pelo que aparece na foto. Não invente alimento que não dá para ver.',
  '- São estimativas visuais, então prefira errar para o conservador.',
  '- Sugira a refeição pelo conteúdo do prato, não pelo horário.',
  '',
  'CASO B — RÓTULO OU TABELA NUTRICIONAL (embalagem com informação nutricional',
  'legível): NÃO ESTIME, LEIA.',
  '- Transcreva rigorosamente o que está impresso. Não arredonde para o valor',
  '  "típico" do alimento nem corrija o fabricante: o rótulo manda.',
  '- quantityGrams = a PORÇÃO declarada na tabela. Porção em mL, use o mesmo',
  '  número (200 mL vira 200). Porção em medida caseira com peso entre',
  '  parênteses ("1 fatia (30 g)"), use o peso: 30.',
  '- calories, protein, carbs e fat = exatamente os valores da COLUNA daquela',
  '  porção. Nunca a coluna de 100 g quando a porção é outra, e nunca o %VD.',
  '- Se a tabela só trouxer a coluna de 100 g, use 100 em quantityGrams e os',
  '  valores dessa coluna.',
  '- name = o produto como ele aparece no rótulo, marca junto quando dá para ler',
  '  (ex.: "Whey Protein Concentrado", "Iogurte grego natural").',
  '- Um item por produto fotografado.',
  '- Sugira a refeição pelo tipo de produto (whey ou barra de proteína:',
  '  pós-treino; iogurte, fruta ou biscoito: lanche).',
  '',
  'Vale para os dois casos:',
  '- Use nomes curtos e em português do Brasil (ex.: "Peito de frango grelhado").',
  '- Se a foto não tiver comida nem rótulo de alimento, devolva a lista vazia.',
  '- Números arredondados; nada de faixas nem texto dentro dos campos numéricos.',
].join('\n');

/**
 * O que a IA recebe quando o aluno DESCREVE a refeição em vez de fotografar.
 *
 * Prompt próprio, e não um parágrafo a mais no de cima: o de foto existe para
 * decidir entre prato e rótulo OLHANDO a imagem, e essa bifurcação não tem
 * sentido diante de uma frase. Misturar os dois só daria ao modelo instrução
 * que não se aplica ao que ele está recebendo.
 *
 * A diferença de fundo é o que o aluno já entregou de graça: na frase, muitas
 * vezes, o peso ("150 g de frango") — e aí não há o que estimar, é para
 * obedecer. O que ele não disser é que vira estimativa, e conservadora, pelo
 * mesmo motivo do prato: chute para cima vira déficit que não existe.
 *
 * O formato de saída é o MESMO da foto (`SCHEMA`), de propósito: para o parser,
 * para o app e para as somas, refeição descrita e refeição fotografada são a
 * mesma coisa.
 */
export const INSTRUCOES_TEXTO = [
  'Você é nutricionista esportivo do Garage Power Lab.',
  'O aluno DESCREVEU o que comeu, em português do Brasil. Transforme a',
  'descrição em itens com peso, calorias e macronutrientes.',
  '',
  '- Quando ele DISSER a quantidade, ela manda: "150 g de frango" é 150, e não',
  '  o que costuma ser uma porção. Obedeça também à medida caseira que ele usar',
  '  ("2 ovos", "1 concha de feijão", "meio prato"), convertendo para gramas.',
  '- Quando ele NÃO disser a quantidade, estime a porção usual de um adulto, e',
  '  prefira errar para o conservador.',
  '- Um item por alimento: "arroz com feijão e bife" são três itens, não um.',
  '- Prato que não se separa ("1 fatia de bolo de cenoura", "um x-salada") vale',
  '  como um item só, com o peso da porção inteira.',
  '- Não invente acompanhamento que ele não citou.',
  '- Se a descrição não for de comida, devolva a lista vazia.',
  '',
  'Vale o mesmo da foto:',
  '- name = nome curto do alimento, em português do Brasil.',
  '- quantityGrams = o peso a que os números daquele item se referem.',
  '- Números arredondados; nada de faixas nem texto dentro dos campos numéricos.',
  '- Sugira a refeição pelo conteúdo, não pelo horário.',
].join('\n');

/** Teto da descrição: é frase de refeição, não redação. */
export const MAX_TEXTO = 300;

/**
 * A descrição do aluno pronta para ir ao modelo.
 *
 * Corta no teto e achata espaço em vez de recusar o que passou: um parágrafo
 * colado por engano é acidente comum, e o começo dele costuma ser exatamente a
 * refeição. Recusar devolveria erro por algo que dava para resolver sozinho.
 */
export function limparTexto(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO);
}

/** Converte para número finito e positivo; qualquer outra coisa vira 0. */
export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
};

export const ehCategoria = (v: unknown): v is Categoria =>
  typeof v === 'string' && (CATEGORIAS as readonly string[]).includes(v);

export const ANALISE_VAZIA: Analise = { suggestedCategory: 'almoço', items: [] };

/** Junta o texto da resposta, aceitando o atalho e o formato completo. */
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

/** Tenta o JSON inteiro; falhando, recorta do primeiro '{' ao último '}'. */
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

/**
 * Transforma a resposta bruta da OpenAI numa análise confiável.
 *
 * Item sem nome é descartado em vez de derrubar a análise inteira: o aluno
 * recebe o que deu para reconhecer e corrige o resto, que é melhor que perder
 * tudo por causa de uma linha torta.
 */
export function extrairAnalise(bruto: unknown): Analise {
  if (!bruto || typeof bruto !== 'object') return ANALISE_VAZIA;

  const texto = textoDaResposta(bruto as Record<string, unknown>);
  if (!texto.trim()) return ANALISE_VAZIA;

  const json = lerJson(texto);
  if (!json || typeof json !== 'object') return ANALISE_VAZIA;

  const d = json as Record<string, unknown>;
  const items = (Array.isArray(d.items) ? d.items : [])
    .map((cru): ItemAnalisado | null => {
      if (!cru || typeof cru !== 'object') return null;
      const i = cru as Record<string, unknown>;
      const name = String(i.name ?? '').trim().slice(0, 80);
      if (!name) return null;
      return {
        name,
        quantityGrams: num(i.quantityGrams),
        calories: num(i.calories),
        protein: num(i.protein),
        carbs: num(i.carbs),
        fat: num(i.fat),
      };
    })
    .filter((i): i is ItemAnalisado => i !== null)
    .slice(0, MAX_ITENS);

  return {
    suggestedCategory: ehCategoria(d.suggestedCategory) ? d.suggestedCategory : 'almoço',
    items,
  };
}
