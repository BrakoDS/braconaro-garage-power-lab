/**
 * PRÉ-PARSER DA LOUSA — ler o treino sem gastar OpenAI.
 *
 * A maior parte das lousas do box é texto regular: um cabeçalho de bloco, e
 * abaixo linhas no formato "Nome 4x8 100kg · RIR 2". Isso é gramática, não
 * interpretação — e pagar um modelo de visão para reconhecer "4x8" é pagar caro
 * por uma expressão regular.
 *
 * ── A REGRA QUE GOVERNA ESTE ARQUIVO ─────────────────────────────────────────
 * Na dúvida, RECUSAR. Uma leitura local errada é muito pior que uma chamada à
 * IA: a chamada custa centavos e alguns segundos, enquanto o treino errado vai
 * para a ficha de oito alunos sem ninguém desconfiar — o coach confere a prévia
 * comparando com o que ELE escreveu, e um "3x8" lido como "3 séries, 8 kg" passa
 * despercebido porque tem cara de certo.
 *
 * Por isso toda função aqui devolve `null`/`recusa` ao menor sinal de dúvida, e
 * cada recusa diz POR QUÊ — a razão vai para o log e é o que mostra, depois de
 * um mês, qual formato de lousa vale a pena passar a entender.
 *
 * ── O QUE ESTE MÓDULO NUNCA VAI SABER ────────────────────────────────────────
 * O DESENHO. O coach rabisca uma seta, circula uma estação, escreve "8 alunos"
 * à mão — nada disso chega aqui, porque aqui só entra texto. Quem chama é
 * responsável por não usar o caminho rápido quando existe imagem; o pré-parser
 * não tem como saber que ela existe, e é essa a falha mais fácil de cometer
 * nesta feature.
 */

import { BLOCOS, MUSCULOS_LABEL, SISTEMAS, type Sistema } from './lousa.js';

/** Um bloco A/B/C/D. */
export type BlocoId = (typeof BLOCOS)[number]['id'];
const BLOCO_IDS: string[] = BLOCOS.map((b) => b.id);

/** Teto de linhas processadas — lousa maior que isso vai para a IA inteira. */
export const MAX_LINHAS = 80;

export type LinhaExercicio = {
  bloco: BlocoId;
  nome: string;
  series: number;
  reps: string;
  cargaKg: number | null;
  observacao: string;
};

export type ResultadoPreParse =
  | { ok: true; sistema: Sistema; titulo: string; linhas: LinhaExercicio[] }
  | { ok: false; motivo: string };

/** Minúsculas, sem acento — a mesma forma de `lousa.ts` e `taxonomia.ts`. */
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
 * Tira as marcas de cor (`[[vermelho]]…[[/vermelho]]`) sem tirar o texto.
 *
 * A cor é dado para a IA, que não tem outra pista de que "RIR 2" é observação.
 * Aqui a pista é melhor: a POSIÇÃO. "RIR 2" vem depois das repetições, e isso
 * vale mesmo quando o coach esqueceu de trocar de caneta.
 */
export function semMarcasDeCor(texto: string): string {
  return String(texto || '').replace(/\[\[\/?(?:vermelho|azul|preto)\]\]/g, '');
}

/* ------------------------------------------------------------------ *
 * Os números
 * ------------------------------------------------------------------ */

/**
 * "4x15", "3 x 8", "4x8-12", "5X5" ➔ séries e repetições.
 *
 * O `x` é o separador universal da lousa, e o intervalo ("8-12") é repetição,
 * não duas coisas: o coach escreve a faixa quando o aluno escolhe dentro dela.
 *
 * Exige o `x` de propósito. "4 15" poderia ser 4 séries de 15, ou 4 minutos e
 * 15 segundos, ou um peso — e adivinhar aqui é exatamente o erro caro.
 */
export const RE_SERIES_REPS = /(?<![\d,.])(\d{1,2})\s*[xX×]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)(?![\d,.])/;

