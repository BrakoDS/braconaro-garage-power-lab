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

export const INSTRUCOES = [
  'Você é nutricionista esportivo do Braconaro Garage Power Lab.',
  'Analise a foto do prato e identifique os alimentos visíveis.',
  'Para cada alimento estime o peso em gramas, as calorias e os macronutrientes',
  '(proteína, carboidrato e gordura), todos em gramas.',
  '',
  'Regras:',
  '- Estime pelo que aparece na foto. Não invente alimento que não dá para ver.',
  '- Se a foto não tiver comida, devolva a lista de itens vazia.',
  '- Use nomes curtos e em português do Brasil (ex.: "Peito de frango grelhado").',
  '- Sugira a refeição pelo conteúdo do prato, não pelo horário.',
  '- Números arredondados; nada de faixas nem texto dentro dos campos numéricos.',
  '- São estimativas visuais, então prefira errar para o conservador.',
].join('\n');

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
