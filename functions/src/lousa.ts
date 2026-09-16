/**
 * LOUSA DO COACH — parte pura, sem rede e sem Firebase.
 *
 * Irmã de `analise.ts` e `pesquisa.ts`, com a mesma divisão: o que dá para
 * testar em `npm run checar` mora aqui; `index.ts` só sabe falar com a OpenAI.
 *
 * O que este módulo resolve: o coach escreve o treino no quadro branco — texto
 * livre, rabisco, seta, "3x10 RIR 2" no canto — e o sistema precisa devolver
 * isso como TREINO ESTRUTURADO (sistema, blocos A/B/C/D, exercícios, séries,
 * grupamentos). `montarSchema`/`instrucoes` preparam a chamada ao Responses API
 * com visão; `extrairTreino` lê a resposta e devolve algo que a tela consegue
 * renderizar em card — ou lança, quando o que voltou não é treino nenhum.
 *
 * REGRAS GLOBAIS DO BOX (`REGRAS_GLOBAIS`, aplicadas em `aplicarRegrasGlobais`):
 * Pull-up vira Puxada Alta Pegada Aberta e Corrida vira Airbike, sempre — não é
 * preferência de prescrição, é o que existe no galpão. A troca acontece DEPOIS
 * da leitura, e não dentro do prompt, por um motivo prático: a IA lê o que está
 * escrito na lousa, e o coach escreve "pull-up" porque é assim que ele fala. Se
 * a regra morasse só no prompt, um modelo distraído devolveria "pull-up" e
 * ninguém saberia; aqui a substituição é determinística, fica registrada em
 * `substituicoes` e a tela mostra ao coach o que foi trocado e por quê.
 *
 * ATENÇÃO — DUPLICAÇÃO DE VERDADE, DOCUMENTADA DE PROPÓSITO:
 * `functions/` é um pacote TypeScript separado, sem acesso aos `.js` do site
 * (o site é estático, as functions rodam no servidor). `MUSCULOS_LABEL` abaixo
 * é CÓPIA da mesma cadeia que `pesquisa.ts` documenta em detalhe
 * (`compartilhado/config/padroes.js:MUSCULOS` → `compartilhado/config/musculos.js:MUSC_MAP`),
 * e `checar.ts` compara as duas para que a divergência apareça no CI em vez de
 * em produção.
 */

/** Rótulos de músculo que a Academia grava — ver o cabeçalho sobre duplicação. */
export const MUSCULOS_LABEL = [
  'Peito', 'Ombro', 'Tríceps', 'Costas', 'Bíceps', 'Quadríceps',
  'Posterior de coxa', 'Glúteo', 'Panturrilha', 'Core/Abdômen', 'Antebraço',
] as const;

/** Os quatro sistemas que o box prescreve. */
export const SISTEMAS = ['HIIT', 'GAP', 'Hipertrofia', 'Hyrox'] as const;
export type Sistema = (typeof SISTEMAS)[number];

/**
 * Os quatro blocos da lousa, na ordem em que o coach escreve no quadro.
 * A ordem importa: é ela que a tela usa para montar os cards de cima para
 * baixo, e é ela que `estimativaSeries` respeita ao somar.
 */
export const BLOCOS = [
  { id: 'A', nome: 'Mobilidade' },
  { id: 'B', nome: 'Aquecimento' },
  { id: 'C', nome: 'Força' },
  { id: 'D', nome: 'Metcon' },
] as const;
export type BlocoId = (typeof BLOCOS)[number]['id'];

const BLOCO_IDS = BLOCOS.map((b) => b.id) as readonly string[];
const BLOCO_NOME: Record<string, string> = Object.fromEntries(BLOCOS.map((b) => [b.id, b.nome]));

/** Séries por exercício aceitas; fora da faixa cai no padrão do bloco. */
const SERIES_MIN = 1;
const SERIES_MAX = 12;
/** Mobilidade e aquecimento raramente têm série escrita — 1 passagem é o padrão honesto. */
const SERIES_PADRAO: Record<string, number> = { A: 1, B: 1, C: 3, D: 3 };

/** Teto de exercícios lidos de uma lousa só. Acima disso é ruído de OCR, não treino. */
const MAX_EXERCICIOS = 40;
/** Teto de caracteres de campo livre vindo da IA (nome, observação). */
const MAX_TEXTO = 240;

