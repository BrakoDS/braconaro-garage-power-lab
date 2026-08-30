// @ts-check
import { MODALIDADES } from '../config/modalidades.js';
import { PADRAO_LABEL, PADROES } from '../config/padroes.js';
import { MINIMO_SEMANAL } from '../config/frequencias.js';
import { EQUIP_POR_ID } from '../data/equipamentos.js';
import { alternativasViaveis, alternativasLivres, aplicarTroca } from '../core/gerador.js';
import { variantesNivel, NIVEIS, NIVEL_LABEL } from '../core/niveis.js';
import { NIVEIS_HYROX, NIVEL_HYROX_LABEL } from '../core/hyrox.js';
import { agruparPorSemana, analisarSemana, analisarMes } from '../core/analise.js';
import { alternativasDoDia, diaEditavel } from '../core/editar-dia.js';
import { COR_MODALIDADE } from '../config/cores-modalidade.js';

/* Cor por modalidade (calendário do histórico). Mora em config/ porque o Portal
   do Aluno desenha o mesmo calendário; o re-export mantém os imports de cá.
   O import separado é necessário: `export ... from` não cria binding local, e
   renderCalendario() logo abaixo usa o mapa. */
export { COR_MODALIDADE } from '../config/cores-modalidade.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (s) => `${Math.round(s / 60)}min`;
const equipNomes = (ids) => ids.map((i) => (EQUIP_POR_ID[i]?.nome || i)).join(', ');
let _uid = 0;

/** Célula de um nível: séries + carga. @param {{series:number,carga:string}} v */
const celNivel = (v) => `<span class="nv-series">${v.series}×</span> <span class="nv-carga">${v.carga}</span>`;

/**
 * Selo de técnica avançada.
 *
 * Duas origens: o Híbrido gera as suas em `core/hibrido.js` (tipos fixos, sem
 * `label`) e o Treino Manual usa as técnicas cadastradas na Academia, que trazem o
 * nome junto. Por isso o `label` do snapshot vem primeiro e o mapa fixo só atende os
 * tipos antigos — incluindo treino já salvo antes desta mudança.
 */
/** Nomes legíveis dos grupos musculares (os ids de config/padroes.js são internos). */
const MUSCULO_LABEL = {
  peito: 'peito', ombro: 'ombro', triceps: 'tríceps', costas: 'costas', biceps: 'bíceps',
  quadriceps: 'quadríceps', posterior_coxa: 'posterior de coxa', gluteo: 'glúteo',
  panturrilha: 'panturrilha', core: 'core', antebraco: 'antebraço',
  adutores: 'adutores', abdutores: 'abdutores', lombar: 'lombar', trapezio: 'trapézio',
};

const TECNICA_LABEL = { dropset: 'Drop-set', isometria: 'Isometria', tempo: 'Tempo 2-1-2' };
function seloTecnica(tecnica) {
  if (!tecnica) return '';
  const rotulo = tecnica.label || TECNICA_LABEL[tecnica.tipo] || tecnica.tipo;
  return `<span class="tec-badge tec-${esc(tecnica.tipo)}" title="${esc(tecnica.detalhe || '')}">${esc(rotulo)}</span>`;
}

/**
 * Uma linha (<tr>) da tabela de 3 níveis para um exercício já normalizado.
 * @param {number} i @param {{nome:string,padrao:string,equipamento:string[],reps:string,descansoSeg?:number,niveis:Record<string,{series:number,carga:string}>,tecnica?:any}} item
 * @param {string} acoesHTML  botão "trocar" (ou '') @param {string} altsHTML  container de alternativas (ou '')
 */
