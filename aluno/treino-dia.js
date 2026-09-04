// @ts-check
/**
 * Render do "Treino do dia" no Portal (lado aluno). Auto-contido: não importa o
 * render.js do Montador (que é do app do coach). Mostra o treino de hoje no NÍVEL
 * do aluno (força/hipertrofia); Hyrox/HIIT/GAP têm prescrição única.
 */

const MOD_NOME = { forca: 'Força', hipertrofia: 'Hipertrofia', hiit: 'HIIT', hyrox: 'Hyrox', hibrido: 'Híbrido', gap: 'GAP', murph: 'Murph' };
const PADRAO_LABEL = {
  empurrar: 'Empurrar', puxar: 'Puxar', quadriceps: 'Quadríceps',
  posterior_gluteo: 'Posterior/Glúteo', core: 'Core', estabilizadores: 'Estabilizadores',
};
const DIA_LABEL = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
const NIVEL_LABEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
const NIV_OK = { iniciante: 1, intermediario: 1, avancado: 1 };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Nível efetivo do aluno (fallback intermediário). @param {string} nivel */
function nivelEfetivo(nivel) {
  const n = String(nivel || '').toLowerCase();
  return NIV_OK[n] ? n : 'intermediario';
}

/**
 * Aquecimento persistido no snapshot. O Treino Manual e o Treino Livre gravam
 * essa parte na MESMA forma, e a aluna vê a mesma lista nos dois — então ela
 * mora aqui, e não copiada nos dois lugares.
 * @param {Array<{nome: string, duracaoSeg?: number}>} [aquecimento]
 */
function blocoAquecimento(aquecimento) {
  if (!(aquecimento || []).length) return '';
  return `<div class="td-parte-h">Aquecimento / Mobilidade</div><ul class="td-lista">${aquecimento.map((a) => `<li>${esc(a.nome)}${a.duracaoSeg ? ` — <b>${a.duracaoSeg}s</b>` : ''}</li>`).join('')}</ul>`;
}

/** Força/Hipertrofia (e Treino Manual): exercícios no nível do aluno. */
function corpoExercicios(d, nivel) {
  const aquec = blocoAquecimento(d.aquecimento);
  const linhas = (d.exercicios || []).map((e, i) => {
    const v = e.niveis && e.niveis[nivel];
    const prescricao = v ? `<b>${v.series}×</b> ${esc(e.reps || '')}${v.carga ? ` · ${esc(v.carga)}` : ''}` : esc(e.reps || '');
    const tec = e.tecnica ? ` · <i>${esc(rotuloTecnica(e.tecnica))}</i>` : '';
    return `<li class="td-ex">
      <span class="td-ex-nome">${i + 1}. ${esc(e.nome)}</span>
      <span class="td-ex-sub">${PADRAO_LABEL[e.padrao] || esc(e.padrao || '')}${tec}</span>
      <span class="td-ex-presc">${prescricao}</span>
    </li>`;
  }).join('');
  const fin = d.finalizador ? `<div class="td-fin"><b>${esc(d.finalizador.tipo)}</b> — ${esc(d.finalizador.descricao)}</div>` : '';
  return `${aquec}<ul class="td-lista">${linhas}</ul>${fin}`;
}

/** Hyrox no nível do aluno. */
function corpoHyrox(h, nivel) {
  const c = h.corrida?.[nivel];
  const corrida = c ? `<div class="td-nota">🏃 Corrida por rodada: <b>${c.metros} m</b> (${c.voltas}×50 m)</div>` : '';
  // A airbike é a MESMA rodada, pedalando — para quem não tem liberação para
  // impacto ou quando correr na rua está inviável. Sem o tempo aqui, a aluna
  // substituída não sabe quando parar.
  const bike = c?.bikeMin
    ? `<div class="td-nota">🚲 Sem impacto ou sem rua: <b>${String(c.bikeMin).replace('.', ',')} min</b> de airbike no lugar da corrida.</div>`
    : '';
  const est = (h.estacoes || []).map((e) => {
    const q = e.prescricao?.[nivel];
    const un = q != null ? (e.tipo === 'distancia' ? `${q} m` : `${q} reps`) : '';
    return `<li class="td-ex"><span class="td-ex-nome">${e.n}. ${esc(e.nome)}</span><span class="td-ex-sub">${esc(e.base || '')}</span><span class="td-ex-presc"><b>${un}</b></span></li>`;
  }).join('');
  // O nº de rodadas sai das estações do treino: no Treino Manual o coach pode
  // desligar as que o box não vai rodar hoje, e "8" ficaria mentindo para a aluna.
  const n = (h.estacoes || []).length;
  return `<div class="td-nota">${n} rodada${n === 1 ? '' : 's'} de corrida + estação (formato da prova).</div>${corrida}${bike}<ul class="td-lista">${est}</ul>`;
}

