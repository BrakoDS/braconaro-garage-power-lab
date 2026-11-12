// @ts-check
/**
 * AS FUNÇÕES POR TIME (Fase 1 · etapa 7, decisão 13 do ESCOPO, PLANO-FASE1-ETAPA7.md):
 * o que cada time de agentes pode CONSULTAR e PROPOR, o que cada consulta
 * devolve e o que acontece quando o coach aprova uma proposta.
 *
 * Puro: sem DOM, sem banco e sem rede. O servidor (functions/src/agentes.ts)
 * confere a chave, o limite de chamadas e grava o log, e chama daqui com os
 * dados já lidos; a Gestão usa a parte das propostas no painel de Aprovações.
 * O servidor recebe uma CÓPIA deste arquivo (copiar-regras-gestao.mjs).
 *
 * Regras de ouro:
 *  - os agentes SÓ LEEM E PROPÕEM: nada aqui grava na ficha; a ação só
 *    acontece quando o coach aprova, na Gestão;
 *  - cada consulta devolve uma LISTA DE CAMPOS PERMITIDOS, montada aqui — nunca
 *    a ficha. O Time Administrativo não recebe dado de saúde (o `checar-agentes`
 *    do servidor confere campo a campo, em fichas sorteadas);
 *  - o Time de Alunos vê do financeiro só "em atraso: sim/não".
 */
import { faturaComFechamento, historicoComFechamentos } from './fechamento-regras.js?v=39';
import { creditosDisponiveis } from './presenca-regras.js?v=39';
import { avulsosDoMes } from './avulsos-regras.js?v=39';
import { brl, rotuloMesFin } from './financeiro-aluno.js?v=39';
import { metasCorporaisDe } from './metas-grupo.js?v=39';
import { META_TIPOS } from '../../compartilhado/regras/calc.js?v=39';
import { estaPausado } from '../../compartilhado/regras/planos.js';
import { qtdDoConsumo } from '../../compartilhado/regras/consumo.js';

/** Os times de agentes da Fase 1 (ESCOPO: Administrativo e Alunos). */
export const TIMES = Object.freeze(/** @type {const} */ (['administrativo', 'alunos']));
/** @typedef {typeof TIMES[number]} Time */

/** "Time Administrativo" / "Time de Alunos". @param {string} time */
export const rotuloDoTime = (time) => (time === 'administrativo' ? 'Time Administrativo' : time === 'alunos' ? 'Time de Alunos' : 'Time desconhecido');

/** No máximo isso de registros por consulta (o resto é cortado, com o aviso). */
export const MAX_REGISTROS = 200;

const AMBOS = Object.freeze(['administrativo', 'alunos']);
const ADM = Object.freeze(['administrativo']);
const ALU = Object.freeze(['alunos']);

/**
 * A LISTA FECHADA de consultas: quem pode e o que pede (`mes`, `aluno`). O que
 * não está aqui não existe para os agentes.
 * @type {Readonly<Record<string, { times: readonly string[], mes?: boolean, aluno?: boolean, descricao: string }>>}
 */
export const CONSULTAS = Object.freeze({
  alunos: { times: AMBOS, descricao: 'id, nome, status, plano e data de início de cada aluno' },
  lotacao: { times: AMBOS, descricao: 'vagas e ocupadas de cada turma dos próximos 7 dias (só números)' },
  cobrancas: { times: ADM, mes: true, descricao: 'a conta de cada aluno no mês: mensalidade, consumo, total, vencimento e situação' },
  pagamentos: { times: ADM, mes: true, descricao: 'os pagamentos do mês: valor, data, meio e se tem comprovante' },
  consumo: { times: ADM, mes: true, descricao: 'os consumos do mês (na mensalidade e na hora) e os avulsos' },
  fechamento: { times: ADM, mes: true, descricao: 'os totais e as divergências do mês fechado' },
  frequencia: { times: ALU, mes: true, descricao: 'presenças, faltas, desmarcações e aulas do Ilimitado de cada aluno no mês' },
  creditos: { times: ALU, descricao: 'os créditos de reposição em aberto e quando vencem' },
  avaliacoes: { times: ALU, aluno: true, descricao: 'as avaliações físicas de um aluno (dado de saúde)' },
  metas: { times: ALU, aluno: true, descricao: 'as metas de um aluno' },
  'ficha-pendencias': { times: ALU, descricao: 'o que falta na ficha de cada aluno ativo' },
  'em-atraso': { times: ALU, descricao: 'se cada aluno tem conta em atraso (só sim ou não)' },
});

