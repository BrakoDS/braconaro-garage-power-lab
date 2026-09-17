// @ts-check
/**
 * O TEXTO COLORIDO DA LOUSA — a cor como DADO, não como enfeite.
 *
 * O quadro deixou de ser uma `<textarea>` e virou um `contenteditable`, para o
 * coach poder digitar (que é rápido) e ainda assim marcar com as três canetas do
 * box (que é o que dá significado). A consequência: o texto digitado passa a
 * carregar a mesma informação que o rabisco já carregava — vermelho é
 * intensidade, azul é série, preto é exercício.
 *
 * E se carrega informação, ela tem de CHEGAR À IA. Mandar `innerText` puro
 * jogaria fora exatamente o trabalho que o coach acabou de ter: ele pintaria
 * "RIR 2" de vermelho e o modelo receberia "RIR 2" sem nada. Por isso
 * `paraPrompt()` marca cada trecho com a cor dele, e `instrucoes()` em
 * `functions/src/lousa.ts` ensina o modelo a ler essas marcas.
 *
 * Módulo puro: sem DOM. Quem caminha pelo `contenteditable` é `ui/lousa.js` —
 * aqui só entram e saem listas de `{texto, cor}`.
 *
 * @typedef {'preto'|'vermelho'|'azul'} CorId
 * @typedef {{texto: string, cor: CorId}} Segmento
 */
import { CANETAS, CANETA_POR_ID } from './cores.js';

/** A cor padrão de quem digita sem escolher nada. */
export const COR_PADRAO = /** @type {CorId} */ ('preto');

/** '#D32F2F' → {r:211,g:47,b:47}. Devolve `null` para qualquer coisa que não seja hex de 6 dígitos. */
function hexParaRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 'rgb(211, 47, 47)' ou 'rgba(211,47,47,1)' → {r,g,b}, ou `null`. */
function rgbParaObjeto(css) {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(css || '').trim());
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/** Distância ao quadrado no cubo RGB — basta para escolher entre três cores bem separadas. */
function distancia(a, b) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/**
 * Tolerância para considerar que uma cor É uma das três canetas.
 *
 * Existe porque a cor não volta do navegador como foi escrita. `color: #D32F2F`
 * é lido de volta como `rgb(211, 47, 47)`, e um texto colado de outro lugar pode
 * vir num vermelho PARECIDO mas não idêntico. Casar só o valor exato faria
 * qualquer um desses cair em "preto", e a observação de intensidade do coach
 * chegaria à IA como se fosse nome de exercício.
 *
 * 60 por canal ao quadrado × 3: perto o bastante para absorver variação de
 * tema e de origem, longe o bastante para não confundir o vermelho com o azul
 * (que estão a ~180 de distância em pelo menos um canal).
 */
const TOLERANCIA = 60 * 60 * 3;

/**
 * Qualquer forma de cor CSS → o id da caneta correspondente.
 *
 * Devolve `COR_PADRAO` quando não reconhece — inclusive para vazio, `inherit` e
 * nome de cor. Preto é o padrão certo para o desconhecido: é a cor de
 * "exercício", que é o conteúdo mais comum da lousa.
 *
 * @param {string} css
 * @returns {CorId}
 */
export function normalizarCor(css) {
  const alvo = rgbParaObjeto(css) || hexParaRgb(css);
  if (!alvo) return COR_PADRAO;

  let melhor = COR_PADRAO;
  let menor = Infinity;
  for (const c of CANETAS) {
    const ref = hexParaRgb(c.cor);
    if (!ref) continue;
    const d = distancia(alvo, ref);
    if (d < menor) { menor = d; melhor = /** @type {CorId} */ (c.id); }
  }
  return menor <= TOLERANCIA ? melhor : COR_PADRAO;
}

/** Junta vizinhos de mesma cor num passe só. */
function juntar(segmentos) {
  /** @type {Segmento[]} */
  const out = [];
  for (const s of segmentos) {
    if (!s.texto) continue;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.cor === s.cor) ultimo.texto += s.texto;
    else out.push({ texto: s.texto, cor: s.cor });
  }
  return out;
}

