// @ts-check
/**
 * O plano no card Financeiro da ficha (Fase 1 · etapa 6.1): o resumo (plano,
 * tabela, início, cortesia, pausa, bônus, o valor deste mês e o de jan/2027) e
 * os botões que gravam na hora — Pausar, Voltar, Dupla, Instagram do mês,
 * Indicações e Semanas.
 *
 * As regras moram no cadastro-regras.js (o que gravar) e no
 * compartilhado/regras/planos.js (o valor); aqui é só a tela. O resto do plano
 * (plano, fundador, início, cortesia, parceria local, indicado por) se edita no
 * ✎ do card, pelo salvar global.
 */
import * as db from './db.js?v=37';
import { esc, fmtData, hoje } from './util/formato.js?v=37';
import { painel, confirmar, avisar } from '../../compartilhado/ui/dialogo.js?v=37';
import { brl } from './financeiro-aluno.js?v=37';
import { reg } from './registro.js?v=37';
import {
  mensalidadeDoMes, explicacaoDoValor, rotuloDoPlano, ehFundador, pausaAtual, estaPausado, mesCurto, VIGENCIA_2027,
  TABELAS, TETO_BONUS, BONUS_PCT, FUNDADOR_ATE,
} from '../../compartilhado/regras/planos.js';
import {
  pausar, voltar, ligarDupla, desligarDupla, alternarInstagram, indicacoesDe, darIndicacao, tirarIndicacao, ajustarSemanas,
} from './cadastro-regras.js?v=37';
import {
  fecharContrato, trancar, encerrarAntes, contaDaSaida, registrarDevolucao, avisoDeFim, renovar, passarParaMensal, contratoEmCurso,
  trancamentoDoContrato, MEIOS_DEVOLUCAO,
} from './contratos-regras.js?v=37';
import { precoDoContrato, contratosDe, fimDoContrato, somarMeses } from '../../compartilhado/regras/planos.js';

/* ============================================================
   O contrato (etapa 6.2)
   ============================================================ */

/** O contrato que importa no card: o em curso, ou o próximo. @param {any} v @param {string} mesAtual */
function contratoDoCard(v, mesAtual) {
  return contratoEmCurso(v, mesAtual) || contratosDe(v).filter((c) => c.inicio > mesAtual && !c.saida).sort((x, y) => (x.inicio < y.inicio ? -1 : 1))[0] || null;
}

/** A linha do contrato no resumo. @param {any} v @param {any} c */
function linhaDoContrato(v, c) {
  const fim = fimDoContrato(c);
  const t = trancamentoDoContrato(v, c);
  const partes = [`${esc(c.prazo)}, ${mesCurto(c.inicio)} a ${mesCurto(fim)}`, `${brl(c.total)} de uma vez${c.pctBonus ? ` (bônus ${c.pctBonus}%)` : ''}`];
  if (c.saida) partes.push(`encerrado em ${mesCurto(c.saida.ultimoMes)} · devolver ${brl(c.saida.devolucao)}${c.devolucao ? ` (devolvido em ${fmtData(c.devolucao.data)})` : ''}`);
  else partes.push(`trancamento: ${t.periodosUsados} de ${t.periodos}${t.diasUsados ? ` (${t.diasUsados} dias esticados)` : ''}`);
  return partes.join(' · ');
}

/* ============================================================
   HTML (puro)
   ============================================================ */

/** O valor de um mês com a explicação. @param {any} v @param {string} mesId */
function linhaDoValor(v, mesId) {
  const m = mensalidadeDoMes(v, mesId);
  const exp = explicacaoDoValor(m);
  const cheia = m.valor !== m.cheia && m.cheia > 0 ? ` <s class="fg-cheia">${brl(m.cheia)}</s>` : '';
  return `<b>${brl(m.valor)}</b>${cheia}${exp.length ? `<span class="fg-exp">${exp.map(esc).join(' · ')}</span>` : ''}`;
}

