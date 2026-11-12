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
import * as db from './db.js?v=40';
import * as regras from './presenca-regras.js?v=40';
import { checkin, desfazer, desfazerPedeMotivo, comMotivo } from './checkin-regras.js?v=40';
import { pedirMotivoDoDesfazerAula } from './ui-motivo.js?v=40';
import { esc, hoje, fmtData, fmtDataCurta, addDias, horaLegivel } from './util/formato.js?v=40';
import { $ } from './util/dom.js?v=40';
import { on, EVENTOS } from './estado.js?v=40';
import { reg } from './registro.js?v=40';
import { telaAtual } from './navegacao.js?v=40';
import { foraDoTreino } from '../../compartilhado/regras/planos.js';
import { abrirCadastroDaLista } from './ui-modal-aluno.js?v=40';
import {
  ehIlimitado, gravarMarcacao, desmarcarIlimitadoComAviso, noShowIlimitado, reabrirIlimitado, tirarMarcacao, previaDesmarcacaoIlimitado,
} from './ilimitado-regras.js?v=40';
import { chaveIlimitado } from './checkin-regras.js?v=40';
import { pedirMotivo, confirmar } from '../../compartilhado/ui/dialogo.js?v=40';
import {
  MEIOS_DAYPASS, dadosDoDayPass, dayPassDaFicha, cpfValido, digitosDoCpf, codigoDoCpf, experimentalJaFeita, comCpf,
  dadosDaVendaAvulsa, comVendaAvulsa, semVendaAvulsa,
} from './avulsos-regras.js?v=40';
import { brl } from './financeiro-aluno.js?v=40';

const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** 'seg'…'dom' de uma data, e o plural da caixinha "Horário fixo das quartas". */
const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DIA_PLURAL = /** @type {Record<string, string>} */ ({
  seg: 'das segundas', ter: 'das terças', qua: 'das quartas', qui: 'das quintas', sex: 'das sextas', sab: 'dos sábados', dom: 'dos domingos',
});
const chaveDoDiaNaTela = () => CHAVE_DIA[new Date(dia + 'T00:00:00').getDay()];

/** O dia na tela. */
let dia = hoje();
/** O horário escolhido ('' = a turma sem horário; null = escolher sozinho). */
let horaSel = /** @type {string | null} */ (null);
/** Horários abertos à mão neste dia (para pôr experimental ou reposição numa turma vazia). */
/** O bloco da grade fica aberto depois de pôr ou tirar um horário. */
let gradeAberta = false;
let horasAbertas = /** @type {string[]} */ ([]);
/** O dia e o horário que o próximo 'abrir-tela' deve mostrar (o atalho do Calendário). */
let pedido = /** @type {{ dia: string, hora: string } | null} */ (null);

