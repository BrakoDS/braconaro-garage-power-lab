// @ts-check
/**
 * O desenho da tela Aprovações (etapa 7), puro: os cartões das propostas, as
 * decididas e o log das chamadas dos agentes. ui-tela-aprovacoes.js liga ao DOM.
 */
import { esc } from './util/formato.js?v=40';
import { descricaoDaProposta, efeitoDaAprovacao, rotuloDoTime } from './agentes-regras.js?v=40';

/** "11/11 às 14:05". @param {number} ms */
export function quando(ms) {
  if (!(Number(ms) > 0)) return '';
  const d = new Date(ms);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const ROTULO_TIPO = /** @type {Record<string, string>} */ ({
  mensagem: 'Mensagem', baixa: 'Baixa de pagamento', divergencia: 'Divergência', meta: 'Meta', 'pendencia-ficha': 'Pendência de ficha',
});

/** Um cartão de proposta esperando. @param {any} p */
export function htmlProposta(p) {
  const texto = p.tipo === 'mensagem' && p.dados && p.dados.texto
    ? `<blockquote class="apr-texto">${esc(p.dados.texto).replace(/\n/g, '<br>')}</blockquote>` : '';
  return `
    <article class="apr-card" data-id="${esc(p.id)}">
      <header class="apr-hd">
        <span class="ac-chip apr-time apr-${esc(p.time)}">${esc(rotuloDoTime(p.time))}</span>
        <span class="apr-tipo">${esc(ROTULO_TIPO[p.tipo] || p.tipo)}</span>
        <span class="apr-quando">${esc(quando(p.em))}</span>
      </header>
      <p class="apr-aluno"><b>${esc(p.alunoNome || p.alunoId)}</b> · ${esc(descricaoDaProposta(p))}</p>
      ${texto}
      <p class="apr-motivo"><span>Por quê:</span> ${esc(p.motivo || '')}</p>
      <p class="hint">Ao aprovar: ${esc(efeitoDaAprovacao(p))}.</p>
      <div class="apr-botoes">
        <button class="btn btn-sm" data-apr="aprovar" data-id="${esc(p.id)}" type="button">Aprovar</button>
        <button class="btn ghost btn-sm" data-apr="recusar" data-id="${esc(p.id)}" type="button">Recusar</button>
      </div>
    </article>`;
}

/** As decididas mais recentes (até 10). @param {any[]} todas */
export function htmlDecididas(todas) {
  const lista = todas.filter((p) => p && p.situacao !== 'proposta')
    .sort((x, y) => (Number(y.decisao && y.decisao.em) || 0) - (Number(x.decisao && x.decisao.em) || 0)).slice(0, 10);
  if (!lista.length) return '';
  return `<h3 class="apr-sub">Decididas há pouco</h3><ul class="apr-decididas">${lista.map((p) => `
    <li><span class="ac-chip ${p.situacao === 'aprovada' ? 'ac-chip-ok' : 'ac-chip-bad'}">${p.situacao === 'aprovada' ? 'Aprovada' : 'Recusada'}</span>
      ${esc(rotuloDoTime(p.time))} · ${esc(p.alunoNome || '')} · ${esc(descricaoDaProposta(p))}${p.decisao && p.decisao.motivo ? ` <small>— ${esc(p.decisao.motivo)}</small>` : ''}</li>`).join('')}</ul>`;
}

/**
 * O log das chamadas: por time, quantas nas últimas 24h e quando foi a última;
 * e as linhas mais novas (sem os dados devolvidos, que nunca são guardados).
 * @param {any[]} log @param {number} agora
 */
export function htmlLog(log, agora) {
  if (!log.length) return '<p class="hint">Nenhuma chamada de agente ainda.</p>';
  const resumo = ['administrativo', 'alunos', 'desconhecido'].map((t) => {
    const doTime = log.filter((l) => l.time === t);
    if (!doTime.length) return '';
    const dia = doTime.filter((l) => agora - Number(l.em) < 86_400_000);
    const erros = dia.filter((l) => !l.ok).length;
    const nome = t === 'desconhecido' ? 'Chave inválida' : rotuloDoTime(t);
    return `<li><b>${esc(nome)}</b>: ${dia.length} chamada${dia.length === 1 ? '' : 's'} nas últimas 24h${erros ? ` · ${erros} recusada${erros === 1 ? '' : 's'}` : ''} · a última em ${esc(quando(doTime[0].em))}</li>`;
  }).join('');
  const linhas = log.slice(0, 15).map((l) => `
    <tr class="${l.ok ? '' : 'apr-log-erro'}"><td>${esc(quando(l.em))}</td><td>${esc(l.time === 'desconhecido' ? '—' : rotuloDoTime(l.time))}</td>
      <td>${esc(l.funcao || '')}</td><td>${esc(l.consulta || l.tipo || '')}</td><td>${l.registros != null ? esc(String(l.registros)) : ''}</td>
      <td>${l.ok ? 'ok' : esc(`${l.status || ''} ${l.erro || ''}`.trim())}</td></tr>`).join('');
  return `<ul class="apr-resumo">${resumo}</ul>
    <div class="apr-log-wrap"><table class="apr-log"><thead><tr><th>Quando</th><th>Time</th><th>Função</th><th>Consulta / tipo</th><th>Registros</th><th>Resultado</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}
