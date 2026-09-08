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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { extrairAnalise, num } from './analise';
import { extrairPreco, decidirRodada, ehLinkMercadoLivre, type ItemFeed } from './precos';
import { HTML_SOCIAL } from './fixtures/social-ml';
import { extrairProposta, montarSchema, type Equip, type PropostaExercicio, type PropostaTecnica } from './pesquisa';
import {
  BOA_EXERCICIO, BOA_TECNICA, SEM_PADRAO, PADRAO_INVENTADO, MUSCULO_INVENTADO,
  EQUIP_FORA_DO_INVENTARIO, JSON_QUEBRADO, VAZIA, MALICIOSA,
} from './fixtures/pesquisa';

let falhas = 0;

function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) {
    console.log(`  ✓ ${descricao}`);
  } else {
    falhas++;
    console.log(`  ✗ ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/** `true` quando a função lança qualquer erro — usado para os casos de recusa. */
function lanca(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
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

/* ---------- de quem o robô aceita buscar ----------

   `ehLinkMercadoLivre` é a ÚNICA restrição de esquema e host que o `fetch` com
   `redirect: 'follow'` tem: o que passar daqui o robô busca, com User-Agent de
   navegador, a partir do IP de saída da função. Os casos hostis abaixo existem
   para que trocar o casamento de sufixo de domínio por um `includes()` — a
   "simplificação" óbvia para quem passar por aqui depois — quebre o `checar`
   em vez de passar despercebida. */

ok(ehLinkMercadoLivre('https://meli.la/2ad5yzh'),
  'o encurtador que o coach cola da vitrine do ML é buscado');
ok(ehLinkMercadoLivre('https://www.mercadolivre.com.br/p/MLB123'),
  'link longo do mercadolivre.com.br é buscado');
ok(ehLinkMercadoLivre('https://produto.mercadolibre.com/x'),
  'subdomínio de domínio conhecido é buscado, e não só o domínio nu');

ok(!ehLinkMercadoLivre('https://meli.la.exemplo.com/x'),
  'host de terceiro que CONTÉM o domínio do ML não recebe visita do robô');
ok(!ehLinkMercadoLivre('https://evilmeli.la/x'),
  'host que TERMINA em domínio do ML sem o ponto separador não recebe visita');
ok(!ehLinkMercadoLivre('https://meli.la@evil.com/x'),
  'ML escrito como userinfo não faz o robô buscar em evil.com');
ok(!ehLinkMercadoLivre('https://www.amazon.com.br/dp/B0ABC'),
  'produto de outra loja é ignorado em vez de virar falha na conta da trava');
ok(!ehLinkMercadoLivre('http://meli.la/x'),
  'link sem TLS é recusado, para o redirect não sair em claro');
ok(!ehLinkMercadoLivre('não-é-url'),
  'texto que não é URL é recusado sem quebrar a rodada');

/* ---------- a trava ---------- */

const leituraOk = (p: number) => ({ ok: true as const, titulo: 'x', preco: p });
const leituraMa = { ok: false as const, motivo: 'http' as const };
const rodadaDe = (nOk: number, nFalha: number) => [
  ...Array.from({ length: nOk }, (_, i) => ({ id: `ok${i}`, url: `https://meli.la/ok${i}`, leitura: leituraOk(10 + i) })),
  ...Array.from({ length: nFalha }, (_, i) => ({ id: `ma${i}`, url: `https://meli.la/ma${i}`, leitura: leituraMa })),
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
  [{ id: 'zz', url: 'https://meli.la/zz', leitura: leituraMa }, ...rodadaDe(10, 0)],
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

/* ---------- a URL viaja junto com o preço ---------- */

// Sem a URL gravada, o preço lido de um link continuaria valendo depois que o
// coach reaponta a ficha para OUTRO produto (o `id` sobrevive à edição), e a
// vitrine carimbaria "verificado hoje" no preço do produto antigo.
const comUrl = decidirRodada(
  [{ id: 'pp', url: 'https://meli.la/dux', leitura: leituraOk(39.09) }],
  {},
  1000,
);
ok(comUrl.itens.pp?.url === 'https://meli.la/dux',
  'item lido guarda a URL de onde o preço veio');

const falhouComUrl = decidirRodada(
  [
    { id: 'zz', url: 'https://meli.la/tentada', leitura: leituraMa },
    ...rodadaDe(10, 0),
  ],
  anterior,
  1000,
);
// A URL do item que falhou é a que ESTA rodada tentou, não a do preço velho
// preservado: é ela que diz a qual link a falha se refere. Se o coach reapontar
// a ficha depois, a URL deixa de bater e a vitrine para de esconder o produto —
// o link novo nunca foi tentado, não há falha que justifique tirá-lo do ar.
ok(falhouComUrl.itens.zz?.url === 'https://meli.la/tentada',
  'item que falhou guarda a URL que a rodada tentou ler');

/* ============================================================
   PESQUISA DE EXERCÍCIO / MOBILIDADE / TÉCNICA
   ============================================================ */
console.log('\nPESQUISA DE EXERCÍCIO E TÉCNICA\n');

const EQUIP: Equip[] = [{ id: 'barra', nome: 'Barra' }, { id: 'caixote', nome: 'Caixote 30cm' }];

/* ---------- exercício bem formado ---------- */

const boa = extrairProposta(BOA_EXERCICIO, 'exercicio', EQUIP) as PropostaExercicio;
ok(boa.tipo === 'exercicio', 'reconhece o tipo exercício');
ok(boa.padrao === 'quadriceps', 'lê o padrão');
ok(boa.nome === 'Agachamento búlgaro com halteres', 'lê o nome');
ok(boa.musculos.join() === 'Quadríceps,Glúteo', 'lê os músculos válidos');
ok(boa.equipamentoIds.join() === 'barra', 'mantém só o equipamento que está no inventário do box');
ok(boa.equipamentoFaltante.join() === 'Banco búlgaro', 'equipamento que falta vai em texto livre, não em id');
ok(boa.fontes.join() === 'https://exemplo.com/agachamento-bulgaro', 'guarda a fonte http');

/* ---------- técnica bem formada ---------- */

const boaTecnica = extrairProposta(BOA_TECNICA, 'tecnica', EQUIP) as PropostaTecnica;
ok(boaTecnica.tipo === 'tecnica', 'reconhece o tipo técnica');
ok(boaTecnica.nome === 'Myo-reps', 'lê o nome da técnica');
ok(boaTecnica.comoExecutar.startsWith('1. Faça uma série de ativação'),
  'comoExecutar preserva os passos numerados');
ok(boaTecnica.comoExecutar.split('\n').length === 5, 'um passo por linha, como em coach/academia/data/seed.js');

/* ---------- padrão de movimento é a única coisa que derruba a proposta ---------- */

ok(lanca(() => extrairProposta(SEM_PADRAO, 'exercicio', EQUIP)),
  'exercício sem padrão é recusado — sem isso o montador descartaria em silêncio');
ok(lanca(() => extrairProposta(PADRAO_INVENTADO, 'exercicio', EQUIP)),
  'padrão fora do vocabulário fechado é recusado igual à ausência dele');

try {
  extrairProposta(SEM_PADRAO, 'exercicio', EQUIP);
  ok(false, 'deveria ter lançado');
} catch (e) {
  ok(String(e instanceof Error ? e.message : e).includes('/academia'),
    'a mensagem manda cadastrar em /academia, o caminho manual que ainda funciona');
}

/* ---------- vocabulário fechado: descarta o item torto, não a proposta ---------- */

const musculoTorto = extrairProposta(MUSCULO_INVENTADO, 'exercicio', EQUIP) as PropostaExercicio;
ok(musculoTorto.musculos.join() === 'Costas',
  'músculo fora do vocabulário some, o válido sobrevive');
ok(musculoTorto.tags.join() === 'MUSCULAÇÃO',
  'tag fora do vocabulário (aqui, uma modalidade inventada) some, a válida sobrevive');

ok((extrairProposta(EQUIP_FORA_DO_INVENTARIO, 'exercicio', EQUIP) as PropostaExercicio).equipamentoIds.length === 0,
  'equipamento que o box não tem é descartado, nunca aceito');

/* ---------- inventário vazio: nunca aceita nenhum id ---------- */

ok((extrairProposta(EQUIP_FORA_DO_INVENTARIO, 'exercicio', []) as PropostaExercicio).equipamentoIds.length === 0,
  'sem inventário nenhum, equipamentoIds vem sempre vazio');

/* ---------- números fora da faixa caem no padrão do contexto ---------- */

/** Envelope cru, igual ao das fixtures — usado aqui para variar um campo de cada vez sem tocar no JSON já serializado. */
const envelopeTeste = (dados: object) => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(dados) }] }] });

