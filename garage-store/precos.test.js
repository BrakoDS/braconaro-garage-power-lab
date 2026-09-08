import test from 'node:test';
import assert from 'node:assert/strict';
import { fundirPrecos, rotuloVerificado, estadoPrecos } from './precos.js';

const PRODUTOS = [
  { id: 'a', nome: 'Creatina Dux', preco: 48.9, url: 'https://meli.la/1' },
  { id: 'b', nome: 'Whey Max', preco: 129.9, url: 'https://meli.la/2' },
  { id: 'c', nome: 'Cinto', preco: 89, url: 'https://meli.la/3' },
];

const feedCom = (itens) => ({ atualizadoEm: 2000, rodada: { total: 3, lidos: 3, falhas: 0, travou: false }, itens });

test('o preço do feed vence o preço digitado no catálogo', () => {
  const r = fundirPrecos(PRODUTOS, feedCom({ a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 } }));
  assert.equal(r.find((p) => p.id === 'a').preco, 39.09);
  assert.equal(r.find((p) => p.id === 'a').verificadoEm, 2000);
});

test('produto sem entrada no feed mantém o preço do catálogo', () => {
  const r = fundirPrecos(PRODUTOS, feedCom({ a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 } }));
  const b = r.find((p) => p.id === 'b');
  assert.equal(b.preco, 129.9);
  assert.equal(b.verificadoEm, undefined, 'sem feed não pode fingir que foi verificado');
});

test('produto com leitura falhada some da vitrine', () => {
  const r = fundirPrecos(PRODUTOS, feedCom({
    a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: 500 },
  }));
  assert.equal(r.length, 2);
  assert.ok(!r.some((p) => p.id === 'a'), 'o produto que falhou não pode aparecer');
});

test('feed ausente ou corrompido devolve a lista original sem quebrar', () => {
  assert.equal(fundirPrecos(PRODUTOS, null).length, 3);
  assert.equal(fundirPrecos(PRODUTOS, {}).length, 3);
  assert.equal(fundirPrecos(PRODUTOS, { itens: 'lixo' }).length, 3);
  assert.equal(fundirPrecos(null, feedCom({})).length, 0);
});

test('o preço do feed só vale para a URL que o robô leu', () => {
  const mesmaUrl = fundirPrecos(PRODUTOS, feedCom({
    a: { estado: 'ok', preco: 39.09, verificadoEm: 2000, url: 'https://meli.la/1' },
  }));
  assert.equal(mesmaUrl.find((p) => p.id === 'a').preco, 39.09, 'URL igual: o feed vence');

  const outraUrl = fundirPrecos(PRODUTOS, feedCom({
    a: { estado: 'ok', preco: 39.09, verificadoEm: 2000, url: 'https://meli.la/OUTRO' },
  }));
  const a = outraUrl.find((p) => p.id === 'a');
  assert.equal(a.preco, 48.9, 'URL diferente: vale o preço do catálogo');
  assert.equal(a.verificadoEm, undefined, 'e sem carimbo, porque este link nunca foi lido');
});

test('item de feed antigo, gravado sem URL, continua valendo (retrocompatibilidade)', () => {
  // O feed que está em produção hoje foi gravado antes de o campo `url` existir.
  // Exigir a URL faria TODOS os preços lidos sumirem da vitrine de uma vez, no
  // deploy, até a rodada das 05:00 seguinte regravar o feed com URL.
  const semUrl = fundirPrecos(PRODUTOS, feedCom({
    a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 },
    b: { estado: 'falhou', motivo: 'http', preco: 129.9, verificadoEm: 500 },
  }));
  assert.equal(semUrl.find((p) => p.id === 'a').preco, 39.09, 'item sem url: comportamento de antes');
  assert.ok(!semUrl.some((p) => p.id === 'b'), 'e a falha sem url continua tirando o produto da vitrine');
});