/** O que cada time pode propor. O resto (mudar valor, apagar, mexer no plano) não existe. */
export const TIPOS_DE_PROPOSTA = Object.freeze({
  administrativo: Object.freeze(['mensagem', 'baixa', 'divergencia']),
  alunos: Object.freeze(['mensagem', 'meta', 'pendencia-ficha']),
});

/**
 * Os nomes de campo que são DADO DE SAÚDE ou de corpo/treino individual — o que
 * nenhuma resposta ao Time Administrativo pode conter (o `checar-agentes`
 * procura cada um, em qualquer profundidade).
 */
export const CAMPOS_DE_SAUDE = Object.freeze([
  'avaliacoes', 'anamnese', 'parq', 'restricoes', 'saude', 'alertaMedico', 'lesoes', 'medicamentos', 'dores',
  'peso', 'altura', 'gordura', 'cintura', 'dobras', 'perimetros', 'medidas', 'metas', 'metasGrupo', 'matriz', 'foco',
  'feedbacks', 'diario', 'fotos', 'sexo', 'nascimento',
]);

const EH_MES = /^\d{4}-\d{2}$/;
const EH_DIA = /^\d{4}-\d{2}-\d{2}$/;
const reais = (v) => Math.round((Number(v) || 0) * 100) / 100;
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const ativo = (a) => !!a && (a.status || 'ativo') !== 'inativo';

/** ativo, pausado, cortesia ou inativo. @param {any} a */
export function statusDoAluno(a) {
  if (!ativo(a)) return 'inativo';
  if (estaPausado(a)) return 'pausado';
  if (a.cortesia) return 'cortesia';
  return 'ativo';
}

/**
 * @typedef {{
 *   fichas: any[], hojeIso: string, fechamentos?: Record<string, any>,
 *   meta?: { experimentais?: Record<string, any[]>, vendasAvulsas?: Record<string, any[]> },
 *   ocupacao?: { dia: string, hora: string, capacidade: number, ocupadas: number, vagas: number }[],
 *   avaliacoes?: any[], consentimentos?: Iterable<string>,
 * }} Contexto
 *   avaliacoes: as do aluno pedido (o servidor lê a subcoleção só na consulta `avaliacoes`);
 *   consentimentos: os e-mails com o consentimento LGPD aceito (`consentimentos/{email}`)
 * @typedef {{ dados: any[], registros: number, cortado: boolean, mes?: string } | { erro: string, status: number }} Resposta
 */

/**
 * A CONSULTA de um time. Recusa (403) o que não é do time; (400) o que não existe
 * ou veio sem o parâmetro.
 * @param {string} time @param {string} nome @param {{ mes?: unknown, aluno?: unknown }} params @param {Contexto} ctx
 * @returns {Resposta}
 */
