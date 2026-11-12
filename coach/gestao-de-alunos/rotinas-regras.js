// @ts-check
/**
 * AS ROTINAS AGENDADAS (Fase 1 · etapa 8, decisões 4 e 14 do ESCOPO,
 * PLANO-FASE1-ETAPA8.md): o que entra na Fila de mensagens a cada dia.
 *
 * Puro. O servidor (`rotinasDoBox`, 7h) roda `itensDoDia` e grava a lista do dia
 * em `gestao/{coach}/rotinas/{AAAA-MM-DD}` — só o tipo, o aluno, o mês e a
 * validade. A Gestão junta as listas dos últimos dias (`sugestoesDaRotina`) e
 * monta o texto NA HORA, com a ficha de agora: conta paga, aluno pausado ou
 * mensagem vencida somem sozinhos. Nada sai para aluno sem o coach tocar em
 * "Enviar".
 *
 * O que a rotina põe:
 *  - a RÉGUA de pagamento (decisão 4): dia 1 (a virada), o meio do caminho até o
 *    vencimento (decisão 14: dia 5 para quem vence no 10, dia 8 para o 15), o
 *    dia do vencimento e o dia seguinte. Só para quem tem conta a pagar no mês:
 *    cortesia só com consumo; o dependente, só a parte dele (a conta inteira vai
 *    para o responsável);
 *  - PENDÊNCIAS: quem passou do vencimento + 1 sem pagar sai da régua e vira
 *    uma lista só para o coach, sem mensagem;
 *  - FALTAS: a 2ª falta sem aviso seguida, com a mais nova ontem (decisão 14);
 *  - CRÉDITOS VENCENDO: no primeiro dia da última semana do mês, um por
 *    crédito, com as turmas que ainda têm vaga;
 *  - FECHAMENTO: o mês anterior que falta fechar (um aviso para o coach).
 */
import { contaDoMes, statusFin, brl, MESES_FIN } from './financeiro-aluno.js?v=40';
import { TEXTO_DO_PIX } from './financeiro-regras.js?v=40';
import { vencimentoNoMes } from '../../compartilhado/regras/cobranca.js?v=40';
import { historicoComFechamentos, totalDoMesFechado, estaFechado, FECHAMENTO_DESDE } from './fechamento-regras.js?v=40';
import { aulasDoDia, creditosDisponiveis } from './presenca-regras.js?v=40';
import { estaPausado } from '../../compartilhado/regras/planos.js';

/** Os tipos de item da rotina, na ordem em que a Fila os mostra. */
export const TIPOS_DA_ROTINA = Object.freeze(/** @type {const} */ ([
  'fechamento', 'pendencia', 'regua-dia1', 'regua-meio', 'regua-vencimento', 'regua-pos', 'credito-vencendo', 'falta-seguida',
]));
/** Os que viram mensagem na Fila (fechamento e pendência são avisos só para o coach). */
export const TIPOS_DE_MENSAGEM = Object.freeze(['regua-dia1', 'regua-meio', 'regua-vencimento', 'regua-pos', 'credito-vencendo', 'falta-seguida']);

/**
 * @typedef {{ chave: string, tipo: typeof TIPOS_DA_ROTINA[number], validoAte: string,
 *   alunoId?: string, mesId?: string, dados?: Record<string, any> }} ItemDaRotina
 * @typedef {{ dia: string, itens: ItemDaRotina[] }} ListaDoDia
 * @typedef {{ fechamentos?: Record<string, any>, ocupacao?: { dia: string, hora: string, vagas: number }[], fechados?: string[] }} ContextoDaRotina
 *   ocupacao: as turmas dos próximos dias (só números), para o crédito vencendo;
 *   fechados: os dias em que o box não abriu (feriado), para as faltas
 */

