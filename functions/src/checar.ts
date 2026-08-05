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

console.log(
  falhas === 0
    ? '\n✓ A leitura da IA aguenta resposta torta.\n'
    : `\n✗ ${falhas} verificação(ões) falharam.\n`,
);
process.exitCode = falhas === 0 ? 0 : 1;