export function consultar(time, nome, params, ctx) {
  if (!TIMES.includes(/** @type {any} */ (time))) return { erro: 'Time desconhecido.', status: 403 };
  const c = Object.prototype.hasOwnProperty.call(CONSULTAS, nome) ? CONSULTAS[nome] : null;
  if (!c) return { erro: `Consulta desconhecida. As do ${rotuloDoTime(time)}: ${consultasDoTime(time).join(', ')}.`, status: 400 };
  if (!c.times.includes(time)) return { erro: `A consulta "${nome}" não é do ${rotuloDoTime(time)}.`, status: 403 };
  const p = params || {};
  const mes = c.mes ? (typeof p.mes === 'string' && EH_MES.test(p.mes) ? p.mes : ctx.hojeIso.slice(0, 7)) : undefined;
  let aluno = null;
  if (c.aluno) {
    aluno = (ctx.fichas || []).find((a) => String(a.id) === String(p.aluno || '')) || null;
    if (!aluno) return { erro: 'Informe o aluno (o id da consulta "alunos").', status: 400 };
  }
  const todos = (ctx.fichas || []).filter(Boolean);
  const dados = MONTAR[nome]({ todos, mes: mes || '', aluno, ctx });
  const cortado = dados.length > MAX_REGISTROS;
  return { dados: cortado ? dados.slice(0, MAX_REGISTROS) : dados, registros: Math.min(dados.length, MAX_REGISTROS), cortado, ...(mes ? { mes } : {}) };
}

/** As consultas de um time, na ordem da lista. @param {string} time */
export const consultasDoTime = (time) => Object.keys(CONSULTAS).filter((k) => CONSULTAS[k].times.includes(time));

/** Os itens de uma fatura somados por tipo (o que não é coberto por um responsável). @param {any[]} itens @param {string} tipo */
const somaDoTipo = (itens, tipo) => reais((itens || []).filter((i) => i.tipo === tipo && !i.coberto).reduce((s, i) => s + (Number(i.valor) || 0), 0));

