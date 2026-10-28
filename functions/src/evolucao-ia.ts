/**
 * Avaliador de evolução por fotos — a parte pura, sem rede e sem Firebase.
 *
 * O coach escolhe, na Gestão, as fotos do aluno (Diário de Evolução e fotos das
 * avaliações físicas), com data, ângulo e o peso do período; a callable
 * `analisarEvolucaoFotos` baixa as imagens do NOSSO bucket e pede à OpenAI um
 * relatório técnico em quatro partes. Aqui moram as três coisas que dá para
 * provar no Node (`npm run checar:evolucao`):
 *
 *   - `lerPedido`        o que vem do navegador, sem confiar nele: só URL do
 *                        nosso Storage (nas pastas `diario/` e `gestao/`), data
 *                        que existe, ângulo da lista, peso plausível;
 *   - `montarConteudo`   o texto e as imagens na ordem em que o modelo lê;
 *   - `extrairRelatorio` a resposta do modelo, que pode vir truncada, com texto
 *                        em volta do JSON, ou ser uma recusa.
 *
 * O relatório é rascunho para o COACH, nunca vai direto ao aluno: a sugestão de
 * feedback é um texto que ele revisa antes de mandar.
 */
import { lerJson, textoDaResposta } from './analise';

export const ANGULOS = ['frente', 'lado', 'costas'] as const;
export type Angulo = (typeof ANGULOS)[number];

/** O rótulo do app e do Portal: "lado" se lê "Perfil". */
export const ROTULO_ANGULO: Record<Angulo, string> = { frente: 'Frente', lado: 'Perfil', costas: 'Costas' };

export type OrigemFoto = 'diario' | 'avaliacao';

/** Com uma foto não há o que comparar; acima de 8, o custo e o tempo sobem sem ganho de leitura. */
export const MIN_FOTOS = 2;
export const MAX_FOTOS = 8;

/** Peso fora disto é erro de digitação na ficha, não um dado para a IA. */
const PESO_MIN = 25;
const PESO_MAX = 350;

/**
 * Download URL do bucket do projeto, nas duas pastas de foto de corpo: o Diário
 * (`diario/{email}/…`, do aluno) e a Gestão (`gestao/{uid}/{aluno}/aval-…`, do
 * coach). A função BAIXA esta URL — se aceitasse qualquer endereço, viraria um
 * proxy para a internet com a conta do projeto.
 */
const PREFIXO_BUCKET = 'https://firebasestorage.googleapis.com/v0/b/projeto-garage-f0a2f.firebasestorage.app/o/';
const PASTAS = ['diario%2F', 'gestao%2F'];

export interface FotoPedido {
  /** 'AAAA-MM-DD' */
  data: string;
  angulo?: Angulo;
  url: string;
  origem: OrigemFoto;
  /** kg, quando a ficha tem o peso daquele período. */
  peso?: number;
}

export interface PedidoEvolucao {
  /** Só o primeiro nome: é o que o rascunho de feedback usa, e o resto não precisa sair do box. */
  nome: string;
  sexo?: 'masculino' | 'feminino';
  objetivo?: string;
  /** Da mais antiga para a mais nova. */
  fotos: FotoPedido[];
}