/**
 * Murph no nível da aluna. O miolo é igual para todos; o que muda é a corrida e
 * se ela PODE fracionar — e a regra de execução é o que mais importa aqui, porque
 * é ela que protege quem está começando.
 */
function corpoMurph(m, nivel) {
  const c = m.cardio?.[nivel];
  const ex = m.execucao?.[nivel];
  const alt = c?.alternativa ? ` (ou ${c.alternativa.metros} m)` : '';
  const corrida = c
    ? `<div class="td-nota">🏃 Corrida: <b>${c.metros} m${alt}</b> na abertura <b>e</b> no fechamento.</div>
       <div class="td-nota">🚲 Sem impacto ou sem rua: <b>${String(c.bikeMin).replace('.', ',')} min</b>${c.alternativa ? ` (ou ${String(c.alternativa.bikeMin).replace('.', ',')} min)` : ''} de airbike em cada ponta.</div>`
    : '';
  const regra = ex
    ? `<div class="td-nota">📋 <b>${esc(ex.rotulo)}</b> — ${esc(ex.detalhe)}</div>`
    : '';
  const cindy = ex?.id === 'cindy' && m.cindy
    ? `<div class="td-nota">🔁 ${m.cindy.rounds} rounds de ${m.cindy.round.map((r) => `${r.reps} ${esc(r.nome)}`).join(' + ')}.</div>`
    : '';
  const blocos = (m.blocos || []).map((b) => `<li class="td-ex">
    <span class="td-ex-nome">${b.n}. ${esc(b.nome)}</span>
    <span class="td-ex-sub">no lugar de ${esc(b.base)}</span>
    <span class="td-ex-presc"><b>${b.reps} reps</b></span></li>`).join('');
  return `<div class="td-nota">Desafio <b>for time</b>: corrida → ${m.totalReps} repetições → corrida.</div>
    ${corrida}${regra}${cindy}<ul class="td-lista">${blocos}</ul>`;
}

/** HIIT — 4 estações TABATA (prescrição única). */
function corpoHiit(h) {
  const p = h.protocolo || {};
  const estacoes = (h.estacoes || []).map((est) => {
    const slots = (est.slots || []).map((s, j) => `<li>${j + 1}. ${esc(s.nome)}${s.lado ? ` <i>(lado ${esc(s.lado)})</i>` : ''}</li>`).join('');
    return `<div class="td-bloco"><div class="td-bloco-h">${esc(est.titulo)} <span class="td-mut">· ${est.rounds} rounds</span></div><ol class="td-slots">${slots}</ol></div>`;
  }).join('');
  return `<div class="td-nota">TABATA ${p.trabalhoSeg || 20}s on / ${p.descansoSeg || 10}s off — 4 estações.</div><div class="td-blocos">${estacoes}</div>`;
}