/** O próximo 'abrir-tela turmas' abre neste dia e horário — uma vez. @param {string} d @param {string} hora */
export function pedirTurma(d, hora) { pedido = { dia: d, hora }; }
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
  const alunos = db.listar().filter((a) => !foraDoTreino(a)); // inativo e pausado fora das turmas
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
    <p class="tur-regras">Desmarcar com <b>2h ou mais</b> de antecedência libera a vaga e gera <b>+1 crédito de reposição</b> (vale até o fim do mês, no mínimo 7 dias).
      Menos de 2h, ou não vir: <b>falta, sem crédito</b>. Reposição: até <b>1h antes</b> da aula, se houver vaga.</p>
    ${blocoDaGrade()}`;
}

/**
 * A grade fixa do dia da semana na tela: os horários em que o aluno pode marcar
 * reposição pelo app (aparecem para ele mesmo vazios). Tirar ou pôr um horário
 * vale para todas as semanas desse dia.
 */
function blocoDaGrade() {
  const diaChave = chaveDoDiaNaTela();
  const horas = regras.horasDaGrade(db.configTurmas(), diaChave);
  const chips = horas.map((h) =>
    `<span class="tur-grade-h">${esc(horaLegivel(h))}<button class="tur-grade-tirar" type="button" data-grade-tirar="${esc(h)}" aria-label="Tirar ${esc(horaLegivel(h))} da grade ${DIA_PLURAL[diaChave]}">×</button></span>`).join('');
  return `<details class="tur-grade"${gradeAberta ? ' open' : ''}>
      <summary>Grade ${DIA_PLURAL[diaChave]} · ${horas.length ? `${horas.length} horário${horas.length > 1 ? 's' : ''}` : 'sem aula'}</summary>
      <p class="tur-regras">Os horários em que o aluno pode marcar reposição pelo app, com a lotação de cada turma (até ${regras.CAPACIDADE_PADRAO} por padrão).</p>
      <div class="tur-grade-lista">${chips || '<span class="tur-vazio-txt">Nenhum horário.</span>'}
        <span class="tur-abrir">
          <input class="chk-hora-inp" type="time" data-grade-nova aria-label="Novo horário da grade" />
          <button class="btn ghost btn-sm tur-grade-por" type="button">Pôr na grade</button>
        </span>
      </div>
    </details>`;
}

/** @param {ReturnType<typeof turmasDeHoje>[number]} t */
function corpoDaTurma(t) {
  const r = regras.resumoDaTurma(t);
  const cards =
    `<div class="fin-card"><span class="fin-card-l">Ocupação</span><span class="fin-card-v${t.lotada ? ' bad' : ''}">${t.ocupadas}/${t.capacidade}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Confirmados</span><span class="fin-card-v">${r.confirmados}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Presentes</span><span class="fin-card-v ok">${r.presentes}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Desmarcaram</span><span class="fin-card-v">${r.desmarcaram}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Faltas</span><span class="fin-card-v${r.faltas ? ' bad' : ''}">${r.faltas}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Sem chamada</span><span class="fin-card-v">${r.semChamada}</span></div>`;
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
  if (x.tipo === 'ilimitado') {
    // A aula marcada do Ilimitado (etapa 6.3): sem crédito, só a falta.
    const m = (x.aluno.marcacoes || {})[x.chave] || {};
    partes.push('aula marcada (Ilimitado)');
    if (x.status === 'presente' && x.horaCheckin) partes.push(`chegou ${x.horaCheckin}`);
    if (Number.isFinite(m.antecedenciaMin)) partes.push(`avisou ${regras.textoAntecedencia(m.antecedenciaMin)}`);
    if (m.noShow) partes.push('no-show lançado');
    if (x.status === 'sem-chamada') partes.push('chamada não fechada');
    return partes.join(' · ');
  }
  if (x.tipo === 'reposicao') partes.push(`repõe a aula de ${fmtDataCurta(x.chave)}`);
  else if (x.aluno.remarcacoes && x.aluno.remarcacoes[x.chave] && x.chave !== dia) partes.push(`aula de ${fmtDataCurta(x.chave)} remarcada para cá`);
  else partes.push('grade fixa');
  if (x.status === 'presente' && x.horaCheckin) partes.push(`chegou ${x.horaCheckin}`);
  if (x.tipo === 'titular') {
    const ant = (c && c.tipo === 'desmarcacao' ? c : x.registro || {}).antecedenciaMin;
    if (Number.isFinite(ant)) partes.push(`avisou ${regras.textoAntecedencia(ant)}`);
    if (x.registro && x.registro.tipo === 'no-show') partes.push('no-show lançado');
    if (x.status === 'sem-chamada') partes.push('chamada não fechada');
    if (c) {
      if (c.tipo === 'excecao') partes.push('crédito concedido (exceção)');
      if (c.reposicao && c.reposicao.data) partes.push(`reposição em ${fmtDataCurta(c.reposicao.data)}${c.reposicao.hora ? ' ' + horaLegivel(c.reposicao.hora) : ''}`);
      else if (c.expira) partes.push(c.expira < hoje() ? `crédito venceu em ${fmtDataCurta(c.expira)}` : `crédito até ${fmtDataCurta(c.expira)}`);
      else partes.push('crédito a agendar');
    } else if (x.status === 'desmarcou-fora' || x.status === 'falta' || x.status === 'sem-chamada') partes.push('sem crédito');
  } else {
    const rep = c && c.reposicao;
    if (rep && Number.isFinite(rep.antecedenciaMin)) partes.push(`avisou ${regras.textoAntecedencia(rep.antecedenciaMin)}`);
    if (rep && rep.noShow) partes.push('no-show lançado');
    if (x.status === 'sem-chamada') partes.push('chamada não fechada');
    if (x.status === 'desmarcou-fora' || x.status === 'falta' || x.status === 'sem-chamada') partes.push('crédito perdido');
  }
  return partes.join(' · ');
}

/** Os botões de cada situação. @param {regras.AulaNaTurma} x */
function acoesDaLinha(x) {
  const alvo = `data-k="${esc(chaveDaLinha(x))}"`;
  const b = (/** @type {string} */ acao, /** @type {string} */ txt, ghost = true) =>
    `<button class="btn${ghost ? ' ghost' : ''} btn-sm" data-acao="${acao}" ${alvo} type="button">${txt}</button>`;
  if (x.tipo === 'ilimitado') {
    // Etapa 6.3: o Ilimitado não tem crédito — a falta se reabre, a marcação errada se tira.
    if (x.status === 'confirmado') return b('presente', '✓ Presente', false) + b('desmarcar', 'Desmarcou') + b('noshow', 'No-show') + b('tirar', 'Tirar');
    if (x.status === 'presente') return b('desfazer', 'Desfazer');
    if (x.status === 'sem-chamada') return b('presente', '✓ Presente', false) + b('noshow', 'No-show') + b('tirar', 'Tirar');
    if (x.status === 'falta' || x.status === 'desmarcou-fora') return b('desfazer', 'Desfazer');
    return '';
  }
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
    case 'sem-chamada':
      if (x.tipo === 'titular' && x.credito) return x.credito.reposicao && x.credito.reposicao.data ? '' : b('desfazer', 'Desfazer');
      return (lancada ? '' : b('presente', '✓ Presente', false))
        + (x.status === 'sem-chamada' ? b('noshow', 'No-show') : '')
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
      <div class="fin-nome">${esc(x.aluno.nome)} <span class="tur-tag ${x.tipo}">${x.tipo === 'reposicao' ? 'Reposição' : x.tipo === 'ilimitado' ? 'Ilimitado' : 'Titular'}</span></div>
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
  // Etapa 6.2: o Day Pass (visitante pagante) e o "Virar aluno" de quem veio.
  const dayPass = e.tipo === 'daypass';
  const tag = dayPass
    ? `<span class="tur-tag daypass">Day Pass${e.pagamento ? ` · pago (${esc(MEIOS_DAYPASS[/** @type {'pix-chave'} */ (e.pagamento.meio)] || e.pagamento.meio)})` : ''}</span>`
    : `<span class="tur-tag experimental">Experimental${e.cpf ? ' · CPF conferido' : ''}</span>`;
  const virar = e.alunoId ? '<span class="tur-virou">virou aluno</span>' : b('exp-aluno', 'Virar aluno');
  return `<div class="fin-row tur-row st-${CLASSE_EXP[e.status]}">
    <div class="fin-info">
      <div class="fin-nome">${esc(e.nome)} ${tag}</div>
      <div class="fin-sub">${esc(e.telefone ? 'WhatsApp ' + e.telefone : dayPass ? 'Day Pass' : 'aula experimental')}</div>
    </div>
    <span class="tur-status st-${CLASSE_EXP[e.status]}">${STATUS_EXP[e.status]}</span>
    <div class="tur-acoes">${acoes}${virar}${b('exp-remover', 'Remover')}</div>
  </div>`;
}

/** O que a desmarcação daria, com o aviso digitado. @param {regras.AulaNaTurma} x @param {import('./checkin-regras.js').Relogio} quando */
function previa(x, quando) {
  let ant = null;
  if (x.tipo === 'titular') { const p = regras.previaDesmarcacao(x.aluno, x.chave, quando); ant = p && p.antecedenciaMin; }
  else if (x.tipo === 'ilimitado') { const p = previaDesmarcacaoIlimitado(x.aluno, x.chave, quando); ant = p && p.antecedenciaMin; }
  else { const rep = x.credito && x.credito.reposicao; ant = rep ? regras.antecedenciaMin(quando, rep.data, rep.hora) : null; }
  if (ant == null) return { cls: 'bad', texto: 'Aula sem horário: não dá para medir o prazo.' };
  if (ant >= regras.PRAZO_DESMARCAR_MIN) {
    return { cls: 'ok', texto: x.tipo === 'titular'
      ? `Avisou ${regras.textoAntecedencia(ant)}: no prazo — libera a vaga e gera +1 crédito (vale até o fim do mês, no mínimo 7 dias).`
      : x.tipo === 'ilimitado'
        ? `Avisou ${regras.textoAntecedencia(ant)}: no prazo — a aula sai e a vaga fica livre, sem falta.`
        : `Avisou ${regras.textoAntecedencia(ant)}: no prazo — o crédito volta para ser usado em outra data.` };
  }
  return { cls: 'bad', texto: x.tipo === 'ilimitado'
    ? `Avisou ${regras.textoAntecedencia(ant)}: fora do prazo de 2h — falta.`
    : `Avisou ${regras.textoAntecedencia(ant)}: fora do prazo de 2h — falta, sem crédito.` };
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
    .filter((a) => !foraDoTreino(a))
    .flatMap((a) => regras.creditosDisponiveis(a, h).map((c) => ({ a, c })))
    .sort((x, y) => String(x.a.nome).localeCompare(String(y.a.nome), 'pt-BR'))
    .map(({ a, c }) => {
      const tipo = c.tipo === 'desmarcacao' ? 'desmarcou no prazo' : c.tipo === 'excecao' ? 'exceção' : c.tipo === 'fechado' ? 'box fechado' : 'atestado';
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
    ${(() => {
      // Etapa 6.3: o coach marca a aula de um aluno do Ilimitado (a mesma trava: 1 por dia, 6 na semana, vaga).
      const ilims = db.listar().filter((a) => ehIlimitado(a) && !foraDoTreino(a))
        .sort((x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
      if (!ilims.length) return '';
      return `<div class="tur-add-linha">
      <select class="tur-sel" data-ilim-sel aria-label="Aluno do Ilimitado"><option value="">Ilimitado: escolha o aluno…</option>${ilims.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}</select>
      <button class="btn btn-sm" data-acao="add-ilim" type="button">Marcar Ilimitado</button>
    </div>`;
    })()}
    <div class="tur-add-linha">
      <input class="tur-inp" type="text" data-exp-nome placeholder="Nome (aula experimental)" maxlength="60" />
      <input class="tur-inp" type="tel" data-exp-tel placeholder="WhatsApp (opcional)" maxlength="20" />
      <input class="tur-inp" type="text" inputmode="numeric" data-exp-cpf placeholder="CPF (1 aula por CPF)" maxlength="14" autocomplete="off" />
      <button class="btn btn-sm" data-acao="add-exp" type="button">Adicionar experimental</button>
    </div>
    <div class="tur-add-linha">
      <input class="tur-inp" type="text" data-dp-nome placeholder="Nome (Day Pass, R$ 50)" maxlength="60" />
      <input class="tur-inp" type="tel" data-dp-tel placeholder="WhatsApp (opcional)" maxlength="20" />
      <select class="tur-sel" data-dp-meio aria-label="Como pagou o Day Pass">${Object.entries(MEIOS_DAYPASS).map(([k, rot]) => `<option value="${k}">Pagou com ${rot}</option>`).join('')}</select>
      <button class="btn btn-sm" data-acao="add-daypass" type="button">Adicionar Day Pass</button>
    </div>
    ${htmlVendaAvulsa()}
  </div>`;
}

