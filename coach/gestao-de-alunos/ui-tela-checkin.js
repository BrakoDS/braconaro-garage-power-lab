// @ts-check
/**
 * Tela Check-in — a frequência do dia e a grade da semana de cada aluno.
 *
 * Saiu do `app.js` no fatiamento. As REGRAS (o que check-in, troca de dia,
 * atestado, desfazer e reposição fazem com a ficha) moram em
 * `checkin-regras.js`, puras e testadas; aqui ficam o desenho, os botões e a
 * aplicação: a regra devolve o que mudar e a linha do log, e a tela grava
 * (`db.atualizar` — que já publica o Portal e avisa a lista) e registra.
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'checkin'), que sempre volta
 * para hoje, e a cada ação ou troca de dia.
 */
import * as db from './db.js?v=14';
import * as regras from './checkin-regras.js?v=14';
import { DIA_EXT } from './checkin-regras.js?v=14';
import { semanaDoAluno, datasDaSemana, chaveDoDia, reposicoesPendentes, ORDEM_DIAS } from '../../compartilhado/regras/semana.js';
import { esc, hoje, fmtData, fmtDataCurta, addDias, horaLegivel } from './util/formato.js?v=14';
import { $ } from './util/dom.js?v=14';
import { on, EVENTOS } from './estado.js?v=14';
import { reg } from './registro.js?v=14';

const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIA_MIN = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };

/** O dia na tela. */
let chkData = hoje();
/**
 * O painel aberto no momento — um só por vez.
 * `{ tipo:'troca'|'reposicao', chave, data, hora }`, onde `chave` é
 * `${idAluno}|${dataDaAula}` e data/hora são a escolha ainda não confirmada.
 */
let chkPainel = /** @type {any} */ (null);
/** Recado preso a uma aula (`${id}|${iso}`), mostrado no próprio quadrado. */
let chkAviso = /** @type {{ chave: string, texto: string } | null} */ (null);

/** O relógio que as regras recebem: hoje e a hora de agora. */
const relogio = () => ({ hoje: hoje(), agora: new Date().toTimeString().slice(0, 5) });

/** "Qua · 07/10/2026" @param {string} iso */
function labelDia(iso) { const d = new Date(iso + 'T00:00:00'); return `${DIAS_SEM[d.getDay()]} · ${fmtData(iso)}`; }

function renderCheckin() {
  $('#chk-data-lbl').textContent = labelDia(chkData);
  const alunos = db.listar().filter((a) => (a.status || 'ativo') !== 'inativo');
  const presentes = alunos.filter((a) => (a.presencas || []).includes(chkData)).length;
  const sumidos = regras.quemSumiu(alunos, hoje());
  $('#chk-resumo').innerHTML =
    `<div class="fin-card"><span class="fin-card-l">Presentes no dia</span><span class="fin-card-v ok">${presentes}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Alunos ativos</span><span class="fin-card-v">${alunos.length}</span></div>` +
    `<div class="fin-card"><span class="fin-card-l">Sumidos (${regras.SUMIDO_DIAS}+ dias)</span><span class="fin-card-v${sumidos.length ? ' bad' : ''}">${sumidos.length}</span></div>`;

  $('#chk-list').innerHTML = alunos.length
    ? alunos.map((a) => ((a.diasTreino || []).length ? linhaGrade(a) : linhaSimples(a))).join('')
    : `<div class="empty"><b>Nenhum aluno ativo</b>Cadastre alunos para registrar presença.</div>`;

  $('#chk-sumidos').innerHTML = sumidos.length
    ? `<h4 class="chk-titulo">Quem sumiu (${regras.SUMIDO_DIAS}+ dias sem vir)</h4>` +
      sumidos.map((s) => `<div class="chk-sumido"><span class="li-nome">${esc(s.nome)}</span><span class="aval-tag atrasada">${s.dias == null ? 'nunca veio' : 'há ' + s.dias + 'd'}</span></div>`).join('')
    : '';
}

