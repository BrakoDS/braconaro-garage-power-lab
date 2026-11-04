// @ts-check
/**
 * SEMANA DO BOX — aba Quadro: o HTML, sem DOM (o teste roda no Node).
 *
 * A tela tem duas partes: os 3 quadros (onde o coach escreve, como no quadro
 * branco do box) e a conferência ao lado. Os `<textarea>` são desenhados UMA vez
 * por semana (`renderQuadroBase`); a cada tecla só a leitura de cada coluna e a
 * conferência são redesenhadas — redesenhar o texto tiraria o cursor do lugar.
 */
import { ROTULO_MUSCULO } from '../core/catalogo.js';
import {
  CAMINHOS, DIAS, EXTRAS, NOME_DIA, NOME_PADRAO_H, NOME_RECURSO, NOME_TIPO_SECAO, PADROES_H, QUADROS, SECOES_SEM_CONTA,
  chaveApelido, metasDaSemana, volumeDoCaminho,
} from '../core/quadro.js';
import { esc } from './render.js';

/** @typedef {ReturnType<typeof import('../core/quadro.js').conferirSemana>} Conferencia */

const EXEMPLO_H = `A) Mobilidade
B) Principal 3x 8-10 reps 1' pausa
Agachamento Smith
Supino reto Smith
Mesa flexora
…`;
/** @type {Record<string, string>} */
const EXEMPLO_METABOLICO = {
  Cross: `A) Mobilidade
B) Aquecimento
10x Abs crunch
C) Força: Desenvolvimento + Stiff
5x 8-10
D) WOD 18m AMRAP
12x Abs remador
200m corrida`,
  Hyrox: `Hyrox
1000m SkiErg
50m Sled Push
…`,
  HIIT: `Tabata 2 músicas
4x Burpee
4x Kettlebell swing
…`,
};
const EXEMPLO_EXTRA = { GAP: 'GAP Tabata 20/10\n1 música aquecimento, 3 perna, 4 glúteo, 3 abs\ncada música 8 rounds', Murph: 'Murph\n1600m corrida\n100x Puxada aberta pronada\n200x Flexão\n300x Air squat\n1600m corrida' };

/** @type {Record<string, string>} */
const ROTULO_TIPO = { erro: 'Não cabe', falta: 'Falta para a semana', repete: 'Repetição', duvida: 'Confirmar o nome', info: 'Avisos' };
const ORDEM_TIPO = ['erro', 'falta', 'repete', 'duvida', 'info'];

/** Onde um problema está, para o coach achar ("Quadro 1 · H1"). @param {string} onde @param {Conferencia} conf */
export function rotuloDeOnde(onde, conf) {
  if (onde === 'extra') return conf.colunas.extra?.aula ?? 'Extra';
  const [q, lado] = onde.split('.');
  const quadro = QUADROS.find((x) => x.id === q);
  if (!quadro) return onde;
  return `${quadro.nome} · ${lado === 'h' ? quadro.h : quadro.metabolico}`;
}

/**
 * A estrutura da aba para uma semana: navegação, os 3 quadros com os textos e o
 * lugar da conferência.
 * @param {{semanaId: string, rotulo: string, textos: {quadros: Record<string, {h: string, metabolico: string}>, extra: {tipo: string|null, dia: string, texto: string}}, nomesCatalogo: string[]}} e
 */
