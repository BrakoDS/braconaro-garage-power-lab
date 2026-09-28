// @ts-check
/**
 * A VERSÃO DO ALUNO, calculada no aparelho dele.
 *
 * O coach publica UM treino por dia. Este módulo transforma esse dia no treino
 * daquele aluno — as séries dele, o porquê de cada diferença e o quanto ele já
 * fez de cada grupo na semana — usando os MESMOS módulos que a tela do coach:
 * `perfil-treino.js`, `metas-aluno.js`, `grupos.js`. Duas contas iguais em dois
 * lugares é como o Portal e o montador passam a mostrar números diferentes.
 *
 * Três documentos, todos que o aluno já tem permissão de ler:
 *  - `treinoPortal/{mesId}` — o treino do dia (com `id`, `grupoMuscular`, `series`);
 *  - `portal/{email}` — o perfil dele (objetivo, foco, metas);
 *  - `treinoAluno/{email}` — as exceções que o coach fez para ele.
 */
import { versaoDoAluno } from '../compartilhado/regras/perfil-treino.js';
import { metasDoAluno, focoDe } from '../compartilhado/regras/metas-aluno.js';
import { GRUPO_LABEL } from '../compartilhado/regras/grupos.js';
import { faixaDaSemana, diaSemanaDe } from '../compartilhado/regras/datas-treino.js';
import { volumePorGrupo } from '../compartilhado/regras/matriz-individualizacao.js';