/**
 * Os bônus marcados na ficha, em chips.
 * @param {any} v @param {string} mesAtual
 */
function chipsDosBonus(v, mesAtual) {
  const chips = [];
  if (v.dupla && v.dupla.id) chips.push(`Dupla com ${esc(v.dupla.nome || v.dupla.id)} · 10%`);
  const insta = (Array.isArray(v.instagram) ? v.instagram : []).filter((m) => m >= mesAtual.slice(0, 4) + '-01').slice(-3);
  if (insta.length) chips.push(`Instagram: ${insta.map(mesCurto).join(', ')}`);
  if (v.parceriaLocal && v.parceriaLocal.desde) chips.push(`Parceria ${esc(v.parceriaLocal.nome || '')} desde ${mesCurto(v.parceriaLocal.desde)}`);
  if (v.indicadoPor && v.indicadoPor.id) chips.push(`Indicado por ${esc(v.indicadoPor.nome || v.indicadoPor.id)}${v.indicadoPor.mes ? ` · 30% em ${mesCurto(v.indicadoPor.mes)}` : ''}`);
  for (const i of Array.isArray(v.indicacoes) ? v.indicacoes : []) if (i) chips.push(`Indicou ${esc(i.nome || i.id)} · 30% em ${mesCurto(i.mes)}`);
  return chips.map((c) => `<span class="ac-chip fg-neutro">${c}</span>`).join(' ');
}

/**
 * O resumo do plano no modo leitura do card Financeiro.
 * @param {any} v a ficha (com o rascunho) @param {any[]} todos @param {string} hojeIso
 */