/**
 * Normaliza os trechos para a marcação sair limpa.
 *
 * Três coisas, nesta ordem, e cada uma conserta um problema que apareceu no
 * navegador de verdade:
 *
 *  1. JUNTA VIZINHOS DA MESMA COR. O `contenteditable` fragmenta o texto a cada
 *     tecla — digitar "agachamento" pode render onze nós. Sem juntar, uma
 *     palavra vira onze marcas de cor no prompt.
 *
 *  2. TIRA O ESPAÇO DAS BORDAS de um trecho colorido. O navegador fecha a quebra
 *     de linha DENTRO do span da cor ativa, e o prompt saía com
 *     `[[vermelho]] RIR 2\n[[/vermelho]]` — uma marca atravessando duas linhas,
 *     que o modelo tem de adivinhar onde termina. A marca passa a envolver só o
 *     texto que ela qualifica.
 *
 *  3. NÃO DESCARTA espaço solto. A versão anterior filtrava trecho em branco, e
 *     isso GRUDAVA palavras de cores diferentes: "4x8" em azul, um espaço em
 *     preto e "RIR" em vermelho viravam "4x8RIR". Espaço entre palavras é
 *     conteúdo; o que se descarta é só o trecho de texto vazio.
 *
 * @param {Segmento[]} segmentos
 * @returns {Segmento[]}
 */
export function compactar(segmentos) {
  const limpos = (segmentos || [])
    .map((s) => ({
      texto: String(s?.texto ?? ''),
      cor: /** @type {CorId} */ (CANETA_POR_ID[s?.cor] ? s.cor : COR_PADRAO),
    }))
    .filter((s) => s.texto !== '');

  /** @type {Segmento[]} */
  const semBorda = [];
  for (const s of juntar(limpos)) {
    if (s.cor === COR_PADRAO) { semBorda.push(s); continue; }
    // `[\s\S]*?` no miolo para o ponto casar quebra de linha também.
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.texto);
    const [, antes, miolo, depois] = m || [, '', s.texto, ''];
    if (antes) semBorda.push({ texto: antes, cor: COR_PADRAO });
    if (miolo) semBorda.push({ texto: miolo, cor: s.cor });
    if (depois) semBorda.push({ texto: depois, cor: COR_PADRAO });
  }
  // Juntar de novo: tirar as bordas pode ter posto dois trechos pretos lado a lado.
  return juntar(semBorda);
}

/** O texto sem nenhuma marca — o que se guarda para reabrir a lousa depois. */
export function textoPlano(segmentos) {
  return (segmentos || []).map((s) => s.texto).join('');
}

/**
 * O texto anotado que vai no prompt.
 *
 * Formato `[[vermelho]]…[[/vermelho]]`, com colchetes duplos de propósito: um
 * par simples aparece em treino de verdade ("[3 rounds]"), e o modelo teria de
 * adivinhar quando é marca e quando é o coach escrevendo. Trecho preto sai SEM
 * marca — é a maior parte da lousa, e marcar tudo dobraria o tamanho do prompt
 * para não dizer nada de novo.
 *
 * @param {Segmento[]} segmentos
 * @returns {string}
 */
export function paraPrompt(segmentos) {
  return compactar(segmentos)
    .map((s) => (s.cor === COR_PADRAO ? s.texto : `[[${s.cor}]]${s.texto}[[/${s.cor}]]`))
    .join('');
}

/** O treino tem alguma marcação de cor, ou é tudo preto? */
export function temCor(segmentos) {
  return compactar(segmentos).some((s) => s.cor !== COR_PADRAO);
}

/* ------------------------------------------------------------------ *
 * O caminho de volta: treino estruturado ➔ lousa colorida
 * ------------------------------------------------------------------ */

/**
 * Um treino salvo, de volta no quadro — com as cores nos lugares certos.
 *
 * É o que faz o Calendário poder REABRIR um treino para edição. O ideal é
 * reabrir o texto original que o coach digitou (e é ele que `paraGravar` guarda
 * em `textoOriginal`); esta função é o plano B, para os treinos salvos antes
 * desse campo existir e para os que nasceram só de desenho.
 *
 * A reconstrução respeita a convenção das canetas: bloco e exercício em preto,
 * série e repetição em azul, observação em vermelho. Assim o treino reaberto se
 * parece com o que teria sido escrito à mão — e uma nova leitura dele devolve o
 * mesmo resultado.
 *
 * @param {any} treino
 * @returns {Segmento[]}
 */
export function segmentosDoTreino(treino) {
  /** @type {Segmento[]} */
  const seg = [];
  const preto = (t) => seg.push({ texto: t, cor: 'preto' });
  const azul = (t) => seg.push({ texto: t, cor: 'azul' });
  const vermelho = (t) => seg.push({ texto: t, cor: 'vermelho' });

  for (const [i, b] of (treino?.blocos || []).entries()) {
    if (i) preto('\n');
    preto(`${b.id} — ${b.nome}\n`);
    for (const ex of b.exercicios || []) {
      preto(`  ${ex.nome}`);
      const prescricao = [ex.series ? `${ex.series}x` : '', ex.reps || ''].join('').trim();
      if (prescricao) azul(` · ${prescricao}`);
      if (ex.implemento) preto(` · ${ex.implemento}`);
      if (ex.observacao) vermelho(` · ${ex.observacao}`);
      preto('\n');
    }
  }
  return compactar(seg);
}