const ativo = (a) => !!a && (a.status || 'ativo') !== 'inativo';
const naRegua = (a) => ativo(a) && !estaPausado(a);
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
/** 'AAAA-MM-DD' + n dias. @param {string} iso @param {number} n */
export function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
/** 'AAAA-MM' + n meses. @param {string} mes @param {number} n */
const somarMeses = (mes, n) => { const [a, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
/** O último dia de um mês. @param {string} mes */
export const ultimoDiaDoMes = (mes) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const diaDe = (mes, d) => `${mes}-${String(d).padStart(2, '0')}`;
const nomeDoMes = (mes) => MESES_FIN[Number(mes.slice(5, 7)) - 1].toLowerCase();
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DIA_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** '07:00' → '7h', '18:10' → '18h10'. @param {string} h */
const horaFalada = (h) => { const m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}` : h; };
/** Dias entre duas datas ISO (b − a). @param {string} a @param {string} b */
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * O total que o aluno paga no mês: o do retrato, se o mês está fechado; senão,
 * a conta de sempre (responsável com os dependentes; dependente só a parte dele).
 * @param {any} a @param {string} mes @param {any[]} todos @param {Record<string, any>} fechamentos
 */
function totalDaConta(a, mes, todos, fechamentos) {
  const fechado = totalDoMesFechado((fechamentos || {})[mes], String(a.id));
  return fechado != null ? fechado : contaDoMes(a, mes, todos).conta.total;
}

/** O dia do lembrete do meio: a metade do caminho entre o dia 1 e o vencimento (decisão 14). @param {number} venc */
export const diaDoMeio = (venc) => Math.floor((1 + venc) / 2);

/**
 * A mensagem da régua de um aluno no dia, ou null. A validade faz a mensagem de
 * um dia em que o coach não abriu a Gestão sumir quando passa da hora.
 * @param {any} a @param {any[]} todos @param {string} hoje @param {Record<string, any>} fechamentos
 * @returns {ItemDaRotina | null}
 */
export function itemDaRegua(a, todos, hoje, fechamentos = {}) {
  if (!naRegua(a)) return null;
  const mes = hoje.slice(0, 7);
  if (statusFin(a, mes, hoje) === 'pago' || !(totalDaConta(a, mes, todos, fechamentos) > 0)) return null;
  const venc = vencimentoNoMes(mes, a.vencimento);
  const v = Number(venc.slice(8, 10)), d = Number(hoje.slice(8, 10)), meio = diaDoMeio(v);
  const ultimo = Number(ultimoDiaDoMes(mes).slice(8, 10));
  /** @param {ItemDaRotina['tipo']} tipo @param {string} validoAte */
  const item = (tipo, validoAte) => ({ chave: `${tipo}:${a.id}:${mes}`, tipo, alunoId: String(a.id), mesId: mes, validoAte });
  if (d === 1) return item('regua-dia1', diaDe(mes, Math.max(1, Math.min(4, v - 1))));
  if (d === meio && meio > 1 && meio < v) return item('regua-meio', diaDe(mes, v - 1));
  if (d === v) return item('regua-vencimento', venc);
  if (d === v + 1 && v < ultimo) return item('regua-pos', diaDe(mes, Math.min(v + 2, ultimo)));
  return null;
}

/**
 * As contas em atraso de um aluno que já saíram da régua (passou do vencimento
 * + 1): a lista "Pendências", só para o coach.
 * @param {any} a @param {any[]} todos @param {string} hoje @param {Record<string, any>} fechamentos
 * @returns {ItemDaRotina[]}
 */
export function pendenciasDoAluno(a, todos, hoje, fechamentos = {}) {
  if (!ativo(a)) return [];
  const mes = hoje.slice(0, 7);
  return historicoComFechamentos(a, todos, hoje, fechamentos).faturas
    .filter((f) => f.status === 'vencido' && f.pagavel && f.total > 0 && (f.mesId < mes || diasEntre(f.vencimento, hoje) >= 2))
    // Sem valor no documento: o valor e os dias de atraso saem da ficha de agora, na Gestão (avisosDaRotina).
    .map((f) => ({ chave: `pendencia:${a.id}:${f.mesId}`, tipo: /** @type {const} */ ('pendencia'), alunoId: String(a.id), mesId: f.mesId, validoAte: hoje }));
}

/** As aulas que o aluno deveria ter feito num dia (a desmarcada no prazo, o atestado e o box fechado não contam). */
const ESPERADA = (/** @type {string} */ s) => s !== 'desmarcou-no-prazo' && s !== 'atestado' && s !== 'fechado';

/**
 * A 2ª falta sem aviso seguida (decisão 14), com a mais nova ONTEM: as duas
 * últimas aulas que ele deveria ter feito foram "falta" (não veio e não avisou,
 * pelo "Fechar chamada"). Avisou fora do prazo não é "sem aviso"; aula sem
 * chamada fechada não é falta.
 * @param {any} a @param {string} hoje @param {string[]} [fechados]
 * @returns {ItemDaRotina | null}
 */
export function itemDeFalta(a, hoje, fechados = []) {
  if (!naRegua(a)) return null;
  const ontem = somarDias(hoje, -1);
  /** @type {{ dia: string, status: string }[]} */
  const aulas = [];
  for (let i = 1; i <= 21 && aulas.length < 2; i++) {
    const dia = somarDias(hoje, -i);
    for (const x of aulasDoDia([a], dia, { hoje, fechados })) if (ESPERADA(x.status)) aulas.push({ dia, status: x.status });
  }
  if (aulas.length < 2) return null;
  const [ultima, anterior] = aulas;
  if (ultima.dia !== ontem || ultima.status !== 'falta' || anterior.status !== 'falta') return null;
  return { chave: `falta-seguida:${a.id}:${ontem}`, tipo: 'falta-seguida', alunoId: String(a.id), validoAte: somarDias(hoje, 2), dados: { dias: [anterior.dia, ultima.dia] } };
}

/**
 * Os créditos de reposição que vencem até o fim do mês — no primeiro dia da
 * última semana, um item por crédito, com até 3 turmas que ainda têm vaga
 * (depois de hoje, até a validade, nos dias em que ele não tem aula).
 * @param {any} a @param {string} hoje @param {{ dia: string, hora: string, vagas: number }[]} [ocupacao]
 * @returns {ItemDaRotina[]}
 */
export function creditosVencendo(a, hoje, ocupacao = []) {
  const ultimo = ultimoDiaDoMes(hoje.slice(0, 7));
  if (!naRegua(a) || hoje !== somarDias(ultimo, -6)) return [];
  const temAula = (/** @type {string} */ dia) => aulasDoDia([a], dia, { hoje }).some((x) => ESPERADA(x.status));
  return creditosDisponiveis(a, hoje)
    .filter((c) => c.expira && c.expira >= hoje && c.expira <= ultimo)
    .map((c) => ({
      chave: `credito-vencendo:${a.id}:${c.origem}`, tipo: /** @type {const} */ ('credito-vencendo'), alunoId: String(a.id), validoAte: String(c.expira),
      dados: {
        origem: String(c.origem), expira: String(c.expira),
        turmas: ocupacao.filter((t) => t.vagas > 0 && t.dia > hoje && t.dia <= String(c.expira) && !temAula(t.dia))
          .sort((x, y) => (x.dia + x.hora < y.dia + y.hora ? -1 : 1)).slice(0, 3).map((t) => ({ dia: t.dia, hora: t.hora })),
      },
    }));
}

/**
 * O que a rotina põe na Fila hoje. Em ordem: fechamento, pendências, régua,
 * créditos e faltas.
 * @param {any[]} fichas @param {string} hoje @param {ContextoDaRotina} [ctx]
 * @returns {ItemDaRotina[]}
 */
export function itensDoDia(fichas, hoje, ctx = {}) {
  const todos = (fichas || []).filter(Boolean);
  const fechamentos = ctx.fechamentos || {};
  /** @type {ItemDaRotina[]} */ const itens = [];
  const anterior = somarMeses(hoje.slice(0, 7), -1);
  if (anterior >= FECHAMENTO_DESDE && !estaFechado(fechamentos[anterior])) {
    itens.push({ chave: `fechamento:${anterior}`, tipo: 'fechamento', mesId: anterior, validoAte: hoje });
  }
  for (const a of todos) {
    itens.push(...pendenciasDoAluno(a, todos, hoje, fechamentos));
    const r = itemDaRegua(a, todos, hoje, fechamentos);
    if (r) itens.push(r);
    itens.push(...creditosVencendo(a, hoje, ctx.ocupacao || []));
    const f = itemDeFalta(a, hoje, ctx.fechados || []);
    if (f) itens.push(f);
  }
  const ordem = (/** @type {ItemDaRotina} */ i) => TIPOS_DA_ROTINA.indexOf(i.tipo);
  return itens.sort((x, y) => ordem(x) - ordem(y) || (x.chave < y.chave ? -1 : x.chave > y.chave ? 1 : 0));
}

/* ============================================================
   Os textos (a Gestão monta na hora, com a ficha de agora)
   ============================================================ */

/**
 * O texto de um item da rotina para o aluno, ou null quando ele não vale mais
 * (pagou, pausou, saiu, o crédito foi usado).
 * @param {ItemDaRotina} item @param {any} a @param {any[]} todos @param {string} hoje @param {Record<string, any>} [fechamentos]
 */
export function textoDoItem(item, a, todos, hoje, fechamentos = {}) {
  if (!a || !naRegua(a)) return null;
  const nome = primeiroNome(a.nome);
  if (item.tipo === 'falta-seguida') {
    return `Oi, ${nome}! Senti sua falta nas últimas aulas. Tá tudo bem? Se precisar ajustar o horário, é só me falar. 💪`;
  }
  if (item.tipo === 'credito-vencendo') {
    const d = item.dados || {};
    if (!creditosDisponiveis(a, hoje).some((c) => String(c.origem) === String(d.origem))) return null;
    const turmas = (Array.isArray(d.turmas) ? d.turmas : [])
      .map((t) => `${DIA_SEM[new Date(`${t.dia}T00:00:00Z`).getUTCDay()]} ${ddmm(t.dia)} ${horaFalada(t.hora)}`);
    return `Oi, ${nome}! 😊 Seu crédito de reposição vence dia ${ddmm(String(d.expira))}. `
      + `${turmas.length ? `Ainda tem vaga em: ${turmas.join(', ')}. ` : ''}Dá pra marcar pelo Portal do Aluno, ou me chama aqui. 💪`;
  }
  const mes = String(item.mesId || '');
  if (!/^\d{4}-\d{2}$/.test(mes) || statusFin(a, mes, hoje) === 'pago') return null;
  const total = totalDaConta(a, mes, todos, fechamentos);
  if (!(total > 0)) return null;
  const v = Number(vencimentoNoMes(mes, a.vencimento).slice(8, 10));
  const mesNome = nomeDoMes(mes);
  if (item.tipo === 'regua-dia1') {
    const { conta } = contaDoMes(a, mes, todos);
    const consumo = conta.propria.extras, mensalidade = conta.propria.mensalidade;
    const anterior = nomeDoMes(somarMeses(mes, -1));
    const linhas = [
      ...(consumo > 0 ? [`- Consumo de ${anterior}: ${brl(consumo)}`] : []),
      ...(mensalidade > 0 ? [`- Mensalidade de ${mesNome}: ${brl(mensalidade)}`] : []),
      ...conta.dependentes.map((/** @type {any} */ d) => `- Conta de ${primeiroNome(d.nome) || 'dependente'}: ${brl(d.total)}`),
    ];
    const continuar = consumo > 0 && mensalidade > 0 ? `\nSe você não for continuar em ${mesNome}, é só acertar o consumo de ${anterior} (${brl(consumo)}).` : '';
    return `Olá, ${nome}! 😊 Encerramos mais um ciclo e começamos outro! Sua conta de ${mesNome}:\n${linhas.join('\n')}\nTotal: ${brl(total)}, vence dia ${v}.${continuar}\n${TEXTO_DO_PIX}`;
  }
  if (item.tipo === 'regua-meio') return `Olá, ${nome}! 😊 Passando pra lembrar da sua conta de ${mesNome} (${brl(total)}), que vence dia ${v}. ${TEXTO_DO_PIX}`;
  if (item.tipo === 'regua-vencimento') return `Olá, ${nome}! 😊 Hoje é o dia do vencimento da sua conta de ${mesNome} (${brl(total)}). ${TEXTO_DO_PIX}`;
  if (item.tipo === 'regua-pos') return `Olá, ${nome}! Sua conta de ${mesNome} (${brl(total)}) venceu ontem. Se já pagou, me manda o comprovante que eu dou baixa. ${TEXTO_DO_PIX}`;
  return null;
}

/**
 * As MENSAGENS da rotina que ainda valem, no formato da Fila (`Sugestao` de
 * automacao-regras.js): a lista mais nova vence na mesma chave; o que passou da
 * validade, ou não vale mais (pagou, pausou), sai. O texto vai em `dados.texto`.
 * @param {ListaDoDia[]} listas @param {any[]} todos @param {string} hoje @param {Record<string, any>} [fechamentos]
 */
export function sugestoesDaRotina(listas, todos, hoje, fechamentos = {}) {
  /** @type {Map<string, ItemDaRotina>} */ const porChave = new Map();
  for (const l of [...(listas || [])].filter((x) => x && Array.isArray(x.itens)).sort((x, y) => (x.dia < y.dia ? -1 : 1))) {
    for (const it of l.itens) if (it && TIPOS_DE_MENSAGEM.includes(it.tipo) && it.chave) porChave.set(it.chave, it);
  }
  const porId = new Map((todos || []).map((a) => [String(a.id), a]));
  const out = [];
  for (const it of porChave.values()) {
    if (!it.validoAte || hoje > it.validoAte) continue;
    const a = porId.get(String(it.alunoId));
    const texto = a ? textoDoItem(it, a, todos, hoje, fechamentos) : null;
    if (!texto) continue;
    out.push({ chave: it.chave, gatilho: it.tipo, alunoId: String(it.alunoId), criadaEm: 0, dados: { ...(it.dados || {}), ...(it.mesId ? { mesId: it.mesId } : {}), texto } });
  }
  return out;
}

/**
 * Os AVISOS para o coach, da lista mais nova: os meses a fechar (que ainda não
 * foram fechados) e as pendências (que ainda não foram pagas).
 * @param {ListaDoDia[]} listas @param {any[]} todos @param {string} hoje @param {Record<string, any>} [fechamentos]
 */
export function avisosDaRotina(listas, todos, hoje, fechamentos = {}) {
  const ultima = [...(listas || [])].filter((x) => x && Array.isArray(x.itens)).sort((x, y) => (x.dia < y.dia ? 1 : -1))[0];
  const itens = ultima ? ultima.itens : [];
  const porId = new Map((todos || []).map((a) => [String(a.id), a]));
  return {
    fechar: itens.filter((i) => i.tipo === 'fechamento' && i.mesId && !estaFechado(fechamentos[i.mesId])).map((i) => String(i.mesId)),
    // O valor e os dias de atraso vêm da ficha de agora (o documento só diz quem e qual mês).
    pendencias: itens.filter((i) => i.tipo === 'pendencia').flatMap((i) => {
      const a = porId.get(String(i.alunoId));
      if (!a || statusFin(a, String(i.mesId), hoje) === 'pago') return [];
      const f = historicoComFechamentos(a, todos, hoje, fechamentos).faturas.find((x) => x.mesId === String(i.mesId));
      if (!f || f.status !== 'vencido' || !(f.total > 0)) return [];
      return [{ alunoId: String(a.id), nome: String(a.nome || ''), mesId: String(i.mesId), valor: f.total, diasAtraso: diasEntre(f.vencimento, hoje) }];
    }),
  };
}