/** @type {Record<string, (o: { todos: any[], mes: string, aluno: any, ctx: Contexto }) => any[]>} */
const MONTAR = {
  alunos: ({ todos }) => todos.map((a) => ({
    id: String(a.id), nome: String(a.nome || ''), status: statusDoAluno(a),
    plano: a.plano ? { vezes: a.plano.vezes ?? null, prazo: a.plano.prazo || 'mensal' } : null, inicio: String(a.inicio || ''),
  })),

  lotacao: ({ ctx }) => (ctx.ocupacao || []).map((t) => ({
    dia: String(t.dia), hora: String(t.hora), capacidade: Number(t.capacidade) || 0, ocupadas: Number(t.ocupadas) || 0, vagas: Number(t.vagas) || 0,
  })),

  cobrancas: ({ todos, mes, ctx }) => todos.flatMap((a) => {
    const f = /** @type {any} */ (faturaComFechamento(a, mes, todos, ctx.hojeIso, ctx.fechamentos || {}));
    if (!f || !(ativo(a) || (a.pagamentos || {})[mes])) return [];
    return [{
      alunoId: String(a.id), nome: String(a.nome || ''),
      mensalidade: somaDoTipo(f.itens, 'mensalidade'), consumo: somaDoTipo(f.itens, 'consumo'), dependentes: somaDoTipo(f.itens, 'dependente'),
      total: reais(f.total), vencimento: String(f.vencimento || ''), situacao: String(f.status), pagavel: !!f.pagavel, fechado: !!f.fechadoEm,
    }];
  }),

  pagamentos: ({ todos, mes }) => todos.flatMap((a) => {
    if (!(a.pagamentos || {})[mes]) return [];
    const r = (a.recebimentos || {})[mes] || null;
    return [{
      alunoId: String(a.id), nome: String(a.nome || ''), valor: r ? reais(r.valor) : null, data: r ? String(r.data || '') : '',
      meio: r ? String(r.meio || '') : 'nao-informado', conferidoPor: r ? String(r.conferidoPor || '') : '', temComprovante: !!(r && r.comprovante),
      registroDetalhado: !!r,
    }];
  }),

  consumo: ({ todos, mes, ctx }) => [
    ...todos.flatMap((a) => (Array.isArray(a.consumos) ? a.consumos : []).filter((c) => c && c.mesId === mes).map((c) => ({
      origem: 'aluno', alunoId: String(a.id), nome: String(a.nome || ''), produto: String(c.nome || ''), qtd: qtdDoConsumo(c),
      valor: reais(c.preco), data: String(c.data || ''), forma: 'mensalidade',
    }))),
    ...todos.flatMap((a) => (Array.isArray(a.comprasNaHora) ? a.comprasNaHora : []).filter((c) => c && String(c.data || '').slice(0, 7) === mes).map((c) => ({
      origem: 'aluno', alunoId: String(a.id), nome: String(a.nome || ''), produto: String(c.nome || ''), qtd: Number(c.qtd) || 1,
      valor: reais(c.valor), data: String(c.data || ''), forma: 'hora', meio: String(c.meio || ''),
    }))),
    ...avulsosDoMes((ctx.meta || {}).experimentais, mes, (ctx.meta || {}).vendasAvulsas).itens.map((i) => ({
      origem: i.tipo === 'venda' ? 'visitante' : 'daypass', descricao: i.nome, valor: reais(i.valor), data: i.dia, forma: 'hora', meio: i.meio,
    })),
  ],

  fechamento: ({ mes, ctx }) => {
    const doc = (ctx.fechamentos || {})[mes];
    if (!doc) return [{ mes, situacao: 'aberto' }];
    return [{
      mes, situacao: String(doc.situacao || ''), aprovadoEm: Number(doc.aprovadoEm) || 0,
      totais: Object.fromEntries(Object.entries(doc.totais || {}).filter(([, v]) => typeof v === 'number')),
      divergencias: (Array.isArray(doc.divergencias) ? doc.divergencias : []).map((d) => ({
        tipo: String(d.tipo || ''), alunoId: String(d.alunoId || ''), nome: String(d.nome || ''), total: reais(d.total),
        ...(typeof d.valor === 'number' ? { valor: reais(d.valor) } : {}),
      })),
    }];
  },

  frequencia: ({ todos, mes }) => todos.filter(ativo).map((a) => {
    const noMes = (d) => typeof d === 'string' && d.slice(0, 7) === mes;
    const faltas = Object.entries(a.faltas || {}).filter(([d]) => noMes(d)).map(([, v]) => (v && v.tipo) || '');
    const atestados = Object.entries(a.atestados || {}).filter(([d]) => noMes(d)).map(([, v]) => (v && v.tipo) || 'atestado');
    const marcacoes = Object.entries(a.marcacoes || {}).filter(([d]) => noMes(d)).map(([, v]) => v || {});
    return {
      alunoId: String(a.id), nome: String(a.nome || ''),
      presencas: (Array.isArray(a.presencas) ? a.presencas : []).filter(noMes).length,
      faltasSemAviso: faltas.filter((t) => t !== 'fora-do-prazo').length + marcacoes.filter((m) => m.noShow).length,
      faltasForaDoPrazo: faltas.filter((t) => t === 'fora-do-prazo').length + marcacoes.filter((m) => m.foraDoPrazo).length,
      desmarcouNoPrazo: atestados.filter((t) => t === 'desmarcacao').length,
      atestados: atestados.filter((t) => t !== 'desmarcacao' && t !== 'fechado').length,
      aulasIlimitado: marcacoes.length,
    };
  }),

  creditos: ({ todos, ctx }) => todos.filter(ativo).flatMap((a) => creditosDisponiveis(a, ctx.hojeIso).map((c) => ({
    alunoId: String(a.id), nome: String(a.nome || ''), aulaDeOrigem: String(c.origem), tipo: String(c.tipo || ''), vence: c.expira || null,
  }))),

  // Dado de saúde: só o Time de Alunos chega aqui. A avaliação vai inteira, menos fotos e links.
  avaliacoes: ({ ctx }) => (ctx.avaliacoes || []).filter(Boolean).map((av) => Object.fromEntries(
    Object.entries(av).filter(([k, v]) => !/foto|url|arquivo|imagem|caminho/i.test(k) && typeof v !== 'function'),
  )),

  metas: ({ aluno }) => metasCorporaisDe(aluno).map((m) => ({
    id: String(m.id || ''), tipo: String(m.tipo || ''), alvo: m.alvo ?? null, base: m.base ?? null, baseData: m.baseData || null, criadoEm: m.criadoEm || null,
  })),

  'ficha-pendencias': ({ todos, ctx }) => {
    const aceitos = new Set([...(ctx.consentimentos || [])].map((e) => String(e).trim().toLowerCase()));
    return todos.filter(ativo).flatMap((a) => {
      const email = String(a.email || '').trim().toLowerCase();
      const falta = [
        ...(!a.inicio ? ['data de início'] : []),
        ...(!(a.plano && a.plano.vezes) ? ['plano'] : []),
        ...(!String(a.telefone || '').replace(/\D/g, '') ? ['telefone'] : []),
        ...(!email ? ['e-mail (acesso ao Portal)'] : []),
        ...(email && !aceitos.has(email) ? ['consentimento LGPD'] : []),
      ];
      return falta.length ? [{ alunoId: String(a.id), nome: String(a.nome || ''), falta }] : [];
    });
  },

  'em-atraso': ({ todos, ctx }) => todos.filter(ativo).map((a) => ({
    alunoId: String(a.id), nome: String(a.nome || ''),
    emAtraso: historicoComFechamentos(a, todos, ctx.hojeIso, ctx.fechamentos || {}).atrasado > 0,
  })),
};

