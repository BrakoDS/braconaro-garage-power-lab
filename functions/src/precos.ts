/**
 * LEITURA DE PREÇO da página social do afiliado no Mercado Livre — parte pura.
 *
 * Sem rede, sem Firestore, sem firebase-functions: recebe o HTML já baixado e
 * devolve o preço, ou o motivo de ter recusado. É o único lugar que sabe o
 * formato do payload do ML, e por isso é o único que precisa de teste pesado.
 *
 * A regra que sustenta tudo: o preço só vale se o título do primeiro card do
 * payload corresponder ao `og:title` da página. Cada link de afiliado abre a
 * vitrine inteira do coach, mas com o produto DAQUELE link em primeiro lugar —
 * medido em 5 de 5 links reais em 25/08/2026. Se o ML mudar essa ordem, ou mudar
 * o formato, o título deixa de casar e a leitura é recusada em vez de devolver o
 * preço de outro produto.
 */

export type MotivoFalha = 'http' | 'sem-og' | 'sem-card' | 'titulo-nao-bate' | 'sem-preco';

export type Leitura =
  | { ok: true; titulo: string; preco: number }
  | { ok: false; motivo: MotivoFalha };

export type ItemFeed = {
  estado: 'ok' | 'falhou';
  preco: number | null;
  titulo?: string;
  verificadoEm: number | null;
  motivo?: MotivoFalha;
};

export type ResultadoProduto = { id: string; leitura: Leitura };

export type Rodada = { total: number; lidos: number; falhas: number; travou: boolean };

/** Quantos caracteres do og:title precisam bater com o título do card. */
const CHARS_CONFERIDOS = 25;

/** Fração de falhas acima da qual a rodada inteira é descartada. */
const FRACAO_TRAVA = 1 / 3;

export function extrairPreco(html: string): Leitura {
  const texto = String(html || '');

  const og = texto.match(/<meta property="og:title" content="([^"]*)"/);
  const alvo = og ? og[1].trim() : '';
  if (!alvo) return { ok: false, motivo: 'sem-og' };

  const card = texto.match(/"type":"title","id":"title","title":\{"text":"((?:[^"\\]|\\.)*)"/);
  if (!card) return { ok: false, motivo: 'sem-card' };

  let titulo: string;
  try {
    titulo = JSON.parse(`"${card[1]}"`) as string;
  } catch {
    titulo = card[1];
  }

  if (!titulo.startsWith(alvo.slice(0, CHARS_CONFERIDOS))) {
    return { ok: false, motivo: 'titulo-nao-bate' };
  }

  // O preço é procurado a partir do card, não do começo do documento: garante
  // que é o preço DAQUELE card, mesmo que o ML insira um banner com preço antes.
  const depois = texto.slice(card.index ?? 0);
  const p = depois.match(/"current_price":\{"value":([0-9.]+)/);
  const preco = p ? Number(p[1]) : NaN;
  if (!Number.isFinite(preco) || preco <= 0) return { ok: false, motivo: 'sem-preco' };

  return { ok: true, titulo, preco };
}

/**
 * Transforma as leituras da rodada no que deve ser gravado.
 *
 * Falha isolada marca o produto mas preserva o último preço bom e a data dele —
 * a vitrine esconde o produto, e a gestão consegue dizer desde quando. Falha em
 * massa é problema do robô, não dos produtos: devolve `anterior` intocado, então
 * a gravação não muda preço nenhum.
 *
 * @param agora carimbo em ms; injetado para o teste não depender do relógio
 */
export function decidirRodada(
  resultados: ResultadoProduto[],
  anterior: Record<string, ItemFeed>,
  agora: number,
): { rodada: Rodada; itens: Record<string, ItemFeed> } {
  const lista = Array.isArray(resultados) ? resultados : [];
  const anteriores = anterior && typeof anterior === 'object' ? anterior : {};

  const total = lista.length;
  const falhas = lista.filter((r) => !r.leitura.ok).length;
  const lidos = total - falhas;

  // Lista vazia trava: sem produto para ler, gravar itens vazios apagaria o feed.
  const travou = total === 0 || falhas > total * FRACAO_TRAVA;
  if (travou) return { rodada: { total, lidos, falhas, travou: true }, itens: anteriores };

  const itens: Record<string, ItemFeed> = {};
  for (const { id, leitura } of lista) {
    if (leitura.ok) {
      itens[id] = { estado: 'ok', preco: leitura.preco, titulo: leitura.titulo, verificadoEm: agora };
    } else {
      const velho = anteriores[id];
      itens[id] = {
        estado: 'falhou',
        motivo: leitura.motivo,
        preco: velho?.preco ?? null,
        verificadoEm: velho?.verificadoEm ?? null,
      };
    }
  }
  return { rodada: { total, lidos, falhas, travou: false }, itens };
}