/* ============================================================
   A grade da semana — uma aula por quadrado (as três saídas de cada aula
   estão descritas em checkin-regras.js)
   ============================================================ */

const ultimaPresenca = regras.ultimaPresenca;

/**
 * Linha do aluno SEM dias de treino cadastrados: continua o botão simples de
 * sempre. Sem grade não há aula para resolver — e obrigar o coach a preencher o
 * perfil antes de conseguir marcar uma presença seria trocar uma tela que
 * funciona por uma porta trancada.
 */
function linhaSimples(a) {
  const pres = (a.presencas || []).includes(chkData);
  const u = ultimaPresenca(a);
  const sub = u ? `última presença: ${fmtData(u)}` : 'sem check-in ainda';
  return `<div class="fin-row${pres ? ' chk-pres' : ''}">
    <div class="fin-info"><div class="fin-nome">${esc(a.nome)}</div><div class="fin-sub">${esc(sub)}</div></div>
    <button class="btn ${pres ? '' : 'ghost '}btn-sm chk-toggle" data-id="${esc(a.id)}" type="button">${pres ? '✓ Presente' : 'Marcar presente'}</button>
  </div>`;
}

/** Linha do aluno COM grade: uma aula por quadrado, cada uma resolvível. */
function linhaGrade(a) {
  const semana = datasDaSemana(new Date(chkData + 'T00:00:00'));
  const quadrados = semanaDoAluno({
    diasTreino: a.diasTreino, horarios: a.horarios || {},
    presencas: a.presencas || [], horas: a.presencaHoras || {},
    remarcacoes: a.remarcacoes || {}, atestados: a.atestados || {},
    hoje: new Date(chkData + 'T00:00:00'),
    // Feriado que o coach marcou como "não abriu": ninguém leva falta por um dia
    // de porta fechada. A mesma lista é publicada no Portal, para os dois lados
    // contarem igual — divergir aqui faria o aluno ver falta que o coach não vê.
    fechados: db.diasFechados(),
  });
  // O contador é sobre as aulas DA SEMANA. Reposição vem de outra semana e
  // treino extra é bônus: nenhum dos dois entra no "3 de 4", senão o número
  // passa do total e deixa de querer dizer alguma coisa.
  const fixos = quadrados.filter((q) => q.tipo === 'fixo');
  const feitos = fixos.filter((q) => q.estado === 'ok').length;
  const pendentes = reposicoesPendentes(a.atestados);

  const painelAberto = chkPainel && chkPainel.tipo === 'reposicao' && chkPainel.chave.split('|')[0] === a.id;
  const chip = pendentes.length
    ? ` · <button class="chk-chip" data-id="${esc(a.id)}" data-origem="${pendentes[0]}" type="button">${pendentes.length} reposição${pendentes.length > 1 ? 'ões' : ''} a agendar</button>`
    : '';

  return `<div class="fin-row chk-linha">
    <div class="fin-info"><div class="fin-nome">${esc(a.nome)}</div>
      <div class="fin-sub">${feitos} de ${fixos.length} treinos desta semana${chip}</div>
      ${painelAberto ? painelReposicao(a) : ''}</div>
    <div class="chk-grade">${quadrados.map((q) => quadrado(a, q, semana)).join('')}</div>
  </div>`;
}

/** A frase de rodapé do quadrado: o que aconteceu com aquela aula. */
function notaDaAula(q) {
  if (q.estado === 'ok') {
    if (q.veioEm) return `veio ${DIA_MIN[chaveDoDia(q.veioEm)]}${q.hora ? ' · ' + q.hora : ''}`;
    return q.hora ? `chegou ${q.hora}` : 'presente';
  }
  if (q.estado === 'atestado') return 'atestado · a repor';
  if (q.estado === 'fechado') return 'feriado · box fechado';
  if (q.estado === 'falta') return q.remarcado ? `não veio (era ${DIA_MIN[chaveDoDia(q.efetivo)]})` : 'não veio';
  if (q.remarcado) return `passou para ${DIA_MIN[chaveDoDia(q.efetivo)]}`;
  if (q.alterado) return 'horário alterado';
  return q.iso === chkData ? 'é hoje' : '';
}