/** GAP — aula em partes/músicas (prescrição única). */
function corpoGap(g) {
  const p = g.protocolo || {};
  const partes = (g.partes || []).map((parte) => {
    const musicas = (parte.musicas || []).map((m, i) => {
      const rounds = (m.rounds || []).map((r) => `<li>${r.n} — ${esc(r.nome)}</li>`).join('');
      return `<div class="td-bloco"><div class="td-bloco-h">🎵 ${esc(parte.nome)}${parte.musicas.length > 1 ? ' ' + (i + 1) : ''}</div><ol class="td-slots">${rounds}</ol></div>`;
    }).join('');
    return `<div class="td-parte"><div class="td-parte-h">${esc(parte.nome)}</div>${musicas}</div>`;
  }).join('');
  return `<div class="td-nota">TABATA ${p.trabalhoSeg || 20}s/${p.descansoSeg || 10}s — Siga o Mestre.</div>${partes}`;
}

/**
 * Rótulo da técnica. As do Treino Manual vêm da Academia e trazem `label` junto —
 * o mapa fixo abaixo atende as que o Híbrido gera sozinho e os treinos salvos antes
 * de o campo existir.
 */
const TECNICA_LABEL = { biset: 'Bi-set', dropset: 'Drop-set', isometria: 'Isometria', tempo: 'Tempo 2-1-2' };
const rotuloTecnica = (t) => t.label || TECNICA_LABEL[t.tipo] || t.tipo;

/** Híbrido — formato LEGADO: hipertrofia era lista plana de exercícios com splitLabel. */
function corpoHibridoLegado(h, nivel) {
  const mob = (h.mobilidade || []).map((m) => `<li>${esc(m.nome)}</li>`).join('');
  const linhas = (h.hipertrofia || []).map((e, i) => {
    const v = e.niveis && e.niveis[nivel];
    const prescricao = v ? `<b>${v.series}×</b> ${esc(e.reps || '')}${v.carga ? ` · ${esc(v.carga)}` : ''}` : esc(e.reps || '');
    const tec = e.tecnica ? ` · <i>${esc(rotuloTecnica(e.tecnica))}</i>` : '';
    return `<li class="td-ex">
      <span class="td-ex-nome">${i + 1}. ${esc(e.nome)}</span>
      <span class="td-ex-sub">${PADRAO_LABEL[e.padrao] || esc(e.padrao || '')}${tec}</span>
      <span class="td-ex-presc">${prescricao}</span>
    </li>`;
  }).join('');
  const wod = h.wod || {};
  const movs = (wod.movimentos || []).map((m) => `<li>${esc(m.nome)} — ${esc(m.prescricao)}</li>`).join('');
  return `<div class="td-nota">Split de hoje: <b>${esc(h.splitLabel || '')}</b>.</div>
    <div class="td-parte-h">Mobilidade — 6 min</div>
    <ul class="td-lista">${mob}</ul>
    <div class="td-parte-h">Hipertrofia — 10–12 reps</div>
    <ul class="td-lista">${linhas}</ul>
    <div class="td-parte-h">WOD — ${esc(wod.formato || '')} · ${wod.duracaoMin || ''} min</div>
    <ul class="td-lista">${movs}</ul>`;
}

/** Um lado do bi-set: nome + carga do nível do aluno. */
function ladoBiset(ex, nivel) {
  const v = ex.niveis && ex.niveis[nivel];
  const carga = v ? ` · ${esc(v.carga)}` : '';
  return `<span class="td-ex-nome">${esc(ex.nome)}</span>${carga}`;
}