function linhaNiveis(i, item, acoesHTML, altsHTML) {
  const desc = item.descansoSeg != null ? ` · ${item.descansoSeg}s desc.` : '';
  // Músculos: o padrão de movimento diz COMO, os músculos dizem O QUÊ — e é o que
  // o coach precisa para explicar o exercício e montar o quadro.
  const prim = (item.musculosPrimarios || []).map((m) => MUSCULO_LABEL[m] || m);
  const sec = (item.musculosSecundarios || []).map((m) => MUSCULO_LABEL[m] || m);
  const musculos = prim.length
    ? `<br><small class="mut">💪 ${prim.join(', ')}${sec.length ? ` <span style="opacity:.7">+ ${sec.join(', ')}</span>` : ''}</small>`
    : '';
  return `<tr>
    <td>${i + 1}</td>
    <td>
      <div class="ex-row">
        <div>
          <b>${item.nome}</b> ${seloTecnica(item.tecnica)}<br>
          <small>${PADRAO_LABEL[item.padrao] || item.padrao} · ${equipNomes(item.equipamento || [])}</small>${musculos}<br>
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
/** Selo de treino montado à mão, para os cards dos formatos estruturados. */
const seloManual = (m) => (m ? ' <span class="chip acc">manual</span>' : '');

export function renderHyrox(hx, dia, manual = false) {
  // O Hyrox tem uma coluna a mais que o resto do app — o Competitivo. Snapshot
  // salvo antes dela existir não tem esse nível, então a lista sai do próprio
  // treino em vez de ser fixa: o card antigo continua abrindo com 3 colunas.
  const niveis = NIVEIS_HYROX.filter((n) => hx.corrida?.[n] || hx.estacoes?.[0]?.prescricao?.[n]);
  const rot = (n) => NIVEL_HYROX_LABEL[n] || n;
  const corridaLinha = niveis.map((n) => `${rot(n)} <b>${hx.corrida[n].metros} m</b> (${hx.corrida[n].voltas}×50 m)`).join(' · ');
  const bikeLinha = niveis.every((n) => hx.corrida[n]?.bikeMin)
    ? `<div class="mut" style="margin:4px 0 2px">🚲 <b>Sem impacto ou sem rua:</b> a mesma rodada na airbike — ${niveis.map((n) => `${rot(n)} ${String(hx.corrida[n].bikeMin).replace('.', ',')} min`).join(' · ')}.</div>`
    : '';
  const linhas = hx.estacoes.map((e) => {
    const unidade = (v) => (v == null ? '—' : e.tipo === 'distancia' ? `${v} m` : `${v} reps`);
    return `<tr>
      <td>${e.n}</td>
      <td>
        <b>${e.nome}</b><br>
        <small>${e.base} · ${equipNomes(e.equipamento)}</small><br>
        <small class="mut">${e.carga}${e.nota ? ` — ${e.nota}` : ''}</small>
      </td>
      ${niveis.map((n) => `<td class="nv nv-${n}"><span class="nv-series">${unidade(e.prescricao[n])}</span></td>`).join('')}
    </tr>`;
  }).join('');
  const durLinha = niveis.map((n) => `${rot(n)} <b>~${mmss(hx.duracaoSeg[n])}</b>`).join(' · ');
  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}Hyrox — formato da competição${seloManual(manual)}</h3>
    <div class="hyrox-fmt">${hx.estacoes.length} rodadas de <b>corrida + estação</b>, na ordem da prova. Antes de CADA estação, a corrida — ${corridaLinha}.</div>
    ${bikeLinha}
    ${hx.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${hx.viabilidade.nota}</div>` : ''}
    <div class="tbl-scroll"><table class="t-niveis">
      <thead><tr><th>#</th><th>Estação</th>${niveis.map((n) => `<th class="nv nv-${n}">${rot(n)}</th>`).join('')}</tr></thead>
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
export function renderHiit(h, dia, manual = false) {
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
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}HIIT — 4 estações TABATA${seloManual(manual)}</h3>
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
export function renderGap(g, dia, manual = false) {
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
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}GAP — aula TABATA (Siga o Mestre)${seloManual(manual)}</h3>
    <div class="hyrox-fmt">Protocolo <b>TABATA ${p.trabalhoSeg}s on / ${p.descansoSeg}s off</b> · <b>${g.totalMusicas} músicas</b> (${g.totalRounds} rounds). Cada música = 8 rounds com 3 exercícios cíclicos (1,2,3,1,2,3,1,2). O professor executa à frente; a turma acompanha.</div>
    ${g.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${g.viabilidade.nota}</div>` : ''}
    ${partes}
    <div class="hyrox-dur">⏱ Duração estimada: <b>~${durMin}min</b> <span class="mut">(9 músicas + descansos — ajuste na prática)</span></div>
  </article>`;
}

/**
 * Card do MURPH — desafio for time: corrida + 600 repetições + corrida.
 *
 * O que varia por nível não é o volume (o miolo é igual para todos), é a
 * distância da corrida e se as repetições podem ser fracionadas. Por isso a
 * tabela mostra as duas coisas lado a lado, e não uma prescrição por exercício.
 * @param {any} m  estrutura de core/murph.js
 * @param {string} [dia] @param {boolean} [manual]
 */