export function htmlPlanoResumo(v, todos, hojeIso) {
  const mesAtual = hojeIso.slice(0, 7);
  const rot = rotuloDoPlano(v.plano);
  const tabela = rot ? `<span class="ac-chip ${ehFundador(v) ? 'fg-ok' : 'fg-neutro'}">${ehFundador(v) ? 'Fundador' : 'Regular'}</span>` : '';
  const p = pausaAtual(v);
  const linhas = [
    ['Plano', rot ? `${esc(rot)} ${tabela}` : '<span class="fg-sem">Sem plano: vale o valor da ficha</span>'],
    ['Início', v.inicio ? fmtData(v.inicio) : ''],
  ];
  if (v.cortesia || Number(v.parceria && v.parceria.percentual) >= 100) {
    linhas.push(['Cortesia', esc((v.cortesia && v.cortesia.motivo) || (v.parceria && v.parceria.nome) || 'sim')]);
  }
  if (p) linhas.push(['Pausa', `desde ${fmtData(p.desde)}${p.motivo ? ` · ${esc(p.motivo)}` : ''}`]);
  const bonus = chipsDosBonus(v, mesAtual);
  if (bonus) linhas.push(['Bônus', bonus]);
  const contrato = contratoDoCard(v, mesAtual);
  const semDevolucao = contratosDe(v).find((c) => c.saida && !c.devolucao);
  if (contrato) linhas.push(['Contrato', linhaDoContrato(v, contrato)]);
  else if (semDevolucao) linhas.push(['Contrato', linhaDoContrato(v, semDevolucao)]);
  const aviso = avisoDeFim(v, hojeIso);
  if (aviso) linhas.push(['Fim do contrato', `<b>termina em ${fmtData(aviso.ultimoDia)}</b>: renove, passe para o mensal ou encerre`]);
  linhas.push([`Mensalidade de ${mesCurto(mesAtual)}`, linhaDoValor(v, mesAtual)]);
  if (mesAtual < VIGENCIA_2027 && v.plano) linhas.push([`A partir de ${mesCurto(VIGENCIA_2027)}`, linhaDoValor(v, VIGENCIA_2027)]);

  const m = mensalidadeDoMes(v, mesAtual);
  const inativa = (v.status || 'ativo') === 'inativo';
  const nIndic = indicacoesDe(v, todos).length;
  const instaMarcado = Array.isArray(v.instagram) && v.instagram.includes(mesAtual);
  const emCurso = contratoEmCurso(v, mesAtual);
  // Com contrato no mês, a pausa é o trancamento (estica o contrato até o limite).
  const pausarOuTrancar = emCurso && !emCurso.saida
    ? '<button class="btn ghost btn-sm" type="button" data-plano="trancar">Trancar</button>'
    : '<button class="btn ghost btn-sm" type="button" data-plano="pausar">Pausar</button>';
  const botoes = [
    !inativa ? (estaPausado(v) ? '<button class="btn btn-sm" type="button" data-plano="voltar">Voltar da pausa</button>' : pausarOuTrancar) : '',
    aviso ? '<button class="btn btn-sm" type="button" data-plano="renovar">Renovar igual</button><button class="btn ghost btn-sm" type="button" data-plano="mensal">Passar para mensal</button>' : '',
    !inativa && v.plano && !contrato ? '<button class="btn ghost btn-sm" type="button" data-plano="fechar-contrato">Fechar contrato</button>' : '',
    emCurso && !emCurso.saida ? '<button class="btn ghost btn-sm" type="button" data-plano="encerrar">Encerrar antes</button>' : '',
    semDevolucao ? '<button class="btn btn-sm" type="button" data-plano="devolucao">Registrar devolução</button>' : '',
    v.dupla && v.dupla.id ? '<button class="btn ghost btn-sm" type="button" data-plano="desligar-dupla">Desligar dupla</button>' : '<button class="btn ghost btn-sm" type="button" data-plano="dupla">Ligar dupla</button>',
    `<button class="btn ghost btn-sm" type="button" data-plano="instagram" aria-pressed="${instaMarcado}">${instaMarcado ? '✓ ' : ''}Instagram de ${mesCurto(mesAtual)}</button>`,
    nIndic ? `<button class="btn ghost btn-sm" type="button" data-plano="indicacoes">Indicações (${nIndic})</button>` : '',
    m.porque || m.ajuste ? '<button class="btn ghost btn-sm" type="button" data-plano="semanas">Semanas do mês</button>' : '',
    '<button class="btn ghost btn-sm" type="button" data-plano="tabelas">Tabelas de preço</button>',
  ].filter(Boolean).join('');
  return `<dl class="card-dl fg-plano-dl">${linhas.map(([r, val]) => `
      <div class="card-linha"><dt>${esc(r)}</dt><dd>${val === '' || val == null ? '<span class="card-vazio">—</span>' : val}</dd></div>`).join('')}
    </dl>
    <div class="fg-botoes fg-plano-botoes">${botoes}</div>`;
}

/** As linhas das tabelas, na ordem do PDF. */
const LINHAS_DA_TABELA = [
  ['2x-mensal', '2x mensal (Legado)'], ['3x-mensal', '3x mensal'], ['3x-trimestral', '3x trimestral'], ['3x-semestral', '3x semestral'],
  ['4x-mensal', '4x mensal'], ['4x-trimestral', '4x trimestral'], ['4x-semestral', '4x semestral'], ['ilimitado-mensal', 'Ilimitado (5–6x)'],
];

