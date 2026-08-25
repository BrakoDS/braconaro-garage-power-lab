/**
 * Confere a leitura da resposta da IA sem gastar chamada de API.
 *
 *     npm run checar
 *
 * Mesmo formato do `checar-rotina.ts` do app: asserções simples, saída legível,
 * código de saída 1 quando algo quebra. Cobre justamente os casos em que o
 * modelo NÃO colabora — que são os que dão tela de erro para o aluno se
 * passarem batido.
 */
import { extrairAnalise, num } from './analise';
import { extrairPreco, decidirRodada, type ItemFeed } from './precos';
import { HTML_SOCIAL } from './fixtures/social-ml';

let falhas = 0;

function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) {
    console.log(`  ✓ ${descricao}`);
  } else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/** Envelope no formato completo da API (output → content → text). */
const envelope = (texto: string) => ({
  output: [{ content: [{ type: 'output_text', text: texto }] }],
});

const BOM = JSON.stringify({
  suggestedCategory: 'almoço',
  items: [
    { name: 'Peito de frango grelhado', quantityGrams: 150, calories: 248, protein: 46, carbs: 0, fat: 5 },
    { name: 'Arroz branco', quantityGrams: 120, calories: 156, protein: 3, carbs: 34, fat: 0.3 },
  ],
});

console.log('\nLEITURA DA RESPOSTA DA IA\n');

const bom = extrairAnalise(envelope(BOM));
ok(bom.items.length === 2, `resposta bem formada devolve os dois itens (${bom.items.length})`);
ok(bom.suggestedCategory === 'almoço', 'e mantém a categoria sugerida');
ok(bom.items[0].calories === 248, 'com os números intactos');

// `output_text` é o atalho que a API oferece; tem que valer igual.
ok(extrairAnalise({ output_text: BOM }).items.length === 2, 'o atalho output_text também é lido');

/* ---------- o modelo não colaborando ---------- */

ok(extrairAnalise(envelope('Claro! Aqui está: ' + BOM)).items.length === 2,
  'texto de conversa antes do JSON não atrapalha');

ok(extrairAnalise(envelope('```json\n' + BOM + '\n```')).items.length === 2,
  'JSON embrulhado em bloco de código é recuperado');

ok(extrairAnalise(envelope('Não consigo analisar esta imagem.')).items.length === 0,
  'resposta em prosa devolve zero itens em vez de quebrar');

ok(extrairAnalise(envelope('{"items": [{"name": "Arroz", ')).items.length === 0,
  'JSON truncado no meio devolve zero itens em vez de quebrar');

/* ---------- itens tortos ---------- */

const misto = extrairAnalise(envelope(JSON.stringify({
  suggestedCategory: 'jantar',
  items: [
    { name: 'Feijão', quantityGrams: 100, calories: 76, protein: 5, carbs: 14, fat: 0.5 },
    { name: '   ', quantityGrams: 50, calories: 100, protein: 1, carbs: 1, fat: 1 },
    { name: 'Ovo', calories: 'setenta', protein: null, carbs: -3, fat: 5 },
    'não é objeto',
  ],
})));
ok(misto.items.length === 2, `item sem nome é descartado, o resto sobrevive (${misto.items.length})`);
ok(misto.items[1].calories === 0, 'calorias em texto viram 0 em vez de NaN');
ok(misto.items[1].carbs === 0, 'macro negativo vira 0');
ok(misto.suggestedCategory === 'jantar', 'a categoria válida é respeitada');

ok(extrairAnalise(envelope(JSON.stringify({ suggestedCategory: 'ceia', items: [] })))
  .suggestedCategory === 'almoço', 'categoria fora da lista cai no padrão');

// Foto sem comida é resultado legítimo, não erro.
ok(extrairAnalise(envelope(JSON.stringify({ suggestedCategory: 'lanche', items: [] })))
  .items.length === 0, 'foto sem comida devolve lista vazia normalmente');

const muitos = extrairAnalise(envelope(JSON.stringify({
  suggestedCategory: 'almoço',
  items: Array.from({ length: 40 }, (_, i) => ({
    name: `Item ${i}`, quantityGrams: 10, calories: 10, protein: 1, carbs: 1, fat: 1,
  })),
})));
ok(muitos.items.length === 15, `lista absurda é cortada em 15 (${muitos.items.length})`);

/* ---------- entradas degeneradas ---------- */

ok(extrairAnalise(null).items.length === 0, 'null não quebra');
ok(extrairAnalise(undefined).items.length === 0, 'undefined não quebra');
ok(extrairAnalise('texto solto').items.length === 0, 'string no lugar do objeto não quebra');
ok(extrairAnalise({}).items.length === 0, 'objeto vazio não quebra');
ok(extrairAnalise({ output: [] }).items.length === 0, 'output vazio não quebra');

ok(num('12,5') === 0, 'vírgula decimal não é aceita como número (a IA manda ponto)');
ok(num('12.5') === 12.5, 'string numérica com ponto é aceita');
ok(num(Infinity) === 0, 'Infinity vira 0');
ok(num(NaN) === 0, 'NaN vira 0');

/* ============================================================
   LEITURA DE PREÇO DA PÁGINA DO MERCADO LIVRE
   ============================================================ */
console.log('\nLEITURA DE PREÇO\n');

const bomPreco = extrairPreco(HTML_SOCIAL);
ok(bomPreco.ok === true, 'a página real é lida');
ok(bomPreco.ok && bomPreco.preco === 48.99, `pega o preço do PRIMEIRO card (${bomPreco.ok ? bomPreco.preco : '—'})`);
ok(bomPreco.ok && bomPreco.titulo === 'Creatina Monohidratada 300g Pó', 'e o título dele');