/** "100kg", "9 kg", "92,5kg", "20KG" ➔ os kg. Aceita vírgula decimal. */
export const RE_CARGA = /(?<![\d,.])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|quilos?)\b/i;

export function extrairSeriesReps(linha: string): { series: number; reps: string } | null {
  const m = RE_SERIES_REPS.exec(linha);
  if (!m) return null;
  const series = Number(m[1]);
  if (!Number.isInteger(series) || series < 1 || series > 20) return null;
  return { series, reps: m[2].replace(/\s*[-–]\s*/, '-') };
}

export function extrairCarga(linha: string): number | null {
  const m = RE_CARGA.exec(linha);
  if (!m) return null;
  const kg = Number(m[1].replace(',', '.'));
  return Number.isFinite(kg) && kg > 0 && kg <= 500 ? kg : null;
}

/* ------------------------------------------------------------------ *
 * A estrutura
 * ------------------------------------------------------------------ */

/** Cabeçalho de bloco: "C — Força", "C - Forca", "Bloco C", "D) Metcon". */
const RE_CABECALHO = /^\s*(?:bloco\s+)?([abcd])\s*(?:[—–\-:)·.]\s*)(.*)$/i;
/** Ou o nome do bloco sozinho: "Mobilidade", "Metcon". */
const NOME_PARA_BLOCO = new Map<string, BlocoId>(
  BLOCOS.map((b) => [normalizar(b.nome), b.id as BlocoId]),
);

export function blocoDaLinha(linha: string): BlocoId | null {
  const m = RE_CABECALHO.exec(linha.trim());
  if (m) {
    const id = m[1].toUpperCase();
    // "C — Força" é cabeçalho; "C 4x8" seria exercício de nome "C", que não
    // existe. Cabeçalho não tem número de série.
    if (BLOCO_IDS.includes(id) && !RE_SERIES_REPS.test(linha)) return id as BlocoId;
  }
  const n = normalizar(linha);
  const porNome = NOME_PARA_BLOCO.get(n);
  return porNome ?? null;
}

/** O sistema, quando a lousa o diz sem ambiguidade. */
export function sistemaDaLinha(linha: string): Sistema | null {
  const n = normalizar(linha).replace(/^sistema\s*:?\s*/, '');
  for (const s of SISTEMAS) if (n === normalizar(s)) return s;
  return null;
}

/**
 * O NOME do exercício: a linha sem os números, sem a observação e sem enfeite.
 *
 * Tirar e não capturar é de propósito. Capturar o nome exigiria uma regex que
 * antecipasse toda ordem possível ("4x15 Wall Ball" e "Wall Ball 4x15"); tirar
 * o que se reconhece e ficar com o resto funciona nas duas e em quantas mais o
 * coach inventar.
 */
