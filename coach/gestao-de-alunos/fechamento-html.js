// @ts-check
/**
 * O desenho do FECHAMENTO DO MÊS na tela Financeiro do box (etapa 4) — puro,
 * só HTML a partir do retrato e da ficha (testado em fechamento-html.test.js).
 * Quem liga os botões é ui-tela-financeiro.js; as regras moram em
 * fechamento-regras.js.
 *
 *   - a BARRA no topo do mês: "Este mês já acabou e ainda não foi fechado"
 *     (Fechar o mês), "Mês fechado em DD/MM" (Ver o retrato, Reabrir) ou
 *     "Reaberto em DD/MM · motivo" (Fechar o mês de novo);
 *   - o RETRATO (a prévia antes de aprovar, e o aprovado): os totais, o que
 *     conferir e a lista, aluno por aluno;
 *   - a LINHA de um aluno num mês fechado: pelo retrato, com o pagamento de agora.
 */
import { brl, rotuloMesFin, textoDoRecebimento } from './financeiro-aluno.js?v=35';
import { esc } from './util/formato.js?v=35';
import { estaFechado, podeFechar, faturaFechada } from './fechamento-regras.js?v=35';

/** 'DD/MM' de um instante, no relógio deste aparelho (o do coach). @param {number} ms */
function ddmmDe(ms) {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/**
 * A barra do fechamento no topo do mês. '' quando não há nada a dizer (mês
 * corrente, ou antes de outubro de 2026).
 * @param {any} doc o fechamento do mês, ou null @param {string} mesId @param {string} hojeIso
 */
export function htmlBarraFechamento(doc, mesId, hojeIso) {
  if (estaFechado(doc)) {
    const n = Object.keys(doc.linhas || {}).length;
    return `<div class="fin-fechamento fechado" role="status">
      <span>🔒 <b>Mês fechado</b> em ${ddmmDe(doc.aprovadoEm)} · ${n} aluno${n === 1 ? '' : 's'} no retrato · em aberto ao fechar ${brl(doc.totais && doc.totais.emAberto)}</span>
      <span class="fin-fech-acoes">
        <button class="btn ghost btn-sm" data-fech="ver" type="button">Ver o retrato</button>
        <button class="btn ghost btn-sm" data-fech="reabrir" type="button">Reabrir</button>
      </span>
    </div>`;
  }
  const reaberto = doc && doc.situacao === 'reaberto'
    ? `Reaberto em ${ddmmDe(doc.reabertoEm)} · ${esc(doc.motivoReabertura || '')}.` : '';
  if (!podeFechar(mesId, hojeIso)) return reaberto ? `<div class="fin-fechamento aberto" role="status"><span>${reaberto}</span></div>` : '';
  return `<div class="fin-fechamento aberto" role="status">
      <span>${reaberto || 'Este mês já acabou e ainda não foi fechado.'}</span>
      <span class="fin-fech-acoes"><button class="btn btn-sm" data-fech="fechar" type="button">Fechar o mês</button></span>
    </div>`;
}

/** O texto de uma divergência. @param {import('./fechamento-regras.js').Divergencia} d */
function textoDaDivergencia(d) {
  if (d.tipo === 'em-aberto') return `${esc(d.nome)} — em aberto, ${brl(d.total)}`;
  if (d.tipo === 'valor-diferente') return `${esc(d.nome)} — pagou ${brl(d.valor)}, a conta é ${brl(d.total)}`;
  return `${esc(d.nome)} — pago, sem o registro detalhado`;
}

/** O rótulo da situação de uma linha. @param {string} s @param {any} l */
function rotuloDaSituacao(s, l) {
  if (s === 'coberto') return `na conta de ${esc((l.responsavel && l.responsavel.nome) || 'outro aluno')}`;
  return ({ pago: 'pago', vencido: 'em aberto', pendente: 'a vencer', cortesia: 'cortesia', proximo: 'próximo mês' })[s] || esc(s);
}

/**
 * O retrato: a prévia antes de aprovar, ou o aprovado ("Ver o retrato"). Os
 * totais, o que conferir e a lista, em ordem de nome.
 * @param {import('./fechamento-regras.js').Retrato & { versoes?: any[] }} retrato
 */
export function htmlRetrato(retrato) {
  const t = retrato.totais;
  const cartoes = [
    ['Previsto', t.previsto], ['Recebido', t.recebido], ['Em aberto', t.emAberto], ['Consumo', t.consumo], ['Bancado pelo box', t.bancadoPeloBox],
  ].map(([rot, v]) => `<div class="ret-total"><span>${rot}</span><b>${brl(/** @type {number} */ (v))}</b></div>`).join('');
  const div = retrato.divergencias.length
    ? `<ul class="ret-div">${retrato.divergencias.map((d) => `<li class="ret-div-${d.tipo}">${textoDaDivergencia(d)}</li>`).join('')}</ul>`
    : '<p class="hint">Nada a conferir: todo mundo que tinha conta pagou o valor da conta, com o registro.</p>';
  const linhas = Object.entries(retrato.linhas)
    .sort(([, x], [, y]) => x.nome.localeCompare(y.nome, 'pt-BR'))
    .map(([, l]) => `<li><span class="ret-nome">${esc(l.nome)}</span><span class="ret-sit ret-sit-${l.situacao}">${rotuloDaSituacao(l.situacao, l)}</span><span class="ret-v">${l.pagavel ? brl(l.total) : '—'}</span></li>`).join('');
  const versoes = (retrato.versoes || []).length
    ? `<p class="eyebrow">Reaberturas</p><ul class="ret-versoes">${(retrato.versoes || []).map((v) => `<li>Aprovado em ${ddmmDe(v.aprovadoEm)}, reaberto em ${ddmmDe(v.reabertoEm)} · ${esc(v.motivo)} · em aberto ${brl(v.totais && v.totais.emAberto)}</li>`).join('')}</ul>` : '';
  return `<div class="ret">
    <p class="ret-mes">${esc(rotuloMesFin(retrato.mesId))} · ${Object.keys(retrato.linhas).length} alunos</p>
    <div class="ret-totais">${cartoes}</div>
    <p class="eyebrow">O que conferir</p>${div}
    <p class="eyebrow">Aluno por aluno</p><ul class="ret-linhas">${linhas}</ul>
    ${versoes}
  </div>`;
}

/**
 * A linha de um aluno na tela Financeiro num mês FECHADO: os números do retrato
 * e o pagamento de agora (a ficha). Sem a ficha (aluno apagado), só o retrato.
 * @param {string} alunoId @param {import('./fechamento-regras.js').LinhaDoRetrato} linha
 * @param {any} a a ficha, ou null @param {any} doc o fechamento
 */
export function linhaFechadaHTML(alunoId, linha, a, doc) {
  const f = a ? faturaFechada(doc, a) : null;
  const status = f ? f.status : linha.situacao;
  const pagoDepois = !!(f && f.pagoDepois);
  const rotulo = status === 'pago' ? (pagoDepois ? 'Pago depois' : 'Pago')
    : status === 'vencido' ? 'Em aberto' : status === 'cortesia' ? 'Cortesia' : status === 'coberto' ? 'Coberto' : 'Pendente';
  const classe = status === 'pago' ? 'pago' : status === 'vencido' ? 'vencido' : status === 'cortesia' || status === 'coberto' ? 'cortesia' : 'pendente';
  const rec = f && f.status === 'pago' ? f.recebimento : null;
  const recebido = rec ? ` <span class="fin-recebido">· ${esc(textoDoRecebimento(rec))}</span>` : '';
  const marca = linha.responsavel ? `<span class="fin-vinculo">conta de ${esc(linha.responsavel.nome)}</span>` : '';
  const btn = !a || !linha.pagavel ? ''
    : status === 'pago'
      ? `<button class="btn ghost btn-sm fin-toggle" data-id="${esc(alunoId)}" data-op="0" type="button">Desfazer</button>`
      : `<button class="btn btn-sm fin-toggle" data-id="${esc(alunoId)}" data-op="1" type="button">Marcar pago</button>`;
  return `<div class="fin-row fin-row-consumo fin-row-fechada">
      <div class="fin-info"><div class="fin-nome">${esc(linha.nome)}${marca}</div>
        <div class="fin-sub">vence ${ddmm(linha.vencimento)} · ${linha.pagavel ? brl(linha.total) : '—'}${recebido}</div></div>
      <span class="fin-badge ${classe}">${rotulo}</span>
      <div class="fin-acoes">${btn}</div>
    </div>`;
}

/**
 * Os cartões de totais de um mês FECHADO: os do retrato, "ao fechar".
 * @param {import('./fechamento-regras.js').TotaisDoRetrato} t
 */
export function htmlTotaisFechados(t) {
  return `
    <div class="fin-card"><span class="fin-card-l">Recebido ao fechar</span><span class="fin-card-v ok">${brl(t.recebido)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Em aberto ao fechar</span><span class="fin-card-v${t.emAberto > 0 ? ' bad' : ''}">${brl(t.emAberto)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Previsto no mês</span><span class="fin-card-v">${brl(t.previsto)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Consumíveis</span><span class="fin-card-v">${brl(t.consumo)}</span></div>
    <div class="fin-card"><span class="fin-card-l">Investido em parcerias</span><span class="fin-card-v${t.bancadoPeloBox > 0 ? ' parceria' : ''}">${brl(t.bancadoPeloBox)}</span></div>`;
}