// O cenário que este projeto inteiro existe para detectar: o ML mudou o layout,
// o card deixou de ser o produto do link, e o preço lido seria de outra coisa.
const trocado = HTML_SOCIAL.replace(
  '{"text":"Creatina Monohidratada 300g Pó","long_title":"x"}',
  '{"text":"Whey Protein 1kg Max Titanium Baunilha"}',
);
const rTrocado = extrairPreco(trocado);
ok(!rTrocado.ok && rTrocado.motivo === 'titulo-nao-bate',
  'card que não corresponde ao og:title é RECUSADO, não lido');

const semOg = extrairPreco(HTML_SOCIAL.replace(/<meta property="og:title"[^>]*>/, ''));
ok(!semOg.ok && semOg.motivo === 'sem-og', 'página sem og:title falha com sem-og');

// `g` porque o fixture tem dois cards; sem ele sobraria o segundo (Whey) e o
// motivo seria titulo-nao-bate, não sem-card — o teste passaria pelo motivo errado.
const semCard = extrairPreco(HTML_SOCIAL.replace(/\{"type":"title"[\s\S]*?\}\},\n/g, ''));
ok(!semCard.ok && semCard.motivo === 'sem-card', 'payload sem card de título falha com sem-card');

const semPreco = extrairPreco(HTML_SOCIAL.replace(/"current_price":\{"value":48\.99/, '"current_price":{"value":0'));
ok(!semPreco.ok && semPreco.motivo === 'sem-preco', 'preço zero é recusado');

// O card certo (título bate com og:title) não tem bloco de preço, mas o card
// SEGUINTE (Whey) tem. Sem delimitar a busca ao card certo, a extração vazaria
// para o preço do Whey e devolveria ok:true com o produto errado.
const semPrecoNoCardCerto = HTML_SOCIAL.replace(
  '{"type":"price","id":"price","column":1,"price":{"previous_price":{"value":99.5,"currency":"BRL"},"current_price":{"value":48.99,"currency":"BRL"},"discount_label":{"text":"50% OFF"}}},',
  '',
);
const rSemPrecoNoCardCerto = extrairPreco(semPrecoNoCardCerto);
ok(!rSemPrecoNoCardCerto.ok && rSemPrecoNoCardCerto.motivo === 'sem-preco',
  'card certo sem preço não pega emprestado o preço do card seguinte');

ok(!extrairPreco('').ok, 'string vazia não quebra');

/* ---------- a trava ---------- */

const leituraOk = (p: number) => ({ ok: true as const, titulo: 'x', preco: p });
const leituraMa = { ok: false as const, motivo: 'http' as const };
const rodadaDe = (nOk: number, nFalha: number) => [
  ...Array.from({ length: nOk }, (_, i) => ({ id: `ok${i}`, leitura: leituraOk(10 + i) })),
  ...Array.from({ length: nFalha }, (_, i) => ({ id: `ma${i}`, leitura: leituraMa })),
];

const passou = decidirRodada(rodadaDe(15, 7), {}, 1000);
ok(passou.rodada.travou === false, '7 falhas em 22 NÃO travam');
ok(passou.rodada.lidos === 15 && passou.rodada.falhas === 7, 'e a contagem bate');

const travou = decidirRodada(rodadaDe(14, 8), {}, 1000);
ok(travou.rodada.travou === true, '8 falhas em 22 travam');

// `zz` de propósito: `rodadaDe` gera ids ok0..okN, e reaproveitar um deles faria
// o produto bom sobrescrever o que falhou no mapa — o teste passaria por engano.
const anterior: Record<string, ItemFeed> = {
  zz: { estado: 'ok', preco: 78.9, titulo: 'Creatina Growth', verificadoEm: 500 },
};
const travadoComAnterior = decidirRodada(rodadaDe(14, 8), anterior, 1000);
ok(travadoComAnterior.itens.zz?.preco === 78.9,
  'rodada travada preserva os itens da rodada anterior intactos');
ok(travadoComAnterior.itens.zz?.verificadoEm === 500,
  'inclusive a data antiga — não carimba de novo o que não leu');
ok(Object.keys(travadoComAnterior.itens).length === 1,
  'e não acrescenta os produtos da rodada travada');

const comFalhaIsolada = decidirRodada(
  [{ id: 'zz', leitura: leituraMa }, ...rodadaDe(10, 0)],
  anterior,
  1000,
);
ok(comFalhaIsolada.rodada.travou === false, '1 falha em 11 não trava');
ok(comFalhaIsolada.itens.zz.estado === 'falhou', 'falha isolada marca o produto');
ok(comFalhaIsolada.itens.zz.preco === 78.9, 'preservando o último preço bom conhecido');
ok(comFalhaIsolada.itens.zz.verificadoEm === 500, 'e a data em que ele foi lido');
ok(comFalhaIsolada.itens.zz.motivo === 'http', 'e o motivo, para a gestão poder explicar');

ok(decidirRodada([], {}, 1000).rodada.travou === true,
  'lista vazia trava em vez de apagar o feed');

console.log(
  falhas === 0
    ? '\n✓ A leitura da IA e a de preço aguentam entrada torta.\n'
    : `\n✗ ${falhas} verificação(ões) falharam.\n`,
);
process.exitCode = falhas === 0 ? 0 : 1;