export type ExercicioLousa = {
  /** Nome já passado pelas regras globais do box. */
  nome: string;
  bloco: BlocoId;
  series: number;
  /** Livre de propósito: '8-12', '30s', 'AMRAP 8min' — a lousa não normaliza isso. */
  reps: string;
  /** Rótulo do implemento como o coach escreveu ('Barra', 'Halter', 'Airbike'). */
  implemento: string;
  /** Rótulos de `MUSCULOS_LABEL`; o que a IA inventar é descartado. */
  grupamentos: string[];
  /** A caneta vermelha: RIR, descanso, carga, alerta de intensidade. */
  observacao: string;
};

export type BlocoLousa = {
  id: BlocoId;
  nome: string;
  exercicios: ExercicioLousa[];
};

export type Substituicao = { de: string; para: string; regra: string };

export type TreinoEstruturado = {
  sistema: Sistema;
  titulo: string;
  blocos: BlocoLousa[];
  /** Soma das séries de todos os blocos — o número que alimenta o Dashboard de Volume. */
  estimativaSeries: number;
  /** O que as regras globais trocaram, para a tela mostrar ao coach. */
  substituicoes: Substituicao[];
  /** O que a leitura não conseguiu resolver sozinha. */
  avisos: string[];
};

/* ------------------------------------------------------------------ *
 * Regras globais do box
 * ------------------------------------------------------------------ */

/**
 * Uma regra casa por TERMO, não por nome inteiro: a lousa traz "3x8 pull-ups",
 * "Pull Up estrito", "barra fixa" — todas a mesma coisa, nenhuma igual à outra.
 * `termos` já vem sem acento e em minúsculas; `normalizar` põe o texto do coach
 * no mesmo formato antes de comparar.
 */
export const REGRAS_GLOBAIS: { termos: string[]; para: string; regra: string }[] = [
  {
    termos: ['pull up', 'pullup', 'pull-up', 'pull ups', 'pullups', 'barra fixa', 'chin up', 'chinup'],
    para: 'Puxada Alta Pegada Aberta',
    regra: 'Pull-up ➔ Puxada Alta Pegada Aberta (regra global do box)',
  },
  {
    termos: ['corrida', 'correr', 'corre', 'run', 'running', 'esteira', 'trote', 'sprint'],
    para: 'Airbike',
    regra: 'Corrida ➔ Airbike (regra global do box)',
  },
];

/** Minúsculas, sem acento, hífen virando espaço — a forma em que os termos comparam. */
export function normalizar(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A regra global que se aplica a um nome, ou `null`.
 *
 * Casa por SUBSTRING e não por igualdade porque o nome real na lousa vem
 * grudado em qualificador ("pull up estrito", "corrida 400m"). O efeito
 * colateral que isso poderia ter — trocar um nome que só CONTÉM o termo por
 * acaso — não existe na prática aqui: os termos da lista são todos nomes de
 * movimento inteiros, não sílabas.
 */
export function regraGlobalDe(nome: string): { para: string; regra: string } | null {
  const n = normalizar(nome);
  if (!n) return null;
  for (const r of REGRAS_GLOBAIS) {
    // Já está no destino: não é substituição, é o treino certo. Sem isto, um
    // treino salvo e relido ganharia uma "troca" fantasma a cada leitura.
    if (n === normalizar(r.para)) return null;
    if (r.termos.some((t) => n.includes(t))) return { para: r.para, regra: r.regra };
  }
  return null;
}

/**
 * Aplica as regras globais ao treino inteiro e devolve uma cópia, com o
 * registro do que mudou. Nunca muta a entrada: `extrairTreino` chama isto no
 * fim da leitura, e a tela compara lado a lado o que a lousa dizia com o que
 * o sistema estruturou — comparação que morre se o original for alterado.
 */
export function aplicarRegrasGlobais(treino: TreinoEstruturado): TreinoEstruturado {
  const substituicoes: Substituicao[] = [];
  const blocos = treino.blocos.map((b) => ({
    ...b,
    exercicios: b.exercicios.map((ex) => {
      const r = regraGlobalDe(ex.nome);
      if (!r) return ex;
      substituicoes.push({ de: ex.nome, para: r.para, regra: r.regra });
      return { ...ex, nome: r.para };
    }),
  }));
  return { ...treino, blocos, substituicoes };
}

/* ------------------------------------------------------------------ *
 * Schema e instruções da chamada ao Responses API
 * ------------------------------------------------------------------ */

/**
 * Schema compatível com `strict: true`: todo campo em `required`,
 * `additionalProperties: false`, nenhum opcional. Mesma regra que `analise.ts`
 * e `pesquisa.ts` seguem — um campo fora de `required` faz a API recusar o
 * schema inteiro, e o erro que ela devolve não diz qual campo é.
 */
export function montarSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sistema', 'titulo', 'exercicios', 'avisos'],
    properties: {
      sistema: { type: 'string', enum: [...SISTEMAS] },
      titulo: { type: 'string' },
      avisos: { type: 'array', items: { type: 'string' } },
      exercicios: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['nome', 'bloco', 'series', 'reps', 'implemento', 'grupamentos', 'observacao'],
          properties: {
            nome: { type: 'string' },
            bloco: { type: 'string', enum: [...BLOCO_IDS] },
            series: { type: 'number' },
            reps: { type: 'string' },
            implemento: { type: 'string' },
            grupamentos: { type: 'array', items: { type: 'string', enum: [...MUSCULOS_LABEL] } },
            observacao: { type: 'string' },
          },
        },
      },
    },
  };
}

