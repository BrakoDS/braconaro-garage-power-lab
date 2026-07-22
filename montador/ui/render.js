// @ts-check
import { MODALIDADES } from '../config/modalidades.js';
import { PADRAO_LABEL, PADROES } from '../config/padroes.js';
import { MINIMO_SEMANAL } from '../config/frequencias.js';
import { EQUIP_POR_ID } from '../data/equipamentos.js';
import { alternativasViaveis, aplicarTroca } from '../core/gerador.js';
import { variantesNivel, NIVEIS, NIVEL_LABEL } from '../core/niveis.js';

/** Cor de fundo + texto por modalidade (calendário do histórico). */
export const COR_MODALIDADE = {
  forca:       { bg: '#FF0000', fg: '#fff', nome: 'Força' },
  hipertrofia: { bg: '#FFA500', fg: '#1a1300', nome: 'Hipertrofia' },
  hyrox:       { bg: '#FFFF00', fg: '#1a1300', nome: 'HYROX' },
  gap:         { bg: '#FFC0CB', fg: '#3a0d16', nome: 'GAP' },
  hibrido:     { bg: '#800080', fg: '#fff', nome: 'Híbrido' },
  hiit:        { bg: '#3DDC84', fg: '#06210f', nome: 'HIIT' },
};

const mmss = (s) => `${Math.round(s / 60)}min`;
const equipNomes = (ids) => ids.map((i) => (EQUIP_POR_ID[i]?.nome || i)).join(', ');
let _uid = 0;

/** Célula de um nível: séries + carga. @param {{series:number,carga:string}} v */
const celNivel = (v) => `<span class="nv-series">${v.series}×</span> <span class="nv-carga">${v.carga}</span>`;

/** Selo de técnica avançada (Híbrido) — bi-set/drop-set/isometria/tempo. */
const TECNICA_LABEL = { biset: 'Bi-set', dropset: 'Drop-set', isometria: 'Isometria', tempo: 'Tempo 2-1-2' };
function seloTecnica(tecnica) {
  if (!tecnica) return '';
  return `<span class="tec-badge tec-${tecnica.tipo}" title="${tecnica.detalhe}">${TECNICA_LABEL[tecnica.tipo] || tecnica.tipo}</span>`;
}

/**
 * Uma linha (<tr>) da tabela de 3 níveis para um exercício já normalizado.
 * @param {number} i @param {{nome:string,padrao:string,equipamento:string[],reps:string,descansoSeg?:number,niveis:Record<string,{series:number,carga:string}>,tecnica?:any}} item
 * @param {string} acoesHTML  botão "trocar" (ou '') @param {string} altsHTML  container de alternativas (ou '')
 */