/* ============================================================
   As propostas
   ============================================================ */

/** Os meios que uma proposta de baixa pode dizer. */
const MEIOS = Object.freeze(['pix-chave', 'cartao', 'dinheiro', 'pix-portal']);

/**
 * @typedef {{ tipo: string, alunoId: string, alunoNome: string, dados: Record<string, any>, motivo: string }} PropostaValida
 */

/**
 * Confere o pedido de proposta de um time: o tipo é dele, o aluno existe, os
 * dados têm o formato do tipo e o motivo veio. Só os campos conhecidos passam.
 * @param {string} time @param {any} corpo @param {any[]} fichas @param {string} hojeIso
 * @returns {{ proposta: PropostaValida } | { erro: string, status: number }}
 */
export function validarProposta(time, corpo, fichas, hojeIso) {
  if (!TIMES.includes(/** @type {any} */ (time))) return { erro: 'Time desconhecido.', status: 403 };
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const tipo = String(c.tipo || '');
  const permitidos = /** @type {readonly string[]} */ (TIPOS_DE_PROPOSTA[/** @type {Time} */ (time)]);
  if (!permitidos.includes(tipo)) return { erro: `O ${rotuloDoTime(time)} propõe só: ${permitidos.join(', ')}.`, status: 403 };
  const motivo = texto(c.motivo, 500);
  if (motivo.length < 3) return { erro: 'Escreva o motivo da proposta.', status: 400 };
  const a = (fichas || []).find((x) => x && String(x.id) === String(c.alunoId || ''));
  if (!a) return { erro: 'Aluno não encontrado (use o id da consulta "alunos").', status: 400 };
  const d = c.dados && typeof c.dados === 'object' ? c.dados : {};
  /** @type {Record<string, any>} */ let dados;
  if (tipo === 'mensagem') {
    const t = texto(d.texto, 1000);
    if (!t) return { erro: 'A mensagem precisa do texto.', status: 400 };
    dados = { texto: t };
  } else if (tipo === 'baixa') {
    if (!EH_MES.test(String(d.mesId || ''))) return { erro: 'A baixa precisa do mês (AAAA-MM).', status: 400 };
    if (!(Number(d.valor) > 0)) return { erro: 'A baixa precisa do valor, maior que zero.', status: 400 };
    if (!EH_DIA.test(String(d.data || '')) || String(d.data) > hojeIso) return { erro: 'A baixa precisa da data do pagamento (AAAA-MM-DD, até hoje).', status: 400 };
    if (!MEIOS.includes(String(d.meio || ''))) return { erro: `O meio da baixa é um destes: ${MEIOS.join(', ')}.`, status: 400 };
    dados = { mesId: String(d.mesId), valor: reais(d.valor), data: String(d.data), meio: String(d.meio) };
  } else if (tipo === 'divergencia') {
    if (!EH_MES.test(String(d.mesId || ''))) return { erro: 'A divergência precisa do mês (AAAA-MM).', status: 400 };
    const desc = texto(d.descricao, 500);
    if (!desc) return { erro: 'Descreva a divergência.', status: 400 };
    dados = { mesId: String(d.mesId), descricao: desc, ...(Number(d.valor) > 0 ? { valor: reais(d.valor) } : {}) };
  } else if (tipo === 'meta') {
    if (!Object.prototype.hasOwnProperty.call(META_TIPOS, String(d.tipo || ''))) return { erro: `A meta é de um destes tipos: ${Object.keys(META_TIPOS).join(', ')}.`, status: 400 };
    if (!(Number(d.alvo) > 0)) return { erro: 'A meta precisa do valor-alvo, maior que zero.', status: 400 };
    if (d.prazo != null && d.prazo !== '' && !EH_DIA.test(String(d.prazo))) return { erro: 'O prazo da meta é uma data (AAAA-MM-DD).', status: 400 };
    dados = { tipo: String(d.tipo), alvo: Number(d.alvo), ...(d.prazo ? { prazo: String(d.prazo) } : {}) };
  } else {
    const campo = texto(d.campo, 40), desc = texto(d.descricao, 300);
    if (!campo || !desc) return { erro: 'A pendência precisa do campo e da descrição.', status: 400 };
    dados = { campo, descricao: desc };
  }
  return { proposta: { tipo, alunoId: String(a.id), alunoNome: String(a.nome || ''), dados, motivo } };
}

