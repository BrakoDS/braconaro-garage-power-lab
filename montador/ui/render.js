// @ts-check
import { MODALIDADES } from '../config/modalidades.js';
import { PADRAO_LABEL, PADROES } from '../config/padroes.js';
import { EQUIP_POR_ID } from '../data/equipamentos.js';
import { alternativasViaveis, aplicarTroca } from '../core/gerador.js';
import { variantesNivel, NIVEIS, NIVEL_LABEL } from '../core/niveis.js';

const mmss = (s) => `${Math.round(s / 60)}min`;
const equipNomes = (ids) => ids.map((i) => (EQUIP_POR_ID[i]?.nome || i)).join(', ');
let _uid = 0;

/** Célula de um nível: séries + carga. @param {{series:number,carga:string}} v */
const celNivel = (v) => `<span class="nv-series">${v.series}×</span> <span class="nv-carga">${v.carga}</span>`;

/**
 * Uma linha (<tr>) da tabela de 3 níveis para um exercício já normalizado.
 * @param {number} i @param {{nome:string,padrao:string,equipamento:string[],reps:string,descansoSeg?:number,niveis:Record<string,{series:number,carga:string}>}} item
 * @param {string} acoesHTML  botão "trocar" (ou '') @param {string} altsHTML  container de alternativas (ou '')
 */
function linhaNiveis(i, item, acoesHTML, altsHTML) {
  const desc = item.descansoSeg != null ? ` · ${item.descansoSeg}s desc.` : '';
  return `<tr>
    <td>${i + 1}</td>
    <td>
      <div class="ex-row">
        <div>
          <b>${item.nome}</b><br>
          <small>${PADRAO_LABEL[item.padrao] || item.padrao} · ${equipNomes(item.equipamento || [])}</small><br>
          <small class="mut">${item.reps}${desc}</small>
        </div>
        ${acoesHTML}
      </div>
      ${altsHTML}
    </td>
    ${NIVEIS.map((n) => `<td class="nv nv-${n}">${celNivel(item.niveis[n])}</td>`).join('')}
  </tr>`;
}

/** Envolve as linhas numa tabela de 3 níveis (com scroll horizontal no mobile). */
function tabelaNiveis(linhasHTML) {
  return `<div class="tbl-scroll"><table class="t-niveis">
    <thead><tr><th>#</th><th>Exercício</th>${NIVEIS.map((n) => `<th class="nv nv-${n}">${NIVEL_LABEL[n]}</th>`).join('')}</tr></thead>
    <tbody>${linhasHTML}</tbody></table></div>`;
}

/**
 * Card do treino HYROX estruturado (formato da competição): 8 rodadas de
 * corrida + estação, com prescrição por nível e duração estimada.
 * @param {any} hx  estrutura de core/hyrox.js (corrida, estacoes, duracaoSeg, viabilidade)
 * @param {string} [dia]
 */
export function renderHyrox(hx, dia) {
  const corridaLinha = NIVEIS.map((n) => `${NIVEL_LABEL[n]}: <b>${hx.corrida[n].metros} m</b> (${hx.corrida[n].voltas}×50 m)`).join(' · ');
  const linhas = hx.estacoes.map((e) => {
    const unidade = (v) => e.tipo === 'distancia' ? `${v} m` : `${v} reps`;
    return `<tr>
      <td>${e.n}</td>
      <td>
        <b>${e.nome}</b><br>
        <small>${e.base} · ${equipNomes(e.equipamento)}</small><br>
        <small class="mut">${e.carga}${e.nota ? ` — ${e.nota}` : ''}</small>
      </td>
      ${NIVEIS.map((n) => `<td class="nv nv-${n}"><span class="nv-series">${unidade(e.prescricao[n])}</span></td>`).join('')}
    </tr>`;
  }).join('');
  const durLinha = NIVEIS.map((n) => `${NIVEL_LABEL[n]} <b>~${mmss(hx.duracaoSeg[n])}</b>`).join(' · ');
  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}Hyrox — formato da competição</h3>
    <div class="hyrox-fmt">8 rodadas de <b>corrida + estação</b>, na ordem da prova. Antes de CADA estação, a corrida — ${corridaLinha}.</div>
    ${hx.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${hx.viabilidade.nota}</div>` : ''}
    <div class="tbl-scroll"><table class="t-niveis">
      <thead><tr><th>#</th><th>Estação</th>${NIVEIS.map((n) => `<th class="nv nv-${n}">${NIVEL_LABEL[n]}</th>`).join('')}</tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <div class="hyrox-dur">⏱ Duração estimada: ${durLinha} <span class="mut">(estimativa — ajuste na prática)</span></div>
  </article>`;
}