export function renderMurph(m, dia, manual = false) {
  const niveis = NIVEIS.filter((n) => m.cardio?.[n]);
  const blocos = m.blocos.map((b) => `<tr>
    <td>${b.n}</td>
    <td><b>${esc(b.nome)}</b><br>
      <small>no lugar de ${esc(b.base)} · ${equipNomes(b.equipamento || [])}</small>
      ${b.nota ? `<br><small class="mut">${esc(b.nota)}</small>` : ''}</td>
    <td class="nv"><span class="nv-series">${b.reps}</span></td>
  </tr>`).join('');

  const linhas = niveis.map((n) => {
    const c = m.cardio[n];
    const ex = m.execucao[n];
    const alt = c.alternativa ? ` <small class="mut">ou ${c.alternativa.metros} m</small>` : '';
    return `<tr>
      <td class="nv nv-${n}"><b>${NIVEL_LABEL[n]}</b></td>
      <td>${c.metros} m${alt}<br><small class="mut">🚲 ${String(c.bikeMin).replace('.', ',')} min de airbike${c.alternativa ? ` ou ${String(c.alternativa.bikeMin).replace('.', ',')} min` : ''}</small></td>
      <td><b>${esc(ex.rotulo)}</b><br><small class="mut">${esc(ex.detalhe)}</small></td>
      <td>~${mmss(m.duracaoSeg[n])}</td>
    </tr>`;
  }).join('');

  const cindy = m.cindy
    ? `<div class="mut" style="margin:6px 0 2px">🔁 <b>Round do Cindy</b> (Iniciante): ${m.cindy.rounds} rounds de ${m.cindy.round.map((r) => `${r.reps} ${esc(r.nome)}`).join(' + ')}.</div>`
    : '';

  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}Murph — desafio${seloManual(manual)}</h3>
    <div class="hyrox-fmt"><b>For time:</b> corrida → <b>${m.totalReps} repetições</b> → corrida. O miolo é igual para todos; o nível decide a distância e se dá para fracionar.</div>
    ${m.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${esc(m.viabilidade.nota)}</div>` : ''}
    ${cindy}

    <h4>Miolo <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— mesmo para todos os níveis</span></h4>
    <div class="tbl-scroll"><table class="t-niveis">
      <thead><tr><th>#</th><th>Exercício</th><th class="nv">Reps</th></tr></thead>
      <tbody>${blocos}</tbody></table></div>

    <h4>Por nível <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— cardio em CADA ponta e regra de execução</span></h4>
    <div class="tbl-scroll"><table class="t-niveis">
      <thead><tr><th>Nível</th><th>Cardio (abre e fecha)</th><th>Execução das ${m.totalReps} reps</th><th>Tempo</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <small class="mut">⏱ Tempos são estimativa — o Murph é cronometrado, o número acima é só para dimensionar a aula.</small>
  </article>`;
}

const WOD_GRUPO_LABEL = { peso: '🏋 Peso', corporal: '🤸 Corporal', monoestrutural: '🏃 Monoestrutural' };

/**
 * Card do treino HÍBRIDO — Mobilidade → Hipertrofia (postos de bi-set antagonista) →
 * WOD, gerado dinamicamente a cada geração (sem exercícios fixos).
 * @param {any} h  estrutura de core/hibrido.js (mobilidade, hipertrofia, wod, duracaoSeg, semanaRotulo)
 * @param {string} [dia]
 */