function linhaNiveis(i, item, acoesHTML, altsHTML) {
  const desc = item.descansoSeg != null ? ` · ${item.descansoSeg}s desc.` : '';
  return `<tr>
    <td>${i + 1}</td>
    <td>
      <div class="ex-row">
        <div>
          <b>${item.nome}</b> ${seloTecnica(item.tecnica)}<br>
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

/**
 * Card da aula GAP — TABATA "Siga o Mestre", 4 partes (Aquecimento · Pernas · Glúteo ·
 * Abdômen) com músicas de 8 rounds cada, listadas round a round.
 * @param {any} g  estrutura de core/gap.js
 * @param {string} [dia]
 */
export function renderGap(g, dia) {
  const p = g.protocolo;
  const partes = g.partes.map((parte) => {
    const musicas = parte.musicas.map((m, i) => {
      const rounds = m.rounds.map((r) => `<li>${r.n} — ${r.nome}</li>`).join('');
      return `<div class="gap-musica">
        <div class="gap-musica-h">🎵 <b>${parte.nome}${parte.musicas.length > 1 ? ' ' + (i + 1) : ''}</b> <span class="mut">· 8 rounds</span></div>
        <ol class="gap-rounds">${rounds}</ol>
      </div>`;
    }).join('');
    return `<div class="gap-parte"><div class="gap-parte-h"><span class="hiit-badge">${parte.nome}</span> <span class="mut">${parte.musicas.length} música${parte.musicas.length > 1 ? 's' : ''}</span></div><div class="gap-musicas">${musicas}</div></div>`;
  }).join('');
  const durMin = Math.round(g.duracaoSeg / 60);
  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}GAP — aula TABATA (Siga o Mestre)</h3>
    <div class="hyrox-fmt">Protocolo <b>TABATA ${p.trabalhoSeg}s on / ${p.descansoSeg}s off</b> · <b>${g.totalMusicas} músicas</b> (${g.totalRounds} rounds). Cada música = 8 rounds com 3 exercícios cíclicos (1,2,3,1,2,3,1,2). O professor executa à frente; a turma acompanha.</div>
    ${g.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${g.viabilidade.nota}</div>` : ''}
    ${partes}
    <div class="hyrox-dur">⏱ Duração estimada: <b>~${durMin}min</b> <span class="mut">(9 músicas + descansos — ajuste na prática)</span></div>
  </article>`;
}

const WOD_GRUPO_LABEL = { peso: '🏋 Peso', corporal: '🤸 Corporal', monoestrutural: '🏃 Monoestrutural' };

/**
 * Card do treino HÍBRIDO — Mobilidade → Hipertrofia (split) → WOD, gerado
 * dinamicamente a cada geração (sem exercícios fixos).
 * @param {any} h  estrutura de core/hibrido.js (split, mobilidade, hipertrofia, wod, duracaoSeg)
 * @param {string} [dia]
 */
export function renderHibrido(h, dia) {
  const mob = h.mobilidade.map((m) => `<li>${m.nome} — ${mmss(m.duracaoSeg)}</li>`).join('');
  // Vem "ao vivo" do gerador (item.exercicio + series, sem niveis calculado ainda — como
  // t.principal da Força) OU já normalizado do snapshot salvo (item.nome/niveis prontos).
  const hiperItens = h.hipertrofia.map((item) => item.exercicio ? {
    nome: item.exercicio.nome, padrao: item.exercicio.padrao, equipamento: item.exercicio.equipamento,
    reps: item.reps, descansoSeg: item.descansoSeg, tecnica: item.tecnica,
    niveis: variantesNivel(item.exercicio, item.series, 'hibrido'),
  } : item);
  const hiperRows = hiperItens.map((item, i) => linhaNiveis(i, item, '', '')).join('');
  const wodMovs = h.wod.movimentos.map((m) => `<li><b>${m.nome}</b> <span class="mut">${WOD_GRUPO_LABEL[m.grupo] || m.grupo}</span> — ${m.prescricao}</li>`).join('');
  const durMin = Math.round(h.duracaoSeg / 60);
  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}Híbrido — ${h.splitLabel}</h3>
    <div class="hyrox-fmt">Split de hoje: <b>${h.splitLabel}</b>. 3 blocos: Mobilidade (6min) → Hipertrofia (10–12 reps) → WOD (${h.wod.duracaoMin}min).</div>
    ${h.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${h.viabilidade.nota}</div>` : ''}

    <h4>Mobilidade <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— 6 min</span></h4>
    <ul class="aquec">${mob}</ul>

    <h4>Parte 1 — Hipertrofia <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${h.splitLabel} · série × carga por nível</span></h4>
    ${tabelaNiveis(hiperRows)}

    <h4>Parte 2 — WOD <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${h.wod.formato}</span></h4>
    <div class="hib-wod">
      <div class="hib-wod-h"><span class="hiit-badge">${h.wod.formato}</span> <b>${h.wod.duracaoMin} min</b></div>
      <div class="mut" style="margin:4px 0 8px">${h.wod.descricaoFormato}</div>
      <ul class="hib-wod-list">${wodMovs}</ul>
    </div>

    <div class="hyrox-dur">⏱ Duração total estimada: <b>~${durMin}min</b> <span class="mut">(mobilidade + hipertrofia + WOD — ajuste na prática)</span></div>
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

