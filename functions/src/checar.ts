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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { extrairAnalise, num } from './analise';
import { extrairPreco, decidirRodada, ehLinkMercadoLivre, type ItemFeed } from './precos';
import { HTML_SOCIAL } from './fixtures/social-ml';
import { extrairProposta, montarSchema, type Equip, type PropostaExercicio, type PropostaTecnica } from './pesquisa';
import {
  BOA_EXERCICIO, BOA_TECNICA, SEM_PADRAO, PADRAO_INVENTADO, MUSCULO_INVENTADO,
  EQUIP_FORA_DO_INVENTARIO, JSON_QUEBRADO, VAZIA, MALICIOSA,
  SEM_MUSCULO_PRIMARIO, SECUNDARIO_REPETIDO,
} from './fixtures/pesquisa';
import {
  extrairTreino, montarTreino, regraGlobalDe, montarSchema as montarSchemaLousa, MUSCULOS_LABEL,
} from './lousa';
import { analisarVariabilidade, type TreinoHistorico } from './variabilidade';
import {
  fichaDoAluno, distribuir, lerMatriz, matrizPadrao, cargaDeTrabalho, levantamentoDe,
  lerTurmas, validarTurmas, alunosDasTurmas, horarioPorAluno, MAX_ALUNOS_NO_LOTE,
  e1rm, cargaDe1RM, ALUNOS_POR_TURMA, LEVANTAMENTOS, PCT_MIN, PCT_MAX,
  NIVEIS as NIVEIS_MATRIZ, FASES, ZONAS_RIR, REGRAS_IMPACTO, REGRAS_TRACAO,
  REGIOES_LESAO, GRAVIDADES, RESTRICOES_MOBILIDADE, CAMPO_MATRIZ,
} from './distribuicao';
import {
  chaveSemana, chaveMes, faixaDaSemana, faixaDoMes, consolidar, saldoPorGrupo,
  GRUPO_POR_ROTULO, META_SEMANAL_PADRAO, SEMANAS_POR_MES, GRUPOS as GRUPOS_VOL, MAX_SEM_GRUPO,
  type TreinoParaVolume,
} from './volume-agregado';
import {
  TAXONOMIA, perfilDe, gruposDoExercicio, completarGrupamentos,
} from './taxonomia';
import {
  preParse, montarComoIA, extrairSeriesReps, extrairCarga, nomeDaLinha, semMarcasDeCor, blocoDaLinha,
} from './pre-parser';
import { chaveDe, resolver, itemUtil, itemDaIA, daTaxonomia, limparParaGravar } from './catalogo';

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
ok(boa.musculosPrimarios.join() === 'Quadríceps', 'lê o músculo primário');
ok(boa.musculosSecundarios.join() === 'Glúteo', 'lê o músculo secundário');
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

ok(lanca(() => extrairProposta(SEM_MUSCULO_PRIMARIO, 'exercicio', EQUIP)),
  'exercício sem músculo primário é recusado — sem ele o volume some da conta por músculo');
const repetido = extrairProposta(SECUNDARIO_REPETIDO, 'exercicio', EQUIP) as PropostaExercicio;
ok(repetido.musculosPrimarios.join() === 'Costas' && repetido.musculosSecundarios.join() === 'Bíceps',
  'músculo que está nas duas listas fica só no primário');
ok(!lanca(() => extrairProposta(SEM_MUSCULO_PRIMARIO, 'mobilidade', EQUIP)),
  'mobilidade sem músculo primário é aceita — ela não conta volume, e o formulário da Academia também permite');

/* ---------- vocabulário fechado: descarta o item torto, não a proposta ---------- */