export function renderHibrido(h, dia, manual = false) {
  // Compat: treino Híbrido salvo antes da virada p/ postos de bi-set — `hipertrofia`
  // era uma lista PLANA de exercícios (`nome`/`niveis`), sem `a`/`b`. Sem este ramo,
  // `lado()` tenta ler `.niveis` de um posto que não existe e quebra ao reabrir o dia.
  const legado = h.hipertrofia.length && !h.hipertrofia[0].a;
  if (legado) {
    const mob = h.mobilidade.map((m) => `<li>${m.nome} — ${mmss(m.duracaoSeg)}</li>`).join('');
    const hiperRows = h.hipertrofia.map((item, i) => linhaNiveis(i, item, '', '')).join('');
    const wodMovs = h.wod.movimentos.map((m) => `<li><b>${m.nome}</b> <span class="mut">${WOD_GRUPO_LABEL[m.grupo] || m.grupo}</span> — ${m.prescricao}</li>`).join('');
    const durMin = Math.round(h.duracaoSeg / 60);
    return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}Híbrido${h.splitLabel ? ` — ${h.splitLabel}` : ''}${seloManual(manual)}</h3>
    <div class="hyrox-fmt">3 blocos: Mobilidade → Hipertrofia → WOD (${h.wod.duracaoMin}min).</div>
    ${h.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${h.viabilidade.nota}</div>` : ''}

    <h4>Mobilidade</h4>
    <ul class="aquec">${mob}</ul>

    <h4>Parte 1 — Hipertrofia <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— série × carga por nível</span></h4>
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

  const mob = h.mobilidade.map((m) => `<li>${m.nome} — ${mmss(m.duracaoSeg)}</li>`).join('');
  const mobMin = Math.round(h.mobilidade.reduce((a, m) => a + m.duracaoSeg, 0) / 60);

  /** 'iniciante' e 'intermediario' começam com a mesma letra — abreviar em 1 char confundiria as duas. */
  const NIVEL_ABREV = { iniciante: 'Ini', intermediario: 'Int', avancado: 'Avç' };

  const lado = (ex, p) => {
    const v = ex.niveis || variantesNivel(ex, p.series, 'hibrido', { seriesFixas: true });
    const cargas = ['iniciante', 'intermediario', 'avancado']
      .map((n) => `<span class="mut">${NIVEL_ABREV[n]}:</span> ${v[n].carga}`).join(' · ');
    return `<div class="hib-lado"><b>${ex.nome || ex}</b><div class="mut">${cargas}</div></div>`;
  };

  const postos = h.hipertrofia.map((p, i) => `
    <div class="hib-posto">
      <div class="hib-posto-h"><b>Posto ${i + 1} — ${p.parLabel}</b>
        <span class="mut">${p.series} × ${p.reps} reps · ${p.descansoSeg}s de pausa · ~${p.pctRM}% 1RM</span></div>
      ${lado(p.a, p)}
      <div class="hib-biset mut">↕ bi-set — uma faz A enquanto a outra faz B, trocam a cada série</div>
      ${lado(p.b, p)}
      ${p.tecnica ? `<div class="hib-tec">⚡ ${p.tecnica.detalhe}</div>` : ''}
    </div>`).join('');

  const wodMovs = h.wod.movimentos.map((m) => `<li><b>${m.nome}</b> <span class="mut">${WOD_GRUPO_LABEL[m.grupo] || m.grupo}</span> — ${m.prescricao}</li>`).join('');
  const durMin = Math.round(h.duracaoSeg / 60);
  return `<article class="card">
    <h3>${dia ? dia.toUpperCase() + ' · ' : ''}Híbrido${h.semanaRotulo ? ` — ${h.semanaRotulo}` : ''}${seloManual(manual)}</h3>
    <div class="hyrox-fmt">3 blocos: Mobilidade (${mobMin}min) → Hipertrofia (${h.hipertrofia.length} postos de bi-set) → WOD (${h.wod.duracaoMin}min).</div>
    ${h.viabilidade?.nota ? `<div class="mut" style="margin:6px 0 2px">${h.viabilidade.nota}</div>` : ''}

    <h4>Mobilidade <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${mobMin} min</span></h4>
    <ul class="aquec">${mob}</ul>

    <h4>Parte 1 — Hipertrofia <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— 1 dupla por posto, sem fila</span></h4>
    <div class="hib-postos">${postos}</div>

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
  if (t.murph) return renderMurph(t.murph, mostrarDiaSemana ? t.dia : undefined);
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
    const acoes = `<button class="btn ghost sm swap" data-card="${id}" data-idx="${i}">trocar</button>
      <button class="btn ghost sm swap-livre" data-card="${id}" data-idx="${i}" title="Trocar por qualquer exercício do catálogo, mesmo de outro padrão">troca livre</button>`;
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
  // O selo "manual" precisa chegar aos formatos estruturados também: desde que o
  // Treino Manual passou a montá-los, um HIIT feito à mão e um sorteado ficam
  // idênticos no histórico, e o coach não tem como saber qual foi qual.
  const man = Boolean(d.manual);
  if (d.hyrox) return renderHyrox(d.hyrox, d.dia, man); // Hyrox é template fixo (sem "trocar")
  if (d.hiit) return renderHiit(d.hiit, d.dia, man);    // HIIT é template TABATA (sem "trocar")
  if (d.gap) return renderGap(d.gap, d.dia, man);       // GAP é aula estruturada (sem "trocar")
  if (d.hibrido) return renderHibrido(d.hibrido, d.dia, man); // Híbrido é gerado (sem "trocar" nesta leva)
  if (d.murph) return renderMurph(d.murph, d.dia, man);       // Murph é desafio fixo (sem "trocar")
  // A edição do dia salvo é sempre sobre o formato plano — os estruturados já
  // retornaram acima. `diaEditavel` confirma antes de oferecer os botões.
  const podeEditar = editavel && diaEditavel(d);
  const acoesDe = (i) => podeEditar
    ? `<button class="btn ghost sm swap-dia" data-idx="${i}">trocar</button>
       <button class="btn ghost sm swap-dia-livre" data-idx="${i}" title="Trocar por qualquer exercício do catálogo">troca livre</button>`
    : '';
  const altsDe = (i) => podeEditar ? `<div class="alts" id="alts-dia-${i}"></div>` : '';
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

  // Aquecimento: o Treino Manual sempre salvou; o automático passou a salvar
  // também. Snapshot antigo (gerado antes disso) simplesmente não tem — some.
  const totalAquec = (d.aquecimento || []).reduce((a, x) => a + (x.duracaoSeg || 0), 0);
  const aquec = d.aquecimento?.length
    ? `<h4>Aquecimento / Mobilidade <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${d.aquecimento.length} exercícios · ${mmss(totalAquec)}</span></h4>
       <ul class="aquec">${d.aquecimento.map((a) => {
         const alvo = a.musculosAlvo?.length ? ` <span class="mut">(${a.musculosAlvo.map((m) => MUSCULO_LABEL[m] || m).join(', ')})</span>` : '';
         return `<li>${esc(a.nome)} — <b>${a.duracaoSeg}s</b>${alvo}</li>`;
       }).join('')}</ul>`
    : '';

  // Tempos: só existem em snapshot novo. Ajudam a dimensionar a aula no quadro.
  const t = d.tempos;
  const tempos = t
    ? `<div class="tempos">🔥 aquec ${mmss(t.aquecimentoSeg)} · 🏋️ principal ${mmss(t.principalSeg)} · ⏱ total ~${mmss(t.totalSeg)} <span class="mut">(ref. intermediário)</span></div>`
    : '';

  // As técnicas do dia, com o texto do que fazer. O selo na linha do exercício
  // guarda a explicação num `title` — que não serve para quem está copiando no
  // quadro, e nem existe no celular.
  const comTecnica = (d.exercicios || []).filter((e) => e.tecnica?.detalhe);
  const tecnicas = comTecnica.length
    ? `<h4>Técnicas do dia</h4><ul class="aquec">${comTecnica.map((e) =>
        `<li><b>${esc(e.tecnica.label || e.tecnica.tipo)}</b> em ${esc(e.nome)} — <span class="mut">${esc(e.tecnica.detalhe)}</span></li>`).join('')}</ul>`
    : '';

  // Um dia gerado e depois editado à mão não pode parecer igual a um gerado.
  const selosEdicao = (d.trocas?.length)
    ? ` <span class="chip warn" title="${esc(d.trocas.map((t) => `${t.de} → ${t.para}`).join(' · '))}">${d.trocas.length} troca${d.trocas.length > 1 ? 's' : ''}</span>`
    : '';

  return `<article class="card">
    <h3>${d.dia.toUpperCase()} · ${MODALIDADES[d.modalidade]?.nome || d.modalidade}${d.manual ? ' <span class="chip acc">manual</span>' : ''}${selosEdicao}</h3>
    <div>${viab}</div>
    ${tempos}
    ${aquec}
    ${corpo}
    ${tecnicas}
    ${fin}</article>`;
}

/**
 * Liga a edição do dia salvo dentro do modal.
 *
 * Diferente de `ativarTrocas`, aqui não há treino vivo em memória: cada troca
 * produz um snapshot NOVO, que quem chama precisa gravar e republicar. Por isso
 * `aoTrocar` é obrigatório — sem ele a tela mostraria uma coisa e o histórico
 * guardaria outra.
 *
 * @param {HTMLElement} raiz  Container do card (o corpo do modal)
 * @param {() => any} snapAtual  Devolve o snapshot em tela no momento do clique
 * @param {(novo:any) => void} aoTrocar  Recebe o snapshot já com a troca aplicada
 */
export function ativarEdicaoDia(raiz, snapAtual, aoTrocar) {
  raiz.addEventListener('click', (ev) => {
    const alvo = /** @type {HTMLElement} */ (ev.target);

    const btn = alvo.closest('.swap-dia, .swap-dia-livre');
    if (btn) {
      const idx = Number(/** @type {HTMLElement} */ (btn).dataset.idx);
      const livre = btn.classList.contains('swap-dia-livre');
      const box = raiz.querySelector(`#alts-dia-${idx}`);
      if (!box) return;
      if (box.childElementCount) { box.innerHTML = ''; return; } // toggle
      const cands = alternativasDoDia(snapAtual(), idx, { livre });
      box.innerHTML = livre
        ? seletorCandidatos(cands, snapAtual().exercicios[idx].padrao, idx)
        : (cands.length
          ? cands.map((c) => `<button class="btn ghost sm alt-dia" data-idx="${idx}" data-ex="${esc(c.exercicio.id)}">${esc(c.exercicio.nome)}</button>`).join('')
          : '<small>sem alternativas viáveis do mesmo padrão — use a troca livre</small>');
      return;
    }

    const alt = alvo.closest('.alt-dia');
    if (alt) {
      const idx = Number(/** @type {HTMLElement} */ (alt).dataset.idx);
      const id = /** @type {HTMLElement} */ (alt).dataset.ex;
      const c = alternativasDoDia(snapAtual(), idx).find((x) => x.exercicio.id === id);
      if (c) aoTrocar(c.exercicio, idx);
    }
  });

  raiz.addEventListener('change', (ev) => {
    const sel = /** @type {HTMLSelectElement} */ (ev.target).closest('.alt-dia-livre');
    if (!sel || !sel.value) return;
    const idx = Number(sel.dataset.idx);
    const c = alternativasDoDia(snapAtual(), idx, { livre: true }).find((x) => x.exercicio.id === sel.value);
    if (c) aoTrocar(c.exercicio, idx);
  });
}

/** Select da troca livre, agrupado por padrão e com o custo de cada escolha à vista. */
function seletorCandidatos(cands, padraoAtual, idx) {
  if (!cands.length) return '<small>catálogo sem outro exercício disponível</small>';
  /** @type {Record<string, any[]>} */
  const porPadrao = {};
  for (const c of cands) (porPadrao[c.exercicio.padrao] = porPadrao[c.exercicio.padrao] || []).push(c);

  const ordem = PADROES.filter((p) => porPadrao[p]?.length);
  if (porPadrao[padraoAtual]) { ordem.splice(ordem.indexOf(padraoAtual), 1); ordem.unshift(padraoAtual); }

  const grupos = ordem.map((p) => {
    const opts = porPadrao[p]
      .sort((a, b) => a.exercicio.nome.localeCompare(b.exercicio.nome, 'pt'))
      .map((c) => {
        const avisos = [];
        if (!c.viavel) avisos.push('⚠ aparelho');
        if (!c.naModalidade) avisos.push('fora da modalidade');
        return `<option value="${esc(c.exercicio.id)}">${esc(c.exercicio.nome)}${avisos.length ? ` · ${avisos.join(' · ')}` : ''}</option>`;
      }).join('');
    return `<optgroup label="${PADRAO_LABEL[p] || p}${p === padraoAtual ? ' — mantém o padrão' : ''}">${opts}</optgroup>`;
  }).join('');

  return `<select class="man-sel alt-dia-livre" data-idx="${idx}" style="margin-top:6px">
      <option value="">— escolha o exercício —</option>${grupos}
    </select>`;
}

const STATUS_SEMANA = {
  fechada: { chip: 'ok', selo: '✓ fechada' },
  incompleta: { chip: 'falta', selo: '○ incompleta' },
  desequilibrada: { chip: 'warn', selo: '⚠ desequilibrada' },
  vazia: { chip: '', selo: '—' },
};

/**
 * Semana a semana do mês exibido: quanto foi trabalhado de cada padrão, se a
 * semana fechou, e o que fazer a respeito.
 *
 * Existe para responder à pergunta que aparece depois de editar um dia salvo —
 * "quebrei a estrutura da semana?" — sem o coach ter que somar na cabeça.
 * @param {string} mesId @param {any[]} treinosDoMes
 */
export function renderAnaliseSemanal(mesId, treinosDoMes) {
  const semanas = agruparPorSemana(mesId, treinosDoMes);
  if (!semanas.length) return '';

  const cobrados = PADROES.filter((p) => (MINIMO_SEMANAL[p] || 0) > 0);

  const blocos = semanas.map(({ rotulo, treinos }) => {
    const a = analisarSemana(treinos);
    const st = STATUS_SEMANA[a.status];
    const barras = cobrados.map((p) => {
      const val = Math.round(a.volPorPadrao[p]);
      const meta = MINIMO_SEMANAL[p];
      const ok = val >= meta;
      const pct = Math.min(100, meta ? (val / meta) * 100 : 0);
      return `<div class="meta-row">
        <span class="meta-lbl">${PADRAO_LABEL[p] || p}</span>
        <span class="meta-bar"><span class="${ok ? 'ok' : ''}" style="width:${pct}%"></span></span>
        <span class="meta-val ${ok ? 'ok' : 'mut'}">${val}/${meta}</span>
      </div>`;
    }).join('');

    return `<div class="sem-bloco">
      <div class="sem-h">
        <b>${esc(rotulo)}</b>
        <span>
          <span class="chip">${treinos.length} treino${treinos.length > 1 ? 's' : ''}</span>
          <span class="chip ${st.chip}">${st.selo}</span>
        </span>
      </div>
      ${barras}
      ${a.recomendacao ? `<div class="sem-rec">💡 ${esc(a.recomendacao)}</div>` : ''}
    </div>`;
  }).join('');

  return `<article class="card">
    <h4>Semana a semana <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— séries por padrão vs. o mínimo semanal</span></h4>
    ${blocos}
  </article>`;
}

/**
 * Fechamento do mês. O painel semanal mostra cada semana isolada; este mostra o
 * acumulado, que é onde um déficit pequeno e repetido aparece.
 * @param {string} mesId @param {any[]} treinosDoMes
 */
export function renderAnaliseMensal(mesId, treinosDoMes) {
  const m = analisarMes(mesId, treinosDoMes);
  if (!m.nTreinos) return '';

  const metas = m.metas.map((x) => {
    const ok = x.tem >= x.meta;
    const pct = Math.min(100, x.pct);
    return `<div class="meta-row">
      <span class="meta-lbl">${PADRAO_LABEL[x.padrao] || x.padrao}</span>
      <span class="meta-bar"><span class="${ok ? 'ok' : ''}" style="width:${pct}%"></span></span>
      <span class="meta-val ${ok ? 'ok' : 'mut'}">${Math.round(x.tem)}/${x.meta} · ${x.pct}%</span>
    </div>`;
  }).join('');

  const mods = Object.entries(m.porModalidade)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `<span class="chip acc">${esc(MODALIDADES[id]?.nome || id)} ${n}</span>`).join('');

  const nome = (p) => PADRAO_LABEL[p] || p;
  // A amplitude é a diferença entre o campeão e o esquecido em pontos da meta.
  // Acima de 100pp um está com o dobro do outro — aí é estrutura, não variação.
  const desequilibrio = m.amplitude >= 100
    ? `<div class="sem-rec">⚠ <b>${esc(nome(m.maisTrabalhado.padrao))}</b> está em ${m.maisTrabalhado.pct}% da meta e <b>${esc(nome(m.menosTrabalhado.padrao))}</b> em ${m.menosTrabalhado.pct}% — ${m.amplitude} pontos de diferença. O mês pendeu para um lado; equilibre no próximo mesociclo.</div>`
    : `<div class="sem-rec">✓ Distribuição equilibrada: ${m.amplitude} pontos entre o padrão mais e o menos trabalhado.</div>`;

  return `<article class="card">
    <h4>Fechamento do mês <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— ${esc(rotuloDeMes(mesId))}</span></h4>

    <div class="mes-numeros">
      <div class="mes-num"><b>${m.nTreinos}</b><span>treinos</span></div>
      <div class="mes-num"><b>${m.nSemanas}</b><span>semana${m.nSemanas > 1 ? 's' : ''}</span></div>
      <div class="mes-num"><b>${m.mediaPorSemana}</b><span>por semana</span></div>
      <div class="mes-num"><b>${m.semanasFechadas}/${m.nSemanas}</b><span>fechadas</span></div>
    </div>

    <h4>Modalidades</h4>
    <div class="man-dist">${mods}</div>

    <h4>Volume do mês <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">— mínimo semanal × ${m.nSemanas} semana${m.nSemanas > 1 ? 's' : ''} com treino</span></h4>
    ${metas}
    ${desequilibrio}
  </article>`;
}