export function urlDoBucket(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 2048 && !/\s/.test(url)
    && url.startsWith(PREFIXO_BUCKET) && PASTAS.some((p) => url.startsWith(PREFIXO_BUCKET + p));
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** 'AAAA-MM-DD' que existe no calendário (30/02 não passa). */
export function dataValida(s: unknown): s is string {
  if (typeof s !== 'string' || !RE_DATA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const ehAngulo = (v: unknown): v is Angulo => (ANGULOS as readonly unknown[]).includes(v);

function lerPeso(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n >= PESO_MIN && n <= PESO_MAX ? Math.round(n * 10) / 10 : undefined;
}

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * O pedido do navegador, conferido. Devolve a mensagem de erro (em linguagem de
 * coach) quando não dá para analisar.
 */
export function lerPedido(dados: unknown): PedidoEvolucao | string {
  const d = (dados && typeof dados === 'object' ? dados : {}) as Record<string, unknown>;
  const cruas = Array.isArray(d.fotos) ? d.fotos : [];
  if (cruas.length > MAX_FOTOS) return `Mande no máximo ${MAX_FOTOS} fotos por análise.`;

  const vistas = new Set<string>();
  const fotos: FotoPedido[] = [];
  for (const cru of cruas) {
    const f = (cru && typeof cru === 'object' ? cru : {}) as Record<string, unknown>;
    if (!urlDoBucket(f.url)) return 'Uma das fotos não é do Storage do box.';
    if (!dataValida(f.data)) return 'Uma das fotos está sem data válida.';
    if (vistas.has(f.url)) continue;
    vistas.add(f.url);
    const peso = lerPeso(f.peso);
    fotos.push({
      data: f.data,
      url: f.url,
      origem: f.origem === 'avaliacao' ? 'avaliacao' : 'diario',
      ...(ehAngulo(f.angulo) ? { angulo: f.angulo } : {}),
      ...(peso ? { peso } : {}),
    });
  }
  if (fotos.length < MIN_FOTOS) return `A análise compara fotos: escolha pelo menos ${MIN_FOTOS}.`;

  const ordemAngulo = (a?: Angulo) => (a ? ANGULOS.indexOf(a) : ANGULOS.length);
  fotos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : ordemAngulo(a.angulo) - ordemAngulo(b.angulo)));

  const nome = texto(d.nome, 60).split(' ')[0] ?? '';
  const sexo = d.sexo === 'masculino' || d.sexo === 'feminino' ? d.sexo : undefined;
  const objetivo = texto(d.objetivo, 80);
  return { nome, fotos, ...(sexo ? { sexo } : {}), ...(objetivo ? { objetivo } : {}) };
}

/** '12/09/2026' */
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "Foto 3 — 12/09/2026 · Perfil · 82,4 kg · avaliação física" — o rótulo que vai antes de cada imagem. */
export function rotuloDaFoto(f: FotoPedido, i: number): string {
  const partes = [
    dataBr(f.data),
    f.angulo ? ROTULO_ANGULO[f.angulo] : 'ângulo não marcado',
    ...(f.peso ? [`${String(f.peso).replace('.', ',')} kg`] : []),
    f.origem === 'avaliacao' ? 'avaliação física' : 'diário do aluno',
  ];
  return `Foto ${i + 1} — ${partes.join(' · ')}`;
}

export const INSTRUCOES_EVOLUCAO = `Você é o assistente técnico de um coach de academia (treino de força, cross e hipertrofia). Recebe fotos de UM aluno em datas diferentes, em ordem cronológica, cada uma com data, ângulo (Frente, Perfil ou Costas) e, quando há, o peso do período. Escreva um relatório em português do Brasil para o COACH.

Como ler as fotos:
- Compare o mesmo ângulo entre datas (frente com frente, perfil com perfil). Foto sem ângulo marcado: deduza pelo que se vê.
- Descreva só o que é VISÍVEL. Use "aparente", "parece", "sugere". Não invente medidas, não estime percentual de gordura, não fale em doença nem em diagnóstico.
- Iluminação, distância, enquadramento, postura (barriga contraída, ombros encolhidos), roupa e inclinação da câmera mudam a leitura. Se mudaram entre as datas, diga quais fotos e o quanto isso atrapalha.
- Leve o peso em conta quando houver (ex.: peso estável com cintura mais fina sugere recomposição corporal), sem tirar conclusão que a foto não sustenta.

O que preencher:
- qualidade.nivel: "boa" (dá para comparar), "parcial" (dá com ressalvas) ou "ruim" (as diferenças de foto impedem uma leitura confiável).
- qualidade.avisos: frases curtas sobre o que muda entre as fotos (luz, distância, postura, roupa, ângulo, câmera). Vazio se nada atrapalha.
- evolucao: frases curtas com a mudança visível entre os períodos, citando as datas — volume abdominal e flancos, cintura, contorno e volume de ombros, peitoral, dorsais, braços, glúteos e pernas.
- atencao: frases curtas com onde ainda há mais acúmulo aparente de gordura localizada, assimetrias e detalhes posturais visíveis (projeção de ombros, cabeça à frente, anteversão pélvica, abdômen projetado), cada um com uma sugestão prática para o treino.
- feedback: rascunho de mensagem do coach para o aluno, chamando-o pelo primeiro nome, em segunda pessoa, motivador e honesto: abre com uma conquista concreta, cita um ponto para focar e fecha com incentivo. Sem comentar aparência de forma depreciativa, sem números que a foto não mostra. De 3 a 6 frases.

Se as fotos não mostram o corpo de uma pessoa, ou não dá para comparar nada, use qualidade.nivel "ruim", explique em qualidade.avisos e deixe evolucao e atencao vazios.`;

/** O schema que a OpenAI é obrigada a seguir (`strict: true`). */
export const SCHEMA_EVOLUCAO = {
  type: 'object',
  additionalProperties: false,
  required: ['qualidade', 'evolucao', 'atencao', 'feedback'],
  properties: {
    qualidade: {
      type: 'object',
      additionalProperties: false,
      required: ['nivel', 'avisos'],
      properties: {
        nivel: { type: 'string', enum: ['boa', 'parcial', 'ruim'] },
        avisos: { type: 'array', items: { type: 'string' } },
      },
    },
    evolucao: { type: 'array', items: { type: 'string' } },
    atencao: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'string' },
  },
} as const;