/** Híbrido: Mobilidade (duração real) + Hipertrofia (postos de bi-set, nível do aluno) + WOD. */
function corpoHibrido(h, nivel) {
  // Compat: treino salvo antes da virada p/ postos de bi-set — `hipertrofia` era uma
  // lista PLANA de exercícios (`nome`/`niveis`), sem `a`/`b`. Sem este ramo, a leitura
  // de `p.a`/`p.b` quebra (ou pior, degrada em silêncio) ao reabrir o dia.
  const legado = (h.hipertrofia || []).length && !h.hipertrofia[0].a;
  if (legado) return corpoHibridoLegado(h, nivel);

  const mobSeg = (h.mobilidade || []).reduce((a, m) => a + (m.duracaoSeg || 0), 0);
  const mobMin = Math.round(mobSeg / 60);
  const mob = (h.mobilidade || []).map((m) => `<li>${esc(m.nome)}</li>`).join('');

  const postos = (h.hipertrofia || []).map((p, i) => {
    const tec = p.tecnica ? `<div class="td-ex-sub"><i>${esc(rotuloTecnica(p.tecnica))}</i></div>` : '';
    return `<li class="td-ex td-posto">
      <span class="td-ex-nome">Posto ${i + 1} — ${esc(p.parLabel || '')}</span>
      <span class="td-ex-sub">${ladoBiset(p.a, nivel)}</span>
      <span class="td-ex-sub td-biset-vs">↕ bi-set — alterna com a parceira a cada série</span>
      <span class="td-ex-sub">${ladoBiset(p.b, nivel)}</span>
      <span class="td-ex-presc"><b>${p.series || 0}×</b> ${esc(String(p.reps || ''))} reps · ${p.descansoSeg || 0}s de pausa</span>
      ${tec}
    </li>`;
  }).join('');

  const wod = h.wod || {};
  const movs = (wod.movimentos || []).map((m) => `<li>${esc(m.nome)} — ${esc(m.prescricao)}</li>`).join('');
  return `<div class="td-nota">${esc(h.semanaRotulo || '')}</div>
    <div class="td-parte-h">Mobilidade — ${mobMin} min</div>
    <ul class="td-lista">${mob}</ul>
    <div class="td-parte-h">Hipertrofia — bi-sets em dupla</div>
    <ul class="td-lista">${postos}</ul>
    <div class="td-parte-h">WOD — ${esc(wod.formato || '')} · ${wod.duracaoMin || ''} min</div>
    <ul class="td-lista">${movs}</ul>`;
}

/** Rótulo do grupo pelo tamanho — 2 é bi-set, 3 é tri-set, 4+ é série gigante,
 * a mesma régua que o Treino Livre usa na tela do coach pra nomear o que ele
 * linkou. */
const rotuloGrupo = (n) => (n === 2 ? 'Bi-set' : n === 3 ? 'Tri-set' : 'Série gigante');

/**
 * Agrupa exercícios consecutivos do mesmo `grupo` (linhas linkadas no Treino
 * Livre) num item só. `grupo` ausente ou não-numérico (dia salvo antes desta
 * feature) nunca agrupa — cada linha nasce sozinha no próprio grupo, que é
 * exatamente o card de hoje.
 * @param {any[]} exercicios
 */
function agruparLivre(exercicios) {
  /** @type {{grupo: any, membros: any[]}[]} */
  const grupos = [];
  for (const e of exercicios || []) {
    const anterior = grupos[grupos.length - 1];
    const linka = anterior && typeof e.grupo === 'number' && e.grupo === anterior.grupo;
    if (linka) anterior.membros.push(e);
    else grupos.push({ grupo: e.grupo, membros: [e] });
  }
  return grupos;
}

/** Uma linha solta, fora de grupo — o card de hoje, sem mudança nenhuma. */
function linhaLivreSolo(e, numero, nivel) {
  const v = e.niveis && e.niveis[nivel];
  // O intervalo só aparece se o coach preencheu algo — o próprio campo do
  // bloco herda 0/vazio quando ele não mexeu, e mostrar "· 0s" seria ruído.
  const desc = e.descansoSeg ? ` · ${e.descansoSeg}s` : '';
  const prescricao = v ? `<b>${v.series}×</b> ${esc(e.reps || '')}${v.carga ? ` · ${esc(v.carga)}` : ''}${desc}` : `${esc(e.reps || '')}${desc}`;
  const tec = e.tecnica ? ` · <i>${esc(rotuloTecnica(e.tecnica))}</i>` : '';
  return `<li class="td-ex">
    <span class="td-ex-nome">${numero}. ${esc(e.nome)}</span>
    <span class="td-ex-sub">${PADRAO_LABEL[e.padrao] || esc(e.padrao || '')}${tec}</span>
    <span class="td-ex-presc">${prescricao}</span>
  </li>`;
}

