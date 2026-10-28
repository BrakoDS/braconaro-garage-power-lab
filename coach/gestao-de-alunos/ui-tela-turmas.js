// @ts-check
/**
 * Tela Turmas — o Painel de Presença do coach: as turmas do dia, quem está em
 * cada uma, e o que aconteceu com cada aula.
 *
 * As REGRAS (prazo de 2h, crédito de 30 dias, reposição até 1h antes, vagas)
 * moram em `presenca-regras.js`, puras e testadas; o check-in e o desfazer são
 * os mesmos do `checkin-regras.js`. Aqui ficam o desenho, os botões e a
 * aplicação: a regra devolve o que mudar e a linha do log, e a tela grava
 * (`db.atualizar` — que já publica o Portal) e registra.
 *
 * O que é do box e não de um aluno (as vagas de cada horário e as aulas
 * experimentais) vai no meta: `db.salvarVagasDaTurma` e `db.salvarExperimentais`.
 */
import * as db from './db.js?v=27';
import * as regras from './presenca-regras.js?v=27';
import { checkin, desfazer } from './checkin-regras.js?v=27';
import { esc, hoje, fmtData, fmtDataCurta, addDias, horaLegivel } from './util/formato.js?v=27';
import { $ } from './util/dom.js?v=27';
import { on, EVENTOS } from './estado.js?v=27';
import { reg } from './registro.js?v=27';
import { telaAtual } from './navegacao.js?v=27';

const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** O dia na tela. */
let dia = hoje();
/** O horário escolhido ('' = a turma sem horário; null = escolher sozinho). */
let horaSel = /** @type {string | null} */ (null);
/** Horários abertos à mão neste dia (para pôr experimental ou reposição numa turma vazia). */
let horasAbertas = /** @type {string[]} */ ([]);
/**
 * O painel de desmarcar aberto — um só por vez. `chave` é `${id}|${tipo}|${chave da aula}`;
 * data/hora: quando o aluno avisou (o prazo conta dali).
 */
let painel = /** @type {{ chave: string, data: string, hora: string } | null} */ (null);
/** Recado da última ação recusada, mostrado na linha (`chave`) ou no "Adicionar". */
let aviso = /** @type {{ chave: string, texto: string } | null} */ (null);

/** O relógio de agora. @returns {import('./checkin-regras.js').Relogio} */
const relogio = () => ({ hoje: hoje(), agora: new Date().toTimeString().slice(0, 5) });

/** "Qua · 07/10/2026" @param {string} iso */
function labelDia(iso) { const d = new Date(iso + 'T00:00:00'); return `${DIAS_SEM[d.getDay()]} · ${fmtData(iso)}`; }

/** A chave de uma linha. @param {regras.AulaNaTurma} x */
const chaveDaLinha = (x) => `${x.aluno.id}|${x.tipo}|${x.chave}`;

/** As turmas do dia, do jeito que a tela usa. */
function turmasDeHoje() {
  const alunos = db.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
  return regras.turmasDoDia(alunos, dia, {
    hoje: hoje(), fechados: db.diasFechados(), experimentais: db.experimentaisDoDia(dia),
    config: db.configTurmas(), horasExtras: horasAbertas,
  });
}

/**
 * Sem escolha (ou com uma que sumiu), a turma da vez: hoje, a primeira que
 * ainda não acabou (começou há menos de 1h); outro dia, a primeira.
 * @param {ReturnType<typeof turmasDeHoje>} turmas
 */