/** O que a proposta é, numa linha. @param {{ tipo: string, dados: Record<string, any> }} p */
export function descricaoDaProposta(p) {
  const d = p.dados || {};
  if (p.tipo === 'mensagem') return 'Mensagem para enviar pelo WhatsApp';
  if (p.tipo === 'baixa') return `Baixa de ${rotuloMesFin(d.mesId)} · ${brl(d.valor)} · ${d.meio}`;
  if (p.tipo === 'divergencia') return `Divergência em ${rotuloMesFin(d.mesId)}: ${d.descricao}`;
  if (p.tipo === 'meta') {
    const t = /** @type {Record<string, { label: string, unidade: string }>} */ (META_TIPOS)[d.tipo] || { label: d.tipo, unidade: '' };
    return `Meta: ${t.label} ${d.alvo}${t.unidade ? ' ' + t.unidade : ''}${d.prazo ? ` até ${d.prazo}` : ''}`;
  }
  return `Pendência na ficha: ${d.campo} — ${d.descricao}`;
}

/** O que acontece quando o coach aprova (a proposta 2 do plano), em palavras. @param {{ tipo: string }} p */
export function efeitoDaAprovacao(p) {
  return {
    mensagem: 'vai para a Fila de mensagens, pronta para enviar',
    meta: 'a meta entra na ficha do aluno',
    baixa: 'abre a janela de baixa já preenchida (você confirma nela)',
    divergencia: 'fica como "ciente"',
    'pendencia-ficha': 'fica como "ciente"',
  }[p.tipo] || 'fica como "ciente"';
}

/** O autor agente de um time, como o log guarda. @param {string} time */
export const autorDoTime = (time) => ({ tipo: 'agente', nome: rotuloDoTime(time) });

/**
 * A linha dos Registros de uma proposta que acabou de chegar (o servidor grava
 * com `novoEvento`): a situação é "proposta", o autor é o agente do time.
 * @param {PropostaValida} p @param {string} time @param {number} em
 */
