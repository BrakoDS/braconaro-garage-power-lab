/**
 * Confere o avaliador de evolução por fotos (`evolucao-ia.ts`) sem gastar
 * chamada de API: o pedido que vem do navegador (só URL do nosso Storage, data
 * real, ângulo da lista, peso plausível), o conteúdo na ordem em que o modelo
 * lê, e a resposta quando o modelo não colabora (JSON quebrado, recusa, vazio).
 *
 *     npm run checar:evolucao
 */
import {
  INSTRUCOES_EVOLUCAO, MAX_FOTOS, SCHEMA_EVOLUCAO, dataValida, extrairRelatorio, lerPedido, montarConteudo,
  rotuloDaFoto, urlDoBucket, type PedidoEvolucao,
} from './evolucao-ia';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else { falhas++; console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`); }
}

const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/projeto-garage-f0a2f.firebasestorage.app/o/';
const diario = (dia: string) => `${BUCKET}diario%2Fana%40x.com%2F${dia}.webp?alt=media&token=t`;
const aval = (n: number, slot: string) => `${BUCKET}gestao%2Fuid1%2F012%2Faval-${n}-${slot}.webp?alt=media&token=t`;
const foto = (data: string, extra: Record<string, unknown> = {}) => ({ data, url: diario(data), origem: 'diario', ...extra });

console.log('\nPEDIDO DO NAVEGADOR\n');

ok(urlDoBucket(diario('2026-10-01')) && urlDoBucket(aval(3, 'frente')), 'aceita as fotos do Diário e das avaliações, no bucket do projeto');
ok(!urlDoBucket('https://evil.example/x.webp'), 'recusa endereço de fora (a função baixaria qualquer coisa)');
ok(!urlDoBucket(`${BUCKET}chats%2Fana%2Fx.webp?alt=media`), 'recusa outra pasta do bucket (chats, portal…)');
ok(!urlDoBucket(BUCKET.replace('projeto-garage-f0a2f', 'outro-projeto') + 'diario%2Fx.webp'), 'recusa outro bucket');
ok(!urlDoBucket(`${diario('2026-10-01')} `) && !urlDoBucket(123), 'recusa URL com espaço e o que não é texto');
ok(dataValida('2028-02-29') && !dataValida('2026-02-30') && !dataValida('01/10/2026'), 'data só no formato do sistema e que existe');

{
  const p = lerPedido({
    nome: '  Ana   Paula Souza ',
    sexo: 'feminino',
    objetivo: 'Emagrecimento',
    fotos: [
      foto('2026-10-20', { angulo: 'lado', peso: '71,5' }),
      foto('2026-09-01', { angulo: 'frente', peso: 74 }),
      { data: '2026-09-01', url: aval(1, 'costas'), origem: 'avaliacao', angulo: 'costas', peso: 74 },
      foto('2026-09-01', { angulo: 'frente' }), // a mesma URL de novo
      foto('2026-10-01', { angulo: 'diagonal', peso: 900 }),
    ],
  }) as PedidoEvolucao;
  ok(typeof p === 'object', 'pedido bom passa');
  ok(p.nome === 'Ana', 'do nome, só o primeiro sai do box (é o que o feedback usa)');
  ok(p.fotos.length === 4, 'a mesma foto mandada duas vezes conta uma', String(p.fotos.length));
  ok(p.fotos.map((f) => f.data).join(' ') === '2026-09-01 2026-09-01 2026-10-01 2026-10-20', 'da mais antiga para a mais nova');
  ok(p.fotos[0].angulo === 'frente' && p.fotos[1].angulo === 'costas', 'no mesmo dia, Frente antes de Costas');
  ok(p.fotos[1].origem === 'avaliacao' && p.fotos[0].origem === 'diario', 'a origem de cada foto chega');
  ok(p.fotos[3].peso === 71.5 && p.fotos[0].peso === 74, 'peso com vírgula da ficha vira número');
  ok(!('angulo' in p.fotos[2]) && !('peso' in p.fotos[2]), 'ângulo fora da lista e peso impossível somem, a foto fica');
  ok(p.sexo === 'feminino' && p.objetivo === 'Emagrecimento', 'sexo e objetivo vão como contexto');
}

ok(typeof lerPedido({ fotos: [foto('2026-10-01')] }) === 'string', 'uma foto só não é comparação');
ok(typeof lerPedido({ fotos: [foto('2026-10-01'), foto('2026-10-01')] }) === 'string', 'duas cópias da mesma foto também não');
ok(typeof lerPedido({ fotos: Array.from({ length: MAX_FOTOS + 1 }, (_, i) => foto(`2026-10-${String(i + 1).padStart(2, '0')}`)) }) === 'string',
  `mais de ${MAX_FOTOS} fotos é recusado`);
ok(lerPedido({ fotos: [foto('2026-10-01'), { data: '2026-10-02', url: 'https://evil.example/a.webp' }] }) === 'Uma das fotos não é do Storage do box.',
  'uma URL de fora derruba o pedido inteiro (não é descartada em silêncio)');
ok(typeof lerPedido({ fotos: [foto('2026-10-01'), foto('2026-13-01')] }) === 'string', 'data inexistente derruba o pedido');
ok(typeof lerPedido(null) === 'string' && typeof lerPedido({ fotos: 'x' }) === 'string', 'pedido torto vira mensagem, não exceção');
{
  const p = lerPedido({ sexo: 'outro', fotos: [foto('2026-10-01'), foto('2026-10-02')] }) as PedidoEvolucao;
  ok(p.nome === '' && !('sexo' in p) && !('objetivo' in p), 'sem nome, sexo fora da lista e sem objetivo: nada inventado');
}

console.log('\nO QUE O MODELO LÊ\n');
{
  const p = lerPedido({
    nome: 'Bruno', fotos: [
      foto('2026-09-01', { angulo: 'lado', peso: 82.4 }),
      { data: '2026-10-15', url: aval(2, 'lado'), origem: 'avaliacao', angulo: 'lado', peso: 80 },
    ],
  }) as PedidoEvolucao;
  ok(rotuloDaFoto(p.fotos[0], 0) === 'Foto 1 — 01/09/2026 · Perfil · 82,4 kg · diário do aluno', 'rótulo: data, "Perfil", peso com vírgula, origem',
    rotuloDaFoto(p.fotos[0], 0));
  ok(rotuloDaFoto({ data: '2026-09-01', url: '', origem: 'diario' }, 4) === 'Foto 5 — 01/09/2026 · ângulo não marcado · diário do aluno',
    'foto antiga sem ângulo diz que não foi marcado');
  const c = montarConteudo(p, ['data:image/webp;base64,AAA', 'data:image/webp;base64,BBB']);
  ok(c.length === 5 && c[0].type === 'input_text', 'contexto + (rótulo, imagem) por foto');
  ok(c[0].type === 'input_text' && c[0].text.includes('Aluno: Bruno') && c[0].text.includes('2 fotos'), 'o contexto traz o nome e a contagem');
  ok(c[2].type === 'input_image' && c[2].image_url.endsWith('AAA') && c[4].type === 'input_image' && c[4].image_url.endsWith('BBB'),
    'cada imagem vem logo depois do rótulo dela, na ordem cronológica');
  ok(c.every((x) => x.type !== 'input_image' || x.detail === 'high'), 'as imagens vão em alta (detalhe de cintura some no "low")');
  ok(!JSON.stringify(c).includes('token='), 'a URL do Storage (com o token) não vai para a OpenAI, só a imagem');
}
ok(/primeiro nome/.test(INSTRUCOES_EVOLUCAO) && /percentual de gordura/.test(INSTRUCOES_EVOLUCAO) && /diagnóstico/.test(INSTRUCOES_EVOLUCAO),
  'as instruções pedem o primeiro nome e proíbem % de gordura e diagnóstico');
ok(SCHEMA_EVOLUCAO.required.join() === 'qualidade,evolucao,atencao,feedback', 'o schema tem as quatro partes do relatório');

console.log('\nRESPOSTA DO MODELO\n');

const resposta = (texto: string) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: texto }] }] });
const BOA = {
  qualidade: { nivel: 'parcial', avisos: ['Luz mais quente na foto de 15/10.'] },
  evolucao: ['Cintura aparentemente mais fina de 01/09 para 15/10.'],
  atencao: ['Leve anteversão pélvica no perfil: incluir prancha e ponte de glúteo.'],
  feedback: 'Bruno, sua cintura já mostra resultado!',
};
{
  const r = extrairRelatorio(resposta(JSON.stringify(BOA)));
  ok(!!r && r.qualidade.nivel === 'parcial' && r.evolucao.length === 1 && r.feedback.startsWith('Bruno'), 'resposta boa vira relatório');
  const atalho = extrairRelatorio({ output_text: `Aqui está: ${JSON.stringify(BOA)} fim.` });
  ok(!!atalho && atalho.atencao.length === 1, 'aceita o atalho output_text e texto em volta do JSON');
}
ok(extrairRelatorio(resposta('{"qualidade": {"nivel": "boa", "avisos": [')) === null, 'JSON cortado no limite de tokens: sem relatório (a tela avisa)');
ok(extrairRelatorio({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I can’t help with that.' }] }] }) === null,
  'recusa do modelo: sem relatório');
ok(extrairRelatorio(resposta(JSON.stringify({ qualidade: { nivel: 'boa', avisos: [] }, evolucao: [], atencao: [], feedback: '' }))) === null,
  'relatório todo vazio conta como sem relatório');
ok(extrairRelatorio(null) === null && extrairRelatorio('x') === null, 'resposta que não é objeto: sem relatório');
{
  const r = extrairRelatorio(resposta(JSON.stringify({
    qualidade: { nivel: 'excelente', avisos: 'nenhum' },
    evolucao: Array.from({ length: 20 }, (_, i) => `ponto ${i}  com   espaços`),
    atencao: [null, 42, '  ', 'x'.repeat(900)],
    feedback: 'y'.repeat(5000),
  })))!;
  ok(r.qualidade.nivel === 'parcial' && r.qualidade.avisos.length === 0, 'nível fora da lista vira "parcial"; avisos que não são lista somem');
  ok(r.evolucao.length === 8 && r.evolucao[0] === 'ponto 0 com espaços', 'lista longa é cortada em 8 e o espaço sobrando sai');
  ok(r.atencao.length === 1 && r.atencao[0].length === 400, 'item que não é texto sai e frase gigante é aparada');
  ok(r.feedback.length === 1500, 'o feedback tem teto');
}

console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ evolucao-ia.ts conferido.');
process.exit(falhas ? 1 : 0);