function escolherTurma(turmas) {
  if (horaSel != null && turmas.some((t) => t.hora === horaSel)) return horaSel;
  if (!turmas.length) return null;
  if (dia === hoje()) {
    const { agora } = relogio();
    const [h, m] = agora.split(':').map(Number);
    const umaHoraAtras = `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const daVez = turmas.find((t) => t.hora && t.hora >= umaHoraAtras);
    if (daVez) return daVez.hora;
  }
  return turmas[0].hora;
}

/* ============================================================
   Desenho
   ============================================================ */

function render() {
  $('#tur-data-lbl').textContent = labelDia(dia);
  const turmas = turmasDeHoje();
  horaSel = escolherTurma(turmas);
  const turma = turmas.find((t) => t.hora === horaSel) || null;
  const fechado = db.diasFechados().includes(dia);

  const chips = turmas.map((t) => {
    const ativo = t.hora === horaSel;
    return `<button class="tur-chip${ativo ? ' ativo' : ''}${t.lotada ? ' lotada' : ''}" data-hora="${esc(t.hora)}" aria-pressed="${ativo}" type="button">
      <span class="tur-chip-h">${esc(t.hora ? horaLegivel(t.hora) : 'Sem horário')}</span>
      <span class="tur-chip-n">${t.ocupadas}/${t.capacidade}</span>
    </button>`;
  }).join('');

  $('#tur-corpo').innerHTML = `
    ${fechado ? `<div class="tur-fechado">Feriado marcado como <b>box fechado</b>: ninguém leva falta neste dia.</div>` : ''}
    <div class="tur-horarios" role="group" aria-label="Turmas do dia">
      ${chips || `<span class="tur-vazio-txt">Nenhuma turma neste dia.</span>`}
      <span class="tur-abrir">
        <input class="chk-hora-inp" type="time" data-nova-hora aria-label="Abrir outro horário" />
        <button class="btn ghost btn-sm tur-abrir-hora" type="button">Abrir horário</button>
      </span>
    </div>
    ${turma ? corpoDaTurma(turma) : `<div class="empty"><b>Sem turma</b>Ninguém da grade fixa treina neste dia. Abra um horário para marcar reposição ou aula experimental.</div>`}
    <p class="tur-regras">Desmarcar com <b>2h ou mais</b> de antecedência libera a vaga e gera <b>+1 crédito de reposição</b> (vale ${regras.VALIDADE_CREDITO_DIAS} dias).
      Menos de 2h, ou não vir: <b>falta, sem crédito</b>. Reposição: até <b>1h antes</b> da aula, se houver vaga.</p>`;
}

/** @param {ReturnType<typeof turmasDeHoje>[number]} t */
function corpoDaTurma(t) {
  const r = regras.resumoDaTurma(t);
  const cards =
    `<div class="fin-card"><span class="fin-card-l">Ocupação</span><span class="fin-card-v${t.lotada ? ' bad' : ''}">${t.ocupadas}/${t.capacidade}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Confirmados</span><span class="fin-card-v">${r.confirmados}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Presentes</span><span class="fin-card-v ok">${r.presentes}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Desmarcaram</span><span class="fin-card-v">${r.desmarcaram}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Faltas</span><span class="fin-card-v${r.faltas ? ' bad' : ''}">${r.faltas}</span></div>`;
  const vagas = t.hora
    ? `<label class="tur-vagas">Vagas desta turma <input class="chk-hora-inp" type="number" min="0" max="99" value="${t.capacidade}" data-vagas="${esc(t.hora)}" /></label>`
    : '';
  const linhas = [...t.aulas.map(linhaAula), ...t.experimentais.map(linhaExperimental)].join('');
  return `
    <div class="tur-cab">
      <h3 class="tur-titulo">Turma ${esc(t.hora ? horaLegivel(t.hora) : 'sem horário')} <span>· ${t.vagas} vaga${t.vagas === 1 ? '' : 's'} livre${t.vagas === 1 ? '' : 's'}</span></h3>
      ${vagas}
    </div>
    <div class="fin-tot tur-tot">${cards}</div>
    <div class="fin-list" id="tur-list">${linhas || `<div class="empty"><b>Turma vazia</b>Adicione uma reposição ou uma aula experimental.</div>`}</div>
    ${t.hora ? painelAdicionar(t) : ''}`;
}

/** A frase de baixo do nome: o que aconteceu, e o crédito. @param {regras.AulaNaTurma} x */
function notaDaLinha(x) {
  const partes = [];
  const c = x.credito;
  if (x.tipo === 'reposicao') partes.push(`repõe a aula de ${fmtDataCurta(x.chave)}`);
  else if (x.aluno.remarcacoes && x.aluno.remarcacoes[x.chave] && x.chave !== dia) partes.push(`aula de ${fmtDataCurta(x.chave)} remarcada para cá`);
  else partes.push('grade fixa');
  if (x.status === 'presente' && x.horaCheckin) partes.push(`chegou ${x.horaCheckin}`);
  if (x.tipo === 'titular') {
    const ant = (c && c.tipo === 'desmarcacao' ? c : x.registro || {}).antecedenciaMin;
    if (Number.isFinite(ant)) partes.push(`avisou ${regras.textoAntecedencia(ant)}`);
    if (x.registro && x.registro.tipo === 'no-show') partes.push('no-show lançado');
    if (x.automatica) partes.push('o dia passou sem check-in');
    if (c) {
      if (c.tipo === 'excecao') partes.push('crédito concedido (exceção)');
      if (c.reposicao && c.reposicao.data) partes.push(`reposição em ${fmtDataCurta(c.reposicao.data)}${c.reposicao.hora ? ' ' + horaLegivel(c.reposicao.hora) : ''}`);
      else if (c.expira) partes.push(c.expira < hoje() ? `crédito venceu em ${fmtDataCurta(c.expira)}` : `crédito até ${fmtDataCurta(c.expira)}`);
      else partes.push('crédito a agendar');
    } else if (x.status === 'desmarcou-fora' || x.status === 'falta') partes.push('sem crédito');
  } else {
    const rep = c && c.reposicao;
    if (rep && Number.isFinite(rep.antecedenciaMin)) partes.push(`avisou ${regras.textoAntecedencia(rep.antecedenciaMin)}`);
    if (rep && rep.noShow) partes.push('no-show lançado');
    if (x.automatica) partes.push('o dia passou sem check-in');
    if (x.status === 'desmarcou-fora' || x.status === 'falta') partes.push('crédito perdido');
  }
  return partes.join(' · ');
}

/** Os botões de cada situação. @param {regras.AulaNaTurma} x */
function acoesDaLinha(x) {
  const alvo = `data-k="${esc(chaveDaLinha(x))}"`;
  const b = (/** @type {string} */ acao, /** @type {string} */ txt, ghost = true) =>
    `<button class="btn${ghost ? ' ghost' : ''} btn-sm" data-acao="${acao}" ${alvo} type="button">${txt}</button>`;
  const lancada = x.tipo === 'titular' ? !!x.registro : !!(x.credito && x.credito.reposicao && (x.credito.reposicao.noShow || x.credito.reposicao.foraDoPrazo));
  const semCredito = x.tipo === 'titular' ? !x.credito : true;
  switch (x.status) {
    case 'confirmado': return b('presente', '✓ Presente', false) + b('desmarcar', 'Desmarcou') + b('noshow', 'No-show');
    case 'presente': return b('desfazer', 'Desfazer');
    case 'desmarcou-no-prazo':
    case 'atestado':
      return x.credito && x.credito.reposicao && x.credito.reposicao.data ? '' : b('desfazer', 'Desfazer');
    case 'desmarcou-fora':
    case 'falta':
      if (x.tipo === 'titular' && x.credito) return x.credito.reposicao && x.credito.reposicao.data ? '' : b('desfazer', 'Desfazer');
      return (lancada ? '' : b('presente', '✓ Presente', false))
        + (semCredito ? b('credito', 'Conceder crédito') : '')
        + (lancada ? b('desfazer', 'Desfazer') : '');
    default: return '';
  }
}

/** Uma linha de aluno. @param {regras.AulaNaTurma} x */
function linhaAula(x) {
  const k = chaveDaLinha(x);
  const aberto = painel && painel.chave === k;
  const recado = aviso && aviso.chave === k ? `<span class="chk-cel-aviso">${esc(aviso.texto)}</span>` : '';
  return `<div class="fin-row tur-row st-${x.status}">
    <div class="fin-info">
      <div class="fin-nome">${esc(x.aluno.nome)} <span class="tur-tag ${x.tipo}">${x.tipo === 'reposicao' ? 'Reposição' : 'Titular'}</span></div>
      <div class="fin-sub">${esc(notaDaLinha(x))}</div>
      ${recado}
      ${aberto ? painelDesmarcar(x) : ''}
    </div>
    <span class="tur-status st-${x.status}">${esc(regras.STATUS[x.status])}</span>
    <div class="tur-acoes">${acoesDaLinha(x)}</div>
  </div>`;
}

const STATUS_EXP = { confirmado: 'Confirmado', presente: 'Presente', falta: 'Falta', cancelada: 'Cancelou' };
const CLASSE_EXP = { confirmado: 'confirmado', presente: 'presente', falta: 'falta', cancelada: 'desmarcou-no-prazo' };

/** Uma linha de aula experimental. @param {regras.Experimental} e */
function linhaExperimental(e) {
  const alvo = `data-exp="${esc(e.id)}"`;
  const b = (/** @type {string} */ acao, /** @type {string} */ txt, ghost = true) =>
    `<button class="btn${ghost ? ' ghost' : ''} btn-sm" data-acao="${acao}" ${alvo} type="button">${txt}</button>`;
  const acoes = e.status === 'confirmado'
    ? b('exp-presente', '✓ Presente', false) + b('exp-falta', 'No-show') + b('exp-cancelada', 'Cancelou')
    : b('exp-confirmado', 'Desfazer');
  return `<div class="fin-row tur-row st-${CLASSE_EXP[e.status]}">
    <div class="fin-info">
      <div class="fin-nome">${esc(e.nome)} <span class="tur-tag experimental">Experimental</span></div>
      <div class="fin-sub">${esc(e.telefone ? 'WhatsApp ' + e.telefone : 'aula experimental')}</div>
    </div>
    <span class="tur-status st-${CLASSE_EXP[e.status]}">${STATUS_EXP[e.status]}</span>
    <div class="tur-acoes">${acoes}${b('exp-remover', 'Remover')}</div>
  </div>`;
}

/** O que a desmarcação daria, com o aviso digitado. @param {regras.AulaNaTurma} x @param {import('./checkin-regras.js').Relogio} quando */
function previa(x, quando) {
  let ant = null;
  if (x.tipo === 'titular') { const p = regras.previaDesmarcacao(x.aluno, x.chave, quando); ant = p && p.antecedenciaMin; }
  else { const rep = x.credito && x.credito.reposicao; ant = rep ? regras.antecedenciaMin(quando, rep.data, rep.hora) : null; }
  if (ant == null) return { cls: 'bad', texto: 'Aula sem horário: não dá para medir o prazo.' };
  if (ant >= regras.PRAZO_DESMARCAR_MIN) {
    return { cls: 'ok', texto: x.tipo === 'titular'
      ? `Avisou ${regras.textoAntecedencia(ant)}: no prazo — libera a vaga e gera +1 crédito (vale ${regras.VALIDADE_CREDITO_DIAS} dias).`
      : `Avisou ${regras.textoAntecedencia(ant)}: no prazo — o crédito volta para ser usado em outra data.` };
  }
  return { cls: 'bad', texto: `Avisou ${regras.textoAntecedencia(ant)}: fora do prazo de 2h — falta, sem crédito.` };
}

/** O painel de desmarcar: quando o aluno avisou, e o que isso dá. @param {regras.AulaNaTurma} x */
function painelDesmarcar(x) {
  if (!painel) return '';
  const p = previa(x, { hoje: painel.data, agora: painel.hora });
  return `<div class="chk-seletor solto" data-painel>
    <span class="chk-seletor-cap">O aluno avisou em:</span>
    <div class="chk-linha-hora">
      <input class="chk-data-inp" type="date" value="${esc(painel.data)}" data-aviso-data aria-label="Data do aviso" />
      <input class="chk-hora-inp" type="time" value="${esc(painel.hora)}" data-aviso-hora aria-label="Hora do aviso" />
      <button class="btn btn-sm" data-acao="confirmar-desmarcar" data-k="${esc(painel.chave)}" type="button">Confirmar</button>
      <button class="btn ghost btn-sm" data-acao="fechar" type="button">Fechar</button>
    </div>
    <span class="tur-previa ${p.cls}" data-previa>${esc(p.texto)}</span>
  </div>`;
}

/** Adicionar na turma: reposição (com crédito) ou aula experimental. @param {ReturnType<typeof turmasDeHoje>[number]} t */
function painelAdicionar(t) {
  const h = hoje();
  const opcoes = db.listar()
    .filter((a) => (a.status || 'ativo') !== 'inativo')
    .flatMap((a) => regras.creditosDisponiveis(a, h).map((c) => ({ a, c })))
    .sort((x, y) => String(x.a.nome).localeCompare(String(y.a.nome), 'pt-BR'))
    .map(({ a, c }) => {
      const tipo = c.tipo === 'desmarcacao' ? 'desmarcou no prazo' : c.tipo === 'excecao' ? 'exceção' : 'atestado';
      const vence = c.expira ? ` · vence ${fmtDataCurta(c.expira)}` : '';
      return `<option value="${esc(a.id)}|${esc(c.origem)}">${esc(a.nome)} — aula de ${fmtDataCurta(c.origem)} (${tipo}${vence})</option>`;
    }).join('');
  const recado = aviso && aviso.chave === 'adicionar' ? `<span class="chk-cel-aviso">${esc(aviso.texto)}</span>` : '';
  return `<div class="tur-add">
    <span class="eyebrow">Adicionar na turma das ${esc(horaLegivel(t.hora))}${t.lotada ? ' · lotada' : ''}</span>
    ${recado}
    <div class="tur-add-linha">
      <select class="tur-sel" data-rep-sel aria-label="Aluno com crédito de reposição">
        ${opcoes ? `<option value="">Reposição: escolha o aluno e o crédito…</option>${opcoes}` : '<option value="">Nenhum aluno com crédito de reposição</option>'}
      </select>
      <button class="btn btn-sm" data-acao="add-rep" type="button"${opcoes ? '' : ' disabled'}>Agendar reposição</button>
    </div>
    <div class="tur-add-linha">
      <input class="tur-inp" type="text" data-exp-nome placeholder="Nome (aula experimental)" maxlength="60" />
      <input class="tur-inp" type="tel" data-exp-tel placeholder="WhatsApp (opcional)" maxlength="20" />
      <button class="btn btn-sm" data-acao="add-exp" type="button">Adicionar experimental</button>
    </div>
  </div>`;
}

/* ============================================================
   Aplicar
   ============================================================ */

/**
 * Roda a regra sobre a ficha do banco e aplica: grava e registra, ou mostra a
 * recusa na linha (o painel continua aberto).
 * @param {string} id @param {(a: any) => (import('./checkin-regras.js').Mudanca | import('./checkin-regras.js').Recusa | null)} regra
 * @param {string} chaveDoRecado onde a recusa aparece
 */
function aplicar(id, regra, chaveDoRecado) {
  const a = db.obter(id); if (!a) return;
  const r = regra(a);
  if (!r) return;
  if ('recusa' in r) { aviso = { chave: chaveDoRecado, texto: r.recusa.texto }; render(); return; }
  db.atualizar(id, r.patch);
  reg(r.log.tipo, a, r.log.resumo, r.log.extra);
  painel = null;
  render();
}

/** A linha (AulaNaTurma) de uma chave `${id}|${tipo}|${chave}`. @param {string} k */
function linhaPorChave(k) {
  for (const t of turmasDeHoje()) for (const x of t.aulas) if (chaveDaLinha(x) === k) return { x, t };
  return null;
}

/** As ações de uma linha de aluno. @param {string} acao @param {string} k */
function agirNaLinha(acao, k) {
  const achado = linhaPorChave(k);
  if (!achado) return;
  const { x } = achado;
  const id = String(x.aluno.id);
  const rep = x.tipo === 'reposicao';
  const em = Date.now();
  if (acao === 'presente') {
    // Check-in da reposição grava no dia dela; o do titular, no dia em que a aula acontece.
    aplicar(id, (a) => checkin(a, rep ? dia : x.chave, { ehReposicao: rep, ...relogio() }), k); return;
  }
  if (acao === 'desmarcar') {
    const r = relogio();
    painel = painel && painel.chave === k ? null : { chave: k, data: r.hoje, hora: r.agora };
    render(); return;
  }
  if (acao === 'confirmar-desmarcar' && painel) {
    const quando = { hoje: painel.data, agora: painel.hora };
    aplicar(id, (a) => rep
      ? regras.desmarcarReposicaoComAviso(a, x.chave, { aviso: quando, em })
      : regras.desmarcar(a, x.chave, { aviso: quando, em }), k);
    return;
  }
  if (acao === 'noshow') {
    aplicar(id, (a) => rep ? regras.noShowReposicao(a, x.chave, { em }) : regras.marcarNoShow(a, x.chave, { em }), k); return;
  }
  if (acao === 'credito') {
    aplicar(id, (a) => rep ? regras.concederCreditoReposicao(a, x.chave, { hoje: hoje(), em }) : regras.concederCredito(a, x.chave, { hoje: hoje(), em }), k); return;
  }
  if (acao === 'desfazer') {
    if (!rep) { aplicar(id, (a) => desfazer(a, x.chave), k); return; }
    // Reposição: com presença, tira a presença; com falta lançada, reabre.
    aplicar(id, (a) => (x.status === 'presente' ? desfazer(a, dia, { ehReposicao: true, origem: x.chave }) : regras.reabrirReposicao(a, x.chave)), k);
  }
}

/** Grava a lista de experimentais do dia, já podada. @param {regras.Experimental[]} lista */
function gravarExperimentais(lista) {
  db.salvarExperimentais(dia, lista, (m) => regras.podarExperimentais(m, hoje()));
}

/** Lê o que está digitado no painel antes de um redesenho apagá-lo. */
function lerPainel() {
  if (!painel) return;
  const corpo = $('#tur-corpo');
  const d = /** @type {HTMLInputElement|null} */ ($('[data-aviso-data]', corpo)), h = /** @type {HTMLInputElement|null} */ ($('[data-aviso-hora]', corpo));
  if (d) painel.data = d.value;
  if (h) painel.hora = h.value;
}

/** Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app. */
export function iniciarTelaTurmas() {
  on(EVENTOS.ABRIR_TELA, (t) => {
    if (t !== 'turmas') return;
    dia = hoje(); horaSel = null; horasAbertas = []; painel = null; aviso = null;
    render();
  });
  // Um aviso "Não irei ao treino" aplicado pelo boot (ausencias-merge.js) ou a
  // nuvem trazendo fichas novas: a turma aberta se redesenha na hora.
  on(EVENTOS.ALUNOS_MUDARAM, () => { if (telaAtual() === 'turmas') render(); });
  const trocarDia = (/** @type {number} */ n) => { dia = addDias(dia, n); horaSel = null; horasAbertas = []; painel = null; aviso = null; render(); };
  $('#tur-prev')?.addEventListener('click', () => trocarDia(-1));
  $('#tur-next')?.addEventListener('click', () => trocarDia(1));

  const corpo = $('#tur-corpo');
  corpo?.addEventListener('click', (/** @type {any} */ e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    lerPainel();
    aviso = null;

    if (btn.classList.contains('tur-chip')) { horaSel = btn.dataset.hora; painel = null; render(); return; }
    if (btn.classList.contains('tur-abrir-hora')) {
      const inp = /** @type {HTMLInputElement|null} */ ($('[data-nova-hora]', corpo));
      const h = inp && inp.value;
      if (h) { if (!horasAbertas.includes(h)) horasAbertas.push(h); horaSel = h; painel = null; }
      render(); return;
    }

    const acao = btn.dataset.acao;
    if (!acao) return;
    if (acao === 'fechar') { painel = null; render(); return; }

    if (acao === 'add-rep') {
      const sel = /** @type {HTMLSelectElement|null} */ ($('[data-rep-sel]', corpo));
      const valor = sel ? sel.value : '';
      if (!valor) { aviso = { chave: 'adicionar', texto: 'Escolha o aluno e o crédito' }; render(); return; }
      const [id, origem] = valor.split('|');
      const turma = turmasDeHoje().find((t) => t.hora === horaSel);
      aplicar(id, (a) => regras.agendarReposicaoNaTurma(a, origem, { data: dia, hora: horaSel || '' }, { relogio: relogio(), vagas: turma ? turma.vagas : 0 }), 'adicionar');
      return;
    }
    if (acao === 'add-exp') {
      const nome = /** @type {HTMLInputElement|null} */ ($('[data-exp-nome]', corpo));
      const tel = /** @type {HTMLInputElement|null} */ ($('[data-exp-tel]', corpo));
      const turma = turmasDeHoje().find((t) => t.hora === horaSel);
      const r = regras.adicionarExperimental(db.experimentaisDoDia(dia), { nome: nome ? nome.value : '', telefone: tel ? tel.value : '', hora: horaSel || '' }, {
        id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, em: Date.now(), vagas: turma ? turma.vagas : 0,
      });
      if ('recusa' in r) { aviso = { chave: 'adicionar', texto: r.recusa }; render(); return; }
      gravarExperimentais(r.lista);
      render(); return;
    }
    if (acao.startsWith('exp-')) {
      const id = btn.dataset.exp;
      const lista = db.experimentaisDoDia(dia);
      const novo = acao === 'exp-remover' ? regras.removerExperimental(lista, id)
        : regras.statusExperimental(lista, id, /** @type {any} */ (acao.slice(4)));
      gravarExperimentais(novo);
      render(); return;
    }
    if (btn.dataset.k) agirNaLinha(acao, btn.dataset.k);
  });

  // A prévia do prazo acompanha a hora digitada, sem redesenhar (e sem tirar o foco).
  corpo?.addEventListener('input', (/** @type {any} */ e) => {
    if (!painel || !e.target.matches('[data-aviso-data],[data-aviso-hora]')) return;
    lerPainel();
    const achado = linhaPorChave(painel.chave);
    const alvo = $('[data-previa]', corpo);
    if (!achado || !alvo) return;
    const p = previa(achado.x, { hoje: painel.data, agora: painel.hora });
    alvo.textContent = p.texto;
    alvo.className = `tur-previa ${p.cls}`;
  });

  // As vagas de um horário: grava ao sair do campo (o "change").
  corpo?.addEventListener('change', (/** @type {any} */ e) => {
    const inp = e.target.closest('[data-vagas]');
    if (!inp) return;
    const n = Math.floor(Number(inp.value));
    if (!Number.isFinite(n) || n < 0) { render(); return; }
    db.salvarVagasDaTurma(inp.dataset.vagas, n);
    render();
  });
}