const EXERCICIO_BASE = {
  tipo: 'exercicio', nome: 'Exercício de teste', padrao: 'quadriceps',
  musculos: [] as string[], tags: [] as string[], equipamentoIds: [] as string[],
  nivel: 'intermediario', tempoMedioSeg: 35, obs: '', equipamentoFaltante: [] as string[], fontes: [] as string[],
};

const semTempo = extrairProposta(
  envelopeTeste({ ...EXERCICIO_BASE, tempoMedioSeg: 9999 }), 'exercicio', EQUIP,
) as PropostaExercicio;
ok(semTempo.tempoMedioSeg === 35, 'tempoMedioSeg fora de 5..600 cai no padrão do exercício (35)');

const mobilidadeSemTempo = extrairProposta(
  envelopeTeste({ ...EXERCICIO_BASE, tempoMedioSeg: 'muito' as unknown as number }), 'mobilidade', EQUIP,
) as PropostaExercicio;
ok(mobilidadeSemTempo.tempoMedioSeg === 40, 'tempoMedioSeg não numérico cai no padrão da mobilidade (40)');

/* ---------- nome vazio, JSON quebrado, resposta vazia ---------- */

ok(lanca(() => extrairProposta(envelopeTeste({ ...EXERCICIO_BASE, nome: '' }), 'exercicio', EQUIP)),
  'nome vazio é recusado');

