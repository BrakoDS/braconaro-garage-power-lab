/**
 * Confere as funções por time (etapa 7) sem rede: a chave de cada time, o
 * limite por minuto, o despacho das três funções, o log de TODA chamada (sem os
 * dados devolvidos) e a regra de LGPD — nenhuma consulta do Time Administrativo
 * devolve dado de saúde, em fichas sorteadas, procurado campo a campo e por um
 * texto-sentinela plantado nos campos de saúde.
 *
 *     npm run build && node lib/checar-agentes.js
 */
import { Limite, LIMITE_POR_MINUTO, atenderAgente, regrasDosAgentes, timeDaChave, type DepsDosAgentes, type LinhaDoLog } from './agentes';

let falhas = 0;
function ok(cond: boolean, desc: string, detalhe = ''): void {
  if (cond) console.log(`  ✓ ${desc}`);
  else { falhas++; console.log(`  ✗ ${desc}${detalhe ? `\n      ${detalhe}` : ''}`); }
}

const CHAVES = { administrativo: 'adm-chave-de-teste-com-mais-de-24', alunos: 'alu-chave-de-teste-com-mais-de-24' };
const SENTINELA = 'SENTINELA-DE-SAUDE';

type Dados = Record<string, unknown>;

/** Todas as chaves de um valor, em qualquer profundidade. */
function chavesDe(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => chavesDe(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); chavesDe(x, out); }
  return out;
}

