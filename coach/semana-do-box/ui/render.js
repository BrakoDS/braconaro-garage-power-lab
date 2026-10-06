// @ts-check
/**
 * O HTML da Semana do Box, como STRING — sem DOM, para o teste rodar no Node.
 *
 * Tudo o que vem do Firestore passa por `esc`: o nome do exercício está no
 * catálogo, e o catálogo é dado, não marcação. O texto e o destaque saem de
 * `core/vista.js`; aqui só se monta a marcação.
 */
import {
  DIAS, NOME_INSTANCIA, estadoDaSemana, textoAlerta, textoTroca, posicoesEmAlerta,
  consumoVisivel, publicacao, datasDosDias, tituloForca, sessaoEditavel, textoAvisoEdicao,
  alunosPorEstacao, hiitDaSemana, hiitEditavel, nomesDoHiit, rotuloDiasHiit, slotsEmAlertaHiit, textoAlertaHiit, textoForaDoHiit,
  totalDeAlertas,
  NIVEIS_HYROX, NOME_PADRAO_CROSS, UNIDADE_HYROX, conteudoEditavel, estacoesEmAlerta, linhasDaCorrida, movimentosEmAlerta,
  nomesDoWod, quantidadeCross, temSubstitutaHyrox, textoAlertaCross, textoAlertaHyrox, textoContaWod, tituloHyrox, tituloWod,
} from '../core/vista.js';

/** @param {unknown} s */
export const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** @param {{id: string, rotulo: string}} estado */
const selo = (estado) => `<span class="selo selo-${estado.id}">${esc(estado.rotulo)}</span>`;

/**
 * Os cartões das semanas do mês.
 * @param {{chave: string, rotulo: string}[]} semanas
 * @param {Record<string, any>} docs @param {string} selecionada
 */
export function renderLista(semanas, docs, selecionada) {
  if (!semanas.length) return '<p class="vazio">Mês inválido.</p>';
  return semanas.map((s) => {
    const doc = docs[s.chave] ?? null;
    const n = totalDeAlertas(doc);
    return `<button class="semana-card${s.chave === selecionada ? ' ativa' : ''}" data-semana="${esc(s.chave)}" type="button"
      aria-pressed="${s.chave === selecionada}">
      <span class="semana-rotulo">${esc(s.rotulo)}</span>
      <span class="semana-chave mut">${esc(s.chave)}</span>
      ${selo(estadoDaSemana(doc))}
      ${n ? `<span class="semana-alertas">⚠ ${n} alerta${n > 1 ? 's' : ''}</span>` : ''}
    </button>`;
  }).join('');
}

/**
 * As ações do topo do detalhe, conforme o estado.
 * @param {{chave: string, inicio: string, doc: any, ocupado: boolean}} o
 */