ok(lanca(() => extrairProposta(JSON_QUEBRADO, 'exercicio', EQUIP)), 'JSON quebrado é recusado');
ok(lanca(() => extrairProposta(VAZIA, 'exercicio', EQUIP)), 'resposta vazia é recusada');

/* ---------- a resposta da IA é dado, nunca instrução ---------- */

ok(extrairProposta(MALICIOSA, 'exercicio', EQUIP).nome.includes('<script>'),
  'o módulo NÃO escapa — quem escapa é a tela; aqui só provamos que não executa nada');
ok((extrairProposta(MALICIOSA, 'exercicio', EQUIP) as PropostaExercicio).obs.includes('onload=alert'),
  'obs malicioso também chega intacto, sem quebrar a leitura');

/* ---------- o schema que vai para a OpenAI ---------- */

const schemaExercicio = montarSchema('exercicio', EQUIP) as any;
ok(schemaExercicio.additionalProperties === false, 'schema de exercício não aceita campo extra');
ok(schemaExercicio.properties.equipamentoIds.items.enum.join() === 'barra,caixote',
  'o enum de equipamento é exatamente o inventário enviado');
ok(mesmoConjunto(Object.keys(schemaExercicio.properties), schemaExercicio.required),
  'required do schema de exercício é EXATAMENTE properties (strict mode recusa campo fantasma nos dois sentidos)');

const schemaSemInventario = montarSchema('exercicio', []) as any;
ok(!('enum' in schemaSemInventario.properties.equipamentoIds.items),
  'inventário vazio não gera enum impossível de satisfazer');