/**
 * O prompt.
 *
 * Duas coisas que ele precisa deixar explícitas, e o motivo de cada uma:
 *  - AS CORES TÊM SIGNIFICADO. Preto é exercício e bloco, vermelho é
 *    intensidade/RIR/descanso, azul é série/repetição/estação. Sem isso o
 *    modelo lê "12" escrito em azul ao lado de um exercício e chuta se aquilo
 *    é repetição ou carga.
 *  - O TEXTO DIGITADO MANDA MAIS QUE O RABISCO. O coach digita o que quer
 *    preciso e desenha o que é rápido; quando os dois discordam, discordar a
 *    favor do desenho é trocar dado exato por leitura de caligrafia.
 */
export function instrucoes(textoDigitado: string): string {
  const base = [
    'Você lê a LOUSA de um coach de um box de treinamento funcional e devolve o treino estruturado.',
    '',
    'A lousa tem texto digitado e/ou desenho à mão feito com três canetas, e a COR CARREGA SIGNIFICADO:',
    '- PRETO: títulos, nomes de exercício e os blocos do treino.',
    '- VERMELHO: intensidade, RIR, tempo de descanso e observação de carga. Isso vai em "observacao".',
    '- AZUL: séries, repetições, subdivisão da turma e estação de cada aluno. Isso vai em "series" e "reps".',
    '',
    'BLOCOS (campo "bloco"): A = Mobilidade, B = Aquecimento, C = Força, D = Metcon.',
    'Se a lousa não marcar o bloco, deduza pelo exercício (alongamento e liberação em A; ativação e cardio leve em B; levantamento com carga em C; circuito, AMRAP, EMOM e afins em D).',
    '',
    'REGRAS:',
    '- "series" é NÚMERO. Se a lousa não disser, devolva 0 e o sistema aplica o padrão do bloco.',
    '- "reps" é TEXTO livre, exatamente como está na lousa: "8-12", "30s", "AMRAP 8min", "20 cada lado".',
    '- "implemento" é o equipamento em uma ou duas palavras: Barra, Halter, Kettlebell, Cabo, Anilha, Airbike, Corda, Peso corporal.',
    '- "grupamentos" só aceita os rótulos do vocabulário fechado. Na dúvida, devolva lista vazia em vez de chutar.',
    '- NÃO invente exercício que não está na lousa. Lousa ilegível gera "avisos", não exercício imaginado.',
    '- "avisos" é onde vai o que você não conseguiu ler ou o que ficou ambíguo.',
    '- "sistema" é a classificação do treino inteiro: HIIT, GAP, Hipertrofia ou Hyrox.',
  ];
  const texto = String(textoDigitado || '').trim();
  if (texto) {
    base.push(
      '',
      'O coach TAMBÉM digitou o texto abaixo. Ele é mais confiável que a caligrafia:',
      'quando o desenho e o texto discordarem, siga o texto e registre a divergência em "avisos".',
      '',
      '--- TEXTO DIGITADO ---',
      texto.slice(0, 4000),
      '--- FIM ---',
    );
  }
  return base.join('\n');
}

/* ------------------------------------------------------------------ *
 * Leitura da resposta
 * ------------------------------------------------------------------ */

