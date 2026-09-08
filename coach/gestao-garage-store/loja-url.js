// @ts-check
/**
 * AJUDANTES DE LINK da Garage Store.
 *
 * O que este módulo NÃO faz: buscar nome, preço e foto sozinho. Foi testado e não
 * dá, de site estático:
 *   - `api.mercadolibre.com/items/{ID}` responde 403 (exige OAuth desde 2024);
 *   - a página do produto responde 200 mas entrega o muro "suspicious-traffic",
 *     sem og:title/og:image, mesmo com User-Agent de navegador.
 * Sem servidor próprio não há como contornar. Então o preenchimento é manual, e o
 * que dá para automatizar de verdade é o resto: reconhecer a loja, extrair o código
 * do produto, limpar rastreadores e validar o que foi colado.
 *
 * Se um dia entrar uma Cloud Function de metadados, ela deve preencher
 * `buscarMetadados()` abaixo — o formulário já chama essa função e mais nada muda.
 */

/** Lojas reconhecidas por domínio. A ordem importa: o primeiro que casar vence. */
const LOJAS = [
  { id: 'mercadolivre', nome: 'Mercado Livre', dominios: ['mercadolivre.com', 'mercadolibre.com', 'mlstatic.com'] },
  { id: 'amazon', nome: 'Amazon', dominios: ['amazon.com', 'amzn.to'] },
  { id: 'shopee', nome: 'Shopee', dominios: ['shopee.com'] },
  { id: 'netshoes', nome: 'Netshoes', dominios: ['netshoes.com'] },
  { id: 'centauro', nome: 'Centauro', dominios: ['centauro.com'] },
  { id: 'growth', nome: 'Growth Supplements', dominios: ['gsuplementos.com'] },
  { id: 'integral', nome: 'Integralmédica', dominios: ['integralmedica.com'] },
];

/** Parâmetros de rastreamento que só sujam o link — o de afiliado NUNCA entra aqui. */
const LIXO_QUERY = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'gad_source', 'pd_rd_w', 'pd_rd_r', 'pd_rd_wg', 'psc',
  'th', 'ref_', 'content-id', 'pf_rd_p', 'pf_rd_r',
];

/**
 * Lê uma URL colada e devolve o que dá para saber dela.
 * @param {string} entrada
 * @returns {{ok: boolean, erro?: string, url?: string, loja?: string, lojaId?: string, codigo?: string|null}}
 */
export function analisarUrl(entrada) {
  const bruto = String(entrada || '').trim();
  if (!bruto) return { ok: false, erro: 'Cole o link do produto.' };

  let u;
  try {
    // aceita "produto.mercadolivre.com.br/..." sem esquema
    u = new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return { ok: false, erro: 'Isso não parece um endereço válido.' };
  }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, erro: 'O link precisa começar com http:// ou https://' };
  if (!u.hostname.includes('.')) return { ok: false, erro: 'Isso não parece um endereço válido.' };

  const host = u.hostname.toLowerCase();
  const loja = LOJAS.find((l) => l.dominios.some((d) => host.includes(d)));

  // Limpa só o rastreamento genérico. Um link de afiliado carrega o código do coach
  // em parâmetros próprios (matt_word, tag, ref…), e mexer neles quebraria a comissão.
  for (const p of LIXO_QUERY) u.searchParams.delete(p);

  return {
    ok: true,
    url: u.toString(),
    loja: loja ? loja.nome : u.hostname.replace(/^www\./, ''),
    lojaId: loja ? loja.id : 'outra',
    codigo: extrairCodigo(u, loja?.id),
  };
}

/** Código do produto na loja (MLB… no Mercado Livre, ASIN na Amazon). @returns {string|null} */
function extrairCodigo(u, lojaId) {
  const alvo = `${u.pathname}${u.search}`;
  if (lojaId === 'mercadolivre') {
    const m = alvo.match(/MLB-?(\d{6,})/i);
    return m ? `MLB${m[1]}` : null;
  }
  if (lojaId === 'amazon') {
    const m = alvo.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : null;
  }
  return null;
}

/** Normaliza preço digitado ("89,90", "R$ 89,90", "89.90") para número. @returns {number|null} */
export function lerPreco(txt) {
  const s = String(txt ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  // "1.234,56" (pt-BR) → tira o ponto de milhar e troca a vírgula por ponto
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Preço em reais para exibição. @param {number|null} n */
export const formatarPreco = (n) =>
  (typeof n === 'number' && Number.isFinite(n))
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '';

/**
 * Ponto único de automação. Hoje só devolve o que a URL entrega, sem rede — ver o
 * cabeçalho do arquivo. Quem chama já trata o retorno como assíncrono e parcial,
 * então trocar isto por uma chamada real depois não mexe no formulário.
 * @param {string} url
 * @returns {Promise<{nome?: string, preco?: number, imagem?: string, fonte: string}>}
 */
export async function buscarMetadados(url) {
  const info = analisarUrl(url);
  return { fonte: info.ok ? info.loja : 'desconhecida' };
}