export function eventoDaProposta(p, time, em) {
  return {
    tipo: 'proposta-agente', resumo: `${rotuloDoTime(time)} propôs · ${descricaoDaProposta(p)}`,
    autor: autorDoTime(time), proposta: { por: autorDoTime(time), em, via: 'funcao' }, situacao: 'proposta', motivo: p.motivo,
  };
}

/**
 * A anotação de um agente (`agenteRegistrar`): o que ele fez sem mexer na base.
 * @param {string} time @param {any} corpo
 * @returns {{ resumo: string, motivo: string } | { erro: string, status: number }}
 */
export function validarRegistro(time, corpo) {
  if (!TIMES.includes(/** @type {any} */ (time))) return { erro: 'Time desconhecido.', status: 403 };
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const resumo = texto(c.resumo, 300);
  if (resumo.length < 3) return { erro: 'Escreva o resumo do que foi feito.', status: 400 };
  return { resumo, motivo: texto(c.motivo, 500) };
}

/* ============================================================
   A decisão do coach (painel de Aprovações)
   ============================================================ */

/**
 * O que APROVAR faz, por tipo (a execução fica na tela):
 *  - mensagem → a Fila de mensagens (`fila`);
 *  - meta → a meta nova na ficha (`meta`, com o que a tela precisa para montar);
 *  - baixa → a janela de baixa preenchida (`baixa`); a proposta só fica
 *    aprovada quando a baixa é confirmada;
 *  - divergência e pendência → `ciente`.
 * @param {{ tipo: string, alunoId: string, dados: Record<string, any> }} p
 */
export function planoDaAprovacao(p) {
  const d = p.dados || {};
  if (p.tipo === 'mensagem') return { acao: 'fila', alunoId: p.alunoId, texto: String(d.texto || '') };
  if (p.tipo === 'meta') return { acao: 'meta', alunoId: p.alunoId, tipo: String(d.tipo), alvo: Number(d.alvo), prazo: d.prazo || null };
  if (p.tipo === 'baixa') return { acao: 'baixa', alunoId: p.alunoId, mesId: String(d.mesId), valor: Number(d.valor), data: String(d.data), meio: String(d.meio) };
  return { acao: 'ciente', alunoId: p.alunoId };
}

/**
 * A decisão do coach: o que gravar na proposta e a linha dos Registros (quem
 * propôs, quem decidiu, o motivo). null: a proposta já foi decidida, ou recusou
 * sem motivo.
 * @param {any} p a proposta @param {'aprovada'|'recusada'} decisao @param {{ em: number, motivo?: string }} o
 * @returns {{ patch: { situacao: string, decisao: Record<string, any> }, log: Record<string, any> } | null}
 */
export function decidirProposta(p, decisao, { em, motivo = '' }) {
  if (!p || p.situacao !== 'proposta' || (decisao !== 'aprovada' && decisao !== 'recusada')) return null;
  const m = texto(motivo, 500);
  if (decisao === 'recusada' && !m) return null;
  const time = String(p.time || '');
  return {
    patch: { situacao: decisao, decisao: { por: 'coach', em, ...(m ? { motivo: m } : {}) } },
    log: {
      tipo: 'proposta-agente',
      resumo: `${decisao === 'aprovada' ? 'Aprovada' : 'Recusada'} · ${rotuloDoTime(time)} · ${descricaoDaProposta(p)}`,
      proposta: { por: autorDoTime(time), via: 'funcao', ...(Number(p.em) > 0 ? { em: Number(p.em) } : {}) },
      aprovacao: { por: { tipo: 'coach' }, em, decisao },
      situacao: decisao === 'aprovada' ? 'executada' : 'recusada',
      ...(m ? { motivo: m } : {}),
    },
  };
}

/** As propostas esperando decisão, da mais antiga para a mais nova. @param {Record<string, any>|any[]} propostas */
export function pendentes(propostas) {
  const lista = Array.isArray(propostas) ? propostas : Object.values(propostas || {});
  return lista.filter((p) => p && p.situacao === 'proposta').sort((x, y) => (Number(x.em) || 0) - (Number(y.em) || 0));
}