/** As tabelas de 2027, o teto e os bônus (só leitura). */
export function htmlTabelas() {
  const celula = (/** @type {number|undefined} */ v) => (typeof v === 'number' ? brl(v) : '<span class="card-vazio">—</span>');
  const [ano, mes, dia] = FUNDADOR_ATE.split('-');
  const linhas = LINHAS_DA_TABELA.map(([k, rot]) => `<tr><th scope="row">${rot}</th><td>${celula(/** @type {any} */ (TABELAS.fundador)[k])}</td><td>${celula(/** @type {any} */ (TABELAS.regular)[k])}</td></tr>`).join('');
  return `<p class="dlg-texto">Valem da fatura de ${mesCurto(VIGENCIA_2027)} em diante. Até lá, cada aluno paga o valor de hoje, que está na ficha. Fundador é quem começou até ${dia}/${mes}/${ano}. Trimestral e semestral entram na próxima parte da etapa.</p>
    <table class="pl-tabela"><thead><tr><th>Plano (por mês)</th><th>Fundadores</th><th>Regular</th></tr></thead><tbody>${linhas}</tbody></table>
    <p class="dlg-texto"><b>Bônus</b> (de ${mesCurto(VIGENCIA_2027)} em diante, somados até ${TETO_BONUS}%): dupla/casal ${BONUS_PCT.dupla}%, Instagram ${BONUS_PCT.instagram}% no mês seguinte, parceria local ${BONUS_PCT.parceriaInicio}% na 1ª fatura e ${BONUS_PCT.parceria}% depois, indicação ${BONUS_PCT.indicacao}%.</p>`;
}

/* ============================================================
   DOM: os botões
   ============================================================ */

/** Grava, registra e diz o que aconteceu. @param {any} a @param {{ patch: any, log: any }} r */
function aplicar(a, r) {
  db.atualizar(a.id, r.patch);
  reg(r.log.tipo, { ...a, ...r.patch }, r.log.resumo, r.log.extra || {});
}

/** O valor de um campo do diálogo aberto. @param {string} sel */
const valorDe = (sel) => String(/** @type {any} */ (document.querySelector(sel))?.value || '').trim();