/** Barras de volume por músculo (séries equivalentes) — usado pelo card gerado e pelo Treino Manual. */
export function renderVolume(vol) {
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
  if (t.gap) return renderGap(t.gap, mostrarDiaSemana ? t.dia : undefined);
  if (t.hibrido) return renderHibrido(t.hibrido, mostrarDiaSemana ? t.dia : undefined);
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
 * Card de um dia salvo, a partir do snapshot.
 * @param {any} d @param {boolean} [editavel]  Mostra o botão "trocar" (só na aba Programa)
 */
export function renderDiaSalvo(d, editavel = true) {
  if (d.hyrox) return renderHyrox(d.hyrox, d.dia); // Hyrox é template fixo (sem "trocar")
  if (d.hiit) return renderHiit(d.hiit, d.dia);    // HIIT é template TABATA (sem "trocar")
  if (d.gap) return renderGap(d.gap, d.dia);       // GAP é aula estruturada (sem "trocar")
  if (d.hibrido) return renderHibrido(d.hibrido, d.dia); // Híbrido é gerado (sem "trocar" nesta leva)
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
  // Aquecimento salvo no snapshot (Treino Manual) — o automático não persiste o aquecimento.
  const aquec = d.aquecimento?.length
    ? `<h4>Aquecimento / Mobilidade</h4><ul class="aquec">${d.aquecimento.map((a) => `<li>${a.nome} — ${mmss(a.duracaoSeg)}</li>`).join('')}</ul>`
    : '';
  return `<article class="card">
    <h3>${d.dia.toUpperCase()} · ${MODALIDADES[d.modalidade]?.nome || d.modalidade}${d.manual ? ' <span class="chip acc">manual</span>' : ''}</h3>
    <div>${viab}</div>
    ${aquec}
    ${corpo}
    ${fin}</article>`;
}

/**
 * Meta de volume da SEMANA do calendário: soma o volume por padrão dos treinos já
 * salvos na semana + (opcional) o treino recém-gerado, comparado a MINIMO_SEMANAL.
 * @param {Array<Record<string, number>>} volsPorPadraoSalvos  volPorPadrao de cada treino salvo na semana
 * @param {Record<string, number>|null} volGerado  volume.porPadrao do treino recém-gerado (ou null)
 */
export function renderMetaVolume(volsPorPadraoSalvos, volGerado) {
  const acc = Object.fromEntries(PADROES.map((p) => [p, 0]));
  for (const v of volsPorPadraoSalvos) for (const p of PADROES) acc[p] += (v?.[p] || 0);
  if (volGerado) for (const p of PADROES) acc[p] += (volGerado[p] || 0);

  const linhas = PADROES.filter((p) => (MINIMO_SEMANAL[p] || 0) > 0).map((p) => {
    const meta = MINIMO_SEMANAL[p];
    const val = Math.round(acc[p]);
    const ok = val >= meta;
    const pct = Math.min(100, (val / meta) * 100);
    return `<div class="meta-row">
      <span class="meta-lbl">${PADRAO_LABEL[p] || p}</span>
      <span class="meta-bar"><span class="${ok ? 'ok' : ''}" style="width:${pct}%"></span></span>
      <span class="meta-val ${ok ? 'ok' : 'bad'}">${val}/${meta}${ok ? ' ✓' : ` · faltam ${meta - val}`}</span>
    </div>`;
  }).join('');
  const tudoOk = PADROES.every((p) => !(MINIMO_SEMANAL[p] > 0) || acc[p] >= MINIMO_SEMANAL[p]);

  return `<div class="meta-card">
    <div class="meta-h">Meta de volume da semana ${tudoOk ? '<span class="chip" style="color:var(--ok);border-color:var(--ok)">✓ meta atingida</span>' : '<span class="chip warn">em andamento</span>'}</div>
    <div class="mut" style="margin-bottom:8px;font-size:.82rem">Séries por padrão nos treinos desta semana (seg–dom)${volGerado ? ' + o treino gerado' : ''} vs. o mínimo semanal.</div>
    ${linhas}
  </div>`;
}

/**
 * Calendário mensal do histórico. Cada dia com treino recebe a cor da modalidade.
 * @param {string} mesId 'YYYY-MM'
 * @param {Array<{dateId:string, modalidade:string}>} treinos  treinos salvos do mês
 * @param {string} rotulo  rótulo do mês (ex.: 'Julho/2026')
 */
export function renderCalendario(mesId, treinos, rotulo) {
  const [ano, mes] = mesId.split('-').map(Number);
  const porDia = {};
  for (const t of treinos) porDia[t.dateId] = t;

  const primeiro = new Date(ano, mes - 1, 1);
  const nDias = new Date(ano, mes, 0).getDate();
  const inicioDow = primeiro.getDay(); // 0=dom..6=sab
  const CAB = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

  const celulas = [];
  for (let i = 0; i < inicioDow; i++) celulas.push('<div class="cal-cel vazia"></div>');
  for (let dia = 1; dia <= nDias; dia++) {
    const dateId = `${mesId}-${String(dia).padStart(2, '0')}`;
    const t = porDia[dateId];
    if (t) {
      const c = COR_MODALIDADE[t.modalidade] || { bg: '#555', fg: '#fff' };
      celulas.push(`<button class="cal-cel tem" data-date="${dateId}" type="button"
        style="background:${c.bg};color:${c.fg}" title="${(COR_MODALIDADE[t.modalidade]?.nome) || t.modalidade}">
        <span class="cal-num">${dia}</span></button>`);
    } else {
      celulas.push(`<div class="cal-cel"><span class="cal-num">${dia}</span></div>`);
    }
  }

  const legenda = Object.entries(COR_MODALIDADE)
    .map(([, c]) => `<span class="cal-leg-item"><span class="cal-leg-cor" style="background:${c.bg}"></span>${c.nome}</span>`).join('');

  return `<article class="card cal-card">
    <div class="cal-topo">
      <button class="btn ghost sm cal-nav" data-nav="-1" type="button">◀</button>
      <h3 class="cal-titulo">${rotulo}</h3>
      <button class="btn ghost sm cal-nav" data-nav="1" type="button">▶</button>
    </div>
    <div class="cal-grade">
      ${CAB.map((d) => `<div class="cal-cab">${d}</div>`).join('')}
      ${celulas.join('')}
    </div>
    <div class="cal-legenda">${legenda}</div>
    <div class="mut" style="margin-top:6px;font-size:.8rem">Toque num dia colorido para ver o treino e, se quiser, excluí-lo.</div>
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