/**
 * Card do treino HIIT — 4 estações TABATA (Inferiores · Core · Superiores · Cardio).
 * Prescrição única (TABATA é por tempo). Cada estação: 4 slots em 16 rounds cíclicos.
 * @param {any} h  estrutura de core/hiitTabata.js
 * @param {string} [dia]
 */
export function renderHiit(h, dia) {
  const p = h.protocolo;
  const estacoes = h.estacoes.map((est, i) => {
    const slots = est.slots.map((s, j) => {
      const lado = s.lado ? ` <span class="hiit-lado">(perna/lado ${s.lado})</span>` : '';
      return `<li><b>${j + 1}.</b> ${s.nome}${lado} <small class="mut">· ${s.carga}</small></li>`;
    }).join('');
    return `<div class="hiit-est">
      <div class="hiit-est-h"><span class="hiit-badge">Estação ${i + 1}</span> <b>${est.titulo.toUpperCase()}</b>
        <span class="mut">· ${est.rounds} rounds (4 voltas cíclicas)</span></div>
      <ol class="hiit-slots">${slots}</ol>
    </div>`;
  }).join('');
  const durMin = Math.round(h.duracaoSeg / 60);
  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}HIIT — 4 estações TABATA</h3>
    <div class="hyrox-fmt">Protocolo <b>TABATA ${p.trabalhoSeg}s on / ${p.descansoSeg}s off</b> · cada estação tem 4 exercícios rodados em <b>${p.roundsPorEstacao} rounds</b> (4 por exercício, de forma cíclica). Exercício unilateral entra como 2 (um lado por vez).</div>
    ${h.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${h.viabilidade.nota}</div>` : ''}
    <div class="hiit-grid">${estacoes}</div>
    <div class="hyrox-dur">⏱ Duração estimada: <b>~${durMin}min</b> <span class="mut">(4 estações + descansos + aquecimento — ajuste na prática)</span></div>
  </article>`;
}

/** registro de treinos vivos p/ permitir troca de exercício */
const vivos = new Map();
/** opções de render por card (preservadas entre trocas) */
const cardOpts = new Map();

function badgeViab(v) {
  return v.ok
    ? `<span class="ok">✓ viável p/ 8 (grupos de ${v.tamanhoGrupo})</span>`
    : `<span class="bad">⚠ ${v.conflitos.join(' ')}</span>`;
}

function renderVolume(vol) {
  const max = Math.max(1, ...Object.values(vol.porMusculo));
  return `<div class="vol">${Object.entries(vol.porMusculo).sort((a, b) => b[1] - a[1]).map(([m, v]) => `
    <div class="bar-row"><span class="bar-lbl">${m.replace('_', ' ')}</span>
      <span class="bar"><span style="width:${(v / max) * 100}%"></span></span>
      <span class="bar-val">${v}</span></div>`).join('')}</div>`;
}

/** @param {import('../core/tipos.js').Treino} t */
export function renderTreino(t, { comTroca = true, mostrarDiaSemana = true } = {}) {
  if (t.hyrox) return renderHyrox(t.hyrox, mostrarDiaSemana ? t.dia : undefined);
  if (t.hiit) return renderHiit(t.hiit, mostrarDiaSemana ? t.dia : undefined);
  const id = 'tr' + (_uid++);
  vivos.set(id, t);
  cardOpts.set(id, { comTroca, mostrarDiaSemana });
  return `<article class="card" id="${id}">${corpoTreino(id)}</article>`;
}

