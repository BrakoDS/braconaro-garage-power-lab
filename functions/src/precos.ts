/**
 * LEITURA DE PREÇO da página social do afiliado no Mercado Livre — parte pura.
 *
 * Sem rede, sem Firestore, sem firebase-functions: recebe o HTML já baixado e
 * devolve o preço, ou o motivo de ter recusado. É o único lugar que sabe o
 * formato do payload do ML — e também quais hosts são do ML —, e por isso é o
 * único que precisa de teste pesado.
 *
 * A regra que sustenta tudo: o preço só vale se o título do primeiro card do
 * payload corresponder ao `og:title` da página. Cada link de afiliado abre a
 * vitrine inteira do coach, mas com o produto DAQUELE link em primeiro lugar —
 * medido em 5 de 5 links reais em 25/08/2026. Se o ML mudar essa ordem, ou mudar
 * o formato, o título deixa de casar e a leitura é recusada em vez de devolver o
 * preço de outro produto.
 */

/**
 * Por que `prazo` é separado de `http`: a gestão mostra o motivo ao coach para
 * explicar o que aconteceu com o produto. Chamar de `http` um produto que o
 * prazo da rodada nem chegou a buscar acusaria a loja de estar fora do ar
 * quando o gargalo é nosso — e mandaria o coach investigar o link errado.
 */
export type MotivoFalha = 'http' | 'prazo' | 'sem-og' | 'sem-card' | 'titulo-nao-bate' | 'sem-preco';

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

/**
 * Domínios que o robô sabe ler.
 *
 * `extrairPreco` só entende o payload do Mercado Livre, mas o catálogo é
 * multi-loja de propósito (a gestão aceita Amazon, Shopee, Netshoes, Centauro,
 * Growth, Integralmédica e qualquer host). Um produto de outra loja não é
 * assunto do robô: fica fora do total, fora da conta da trava e sem entrada no
 * feed — e a vitrine segue mostrando o preço que o coach digitou, que é o
 * comportamento certo para uma loja que não sabemos ler. Se entrasse na conta,
 * 8 produtos da Amazon entre 22 travariam a rodada todo dia e descartariam os
 * 14 preços do ML lidos com sucesso.
 */
const DOMINIOS_ML = ['meli.la', 'mercadolivre.com.br', 'mercadolibre.com', 'mercadolivre.com'];

/**
 * Diz se a URL é um link do Mercado Livre que vale a pena buscar.
 *
 * Mora aqui, junto do resto do conhecimento sobre o ML, porque é pura — e
 * porque assim o `checar` consegue exercitá-la sem subir nada do firebase.
 *
 * O casamento é por sufixo de DOMÍNIO, não por substring: `meli.la.exemplo.com`
 * contém "meli.la" e ainda assim é de outra pessoa. E só `https:` passa, o que
 * de quebra dá ao `fetch` (que segue redirect) a restrição de esquema e host que
 * ele não tinha.
 */
export function ehLinkMercadoLivre(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }
  if (alvo.protocol !== 'https:') return false;
  // O ponto final do FQDN (`meli.la.`) é host válido e passaria batido no
  // casamento por sufixo; normalizar fecha esse desvio.
  const host = alvo.hostname.toLowerCase().replace(/\.$/, '');
  return DOMINIOS_ML.some((d) => host === d || host.endsWith(`.${d}`));
}

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

  // O preço é procurado só dentro do card que casou, não no resto do documento:
  // se o card certo não tiver bloco de preço, um card SEGUINTE não pode suprir
  // o valor — furaria a garantia de que o preço é sempre daquele produto.
  const inicioCard = card.index ?? 0;
  const marcadorTitulo = '"type":"title","id":"title"';
  const proximoCard = texto.indexOf(marcadorTitulo, inicioCard + marcadorTitulo.length);
  const trechoCard = texto.slice(inicioCard, proximoCard === -1 ? texto.length : proximoCard);
  const p = trechoCard.match(/"current_price":\{"value":([0-9.]+)/);
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
  // Cópia rasa: a função não muta `anteriores`, mas devolver a mesma referência
  // exporia o objeto original a quem consumir o retorno.
  if (travou) return { rodada: { total, lidos, falhas, travou: true }, itens: { ...anteriores } };

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