const esc = (/** @type {any} */ v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (/** @type {number} */ n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** O dia é do montador individual (tem o que precisamos para calcular)? @param {any} dia */
export function ehIndividual(dia) {
  return !!dia?.individual && !!dia?.livre?.blocos?.length;
}

/**
 * O treino publicado no formato que a regra entende. `grupoMuscular` vira
 * `grupo` porque, no documento do Portal, `grupo` já é o índice de bi-set.
 * @param {any} dia
 */
export function baseDoPublicado(dia) {
  return {
    dateId: dia.dateId,
    dia: dia.dia,
    estrutura: dia.estrutura || 'musculacao',
    blocos: (dia.livre?.blocos || []).map((b) => ({
      nome: b.nome,
      exercicios: (b.exercicios || []).map((e) => ({
        id: e.id || '',
        nome: e.nome,
        padrao: e.padrao || undefined,
        grupo: e.grupoMuscular ?? null,
        series: e.series ?? e.niveis?.intermediario?.series ?? 0,
        reps: e.reps,
        descansoSeg: e.descansoSeg,
        tecnica: e.tecnica || undefined,
        travado: false, // o cadeado é do coach; para o aluno ele já virou número
      })),
    })),
  };
}

/** O perfil do aluno, a partir do documento `portal/{email}`. @param {any} portal */
export function perfilDoPortal(portal) {
  return {
    objetivo: portal?.objetivo || '',
    foco: portal?.foco || [],
    restricoes: portal?.restricoes || [],
    metas: portal?.metasGrupo || {},
  };
}

/**
 * O volume por grupo que o aluno já fez na semana, antes de `dateId`.
 *
 * Calculado dia a dia, em ordem: a versão de cada dia depende do que veio antes
 * (é assim que a redistribuição por foco decide de onde tirar série). Conta só
 * os dias que são dele — o plano da ficha, que é o que o Portal tem.
 * @param {Record<string, any>} dias  `treinoPortal/{mesId}.dias`
 * @param {string} dateId
 * @param {any} perfil
 * @param {Record<string, any>} ajustes
 * @param {string[]} [diasTreino]
 */
export function volumeDaSemana(dias, dateId, perfil, ajustes = {}, diasTreino = []) {
  const { ini, fim } = faixaDaSemana(dateId);
  /** @type {Record<string, number>} */
  const porGrupo = {};
  const anteriores = Object.keys(dias || {})
    .filter((d) => d >= ini && d < dateId && d <= fim)
    .filter((d) => !diasTreino.length || diasTreino.includes(diaSemanaDe(d)))
    .sort();
  for (const d of anteriores) {
    const dia = dias[d];
    if (!ehIndividual(dia)) continue; // dia do montador antigo: sem grupo para somar
    const v = versaoDoAluno({ base: baseDoPublicado({ ...dia, dateId: d }), perfil, feitoPorGrupo: { ...porGrupo }, excecao: ajustes[d] || null });
    for (const l of v.linhas) {
      if (!l.grupo || l.restrito) continue;
      porGrupo[l.grupo] = (porGrupo[l.grupo] || 0) + l.series;
    }
  }
  return porGrupo;
}

/**
 * O card do treino do dia, na versão do aluno.
 * @param {Object} args
 * @param {any} args.dia        o dia publicado
 * @param {string} args.dateId
 * @param {any} args.portal     documento `portal/{email}`
 * @param {Record<string, any>} [args.ajustes]  `treinoAluno/{email}.ajustes`
 * @param {Record<string, any>} [args.diasDoMes]  `treinoPortal/{mesId}.dias`
 */
export function renderVersaoDoAluno({ dia, dateId, portal, ajustes = {}, diasDoMes = {} }) {
  const perfil = perfilDoPortal(portal);
  // Mesma conta do coach, corrigida pelos mesmos números: a correção viaja no
  // documento do aluno (`portal.matriz`), então a tela dele e a da turma não
  // divergem. Documento antigo não tem `matriz` — aí vale só o derivado.
  const feitoPorGrupo = volumePorGrupo(
    portal?.matriz,
    volumeDaSemana(diasDoMes, dateId, perfil, ajustes, portal?.diasTreino || []),
  );
  const v = versaoDoAluno({ base: baseDoPublicado({ ...dia, dateId }), perfil, feitoPorGrupo, excecao: ajustes[dateId] || null });
  const metas = metasDoAluno(perfil);
  const foco = focoDe(perfil);

  const linhas = v.linhas.map((l, i) => {
    const dif = l.series !== l.seriesBase && !l.restrito;
    const presc = l.restrito
      ? '<span class="tdi-restrito">combine com o coach</span>'
      : `<b>${l.series}×</b> ${esc(l.reps || '')}${l.descansoSeg ? ` · ${l.descansoSeg}s` : ''}`;
    return `<li class="tdi-ex">
      <span class="tdi-nome">${i + 1}. ${esc(l.nome)}</span>
      <span class="tdi-presc">${presc}${dif ? ` <small>turma: ${l.seriesBase}</small>` : ''}</span>
      ${l.motivos.length ? `<span class="tdi-motivo">${l.motivos.map(esc).join(' · ')}</span>` : ''}
    </li>`;
  }).join('');

  const barras = foco.map((g) => {
    const doDia = v.linhas.filter((l) => l.grupo === g && !l.restrito).reduce((s, l) => s + l.series, 0);
    const feito = (feitoPorGrupo[g] || 0) + doDia;
    const pct = Math.min(100, Math.round((feito / metas[g]) * 100));
    return `<div class="tdi-meta">
      <span>${esc(GRUPO_LABEL[g])} <b>${num(feito)}/${metas[g]}</b> na semana</span>
      <span class="tdi-barra"><span style="width:${pct}%"></span></span>
    </div>`;
  }).join('');

  const selo = foco.length
    ? `<span class="tdi-selo">seu foco: ${foco.map((g) => esc(GRUPO_LABEL[g].toLowerCase())).join(' e ')}</span>`
    : '';
  const aquecimento = (dia.aquecimento || []).length
    ? `<div class="tdi-aquec"><b>Aquecimento</b> ${dia.aquecimento.map((a) => `${esc(a.nome)}${a.duracaoSeg ? ` (${a.duracaoSeg}s)` : ''}`).join(' · ')}</div>`
    : '';
  const avisos = v.avisos.length ? `<p class="tdi-aviso">${v.avisos.map(esc).join('<br>')}</p>` : '';

  return `<div class="tdi-card">
    <div class="tdi-head"><h3>${esc(dia.modalidade || 'Treino')}</h3>${selo}</div>
    ${aquecimento}
    <ul class="tdi-lista">${linhas}</ul>
    ${avisos}
    ${barras ? `<div class="tdi-metas">${barras}</div>` : ''}
    <p class="tdi-rodape">Total do dia: <b>${num(v.total)} séries</b>${v.total !== v.totalBase ? ` · a turma faz ${num(v.totalBase)}` : ''}</p>
  </div>`;
}