export function renderQuadroBase(e) {
  const extra = e.textos.extra;
  const quadros = QUADROS.map((q) => {
    const t = e.textos.quadros[q.id] ?? { h: '', metabolico: '' };
    const dias = q.dias.map((d) => NOME_DIA[d]).join(' e ');
    return `<article class="qs-card" aria-label="${esc(q.nome)}">
  <header class="qs-cab"><b>${esc(q.nome)}</b> <span class="mut">· ${esc(dias)}</span></header>
  <div class="qs-colunas">
    ${coluna(`${q.id}.h`, q.h, `${dias}`, t.h, EXEMPLO_H)}
    ${coluna(`${q.id}.m`, q.metabolico, NOME_DIA[q.diaMetabolico], t.metabolico, EXEMPLO_METABOLICO[q.metabolico] ?? '')}
  </div>
</article>`;
  }).join('\n');

  const opcoesTipo = ['', ...EXTRAS].map((x) => `<option value="${esc(x)}"${(extra.tipo ?? '') === x ? ' selected' : ''}>${x ? esc(x) : 'Nenhuma nesta semana'}</option>`).join('');
  const opcoesDia = DIAS.map((d) => `<option value="${d}"${extra.dia === d ? ' selected' : ''}>${esc(NOME_DIA[d])}</option>`).join('');
  const extraHtml = `<article class="qs-card qs-extra" aria-label="Aula do mês">
  <header class="qs-cab"><b>Aula do mês</b> <span class="mut">· GAP ou Murph, quando cai nesta semana</span></header>
  <div class="qs-extra-campos">
    <label>Aula <select data-extra="tipo">${opcoesTipo}</select></label>
    <label>Dia <select data-extra="dia"${extra.tipo ? '' : ' disabled'}>${opcoesDia}</select></label>
  </div>
  ${extra.tipo ? coluna('extra', extra.tipo, NOME_DIA[extra.dia] ?? '', extra.texto, /** @type {any} */ (EXEMPLO_EXTRA)[extra.tipo] ?? '') : ''}
</article>`;

  return `<div class="qs-barra">
  <button class="btn ghost" type="button" data-quadro-semana="-1" aria-label="Semana anterior">‹</button>
  <strong class="cal-titulo">${esc(e.rotulo)}</strong>
  <button class="btn ghost" type="button" data-quadro-semana="1" aria-label="Semana seguinte">›</button>
  <button class="btn ghost" type="button" data-quadro-semana="0">Esta semana</button>
  <span id="quadro-salvo" class="qs-salvo mut" role="status" aria-live="polite"></span>
</div>
<p class="mut intro">Escreva como no quadro do box. Ao lado, a conferência da semana: o que não cabe, o que falta
para fechar 7 × 3 em cada H, o que se repete e os nomes para confirmar. Nada aqui chega ao aluno ainda.</p>
<div class="qs-layout">
  <div class="qs-lista">${quadros}${extraHtml}</div>
  <aside id="quadro-conferencia" class="qs-conferencia" aria-label="Conferência da semana"></aside>
</div>
<datalist id="quadro-catalogo">${e.nomesCatalogo.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
}

/** @param {string} id @param {string} aula @param {string} dias @param {string} texto @param {string} exemplo */
function coluna(id, aula, dias, texto, exemplo) {
  const dom = id.replace('.', '-');
  return `<div class="qs-coluna">
  <label class="qs-rotulo" for="quadro-${dom}"><b>${esc(aula)}</b> <span class="mut">${esc(dias)}</span></label>
  <textarea id="quadro-${dom}" class="qs-texto" data-col="${esc(id)}" spellcheck="false" rows="12" placeholder="${esc(exemplo)}">${esc(texto)}</textarea>
  <div class="qs-leitura" id="leitura-${dom}" aria-live="polite"></div>
</div>`;
}

/* ───────────────────────── a leitura de uma coluna ───────────────────────── */

/**
 * O que o sistema entendeu de uma coluna, linha a linha: as seções, cada
 * exercício reconhecido (ou a pergunta, quando não reconheceu) e os avisos
 * daquela linha.
 * @param {string} onde @param {Conferencia} conf
 */
export function renderLeitura(onde, conf) {
  const c = conf.colunas[onde];
  if (!c) return '';
  if (c.vazia) return '<p class="mut qs-dica">A leitura aparece aqui enquanto você escreve.</p>';
  const daColuna = conf.problemas.filter((p) => p.onde === onde);
  /** @type {string[]} */
  const partes = [];
  for (const s of c.secoes) {
    const itens = c.itens.filter((i) => i.secao === s);
    if (!s.titulo && !itens.length && !s.musicas.length) continue;
    const detalhe = [
      NOME_TIPO_SECAO[s.tipo] ?? s.tipo,
      s.formato, s.minutos ? `${s.minutos} min` : '', s.rodadas ? `${s.rodadas} rodadas` : '',
      s.series ? `${s.series}×${s.reps ?? ''}` : '', s.descansoSeg ? `pausa ${s.descansoSeg} s` : '',
    ].filter(Boolean).join(' · ');
    const semConta = SECOES_SEM_CONTA.includes(s.tipo);
    partes.push(`<div class="ql-secao${semConta ? ' ql-sem-conta' : ''}"><b>${esc(s.letra || '•')}</b> ${esc(detalhe)}${semConta ? ' <span class="mut">(não conta volume)</span>' : ''}</div>`);
    for (const i of itens) partes.push(renderItem(i, daColuna.filter((p) => p.linha === i.linha && p.tipo !== 'duvida'), conf));
    for (const m of s.musicas) {
      partes.push(`<div class="ql-item"><span class="ql-chip ok">${esc(m.n)} × ${esc(m.grupo)}</span></div>`);
    }
  }
  const resumo = c.onde.endsWith('.h')
    ? (() => {
      const meta = metasDaSemana(conf).find((x) => x.aula === c.aula);
      return meta ? `${contador(meta.exercicios, meta.metaExercicios, 'exercícios')} · ${contador(meta.series, meta.metaSeries, 'séries')} · ${contador(meta.padroes, meta.metaPadroes, 'padrões')}` : '';
    })()
    : `${somaSeries(c.seriesPorId).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} séries equivalentes`;
  const tempo = c.minutos ? ` · ≈ ${Math.round(c.minutos)} min` : '';
  const soltos = daColuna.filter((p) => p.linha === undefined || !c.itens.some((i) => i.linha === p.linha));
  return `<div class="ql-resumo">${resumo}${tempo}</div>
${partes.join('\n')}
${soltos.map((p) => `<div class="ql-aviso ql-${p.tipo}">${esc(p.texto)}</div>`).join('\n')}`;
}

/** @param {number} n @param {number} meta @param {string} nome */
const contador = (n, meta, nome) => `<span class="${n === meta ? 'ok' : 'warn'}">${n}/${meta} ${nome}</span>`;
/** @param {Record<string, number>} s */
const somaSeries = (s) => Object.values(s).reduce((a, b) => a + b, 0);

/** @param {any} i @param {import('../core/quadro.js').Problema[]} avisos @param {Conferencia} conf */
function renderItem(i, avisos, conf) {
  const k = esc(chaveApelido(i.escrito));
  const qtd = i.series && i.secao.tipo === 'forca' ? ` <span class="mut">${esc(i.series)} séries</span>` : '';
  let chip;
  if (i.item) {
    chip = `<button class="ql-chip ok" type="button" data-trocar="${k}" title="Trocar o exercício">${esc(i.item.nome)}</button>${qtd}`;
  } else if (i.leitura.como === 'fora') {
    chip = `<button class="ql-chip fora" type="button" data-trocar="${k}" title="Fora do catálogo: não conta volume. Trocar">${esc(i.escrito)} · fora do catálogo</button>`;
  } else {
    const sug = i.leitura.sugestoes.map((/** @type {{id: string, nome: string}} */ s) => `<button class="ql-sug" type="button" data-apelido="${k}" data-id="${esc(s.id)}">${esc(s.nome)}</button>`).join('');
    chip = `<span class="ql-chip duvida">“${esc(i.escrito)}” é…</span> ${sug}
      <input class="ql-outro" list="quadro-catalogo" placeholder="outro…" data-apelido-input="${k}" aria-label="Outro exercício para ${esc(i.escrito)}" />
      <button class="ql-sug fora" type="button" data-apelido="${k}" data-id="-">não está no catálogo</button>`;
  }
  const alt = i.alternativas.length ? ` <span class="mut">ou ${esc(i.alternativas.join(', '))}</span>` : '';
  return `<div class="ql-item${i.conta ? '' : ' ql-sem-conta'}">${chip}${alt}${avisos.map((p) => `<div class="ql-aviso ql-${p.tipo}">${esc(p.texto)}</div>`).join('')}</div>`;
}

/* ───────────────────────── a conferência ───────────────────────── */

/**
 * O painel ao lado: os avisos por tipo, os 7 padrões de cada H, o equipamento
 * de cada dia e o volume (por aula ou pelo caminho do aluno).
 * @param {Conferencia} conf @param {{caminho: string}} vista
 */
export function renderConferencia(conf, vista) {
  const n = (/** @type {string} */ t) => conf.problemas.filter((p) => p.tipo === t).length;
  const contadores = ORDEM_TIPO.filter((t) => t !== 'info').map((t) => `<span class="qc-n qc-${t}${n(t) ? '' : ' zero'}">${n(t)} <small>${esc(ROTULO_TIPO[t])}</small></span>`).join('');

  const grupos = ORDEM_TIPO.map((t) => {
    const lista = conf.problemas.filter((p) => p.tipo === t);
    if (!lista.length) return '';
    // A mesma repetição aparece nas duas colunas (para marcar as duas linhas); aqui, uma vez só.
    const unicos = [...new Map(lista.map((p) => [p.texto, p])).values()];
    return `<details class="qc-grupo qc-${t}" data-grupo="${t}"${t === 'info' ? '' : ' open'}>
  <summary>${esc(ROTULO_TIPO[t])} <span class="mut">(${unicos.length})</span></summary>
  <ul>${unicos.map((p) => `<li><button class="qc-ir" type="button" data-ir="${esc(p.onde)}" data-linha="${p.linha ?? ''}">${esc(rotuloDeOnde(p.onde, conf))}</button> ${esc(p.texto)}</li>`).join('')}</ul>
</details>`;
  }).join('\n');

  const padroes = `<table class="qc-tabela">
  <caption>Os 7 padrões de cada H</caption>
  <thead><tr><th></th>${QUADROS.map((q) => `<th>${q.h}</th>`).join('')}</tr></thead>
  <tbody>${PADROES_H.map((p) => `<tr><th>${esc(NOME_PADRAO_H[p])}</th>${QUADROS.map((q) => {
    const nomes = conf.padroesH[q.h]?.[p] ?? [];
    return `<td class="${nomes.length ? (nomes.length > 1 ? 'warn' : 'ok') : 'falta'}">${nomes.length ? esc(nomes.map(curto).join(' · ')) : '—'}</td>`;
  }).join('')}</tr>`).join('')}</tbody>
</table>`;

  const equipamento = `<table class="qc-tabela">
  <caption>Equipamento de cada dia <span class="mut">(turma de até 6, dividida entre as duas aulas)</span></caption>
  <tbody>${conf.equipamento.map((d) => {
    let st;
    if (d.cabeAte === null) st = d.faltas.length ? `<span class="bad">falta ${esc(d.faltas.map((f) => `${f.precisa - f.tem} ${NOME_RECURSO[f.recurso] ?? f.recurso}`).join(', '))}</span>` : '<span class="ok">cabe</span>';
    else if (!d.faltas.length) st = '<span class="ok">cabe em qualquer divisão</span>';
    else if (d.cabeAte === 0) st = `<span class="bad">não cabe: falta ${esc(d.faltas.map((f) => `${f.precisa - f.tem} ${NOME_RECURSO[f.recurso] ?? f.recurso}`).join(', '))}</span>`;
    else st = `<span class="warn">até ${d.cabeAte} no ${esc(d.aulas[1])}</span>`;
    return `<tr><th>${esc(NOME_DIA[d.dia])}</th><td>${esc(d.aulas.join(' + '))}</td><td>${st}</td></tr>`;
  }).join('')}</tbody>
</table>`;

  return `<div class="qc-contadores">${contadores}</div>
${grupos || '<p class="ok qc-tudo-certo">Nada a corrigir.</p>'}
${padroes}
${equipamento}
${renderVolume(conf, vista)}`;
}

/** "Remada aberta neutra (monocross)" → "Remada aberta neutra". @param {string} nome */
const curto = (nome) => nome.replace(/\s*\([^)]*\)/g, '').split(/\s[—–]\s/)[0];

/** @param {Conferencia} conf @param {{caminho: string}} vista */
function renderVolume(conf, vista) {
  const opcoes = [{ id: 'aulas', nome: 'Por aula' }, ...CAMINHOS].map((c) => `<button type="button" class="qc-caminho${vista.caminho === c.id ? ' ativo' : ''}" data-caminho="${c.id}">${esc(c.nome)}</button>`).join('');
  /** @type {{nome: string, v: Record<string, number>}[]} */
  let colunas;
  if (vista.caminho === 'aulas') {
    colunas = Object.entries(conf.colunas).filter(([, c]) => !c.vazia).map(([, c]) => ({ nome: c.aula, v: c.volume }));
  } else {
    const cam = CAMINHOS.find((c) => c.id === vista.caminho) ?? CAMINHOS[0];
    colunas = [{ nome: 'Na semana', v: volumeDoCaminho(conf, /** @type {any} */ (cam.aulas)) }];
    if (conf.colunas.extra && !conf.colunas.extra.vazia) colunas.push({ nome: `+ ${conf.colunas.extra.aula}`, v: volumeDoCaminho(conf, /** @type {any} */ (cam.aulas), true) });
  }
  const musculos = Object.keys(ROTULO_MUSCULO);
  const fmt = (/** @type {number|undefined} */ x) => (x ? x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '');
  const corpo = colunas.length
    ? `<table class="qc-tabela qc-volume">
  <thead><tr><th></th>${colunas.map((c) => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead>
  <tbody>${musculos.map((m) => `<tr><th>${esc(ROTULO_MUSCULO[m])}</th>${colunas.map((c) => `<td class="${c.v[m] ? '' : 'zero'}">${fmt(c.v[m]) || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
</table>`
    : '<p class="mut">O volume aparece quando houver exercício reconhecido.</p>';
  return `<section class="qc-volume-sec" aria-label="Volume">
  <h3>Volume <span class="mut">(séries equivalentes)</span></h3>
  <div class="qc-caminhos" role="group" aria-label="Volume de quem">${opcoes}</div>
  ${corpo}
</section>`;
}