const schemaTecnica = montarSchema('tecnica', EQUIP) as any;
ok(schemaTecnica.properties.tipo.enum.join() === 'tecnica', 'schema de técnica trava o tipo em "tecnica"');
ok(mesmoConjunto(Object.keys(schemaTecnica.properties), schemaTecnica.required),
  'required do schema de técnica é EXATAMENTE properties');

/* ============================================================
   VOCABULÁRIOS DE pesquisa.ts CONTRA A FONTE REAL NO SITE
   ============================================================
   `pesquisa.ts` explica no cabeçalho por que PADROES/MUSCULOS_LABEL/TAGS/NIVEIS
   são CÓPIAS à mão (functions/ é um pacote à parte, sem import para os .js do
   site) — e avisa que, se a fonte mudar e a cópia não acompanhar, a pesquisa
   passa a recusar ou descartar coisa válida EM SILÊNCIO.
   `npm run checar` roda local, com o repositório inteiro em disco — então dá
   para ler os .js do site de verdade e comparar, sem criar dependência de
   runtime nenhuma (a function em produção continua com as constantes
   embutidas) e sem passo de build novo. O que seguirmos abaixo é sempre uma
   CONSTANTE LITERAL (array de string ou objeto de string→string) num arquivo
   .js do site — nunca o typedef de um JSDoc, que não é código executável e não
   dá para extrair com confiança. Por isso NIVEIS vem de `coach/montador-de-treino/core/niveis.js`
   (o array de verdade que os módulos do motor importam), não do comentário em
   `montador/data/exercicios.js:35` — aquele é só a anotação de tipo do campo,
   nunca a fonte que alguém precisaria lembrar de atualizar. */
console.log('\nVOCABULÁRIOS: A CÓPIA EM pesquisa.ts BATE COM A FONTE DO SITE?\n');

/** Da pasta compilada (`functions/lib/`) para a raiz do repo, onde moram `montador/` e `academia/`. */
const RAIZ_SITE = join(__dirname, '..', '..');

/** Lê um .js do site e devolve a AST — o parser real da TypeScript, não regex. */
function parseSite(caminhoRelativo: string): ts.SourceFile {
  const caminho = join(RAIZ_SITE, caminhoRelativo);
  const texto = readFileSync(caminho, 'utf8');
  return ts.createSourceFile(caminho, texto, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
}

/**
 * Acha `export const <nome> = <inicializador>` no arquivo. Lança se não achar —
 * a constante mudou de nome, de arquivo, ou deixou de ser um `const` de topo, e
 * é exatamente esse tipo de mudança estrutural que não pode passar em silêncio.
 */
function acharConst(sf: ts.SourceFile, nome: string): ts.Expression {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === nome && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  throw new Error(`"${nome}" não foi encontrado em ${sf.fileName} — a extração precisa ser atualizada.`);
}

/** Array literal só de strings → string[]. Lança diante de qualquer elemento que não seja literal simples. */
function comoArrayDeString(no: ts.Expression, origem: string): string[] {
  if (!ts.isArrayLiteralExpression(no)) throw new Error(`esperava um array literal em ${origem}.`);
  return no.elements.map((el) => {
    if (!ts.isStringLiteral(el)) throw new Error(`elemento não é uma string literal simples em ${origem}.`);
    return el.text;
  });
}

/** Objeto literal `{ chave: 'valor' }` → mapa chave→valor. Mesma exigência de literal simples. */
function comoMapaDeString(no: ts.Expression, origem: string): Record<string, string> {
  if (!ts.isObjectLiteralExpression(no)) throw new Error(`esperava um objeto literal em ${origem}.`);
  const mapa: Record<string, string> = {};
  for (const prop of no.properties) {
    if (!ts.isPropertyAssignment(prop)) throw new Error(`propriedade não é um par chave/valor simples em ${origem}.`);
    const chave = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (chave === null || !ts.isStringLiteral(prop.initializer)) {
      throw new Error(`chave ou valor não é uma string literal simples em ${origem}.`);
    }
    mapa[chave] = prop.initializer.text;
  }
  return mapa;
}

/** Mesmo conjunto de valores, ignorando ordem — a cópia não precisa preservar a ordem da fonte. */
function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ordenadoA = [...a].sort();
  const ordenadoB = [...b].sort();
  return ordenadoA.every((v, i) => v === ordenadoB[i]);
}