/** Um quadrado: o estado da aula e o que dá para fazer com ela. */
function quadrado(a, q, semana) {
  const alvo = `data-id="${esc(a.id)}" data-dia="${q.iso}"`;
  const aberto = chkPainel && chkPainel.tipo === 'troca' && chkPainel.chave === `${a.id}|${q.iso}`;

  if (q.tipo === 'extra') {
    return `<div class="chk-cel ok">
      <span class="chk-cel-dia">Extra</span>
      <span class="chk-cel-h">${esc(DIA_EXT[q.chave] || fmtDataCurta(q.iso))}${q.hora ? ' · ' + q.hora : ''}</span>
      <span class="chk-cel-nota">treino a mais</span>
    </div>`;
  }

  // A reposição é a aula que nasceu de um atestado. Ela já foi agendada, então
  // não se "altera o dia" dela — ou o aluno veio, ou o coach desmarca e o
  // crédito volta para a fila, livre para cair em qualquer outra semana.
  if (q.tipo === 'reposicao') {
    const acoesRep = q.estado === 'ok'
      ? `<button class="btn btn-sm chk-desfazer" ${alvo} data-rep="1" data-origem="${q.origem}" type="button">Desfazer</button>`
      : `<button class="btn btn-sm chk-checkin" ${alvo} data-rep="1" type="button">Check-in</button>
         <button class="btn ghost btn-sm chk-desmarcar" data-id="${esc(a.id)}" data-origem="${q.origem}" type="button">Desmarcar</button>`;
    const notaRep = q.estado === 'ok' ? (q.hora ? `chegou ${q.hora}` : 'presente')
      : q.estado === 'falta' ? 'não veio' : `da aula de ${fmtDataCurta(q.origem)}`;
    return `<div class="chk-cel ${q.estado} reposicao">
      <span class="chk-cel-dia">Reposição</span>
      <span class="chk-cel-h">${esc(DIA_EXT[q.chave])}${q.horaPrevista ? ' · ' + horaLegivel(q.horaPrevista) : ''}</span>
      <span class="chk-cel-nota">${esc(notaRep)}</span>
      <div class="chk-cel-acoes">${acoesRep}</div>
    </div>`;
  }

  // Resolvida (veio ou atestado) → só desfazer. Pendente ou vermelha → as três
  // saídas. "Não veio" é estado calculado pelo prazo, não porta trancada: quem
  // marcou errado precisa poder corrigir no dia seguinte.
  const acoes = (q.estado === 'ok' || q.estado === 'atestado')
    ? `<button class="btn btn-sm chk-desfazer" ${alvo} type="button">Desfazer</button>`
    : `<button class="btn btn-sm chk-checkin" ${alvo} type="button">Check-in</button>
       <button class="btn ghost btn-sm chk-trocar" ${alvo} type="button">Alterar dia</button>
       <button class="btn ghost btn-sm chk-atestado" ${alvo} type="button">Atestado</button>`;

  const aviso = chkAviso && chkAviso.chave === `${a.id}|${q.iso}` ? chkAviso.texto : '';
  const nota = notaDaAula(q);

  return `<div class="chk-cel ${q.estado}${aberto ? ' aberto' : ''}">
    <span class="chk-cel-dia">${esc(DIA_EXT[q.chave])}</span>
    <span class="chk-cel-h">${esc(horaLegivel(q.horaPrevista) || fmtDataCurta(q.iso))}</span>
    ${nota ? `<span class="chk-cel-nota">${esc(nota)}</span>` : ''}
    ${aviso ? `<span class="chk-cel-aviso">${esc(aviso)}</span>` : ''}
    <div class="chk-cel-acoes">${acoes}</div>
    ${aberto ? painelTroca(a, q, semana) : ''}
  </div>`;
}

