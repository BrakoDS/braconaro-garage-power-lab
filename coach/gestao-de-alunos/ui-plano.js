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
import * as db from './db.js?v=34';
import { esc, fmtData, hoje } from './util/formato.js?v=34';
import { painel, confirmar, avisar } from '../../compartilhado/ui/dialogo.js?v=34';
import { brl } from './financeiro-aluno.js?v=34';
import { reg } from './registro.js?v=34';
import {
  mensalidadeDoMes, explicacaoDoValor, rotuloDoPlano, ehFundador, pausaAtual, estaPausado, mesCurto, VIGENCIA_2027,
} from '../../compartilhado/regras/planos.js';
import {
  pausar, voltar, ligarDupla, desligarDupla, alternarInstagram, indicacoesDe, darIndicacao, tirarIndicacao, ajustarSemanas,
} from './cadastro-regras.js?v=34';

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
  linhas.push([`Mensalidade de ${mesCurto(mesAtual)}`, linhaDoValor(v, mesAtual)]);
  if (mesAtual < VIGENCIA_2027 && v.plano) linhas.push([`A partir de ${mesCurto(VIGENCIA_2027)}`, linhaDoValor(v, VIGENCIA_2027)]);

  const m = mensalidadeDoMes(v, mesAtual);
  const inativa = (v.status || 'ativo') === 'inativo';
  const nIndic = indicacoesDe(v, todos).length;
  const instaMarcado = Array.isArray(v.instagram) && v.instagram.includes(mesAtual);
  const botoes = [
    !inativa ? (estaPausado(v) ? '<button class="btn btn-sm" type="button" data-plano="voltar">Voltar da pausa</button>' : '<button class="btn ghost btn-sm" type="button" data-plano="pausar">Pausar</button>') : '',
    v.dupla && v.dupla.id ? '<button class="btn ghost btn-sm" type="button" data-plano="desligar-dupla">Desligar dupla</button>' : '<button class="btn ghost btn-sm" type="button" data-plano="dupla">Ligar dupla</button>',
    `<button class="btn ghost btn-sm" type="button" data-plano="instagram" aria-pressed="${instaMarcado}">${instaMarcado ? '✓ ' : ''}Instagram de ${mesCurto(mesAtual)}</button>`,
    nIndic ? `<button class="btn ghost btn-sm" type="button" data-plano="indicacoes">Indicações (${nIndic})</button>` : '',
    m.porque || m.ajuste ? '<button class="btn ghost btn-sm" type="button" data-plano="semanas">Semanas do mês</button>' : '',
  ].filter(Boolean).join('');
  return `<dl class="card-dl fg-plano-dl">${linhas.map(([r, val]) => `
      <div class="card-linha"><dt>${esc(r)}</dt><dd>${val === '' || val == null ? '<span class="card-vazio">—</span>' : val}</dd></div>`).join('')}
    </dl>
    <div class="fg-botoes fg-plano-botoes">${botoes}</div>`;
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
}