const musculoTorto = extrairProposta(MUSCULO_INVENTADO, 'exercicio', EQUIP) as PropostaExercicio;
ok(musculoTorto.musculosPrimarios.join() === 'Costas',
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
  musculosPrimarios: ['Quadríceps'], musculosSecundarios: [] as string[], tags: [] as string[], equipamentoIds: [] as string[],
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
   dá para extrair com confiança. Por isso NIVEIS vem de `compartilhado/regras/niveis.js`
   (o array de verdade que os módulos do motor importam), não do comentário em
   `compartilhado/dados/exercicios.js:35` — aquele é só a anotação de tipo do campo,
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

/** Compara uma cópia local (de `pesquisa.ts`, `lousa.ts`, `volume-agregado.ts`) com sua fonte no site; extração que falha vira falha do check, não exceção solta. */
function checarVocabulario(nome: string, extrairFonte: () => string[], copia: string[]): void {
  try {
    const fonte = extrairFonte();
    ok(
      mesmoConjunto(fonte, copia),
      `${nome}: a cópia bate com a fonte no site`,
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
    musculosPrimarios: { items: { enum: string[] } };
    musculosSecundarios: { items: { enum: string[] } };
    tags: { items: { enum: string[] } };
    nivel: { enum: string[] };
  };
};

checarVocabulario(
  'PADROES (pesquisa.ts)',
  () => comoArrayDeString(acharConst(parseSite('compartilhado/config/padroes.js'), 'PADROES'), 'compartilhado/config/padroes.js:PADROES'),
  schemaVocab.properties.padrao.enum,
);

checarVocabulario(
  'MUSCULOS_LABEL (pesquisa.ts)',
  () => {
    // MUSCULOS_LABEL não é uma constante única em lugar nenhum do site: é
    // `MUSCULOS` (as 11 chaves internas, em `padroes.js`) traduzida pelo mapa
    // `MUSC_MAP` (`compartilhado/config/musculos.js`) — a mesma cadeia que o cabeçalho de
    // `pesquisa.ts` documenta. Reproduzimos os dois passos aqui, não um atalho.
    const chaves = comoArrayDeString(
      acharConst(parseSite('compartilhado/config/padroes.js'), 'MUSCULOS'),
      'compartilhado/config/padroes.js:MUSCULOS',
    );
    const mapa = comoMapaDeString(
      acharConst(parseSite('compartilhado/config/musculos.js'), 'MUSC_MAP'),
      'compartilhado/config/musculos.js:MUSC_MAP',
    );
    return chaves.map((k) => {
      const rotulo = mapa[k];
      if (!rotulo) throw new Error(`a chave "${k}" de MUSCULOS não tem rótulo em MUSC_MAP.`);
      return rotulo;
    });
  },
  schemaVocab.properties.musculosPrimarios.items.enum,
);

ok(JSON.stringify(schemaVocab.properties.musculosSecundarios.items.enum) === JSON.stringify(schemaVocab.properties.musculosPrimarios.items.enum),
  'primário e secundário aceitam exatamente o mesmo vocabulário');

checarVocabulario(
  'TAGS (pesquisa.ts)',
  () => comoArrayDeString(acharConst(parseSite('coach/academia/db.js'), 'TAGS'), 'coach/academia/db.js:TAGS'),
  schemaVocab.properties.tags.items.enum,
);

checarVocabulario(
  'NIVEIS (pesquisa.ts)',
  () => comoArrayDeString(acharConst(parseSite('compartilhado/regras/niveis.js'), 'NIVEIS'), 'compartilhado/regras/niveis.js:NIVEIS'),
  schemaVocab.properties.nivel.enum,
);


/* ============================================================
   MONTADOR DE TREINOS HÍBRIDO
   ============================================================ */

console.log('\nLOUSA DO COACH: A LEITURA AGUENTA LOUSA TORTA?\n');

/** Uma resposta de lousa no formato que a OpenAI devolve, montada a partir dos exercícios. */
const lousa = (exercicios: object[], extra: object = {}) => envelope(JSON.stringify({
  sistema: 'Hipertrofia', titulo: 'Full Body A', avisos: [], exercicios, ...extra,
}));

const EX_BASE = {
  nome: 'Supino Reto', bloco: 'C', series: 4, reps: '8-12',
  implemento: 'Barra', grupamentos: ['Peito', 'Tríceps'], observacao: 'RIR 2',
};

const treinoOk = extrairTreino(lousa([
  { ...EX_BASE },
  { nome: 'Mobilidade de Quadril', bloco: 'A', series: 1, reps: '40s', implemento: '', grupamentos: [], observacao: '' },
]));
ok(treinoOk.blocos.length === 2, `lousa bem formada devolve os dois blocos (${treinoOk.blocos.length})`);
ok(treinoOk.blocos[0].id === 'A', 'e os blocos saem na ordem A → D, não na ordem em que o coach escreveu');
ok(treinoOk.estimativaSeries === 5, `a estimativa soma as séries de todos os blocos (${treinoOk.estimativaSeries})`);
ok(treinoOk.blocos[1].exercicios[0].observacao === 'RIR 2', 'a caneta vermelha (RIR) chega em "observacao"');

ok(extrairTreino({ output_text: JSON.stringify({ sistema: 'HIIT', titulo: 'T', avisos: [], exercicios: [EX_BASE] }) }).sistema === 'HIIT',
  'o atalho output_text também é lido');
ok(extrairTreino(envelope('Claro! Aqui está: ' + JSON.stringify({ sistema: 'GAP', titulo: 'T', avisos: [], exercicios: [EX_BASE] }))).sistema === 'GAP',
  'prosa em volta do JSON não atrapalha');
ok(extrairTreino(envelope('```json\n' + JSON.stringify({ sistema: 'Hyrox', titulo: 'T', avisos: [], exercicios: [EX_BASE] }) + '\n```')).sistema === 'Hyrox',
  'cerca de markdown também é descascada');

/* ---------- o que tem que ser RECUSADO ---------- */

ok(lanca(() => extrairTreino(envelope('não consegui ler nada'))), 'lousa ilegível é recusada, não devolvida vazia');
ok(lanca(() => extrairTreino(envelope(''))), 'resposta vazia é recusada');
ok(lanca(() => extrairTreino(lousa([]))), 'treino sem nenhum exercício é recusado');
ok(lanca(() => extrairTreino(lousa([{ ...EX_BASE, nome: '' }]))), 'treino em que nenhuma linha tem nome é recusado');

/* ---------- o que tem que ser TOLERADO ---------- */

const tolerante = extrairTreino(lousa([
  { ...EX_BASE, bloco: 'Z' },
  { ...EX_BASE, nome: 'Remada', series: 99 },
  { ...EX_BASE, nome: 'Prancha', grupamentos: ['Peito', 'Pescoço', 'Peito'] },
  { nome: '', bloco: 'C', series: 3, reps: '', implemento: '', grupamentos: [], observacao: '' },
]));
const forca = tolerante.blocos.find((b) => b.id === 'C');
ok(forca?.exercicios.length === 3, `linha sem nome é descartada e o resto passa (${forca?.exercicios.length})`);
ok(forca?.exercicios[0].bloco === 'C', 'bloco fora de A-D cai em Força');
ok(forca?.exercicios[1].series === 3, `série fora da faixa cai no padrão do bloco (${forca?.exercicios[1].series})`);
ok(JSON.stringify(forca?.exercicios[2].grupamentos) === JSON.stringify(['Peito']),
  'músculo inventado é descartado e o repetido não duplica');

const semSeries = extrairTreino(lousa([
  { ...EX_BASE, bloco: 'A', series: 0 },
  { ...EX_BASE, bloco: 'C', series: 0 },
]));
ok(semSeries.blocos.find((b) => b.id === 'A')?.exercicios[0].series === 1
  && semSeries.blocos.find((b) => b.id === 'C')?.exercicios[0].series === 3,
  'sem série na lousa, mobilidade recebe 1 passagem e força recebe 3');

const sistemaTorto = extrairTreino(lousa([EX_BASE], { sistema: 'Crossfit' }));
ok(sistemaTorto.sistema === 'Hipertrofia', 'sistema fora do vocabulário cai em Hipertrofia');
ok(sistemaTorto.avisos.some((a) => a.includes('sistema')), 'e o coach é avisado do palpite em vez de descobrir depois');

/* ---------- regras globais do box ---------- */

console.log('\nREGRAS GLOBAIS DO BOX\n');

for (const escrito of ['Pull-up', 'pull ups', 'PULLUP', 'Barra Fixa', '3x8 pull up estrito']) {
  ok(regraGlobalDe(escrito)?.para === 'Puxada Alta Pegada Aberta', `"${escrito}" vira Puxada Alta Pegada Aberta`);
}
for (const escrito of ['Corrida', 'corrida 400m', 'Esteira', 'Sprint', 'run']) {
  ok(regraGlobalDe(escrito)?.para === 'Airbike', `"${escrito}" vira Airbike`);
}
ok(regraGlobalDe('Puxada Alta Pegada Aberta') === null, 'o exercício que já é o destino não gera troca fantasma');
ok(regraGlobalDe('Airbike') === null, 'idem para o Airbike — reler um treino salvo não inventa substituição');
ok(regraGlobalDe('Supino Reto') === null, 'exercício sem regra passa intacto');

const comRegra = extrairTreino(lousa([
  { ...EX_BASE, nome: 'Pull-ups' },
  { ...EX_BASE, nome: 'Corrida 800m' },
  { ...EX_BASE, nome: 'Supino Reto' },
]));
const nomesFinais = comRegra.blocos.flatMap((b) => b.exercicios.map((e) => e.nome));
ok(nomesFinais.includes('Puxada Alta Pegada Aberta') && nomesFinais.includes('Airbike'),
  'as regras globais são aplicadas ao treino inteiro na leitura');
ok(comRegra.substituicoes.length === 2, `e ficam registradas para o coach ver (${comRegra.substituicoes.length})`);
ok(comRegra.substituicoes[0].de === 'Pull-ups' && comRegra.substituicoes[0].regra.includes('regra global'),
  'o registro diz o que era, o que virou e por quê');

/* ---------- schema estrito ---------- */

const schemaLousa = montarSchemaLousa() as {
  required: string[]; properties: Record<string, unknown>;
  properties2?: never;
};
ok(mesmoConjunto(schemaLousa.required, Object.keys(schemaLousa.properties)),
  'required do schema da lousa é EXATAMENTE properties (strict mode recusa campo fantasma nos dois sentidos)');
const itemEx = (schemaLousa.properties.exercicios as { items: { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean } }).items;
ok(mesmoConjunto(itemEx.required, Object.keys(itemEx.properties)), 'e o mesmo vale para cada exercício');
ok(itemEx.additionalProperties === false, 'o exercício não aceita campo extra');

console.log('\nMOTOR DE VARIABILIDADE\n');

const AGORA = '2026-09-16T19:00:00.000Z';
const treinoHoje = extrairTreino(lousa([
  { ...EX_BASE, nome: 'Agachamento Livre', grupamentos: ['Quadríceps'] },
]));
const historicoDe = (horasAtras: number, nome: string): TreinoHistorico => ({
  id: 'x', dateId: new Date(Date.parse(AGORA) - horasAtras * 36e5).toISOString().slice(0, 10),
  geradoEm: new Date(Date.parse(AGORA) - horasAtras * 36e5).toISOString(),
  treino: extrairTreino(lousa([{ ...EX_BASE, nome, grupamentos: ['Quadríceps'] }])),
});

const dup = analisarVariabilidade(treinoHoje, [historicoDe(48, 'Agachamento Livre')], AGORA);
ok(dup.alertas.some((a) => a.tipo === 'duplicacao'), 'mesmo exercício 48h atrás dispara duplicação');
ok(dup.alertas[0].sugestoes.some((s) => s.acao === 'manter'), 'e "manter a escolha do coach" é sempre uma das saídas');
ok(dup.alertas[0].sugestoes.some((s) => s.rotulo.includes('Halter')),
  'a troca de 1 clique de Barra oferece Halter');

const semDup = analisarVariabilidade(treinoHoje, [historicoDe(100, 'Agachamento Livre')], AGORA);
ok(!semDup.alertas.some((a) => a.tipo === 'duplicacao'), 'o mesmo exercício há 100h (> 72h) não dispara nada');

const outroExercicio = analisarVariabilidade(treinoHoje, [historicoDe(24, 'Supino Reto')], AGORA);
ok(!outroExercicio.alertas.some((a) => a.tipo === 'duplicacao'), 'exercício diferente no mesmo dia não é duplicação');

/** Oito exercícios, sete de barra — saturação clara, amostra suficiente. */
const muitaBarra = extrairTreino(lousa([
  ...Array.from({ length: 7 }, (_, i) => ({ ...EX_BASE, nome: `Barra ${i}`, implemento: 'Barra' })),
  { ...EX_BASE, nome: 'Abdominal', implemento: 'Colchonete' },
]));
const sat = analisarVariabilidade(muitaBarra, [], AGORA);
ok(sat.alertas.some((a) => a.tipo === 'saturacao' && a.alvo === 'Barra'), 'barra em 87% dos exercícios dispara saturação');
ok(sat.resumo.usoPorImplemento.Barra === 7, `o resumo conta o uso por implemento (${sat.resumo.usoPorImplemento.Barra})`);

const amostraPequena = extrairTreino(lousa([
  { ...EX_BASE, nome: 'A', implemento: 'Barra' },
  { ...EX_BASE, nome: 'B', implemento: 'Barra' },
  { ...EX_BASE, nome: 'C', implemento: 'Barra' },
]));
ok(!analisarVariabilidade(amostraPequena, [], AGORA).alertas.some((a) => a.tipo === 'saturacao'),
  'três exercícios de barra numa segunda-feira NÃO viram alerta (amostra pequena demais)');

const soPeito = extrairTreino(lousa(
  Array.from({ length: 8 }, (_, i) => ({ ...EX_BASE, nome: `Peito ${i}`, grupamentos: ['Peito'] })),
));
ok(analisarVariabilidade(soPeito, [], AGORA).alertas.some((a) => a.tipo === 'redundancia'),
  'a semana inteira em um grupamento dispara redundância de estímulo');

console.log('\nDISTRIBUIÇÃO PARA A TURMA\n');

const treinoTurma = extrairTreino(lousa([
  { ...EX_BASE, nome: 'Agachamento Livre', bloco: 'C', series: 4, implemento: 'Barra', grupamentos: ['Quadríceps'] },
  { ...EX_BASE, nome: 'Burpee', bloco: 'D', series: 3, reps: '15', implemento: 'Peso corporal', grupamentos: ['Peito'] },
  { nome: 'Mobilidade de Tornozelo', bloco: 'A', series: 1, reps: '40s', implemento: '', grupamentos: [], observacao: '' },
]));

/** Uma ficha da Gestão, no formato que `matrizDe()` do site lê. */
const fichaGestao = (extra: object = {}, matriz: object = {}) => ({
  nome: 'Ana Prado', email: 'ANA@Exemplo.com ', nivel: 'intermediario', objetivo: 'Hipertrofia',
  freqVezes: '3', foco: ['perna'],
  ...extra,
  matrizIndividualizacao: {
    versao: 1,
    perfil: { fase: 'hipertrofia' },
    cargas: { referencia: {}, rir: '2-3', airbike: { rpm: null, calPorMin: null, obs: '' } },
    adaptacoes: { lesoes: [], impacto: 'livre', tracao: 'barra', mobilidade: [], obs: '' },
    historico: { semanaId: '', correcoes: {}, atualizadoEm: 0 },
    ...matriz,
  },
});

/* ---------- 1RM: medido, estimado e o que não vira número ---------- */

ok(e1rm(100, 1) === 100, 'uma repetição é o próprio 1RM');
ok(e1rm(100, 5) === 116.5, `Epley: 100kg × 5 reps ≈ 116,5kg (${e1rm(100, 5)})`);
// 92,5 × (1 + 3/30) = 101,75 → 102 no arredondamento de 0,5 kg da fonte.
ok(e1rm('92,5', '3') === 102, `vírgula decimal do formulário é aceita, como na fonte (${e1rm('92,5', '3')})`);
ok(e1rm(0, 5) === null && e1rm(100, 0) === null, 'sem peso ou sem reps não há estimativa');
ok(cargaDe1RM(100, 70) === 70, 'carga de trabalho arredonda ao par de anilhas (2,5 kg)');
ok(cargaDe1RM(103, 70) === 72.5, `72,1 vira 72,5 — o que dá para montar na barra (${cargaDe1RM(103, 70)})`);

const comMedido = lerMatriz(fichaGestao({}, {
  cargas: { referencia: { agachamento: { kg: 90, reps: 5, rm: 130, medidoEm: '2026-09-01' } }, rir: '2-3', airbike: {} },
}), 'ana');
ok(comMedido.referencia.agachamento.rmEfetivo === 130,
  'o 1RM MEDIDO ganha do estimado — se o coach testou de verdade, vale mais que a conta');

const soEstimado = lerMatriz(fichaGestao({}, {
  cargas: { referencia: { agachamento: { kg: 90, reps: 5, rm: null, medidoEm: '' } }, rir: '2-3', airbike: {} },
}), 'ana');
ok(soEstimado.referencia.agachamento.rmEfetivo === e1rm(90, 5),
  'sem máxima medida, vale a estimativa de Epley sobre peso e reps');

/* ---------- a leitura da ficha ---------- */

const m = lerMatriz(fichaGestao(), 'ana');
ok(m.nivel === 'intermediario' && m.objetivo === 'Hipertrofia' && m.freqVezes === '3',
  'nível, objetivo e frequência são lidos do TOPO da ficha, não de dentro da matriz');
ok(m.fase === 'hipertrofia', 'a fase é lida de dentro da matriz — objetivo e fase são coisas diferentes');
ok(m.email === 'ana@exemplo.com', 'o e-mail é normalizado (é a chave do Portal)');
ok(m.rir === '2-3', 'a zona de RIR habitual chega na ficha do aluno');

const vazia = lerMatriz({ nome: 'Novo' }, 'novo');
ok(vazia.impacto === 'livre' && vazia.tracao === 'barra',
  'ficha antiga (sem matriz) sai com as regras em branco — branco é "sem adaptação", nunca erro');
ok(LEVANTAMENTOS.every((id) => vazia.referencia[id]?.rmEfetivo === null),
  'e com os três levantamentos presentes e vazios, para o Motor nunca ter que perguntar se o campo existe');

const torta = lerMatriz({ nivel: 'semideus', matrizIndividualizacao: {
  perfil: { fase: 'ascensao' },
  cargas: { referencia: { agachamento: { kg: 'muito', reps: 5 } }, rir: '9-9' },
  adaptacoes: { lesoes: { nao: 'é array' }, impacto: 'voar', tracao: 'teletransporte', mobilidade: 'nada' },
} }, 'x');
ok(torta.nivel === '' && torta.fase === '', 'valor fora do vocabulário vira vazio, não entra no cálculo');
ok(torta.rir === '', 'zona de RIR inventada é descartada');
ok(torta.impacto === 'livre' && torta.tracao === 'barra', 'regra inventada cai no padrão seguro');
ok(Array.isArray(torta.lesoes) && torta.lesoes.length === 0, 'lesões que não são array viram lista vazia');
ok(Array.isArray(torta.mobilidade) && torta.mobilidade.length === 0, 'mobilidade que não é array vira lista vazia');
ok(torta.referencia.agachamento.rmEfetivo === null, 'peso que não é número não vira 1RM');

/* ---------- a carga sai só dos três levantamentos ---------- */

const comAgacho = lerMatriz(fichaGestao({}, {
  cargas: { referencia: { agachamento: { kg: null, reps: null, rm: 100, medidoEm: '' } }, rir: '2-3', airbike: {} },
}), 'ana');
const fichaAna = fichaDoAluno(treinoTurma, comAgacho);
const linhaAgacho = fichaAna.linhas.find((l) => l.nome === 'Agachamento Livre');
// Hipertrofia bloco C = 70%; fase hipertrofia ×1,0; nível intermediário ×1,0.
ok(linhaAgacho?.cargaKg === 70, `a carga sai do 1RM do levantamento de referência (${linhaAgacho?.cargaKg}kg)`);
ok(linhaAgacho?.levantamento === 'agachamento', 'e a ficha diz QUAL levantamento balizou');
ok(!!linhaAgacho?.motivos.some((x) => x.includes('1RM medido')), 'dizendo se o 1RM foi medido ou estimado');

ok(fichaAna.linhas.find((l) => l.nome === 'Burpee')?.cargaKg === null,
  'exercício que não é um dos três levantamentos NÃO recebe kg — número preciso e errado é pior que nenhum');
ok(fichaAna.linhas.find((l) => l.nome === 'Mobilidade de Tornozelo')?.cargaKg === null,
  'mobilidade não recebe carga');
ok(levantamentoDe('Leg Press') === null,
  'leg press NÃO puxa do 1RM de agachamento — a alavanca é outra e a carga sairia errada');
ok(levantamentoDe('Agachamento Búlgaro') === 'agachamento' && levantamentoDe('Supino Inclinado') === 'supino'
  && levantamentoDe('Levantamento Terra Romeno') === 'terra',
  'as variações dos três levantamentos casam com a referência');

const semRm = fichaDoAluno(treinoTurma, lerMatriz(fichaGestao(), 'ana'));
ok(semRm.linhas.every((l) => l.cargaKg === null), 'aluno sem 1RM recebe a orientação da lousa, nunca um número inventado');
ok(semRm.avisos.some((a) => a.includes('1RM')), 'e o coach é avisado de que falta 1RM');

/* ---------- fase e nível compõem, mas dentro da faixa ---------- */

const emForca = lerMatriz(fichaGestao({ nivel: 'avancado' }, {
  perfil: { fase: 'forca' },
  cargas: { referencia: { agachamento: { rm: 100 } }, rir: '1-2', airbike: {} },
}), 'x');
const emResistencia = lerMatriz(fichaGestao({ nivel: 'iniciante' }, {
  perfil: { fase: 'resistencia' },
  cargas: { referencia: { agachamento: { rm: 100 } }, rir: '3-4', airbike: {} },
}), 'y');
const pctForca = cargaDeTrabalho(emForca, 'Agachamento Livre', 'Hipertrofia', 'C').percentual ?? 0;
const pctResist = cargaDeTrabalho(emResistencia, 'Agachamento Livre', 'Hipertrofia', 'C').percentual ?? 0;
ok(pctForca > 70 && pctResist < 70, `bloco de força puxa mais que resistência na MESMA aula (${pctForca}% x ${pctResist}%)`);
ok(pctForca <= PCT_MAX && pctResist >= PCT_MIN,
  `a composição fase × nível fica na faixa ${PCT_MIN}-${PCT_MAX}% — 90% do 1RM em aula de oito não é prescrição`);
ok(cargaDeTrabalho(emForca, 'Agachamento Livre', 'GAP', 'D').percentual! < pctForca,
  'o metcon do GAP baliza mais leve que a força da hipertrofia');
ok(cargaDeTrabalho(emForca, 'Agachamento Livre', 'Hipertrofia', 'A').cargaKg === null,
  'não existe 1RM de mobilidade');

/* ---------- as três regras de adaptação ---------- */

const semImpacto = lerMatriz(fichaGestao({}, {
  adaptacoes: { lesoes: [], impacto: 'converter_airbike', tracao: 'barra', mobilidade: [], obs: '' },
}), 'x');
const fichaSemImpacto = fichaDoAluno(treinoTurma, semImpacto);
ok(fichaSemImpacto.linhas.some((l) => l.nome === 'Airbike'),
  'quem não pode saltar senta na Airbike — é a conversão que o box já faz na prática');
ok(!fichaSemImpacto.linhas.some((l) => l.nome === 'Burpee'), 'e o burpee sai da ficha dele');
ok(fichaSemImpacto.linhas.some((l) => l.motivos.some((x) => x.includes('Airbike'))),
  'com o motivo escrito, em vez de o exercício mudar em silêncio');
ok(fichaSemImpacto.linhas.find((l) => l.nome === 'Agachamento Livre') !== undefined,
  'a regra de impacto não encosta em quem não é movimento de impacto');

const impactoReduzido = fichaDoAluno(treinoTurma, lerMatriz(fichaGestao({}, {
  adaptacoes: { lesoes: [], impacto: 'reduzir', tracao: 'barra', mobilidade: [], obs: '' },
}), 'x'));
ok(impactoReduzido.linhas.some((l) => l.nome === 'Burpee' && l.motivos.some((x) => x.includes('sem fase aérea'))),
  '"reduzir impacto" vira AVISO na linha, não troca de exercício — a adaptação é decisão do coach na aula');

const mobilidadeRuim = fichaDoAluno(treinoTurma, lerMatriz(fichaGestao({}, {
  adaptacoes: { lesoes: [], impacto: 'livre', tracao: 'barra', mobilidade: ['tornozelo'], obs: '' },
}), 'x'));
ok(mobilidadeRuim.linhas.some((l) => l.nome === 'Agachamento Livre' && l.motivos.some((x) => x.includes('Mobilidade'))),
  'restrição de tornozelo avisa no agachamento');

const comLesao = fichaDoAluno(treinoTurma, lerMatriz(fichaGestao({}, {
  adaptacoes: { lesoes: [{ regiao: 'joelho', gravidade: 'moderada', desde: '2026-08-01', obs: 'menisco' }],
    impacto: 'livre', tracao: 'barra', mobilidade: [], obs: 'evitar carga axial alta' },
}), 'x'));
ok(comLesao.avisos.some((a) => a.includes('joelho')),
  'a lesão cadastrada aparece na ficha mesmo sem regra que a execute — senão o coach acharia que o sistema a considerou');
ok(comLesao.avisos.some((a) => a.includes('carga axial')), 'e a observação da matriz vai junto');

const turmaGrande = distribuir(treinoTurma, Array.from({ length: 12 }, (_, i) => matrizPadrao(`a${i}`)));
ok(turmaGrande.length === ALUNOS_POR_TURMA, `a turma para no teto de ${ALUNOS_POR_TURMA} alunos (${turmaGrande.length})`);

/* ---------- as turmas do dia, em lote ---------- */

const TRES_TURMAS = { turmas: [
  { classTime: '19:00', studentIds: ['g', 'h'] },
  { classTime: '07:00', studentIds: ['a', 'b', 'c'] },
] };

const lidas = lerTurmas(TRES_TURMAS);
ok(lidas.length === 2 && lidas[0].classTime === '07:00',
  'as turmas saem ordenadas por horário, não na ordem em que a tela mandou');
ok(validarTurmas(lidas) === null, 'duas turmas dentro do teto passam');
ok(alunosDasTurmas(lidas).length === 5, `o lote soma os alunos das duas turmas (${alunosDasTurmas(lidas).length})`);
ok(horarioPorAluno(lidas).get('g') === '19:00' && horarioPorAluno(lidas).get('a') === '07:00',
  'cada aluno leva o horário da turma dele — é isso que carimba a ficha');

// O FORMATO ANTIGO continua aceito: o site publica sozinho pelo Pages e as
// functions sobem à parte, então existe uma janela com um lado novo e outro
// velho. Recusar o antigo transformaria essa janela em erro na cara do coach.
const antigo = lerTurmas({ classTime: '07:00', studentIds: ['a', 'b'] });
ok(antigo.length === 1 && antigo[0].classTime === '07:00' && antigo[0].studentIds.length === 2,
  'o formato de uma turma só (anterior ao lote) ainda é lido');

ok(lerTurmas({ turmas: [{ classTime: '', studentIds: ['a'] }] }).length === 0,
  'turma sem horário é descartada — a ficha chegaria ao aluno sem dizer de que aula é');
ok(lerTurmas({ turmas: [{ classTime: '07:00', studentIds: [] }] }).length === 0, 'turma sem aluno é descartada');
ok(lerTurmas({ turmas: [{ classTime: '25:00', studentIds: ['a'] }] }).length === 0, 'horário impossível é descartado');
ok(lerTurmas({ turmas: 'não é array' }).length === 0, 'entrada torta não vira turma');
ok(lerTurmas({ turmas: [{ classTime: '07:00', studentIds: ['a', 'a', ' a '] }] })[0].studentIds.length === 1,
  'id repetido dentro da mesma turma é dobra de clique, não dois alunos');

ok(validarTurmas([]) !== null, 'lote vazio é recusado');
ok(validarTurmas(lerTurmas({ turmas: [
  { classTime: '07:00', studentIds: ['a'] },
  { classTime: '19:00', studentIds: ['a'] },
] }))?.includes('mais de um horário') === true,
  'o MESMO aluno em duas turmas é recusado — no mesmo lote a última escrita venceria em silêncio');

const lotada = [{ classTime: '07:00', studentIds: Array.from({ length: ALUNOS_POR_TURMA + 1 }, (_, i) => `x${i}`) }];
ok(validarTurmas(lotada)?.includes(String(ALUNOS_POR_TURMA)) === true, 'turma acima do teto é recusada, dizendo o teto');

const gigante = Array.from({ length: 30 }, (_, i) => ({
  classTime: `${String(i % 24).padStart(2, '0')}:00`,
  studentIds: Array.from({ length: 8 }, (_, j) => `a${i}-${j}`),
}));
ok(validarTurmas(gigante)?.includes(String(MAX_ALUNOS_NO_LOTE)) === true,
  `acima de ${MAX_ALUNOS_NO_LOTE} alunos o lote é recusado aqui, com texto legível, em vez de estourar o teto de 500 operações do Firestore`);

console.log('\nCONSOLIDAÇÃO DE VOLUME\n');

ok(chaveSemana('2026-09-16') === '2026-W38', `quarta 16/09/2026 cai na semana ISO 38 (${chaveSemana('2026-09-16')})`);
ok(chaveSemana('2026-09-14') === chaveSemana('2026-09-20'),
  'segunda e domingo da mesma semana ISO dão a mesma chave');
ok(chaveSemana('2026-09-20') !== chaveSemana('2026-09-21'), 'e a segunda seguinte já é outra semana');
ok(chaveSemana('2025-12-31') === '2026-W01',
  `31/12/2025 pertence à semana ISO 1 de 2026 (${chaveSemana('2025-12-31')}) — a virada de ano não parte a semana de treino`);
ok(chaveMes('2026-09-16') === '2026-09', 'a chave de mês é o prefixo YYYY-MM');
ok(faixaDaSemana('2026-09-16').inicio === '2026-09-14' && faixaDaSemana('2026-09-16').fim === '2026-09-20',
  'a semana vai de segunda a domingo');
ok(faixaDoMes('2026-02-10').fim === '2026-02-28', 'a faixa do mês conhece o tamanho de cada mês');

const treinosSemana: TreinoParaVolume[] = [
  { dateId: '2026-09-14', sistema: 'Hipertrofia', exercicios: [
    { series: 4, grupamentos: ['Peito', 'Tríceps'], implemento: 'Barra' },
    { series: 3, grupamentos: ['Quadríceps'], implemento: 'Halter' },
  ] },
  { dateId: '2026-09-16', sistema: 'HIIT', exercicios: [
    { series: 3, grupamentos: ['Peito'], implemento: 'Barra' },
  ] },
];
const cSem = consolidar(treinosSemana, 'semana', '2026-W38', faixaDaSemana('2026-09-16'));
ok(cSem.totalSeries === 10, `o total de séries soma o que foi prescrito (${cSem.totalSeries})`);
ok(cSem.porGrupo.peito === 7, `peito acumula as séries dos dois dias (${cSem.porGrupo.peito})`);
ok(cSem.porGrupo.braco === 4, 'tríceps é creditado ao grupo braço, como no resto do sistema');
ok(cSem.porGrupo.perna === 3, 'quadríceps é creditado ao grupo perna');
ok(cSem.percentualImplemento.Barra === 66.7, `a rosca de implementos mostra a fatia de cada um (${cSem.percentualImplemento.Barra}%)`);
ok(cSem.porSistema.Hipertrofia === 1 && cSem.porSistema.HIIT === 1, 'e os treinos são contados por sistema');
ok(cSem.metas.peito === META_SEMANAL_PADRAO, 'a meta semanal padrão vale para todos os grupos');
ok(saldoPorGrupo(cSem).costas === -META_SEMANAL_PADRAO, 'o grupo que não foi treinado aparece com o saldo negativo cheio');

const cMes = consolidar(treinosSemana, 'mes', '2026-09', faixaDoMes('2026-09-16'));
ok(cMes.metas.peito === Math.round(META_SEMANAL_PADRAO * SEMANAS_POR_MES),
  `a meta do mês é a semanal × ${SEMANAS_POR_MES} (${cMes.metas.peito})`);

const comMetaDoCoach = consolidar(treinosSemana, 'semana', '2026-W38', faixaDaSemana('2026-09-16'), { perna: 20 });
ok(comMetaDoCoach.metas.perna === 20, 'a meta que o coach digitou vale sobre a tabela padrão');
ok(comMetaDoCoach.metas.peito === META_SEMANAL_PADRAO, 'e sobrescrever um grupo não mexe nos outros');

const vazio = consolidar([], 'semana', '2026-W38', faixaDaSemana('2026-09-16'));
ok(vazio.totalSeries === 0 && Object.keys(vazio.metas).length === GRUPOS_VOL.length,
  'semana sem treino consolida zerada, mas com as metas — o dashboard mostra o buraco');

/* ---------- vocabulários do híbrido contra a fonte do site ---------- */

console.log('\nVOCABULÁRIOS: AS CÓPIAS DO HÍBRIDO BATEM COM A FONTE DO SITE?\n');

checarVocabulario(
  'MUSCULOS_LABEL (lousa.ts)',
  () => {
    const chaves = comoArrayDeString(
      acharConst(parseSite('compartilhado/config/padroes.js'), 'MUSCULOS'),
      'compartilhado/config/padroes.js:MUSCULOS',
    );
    const mapa = comoMapaDeString(
      acharConst(parseSite('compartilhado/config/musculos.js'), 'MUSC_MAP'),
      'compartilhado/config/musculos.js:MUSC_MAP',
    );
    return chaves.map((k) => {
      const rotulo = mapa[k];
      if (!rotulo) throw new Error(`a chave "${k}" de MUSCULOS não tem rótulo em MUSC_MAP.`);
      return rotulo;
    });
  },
  [...MUSCULOS_LABEL],
);

checarVocabulario(
  'GRUPOS (volume-agregado.ts)',
  () => comoArrayDeString(acharConst(parseSite('compartilhado/regras/grupos.js'), 'GRUPOS'), 'compartilhado/regras/grupos.js:GRUPOS'),
  [...GRUPOS_VOL],
);

/* `GRUPO_POR_ROTULO` não tem fonte única no site: é a COMPOSIÇÃO de
   `MUSC_MAP` (chave → rótulo) com `GRUPO_POR_MUSCULO` (chave → grupo). A
   checagem refaz a composição a partir dos dois arquivos, que é exatamente o
   trabalho manual que alguém faria — e esqueceria — ao acrescentar um músculo. */
try {
  const mapa = comoMapaDeString(
    acharConst(parseSite('compartilhado/config/musculos.js'), 'MUSC_MAP'),
    'compartilhado/config/musculos.js:MUSC_MAP',
  );
  const porMusculo = comoMapaDeString(
    acharConst(parseSite('compartilhado/regras/grupos.js'), 'GRUPO_POR_MUSCULO'),
    'compartilhado/regras/grupos.js:GRUPO_POR_MUSCULO',
  );
  const esperado: Record<string, string> = {};
  for (const [chave, grupo] of Object.entries(porMusculo)) {
    const rotulo = mapa[chave];
    if (!rotulo) throw new Error(`a chave "${chave}" de GRUPO_POR_MUSCULO não tem rótulo em MUSC_MAP.`);
    esperado[rotulo] = grupo;
  }
  const iguais = mesmoConjunto(Object.keys(esperado), Object.keys(GRUPO_POR_ROTULO))
    && Object.entries(esperado).every(([rotulo, grupo]) => GRUPO_POR_ROTULO[rotulo as keyof typeof GRUPO_POR_ROTULO] === grupo);
  ok(iguais, 'GRUPO_POR_ROTULO: a composição MUSC_MAP × GRUPO_POR_MUSCULO bate com a cópia',
    `fonte=${JSON.stringify(esperado)} cópia=${JSON.stringify(GRUPO_POR_ROTULO)}`);
} catch (e) {
  falhas += 1;
  console.log(`  ✗ GRUPO_POR_ROTULO: não deu para extrair da fonte — ${e instanceof Error ? e.message : e}`);
}

/* A meta da turma tem que ser o MESMO número que o aluno vê no Portal
   (`META_SERIES_SEMANAIS.hipertrofia`, valor "comum"). Duas metas diferentes
   para a mesma semana é o tipo de divergência que ninguém percebe olhando uma
   tela de cada vez. */
try {
  const no = acharConst(parseSite('compartilhado/regras/metas-aluno.js'), 'META_SERIES_SEMANAIS');
  if (!ts.isObjectLiteralExpression(no)) throw new Error('META_SERIES_SEMANAIS não é um objeto literal.');
  const hiper = no.properties.find((p) => ts.isPropertyAssignment(p)
    && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === 'hipertrofia');
  if (!hiper || !ts.isPropertyAssignment(hiper) || !ts.isArrayLiteralExpression(hiper.initializer)) {
    throw new Error('a entrada "hipertrofia" não é um par [comum, emFoco].');
  }
  const comum = hiper.initializer.elements[0];
  if (!comum || !ts.isNumericLiteral(comum)) throw new Error('o valor "comum" não é um número literal.');
  ok(Number(comum.text) === META_SEMANAL_PADRAO,
    'META_SEMANAL_PADRAO é o mesmo número que o aluno vê no Portal',
    `site=${comum.text} híbrido=${META_SEMANAL_PADRAO}`);
} catch (e) {
  falhas += 1;
  console.log(`  ✗ META_SEMANAL_PADRAO: não deu para extrair da fonte — ${e instanceof Error ? e.message : e}`);
}


/* ---------- os vocabulários da matriz contra a fonte do site ---------- */

/*
 * `compartilhado/regras/matriz-individualizacao.js` é a FONTE da matriz: é ela
 * que a tela da Gestão usa para montar os selects e que `matrizDe()` usa para
 * limpar o que foi digitado. As cópias em `distribuicao.ts` existem só porque
 * `functions/` não importa os `.js` do site.
 *
 * Se uma lista divergir, nada explode: a function passa a DESCARTAR em silêncio
 * um valor que a tela oferece — o coach marca "converter para Airbike" e a ficha
 * sai sem a adaptação, sem erro em lugar nenhum. É o tipo de bug que só aparece
 * quando um aluno faz o exercício errado.
 *
 * A fonte pode ainda não estar NESTE branch (ela nasceu em `etapa5a-portal`).
 * Nesse caso a checagem avisa alto e não falha — falhar deixaria o CI vermelho
 * por um arquivo que está a um merge de distância, e um check que ninguém
 * consegue deixar verde é um check que todo mundo aprende a ignorar.
 */
const FONTE_MATRIZ = 'compartilhado/regras/matriz-individualizacao.js';

if (!existsSync(join(RAIZ_SITE, FONTE_MATRIZ))) {
  console.log('\nVOCABULÁRIOS DA MATRIZ DE INDIVIDUALIZAÇÃO\n');
  console.log(`  ⚠ ${FONTE_MATRIZ} não está neste branch — as cópias de distribuicao.ts`);
  console.log('    não foram conferidas. Elas passam a ser conferidas assim que a fonte entrar.');
} else {
  console.log('\nVOCABULÁRIOS DA MATRIZ: AS CÓPIAS BATEM COM A FONTE?\n');

  /** Array de pares `[valor, rótulo]` → só os valores. */
  const comoValoresDePares = (no: ts.Expression, origem: string): string[] => {
    if (!ts.isArrayLiteralExpression(no)) throw new Error(`esperava um array literal em ${origem}.`);
    return no.elements.map((el) => {
      if (!ts.isArrayLiteralExpression(el) || !el.elements.length || !ts.isStringLiteral(el.elements[0])) {
        throw new Error(`elemento não é um par ['valor', 'rótulo'] em ${origem}.`);
      }
      return (el.elements[0] as ts.StringLiteral).text;
    });
  };

  const fonte = () => parseSite(FONTE_MATRIZ);

  for (const [nome, constante, copia] of [
    ['FASES', 'FASES', FASES],
    ['LEVANTAMENTOS', 'LEVANTAMENTOS', LEVANTAMENTOS],
    ['ZONAS_RIR', 'ZONAS_RIR', ZONAS_RIR],
    ['REGRAS_IMPACTO', 'REGRAS_IMPACTO', REGRAS_IMPACTO],
    ['REGRAS_TRACAO', 'REGRAS_TRACAO', REGRAS_TRACAO],
    ['REGIOES_LESAO', 'REGIOES_LESAO', REGIOES_LESAO],
    ['GRAVIDADES', 'GRAVIDADES', GRAVIDADES],
    ['RESTRICOES_MOBILIDADE', 'RESTRICOES_MOBILIDADE', RESTRICOES_MOBILIDADE],
  ] as [string, string, readonly string[]][]) {
    checarVocabulario(
      `${nome} (distribuicao.ts)`,
      () => comoValoresDePares(acharConst(fonte(), constante), `${FONTE_MATRIZ}:${constante}`),
      [...copia],
    );
  }

  // `NIVEIS` na matriz vem de `niveis.js` (`OPCOES_NIVEL` é derivado dele), então
  // a fonte a conferir é aquela, não a matriz.
  checarVocabulario(
    'NIVEIS (distribuicao.ts)',
    () => comoArrayDeString(acharConst(parseSite('compartilhado/regras/niveis.js'), 'NIVEIS'), 'compartilhado/regras/niveis.js:NIVEIS'),
    [...NIVEIS_MATRIZ],
  );

  // O nome do campo dentro da ficha do aluno. Se ele mudar na fonte e não aqui,
  // a function lê `undefined` e TODA a turma sai sem individualização.
  try {
    const no = acharConst(fonte(), 'CAMPO');
    if (!ts.isStringLiteral(no)) throw new Error('CAMPO não é uma string literal.');
    ok(no.text === CAMPO_MATRIZ, 'CAMPO: o nome do campo da matriz bate com a fonte',
      `site="${no.text}" functions="${CAMPO_MATRIZ}"`);
  } catch (e) {
    falhas += 1;
    console.log(`  ✗ CAMPO: não deu para extrair da fonte — ${e instanceof Error ? e.message : e}`);
  }

  // As duas contas de carga também são cópias. Aqui não dá para comparar o
  // código; compara-se o RESULTADO em pontos conhecidos da fórmula de Epley.
  ok(e1rm(100, 5) === 116.5 && e1rm(60, 8) === 76, 'e1rm reproduz Epley nos pontos de referência');
  ok(cargaDe1RM(100, 70) === 70 && cargaDe1RM(103, 70) === 72.5, 'cargaDe1RM arredonda a 2,5 kg como a fonte');
}


/* ------------------------------------------------------------------ *
 * TAXONOMIA DOS METCONS — o Burpee que sumia do dashboard
 * ------------------------------------------------------------------ */

console.log('\nTAXONOMIA: HÍBRIDOS, CALISTÊNICOS E CONDICIONAMENTO NO DASHBOARD\n');

// O vocabulário é FECHADO: um rótulo fora de `MUSCULOS_LABEL` não tem grupo em
// `GRUPO_POR_ROTULO` e o exercício sumiria do gráfico do mesmo jeito — com a
// agravante de parecer mapeado.
{
  const validos = new Set<string>(MUSCULOS_LABEL as readonly string[]);
  const foras: string[] = [];
  for (const p of TAXONOMIA) {
    for (const r of [...p.primarios, ...p.secundarios]) if (!validos.has(r)) foras.push(`${p.nome}: ${r}`);
  }
  ok(foras.length === 0, `todo rótulo da taxonomia existe em MUSCULOS_LABEL${foras.length ? ` (fora: ${foras.join(', ')})` : ''}`);
}

{
  const semGrupo: string[] = [];
  for (const p of TAXONOMIA) {
    for (const r of [...p.primarios, ...p.secundarios]) if (!GRUPO_POR_ROTULO[r]) semGrupo.push(`${p.nome}: ${r}`);
  }
  ok(semGrupo.length === 0, `todo rótulo da taxonomia cai num dos sete grupos${semGrupo.length ? ` (sem grupo: ${semGrupo.join(', ')})` : ''}`);
}

ok(TAXONOMIA.every((p) => p.primarios.length > 0), 'todo exercício mapeado tem ao menos um primário');
ok(
  TAXONOMIA.every((p) => p.tipoContagem !== 'metcon_series' || typeof p.cargaPadraoKg === 'number'),
  'todo metcon_series traz a carga padrão do galpão',
);
ok(
  TAXONOMIA.every((p) => p.tipoContagem !== 'peso_corporal' || p.cargaPadraoKg === undefined),
  'peso corporal não inventa kg padrão',
);

// Os quatro que o coach citou.
ok(perfilDe('Burpee')?.nome === 'Burpee', 'Burpee é reconhecido');
ok(perfilDe('4x15 Wall Ball 9kg')?.nome === 'Wall Ball', 'Wall Ball é reconhecido mesmo colado em séries e carga');
ok(perfilDe('Kettlebell Swing 24kg')?.nome === 'Kettlebell Swing', 'KB Swing é reconhecido');
ok(perfilDe('Box Jump 60cm')?.nome === 'Box Jump', 'Box Jump é reconhecido');

// O termo mais longo vence — sem isso "swing" roubaria "kettlebell swing", e
// "corda" roubaria "corda naval".
ok(perfilDe('KB Swing')?.nome === 'Kettlebell Swing', 'o termo mais longo vence: kb swing');
ok(perfilDe('Corda naval 4x30s')?.nome === 'Corda naval', 'o termo mais longo vence: corda naval, não "corda"');
ok(perfilDe('Pular corda 3x1min')?.nome === 'Pular corda', '"corda" sozinha ainda cai em Pular corda');

ok(perfilDe('Agachamento livre') === null, 'o que a IA já classifica bem fica fora da tabela');
ok(perfilDe('') === null && perfilDe('xyzabc') === null, 'nome vazio ou desconhecido não inventa perfil');

// Os grupamentos: primários e secundários juntos, sem repetição.
{
  const g = gruposDoExercicio('Wall Ball');
  ok(g.includes('Quadríceps') && g.includes('Glúteo') && g.includes('Ombro'), 'Wall Ball credita perna e ombro');
  ok(new Set(g).size === g.length, 'gruposDoExercicio não repete rótulo');
}
ok(gruposDoExercicio('Burpee').includes('Peito') && gruposDoExercicio('Burpee').includes('Core/Abdômen'),
  'Burpee credita peito e core');
ok(gruposDoExercicio('Kettlebell Swing').includes('Posterior de coxa')
  && gruposDoExercicio('Kettlebell Swing').includes('Glúteo'), 'KB Swing credita posterior e glúteo');

// Não sobrescreve leitura da IA: ela viu AQUELA lousa, a tabela é genérica.
ok(completarGrupamentos('Burpee', ['Peito']).length === 1, 'grupamento já preenchido pela IA é preservado');
ok(completarGrupamentos('Burpee', []).length > 1, 'grupamento vazio é completado pela tabela');
ok(completarGrupamentos('Burpee', undefined).length > 1, 'grupamento ausente é completado pela tabela');
ok(completarGrupamentos('Exercício Inventado', []).length === 0, 'o que a tabela não conhece continua vazio');

console.log('\nO TREINO DO CHAMADO: "4x15 Wall Ball 9kg" E "3x10 Burpees"\n');

// O CENÁRIO EXATO DO CHAMADO: antes desta correção, os dois exercícios entravam
// em `totalSeries` e sumiam de `porGrupo` — o gráfico por grupamento mostrava
// zero num dia que teve sete séries.
{
  const treinoMetcon: TreinoParaVolume = {
    dateId: '2026-09-16',
    sistema: 'HIIT',
    exercicios: [
      // Como o documento fica quando a IA devolve lista vazia "na dúvida".
      { nome: 'Wall Ball 9kg', series: 4, grupamentos: [], implemento: 'Bola' },
      { nome: 'Burpees', series: 3, grupamentos: [], implemento: 'Peso corporal' },
    ],
  };
  const c = consolidar([treinoMetcon], 'semana', '2026-W38', faixaDaSemana('2026-09-16'));

  ok(c.totalSeries === 7, `as 7 séries continuam contadas (${c.totalSeries})`);
  // 7 e não 4: perna leva as 4 do Wall Ball MAIS as 3 do Burpee, cujo
  // quadríceps é secundário. Primário e secundário creditam a série inteira,
  // pela convenção que `volume-agregado.ts` documenta e o Portal já usa.
  ok((c.porGrupo.perna || 0) === 7, `perna soma Wall Ball (4) e Burpee (3) = 7 (${c.porGrupo.perna || 0})`);
  ok((c.porGrupo.gluteo || 0) === 4, `Wall Ball credita 4 séries em glúteo (${c.porGrupo.gluteo || 0})`);
  ok((c.porGrupo.ombro || 0) === 7, `ombro leva as 4 do Wall Ball e as 3 do Burpee (${c.porGrupo.ombro || 0})`);
  ok((c.porGrupo.peito || 0) === 3, `Burpee credita 3 séries em peito (${c.porGrupo.peito || 0})`);
  ok((c.porGrupo.core || 0) === 3, `Burpee credita 3 séries em core (${c.porGrupo.core || 0})`);
  ok((c.porGrupo.braco || 0) === 3, `o tríceps do Burpee cai em braço (${c.porGrupo.braco || 0})`);

  ok(c.porTipoContagem.metcon_series === 4 && c.porTipoContagem.peso_corporal === 3,
    'o tipo de contagem separa metcon de peso corporal');
  ok(Object.values(c.porGrupo).some((n) => n > 0), 'o dia deixou de aparecer zerado no gráfico por grupo');
}

// A carga NUNCA foi o filtro — e continua não sendo. Mesmo treino, mesma conta.
{
  const faixa = faixaDaSemana('2026-09-16');
  const comCarga: TreinoParaVolume = { dateId: '2026-09-16', sistema: 'HIIT',
    exercicios: [{ nome: 'Wall Ball 9kg', series: 4, grupamentos: ['Quadríceps'], implemento: 'Bola' }] };
  const semCarga: TreinoParaVolume = { dateId: '2026-09-16', sistema: 'HIIT',
    exercicios: [{ nome: 'Wall Ball', series: 4, grupamentos: ['Quadríceps'], implemento: 'Bola' }] };
  ok(
    consolidar([comCarga], 'semana', 'x', faixa).porGrupo.perna
      === consolidar([semCarga], 'semana', 'x', faixa).porGrupo.perna,
    'série com e sem kg contam igual — carga nunca entrou nesta conta',
  );
}

// A rede vale para o HISTÓRICO: treino já salvo, sem grupamento, volta ao gráfico.
{
  const jaSalvo: TreinoParaVolume = { dateId: '2026-09-16', sistema: 'Hyrox',
    exercicios: [{ nome: 'Kettlebell Swing 24kg', series: 5, grupamentos: [], implemento: 'Kettlebell' }] };
  const c = consolidar([jaSalvo], 'semana', 'x', faixaDaSemana('2026-09-16'));
  ok((c.porGrupo.perna || 0) === 5 && (c.porGrupo.gluteo || 0) === 5,
    'treino antigo sem grupamento é recuperado pelo nome na consolidação');
}

// Exercício fora da tabela e sem grupamento não some do total nem finge grupo.
{
  const desconhecido: TreinoParaVolume = { dateId: '2026-09-16', sistema: 'GAP',
    exercicios: [{ nome: 'Movimento Novo Do Coach', series: 3, grupamentos: [], implemento: '' }] };
  const c = consolidar([desconhecido], 'semana', 'x', faixaDaSemana('2026-09-16'));
  ok(c.totalSeries === 3, 'exercício desconhecido continua no total de séries');
  ok(Object.keys(c.porGrupo).length === 0, 'exercício desconhecido não inventa grupo');
  ok(c.porTipoContagem.indefinido === 3, 'ele aparece como "indefinido" — o alarme de que a tabela precisa crescer');
}


console.log('\nO ALERTA DO DASHBOARD: SÉRIES QUE SOMEM DO GRÁFICO\n');

// A distinção que faz o alerta valer: "fora da taxonomia" NÃO é "fora do
// gráfico". Agachamento e supino estão fora da tabela DE PROPÓSITO e são
// classificados pela IA — se o alerta olhasse `indefinido`, dispararia num
// treino perfeitamente mapeado e o coach aprenderia a ignorá-lo.
{
  const hipertrofiaNormal: TreinoParaVolume = {
    dateId: '2026-09-16', sistema: 'Hipertrofia',
    exercicios: [
      { nome: 'Agachamento livre', series: 4, grupamentos: ['Quadríceps', 'Glúteo'], implemento: 'Barra' },
      { nome: 'Supino reto', series: 4, grupamentos: ['Peito', 'Tríceps'], implemento: 'Barra' },
    ],
  };
  const c = consolidar([hipertrofiaNormal], 'semana', 'x', faixaDaSemana('2026-09-16'));
  ok(c.porTipoContagem.indefinido === 8, 'treino clássico é todo "indefinido" — está fora da TABELA, e tudo bem');
  ok(c.seriesSemGrupo === 0, 'e mesmo assim NADA sumiu do gráfico: o alerta fica calado');
  ok(c.exerciciosSemGrupo.length === 0, 'sem nomes a cobrar num treino bem mapeado');
}

// Agora o caso real: exercício que a IA não classificou e a tabela não conhece.
{
  const comBuraco: TreinoParaVolume = {
    dateId: '2026-09-16', sistema: 'HIIT',
    exercicios: [
      { nome: 'Wall Ball 9kg', series: 4, grupamentos: [], implemento: 'Bola' },
      { nome: 'Devil Press', series: 3, grupamentos: [], implemento: 'Halter' },
      { nome: 'Sled Pull', series: 2, grupamentos: [], implemento: 'Trenó' },
      { nome: 'Devil Press', series: 2, grupamentos: [], implemento: 'Halter' },
    ],
  };
  const c = consolidar([comBuraco], 'semana', 'x', faixaDaSemana('2026-09-16'));
  ok(c.seriesSemGrupo === 7, `só o que não tem grupo conta: 3+2+2 = 7 (${c.seriesSemGrupo})`);
  ok(!c.exerciciosSemGrupo.includes('Wall Ball 9kg'), 'Wall Ball NÃO entra: a taxonomia já o resolveu');
  ok(c.exerciciosSemGrupo.length === 2, `nome repetido entra uma vez só (${c.exerciciosSemGrupo.join(', ')})`);
  ok(c.exerciciosSemGrupo.includes('Devil Press') && c.exerciciosSemGrupo.includes('Sled Pull'),
    'o alerta diz QUAIS exercícios mapear, não só quantos');
}

// O teto protege o documento do Firestore.
{
  const muitos: TreinoParaVolume = {
    dateId: '2026-09-16', sistema: 'GAP',
    exercicios: Array.from({ length: 40 }, (_, i) => ({
      nome: `Movimento ${i}`, series: 1, grupamentos: [], implemento: '',
    })),
  };
  const c = consolidar([muitos], 'semana', 'x', faixaDaSemana('2026-09-16'));
  ok(c.seriesSemGrupo === 40, 'a CONTA não é limitada pelo teto de nomes');
  ok(c.exerciciosSemGrupo.length === MAX_SEM_GRUPO, `a LISTA para em ${MAX_SEM_GRUPO} nomes`);
}


console.log('\nPRÉ-PARSER: LER A LOUSA SEM GASTAR OPENAI\n');

// Os números. "4x15" é a gramática da lousa.
ok(extrairSeriesReps('Wall Ball 4x15')?.series === 4, '"4x15" ➔ 4 séries');
ok(extrairSeriesReps('Wall Ball 4x15')?.reps === '15', '"4x15" ➔ 15 reps');
ok(extrairSeriesReps('Agachamento 4 x 8')?.series === 4, 'espaço em volta do x não atrapalha');
ok(extrairSeriesReps('Supino 5X5')?.series === 5, 'X maiúsculo vale');
ok(extrairSeriesReps('Agachamento 4x8-12')?.reps === '8-12', 'faixa de repetição fica inteira');
ok(extrairSeriesReps('Remada 3×10')?.series === 3, 'o × de multiplicação também vale');

// O que NÃO pode virar série — é aqui que uma leitura errada nasceria.
ok(extrairSeriesReps('Corrida 400m') === null, '"400m" não é série');
ok(extrairSeriesReps('Prancha 40s') === null, '"40s" não é série');
ok(extrairSeriesReps('Descanso 1x') === null, '"1x" sem repetição não basta');
ok(extrairSeriesReps('Agachamento 100kg') === null, 'só carga não vira série');

// A carga.
ok(extrairCarga('Supino 4x8 100kg') === 100, '"100kg" ➔ 100');
ok(extrairCarga('Wall Ball 4x15 9 kg') === 9, 'espaço antes do kg vale');
ok(extrairCarga('Terra 3x3 92,5kg') === 92.5, 'vírgula decimal vira ponto');
ok(extrairCarga('Corrida 400m') === null, 'metro não é quilo');
ok(extrairCarga('Burpees 3x10') === null, 'sem carga devolve null, e não zero');

// O nome: tirar o que se reconhece e ficar com o resto funciona nas duas ordens.
ok(nomeDaLinha('Wall Ball 4x15 9kg') === 'Wall Ball', 'nome antes dos números');
ok(nomeDaLinha('4x15 Wall Ball 9kg') === 'Wall Ball', 'nome DEPOIS dos números (a ordem do chamado)');
ok(nomeDaLinha('  • Agachamento livre · 4x8 · RIR 2').startsWith('Agachamento livre'),
  'marcador e observação saem do nome');

ok(semMarcasDeCor('4x8 [[vermelho]]RIR 2[[/vermelho]]') === '4x8 RIR 2', 'marca de cor sai, texto fica');
ok(blocoDaLinha('C — Força') === 'C', 'cabeçalho de bloco é reconhecido');
ok(blocoDaLinha('Metcon') === 'D', 'nome do bloco sozinho também');
ok(blocoDaLinha('C 4x8') === null, 'linha com série não é cabeçalho');

console.log('\nPRÉ-PARSER: NA DÚVIDA, RECUSAR\n');

const LOUSA_BOA = [
  'HIIT',
  'C — Força',
  'Agachamento livre 4x8 100kg · RIR 2',
  'D — Metcon',
  '4x15 Wall Ball 9kg',
  '3x10 Burpees',
].join('\n');

{
  const r = preParse(LOUSA_BOA);
  ok(r.ok, `a lousa regular é aceita${r.ok ? '' : ` (recusou: ${r.motivo})`}`);
  if (r.ok) {
    ok(r.sistema === 'HIIT', 'o sistema sai da lousa');
    ok(r.linhas.length === 3, `3 exercícios (${r.linhas.length})`);
    ok(r.linhas[0].bloco === 'C' && r.linhas[1].bloco === 'D', 'cada exercício no bloco em que foi escrito');
    ok(r.linhas[0].cargaKg === 100, 'a carga do agachamento é lida');
    ok(r.linhas[1].nome === 'Wall Ball' && r.linhas[1].series === 4, 'Wall Ball 4 séries');
    ok(r.linhas[2].nome === 'Burpees' && r.linhas[2].series === 3, 'Burpees 3 séries');
  }
}

// Cada recusa abaixo é um caso em que ler local produziria treino errado.
const recusas: [string, string][] = [
  ['', 'lousa vazia'],
  ['C — Força\nAgachamento 4x8', 'sem sistema escrito'],
  ['HIIT\nAgachamento 4x8', 'exercício antes de qualquer bloco'],
  ['HIIT\nC — Força\nCorrida 400m', 'linha sem séries no meio do treino'],
  ['HIIT\nGAP\nC — Força\nAgachamento 4x8', 'dois sistemas na mesma lousa'],
  ['HIIT\nC — Força', 'nenhum exercício'],
];
for (const [texto, porque] of recusas) {
  const r = preParse(texto);
  ok(!r.ok, `recusa: ${porque}${r.ok ? ' — MAS ACEITOU' : ` (${r.motivo})`}`);
}

console.log('\nCATÁLOGO: O QUE É "CONHECER" UM EXERCÍCIO\n');

ok(chaveDe('Wall Ball') === 'wall-ball' && chaveDe('wall ball') === 'wall-ball'
  && chaveDe('Wall-Ball') === 'wall-ball', 'caixa, acento e hífen dão a MESMA chave');
ok(chaveDe('Agachamento Búlgaro') === 'agachamento-bulgaro', 'acento sai da chave');
ok(chaveDe('') === '' && chaveDe('///') === '', 'nome imprestável não vira chave');

ok(!itemUtil(null), 'nada não é item');
ok(!itemUtil({ nome: 'X', grupamentos: [], implemento: 'Barra', origem: 'ia' }), 'sem grupamento não serve');
ok(!itemUtil({ nome: 'X', grupamentos: ['Peito'], implemento: '', origem: 'ia' }), 'sem implemento não serve');
ok(!itemUtil({ nome: 'X', grupamentos: ['Perna'], implemento: 'Barra', origem: 'ia' }),
  'rótulo fora do vocabulário não serve — entraria no banco e contaminaria toda leitura futura');
ok(itemUtil({ nome: 'X', grupamentos: ['Peito'], implemento: 'Barra', origem: 'ia' }), 'com os dois, serve');

ok(daTaxonomia('Wall Ball 9kg')?.implemento === 'Bola', 'a taxonomia é o catálogo de fábrica');
ok(daTaxonomia('Agachamento livre') === null, 'o que não está na taxonomia não vem dela');

{
  const gravados = new Map([['agachamento-livre', {
    nome: 'Agachamento livre', grupamentos: ['Quadríceps', 'Glúteo'], implemento: 'Barra', origem: 'ia' as const,
  }]]);
  const r = resolver(['Agachamento livre', 'Wall Ball', 'Movimento Novo'], gravados);
  ok(r.conhecidos.size === 2, `catálogo + taxonomia resolvem 2 (${r.conhecidos.size})`);
  ok(r.desconhecidos.length === 1 && r.desconhecidos[0] === 'Movimento Novo',
    'só o desconhecido de verdade vai para a IA');
}
{
  // O catálogo do coach vence a taxonomia: é sobre o galpão DELE.
  const meu = new Map([['wall-ball', {
    nome: 'Wall Ball', grupamentos: ['Quadríceps'], implemento: 'Bola 9kg', origem: 'ia' as const,
  }]]);
  ok(resolver(['Wall Ball'], meu).conhecidos.get('wall-ball')?.implemento === 'Bola 9kg',
    'o item do coach vence o de fábrica');
}

ok(itemDaIA('X', { grupamentos: ['Peito'], implemento: 'Barra' })?.origem === 'ia', 'resposta boa vira item');
ok(itemDaIA('X', { grupamentos: ['Perna'], implemento: 'Barra' }) === null, 'resposta com rótulo inválido é descartada');
ok(itemDaIA('X', { grupamentos: [], implemento: 'Barra' }) === null, 'resposta sem grupamento é descartada');
ok(itemDaIA('X', null) === null, 'resposta vazia é descartada');

console.log('\nO CAMINHO RÁPIDO PRODUZ O MESMO TREINO QUE A IA\n');

{
  const pre = preParse(LOUSA_BOA);
  ok(pre.ok, 'a lousa do teste passa no pré-parser');
  if (pre.ok) {
    const gravados = new Map([['agachamento-livre', {
      nome: 'Agachamento livre', grupamentos: ['Quadríceps', 'Glúteo'], implemento: 'Barra', origem: 'ia' as const,
    }]]);
    const { conhecidos, desconhecidos } = resolver(pre.linhas.map((l) => l.nome), gravados);
    ok(desconhecidos.length === 0, `tudo conhecido, ZERO chamada à IA (faltaram: ${desconhecidos.join(', ') || 'nenhum'})`);

    // Passa pelo MESMO `extrairTreino` da resposta da IA — mesmas regras globais,
    // mesma taxonomia, mesma estimativa.
    const treino = montarTreino(montarComoIA(pre, conhecidos, chaveDe));
    ok(treino.sistema === 'HIIT', 'sistema preservado');
    ok(treino.estimativaSeries === 11, `séries somadas: 4+4+3 = 11 (${treino.estimativaSeries})`);
    const todos = treino.blocos.flatMap((b) => b.exercicios);
    ok(todos.length === 3, '3 exercícios no treino montado');

    // A COMPATIBILIDADE COM A CONSOLIDAÇÃO: é o que o dashboard vai contar.
    const paraVolume: TreinoParaVolume = {
      dateId: '2026-09-16', sistema: treino.sistema,
      exercicios: todos.map((ex) => ({
        nome: ex.nome, series: ex.series, grupamentos: ex.grupamentos, implemento: ex.implemento,
      })),
    };
    const c = consolidar([paraVolume], 'semana', 'x', faixaDaSemana('2026-09-16'));
    ok(c.totalSeries === 11, `o dashboard vê as 11 séries (${c.totalSeries})`);
    ok(c.seriesSemGrupo === 0, 'nenhuma série sem grupo — o caminho rápido não abre buraco no gráfico');
    ok((c.porGrupo.perna || 0) > 0 && (c.porGrupo.peito || 0) > 0, 'perna e peito creditados');
    ok(Object.keys(c.porImplemento).length === 3, `3 implementos na rosca (${Object.keys(c.porImplemento).join(', ')})`);
    ok(!Object.keys(c.porImplemento).includes(''), 'nenhum implemento vazio — era o risco de montar sem IA');

    // A carga não se perde: vira observação, porque o treino não tem campo de kg.
    const agacho = todos.find((e) => e.nome.includes('Agachamento'));
    ok(!!agacho && agacho.observacao.includes('100'), `a carga escrita na lousa sobrevive ("${agacho?.observacao}")`);
  }
}

// A regra global continua valendo no caminho rápido — é o mesmo `extrairTreino`.
{
  const pre = preParse('Hyrox\nD — Metcon\nPull up 4x8');
  ok(pre.ok, 'lousa com pull-up passa');
  if (pre.ok) {
    const { conhecidos } = resolver(pre.linhas.map((l) => l.nome), new Map());
    const treino = montarTreino(montarComoIA(pre, conhecidos, chaveDe));
    ok(treino.blocos[0].exercicios[0].nome === 'Puxada Alta Pegada Aberta',
      'Pull-up ➔ Puxada Alta também sem IA');
    ok(treino.substituicoes.length === 1, 'e a substituição fica registrada para o coach ver');
  }
}


console.log('\nEXCLUSÃO DE TREINO: O VOLUME TEM DE ENCOLHER\n');

// Hard delete e não `excluido: true` — a razão está em `deleteWorkoutLousa`.
// Isto CRAVA a razão: a consolidação é recalculada a partir da lista de
// treinos, então tirar o treino da lista já tira do gráfico. Com soft delete,
// todo leitor precisaria lembrar de filtrar a flag.
{
  const faixa = faixaDaSemana('2026-09-16');
  const a: TreinoParaVolume = {
    dateId: '2026-09-16', sistema: 'HIIT',
    exercicios: [{ nome: 'Wall Ball', series: 4, grupamentos: ['Quadríceps'], implemento: 'Bola' }],
  };
  const b: TreinoParaVolume = {
    dateId: '2026-09-17', sistema: 'GAP',
    exercicios: [{ nome: 'Burpees', series: 3, grupamentos: ['Peito'], implemento: 'Peso corporal' }],
  };

  const comOsDois = consolidar([a, b], 'semana', 'x', faixa);
  const soUm = consolidar([a], 'semana', 'x', faixa);

  ok(comOsDois.totalSeries === 7 && soUm.totalSeries === 4,
    `tirar o treino da lista tira as séries dele (7 ➔ ${soUm.totalSeries})`);
  ok(comOsDois.treinos === 2 && soUm.treinos === 1, 'a contagem de treinos encolhe junto');
  ok((comOsDois.porGrupo.peito || 0) === 3 && (soUm.porGrupo.peito || 0) === 0,
    'o grupo que só o treino apagado alimentava volta a zero');
  ok(Object.keys(soUm.porImplemento).length === 1,
    'o implemento que só ele usava sai da rosca de variabilidade');

  // Apagar TUDO não pode deixar resto nem quebrar.
  const vazio = consolidar([], 'semana', 'x', faixa);
  ok(vazio.totalSeries === 0 && vazio.treinos === 0 && Object.keys(vazio.porGrupo).length === 0,
    'apagar o último treino da semana zera o consolidado sem quebrar');
  ok(Object.keys(vazio.metas).length === GRUPOS_VOL.length,
    'e as metas continuam lá — a semana vazia mostra o quanto falta, não uma tela em branco');
}


console.log('\nEXCLUIR TREINO: A CÓPIA DE SEGURANÇA NÃO PODE FALHAR\n');

// O Firestore RECUSA `undefined`, de forma SÍNCRONA, e o erro estoura no `set()`
// antes de qualquer rede — o coach vê "erro interno" e o log não diz nada. Como
// esse `set` é justamente o que arquiva o treino ANTES de apagá-lo, uma falha
// ali derruba a única cópia de segurança que existe.
ok(JSON.stringify(limparParaGravar({ a: 1, b: undefined })) === '{"a":1}', 'undefined no topo sai');
ok(JSON.stringify(limparParaGravar({ t: { titulo: undefined, sistema: 'HIIT' } })) === '{"t":{"sistema":"HIIT"}}',
  'undefined aninhado sai');
ok(JSON.stringify(limparParaGravar({ ex: [{ nome: 'A', obs: undefined }] })) === '{"ex":[{"nome":"A"}]}',
  'undefined dentro de array de objetos sai');
ok(JSON.stringify(limparParaGravar({ x: [1, undefined, 2] })) === '{"x":[1,2]}', 'undefined dentro de array sai');

// `null` PASSA: o Firestore o aceita, e trocá-lo por ausente mudaria o
// documento arquivado — que é o que alguém vai ler para restaurar.
ok(JSON.stringify(limparParaGravar({ a: null })) === '{"a":null}', 'null é preservado, não é o mesmo que undefined');
ok(JSON.stringify(limparParaGravar({ a: 0, b: '', c: false })) === '{"a":0,"b":"","c":false}',
  'zero, string vazia e false continuam lá');

{
  // Timestamp, GeoPoint e afins não podem ser reconstruídos campo a campo:
  // a cópia sairia como objeto comum e o documento arquivado mudaria de tipo.
  class FalsoTimestamp { constructor(public segundos: number) {} }
  const t = new FalsoTimestamp(123);
  const r = limparParaGravar({ quando: t });
  ok(r.quando === t, 'objeto de classe (Timestamp) passa intacto, por referência');
}
{
  // O treino de verdade: fundo, com blocos e exercícios.
  const treino = limparParaGravar({
    dateId: '2026-09-18',
    treino: { titulo: 'HIPERTROFIA 2 errado', sistema: undefined, blocos: [
      { id: 'C', exercicios: [{ nome: 'Agachamento', series: 4, observacao: undefined }] },
    ] },
  });
  ok(!('sistema' in (treino.treino as Record<string, unknown>)), 'o campo ausente do treino não vai para o arquivo');
  ok((treino.treino as any).blocos[0].exercicios[0].nome === 'Agachamento', 'e o resto do treino chega inteiro');
}
ok(limparParaGravar(null) === null && limparParaGravar(undefined) === undefined,
  'limparParaGravar não quebra com entrada vazia');

console.log(
  falhas === 0
    ? '\n✓ A leitura da IA, a de preço e o Montador Híbrido aguentam entrada torta.\n'
    : `\n✗ ${falhas} verificação(ões) falharam.\n`,
);
process.exitCode = falhas === 0 ? 0 : 1;
