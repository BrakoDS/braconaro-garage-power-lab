/**
 * ESTRATÉGIA DO COACH — o parágrafo que liga a Técnica / Força ao WOD.
 * Lógica pura, sem Firestore e sem rede. Decisão do coach, 06/10/2026.
 *
 * Três frases, cada uma de um dado que o WOD já tem:
 *  1. PONTE: o tipo do bloco (técnica, força, skill) × o formato do WOD —
 *     o movimento-foco sai do bloco 1 e volta no WOD.
 *  2. FADIGA: os músculos do catálogo viram 4 regiões (pernas, ombros, costas
 *     e pegada, core). Se o resto do WOD carrega a MESMA região que o foco, a
 *     frase avisa e diz quem cansa; se não, diz que dá para acelerar.
 *  3. ESTRATÉGIA: o formato × a `chave` do foco (o detalhe técnico que salva o
 *     WOD, fixo por movimento, como a dinâmica). No For Time e no Chipper, com
 *     10 reps ou mais do foco, sugere como quebrar as séries.
 *
 * Cada frase tem duas versões; a escolha sai do hash do WOD (formato, foco e
 * movimentos), não do sorteio: salvar de novo não muda o texto, e semanas com
 * WOD diferente não leem igual. Calculado SEMPRE pelo servidor — no sorteio
 * (`gerarCross`) e a cada gravação (`lerCross`), então acompanha as trocas.
 */
import type { FormatoCross, ItemCatalogo, Musculo, TipoTecnica, WodProgramado } from './modelo-box';
import { hashSeed } from './sorteio';

/** Teto do parágrafo, para caber no celular sem rolar. O checar garante. */
export const MAX_CARACTERES_ESTRATEGIA = 480;

type Regiao = 'pernas' | 'ombros' | 'costas' | 'core';

const REGIAO_DO_MUSCULO: Readonly<Record<Musculo, Regiao>> = {
  quadriceps: 'pernas', gluteo: 'pernas', posterior_coxa: 'pernas', panturrilha: 'pernas',
  ombro: 'ombros', triceps: 'ombros', peito: 'ombros',
  costas: 'costas', trapezio: 'costas', biceps: 'costas', antebraco: 'costas', lombar: 'costas',
  core: 'core',
};

/** As preposições já contraídas: "nas pernas", "às pernas", "das pernas". */
const NOME_REGIAO: Readonly<Record<Regiao, { em: string; a: string; de: string }>> = {
  pernas: { em: 'nas pernas', a: 'às pernas', de: 'das pernas' },
  ombros: { em: 'nos ombros', a: 'aos ombros', de: 'dos ombros' },
  costas: { em: 'nas costas e na pegada', a: 'às costas e à pegada', de: 'das costas e da pegada' },
  core: { em: 'no core', a: 'ao core', de: 'do core' },
};

/** Abaixo disto o foco não ganha sugestão de quebra. */
const REPS_PARA_QUEBRAR = 10;

const NOME_FORMATO: Readonly<Record<FormatoCross, string>> = {
  AMRAP: 'AMRAP', EMOM: 'EMOM', 'For Time': 'For Time', Chipper: 'Chipper',
};