async function main() {
  const regras = await regrasDosAgentes();
  const CAMPOS_DE_SAUDE = (regras as unknown as { CAMPOS_DE_SAUDE: string[] }).CAMPOS_DE_SAUDE;

  console.log('\nA CHAVE DE CADA TIME\n');
  ok(timeDaChave(`Bearer ${CHAVES.administrativo}`, CHAVES) === 'administrativo', 'a chave do Administrativo abre o Administrativo');
  ok(timeDaChave(`bearer ${CHAVES.alunos}`, CHAVES) === 'alunos', 'a do Time de Alunos abre o de Alunos (o "Bearer" em qualquer caixa)');
  ok(timeDaChave('Bearer chave-errada-mas-comprida-o-bastante', CHAVES) === null, 'chave errada: nenhum time');
  ok(timeDaChave(undefined, CHAVES) === null && timeDaChave(CHAVES.alunos, CHAVES) === null, 'sem cabeçalho, ou sem o "Bearer": nenhum time');
  ok(timeDaChave('Bearer ', { administrativo: '', alunos: '' }) === null && timeDaChave('Bearer curta', { administrativo: 'curta', alunos: '' }) === null,
    'segredo vazio ou curto (não cadastrado) não abre nada');

  console.log('\nO LIMITE POR MINUTO\n');
  {
    const l = new Limite(3);
    ok([0, 1, 2].every((i) => l.aceitar('alunos', 1000 + i)) && !l.aceitar('alunos', 1500), '3 chamadas aceitas, a 4ª no mesmo minuto recusada');
    ok(l.aceitar('administrativo', 1500), 'o limite é de cada time');
    ok(l.aceitar('alunos', 61_100), 'passado um minuto, volta a aceitar');
    ok(LIMITE_POR_MINUTO === 60, 'o limite de produção é 60 por minuto');
  }

  // Fichas sorteadas, com dado de saúde plantado (o sentinela) em todo campo de saúde.
  let semente = 7;
  const sorteio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const um = <T,>(xs: readonly T[]) => xs[Math.floor(sorteio() * xs.length)];
  const fichas: Dados[] = Array.from({ length: 40 }, (_, i) => ({
    id: String(i + 1).padStart(3, '0'), nome: `Aluno ${i + 1}`, email: `a${i}@x.com`, telefone: sorteio() < 0.8 ? '11999990000' : '',
    status: um(['ativo', 'ativo', 'ativo', 'pausado', 'inativo']), mensalidade: um(['130', '150', '']), vencimento: '10',
    plano: sorteio() < 0.8 ? { vezes: um([2, 3, 4, 'ilimitado']), prazo: 'mensal' } : undefined, inicio: sorteio() < 0.7 ? '2026-10-01' : '',
    cortesia: sorteio() < 0.1 ? { motivo: 'X' } : undefined,
    pagamentos: sorteio() < 0.5 ? { '2026-11': true } : {},
    recebimentos: sorteio() < 0.3 ? { '2026-11': { valor: 130, data: '2026-11-05', meio: 'pix-chave', comprovante: 'gestao/x/y.webp', conferidoPor: 'coach' } } : {},
    consumos: [{ id: `c${i}`, nome: 'Gel', preco: 20, qtd: 2, unitario: 10, data: '2026-11-03', mesId: '2026-11' }],
    comprasNaHora: sorteio() < 0.3 ? [{ id: `h${i}`, nome: 'Água', qtd: 1, unitario: 5, valor: 5, data: '2026-11-04', meio: 'dinheiro', em: 1 }] : [],
    presencas: ['2026-11-03', '2026-11-05'], faltas: { '2026-11-07': { tipo: um(['no-show', 'fora-do-prazo']) } },
    atestados: sorteio() < 0.3 ? { '2026-11-04': { tipo: 'desmarcacao', expira: '2026-11-30' } } : {},
    marcacoes: sorteio() < 0.2 ? { '2026-11-06': { hora: '07:00', noShow: true } } : {},
    // O que o Administrativo NUNCA pode receber:
    avaliacoes: [{ peso: 80, dataRealizada: '2026-10-01', obs: SENTINELA }], restricoes: [{ evitarId: SENTINELA }], anamnese: { obs: SENTINELA },
    saude: SENTINELA, alertaMedico: SENTINELA, metas: [{ id: 'm1', tipo: 'peso', alvo: 70, nota: SENTINELA }], metasGrupo: { perna: SENTINELA },
    matriz: { x: SENTINELA }, foco: [SENTINELA], feedbacks: [{ texto: SENTINELA }], sexo: SENTINELA, nascimento: SENTINELA,
    peso: SENTINELA, altura: SENTINELA,
  }));
  const fechamentos = {
    '2026-10': { mesId: '2026-10', situacao: 'aprovado', aprovadoEm: 1, totais: { previsto: 100, recebido: 80 },
      divergencias: [{ tipo: 'em-aberto', alunoId: '001', nome: 'Aluno 1', total: 20 }],
      linhas: { '001': { nome: 'Aluno 1', total: 20, vencimento: '2026-10-10', pagavel: true, situacao: 'vencido', itens: [], recebimento: { comprovante: SENTINELA } } } },
  };
  const ctxBase = {
    fichas, hojeIso: '2026-11-20', fechamentos,
    meta: { experimentais: { '2026-11-02': [{ tipo: 'daypass', nome: 'Visitante', pagamento: { valor: 50, meio: 'cartao' } }] }, vendasAvulsas: {} },
    ocupacao: [{ dia: '2026-11-20', hora: '07:00', capacidade: 6, ocupadas: 2, vagas: 4 }],
    avaliacoes: [{ id: 'av1', peso: 80, dataRealizada: '2026-10-01', fotoFrente: 'gestao/x/f.webp', urlFoto: 'https://x' }],
    consentimentos: ['a1@x.com', 'a2@x.com'],
  };

  console.log('\nLGPD: O TIME ADMINISTRATIVO NÃO RECEBE DADO DE SAÚDE\n');
  const consultasAdm = Object.keys(regras.CONSULTAS).filter((k) => regras.CONSULTAS[k].times.includes('administrativo'));
  for (const c of consultasAdm) {
    for (const mes of ['2026-10', '2026-11']) {
      const r = regras.consultar('administrativo', c, { mes }, ctxBase) as Dados;
      const proibidas = [...chavesDe(r)].filter((k) => CAMPOS_DE_SAUDE.includes(k));
      ok(!('erro' in r) && proibidas.length === 0 && !JSON.stringify(r).includes(SENTINELA),
        `"${c}" (${mes}): nenhum campo de saúde, nenhum valor plantado`, `${proibidas.join(', ')} ${JSON.stringify(r).slice(0, 200)}`);
    }
  }
  ok(!JSON.stringify(regras.consultar('administrativo', 'pagamentos', { mes: '2026-11' }, ctxBase)).includes('gestao/x/y.webp'), 'pagamentos: o caminho do comprovante não sai (só "tem comprovante")');
  for (const c of ['avaliacoes', 'metas', 'frequencia', 'creditos', 'ficha-pendencias', 'em-atraso']) {
    const r = regras.consultar('administrativo', c, { aluno: '001' }, ctxBase) as Dados;
    ok('erro' in r && r.status === 403, `"${c}" é recusada ao Administrativo (403)`);
  }

  console.log('\nO TIME DE ALUNOS\n');
  {
    const r = regras.consultar('alunos', 'em-atraso', {}, ctxBase) as { dados: Dados[] };
    const campos = [...new Set(r.dados.flatMap((d) => Object.keys(d)))].sort().join();
    ok(campos === 'alunoId,emAtraso,nome' && r.dados.every((d) => typeof d.emAtraso === 'boolean'), 'em-atraso: só sim ou não, sem valor', campos);
    for (const c of ['cobrancas', 'pagamentos', 'consumo', 'fechamento']) {
      const x = regras.consultar('alunos', c, {}, ctxBase) as Dados;
      ok('erro' in x && x.status === 403, `"${c}" é recusada ao Time de Alunos (403)`);
    }
    const av = regras.consultar('alunos', 'avaliacoes', { aluno: '001' }, ctxBase) as { dados: Dados[] };
    ok(av.dados.length === 1 && av.dados[0].peso === 80 && !('fotoFrente' in av.dados[0]) && !('urlFoto' in av.dados[0]), 'avaliações: a medida vai, a foto e o link não');
    ok('erro' in (regras.consultar('alunos', 'avaliacoes', {}, ctxBase) as Dados), 'avaliações sem o aluno: recusada (400)');
    const pend = regras.consultar('alunos', 'ficha-pendencias', {}, ctxBase) as { dados: { falta: string[] }[] };
    ok(pend.dados.some((d) => d.falta.includes('consentimento LGPD')), 'pendências: quem não aceitou o consentimento aparece');
  }

  console.log('\nO DESPACHO E O LOG\n');
  const logs: LinhaDoLog[] = [];
  const propostas: Record<string, Dados> = {};
  const eventos: Dados[] = [];
  let leuContexto = 0;
  const deps: DepsDosAgentes = {
    regras, chaves: CHAVES, limite: new Limite(), agora: () => 1_790_000_000_000, hojeIso: () => '2026-11-20',
    lerContexto: async () => { leuContexto++; return ctxBase; },
    lerFichas: async () => fichas,
    gravarProposta: async (id, doc, ev) => { propostas[id] = doc; eventos.push(ev); },
    gravarEvento: async (ev) => { eventos.push(ev); },
    gravarLog: async (l) => { logs.push(l); },
    novoId: () => `p${Object.keys(propostas).length + 1}`,
  };
  const req = (chave: string | null, body: unknown, method = 'POST') => ({ method, headers: chave ? { authorization: `Bearer ${chave}` } : {}, body });

  ok((await atenderAgente('consultar', req(CHAVES.alunos, {}, 'GET'), deps)).status === 405, 'GET: 405');
  {
    const r = await atenderAgente('consultar', req('chave-errada-mas-comprida-o-bastante', { consulta: 'alunos' }), deps);
    ok(r.status === 401 && logs.at(-1)?.time === 'desconhecido' && logs.at(-1)?.status === 401, 'chave errada: 401, e a tentativa vai para o log');
  }
  {
    const antes = leuContexto;
    const r = await atenderAgente('consultar', req(CHAVES.administrativo, { consulta: 'avaliacoes', aluno: '001' }), deps);
    ok(r.status === 403 && leuContexto === antes, 'consulta de outro time: 403, sem ler a base');
  }
  {
    const r = await atenderAgente('consultar', req(CHAVES.administrativo, { consulta: 'cobrancas', mes: '2026-11' }), deps);
    const l = logs.at(-1)!;
    ok(r.status === 200 && (r.corpo.registros as number) > 0, 'consulta do time: 200, com os registros');
    ok(l.ok && l.consulta === 'cobrancas' && l.registros === r.corpo.registros && !JSON.stringify(l).includes('Aluno'), 'o log diz quem, o quê e quantos — sem os dados', JSON.stringify(l));
  }
  {
    const r = await atenderAgente('propor', req(CHAVES.alunos, { tipo: 'meta', alunoId: '002', motivo: 'quer perder 5 kg', dados: { tipo: 'peso', alvo: 75 } }), deps);
    const p = propostas[String(r.corpo.propostaId)];
    const ev = eventos.at(-1) as Dados & { autor?: Dados; proposta?: Dados };
    ok(r.status === 200 && !!p && p.situacao === 'proposta' && p.time === 'alunos' && p.tipo === 'meta', 'proposta válida: gravada como "proposta", com o time');
    ok(ev.tipo === 'proposta-agente' && ev.situacao === 'proposta' && (ev.autor as Dados).tipo === 'agente' && ev.alunoId === '002', 'e a linha dos Registros: autor agente, situação proposta');
    ok(logs.at(-1)?.propostaId === r.corpo.propostaId && logs.at(-1)?.tipo === 'meta', 'o log guarda o id da proposta');
  }
  {
    const r = await atenderAgente('propor', req(CHAVES.administrativo, { tipo: 'meta', alunoId: '002', motivo: 'xxx', dados: { tipo: 'peso', alvo: 75 } }), deps);
    ok(r.status === 403 && logs.at(-1)?.ok === false, 'o Administrativo não propõe meta: 403, no log');
    const b = await atenderAgente('propor', req(CHAVES.administrativo, { tipo: 'baixa', alunoId: '003', motivo: 'Pix conferido no extrato', dados: { mesId: '2026-11', valor: 130, data: '2026-11-21', meio: 'pix-chave' } }), deps);
    ok(b.status === 400, 'baixa com data no futuro: recusada');
  }
  {
    const r = await atenderAgente('registrar', req(CHAVES.administrativo, { resumo: 'Resumo semanal gerado', motivo: 'rotina de segunda' }), deps);
    const ev = eventos.at(-1) as Dados & { autor?: Dados };
    ok(r.status === 200 && ev.tipo === 'agente' && (ev.autor as Dados).nome === 'Time Administrativo' && ev.alunoId === 'box', 'registrar: a linha do agente nos Registros, do box');
  }
  ok(logs.every((l) => !('dados' in l)), 'nenhuma linha do log guarda dados devolvidos');
  {
    const l = new Limite(1);
    const d2 = { ...deps, limite: l };
    await atenderAgente('consultar', req(CHAVES.alunos, { consulta: 'alunos' }), d2);
    const r = await atenderAgente('consultar', req(CHAVES.alunos, { consulta: 'alunos' }), d2);
    ok(r.status === 429 && logs.at(-1)?.status === 429, 'passou do limite: 429, no log');
  }

  console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ Funções por time conferidas.');
  process.exit(falhas ? 1 : 0);
}

void main();