/** Pausar: o dia em que começa e o motivo (opcional). @param {any} a */
async function acaoPausar(a) {
  const ok = await painel({
    titulo: `Pausar o plano de ${a.nome || a.id}`,
    corpoHTML: `<p class="dlg-texto">Pausado, ele sai das turmas e da cobrança, e os créditos congelam. O mês em que pausa é cobrado inteiro; a partir do mês seguinte, nada.</p>
      <label class="dlg-motivo-l" for="pl-desde">A pausa começa em</label>
      <input id="pl-desde" class="dlg-motivo" type="date" value="${hoje()}" />
      <label class="dlg-motivo-l" for="pl-motivo">Motivo (opcional)</label>
      <textarea id="pl-motivo" class="dlg-motivo" rows="2" maxlength="300" placeholder="Ex.: viagem, lesão"></textarea>`,
    acoes: [{ id: 'ok', label: 'Pausar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const r = pausar(a, { desde: valorDe('#pl-desde'), motivo: valorDe('#pl-motivo') });
  if ('recusa' in r) { await avisar({ titulo: 'Não pausou', texto: r.recusa }); return; }
  aplicar(a, r);
}

/** Voltar: o dia em que volta a treinar. @param {any} a */
async function acaoVoltar(a) {
  const p = pausaAtual(a);
  const ok = await painel({
    titulo: `Voltar da pausa: ${a.nome || a.id}`,
    corpoHTML: `<p class="dlg-texto">Pausado desde <b>${p ? fmtData(p.desde) : '—'}</b>. No mês da volta ele paga só as semanas que faltam (a semana quebrada conta se treinar as vezes do plano nela). Os créditos em aberto ganham os dias pausados na validade.</p>
      <label class="dlg-motivo-l" for="pl-ate">Volta a treinar em</label>
      <input id="pl-ate" class="dlg-motivo" type="date" value="${hoje()}" />`,
    acoes: [{ id: 'ok', label: 'Voltar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const r = voltar(a, { ate: valorDe('#pl-ate') });
  if ('recusa' in r) { await avisar({ titulo: 'Não voltou', texto: r.recusa }); return; }
  aplicar(a, r);
}

/** Ligar a dupla: escolher o outro aluno. @param {any} a */
async function acaoDupla(a) {
  const candidatos = db.listar().filter((x) => x.id !== a.id && (x.status || 'ativo') !== 'inativo' && !(x.dupla && x.dupla.id));
  if (!candidatos.length) { await avisar({ titulo: 'Sem aluno livre', texto: 'Nenhum aluno ativo está sem dupla.' }); return; }
  const ok = await painel({
    titulo: 'Ligar a dupla (10% para os dois)',
    corpoHTML: `<p class="dlg-texto">O desconto vale de jan/2027 em diante, enquanto os dois treinarem no mesmo dia e horário. Se separarem por mais de 2 treinos sem justificativa, desligue.</p>
      <label class="dlg-motivo-l" for="pl-dupla">Dupla de ${esc(a.nome || a.id)}</label>
      <select id="pl-dupla" class="dlg-motivo">${candidatos.map((x) => `<option value="${esc(x.id)}">${esc(x.nome || x.id)}</option>`).join('')}</select>`,
    acoes: [{ id: 'ok', label: 'Ligar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const b = db.obter(valorDe('#pl-dupla'));
  const r = ligarDupla(a, b);
  if ('recusa' in r) { await avisar({ titulo: 'Não ligou', texto: r.recusa }); return; }
  if (r.aviso && !(await confirmar({ titulo: 'A grade dos dois é diferente', texto: `${esc(r.aviso)}.<br>O bônus pede o mesmo dia e horário. Ligar mesmo assim?`, ok: 'Ligar' }))) return;
  db.atualizar(a.id, r.patchA);
  db.atualizar(b.id, r.patchB);
  reg(r.logA.tipo, { ...a, ...r.patchA }, r.logA.resumo);
  reg(r.logB.tipo, { ...b, ...r.patchB }, r.logB.resumo);
}

/** Desligar a dupla dos dois. @param {any} a */
async function acaoDesligarDupla(a) {
  const b = a.dupla && a.dupla.id ? db.obter(a.dupla.id) : null;
  if (!(await confirmar({ titulo: 'Desligar a dupla?', texto: `Os 10% saem de ${esc(a.nome || a.id)}${b ? ` e de ${esc(b.nome || b.id)}` : ''} a partir da próxima fatura em aberto.`, ok: 'Desligar', perigo: true }))) return;
  const r = desligarDupla(a, b);
  db.atualizar(a.id, r.patchA);
  reg(r.logA.tipo, { ...a, ...r.patchA }, r.logA.resumo);
  if (b && r.patchB) { db.atualizar(b.id, r.patchB); reg(r.logB.tipo, { ...b, ...r.patchB }, r.logB.resumo); }
}

/** As indicações: dar ou tirar os 30% de quem indicou. @param {any} a */
async function acaoIndicacoes(a) {
  const lista = indicacoesDe(a, db.listar());
  const linhas = lista.map((i) => {
    const pago = i.pagoEm ? `pagou a 1ª (${mesCurto(i.mes)}) em ${fmtData(i.pagoEm)}` : `ainda não pagou a 1ª (${mesCurto(i.mes)})`;
    const situacao = i.dado ? 'já dado' : i.elegivel ? `pode ganhar 30% em ${mesCurto(i.mesDoBonus)}` : 'fora do corte do dia 10';
    return `<li><b>${esc(i.indicado.nome || i.indicado.id)}</b>: ${pago} · ${situacao}</li>`;
  }).join('');
  const acoes = lista.flatMap((i) => (i.dado
    ? [{ id: `tirar:${i.indicado.id}`, label: `Tirar os 30% (${i.indicado.nome || i.indicado.id})`, secundaria: true }]
    : i.elegivel ? [{ id: `dar:${i.indicado.id}`, label: `Dar 30% em ${mesCurto(i.mesDoBonus)} (${i.indicado.nome || i.indicado.id})` }] : []));
  const escolha = await painel({ titulo: `Indicações de ${a.nome || a.id}`, corpoHTML: `<ul class="dlg-lista">${linhas}</ul><p class="hint">O indicador ganha 30% no mês seguinte à 1ª mensalidade do indicado, se ela foi paga até o dia 10.</p>`, acoes, largo: false });
  if (!escolha) return;
  const [op, id] = escolha.split(':');
  const i = lista.find((x) => x.indicado.id === id);
  if (!i) return;
  const r = op === 'dar' ? darIndicacao(a, i.indicado, i.mesDoBonus) : tirarIndicacao(a, id);
  if ('recusa' in r) { await avisar({ titulo: 'Nada mudou', texto: r.recusa }); return; }
  aplicar(a, r);
}

/** Corrigir as semanas de um mês. @param {any} a */
async function acaoSemanas(a) {
  const mesAtual = hoje().slice(0, 7);
  const m = mensalidadeDoMes(a, mesAtual);
  const opcoes = [['', `Pela regra (${m.ajuste ? 'tirar o ajuste' : `${m.semanas} de 4`})`], ['0', '0 de 4'], ['1', '1 de 4'], ['2', '2 de 4'], ['3', '3 de 4'], ['4', '4 de 4 (mês inteiro)']];
  const ok = await painel({
    titulo: 'Semanas do mês',
    corpoHTML: `<p class="dlg-texto">Pela regra, ${esc(a.nome || a.id)} paga ${m.semanas} de 4 semanas em ${mesCurto(mesAtual)}${m.quebrada ? ' (a semana quebrada contou)' : ''}. Corrija se a presença não contou certo.</p>
      <label class="dlg-motivo-l" for="pl-sem">Semanas cobradas em ${mesCurto(mesAtual)}</label>
      <select id="pl-sem" class="dlg-motivo">${opcoes.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`,
    acoes: [{ id: 'ok', label: 'Gravar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const v = valorDe('#pl-sem');
  const r = ajustarSemanas(a, mesAtual, v === '' ? null : Number(v));
  if ('recusa' in r) { await avisar({ titulo: 'Nada mudou', texto: r.recusa }); return; }
  aplicar(a, r);
}

/**
 * Executa o botão `data-plano` do card (a ficha SALVA do aluno aberto).
 * @param {string} acao @param {string} alunoId
 */
export async function acaoDoPlano(acao, alunoId) {
  const a = db.obter(alunoId);
  if (!a) return;
  if (acao === 'pausar') return acaoPausar(a);
  if (acao === 'voltar') return acaoVoltar(a);
  if (acao === 'dupla') return acaoDupla(a);
  if (acao === 'desligar-dupla') return acaoDesligarDupla(a);
  if (acao === 'instagram') {
    const r = alternarInstagram(a, hoje().slice(0, 7));
    if (!('recusa' in r)) aplicar(a, r);
    return;
  }
  if (acao === 'indicacoes') return acaoIndicacoes(a);
  if (acao === 'semanas') return acaoSemanas(a);
  if (acao === 'tabelas') { await painel({ titulo: 'Tabelas de preço de 2027', corpoHTML: htmlTabelas(), largo: true }); return; }
  if (acao === 'fechar-contrato') return acaoFecharContrato(a);
  if (acao === 'trancar') return acaoTrancar(a);
  if (acao === 'encerrar') return acaoEncerrar(a);
  if (acao === 'devolucao') return acaoDevolucao(a);
  if (acao === 'renovar') {
    const av = avisoDeFim(a, hoje());
    if (!av || !(await confirmar({ titulo: 'Renovar o contrato?', texto: `Um contrato ${esc(av.c.prazo)} igual, a partir de ${mesCurto(av.proximoMes)}, com a tabela de hoje.`, ok: 'Renovar' }))) return;
    const r = renovar(a, { id: `ct-${Date.now().toString(36)}`, hojeIso: hoje() });
    if ('recusa' in r) { await avisar({ titulo: 'Não renovou', texto: r.recusa }); return; }
    aplicar(a, r);
    return;
  }
  if (acao === 'mensal') {
    if (!(await confirmar({ titulo: 'Passar para o mensal?', texto: 'No fim do contrato, o aluno volta a pagar todo mês, pelo plano mensal da tabela dele.', ok: 'Passar para mensal' }))) return;
    const r = passarParaMensal(a);
    if ('recusa' in r) { await avisar({ titulo: 'Nada mudou', texto: r.recusa }); return; }
    aplicar(a, r);
  }
}

/** Fechar contrato: o prazo e o 1º mês, com o total antes de gravar. @param {any} a */
async function acaoFecharContrato(a) {
  const mesAtual = hoje().slice(0, 7);
  const primeiro = somarMeses(mesAtual, 1) < VIGENCIA_2027 ? VIGENCIA_2027 : somarMeses(mesAtual, 1);
  const opcao = (/** @type {'trimestral'|'semestral'} */ prazo) => {
    const p = precoDoContrato(a, prazo, primeiro);
    return p ? `<option value="${prazo}">${prazo === 'trimestral' ? 'Trimestral (3 meses)' : 'Semestral (6 meses)'}: ${brl(p.total)}${p.pctBonus ? ` com ${p.pctBonus}% de bônus` : ''}</option>` : '';
  };
  const opcoes = opcao('trimestral') + opcao('semestral');
  if (!opcoes) { await avisar({ titulo: 'Sem contrato para esse plano', texto: 'A tabela do aluno não tem trimestral nem semestral para o plano dele.' }); return; }
  const ok = await painel({
    titulo: `Fechar contrato: ${a.nome || a.id}`,
    corpoHTML: `<p class="dlg-texto">Pago de uma vez, cobre meses inteiros. Se ele fechar no meio do mês, o mês corrente segue no mensal (pelas semanas) e o contrato começa no mês seguinte.</p>
      <label class="dlg-motivo-l" for="ct-prazo">Prazo (valor para ${mesCurto(primeiro)})</label>
      <select id="ct-prazo" class="dlg-motivo">${opcoes}</select>
      <label class="dlg-motivo-l" for="ct-inicio">1º mês do contrato</label>
      <input id="ct-inicio" class="dlg-motivo" type="month" value="${primeiro}" min="${primeiro}" />`,
    acoes: [{ id: 'ok', label: 'Continuar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const prazo = /** @type {'trimestral'|'semestral'} */ (valorDe('#ct-prazo'));
  const r = fecharContrato(a, { prazo, inicio: valorDe('#ct-inicio'), id: `ct-${Date.now().toString(36)}`, hojeIso: hoje() });
  if ('recusa' in r) { await avisar({ titulo: 'Não fechou', texto: r.recusa }); return; }
  if (!(await confirmar({ titulo: 'Confirmar o contrato?', texto: `${esc(r.log.resumo)}.<br>A fatura do 1º mês leva esse valor; os outros meses cobram só o consumo.`, ok: 'Fechar contrato' }))) return;
  aplicar(a, r);
}

/** Trancar o contrato: o dia em que começa e o motivo. @param {any} a */
async function acaoTrancar(a) {
  const c = contratoEmCurso(a, hoje().slice(0, 7));
  const t = c ? trancamentoDoContrato(a, c) : null;
  const ok = await painel({
    titulo: `Trancar o contrato de ${a.nome || a.id}`,
    corpoHTML: `<p class="dlg-texto">Trancado, ele sai das turmas e os créditos congelam. Cada trancamento estica o contrato em até ${t ? t.diasPorPeriodo : 15} dias (este contrato tem ${t ? t.periodos : 1}; já usou ${t ? t.periodosUsados : 0}). Use "Voltar da pausa" quando ele voltar.</p>
      <label class="dlg-motivo-l" for="pl-desde">O trancamento começa em</label>
      <input id="pl-desde" class="dlg-motivo" type="date" value="${hoje()}" />
      <label class="dlg-motivo-l" for="pl-motivo">Motivo (opcional)</label>
      <textarea id="pl-motivo" class="dlg-motivo" rows="2" maxlength="300" placeholder="Ex.: viagem, lesão"></textarea>`,
    acoes: [{ id: 'ok', label: 'Trancar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const r = trancar(a, { desde: valorDe('#pl-desde'), motivo: valorDe('#pl-motivo') });
  if ('recusa' in r) { await avisar({ titulo: 'Não trancou', texto: r.recusa }); return; }
  aplicar(a, r);
}

/** Encerrar o contrato antes do fim: o último mês, a conta e o motivo. @param {any} a */
async function acaoEncerrar(a) {
  const mesAtual = hoje().slice(0, 7);
  const c = contratoEmCurso(a, mesAtual);
  if (!c) return;
  const conta = contaDaSaida(c, mesAtual);
  const ok = await painel({
    titulo: `Encerrar o contrato de ${a.nome || a.id}`,
    corpoHTML: `<p class="dlg-texto">A multa é ${MULTA_TXT} das mensalidades que faltam, e o box devolve o resto. Com ${mesCurto(mesAtual)} como último mês: faltam ${conta.mesesQueFaltam} ${conta.mesesQueFaltam === 1 ? 'mês' : 'meses'} (${brl(conta.valorQueFalta)}), multa ${brl(conta.multa)}, devolver <b>${brl(conta.devolucao)}</b>.</p>
      <label class="dlg-motivo-l" for="ct-ultimo">Último mês que ele usa</label>
      <input id="ct-ultimo" class="dlg-motivo" type="month" value="${mesAtual}" min="${c.inicio}" />
      <label class="dlg-motivo-l" for="ct-motivo">Motivo</label>
      <textarea id="ct-motivo" class="dlg-motivo" rows="2" maxlength="300" placeholder="Ex.: mudou de cidade"></textarea>`,
    acoes: [{ id: 'ok', label: 'Encerrar contrato', perigo: true }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const r = encerrarAntes(a, c.id, { ultimoMes: valorDe('#ct-ultimo'), motivo: valorDe('#ct-motivo'), em: Date.now() });
  if ('recusa' in r) { await avisar({ titulo: 'Não encerrou', texto: r.recusa }); return; }
  if (!(await confirmar({ titulo: 'Confirmar o encerramento?', texto: `${esc(r.log.resumo)}.`, ok: 'Encerrar', perigo: true }))) return;
  aplicar(a, r);
}

/** A multa, em texto. */
const MULTA_TXT = '20%';

/** Registrar a devolução feita por fora. @param {any} a */
async function acaoDevolucao(a) {
  const c = contratosDe(a).find((x) => x.saida && !x.devolucao);
  if (!c) return;
  const ok = await painel({
    titulo: 'Registrar a devolução',
    corpoHTML: `<p class="dlg-texto">Devolver <b>${brl(c.saida.devolucao)}</b> do contrato ${esc(c.prazo)} encerrado em ${mesCurto(c.saida.ultimoMes)}. Registre depois de devolver.</p>
      <label class="dlg-motivo-l" for="dv-data">Devolvido em</label>
      <input id="dv-data" class="dlg-motivo" type="date" value="${hoje()}" />
      <label class="dlg-motivo-l" for="dv-meio">Como</label>
      <select id="dv-meio" class="dlg-motivo">${Object.entries(MEIOS_DEVOLUCAO).map(([k, rot]) => `<option value="${k}">${rot}</option>`).join('')}</select>`,
    acoes: [{ id: 'ok', label: 'Registrar' }], largo: false, fechar: 'Cancelar',
  });
  if (ok !== 'ok') return;
  const r = registrarDevolucao(a, c.id, { data: valorDe('#dv-data'), meio: valorDe('#dv-meio'), em: Date.now() });
  if ('recusa' in r) { await avisar({ titulo: 'Não registrou', texto: r.recusa }); return; }
  aplicar(a, r);
}
