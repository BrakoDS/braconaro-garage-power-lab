// @ts-check
/**
 * Tela Agenda — o calendário do mês: reavaliações, aniversários e feriados
 * (com a decisão do coach: o box abriu ou não).
 *
 * Saiu do `app.js` no fatiamento. A conta do que cai em cada dia é pura
 * (`eventosDoMes`); a lista de feriados é a de compartilhado/regras/feriados.js,
 * e a decisão "o box abriu?" é gravada no banco (`db.marcarFeriado`) — a mesma
 * que o check-in e o Portal leem para não dar falta em dia de porta fechada.
 *
 * Quando desenha: ao abrir a tela ('abrir-tela' → 'agenda'), que volta para o
 * mês atual, a cada troca de mês e depois de cada decisão de feriado.
 */
import * as db from './db.js?v=28';
import { feriadosDoMes, feriadoEm } from '../../compartilhado/regras/feriados.js?v=28';
import { mesIdAtual, rotuloMesFin, addMesFin } from './financeiro-aluno.js?v=28';
import { esc, hoje, fmtDataCurta } from './util/formato.js?v=28';
import { $ } from './util/dom.js?v=28';
import { on, EVENTOS } from './estado.js?v=28';
import { painel as painelReal } from '../../compartilhado/ui/dialogo.js?v=28';
import { proxReav, eventosDoMes } from '../../compartilhado/regras/agenda.js?v=28';

let agMes = mesIdAtual();

/** @type {{ painel: (o: any) => Promise<string|null> }} */
let deps = { painel: painelReal };

// A conta mora em compartilhado/regras/agenda.js (o Calendário e o hub usam a mesma).
export { proxReav, eventosDoMes };

function renderAgenda() {
  $('#ag-mes-lbl').textContent = rotuloMesFin(agMes);
  const [ano, mes] = agMes.split('-').map(Number);
  const evs = eventosDoMes(db.listar(), ano, mes);

  // Feriados do mês: a lista é lei (compartilhado/regras/feriados.js) e a decisão
  // "o box abriu?" é do coach (db.feriadosDoBox). O calendário mostra as duas
  // coisas, porque são diferentes: o feriado existe independente de ele abrir.
  const feriados = feriadosDoMes(ano, mes);
  const decisao = db.feriadosDoBox();

  const primeiroDiaSem = new Date(ano, mes - 1, 1).getDay();
  const totalDias = new Date(ano, mes, 0).getDate();
  const hojeIso = hoje();

  let html = `<div class="ag-grid ag-hdr">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<div class="ag-wd">${d}</div>`).join('')}</div><div class="ag-grid">`;
  for (let i = 0; i < primeiroDiaSem; i++) html += '<div class="ag-cell vazio"></div>';
  for (let d = 1; d <= totalDias; d++) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvs = evs[d] || [];
    const chips = dayEvs.slice(0, 2).map((e) =>
      `<span class="ag-chip ${e.tipo}" title="${esc((e.tipo === 'reav' ? 'Reavaliação: ' : 'Aniversário: ') + e.nome)}">${e.tipo === 'reav' ? '🔄' : '🎂'} ${esc(e.nome.split(' ')[0])}</span>`).join('');
    const mais = dayEvs.length > 2 ? `<span class="ag-mais">+${dayEvs.length - 2}</span>` : '';

    const fer = feriados.find((f) => f.data === iso);
    let fchip = '';
    let cls = '';
    if (fer) {
      const abriu = decisao[iso];
      // Três estados de propósito: sem decisão (o padrão conta presença normal),
      // fechado (não gera falta) e aberto (o coach abriu por exceção).
      const rot = abriu === false ? 'não abriu' : abriu === true ? 'abriu' : 'decidir';
      cls = ` feriado ${fer.tipo}${abriu === false ? ' fechado' : ''}`;
      fchip = `<button class="ag-fer" data-fer="${iso}" type="button"
        title="${esc(fer.nome)} · ${fer.tipo === 'facultativo' ? 'ponto facultativo' : 'feriado ' + fer.tipo}">
        ${esc(fer.nome.split('—')[0].split('(')[0].trim())}<small>${rot}</small></button>`;
    }
    html += `<div class="ag-cell${iso === hojeIso ? ' hoje' : ''}${cls}"><span class="ag-dia">${d}</span>${fchip}${chips}${mais}</div>`;
  }
  html += '</div>';
  $('#ag-cal').innerHTML = html;
}

/**
 * Liga a tela ao roteador e os botões dela. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarTelaAgenda(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.ABRIR_TELA, (t) => { if (t === 'agenda') { agMes = mesIdAtual(); renderAgenda(); } });
  $('#ag-prev')?.addEventListener('click', () => { agMes = addMesFin(agMes, -1); renderAgenda(); });
  $('#ag-next')?.addEventListener('click', () => { agMes = addMesFin(agMes, 1); renderAgenda(); });

  /*
   * Clique na ficha de feriado: pergunta se o box abriu. É delegado no container
   * do calendário, que `renderAgenda()` redesenha inteiro a cada mês — ligar no
   * botão empilharia um listener por navegação de mês.
   */
  $('#ag-cal')?.addEventListener('click', async (/** @type {any} */ ev) => {
    const b = ev.target.closest('[data-fer]');
    if (!b) return;
    const iso = b.dataset.fer;
    const fer = feriadoEm(iso);
    if (!fer) return;
    const atual = db.feriadosDoBox()[iso];
    const acao = await deps.painel({
      titulo: fer.nome,
      corpoHTML: `<p class="dlg-texto">${fmtDataCurta(iso)} · ${fer.tipo === 'facultativo' ? 'ponto facultativo' : `feriado ${fer.tipo}`}.</p>
      <p class="dlg-texto mut">O box abriu neste dia? Marcando <b>não abriu</b>, ninguém recebe falta —
      nem aqui, nem no Portal do aluno. ${atual === undefined ? 'Sem decisão, o dia conta presença normalmente.' : ''}</p>`,
      acoes: [
        { id: 'fechou', label: 'Não abriu' },
        { id: 'abriu', label: 'Abriu normal' },
        ...(atual === undefined ? [] : [{ id: 'limpar', label: 'Limpar decisão', perigo: true }]),
      ],
      largo: false,
    });
    if (!acao) return;
    db.marcarFeriado(iso, acao === 'fechou' ? false : acao === 'abriu' ? true : null);
    renderAgenda();
  });
}