/**
 * A venda a um visitante sem ficha (etapa 6.4, decisão 12): produto do
 * catálogo, quantidade e meio, paga na hora. Fica nos avulsos do dia, junto com
 * o Day Pass, sem ocupar vaga. Embaixo, as vendas do dia, com o "×".
 */
function htmlVendaAvulsa() {
  const produtos = db.listarProdutos();
  const vendas = db.vendasAvulsas()[dia] || [];
  const lista = vendas.length ? `<ul class="tur-vendas">${vendas.map((v) => `<li>${esc(v.visitante)} · ${esc((Number(v.qtd) || 1) > 1 ? `${v.qtd} × ${v.nome}` : v.nome)} · ${esc(brl(v.valor))} (${esc(MEIOS_DAYPASS[/** @type {'pix-chave'} */ (v.meio)] || v.meio)})`
    + ` <button class="tur-x" data-acao="venda-remover" data-venda="${esc(v.id)}" type="button" aria-label="Tirar a venda de ${esc(v.visitante)}">×</button></li>`).join('')}</ul>` : '';
  if (!produtos.length) return lista;
  return `<div class="tur-add-linha">
      <input class="tur-inp" type="text" data-va-nome placeholder="Nome (visitante comprando)" maxlength="60" />
      <select class="tur-sel" data-va-prod aria-label="Produto vendido">${produtos.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)} · ${esc(brl(p.preco))}</option>`).join('')}</select>
      <input class="tur-inp tur-qtd" type="number" data-va-qtd min="1" max="99" step="1" value="1" aria-label="Quantidade" />
      <select class="tur-sel" data-va-meio aria-label="Como pagou a compra">${Object.entries(MEIOS_DAYPASS).map(([k, rot]) => `<option value="${k}">Pagou com ${rot}</option>`).join('')}</select>
      <button class="btn btn-sm" data-acao="add-venda" type="button">Registrar venda</button>
    </div>${lista}`;
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
  if (x.tipo === 'ilimitado') { void agirNaAulaIlimitado(acao, x, id, k, em); return; }
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
  if (acao === 'desfazer') void desfazerNaLinha(x, id, rep, k);
}

/**
 * As ações na aula marcada do Ilimitado (etapa 6.3). A presença é do dia dela;
 * tirar a falta pede o motivo (etapa 5), como na reposição.
 * @param {string} acao @param {any} x @param {string} id @param {string} k @param {number} em
 */
async function agirNaAulaIlimitado(acao, x, id, k, em) {
  if (acao === 'presente') { aplicar(id, (a) => checkin(a, x.chave, { ehReposicao: true, ...relogio() }), k); return; }
  if (acao === 'desmarcar') {
    const r = relogio();
    painel = painel && painel.chave === k ? null : { chave: k, data: r.hoje, hora: r.agora };
    render(); return;
  }
  if (acao === 'confirmar-desmarcar' && painel) {
    const quando = { hoje: painel.data, agora: painel.hora };
    aplicar(id, (a) => desmarcarIlimitadoComAviso(a, x.chave, { aviso: quando, em }), k); return;
  }
  if (acao === 'noshow') { aplicar(id, (a) => noShowIlimitado(a, x.chave, { em }), k); return; }
  if (acao === 'tirar') { aplicar(id, (a) => tirarMarcacao(a, x.chave), k); return; }
  if (acao === 'desfazer') {
    if (x.status === 'presente') { aplicar(id, (a) => desfazer(a, x.chave, { ehReposicao: true, origem: chaveIlimitado(x.chave) }), k); return; }
    const motivo = await pedirMotivoDoDesfazerAula(x.chave);
    if (!motivo) return;
    aplicar(id, (a) => comMotivo(reabrirIlimitado(a, x.chave), motivo), k);
  }
}

/**
 * O DESFAZER do painel. Apagar uma falta, um crédito ou um atestado pede o
 * motivo (etapa 5), que vai para a linha dos Registros; tirar só uma presença
 * continua num clique. Na reposição: com presença, tira a presença; com falta
 * lançada (no-show), reabre — e reabrir apaga a falta, então pede o motivo.
 * @param {any} x a linha @param {string} id @param {boolean} rep @param {string} k
 */
async function desfazerNaLinha(x, id, rep, k) {
  const a0 = db.obter(id); if (!a0) return;
  if (!rep) {
    const pede = desfazerPedeMotivo(a0, x.chave);
    const motivo = pede ? await pedirMotivoDoDesfazerAula(x.chave) : '';
    if (pede && !motivo) return;
    aplicar(id, (a) => comMotivo(desfazer(a, x.chave), motivo || ''), k);
    return;
  }
  if (x.status === 'presente') { aplicar(id, (a) => desfazer(a, dia, { ehReposicao: true, origem: x.chave }), k); return; }
  const motivo = await pedirMotivoDoDesfazerAula(dia);
  if (!motivo) return;
  aplicar(id, (a) => comMotivo(regras.reabrirReposicao(a, x.chave), motivo), k);
}

/** Grava a lista de experimentais do dia, já podada. @param {regras.Experimental[]} lista */
function gravarExperimentais(lista) {
  db.salvarExperimentais(dia, lista, (m) => regras.podarExperimentais(m, hoje()));
}

/**
 * Adiciona a aula experimental, conferindo o CPF (etapa 6.2): 1 por CPF. CPF já
 * usado só passa com o motivo. O CPF não é guardado, só o código embaralhado.
 * @param {any} corpo
 */
async function adicionarExperimentalComCpf(corpo) {
  const nome = /** @type {HTMLInputElement|null} */ ($('[data-exp-nome]', corpo));
  const tel = /** @type {HTMLInputElement|null} */ ($('[data-exp-tel]', corpo));
  const cpfInp = /** @type {HTMLInputElement|null} */ ($('[data-exp-cpf]', corpo));
  const cpf = cpfInp ? cpfInp.value : '';
  const valores = { nome: nome ? nome.value : '', telefone: tel ? tel.value : '' };
  let codigo = '';
  if (digitosDoCpf(cpf)) {
    if (!cpfValido(cpf)) { aviso = { chave: 'adicionar', texto: 'CPF inválido: confira os números' }; render(); return; }
    codigo = await codigoDoCpf(cpf);
    const ja = experimentalJaFeita(db.cpfsExperimentais(), codigo);
    if (ja) {
      const motivo = await pedirMotivo({
        titulo: 'Esse CPF já fez aula experimental',
        texto: `A aula experimental é 1 por CPF, e esse já fez em <b>${fmtDataCurta(ja)}</b>. Para marcar de novo, escreva o motivo.`,
        ok: 'Marcar mesmo assim', placeholder: 'Ex.: a primeira foi cancelada pela chuva',
      });
      if (!motivo) { aviso = { chave: 'adicionar', texto: 'Aula experimental não marcada: esse CPF já fez uma.' }; render(); return; }
    }
  }
  const turma = turmasDeHoje().find((t) => t.hora === horaSel);
  const r = regras.adicionarExperimental(db.experimentaisDoDia(dia), { ...valores, hora: horaSel || '', cpf: codigo }, {
    id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, em: Date.now(), vagas: turma ? turma.vagas : 0,
  });
  if ('recusa' in r) { aviso = { chave: 'adicionar', texto: r.recusa }; render(); return; }
  gravarExperimentais(r.lista);
  if (codigo) db.salvarCpfsExperimentais(comCpf(db.cpfsExperimentais(), codigo, dia));
  render();
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
    dia = pedido ? pedido.dia : hoje();
    horaSel = pedido ? pedido.hora : null;
    // A hora pedida entra como horário aberto: a turma aparece mesmo vazia.
    horasAbertas = pedido && pedido.hora ? [pedido.hora] : [];
    painel = null; aviso = null; pedido = null;
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
    if (btn.dataset.gradeTirar) { db.salvarHoraNaGrade(chaveDoDiaNaTela(), btn.dataset.gradeTirar, false); gradeAberta = true; render(); return; }
    if (btn.classList.contains('tur-grade-por')) {
      const inp = /** @type {HTMLInputElement|null} */ ($('[data-grade-nova]', corpo));
      if (inp && /^\d{2}:\d{2}$/.test(inp.value)) db.salvarHoraNaGrade(chaveDoDiaNaTela(), inp.value, true);
      gradeAberta = true; render(); return;
    }
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
    if (acao === 'add-exp') { void adicionarExperimentalComCpf(corpo); return; }
    if (acao === 'add-ilim') {
      const sel = /** @type {HTMLSelectElement|null} */ ($('[data-ilim-sel]', corpo));
      const id = sel ? sel.value : '';
      if (!id) { aviso = { chave: 'adicionar', texto: 'Escolha o aluno do Ilimitado' }; render(); return; }
      const turma = turmasDeHoje().find((t) => t.hora === horaSel);
      if (!turma || turma.vagas <= 0) { aviso = { chave: 'adicionar', texto: 'Turma lotada' }; render(); return; }
      const a = db.obter(id); if (!a) return;
      const r = gravarMarcacao(a, dia, horaSel || '', Date.now());
      if ('recusa' in r) { aviso = { chave: 'adicionar', texto: r.recusa.texto }; render(); return; }
      db.atualizar(id, r.patch);
      reg(r.log.tipo, a, r.log.resumo, r.log.extra);
      render(); return;
    }
    if (acao === 'add-daypass') {
      const nome = /** @type {HTMLInputElement|null} */ ($('[data-dp-nome]', corpo));
      const tel = /** @type {HTMLInputElement|null} */ ($('[data-dp-tel]', corpo));
      const meio = /** @type {HTMLSelectElement|null} */ ($('[data-dp-meio]', corpo));
      const d = dadosDoDayPass({ nome: nome ? nome.value : '', telefone: tel ? tel.value : '', meio: meio ? meio.value : '', em: Date.now() });
      if ('recusa' in d) { aviso = { chave: 'adicionar', texto: d.recusa }; render(); return; }
      const turma = turmasDeHoje().find((t) => t.hora === horaSel);
      const r = regras.adicionarExperimental(db.experimentaisDoDia(dia), { ...d.dados, hora: horaSel || '' }, {
        id: `dp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, em: Date.now(), vagas: turma ? turma.vagas : 0,
      });
      if ('recusa' in r) { aviso = { chave: 'adicionar', texto: r.recusa }; render(); return; }
      gravarExperimentais(r.lista);
      render(); return;
    }
    if (acao === 'add-venda') {
      // Etapa 6.4: a venda a um visitante, paga na hora (avulsos do dia).
      const nome = /** @type {HTMLInputElement|null} */ ($('[data-va-nome]', corpo));
      const prod = /** @type {HTMLSelectElement|null} */ ($('[data-va-prod]', corpo));
      const qtd = /** @type {HTMLInputElement|null} */ ($('[data-va-qtd]', corpo));
      const meio = /** @type {HTMLSelectElement|null} */ ($('[data-va-meio]', corpo));
      const p = db.listarProdutos().find((x) => x.id === (prod ? prod.value : ''));
      const d = dadosDaVendaAvulsa({
        visitante: nome ? nome.value : '', item: p ? { nome: p.nome, preco: p.preco, produtoId: p.id, qtd: qtd ? qtd.value : 1 } : { nome: '', preco: 0 },
        meio: meio ? meio.value : '', em: Date.now(), id: `va-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      });
      if ('recusa' in d) { aviso = { chave: 'adicionar', texto: d.recusa }; render(); return; }
      db.salvarVendasAvulsas(comVendaAvulsa(db.vendasAvulsas(), dia, d.dados, hoje()));
      render(); return;
    }
    if (acao === 'venda-remover') {
      const id = btn.dataset.venda || '';
      if (!semVendaAvulsa(db.vendasAvulsas(), dia, id)) return;
      const diaDaVenda = dia;
      void confirmar({ titulo: 'Tirar a venda?', texto: 'A venda sai dos avulsos do dia (e do Financeiro do mês).', ok: 'Tirar', perigo: true }).then((sim) => {
        // Relê na hora de gravar: outra aba pode ter mudado a lista enquanto a janela estava aberta.
        const novo = sim ? semVendaAvulsa(db.vendasAvulsas(), diaDaVenda, id) : null;
        if (novo) { db.salvarVendasAvulsas(novo); render(); }
      });
      return;
    }
    if (acao === 'exp-aluno') {
      const id = btn.dataset.exp;
      const x = db.experimentaisDoDia(dia).find((e) => e.id === id);
      if (!x) return;
      const diaDaLista = dia;
      abrirCadastroDaLista({
        nome: x.nome, telefone: x.telefone || '',
        dayPass: x.tipo === 'daypass' ? dayPassDaFicha(x, diaDaLista) : null,
        // Depois de criar: a linha mostra "virou aluno".
        aoCriar: (novo) => {
          const lista = db.experimentaisDoDia(diaDaLista).map((e) => (e.id === id ? { ...e, alunoId: String(novo.id) } : e));
          db.salvarExperimentais(diaDaLista, lista, (m) => regras.podarExperimentais(m, hoje()));
        },
      });
      return;
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

  // Abrir/fechar a grade à mão também sobrevive ao próximo render (o toggle não borbulha: captura).
  corpo?.addEventListener('toggle', (/** @type {any} */ e) => { if (e.target.classList?.contains('tur-grade')) gradeAberta = e.target.open; }, true);

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