/**
 * O painel de "Alterar dia": os sete dias da semana e a hora.
 *
 * Escolher a ficha só marca; quem grava é o "Confirmar". Sem isso não daria para
 * trocar só o horário — clicar no dia já teria salvado com a hora antiga, que é
 * metade do que o coach queria mudar.
 */
function painelTroca(a, q, semana) {
  const fichas = ORDEM_DIAS.map((k) => {
    const iso = semana[k];
    const cls = [iso === chkPainel.data ? 'atual' : '', iso === q.iso && q.remarcado ? 'origem' : ''].filter(Boolean).join(' ');
    const dica = iso === q.iso ? ' title="Dia original desta aula"' : '';
    return `<button class="chk-ficha ${cls}"${dica} data-dia-sel="${iso}" type="button">${DIA_EXT[k].slice(0, 3)}</button>`;
  }).join('');
  return `<div class="chk-seletor">
    <span class="chk-seletor-cap">Esta aula passa para:</span>
    <div class="chk-fichas">${fichas}</div>
    <div class="chk-linha-hora">
      <input class="chk-hora-inp" type="time" value="${esc(chkPainel.hora)}" data-hora-sel />
      <button class="btn btn-sm chk-confirma-troca" data-id="${esc(a.id)}" data-dia="${q.iso}" type="button">Confirmar</button>
    </div>
  </div>`;
}

/** O painel de agendar reposição: data livre (qualquer semana) e hora. */
function painelReposicao(a) {
  const origem = chkPainel.chave.split('|')[1];
  const aviso = chkAviso && chkAviso.chave === `${a.id}|${origem}` ? chkAviso.texto : '';
  return `<div class="chk-seletor solto">
    <span class="chk-seletor-cap">Repor a aula de ${esc(fmtData(origem))} em:</span>
    ${aviso ? `<span class="chk-cel-aviso">${esc(aviso)}</span>` : ''}
    <div class="chk-linha-hora">
      <input class="chk-data-inp" type="date" value="${esc(chkPainel.data)}" data-data-sel />
      <input class="chk-hora-inp" type="time" value="${esc(chkPainel.hora)}" data-hora-sel />
      <button class="btn btn-sm chk-confirma-rep" data-id="${esc(a.id)}" data-origem="${esc(origem)}" type="button">Agendar</button>
    </div>
  </div>`;
}

/* ============================================================
   Aplicar uma regra
   ============================================================ */

/**
 * Roda a regra sobre a ficha do banco e aplica o resultado: grava e registra
 * (a gravação publica o Portal e avisa a lista), ou mostra a recusa no
 * quadrado com o painel ainda aberto — o coach precisa escolher outra data.
 * @param {string} id
 * @param {(a: any) => (import('./checkin-regras.js').Mudanca | import('./checkin-regras.js').Recusa | null)} regra
 * @param {{ fecharPainel?: boolean }} [o]
 */
function aplicar(id, regra, { fecharPainel = true } = {}) {
  const a = db.obter(id); if (!a) return;
  const r = regra(a);
  if (!r) return;
  if ('recusa' in r) { chkAviso = r.recusa; renderCheckin(); return; }
  db.atualizar(id, r.patch);
  reg(r.log.tipo, a, r.log.resumo, r.log.extra);
  if (fecharPainel) chkPainel = null;
  renderCheckin();
}

/** Lê o que está digitado no painel aberto antes de um redesenho apagá-lo. */
function lerPainel(raiz) {
  if (!chkPainel) return;
  const d = $('[data-data-sel]', raiz), h = $('[data-hora-sel]', raiz);
  if (d) chkPainel.data = d.value;
  if (h) chkPainel.hora = h.value;
}

/** Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app. */
export function iniciarTelaCheckin() {
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'checkin') { chkData = hoje(); chkPainel = null; chkAviso = null; renderCheckin(); } });
  $('#chk-prev')?.addEventListener('click', () => { chkData = addDias(chkData, -1); chkPainel = null; renderCheckin(); });
  $('#chk-next')?.addEventListener('click', () => { chkData = addDias(chkData, 1); chkPainel = null; renderCheckin(); });

  $('#chk-list')?.addEventListener('click', (/** @type {any} */ e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // Qualquer clique novo apaga o recado anterior: ele é sobre a ação que acabou
    // de ser recusada, não um estado da aula.
    chkAviso = null;
    const lista = $('#chk-list');

    // Ficha de dia dentro do painel: só marca a escolha; quem grava é o Confirmar.
    if (btn.classList.contains('chk-ficha')) {
      lerPainel(lista); chkPainel.data = btn.dataset.diaSel; renderCheckin(); return;
    }
    if (btn.classList.contains('chk-checkin')) {
      aplicar(btn.dataset.id, (a) => regras.checkin(a, btn.dataset.dia, { ehReposicao: !!btn.dataset.rep, ...relogio() })); return;
    }
    if (btn.classList.contains('chk-trocar')) {
      const chave = `${btn.dataset.id}|${btn.dataset.dia}`;
      if (chkPainel && chkPainel.chave === chave) chkPainel = null; // o mesmo botão fecha
      else {
        const a = db.obter(btn.dataset.id);
        const r = (a && a.remarcacoes || {})[btn.dataset.dia];
        const atual = typeof r === 'string' ? { data: r, hora: '' } : r;
        chkPainel = {
          tipo: 'troca', chave,
          data: (atual && atual.data) || btn.dataset.dia,
          hora: (atual && atual.hora) || (a && a.horarios || {})[chaveDoDia(btn.dataset.dia)] || '',
        };
      }
      renderCheckin(); return;
    }
    if (btn.classList.contains('chk-confirma-troca')) {
      lerPainel(lista);
      const { data, hora } = chkPainel;
      aplicar(btn.dataset.id, (a) => regras.trocarDia(a, btn.dataset.dia, data, hora)); return;
    }
    if (btn.classList.contains('chk-atestado')) {
      aplicar(btn.dataset.id, (a) => regras.atestado(a, btn.dataset.dia, { em: Date.now() })); return;
    }
    if (btn.classList.contains('chk-desfazer')) {
      aplicar(btn.dataset.id, (a) => regras.desfazer(a, btn.dataset.dia, { ehReposicao: !!btn.dataset.rep, origem: btn.dataset.origem })); return;
    }
    // Abre o painel de agendar reposição, já sugerindo o dia seguinte.
    if (btn.classList.contains('chk-chip')) {
      const chave = `${btn.dataset.id}|${btn.dataset.origem}`;
      if (chkPainel && chkPainel.chave === chave) chkPainel = null;
      else {
        const a = db.obter(btn.dataset.id);
        chkPainel = {
          tipo: 'reposicao', chave, data: addDias(hoje(), 1),
          hora: (a && a.horarios || {})[chaveDoDia(btn.dataset.origem)] || '',
        };
      }
      renderCheckin(); return;
    }
    if (btn.classList.contains('chk-confirma-rep')) {
      lerPainel(lista);
      const { data, hora } = chkPainel;
      aplicar(btn.dataset.id, (a) => regras.agendarReposicao(a, btn.dataset.origem, data, hora)); return;
    }
    if (btn.classList.contains('chk-desmarcar')) {
      aplicar(btn.dataset.id, (a) => regras.desmarcarReposicao(a, btn.dataset.origem)); return;
    }
    // A presença simples nunca fechou o painel aberto de outra linha.
    if (btn.classList.contains('chk-toggle')) aplicar(btn.dataset.id, (a) => regras.alternarPresenca(a, chkData, relogio()), { fecharPainel: false });
  });
}