/** Mesmo caminho duplo de `analise.ts`/`pesquisa.ts`: `output_text` ou `output[].content[].text`. */
function textoDaResposta(r: unknown): string {
  if (!r || typeof r !== 'object') return '';
  const o = r as Record<string, unknown>;
  if (typeof o.output_text === 'string' && o.output_text.trim()) return o.output_text;
  let texto = '';
  if (Array.isArray(o.output)) {
    for (const bloco of o.output) {
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

/**
 * O JSON de dentro do texto. O modelo às vezes embrulha em prosa ("Claro!
 * Aqui está: {...}") ou em cerca de markdown, mesmo com schema estrito — o
 * recorte do primeiro `{` ao último `}` cobre os dois casos.
 */
function objetoDoTexto(texto: string): Record<string, unknown> {
  const t = String(texto || '').trim();
  if (!t) throw new Error('A leitura da lousa voltou vazia. Tente de novo.');
  const cru = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const ini = cru.indexOf('{');
  const fim = cru.lastIndexOf('}');
  const alvo = ini >= 0 && fim > ini ? cru.slice(ini, fim + 1) : cru;
  try {
    const o = JSON.parse(alvo);
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('não é objeto');
    return o as Record<string, unknown>;
  } catch {
    throw new Error('Não deu para entender a lousa. Escreva o treino no campo de texto e tente de novo.');
  }
}

const texto = (v: unknown, max = MAX_TEXTO): string =>
  (typeof v === 'string' ? v : '').trim().slice(0, max);

/** Inteiro dentro da faixa, ou `null` quando não é número aproveitável. */
function seriesValidas(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= SERIES_MIN && i <= SERIES_MAX ? i : null;
}

/** Só os rótulos do vocabulário fechado sobrevivem, sem repetir. */
function grupamentosValidos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const aceitos = new Set<string>(MUSCULOS_LABEL as readonly string[]);
  return [...new Set(v.filter((m): m is string => typeof m === 'string' && aceitos.has(m)))];
}

/**
 * Lê a resposta e devolve o treino estruturado, já com as regras globais do box
 * aplicadas.
 *
 * O que é RECUSADO (lança): resposta vazia, JSON quebrado e treino sem nenhum
 * exercício legível. Os três significam a mesma coisa para o coach — a lousa
 * não foi lida — e devolver um treino vazio em silêncio o faria salvar uma
 * aula em branco achando que deu certo.
 *
 * O que é TOLERADO (descarta em silêncio, ou cai no padrão): bloco fora de
 * A-D, série fora da faixa, músculo inventado, exercício sem nome. São ruídos
 * de uma linha só, e recusar o treino inteiro por causa de um deles obrigaria
 * o coach a fotografar a lousa de novo por nada.
 */
export function extrairTreino(resposta: unknown): TreinoEstruturado {
  const o = objetoDoTexto(textoDaResposta(resposta));

  const sistema = (SISTEMAS as readonly string[]).includes(String(o.sistema))
    ? (o.sistema as Sistema)
    : 'Hipertrofia';

  const avisos = Array.isArray(o.avisos)
    ? o.avisos.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => texto(a))
    : [];
  if (!(SISTEMAS as readonly string[]).includes(String(o.sistema))) {
    avisos.push('A lousa não deixou claro o sistema do treino — assumimos Hipertrofia. Confira antes de salvar.');
  }

  const crus = Array.isArray(o.exercicios) ? o.exercicios.slice(0, MAX_EXERCICIOS) : [];
  const porBloco = new Map<BlocoId, ExercicioLousa[]>();
  for (const b of BLOCOS) porBloco.set(b.id, []);

  for (const item of crus) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const nome = texto(e.nome);
    if (!nome) continue; // linha sem nome não é exercício

    const bloco = (BLOCO_IDS.includes(String(e.bloco)) ? String(e.bloco) : 'C') as BlocoId;
    const series = seriesValidas(e.series) ?? SERIES_PADRAO[bloco];
    porBloco.get(bloco)?.push({
      nome,
      bloco,
      series,
      reps: texto(e.reps, 60),
      implemento: texto(e.implemento, 40),
      grupamentos: grupamentosValidos(e.grupamentos),
      observacao: texto(e.observacao),
    });
  }

  const blocos: BlocoLousa[] = BLOCOS
    .map((b) => ({ id: b.id, nome: BLOCO_NOME[b.id], exercicios: porBloco.get(b.id) ?? [] }))
    .filter((b) => b.exercicios.length > 0);

  if (!blocos.length) {
    throw new Error('A lousa foi lida, mas nenhum exercício foi reconhecido. Escreva o treino no campo de texto e tente de novo.');
  }

  const estimativaSeries = blocos.reduce(
    (soma, b) => soma + b.exercicios.reduce((s, ex) => s + ex.series, 0),
    0,
  );

  return aplicarRegrasGlobais({
    sistema,
    titulo: texto(o.titulo, 120) || `Treino ${sistema}`,
    blocos,
    estimativaSeries,
    substituicoes: [],
    avisos,
  });
}

/** Todos os exercícios do treino, achatados — o que os outros módulos consomem. */
export function exerciciosDo(treino: TreinoEstruturado): ExercicioLousa[] {
  return (treino?.blocos || []).flatMap((b) => b.exercicios || []);
}
