/**
 * Fixture da página social do afiliado no Mercado Livre.
 *
 * Extraído da captura real de 25/08/2026 (meli.la/2ad5yzh → 200, 358 KB). Mantém
 * só o que o parser lê: as metatags, o primeiro card (título + preço, que é o
 * produto do link) e um segundo card, para provar que a extração pega o PRIMEIRO
 * e não qualquer um. Valores congelados de propósito — se o preço real mudar, o
 * teste não pode mudar junto.
 */
export const HTML_SOCIAL = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Creatina Monohidratada 300g Pó" />
<meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_920350-MLA113966831509_062026-O.webp" />
<meta property="og:type" content="website" />
</head><body>
<script>window.__NAVIGATION_PRELOADED_STATE__={"cards":[
{"components":[
{"type":"title","id":"title","title":{"text":"Creatina Monohidratada 300g Pó","long_title":"x"}},
{"type":"price","id":"price","column":1,"price":{"previous_price":{"value":99.5,"currency":"BRL"},"current_price":{"value":48.99,"currency":"BRL"},"discount_label":{"text":"50% OFF"}}},
{"type":"shipping","id":"shipping","shipping":{"text":"Frete grátis"}}]},
{"components":[
{"type":"title","id":"title","title":{"text":"Whey Protein 1kg Max Titanium Baunilha"}},
{"type":"price","id":"price","column":1,"price":{"current_price":{"value":129.9,"currency":"BRL"}}}]}
]}</script>
</body></html>`;