/** Rótulo 'Setembro/2026' — mesma regra de store.rotuloMes, sem depender dele. */
function rotuloDeMes(mesId) {
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const [ano, m] = mesId.split('-').map(Number);
  return `${MESES[m - 1]}/${ano}`;
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

/**
 * Delegação de cliques para os botões "trocar" e as alternativas.
 *
 * `aplicarTroca` devolve um treino NOVO — não altera o recebido. O card em tela
 * passa a mostrar esse novo (é o que fica em `vivos`), mas quem chamou
 * `renderTreino` continua com a referência antiga na mão. Sem o `aoTrocar`, o
 * treino que vai para o histórico e para o Portal é o gerado antes das trocas,
 * e nada avisa: a tela mostra uma coisa e o aluno recebe outra.
 *
 * @param {HTMLElement} raiz
 * @param {(treino:any)=>void} [aoTrocar] recebe o treino já com a troca aplicada
 */
export function ativarTrocas(raiz, aoTrocar) {
  /** Aplica a troca e redesenha o card. @param {string} card @param {number} idx @param {any} novo */
  const trocar = (card, idx, novo) => {
    const atualizado = aplicarTroca(vivos.get(card), idx, novo);
    vivos.set(card, atualizado);
    document.getElementById(card).innerHTML = corpoTreino(card);
    if (aoTrocar) aoTrocar(atualizado);
  };

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

    const livre = ev.target.closest('.swap-livre');
    if (livre) {
      const { card, idx } = livre.dataset;
      const box = document.getElementById(`${card}-alts-${idx}`);
      if (box.childElementCount) { box.innerHTML = ''; return; } // toggle
      box.innerHTML = seletorLivre(vivos.get(card), Number(idx), card);
      return;
    }
    return;
  });

  // O catálogo inteiro são centenas de exercícios: vira `<select>` agrupado por
  // padrão, não uma fileira de botões que ninguém consegue percorrer.
  raiz.addEventListener('change', (ev) => {
    const sel = ev.target.closest('.alt-livre');
    if (!sel || !sel.value) return;
    const { card, idx } = sel.dataset;
    const novo = alternativasLivres(vivos.get(card), Number(idx)).find((c) => c.exercicio.id === sel.value);
    if (novo) trocar(card, Number(idx), novo.exercicio);
  });

  raiz.addEventListener('click', (ev) => {
    const alt = ev.target.closest('.alt');
    if (!alt) return;
    const { card, idx, ex } = alt.dataset;
    const novo = alternativasViaveis(vivos.get(card), Number(idx)).find((e) => e.id === ex);
    if (novo) trocar(card, Number(idx), novo);
  });
}