export type ParteConteudo =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'high' };

/**
 * O que o modelo lê: o contexto do aluno e, para cada foto, o rótulo seguido da
 * imagem. `imagens[i]` é a `data:` URL da foto `i`, já baixada.
 */
export function montarConteudo(p: PedidoEvolucao, imagens: string[]): ParteConteudo[] {
  const contexto = [
    `Aluno: ${p.nome || 'sem nome'}${p.sexo ? ` (${p.sexo})` : ''}.`,
    ...(p.objetivo ? [`Objetivo na ficha: ${p.objetivo}.`] : []),
    `${p.fotos.length} fotos, da mais antiga para a mais nova:`,
    ...p.fotos.map(rotuloDaFoto),
  ].join('\n');
  return [
    { type: 'input_text', text: contexto },
    ...p.fotos.flatMap((f, i): ParteConteudo[] => [
      { type: 'input_text', text: rotuloDaFoto(f, i) },
      // 'high': a diferença de um mês na cintura é detalhe, e o 'low' (512 px) o apaga.
      { type: 'input_image', image_url: imagens[i], detail: 'high' },
    ]),
  ];
}

export type NivelQualidade = 'boa' | 'parcial' | 'ruim';

export interface RelatorioEvolucao {
  qualidade: { nivel: NivelQualidade; avisos: string[] };
  evolucao: string[];
  atencao: string[];
  feedback: string;
}

const MAX_ITENS = 8;
const MAX_FRASE = 400;
const MAX_FEEDBACK = 1500;

const frases = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => texto(x, MAX_FRASE))
    .filter(Boolean)
    .slice(0, MAX_ITENS);

/**
 * A resposta da OpenAI como relatório, ou `null` quando não há relatório: JSON
 * quebrado, recusa do modelo (vem sem `text`) ou tudo vazio. Lista longa é
 * cortada e frase gigante é aparada — o resto do relatório não se perde por isso.
 */
export function extrairRelatorio(bruto: unknown): RelatorioEvolucao | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const json = lerJson(textoDaResposta(bruto as Record<string, unknown>));
  if (!json || typeof json !== 'object') return null;
  const d = json as Record<string, unknown>;
  const q = (d.qualidade && typeof d.qualidade === 'object' ? d.qualidade : {}) as Record<string, unknown>;
  const nivel: NivelQualidade = q.nivel === 'boa' || q.nivel === 'ruim' ? q.nivel : 'parcial';
  const feedback = typeof d.feedback === 'string' ? d.feedback.trim().slice(0, MAX_FEEDBACK) : '';
  const r: RelatorioEvolucao = {
    qualidade: { nivel, avisos: frases(q.avisos) },
    evolucao: frases(d.evolucao),
    atencao: frases(d.atencao),
    feedback,
  };
  const vazio = !r.evolucao.length && !r.atencao.length && !r.feedback && !r.qualidade.avisos.length;
  return vazio ? null : r;
}