export function nomeDaLinha(linha: string): string {
  return linha
    .replace(RE_SERIES_REPS, ' ')
    .replace(RE_CARGA, ' ')
    // O que vem depois de um separador forte é comentário, não nome.
    .split(/[·|]|\s[-–—]\s/)[0]
    .replace(/^[\s•*\->·.]+/, '')
    .replace(/[\s,;:.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** O que sobrou depois do nome e dos números: a observação do coach. */
export function observacaoDaLinha(linha: string): string {
  const partes = linha.split(/[·|]|\s[-–—]\s/).slice(1);
  return partes.join(' · ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * A lousa inteira, ou uma recusa com o motivo.
 *
 * Recusa quando: não há cabeçalho de bloco, o sistema não está escrito, alguma
 * linha não é nem cabeçalho nem exercício reconhecível, ou não sobrou exercício
 * nenhum. Qualquer um desses significa que o texto tem estrutura que a gramática
 * daqui não cobre — e cobrir "quase" é o pior dos mundos.
 */
export function preParse(textoCru: string): ResultadoPreParse {
  const texto = semMarcasDeCor(textoCru || '');
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return { ok: false, motivo: 'lousa sem texto' };
  if (linhas.length > MAX_LINHAS) return { ok: false, motivo: `lousa com ${linhas.length} linhas (teto ${MAX_LINHAS})` };

  let sistema: Sistema | null = null;
  let titulo = '';
  let blocoAtual: BlocoId | null = null;
  const achadas: LinhaExercicio[] = [];

  for (const linha of linhas) {
    const s = sistemaDaLinha(linha);
    if (s) {
      if (sistema && sistema !== s) return { ok: false, motivo: 'a lousa cita mais de um sistema' };
      sistema = s;
      if (!titulo) titulo = linha.trim();
      continue;
    }

    const b = blocoDaLinha(linha);
    if (b) { blocoAtual = b; continue; }

    const sr = extrairSeriesReps(linha);
    if (!sr) {
      // Linha sem série ANTES do primeiro bloco é título — o coach escreve o
      // nome do treino em cima. Depois do primeiro bloco, é estrutura que não
      // entendemos, e aí a IA lê a lousa inteira.
      if (!blocoAtual && !titulo) { titulo = linha.trim().slice(0, 80); continue; }
      return { ok: false, motivo: `linha sem séries/repetições: "${linha.slice(0, 40)}"` };
    }

    if (!blocoAtual) return { ok: false, motivo: 'exercício antes de qualquer bloco (A/B/C/D)' };

    const nome = nomeDaLinha(linha);
    if (!nome || nome.length < 3) return { ok: false, motivo: `exercício sem nome legível: "${linha.slice(0, 40)}"` };

    achadas.push({
      bloco: blocoAtual,
      nome,
      series: sr.series,
      reps: sr.reps,
      cargaKg: extrairCarga(linha),
      observacao: observacaoDaLinha(linha),
    });
  }

  if (!sistema) return { ok: false, motivo: 'o sistema do treino não está escrito na lousa' };
  if (!achadas.length) return { ok: false, motivo: 'nenhum exercício reconhecido' };
  return { ok: true, sistema, titulo: titulo || sistema, linhas: achadas };
}

/** Só para o `checar.ts` conferir que a cópia do vocabulário não divergiu. */
export const ROTULOS_CONHECIDOS: readonly string[] = MUSCULOS_LABEL;

/* ------------------------------------------------------------------ *
 * Montagem: pré-parse + catálogo ➔ o mesmo treino que a IA devolveria
 * ------------------------------------------------------------------ */

/**
 * Monta o `TreinoEstruturado` sem IA.
 *
 * Passa pelas MESMAS funções que a resposta da IA passa (`extrairTreino` via
 * `montarComoIA`), e não por um caminho paralelo: as regras globais do box, o
 * corte de tamanho, a taxonomia e a estimativa de séries valem igual, e um
 * segundo caminho de montagem seria um segundo lugar para as duas leituras
 * divergirem sem ninguém notar.
 *
 * A carga em kg vira OBSERVAÇÃO, e não some: o schema do treino não tem campo de
 * carga — quem calcula carga por aluno é a distribuição, a partir do 1RM da
 * matriz. Jogar "100kg" fora seria perder o que o coach escreveu; inventar um
 * campo faria a lousa competir com a matriz por quem manda na carga.
 */
export function montarComoIA(
  pre: Extract<ResultadoPreParse, { ok: true }>,
  catalogo: Map<string, { nome: string; grupamentos: string[]; implemento: string }>,
  chaveDe: (nome: string) => string,
): Record<string, unknown> {
  const exercicios = pre.linhas.map((l) => {
    const item = catalogo.get(chaveDe(l.nome));
    const carga = l.cargaKg !== null ? `${String(l.cargaKg).replace('.', ',')} kg` : '';
    const observacao = [carga, l.observacao].filter(Boolean).join(' · ').slice(0, 200);
    return {
      nome: item?.nome || l.nome,
      bloco: l.bloco,
      series: l.series,
      reps: l.reps,
      implemento: item?.implemento || '',
      grupamentos: item?.grupamentos || [],
      observacao,
    };
  });
  return { sistema: pre.sistema, titulo: pre.titulo, exercicios, avisos: [] };
}