test('trocar o link de um produto não faz o preço do produto ANTIGO ser carimbado no novo', () => {
  // O risco: `id` é o slug do nome de quando o produto foi criado e SOBREVIVE à
  // edição (`academia/db.js` preserva o id no ramo de atualização). Então:
  //   05:00 — a rodada lê a Creatina Dux e grava R$ 39,09 "verificado hoje";
  //   10:00 — o link de afiliado morre, o coach aponta a mesma ficha para outra
  //           creatina, corrige nome e preço (R$ 78,90) e publica. O id não muda.
  // Sem conferir a URL, o aluno veria o produto NOVO por R$ 39,09 — o preço do
  // produto velho — com a legenda "verificado hoje" fazendo o número errado
  // parecer mais confiável que o preço digitado. E isso duraria até a rodada
  // seguinte, quase um dia inteiro.
  const feedDas5 = feedCom({
    creatina_dux_300g: {
      estado: 'ok', preco: 39.09, verificadoEm: 2000, url: 'https://meli.la/dux-que-morreu',
    },
  });
  const catalogoDas10 = [{
    id: 'creatina_dux_300g', nome: 'Creatina Growth 250g', preco: 78.9,
    url: 'https://meli.la/growth-nova',
  }];

  const [visto] = fundirPrecos(catalogoDas10, feedDas5);
  assert.equal(visto.preco, 78.9, 'o aluno vê o preço que o coach digitou para o link novo');
  assert.equal(visto.verificadoEm, undefined, 'e nada diz "verificado", porque o robô não leu este link');
});

test('a faixa da gestão diz o MOTIVO da falha, para o coach saber o que fazer', () => {
  const faixa = (itens, rodada) => estadoPrecos({ atualizadoEm: Date.now(), rodada, itens }, PRODUTOS).texto;
  const uma = { total: 3, lidos: 2, falhas: 1, travou: false };
  const duas = { total: 3, lidos: 1, falhas: 2, travou: false };

  const link = faixa({ a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: 500 } }, uma);
  assert.match(link, /link não respondeu/, 'http: o coach precisa conferir o link');

  const prazo = faixa({ a: { estado: 'falhou', motivo: 'prazo', preco: 48.9, verificadoEm: 500 } }, uma);
  assert.match(prazo, /não deu tempo/, 'prazo: é limite nosso, não há link a conferir');
  assert.doesNotMatch(prazo, /vale conferir/, 'e não pode mandar o coach investigar o link à toa');
  assert.doesNotMatch(prazo, /próxima rodada pega/, 'não pode prometer um conserto que a rotina não garante');

  for (const motivo of ['sem-og', 'sem-card', 'titulo-nao-bate']) {
    const pagina = faixa({ a: { estado: 'falhou', motivo, preco: 48.9, verificadoEm: 500 } }, uma);
    assert.match(pagina, /página do Mercado Livre veio diferente/, `${motivo}: a página mudou`);
  }

  // sem-preco: a página foi entendida (o título casou), só não trazia preço —
  // motivo próprio, separado do grupo "página quebrada", porque a ação do coach
  // é outra: trocar o produto, não esperar o site "se resolver".
  const semPreco = faixa({ a: { estado: 'falhou', motivo: 'sem-preco', preco: 48.9, verificadoEm: 500 } }, uma);
  assert.match(semPreco, /sem preço/, 'sem-preco: fala do anúncio sem preço');
  assert.match(semPreco, /esgotado|saído do ar/, 'sem-preco: sugere a causa típica');
  assert.doesNotMatch(semPreco, /página do Mercado Livre veio diferente/, 'sem-preco não é problema de página');

  // Motivos diferentes não podem ser escondidos atrás de um só rótulo: o coach
  // tem uma coisa a fazer com um produto e outra com o outro.
  const misto = faixa({
    a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: 500 },
    b: { estado: 'falhou', motivo: 'prazo', preco: 129.9, verificadoEm: 500 },
  }, duas);
  assert.match(misto, /link não respondeu \(Creatina Dux\)/, 'cada motivo aponta os seus produtos');
  assert.match(misto, /não deu tempo[^(]*\(Whey Max\)/);

  // Feed velho, sem `motivo` gravado: a faixa volta ao texto de antes em vez de
  // inventar uma causa.
  const semMotivo = faixa({ a: { estado: 'falhou', preco: 48.9, verificadoEm: 500 } }, uma);
  assert.ok(semMotivo.endsWith('Creatina Dux.'), 'sem motivo, nada é acrescentado');
});

test('o rótulo do card diz a idade do preço em português de gente', () => {
  const agora = new Date('2026-08-25T10:00:00').getTime();
  assert.equal(rotuloVerificado(new Date('2026-08-25T05:03:00').getTime(), agora), 'verificado hoje');
  assert.equal(rotuloVerificado(new Date('2026-08-24T05:03:00').getTime(), agora), 'verificado ontem');
  assert.equal(rotuloVerificado(new Date('2026-08-20T05:03:00').getTime(), agora), 'verificado em 20/ago');
  assert.equal(rotuloVerificado(null, agora), '');
});