function acoes({ chave, inicio, doc, ocupado }) {
  const dis = ocupado ? ' disabled' : '';
  const estado = estadoDaSemana(doc);
  if (estado.id === 'vazia') {
    const fim = (() => {
      const d = new Date(`${inicio}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 5);
      return d.toISOString().slice(0, 10);
    })();
    return `<div class="panel">
      <div class="field"><label for="semana-data">Data da semana</label>
        <input id="semana-data" type="date" value="${esc(inicio)}" min="${esc(inicio)}" max="${esc(fim)}" /></div>
      <button class="btn btn-ouro" data-acao="gerar" type="button"${dis}>⚡ Gerar Matriz Semanal</button>
      <p class="mut intro">O servidor monta os 6 dias, faz o rodízio contra a semana anterior e
        confere o equipamento de cada dia contra o inventário. A semana nasce como <b>rascunho</b>:
        o aluno só vê depois que você publicar.</p>
    </div>`;
  }
  if (estado.id === 'publicado') {
    return `<div class="panel">
      <button class="btn ghost" data-acao="despublicar" type="button"${dis}>Voltar para rascunho</button>
      <p class="mut intro">Publicada: os alunos já veem esta semana. Para gerar de novo, volte para rascunho.</p>
    </div>`;
  }
  const pub = publicacao(doc);
  const motivos = pub.motivos.length
    ? `<ul class="motivos">${pub.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  return `<div class="panel">
    <button class="btn btn-ouro" data-acao="publicar" type="button"${pub.pode && !ocupado ? '' : ' disabled'}>Publicar semana</button>
    <button class="btn ghost" data-acao="sortear" type="button"${dis}>Sortear de novo</button>
    <p class="mut intro">${pub.pode
      ? 'Revise a grade abaixo. Publicar libera a semana para os alunos.'
      : `<b>Ainda não dá para publicar ${esc(chave)}:</b>`}</p>
    ${motivos}
  </div>`;
}

/** Os alertas de equipamento, em destaque. @param {any} doc */
function alertas(doc) {
  const lista = doc?.alertas ?? [];
  if (!lista.length) return '';
  return `<section class="card card-alerta sev-alta alerta-equip" role="alert">
    <h3>⚠ Equipamento acima do limite</h3>
    <ul>${lista.map((a) => `<li>${esc(textoAlerta(a))}</li>`).join('')}</ul>
    <p class="mut">Os exercícios que ocupam esse equipamento estão marcados no dia. O gerador não achou
      troca na mesma instância — sorteie de novo ou ajuste o inventário.</p>
  </section>`;
}

/** O que o gerador decidiu sozinho: trocas da trava e avisos de rodízio. @param {any} doc */
function notasDoGerador(doc) {
  const g = doc?.geracao;
  if (!g) return '';
  const trocas = g.trocas ?? [];
  const avisos = g.avisos ?? [];
  const fora = g.hiitFora ?? [];
  const origem = g.semanaAnterior
    ? `Rodízio contra a semana ${esc(g.semanaAnterior)}: nenhuma variação dela foi repetida sem aviso.`
    : 'Sem semana anterior gravada: não houve rodízio para fazer.';
  return `<section class="card notas-gerador">
    <h3>O que o gerador decidiu</h3>
    <p class="mut">${origem}${g.variacao ? ` Sorteio nº ${esc(g.variacao)}.` : ''}</p>
    ${trocas.length ? `<h4>Trocas pela trava de equipamento</h4>
      <ul>${trocas.map((t) => `<li>${esc(textoTroca(t))}</li>`).join('')}</ul>` : ''}
    ${avisos.length ? `<h4>Avisos</h4><ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    ${fora.length ? `<h4>Fora do sorteio do HIIT (equipamento)</h4>
      <ul>${fora.map((f) => `<li>${esc(textoForaDoHiit(f))}</li>`).join('')}</ul>` : ''}
  </section>`;
}

/**
 * As notas que a semana guarda (`avisosEdicao`): repetição entre sessões e
 * rodízio quebrado. Informam — quem escolheu "manter assim mesmo" continua vendo.
 * @param {any} doc
 */
function avisosEdicao(doc) {
  const lista = (doc?.avisosEdicao ?? []).map(textoAvisoEdicao).filter(Boolean);
  if (!lista.length) return '';
  return `<section class="card notas-gerador avisos-edicao">
    <h3>Avisos da semana</h3>
    <ul>${lista.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="mut">Não impedem publicar. Para mudar, use "trocar" no exercício.</p>
  </section>`;
}

/**
 * Um dia da grade.
 * @param {any} doc @param {{id: string, nome: string}} d @param {string} data @param {string} hoje 'AAAA-MM-DD'
 */
function cartaoDia(doc, d, data, hoje) {
  const dia = doc.dias?.[d.id];
  if (!dia) return '';
  const chips = (dia.treinos ?? []).map((t, i) =>
    `<span class="treino-chip${i === 0 ? ' principal' : ''}" title="${i === 0 ? 'Aula principal' : 'Alternativa'}">${esc(t)}</span>`).join('');

  const emAlerta = posicoesEmAlerta(doc, d.id);
  const bloco = dia.blocoPrincipal ?? [];
  // Troca é por SESSÃO: o botão aparece nos dois dias do H1 e muda os dois.
  const sessao = dia.sessaoForca?.sessao;
  const podeTrocar = !!sessao && hoje !== undefined && sessaoEditavel(doc, sessao, hoje);
  const forca = dia.sessaoForca ? `
    <div class="forca">
      <h4>${esc(tituloForca(dia))}</h4>
      <ol class="exercicios">${bloco.map((e, i) => `
        <li class="exercicio${emAlerta.has(i) ? ' em-alerta' : ''}">
          <span class="ex-inst">${esc(NOME_INSTANCIA[e.instancia] ?? e.instancia ?? '')}</span>
          <span class="ex-nome">${esc(e.nome)}</span>
          <span class="ex-presc">${esc(e.series)} × ${esc(e.repeticoes)} · ${esc(e.descansoSeg)} s</span>
          ${podeTrocar ? `<button class="ex-trocar" type="button" data-trocar="${esc(sessao)}:${i + 1}"
            aria-label="Trocar ${esc(e.nome)} (${esc(sessao)}, vaga ${i + 1})">trocar</button>` : ''}
        </li>`).join('')}
      </ol>
      <p class="mut dia-rodape">Cadência ${esc(dia.cadencia)} · troca de estação ${esc(dia.descansos?.entreExerciciosSeg)} s</p>
    </div>` : '';

  // HIIT com estações: o cartão só chama a faixa da semana (o mesmo HIIT está
  // na sexta e no sábado, e as 16 linhas não cabem bem num cartão estreito).
  const comHiit = (b) => b.modalidade === 'HIIT' && Array.isArray(dia.hiit?.estacoes);
  // O WOD e o Hyrox são a aula do dia e cabem no cartão: entram inteiros nele.
  const nHiit = (doc.alertasHiit ?? []).length;
  const metabolicos = (dia.blocosMetabolicos ?? []).map((b) => {
    if (b.modalidade === 'Cross' && Array.isArray(dia.cross?.movimentos)) return blocoWod(doc, dia, b, hoje);
    if (b.modalidade === 'Hyrox' && Array.isArray(dia.hyrox?.estacoes)) return blocoHyrox(doc, dia, b, hoje);
    return `
    <div class="metabolico${b.papel === 'principal' ? ' principal' : ''}">
      <h4>${esc(b.modalidade)} <span class="mut">· ${esc(b.formato)}${b.papel === 'alternativa' ? ' · alternativa' : ''}</span></h4>
      <p class="mut">${esc(b.descricao)}</p>
      ${comHiit(b) ? `<button class="ver-hiit${nHiit ? ' com-alerta' : ''}" type="button" data-ver-hiit>ver estações ↓${nHiit ? ` · ⚠ ${nHiit} alerta${nHiit > 1 ? 's' : ''}` : ''}</button>` : ''}
    </div>`;
  }).join('');

  const consumo = consumoVisivel(dia, doc.limitesUsados);
  const equip = consumo.length ? `<div class="consumo">${consumo.map((c) =>
    `<span class="consumo-chip${c.estourou ? ' estourou' : ''}">${esc(c.nome)} ${esc(c.usado)}${c.limite === null ? '' : `/${esc(c.limite)}`}</span>`).join('')}</div>` : '';

  const doDia = (a) => (a.dias ?? []).includes(d.id);
  const estourado = consumo.some((c) => c.estourou)
    || (doc.alertasCross ?? []).some(doDia) || (doc.alertasHyrox ?? []).some(doDia);
  const vazio = !forca && !metabolicos ? '<p class="mut">Sem aula.</p>' : '';
  // A aula principal vem primeiro, como no app do aluno: na terça o WOD, e o H1
  // de catch-up embaixo; no sábado, o HIIT antes do H3.
  const principalPrimeiro = dia.sessaoForca?.papel === 'alternativa';
  return `<article class="card dia${estourado ? ' dia-estourado' : ''}">
    <header class="dia-h"><h3>${esc(d.nome)} <span class="mut">${esc(data)}</span></h3><div class="treinos">${chips}</div></header>
    ${principalPrimeiro ? `${metabolicos}${forca}` : `${forca}${metabolicos}`}${vazio}${equip}
  </article>`;
}

/** A caixa vermelha dos alertas de um bloco (WOD, Hyrox). @param {string} titulo @param {string[]} textos @param {string} rodape */
function caixaAlerta(titulo, textos, rodape) {
  if (!textos.length) return '';
  return `<div class="metab-alerta" role="alert">
      <h4>⚠ ${esc(titulo)}</h4>
      <ul>${textos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="mut">${esc(rodape)}</p>
    </div>`;
}

/**
 * O WOD do Cross no cartão do dia: formato e tempo, os movimentos com RX e
 * Scaled (e a carga, quando tem) e o rodapé com a conta da turma. Movimento
 * em alerta fica vermelho; com `hoje`, cada um ganha "trocar".
 * @param {any} doc @param {any} dia @param {{modalidade: string, papel: string}} b @param {string} [hoje]
 */
function blocoWod(doc, dia, b, hoje) {
  const w = dia.cross;
  const emAlerta = movimentosEmAlerta(doc);
  const podeTrocar = hoje !== undefined && conteudoEditavel(doc, 'cross', hoje);
  const nomes = nomesDoWod(doc);
  const alertas = (doc.alertasCross ?? []).map((a) => textoAlertaCross(a, nomes));
  const movs = w.movimentos.map((m, i) => `
        <li class="wod-mov${emAlerta.has(m.exercicioId) ? ' em-alerta' : ''}">
          <span class="ex-inst">${esc(NOME_PADRAO_CROSS[m.padrao] ?? m.padrao ?? '')}</span>
          <span class="ex-nome">${esc(m.nome)}</span>
          <span class="wod-presc"><b>RX</b> ${esc(quantidadeCross(m, m.rx))} <span class="mut">·</span> <b>Scaled</b> ${esc(quantidadeCross(m, m.scaled))}</span>
          ${m.carga ? `<span class="wod-carga mut">Carga ${esc(m.carga.rx)} · Scaled ${esc(m.carga.scaled)}</span>` : ''}
          ${podeTrocar ? `<button class="ex-trocar" type="button" data-trocar-cross="${i + 1}"
            aria-label="Trocar ${esc(m.nome)} (WOD, movimento ${i + 1})">trocar</button>` : ''}
        </li>`).join('');
  const conta = textoContaWod(w, doc.alunosPorAula);
  return `
    <div class="metabolico wod${b.papel === 'principal' ? ' principal' : ''}">
      <h4>Cross <span class="mut">· ${esc(tituloWod(w))}${b.papel === 'alternativa' ? ' · alternativa' : ''}</span></h4>
      <p class="mut">${esc(w.descricao)}</p>
      ${caixaAlerta('Equipamento do WOD acima do limite', alertas, 'Os movimentos envolvidos estão marcados. Troque um deles, sorteie de novo ou ajuste o inventário.')}
      <ol class="wod-movs">${movs}</ol>
      ${conta ? `<p class="mut dia-rodape">${esc(conta)}</p>` : ''}
    </div>`;
}

/**
 * O Hyrox no cartão do dia: o formato, a corrida (com a air bike) e as
 * estações numa tabela com os 4 níveis. Estação na substituta leva o selo e a
 * estação da prova embaixo; em alerta fica vermelha; com `hoje`, a que tem
 * substituta ganha "trocar".
 * @param {any} doc @param {any} dia @param {{modalidade: string, papel: string}} b @param {string} [hoje]
 */
function blocoHyrox(doc, dia, b, hoje) {
  const h = dia.hyrox;
  const emAlerta = estacoesEmAlerta(doc);
  const podeTrocar = hoje !== undefined && conteudoEditavel(doc, 'hyrox', hoje);
  const nomeDe = new Map(h.estacoes.map((e) => [e.estacao, e.nome]));
  const alertas = (doc.alertasHyrox ?? []).map((a) => textoAlertaHyrox(a, nomeDe.get(a.estacao)));
  const celulas = (valores) => valores.map((v) => `<td class="hy-num">${esc(v)}</td>`).join('');
  const corrida = linhasDaCorrida(h).map((l) => `
          <tr class="hy-corrida"><th scope="row">${esc(l.rotulo)}${l.unidade ? ` <span class="mut">(${esc(l.unidade)})</span>` : ''}</th>${celulas(l.valores)}</tr>`).join('');
  const estacoes = h.estacoes.map((e) => `
          <tr class="hy-estacao${emAlerta.has(e.estacao) ? ' em-alerta' : ''}${e.substituta ? ' substituta' : ''}">
            <th scope="row">
              <span class="hy-n">${esc(e.n)}</span> <span class="hy-nome">${esc(e.nome)}</span>
              <span class="mut hy-unid">(${esc(UNIDADE_HYROX[e.tipo] ?? e.tipo)})</span>
              ${e.substituta ? `<span class="hy-sub">substituta de ${esc(e.base)}</span>` : ''}
              ${podeTrocar && temSubstitutaHyrox(e.estacao) ? `<button class="ex-trocar hy-trocar" type="button" data-trocar-hyrox="${esc(e.estacao)}"
                aria-label="Trocar ${esc(e.nome)} (Hyrox, estação ${esc(e.n)})">trocar</button>` : ''}
            </th>${celulas(NIVEIS_HYROX.map((n) => String(e.prescricao?.[n.id] ?? '—')))}
          </tr>`).join('');
  return `
    <div class="metabolico hyrox${b.papel === 'principal' ? ' principal' : ''}">
      <h4>Hyrox <span class="mut">· ${esc(tituloHyrox(h))}${b.papel === 'alternativa' ? ' · alternativa' : ''}</span></h4>
      <p class="mut">${esc(h.descricao)}</p>
      ${caixaAlerta('Estação do Hyrox sem equipamento', alertas, 'Troque a estação pela substituta ou ajuste o inventário.')}
      <table class="hy-tabela">
        <thead><tr><th scope="col"><span class="sr">Estação</span></th>${NIVEIS_HYROX.map((n) => `<th scope="col" title="${esc(n.nome)}">${esc(n.curto)}</th>`).join('')}</tr></thead>
        <tbody>${corrida}${estacoes}
        </tbody>
      </table>
      <p class="mut dia-rodape">A corrida vem antes de cada estação. Air bike: mesmo esforço, sem impacto.</p>
    </div>`;
}

/**
 * Uma estação do HIIT: os 4 slots, com D e E no unilateral (dois slots seguidos,
 * ligados) e o slot em alerta em vermelho. Com `podeTrocar`, cada EXERCÍCIO
 * ganha "trocar" — o unilateral uma vez só, na linha do D.
 * @param {any} e @param {Set<string>} emAlerta @param {boolean} [podeTrocar]
 */
function cartaoEstacao(e, emAlerta, podeTrocar = false) {
  const slots = e.slots ?? [];
  const linhas = slots.map((x, i) => {
    const classes = ['hiit-slot', x.lado ? `uni uni-${x.lado === 'D' ? 'd' : 'e'}` : '', emAlerta.has(`${e.estacao}:${i}`) ? 'em-alerta' : '']
      .filter(Boolean).join(' ');
    const lado = x.lado
      ? `<span class="hiit-lado" title="${x.lado === 'D' ? 'Lado direito' : 'Lado esquerdo'}">${esc(x.lado)}</span>` : '';
    const trocar = podeTrocar && x.lado !== 'E'
      ? `<button class="ex-trocar hiit-trocar" type="button" data-trocar-hiit="${esc(e.estacao)}:${i + 1}"
          aria-label="Trocar ${esc(x.nome)} (${esc(e.nome)}, slot ${i + 1})">trocar</button>` : '';
    return `<li class="${classes}"><span class="hiit-n">${i + 1}</span><span class="hiit-nome">${esc(x.nome)}</span>${lado}${trocar}</li>`;
  });
  // Estação incompleta (só por edição à mão): o slot vazio aparece, e publicar avisa.
  for (let i = slots.length; i < 4; i++) linhas.push(`<li class="hiit-slot vazio"><span class="hiit-n">${i + 1}</span><span class="hiit-nome mut">vazio</span></li>`);
  return `<article class="hiit-estacao">
    <h4>${esc(e.nome)}</h4>
    <ol class="hiit-slots">${linhas.join('')}</ol>
  </article>`;
}

/**
 * A faixa do HIIT da semana, abaixo da grade: UMA vez, porque o mesmo HIIT está
 * na sexta e no sábado. Semana gerada antes do gerador do HIIT não tem faixa.
 * `hoje` ('AAAA-MM-DD') liga o "trocar"; sem ele, a faixa é só leitura.
 * @param {any} doc @param {string} [hoje]
 */
function faixaHiit(doc, hoje) {
  const h = hiitDaSemana(doc);
  if (!h) return '';
  const lista = doc.alertasHiit ?? [];
  const nomes = nomesDoHiit(doc);
  const emAlerta = slotsEmAlertaHiit(doc);
  const podeTrocar = hoje !== undefined && hiitEditavel(doc, hoje);
  const turma = Number.isInteger(doc.alunosPorAula)
    ? ` · turma de ${doc.alunosPorAula}, até ${alunosPorEstacao(doc.alunosPorAula)} por estação` : '';
  const alerta = lista.length ? `<div class="hiit-alerta" role="alert">
      <h4>⚠ Equipamento do HIIT acima do limite</h4>
      <ul>${lista.map((a) => `<li>${esc(textoAlertaHiit(a, nomes))}</li>`).join('')}</ul>
      <p class="mut">Os slots envolvidos estão marcados. Sorteie de novo ou ajuste o inventário.</p>
    </div>` : '';
  return `<section class="card hiit-semana${lista.length ? ' hiit-estourado' : ''}" id="hiit-da-semana">
    <header class="hiit-h"><h3>HIIT da semana <span class="mut">· ${esc(rotuloDiasHiit(h.dias))}</span></h3></header>
    <p class="hiit-protocolo"><b>Cada estação:</b> ${esc(h.protocolo)}<span class="mut">${esc(turma)}</span></p>
    ${alerta}
    <div class="hiit-estacoes">${h.estacoes.map((e) => cartaoEstacao(e, emAlerta, podeTrocar)).join('')}</div>
    <p class="mut hiit-rodape">As 4 estações rodam ao mesmo tempo, na mesma música: o slot 1 de todas acontece junto.
      <span class="hiit-lado">D</span> <span class="hiit-lado">E</span> = exercício unilateral, um lado em cada slot.</p>
  </section>`;
}

/**
 * O detalhe de uma semana: ações, alertas, notas e a grade dos 6 dias.
 * `hoje` ('AAAA-MM-DD') liga o botão "trocar"; sem ele, a grade é só leitura.
 * @param {{chave: string, rotulo: string, inicio: string, doc: any, ocupado?: boolean, hoje?: string}} o
 */
export function renderSemana({ chave, rotulo, inicio, doc, ocupado = false, hoje }) {
  const estado = estadoDaSemana(doc);
  const cabeca = `<header class="detalhe-h"><h2>Semana ${esc(chave)} <span class="mut">· ${esc(rotulo)}</span></h2>${selo(estado)}</header>`;
  if (!doc) return `${cabeca}${acoes({ chave, inicio, doc, ocupado })}`;
  const datas = datasDosDias(doc.dataInicio);
  return `${cabeca}
    ${acoes({ chave, inicio, doc, ocupado })}
    ${alertas(doc)}
    ${avisosEdicao(doc)}
    ${notasDoGerador(doc)}
    <div class="grade-dias">${DIAS.map((d) => cartaoDia(doc, d, datas[d.id], ocupado ? undefined : hoje)).join('')}</div>
    ${faixaHiit(doc, ocupado ? undefined : hoje)}`;
}