/** Compara uma cópia de pesquisa.ts com sua fonte no site; extração que falha vira falha do check, não exceção solta. */
function checarVocabulario(nome: string, extrairFonte: () => string[], copia: string[]): void {
  try {
    const fonte = extrairFonte();
    ok(
      mesmoConjunto(fonte, copia),
      `${nome}: pesquisa.ts bate com a fonte no site`,
      `fonte=[${fonte.join(', ')}] cópia=[${copia.join(', ')}]`,
    );
  } catch (e) {
    falhas += 1;
    console.log(`  ✗ ${nome}: não deu para extrair da fonte — ${e instanceof Error ? e.message : e}`);
  }
}

// A cópia sai do PRÓPRIO schema que `pesquisa.ts` monta para a OpenAI — não há
// necessidade de exportar as constantes privadas do módulo só para o teste; o
// schema já é a superfície pública que carrega o vocabulário inteiro.
const schemaVocab = montarSchema('exercicio', []) as {
  properties: {
    padrao: { enum: string[] };
    musculos: { items: { enum: string[] } };
    tags: { items: { enum: string[] } };
    nivel: { enum: string[] };
  };
};

checarVocabulario(
  'PADROES',
  () => comoArrayDeString(acharConst(parseSite('compartilhado/config/padroes.js'), 'PADROES'), 'compartilhado/config/padroes.js:PADROES'),
  schemaVocab.properties.padrao.enum,
);

checarVocabulario(
  'MUSCULOS_LABEL',
  () => {
    // MUSCULOS_LABEL não é uma constante única em lugar nenhum do site: é
    // `MUSCULOS` (as 11 chaves internas, em `padroes.js`) traduzida pelo mapa
    // `MUSC_MAP` (`coach/academia/data/seed.js`) — a mesma cadeia que o cabeçalho de
    // `pesquisa.ts` documenta. Reproduzimos os dois passos aqui, não um atalho.
    const chaves = comoArrayDeString(
      acharConst(parseSite('compartilhado/config/padroes.js'), 'MUSCULOS'),
      'compartilhado/config/padroes.js:MUSCULOS',
    );
    const mapa = comoMapaDeString(
      acharConst(parseSite('coach/academia/data/seed.js'), 'MUSC_MAP'),
      'coach/academia/data/seed.js:MUSC_MAP',
    );
    return chaves.map((k) => {
      const rotulo = mapa[k];
      if (!rotulo) throw new Error(`a chave "${k}" de MUSCULOS não tem rótulo em MUSC_MAP.`);
      return rotulo;
    });
  },
  schemaVocab.properties.musculos.items.enum,
);

checarVocabulario(
  'TAGS',
  () => comoArrayDeString(acharConst(parseSite('coach/academia/db.js'), 'TAGS'), 'academia/db.js:TAGS'),
  schemaVocab.properties.tags.items.enum,
);

checarVocabulario(
  'NIVEIS',
  () => comoArrayDeString(acharConst(parseSite('coach/montador-de-treino/core/niveis.js'), 'NIVEIS'), 'coach/montador-de-treino/core/niveis.js:NIVEIS'),
  schemaVocab.properties.nivel.enum,
);

console.log(
  falhas === 0
    ? '\n✓ A leitura da IA e a de preço aguentam entrada torta.\n'
    : `\n✗ ${falhas} verificação(ões) falharam.\n`,
);
process.exitCode = falhas === 0 ? 0 : 1;