/** "Agachamento com salto (squat jump)" → "agachamento com salto". Mantém sigla ("TRX"). */
export function nomeCurto(nome: string): string {
  const s = nome.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return /^.[A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 12 → '5-4-3': três blocos decrescentes, o primeiro um pouco maior. */
export function quebrarSeries(n: number): string {
  const a = Math.ceil(n / 3) + 1;
  const b = Math.ceil((n - a) / 2);
  return `${a}-${b}-${n - a - b}`;
}

function juntar(lista: readonly string[]): string {
  return lista.length <= 1 ? (lista[0] ?? '') : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
}

/* ───────────────────────────── as frases ───────────────────────────── */

const PONTE: Readonly<Record<TipoTecnica, readonly ((foco: string, formato: string) => string)[]>> = {
  tecnica: [
    (f, w) => `A técnica de ${f} não termina no bloco 1: no ${w}, a meta é manter a mesma qualidade de movimento com o coração acelerado.`,
    (f, w) => `${maiuscula(f)} foi o treino técnico de hoje e volta no ${w} — é hora de repetir o mesmo padrão sob fadiga.`,
  ],
  forca: [
    (f, w) => `A força de ${f} vem antes do WOD, e o movimento volta no ${w}, agora mais leve e mais rápido.`,
    (f, w) => `Primeiro carga, depois velocidade: ${f} sai do bloco de força e volta no ${w} com a carga do WOD.`,
  ],
  skill: [
    (f, w) => `O skill de ${f} é a base do WOD: no ${w}, o padrão estrito do bloco 1 vale mais que a velocidade.`,
    (f, w) => `No ${w}, o padrão de ${f} que você treinou no skill é o que segura as repetições quando o cansaço chegar.`,
  ],
};

const FADIGA = [
  (regioes: Regiao[], culpados: string[], _foco: string) =>
    `O cansaço vai aparecer ${juntar(regioes.map((r) => NOME_REGIAO[r].em))}: ${juntar(culpados)} ${culpados.length > 1 ? 'batem' : 'bate'} nos mesmos músculos que o bloco 1 acabou de trabalhar.`,
  (regioes: Regiao[], culpados: string[], foco: string) =>
    `Atenção ${juntar(regioes.map((r) => NOME_REGIAO[r].a))}: ${juntar(culpados)} ${culpados.length > 1 ? 'voltam' : 'volta'} a carregar o que o bloco de ${foco} já cansou.`,
];

const ALIVIO = [
  (regiao: Regiao) => `O resto do WOD puxa mais ${NOME_REGIAO[regiao].de} do que o bloco 1, então dá para acelerar nos outros movimentos.`,
  (regiao: Regiao) => `Os outros movimentos pegam mais ${NOME_REGIAO[regiao].de}: o que o bloco 1 cansou ganha um respiro — use para manter o ritmo.`,
];

/** `quebra` = '5-4-3' quando o foco tem reps para quebrar; `reps` é o RX dele no WOD. */
interface Plano { foco: string; chave: string; reps: number; quebra: string | null }

const ESTRATEGIA: Readonly<Record<FormatoCross, readonly ((p: Plano) => string)[]>> = {
  AMRAP: [
    (p) => `Para segurar o ritmo até o fim, ${p.chave}.`,
    (p) => `Ritmo constante vence o AMRAP: ${p.chave}.`,
  ],
  EMOM: [
    (p) => `Cada minuto tem pressa, mas não corra o movimento: ${p.chave}. O que sobrar do minuto é descanso.`,
    (p) => `No EMOM a qualidade manda: ${p.chave}, e use o resto do minuto para respirar.`,
  ],
  'For Time': [
    (p) => p.quebra
      ? `Quebre as ${p.reps} reps de ${p.foco} em ${p.quebra} desde a primeira rodada e ${p.chave}.`
      : `Desde a primeira rodada, ${p.chave}.`,
    (p) => p.quebra
      ? `Tenha o plano antes do 3-2-1: ${p.foco} em ${p.quebra}, sem ir à falha — e ${p.chave}.`
      : `Tenha o plano antes do 3-2-1 e, a cada rodada, ${p.chave}.`,
  ],
  Chipper: [
    (p) => p.quebra
      ? `No Chipper, ${p.foco} aparece uma vez só: chegue com fôlego, quebre as ${p.reps} reps em ${p.quebra} e ${p.chave}.`
      : `No Chipper cada movimento aparece uma vez só: comece contido e, quando chegar em ${p.foco}, ${p.chave}.`,
    (p) => `A lista é longa, então comece contido. Quando chegar em ${p.foco}${p.quebra ? ` (${p.quebra})` : ''}, ${p.chave}.`,
  ],
};

/* ───────────────────────────── a montagem ───────────────────────────── */

type Musculos = Pick<ItemCatalogo, 'musculoPrincipal' | 'musculosSecundarios'>;

/** Por região: 2 se é região de músculo principal do movimento, 1 se só de secundário. */
function regioesDo(item: Musculos): Map<Regiao, number> {
  const m = new Map<Regiao, number>();
  for (const x of item.musculosSecundarios) m.set(REGIAO_DO_MUSCULO[x], 1);
  for (const x of item.musculoPrincipal) m.set(REGIAO_DO_MUSCULO[x], 2);
  return m;
}

/**
 * O parágrafo da Estratégia do Coach. `null` quando o WOD não tem foco (a
 * semana não publica mesmo) ou quando um movimento sumiu do catálogo.
 */
export function estrategiaDoWod(
  wod: Pick<WodProgramado, 'formato' | 'movimentos' | 'tecnica'>,
  catalogo: ReadonlyMap<string, ItemCatalogo>,
): string | null {
  const t = wod.tecnica;
  if (!t) return null;
  const foco = catalogo.get(t.exercicioId);
  const movFoco = wod.movimentos.find((m) => m.exercicioId === t.exercicioId);
  if (!foco?.cross?.tecnica || !movFoco) return null;
  const outros = wod.movimentos.filter((m) => m.exercicioId !== t.exercicioId);
  const itens = outros.map((m) => ({ m, item: catalogo.get(m.exercicioId) }));
  if (itens.some((x) => !x.item)) return null;

  const h = hashSeed([wod.formato, t.exercicioId, ...wod.movimentos.map((m) => m.exercicioId)].join('|'));
  const versao = <T>(lista: readonly T[], frase: number) => lista[(h >>> (frase * 4)) % lista.length];
  const nomeFoco = nomeCurto(foco.nome);

  // 1. A ponte.
  const ponte = versao(PONTE[t.tipo], 0)(nomeFoco, NOME_FORMATO[wod.formato]);

  // 2. A fadiga: quanto o resto do WOD carrega cada região.
  const carga = new Map<Regiao, number>();
  const porMovimento = itens.map(({ m, item }) => ({ m, regioes: regioesDo(item!) }));
  for (const { regioes } of porMovimento) for (const [r, n] of regioes) carga.set(r, (carga.get(r) ?? 0) + n);
  const doFoco = regioesDo(foco);
  // Cansada = região principal do foco que outro movimento do WOD também tem como principal.
  const cansadas = [...doFoco].filter(([, n]) => n === 2).map(([r]) => r)
    .filter((r) => porMovimento.some((x) => x.regioes.get(r) === 2))
    .sort((a, b) => carga.get(b)! - carga.get(a)!)
    .slice(0, 2);
  let fadiga: string;
  if (cansadas.length) {
    const peso = (x: (typeof porMovimento)[number]) => cansadas.reduce((s, r) => s + (x.regioes.get(r) ?? 0), 0);
    const culpados = porMovimento.filter((x) => cansadas.some((r) => x.regioes.get(r) === 2))
      .sort((a, b) => peso(b) - peso(a))
      .slice(0, 2)
      .map((x) => nomeCurto(x.m.nome));
    fadiga = versao(FADIGA, 1)(cansadas, culpados, nomeFoco);
  } else {
    // O que o resto do WOD mais carrega FORA do que o foco trabalhou.
    const [maior] = [...carga].filter(([r]) => doFoco.get(r) !== 2).sort((a, b) => b[1] - a[1]);
    fadiga = versao(ALIVIO, 1)(maior?.[0] ?? 'core');
  }

  // 3. A estratégia do formato, com a chave do foco.
  const chave = foco.cross.tecnica.chave
    ?? `capriche no que o bloco 1 treinou: ${foco.cross.tecnica.objetivo.replace(/\.$/, '').toLowerCase()}`;
  const quebra = movFoco.unidade === 'reps' && !movFoco.porLado && movFoco.rx >= REPS_PARA_QUEBRAR
    ? quebrarSeries(movFoco.rx) : null;
  const estrategia = versao(ESTRATEGIA[wod.formato], 2)({ foco: nomeFoco, chave, reps: movFoco.rx, quebra });

  return `${ponte} ${fadiga} ${estrategia}`;
}