test('a faixa da gestão distingue os três estados', () => {
  assert.equal(estadoPrecos(null, PRODUTOS).tipo, 'nunca');

  const bom = estadoPrecos(feedCom({
    a: { estado: 'ok', preco: 39.09, verificadoEm: 2000 },
  }), PRODUTOS);
  assert.equal(bom.tipo, 'ok');

  const comFalha = estadoPrecos({
    atualizadoEm: 2000,
    rodada: { total: 3, lidos: 2, falhas: 1, travou: false },
    itens: { a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: 500 } },
  }, PRODUTOS);
  assert.equal(comFalha.tipo, 'falhas');
  assert.ok(comFalha.texto.includes('Creatina Dux'), 'a faixa precisa NOMEAR o produto fora do ar');

  // `estadoPrecos` usa `travadaEm` (não `atualizadoEm`) para datar a trava: o
  // ramo travado do backend deliberadamente não escreve `atualizadoEm`, para não
  // mentir dizendo que os preços são de hoje (ver `functions/src/index.ts`).
  const travada = estadoPrecos({
    travadaEm: 2000,
    rodada: { total: 22, lidos: 3, falhas: 19, travou: true },
    itens: {},
  }, PRODUTOS);
  assert.equal(travada.tipo, 'travou');
  assert.ok(travada.texto.includes('19'), 'e quantos falharam quando a trava dispara');
});

test('a faixa da gestão fala português certo quando o carimbo é de vários dias atrás', () => {
  // Regressão: quando o carimbo não é "hoje" nem "ontem", `rotuloVerificado`
  // devolve "verificado em D/mmm" — e o ramo de falhas colava isso direto
  // depois de "desde", resultando em "desde em D/mmm". Usamos dias relativos a
  // `Date.now()` (a mesma âncora que `estadoPrecos` usa por baixo) para o teste
  // não depender de uma data fixa e não quebrar quando o ano virar.
  const seiDiasAtras = new Date();
  seiDiasAtras.setDate(seiDiasAtras.getDate() - 6);
  const ts = seiDiasAtras.getTime();
  const rotulo = rotuloVerificado(ts); // "verificado em D/mmm", mesma função usada por estadoPrecos
  const dataComEm = rotulo.replace('verificado ', ''); // "em D/mmm"
  const dataSemEm = dataComEm.replace(/^em /, ''); // "D/mmm" — forma correta depois de "desde"

  const ok = estadoPrecos({
    atualizadoEm: ts,
    rodada: { total: 3, lidos: 3, falhas: 0, travou: false },
    itens: {},
  }, PRODUTOS);
  assert.equal(ok.texto, `Preços verificados ${dataComEm} · 3 de 3`);

  const comFalha = estadoPrecos({
    atualizadoEm: ts,
    rodada: { total: 3, lidos: 2, falhas: 1, travou: false },
    itens: { a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: ts } },
  }, PRODUTOS);
  // A frase do motivo entra depois do ponto — o começo da faixa é o mesmo de antes.
  assert.equal(
    comFalha.texto,
    `1 produto fora da vitrine desde ${dataSemEm}: Creatina Dux.` +
      ' O link não respondeu — vale conferir se ainda está no ar.',
  );

  const duasFalhas = estadoPrecos({
    atualizadoEm: ts,
    rodada: { total: 3, lidos: 1, falhas: 2, travou: false },
    itens: {
      a: { estado: 'falhou', motivo: 'http', preco: 48.9, verificadoEm: ts },
      b: { estado: 'falhou', motivo: 'http', preco: 129.9, verificadoEm: ts },
    },
  }, PRODUTOS);
  assert.match(duasFalhas.texto, /^2 produtos fora da vitrine desde /, 'plural correto com mais de uma falha');

  const travada = estadoPrecos({
    travadaEm: ts,
    rodada: { total: 22, lidos: 3, falhas: 19, travou: true },
    itens: {},
  }, PRODUTOS);
  assert.equal(
    travada.texto,
    `A leitura falhou em 19 de 22 ${dataComEm}. Nada foi alterado — os preços continuam os da última rodada boa. Provável mudança no site do Mercado Livre.`,
  );
});