/**
 * Select da troca livre: todo o catálogo, agrupado por padrão de movimento e com
 * cada candidato etiquetado pelo que a troca custa — aparelho que não comporta a
 * turma, exercício de fora da modalidade, mudança do padrão que o slot cobria.
 * Nada é bloqueado; a etiqueta é para o coach decidir com a informação na mão.
 */
function seletorLivre(treino, idx, card) {
  const cands = alternativasLivres(treino, idx);
  if (!cands.length) return '<small>catálogo sem outro exercício disponível</small>';

  /** @type {Record<string, typeof cands>} */
  const porPadrao = {};
  for (const c of cands) (porPadrao[c.exercicio.padrao] = porPadrao[c.exercicio.padrao] || []).push(c);

  // O padrão que este slot cobre hoje vem primeiro: é a troca que NÃO desequilibra.
  const atual = treino.principal[idx].exercicio.padrao;
  const ordem = PADROES.filter((p) => porPadrao[p]?.length);
  if (porPadrao[atual]) { ordem.splice(ordem.indexOf(atual), 1); ordem.unshift(atual); }

  const grupos = ordem.map((p) => {
    const opts = porPadrao[p]
      .sort((a, b) => a.exercicio.nome.localeCompare(b.exercicio.nome, 'pt'))
      .map((c) => {
        const avisos = [];
        if (!c.viavel) avisos.push('⚠ aparelho');
        if (!c.naModalidade) avisos.push('fora da modalidade');
        return `<option value="${esc(c.exercicio.id)}">${esc(c.exercicio.nome)}${avisos.length ? ` · ${avisos.join(' · ')}` : ''}</option>`;
      }).join('');
    const selo = p === atual ? ' — mantém o padrão' : '';
    return `<optgroup label="${PADRAO_LABEL[p] || p}${selo}">${opts}</optgroup>`;
  }).join('');

  return `<select class="man-sel alt-livre" data-card="${card}" data-idx="${idx}" style="margin-top:6px">
      <option value="">— escolha o exercício —</option>${grupos}
    </select>
    <small class="mut" style="display:block;margin-top:4px">Trocar para outro padrão muda a cobertura do dia — o volume por grupamento recalcula sozinho e a meta da semana acompanha.</small>`;
}