/**
 * Um grupo linkado (bi-set/tri-set/série gigante) vira UM item: rótulo, cada
 * membro com nome e carga do nível, a nota de revezamento — mesma frase que o
 * Híbrido já usa pro bi-set dele — e a prescrição uma vez só, do líder (é ele
 * quem define série e descanso pro grupo inteiro, ver o porquê em core/livre.js).
 *
 * Não usa a grade `.td-ex`: ela é uma coluna fixa pra 1 nome + 1 prescrição, e
 * um grupo pode ter 2, 3 ou mais nomes — por isso o layout próprio em `.td-grupo`
 * (aluno.css), em vez de empilhar mais `.td-ex-sub` na mesma grade.
 */
function linhaLivreGrupo(membros, nivel) {
  const lider = membros[0];
  const vLider = lider.niveis && lider.niveis[nivel];
  const descLider = lider.descansoSeg ? ` · ${lider.descansoSeg}s` : '';
  const prescricao = vLider
    ? `<b>${vLider.series}×</b> ${esc(lider.reps || '')}${descLider}`
    : `${esc(lider.reps || '')}${descLider}`;
  const nomes = membros.map((e) => {
    const v = e.niveis && e.niveis[nivel];
    const carga = v && v.carga ? ` · ${esc(v.carga)}` : '';
    const tec = e.tecnica ? ` · <i>${esc(rotuloTecnica(e.tecnica))}</i>` : '';
    return `<span class="td-ex-sub">${esc(e.nome)}${carga}${tec}</span>`;
  }).join('');
  return `<li class="td-grupo">
    <div class="td-grupo-cab">
      <span class="td-grupo-rotulo">${rotuloGrupo(membros.length)}</span>
      <span class="td-ex-presc">${prescricao}</span>
    </div>
    <div class="td-grupo-membros">${nomes}</div>
    <span class="td-ex-sub td-biset-vs">↕ alterna com a parceira a cada série</span>
  </li>`;
}

/** Bloco de séries: agrupa bi-set/tri-set/série gigante antes de desenhar, e
 * numera as linhas soltas pela posição real no bloco — um grupo no meio não
 * "pula" a numeração de quem vem depois dele. */
function blocoLivreSeries(b, nivel) {
  let numero = 0;
  const linhas = agruparLivre(b.exercicios).map((g) => {
    if (g.membros.length === 1) { numero += 1; return linhaLivreSolo(g.membros[0], numero, nivel); }
    numero += g.membros.length;
    return linhaLivreGrupo(g.membros, nivel);
  }).join('');
  const igual = b.porNivel ? '' : ' <span class="td-nota-inline">· igual para todos</span>';
  return `<div class="td-parte-h">${esc(b.nome)}${igual}</div><ul class="td-lista">${linhas}</ul>`;
}

/**
 * Quantas voltas completas cabem na rotação do EMOM, e avisa quando a última
 * fecha pela metade — sem isso a aluna contaria com um ciclo inteiro que o
 * relógio não dá tempo de fechar.
 */
function notaEmomRotacao(duracaoMin, nMovimentos) {
  if (!nMovimentos) return '';
  const voltas = Math.floor(duracaoMin / nMovimentos);
  const resto = duracaoMin % nMovimentos;
  const base = `${voltas} volta${voltas === 1 ? '' : 's'} completa${voltas === 1 ? '' : 's'} de rotação em ${duracaoMin} min`;
  return resto ? `${base} — os últimos ${resto} min repetem só o começo da lista.` : `${base}.`;
}

/**
 * Bloco de WOD (AMRAP/EMOM/For Time/Chipper): cabeçalho com formato e tempo, a
 * frase do formato e os movimentos como "nome — prescrição" — o mesmo padrão
 * que o WOD do Híbrido já usa, pra não inventar uma segunda leitura pro aluno.
 *
 * O EMOM aqui é ROTAÇÃO (decisão do coach — ver DESCRICAO_EMOM_ROTACAO no core):
 * minuto 1 é o primeiro movimento da lista, minuto 2 o segundo, e ela reinicia
 * até fechar o tempo. Por isso a numeração "min N" e a nota de quantas voltas
 * fecham — é DIFERENTE do EMOM do Híbrido (bloco fixo por minuto, sem rotação),
 * e as duas telas não podem compartilhar o mesmo texto.
 */