function corpoTreino(id) {
  const t = vivos.get(id);
  const { mostrarDiaSemana = true } = cardOpts.get(id) || {};
  const mod = MODALIDADES[t.modalidade];
  const aquec = t.aquecimento.map((a) => `<li>${a.exercicio.nome} — ${mmss(a.duracaoSeg)}</li>`).join('');
  const main = t.principal.map((p, i) => {
    const item = {
      nome: p.exercicio.nome, padrao: p.exercicio.padrao, equipamento: p.exercicio.equipamento,
      reps: p.reps, descansoSeg: p.descansoSeg,
      niveis: variantesNivel(p.exercicio, p.series, t.modalidade),
    };
    const acoes = `<button class="btn ghost sm swap" data-card="${id}" data-idx="${i}">trocar</button>`;
    return linhaNiveis(i, item, acoes, `<div class="alts" id="${id}-alts-${i}"></div>`);
  }).join('');
  const fin = t.finalizador ? `<div class="fin"><b>Finalizador — ${t.finalizador.tipo}</b><br>${t.finalizador.descricao}</div>` : '';
  const cab = mostrarDiaSemana
    ? `${mod.nome} · ${t.dia.toUpperCase()} · semana ${t.semana}`
    : `${mod.nome}`;
  return `
    <h3>${cab}</h3>
    <div>${badgeViab(t.viabilidade)}
      ${t.deload ? '<span class="chip warn">DELOAD</span>' : ''}
      <span class="chip acc">${t.principal.length} exercícios</span>
    </div>
    <div class="tempos">🔥 aquec ${mmss(t.tempoAquecimentoSeg)} · 🏋️ principal ${mmss(t.tempoPrincipalSeg)}${t.finalizador ? ` · 🎯 final ${mmss(t.tempoFinalizadorSeg)}` : ''} · ⏱ total ~${mmss(t.tempoTotalSeg)} <span class="mut">(ref. intermediário)</span></div>
    <h4>Aquecimento / Mobilidade</h4>
    <ul class="aquec">${aquec}</ul>
    <h4>Bloco principal <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— séries × carga por nível</span></h4>
    ${tabelaNiveis(main)}
    <small class="mut">🏋 Cargas são um <b>ponto de partida</b> (nível + modalidade + pesos do box) — ajuste pelo aluno.</small>
    ${fin}
    <h4>Volume por músculo (séries equivalentes)</h4>
    ${renderVolume(t.volume)}`;
}

/**
 * Cenários de frequência: prova que 3 dias batem o mínimo e 4–5 rendem mais,
 * a partir do MESMO programa da semana.
 * @param {ReturnType<import('../core/programaSemanal.js').gerarProgramaSemanal>} prog
 * @param {number} [freqDestaque]  Frequência do aluno selecionado (para destacar)
 */
export function renderCenarios(prog, freqDestaque) {
  const padroes = Object.keys(prog.minimo);
  const freqs = [3, 4, 5].filter((f) => prog.cenarios[f]);

  const linhasPadrao = padroes.map((p) => {
    const cels = freqs.map((f) => {
      const a = prog.cenarios[f].aderencia[p];
      const min = prog.minimo[p];
      const cls = min > 0 ? (a.ok ? 'ok' : 'bad') : 'mut';
      return `<td class="${cls}">${a.volume}${min > 0 ? '' : ' '}</td>`;
    }).join('');
    return `<tr><td>${PADRAO_LABEL[p] || p}</td><td class="mut">${prog.minimo[p] || '—'}</td>${cels}</tr>`;
  }).join('');

  const cabFreq = freqs.map((f) => {
    const c = prog.cenarios[f];
    const destaque = f === freqDestaque ? ' style="color:var(--acc)"' : '';
    return `<th${destaque}>${f}×${c.atingeMinimo ? ' ✓' : ''}</th>`;
  }).join('');

  const total = freqs.map((f) => `<td><b>${prog.cenarios[f].totalPior}</b></td>`).join('');
  const min3 = prog.cenarios[3];
  const g5 = prog.cenarios[5]?.totalPior, g3 = min3?.totalPior;
  const ganho = g3 && g5 ? Math.round(((g5 - g3) / g3) * 100) : null;

  return `<article class="card">
    <h3>Cenários de frequência — mesmo programa para todos</h3>
    <div class="mut" style="margin-bottom:10px">Volume semanal de séries (pior combinação de dias) que cada aluno recebe conforme quantos dias treina.</div>
    <table>
      <thead><tr><th>Padrão</th><th>Mínimo</th>${cabFreq}</tr></thead>
      <tbody>${linhasPadrao}<tr><td><b>Total</b></td><td class="mut">—</td>${total}</tr></tbody>
    </table>
    <p style="margin-top:10px">
      ${min3?.atingeMinimo
        ? '<span class="chip" style="color:var(--ok);border-color:var(--ok)">✓ 3 dias já garante o mínimo para bons resultados</span>'
        : (((prog.semana - 1) % 4) + 1 === 4
          ? '<span class="chip warn">💤 Semana de deload — volume reduzido de propósito (recuperação)</span>'
          : '<span class="chip warn">⚠ 3 dias ainda não bate o mínimo — ajuste a grade ou os mínimos</span>')}
      ${ganho != null ? `<span class="chip acc">5 dias = +${ganho}% de volume</span>` : ''}
    </p>
  </article>`;
}

