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
  CAMINHOS, DIAS, EXTRAS, MUSICAS_POR_ESTACAO, NIVEIS_HYROX, NOME_DIA, NOME_ESTACAO_HIIT, NOME_MODELO_HYROX, NOME_NIVEL_HYROX,
  NOME_PADRAO_H, NOME_RECURSO, NOME_TIPO_SECAO, PADROES_H, QUADROS, SECOES_SEM_CONTA, SLOTS_POR_ESTACAO,
  chaveApelido, corridaHyrox, metasDaSemana, quantidadesHyrox, vagasDaEstacao, volumeDoCaminho,
} from '../core/quadro.js';
import { NOME_SEM_AULA, TIPOS_SEM_AULA } from '../core/publicar-quadro.js';
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
  HIIT: `Pernas
Afundo com kettlebell
Kettlebell swing
Core
Prancha isométrica
…
Superiores
…
Cardio
Burpee
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
<div class="qs-pub" id="quadro-publicacao" aria-live="polite"></div>
<p class="mut intro">Escreva como no quadro do box. Ao lado, a conferência da semana: o que não cabe, o que falta
para fechar 7 × 3 em cada H, o que se repete e os nomes para confirmar. O aluno só vê a semana depois de
"Publicar para os alunos" — aí ela aparece no Portal, no app e na Lousa.</p>
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

/** "12×", "200 m", "1 min". @param {{n: number, unidade: string}|null|undefined} q */
export function textoQtd(q) {
  if (!q) return '';
  const n = q.n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (q.unidade === 'reps') return `${n}×`;
  return `${n} ${q.unidade}`;
}

/**
 * O que o sistema entendeu de uma coluna, linha a linha: as seções, cada
 * exercício reconhecido (ou a pergunta, quando não reconheceu) e os avisos
 * daquela linha.
 * @param {string} onde @param {Conferencia} conf @param {{nivelHyrox?: string}} [vista]
 */
export function renderLeitura(onde, conf, vista = {}) {
  const nivel = NIVEIS_HYROX.includes(vista.nivelHyrox ?? '') ? /** @type {string} */ (vista.nivelHyrox) : 'intermediario';
  const c = conf.colunas[onde];
  if (!c) return '';
  if (c.vazia) return '<p class="mut qs-dica">A leitura aparece aqui enquanto você escreve.</p>';
  const daColuna = conf.problemas.filter((p) => p.onde === onde);
  /** @type {string[]} */
  const partes = [];
  for (const s of c.secoes) {
    const itens = c.itens.filter((i) => i.secao === s);
    if (!s.titulo && !itens.length && !s.musicas.length) continue;
    const vagas = s.tipo === 'hiit' ? vagasDaEstacao(c, s).length : 0;
    const detalhe = s.tipo === 'hiit'
      ? `Estação ${NOME_ESTACAO_HIIT[s.estacao ?? ''] ?? s.estacao} · ${MUSICAS_POR_ESTACAO} músicas de Tabata, 4× cada exercício`
      : [
        NOME_TIPO_SECAO[s.tipo] ?? s.tipo,
        s.formato, s.minutos ? `${s.minutos} min` : '', s.rodadas ? `${s.rodadas} rodadas` : '',
        s.series ? `${s.series}×${s.reps ?? ''}` : '', s.descansoSeg ? `pausa ${s.descansoSeg} s` : '',
      ].filter(Boolean).join(' · ');
    const semConta = SECOES_SEM_CONTA.includes(s.tipo);
    const nota = semConta ? ' <span class="mut">(não conta volume)</span>'
      : s.tipo === 'aquecimento' ? ' <span class="mut">(conta ¼ no volume e entra na repetição)</span>'
        : s.tipo === 'hiit' ? ` <span class="${vagas === SLOTS_POR_ESTACAO ? 'ok' : 'warn'}">${vagas}/${SLOTS_POR_ESTACAO} vagas</span>` : '';
    partes.push(`<div class="ql-secao${semConta ? ' ql-sem-conta' : ''}"><b>${esc(s.letra || '•')}</b> ${esc(detalhe)}${nota}</div>`);
    if (s.tipo === 'hyrox' && itens.length) partes.push(renderNivelHyrox(conf, nivel));
    for (const i of itens) partes.push(renderItem(i, daColuna.filter((p) => p.linha === i.linha && p.tipo !== 'duvida'), conf, nivel));
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

/** O nível que a tabela mostra e a corrida antes de cada estação. @param {Conferencia} conf @param {string} nivel */
function renderNivelHyrox(conf, nivel) {
  const opcoes = NIVEIS_HYROX.map((n) => `<option value="${n}"${n === nivel ? ' selected' : ''}>${esc(NOME_NIVEL_HYROX[n])}</option>`).join('');
  const corrida = corridaHyrox(conf.indice, nivel);
  const txt = corrida.length
    ? `Corrida antes de cada estação: ${corrida.map((x) => `${NOME_MODELO_HYROX[x.modelo]} ${x.metros} m`).join(' · ')} `
      + `<span class="mut">(air bike: ${corrida.map((x) => `${x.cal}`).join(' / ')} cal)</span>`
    : '';
  return `<div class="ql-hyrox"><label>Nível <select data-nivel-hyrox aria-label="Nível do Hyrox">${opcoes}</select></label> ${txt}</div>`;
}

/** Botão de cadastrar o nome escrito no catálogo. @param {string} k @param {string} escrito */
const botaoCadastrar = (k, escrito) =>
  `<button class="ql-sug cadastrar" type="button" data-cadastrar="${k}" data-nome="${esc(escrito)}" title="Criar no catálogo (força, HIIT, Cross ou acessório)">+ Cadastrar</button>`;

/** @param {any} i @param {import('../core/quadro.js').Problema[]} avisos @param {Conferencia} conf @param {string} nivel */
function renderItem(i, avisos, conf, nivel) {
  const k = esc(chaveApelido(i.escrito));
  let q = '';
  if (i.secao.tipo === 'forca') q = i.series ? `${i.series} séries` : '';
  else if (i.qtd) q = `${textoQtd(i.qtd)}${i.item?.hyrox ? ' (escrito)' : ''}`;
  else if (i.item?.hyrox) q = quantidadesHyrox(i.item, nivel).map((x) => `${NOME_MODELO_HYROX[x.modelo]} ${textoQtd({ n: x.n, unidade: x.unidade })}`).join(' · ');
  if (i.secao.tipo === 'hiit' && i.item?.unilateral) q = [q, 'unilateral: 2 vagas (D e E)'].filter(Boolean).join(' · ');
  const qtd = q ? ` <span class="mut ql-qtd">${esc(q)}</span>` : '';
  let chip;
  if (i.item) {
    chip = `<button class="ql-chip ok" type="button" data-trocar="${k}" title="Trocar o exercício">${esc(i.item.nome)}</button>${qtd}`;
  } else if (i.leitura.como === 'fora') {
    chip = `<button class="ql-chip fora" type="button" data-trocar="${k}" title="Fora do catálogo: só a repetição confere pelo nome. Trocar">${esc(i.escrito)} · fora do catálogo</button>${qtd} ${botaoCadastrar(k, i.escrito)}`;
  } else {
    const sug = i.leitura.sugestoes.map((/** @type {{id: string, nome: string}} */ s) => `<button class="ql-sug" type="button" data-apelido="${k}" data-id="${esc(s.id)}">${esc(s.nome)}</button>`).join('');
    chip = `<span class="ql-chip duvida">“${esc(i.escrito)}” é…</span>${qtd} ${sug}
      <input class="ql-outro" list="quadro-catalogo" placeholder="outro…" data-apelido-input="${k}" aria-label="Outro exercício para ${esc(i.escrito)}" />
      ${botaoCadastrar(k, i.escrito)}
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
  <caption>Equipamento de cada dia <span class="mut">(turma de até 6, dividida entre as duas aulas · os avisos não impedem salvar)</span></caption>
  <tbody>${conf.equipamento.map((d) => {
    const falta = esc(d.faltas.map((f) => `${f.precisa - f.tem} ${NOME_RECURSO[f.recurso] ?? f.recurso}`).join(', '));
    let st;
    if (d.cabeAte === null) st = d.faltas.length ? `<span class="bad">falta ${falta}</span>` : (d.adaptado ? '' : '<span class="ok">cabe</span>');
    else if (!d.faltas.length) st = d.adaptado ? '' : '<span class="ok">cabe em qualquer divisão</span>';
    else if (d.cabeAte === 0) st = `<span class="bad">não cabe: falta ${falta}</span>`;
    else st = `<span class="warn">até ${d.cabeAte} no ${esc(d.aulas[1])}</span>`;
    const recursos = [...new Set([...(d.adaptado?.recursos ?? []), ...d.faltas.map((f) => f.recurso)])].join(',');
    const adaptar = d.faltas.length
      ? ` <button class="qc-adaptar" type="button" data-adaptar="${esc(d.dia)}" data-recursos="${esc(recursos)}">Marcar como adaptado</button>` : '';
    const adaptado = d.adaptado
      ? `<span class="qc-adaptado">adaptado: ${esc(d.adaptado.texto)}</span> <button class="qc-adaptar" type="button" data-desfazer-adaptacao="${esc(d.dia)}">desfazer</button>` : '';
    return `<tr><th>${esc(NOME_DIA[d.dia])}</th><td>${esc(d.aulas.join(' + '))}</td><td>${[st, adaptado].filter(Boolean).join('<br>')}${adaptar}</td></tr>`;
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

/* ───────────────────────────── publicar para os alunos ───────────────────────────── */

/**
 * A faixa da publicação: se a semana está no ar, se o quadro mudou depois e os botões.
 * @param {{status: 'rascunho'|'publicado'|null, origem: string|null, publicadoEm: Date|null, mudou: boolean, publicando: boolean}} p
 */
export function renderPublicacao(p) {
  const quando = p.publicadoEm
    ? p.publicadoEm.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  let texto;
  let cls = 'mut';
  if (p.status !== 'publicado') texto = 'Ainda não publicada: o aluno não vê esta semana.';
  else if (p.origem !== 'quadro') { texto = 'No ar: a semana do gerador antigo. Publicar troca pelo que está no quadro.'; cls = 'warn'; }
  else if (p.mudou) { texto = `No ar desde ${quando}, mas o quadro mudou depois. Publique de novo para o aluno ver.`; cls = 'warn'; }
  else { texto = `No ar para os alunos desde ${quando}.`; cls = 'ok'; }
  const rotulo = p.publicando ? 'Publicando…' : p.status === 'publicado' && p.origem === 'quadro' ? 'Publicar de novo' : 'Publicar para os alunos';
  return `<span class="${cls}">${esc(texto)}</span>
  <button class="btn" type="button" data-publicar-quadro${p.publicando ? ' disabled' : ''}>${esc(rotulo)}</button>
  ${p.status === 'publicado' ? '<button class="btn ghost" type="button" data-tirar-do-ar>Tirar do ar</button>' : ''}`;
}

/**
 * O que vai mudar na publicação: os impedimentos (a lista do que falta). Redesenhado a cada mudança no diálogo.
 * @param {{impedimentos: {texto: string}[], resumo: Record<string, string[]>}} r
 */
export function renderImpedimentos(r) {
  const dias = DIAS.map((d) => `<li><b>${esc(NOME_DIA[d])}</b> · ${esc(r.resumo[d]?.length ? r.resumo[d].join(' + ') : '—')}</li>`).join('');
  const imp = r.impedimentos.length
    ? `<p class="bad"><b>Antes de publicar:</b></p><ul class="qs-pub-imp">${r.impedimentos.map((i) => `<li>${esc(i.texto)}</li>`).join('')}</ul>`
    : '<p class="ok">Pronto para publicar. Os avisos de equipamento da conferência não impedem.</p>';
  return `<ul class="qs-pub-dias">${dias}</ul>${imp}`;
}

/**
 * O diálogo "Publicar para os alunos": os dias sem aula (com o motivo) e o que falta.
 * @param {{rotulo: string, datas: Record<string, string>, semAula: Record<string, {tipo: string, texto: string}>,
 *   impedimentos: {texto: string}[], resumo: Record<string, string[]>}} e
 */
export function renderPublicar(e) {
  const linhas = DIAS.map((d) => {
    const s = e.semAula[d];
    const opcoes = [['', 'Tem aula'], ...TIPOS_SEM_AULA.map((t) => [t, NOME_SEM_AULA[t]])]
      .map(([v, n]) => `<option value="${v}"${(s?.tipo ?? '') === v ? ' selected' : ''}>${esc(n)}</option>`).join('');
    return `<div class="qs-pub-linha">
  <span class="qs-pub-dia">${esc(NOME_DIA[d])} <span class="mut">${esc(e.datas[d] ?? '')}</span></span>
  <select data-sem-aula="${d}" aria-label="${esc(NOME_DIA[d])}: tem aula?">${opcoes}</select>
  <input type="text" data-sem-aula-texto="${d}" maxlength="200" value="${esc(s?.texto ?? '')}" placeholder="Motivo para o aluno (opcional)"${s ? '' : ' hidden'} />
</div>`;
  }).join('');
  return `<p class="mut">${esc(e.rotulo)}. Marque os dias sem aula; o aluno vê o motivo no lugar do treino.
Dia que já passou numa semana publicada fica como estava (o aluno pode ter registrado a aula).</p>
<div class="qs-pub-grade">${linhas}</div>
<div id="qs-pub-resumo">${renderImpedimentos(e)}</div>`;
}