function corpoLivreWod(b) {
  const emom = b.formato === 'EMOM';
  const nMovimentos = (b.exercicios || []).length;
  const movs = (b.exercicios || []).map((m, i) => {
    const prefixo = emom ? `min ${i + 1}. ` : '';
    return `<li>${prefixo}${esc(m.nome)} — ${esc(m.prescricao)}</li>`;
  }).join('');
  const rodadasTx = b.formato === 'For Time' && b.rodadas
    ? `<div class="td-nota"><b>${b.rodadas} rodada${b.rodadas === 1 ? '' : 's'} de:</b></div>` : '';
  const emomTx = emom ? `<div class="td-nota">${esc(notaEmomRotacao(b.duracaoMin, nMovimentos))}</div>` : '';
  return `<div class="td-parte-h">${esc(b.nome)} — ${esc(b.formato)} · ${b.duracaoMin} min</div>
    <div class="td-nota">${esc(b.descricaoFormato)}</div>
    ${rodadasTx}${emomTx}
    <ul class="td-lista">${movs}</ul>`;
}

/**
 * Treino Livre: blocos nomeados pelo coach, cada um com sua prescrição.
 *
 * Despacha por `b.tipo` — 'wod' (ou qualquer bloco que trouxer `formato`,
 * defensivo contra um dia salvo com o tipo perdido no meio do caminho) vai pro
 * card de WOD; o resto é o bloco de séries de sempre, com agrupamento de
 * bi-set/tri-set. O bloco que não abre por nível mostra o mesmo número para
 * todos e diz isso — sem o aviso, o aluno avançado acharia que o app errou a
 * conta dele.
 * @param {any} l  o `treino.livre` do snapshot
 * @param {string} nivel
 */
function corpoLivre(l, nivel) {
  return (l.blocos || []).map((b) => (
    b.tipo === 'wod' || b.formato ? corpoLivreWod(b) : blocoLivreSeries(b, nivel)
  )).join('');
}

/**
 * Card do treino de hoje.
 * @param {any} treino  dia (exercicios/hyrox/hiit/gap/hibrido)
 * @param {string} nivel  nível do aluno
 */
export function renderTreinoDia(treino, nivel) {
  const n = nivelEfetivo(nivel);
  const mod = MOD_NOME[treino.modalidade] || treino.modalidade;
  const diaTxt = DIA_LABEL[treino.dia] || '';
  let corpo, porNivel;
  if (treino.hyrox) { corpo = corpoHyrox(treino.hyrox, n); porNivel = true; }
  else if (treino.hiit) { corpo = corpoHiit(treino.hiit); porNivel = false; }
  else if (treino.gap) { corpo = corpoGap(treino.gap); porNivel = false; }
  else if (treino.hibrido) { corpo = corpoHibrido(treino.hibrido, n); porNivel = true; }
  else if (treino.murph) { corpo = corpoMurph(treino.murph, n); porNivel = true; }
  else if (treino.livre) {
    corpo = blocoAquecimento(treino.aquecimento) + corpoLivre(treino.livre, n);
    // Só promete personalização se ALGUM bloco de fato abre por nível — um dia
    // 100% WOD (todo porNivel:false) não pode estampar "seu nível" no card.
    porNivel = (treino.livre.blocos || []).some((b) => b.porNivel);
  }
  else { corpo = corpoExercicios(treino, n); porNivel = true; }
  // só mostra o "seu nível" nos formatos que variam por nível (força/hyrox)
  const badgeNivel = porNivel ? `<span class="td-nivel">seu nível: ${esc(NIVEL_LABEL[n] || n)}</span>` : '';
  return `<div class="td-card">
    <div class="td-head"><span class="td-dia">${esc(diaTxt)}</span><h3>${esc(mod)}</h3>${badgeNivel}</div>
    ${corpo}
  </div>`;
}