/** @param {ReturnType<import('../core/mesociclo.js').gerarMesociclo>} meso */
export function renderMesociclo(meso) {
  const maxSeries = Math.max(1, ...meso.semanas.map((s) => s.totalSeries));
  const linhas = meso.semanas.map((s) => `
    <tr class="${s.deload ? 'bad-row' : ''}">
      <td><b>Semana ${s.semana}</b></td>
      <td>${s.intensidade.rotulo}${s.deload ? ' 💤' : ''}${s.gap ? ' · HIIT→GAP' : ''}</td>
      <td>~${s.intensidade.pctRM}% 1RM</td>
      <td>${s.totalSeries}</td>
      <td><span class="bar" style="display:inline-block;width:140px;vertical-align:middle"><span style="width:${(s.totalSeries / maxSeries) * 100}%"></span></span></td>
    </tr>`).join('');
  const gradeTxt = Object.entries(meso.grade)
    .map(([d, m]) => `${d.toUpperCase()} ${MODALIDADES[m]?.nome || m}`).join(' · ');
  return `<article class="card">
    <h3>Mesociclo · ${meso.nSemanas} semanas</h3>
    <div class="mut" style="margin-bottom:8px">Grade: ${gradeTxt}. Progressão de volume e intensidade com deload automático na semana 4 do ciclo.</div>
    <table><thead><tr><th>Semana</th><th>Fase</th><th>Intensidade</th><th>Séries (5 dias)</th><th>Volume</th></tr></thead><tbody>${linhas}</tbody></table>
  </article>`;
}

/**
 * Card de um dia salvo, a partir do snapshot.
 * @param {any} d @param {boolean} [editavel]  Mostra o botão "trocar" (só na aba Programa)
 */
export function renderDiaSalvo(d, editavel = true) {
  if (d.hyrox) return renderHyrox(d.hyrox, d.dia); // Hyrox é template fixo (sem "trocar")
  if (d.hiit) return renderHiit(d.hiit, d.dia);    // HIIT é template TABATA (sem "trocar")
  const acoesDe = (i) => editavel ? `<button class="btn ghost sm swap-prog" data-dia="${d.dia}" data-idx="${i}">trocar</button>` : '';
  const altsDe = (i) => editavel ? `<div class="alts" id="alts-${d.dia}-${i}"></div>` : '';
  // snapshot antigo (sem níveis) → render legado de coluna única
  const legado = d.exercicios.length && !d.exercicios[0].niveis;
  let corpo;
  if (legado) {
    const exs = d.exercicios.map((e, i) => `
      <tr><td>${i + 1}</td>
        <td>
          <div class="ex-row">
            <div><b>${e.nome}</b><br><small>${PADRAO_LABEL[e.padrao] || e.padrao} · ${equipNomes(e.equipamento || [])}</small>
              <div><span class="chip acc">🏋 ${e.carga}</span></div></div>
            ${acoesDe(i)}
          </div>
          ${altsDe(i)}
        </td>
        <td>${e.series}× ${e.reps}</td></tr>`).join('');
    corpo = `<table><thead><tr><th>#</th><th>Exercício</th><th>Séries</th></tr></thead><tbody>${exs}</tbody></table>`;
  } else {
    corpo = tabelaNiveis(d.exercicios.map((e, i) => linhaNiveis(i, e, acoesDe(i), altsDe(i))).join(''));
  }
  const fin = d.finalizador ? `<div class="fin"><b>${d.finalizador.tipo}</b><br>${d.finalizador.descricao}</div>` : '';
  const viab = d.viabilidade?.ok ? `<span class="ok">✓ viável (grupos de ${d.viabilidade.tamanhoGrupo})</span>` : '';
  return `<article class="card">
    <h3>${d.dia.toUpperCase()} · ${MODALIDADES[d.modalidade]?.nome || d.modalidade}</h3>
    <div>${viab}</div>
    ${corpo}
    ${fin}</article>`;
}

/** Relatório do box no mês: um card por semana salva, com o treino expansível. */
export function renderRelatorioMes(rotulo, semanas) {
  if (!semanas.length) return '<div class="empty">Nenhum treino salvo neste mês.</div>';
  const cards = semanas.map((s) => {
    const grade = Object.entries(s.grade).map(([d, m]) => `${d.toUpperCase()} ${MODALIDADES[m]?.nome || m}`).join(' · ');
    const ok = s.cenarios?.[3]?.atingeMinimo;
    const total = Math.round(Object.values(s.volPorDia).reduce((a, dia) => a + Object.values(dia).reduce((x, y) => x + y, 0), 0));
    const quando = s.geradoEm ? new Date(s.geradoEm).toLocaleDateString('pt-BR') : '';
    const dias = s.dias.map((d) => renderDiaSalvo(d, false)).join('');
    return `<article class="card">
      <h3>Semana ${s.semana} — ${rotulo}</h3>
      <div class="mut" style="margin-bottom:6px">${grade}${quando ? ` · salvo em ${quando}` : ''}</div>
      <div>${ok ? '<span class="chip" style="color:var(--ok);border-color:var(--ok)">✓ 3× mínimo</span>' : '<span class="chip warn">3× abaixo</span>'}<span class="chip acc">${total} séries (5 dias)</span></div>
      <details style="margin-top:10px">
        <summary style="cursor:pointer;color:var(--acc);font-weight:600">Ver treino realizado</summary>
        <div class="grid" style="margin-top:10px">${dias}</div>
      </details>
    </article>`;
  }).join('');
  return `<article class="card">
    <h3>Relatório do box — ${rotulo}</h3>
    <div class="mut">${semanas.length} semana(s) registrada(s). Expanda uma semana para ver o treino, ou selecione um aluno para o acumulado individual.</div>
  </article>${cards}`;
}

/**
 * Acumulado do mês de um aluno: soma os dias que ele treina em cada semana salva.
 * @param {string} nome @param {string[]} dias  dias que o aluno frequenta
 * @param {any[]} semanas  programas salvos do mês
 * @param {string} rotulo  rótulo do mês
 */
export function renderAcumuladoAluno(nome, dias, semanas, rotulo) {
  const acc = Object.fromEntries(PADROES.map((p) => [p, 0]));
  let sessoes = 0;
  const porSemana = semanas.map((s) => {
    const diasTreino = dias.filter((d) => s.volPorDia[d]); // dias do aluno que têm treino na grade
    sessoes += diasTreino.length;
    let semTotal = 0;
    diasTreino.forEach((d) => PADROES.forEach((p) => { const v = s.volPorDia[d][p] || 0; acc[p] += v; semTotal += v; }));
    return `<tr><td>Semana ${s.semana}</td><td>${diasTreino.map((d) => d.toUpperCase()).join(', ') || '—'}</td><td>${Math.round(semTotal)}</td></tr>`;
  }).join('');

  const totalGeral = Math.round(Object.values(acc).reduce((a, b) => a + b, 0));
  const linhasPad = PADROES.filter((p) => acc[p] > 0)
    .map((p) => `<tr><td>${PADRAO_LABEL[p] || p}</td><td>${Math.round(acc[p])}</td></tr>`).join('');

  return `<article class="card">
    <h3>${nome} — acumulado de ${rotulo}</h3>
    <div class="mut" style="margin-bottom:10px">Dias que treina: ${dias.map((d) => d.toUpperCase()).join(' / ')} · <b>${sessoes}</b> sessões no mês · <b>${totalGeral}</b> séries no total.</div>
    <h4>Volume acumulado por padrão</h4>
    <table><tbody>${linhasPad || '<tr><td class="mut">Sem dados ainda.</td></tr>'}</tbody></table>
    <h4>Por semana</h4>
    <table><thead><tr><th>Semana</th><th>Dias treinados</th><th>Séries</th></tr></thead><tbody>${porSemana}</tbody></table>
  </article>`;
}

/** Delegação de cliques para os botões "trocar" e as alternativas. */
export function ativarTrocas(raiz) {
  raiz.addEventListener('click', (ev) => {
    const swap = ev.target.closest('.swap');
    if (swap) {
      const { card, idx } = swap.dataset;
      const t = vivos.get(card);
      const box = document.getElementById(`${card}-alts-${idx}`);
      if (box.childElementCount) { box.innerHTML = ''; return; } // toggle
      const alts = alternativasViaveis(t, Number(idx));
      box.innerHTML = alts.length
        ? alts.map((e) => `<button class="btn ghost sm alt" data-card="${card}" data-idx="${idx}" data-ex="${e.id}">${e.nome}</button>`).join('')
        : '<small>sem alternativas viáveis</small>';
      return;
    }
    const alt = ev.target.closest('.alt');
    if (alt) {
      const { card, idx, ex } = alt.dataset;
      const t = vivos.get(card);
      const novo = alternativasViaveis(t, Number(idx)).find((e) => e.id === ex);
      if (!novo) return;
      const atualizado = aplicarTroca(t, Number(idx), novo);
      vivos.set(card, atualizado);
      document.getElementById(card).innerHTML = corpoTreino(card);
    }
  });
}
