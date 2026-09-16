// @ts-check
/**
 * A TURMA — a coluna que mostra o treino de cada aluno no dia que está aberto.
 *
 * Aqui a ideia do Montador v2 aparece na tela: o treino é um só, e cada linha
 * desta lista é a versão de um aluno dele, derivada na hora do perfil da ficha.
 * Nada disto é gravado por aluno — é recalculado sempre que o treino base ou a
 * ficha mudam, e é o que faz o coach montar o mês sem revisar 8 versões por dia.
 *
 * A regra mora em `compartilhado/regras/perfil-treino.js`, e a mesma função vai
 * rodar no aparelho do aluno na Etapa 5. Esta tela não decide nada sozinha.
 */
import { versaoDoAluno } from '../../../compartilhado/regras/perfil-treino.js';
import { metasDoAluno, focoDe } from '../../../compartilhado/regras/metas-aluno.js';
import { volumeDaSemanaDoAluno } from '../../../compartilhado/regras/volume-aluno.js';
import { GRUPO_LABEL } from '../../../compartilhado/regras/grupos.js';
import { EXERCICIO_POR_ID } from '../../../compartilhado/dados/exercicios.js';
import { painel, confirmar } from '../../../compartilhado/ui/dialogo.js';
import { listarAlunos, perfilDe, atualizarPerfil } from './alunos.js';
import * as store from './store.js';

const esc = (/** @type {any} */ v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (/** @type {number} */ n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const exercicioPorId = (/** @type {string} */ id) => EXERCICIO_POR_ID[id] || null;

/**
 * A versão de cada aluno da turma para este treino, já com o que ele fez na
 * semana (dias previstos da ficha dele) alimentando a redistribuição.
 * @param {any} treino
 */
export function turmaDoDia(treino) {
  const treinos = store.listarTreinosDoMes(treino.dateId.slice(0, 7));
  // A semana pode atravessar o mês (31/08 a 06/09): junta o mês anterior quando
  // o dia está na primeira semana, senão o volume de segunda some da conta.
  const anterior = store.listarTreinosDoMes(mesAnterior(treino.dateId));
  const doMes = [...anterior, ...treinos];
  return listarAlunos().map((aluno) => {
    const perfil = perfilDe(aluno);
    const feitoPorGrupo = volumeDaSemanaDoAluno(doMes, treino.dateId, { diasTreino: aluno.diasTreino });
    const versao = versaoDoAluno({ base: treino, perfil, feitoPorGrupo, exercicioPorId });
    return { aluno, perfil, feitoPorGrupo, versao, metas: metasDoAluno(perfil) };
  });
}

/** 'YYYY-MM' do mês anterior ao de um dateId. */
function mesAnterior(dateId) {
  const [a, m] = dateId.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** Barra "perna 14/16" do grupo em foco. */
function barraDeFoco({ perfil, feitoPorGrupo, metas, versao }) {
  const foco = focoDe(perfil);
  if (!foco.length) return '<span class="mut">sem foco</span>';
  return foco.map((g) => {
    const doDia = versao.linhas.filter((l) => l.grupo === g).reduce((s, l) => s + l.series, 0);
    const feito = (feitoPorGrupo[g] || 0) + doDia;
    const meta = metas[g];
    const pct = Math.min(100, Math.round((feito / meta) * 100));
    return `<span class="foco-barra" title="${esc(GRUPO_LABEL[g])} na semana, contando hoje">
      ${esc(GRUPO_LABEL[g])} ${num(feito)}/${meta}
      <span class="barra"><span style="width:${pct}%"></span></span>
    </span>`;
  }).join('');
}

/** Desenha a turma inteira dentro de `alvo`. @param {HTMLElement} alvo @param {any} treino */
export function renderTurma(alvo, treino) {
  const turma = turmaDoDia(treino);
  if (!turma.length) {
    alvo.innerHTML = '<p class="vazio">Nenhum aluno ativo na Gestão. A turma sai de lá, não daqui.</p>';
    return turma;
  }
  const linhas = turma.map(({ aluno, perfil, versao }, i) => {
    const focoTxt = focoDe(perfil).map((g) => GRUPO_LABEL[g].toLowerCase()).join(' e ');
    const alerta = versao.linhas.some((l) => l.restrito);
    return `
      <div class="aluno-linha ${alerta ? 'alerta' : ''}" data-aluno="${i}">
        <span class="aluno-nome">${esc(aluno.nome || 'Sem nome')}</span>
        <span class="aluno-perfil">${esc(perfil.objetivo || 'sem objetivo')}${focoTxt ? ` · foco ${esc(focoTxt)}` : ''}</span>
        <span class="aluno-total">${num(versao.total)} séries</span>
        <span class="aluno-foco">${barraDeFoco(turma[i])}</span>
        <button class="btn ghost btn-sm" data-acao="ver">ver</button>
      </div>
      ${versao.avisos.length ? `<p class="aluno-aviso">${versao.avisos.map(esc).join(' · ')}</p>` : ''}`;
  }).join('');
  const totais = new Set(turma.map((t) => t.versao.total));
  alvo.innerHTML = `
    <div class="turma-cab">
      <h3>Turma (${turma.length})</h3>
      <span class="mut">${totais.size === 1
        ? 'todos com o mesmo total de séries da turma'
        : 'totais diferentes — veja os avisos abaixo'}</span>
    </div>
    ${linhas}`;
  return turma;
}

/** Abre o painel com a versão de um aluno. @param {any} item @param {()=>void} aoMudar */
export async function abrirAluno(item, aoMudar) {
  const { aluno, perfil, versao } = item;
  const linhas = versao.linhas.map((l) => `
    <tr class="${l.restrito ? 'restrito' : ''}">
      <td>${esc(l.nome)}${l.travado ? ' 🔒' : ''}</td>
      <td class="n">${l.restrito ? '—' : l.series}${l.series !== l.seriesBase && !l.restrito ? ` <small>(turma ${l.seriesBase})</small>` : ''}</td>
      <td>${esc(l.reps || '—')}</td>
      <td>${esc(l.descansoSeg ? l.descansoSeg + 's' : '—')}</td>
      <td class="motivo">${l.motivos.map(esc).join('<br>') || '—'}</td>
    </tr>`).join('');
  const corpo = `
    <p class="mut">${esc(perfil.objetivo || 'sem objetivo')}${focoDe(perfil).length ? ` · foco ${focoDe(perfil).map((g) => GRUPO_LABEL[g].toLowerCase()).join(' e ')}` : ' · sem foco'} ·
      total ${num(versao.total)} séries (turma: ${num(versao.totalBase)})</p>
    ${versao.avisos.length ? `<p class="aviso-painel">${versao.avisos.map(esc).join('<br>')}</p>` : ''}
    <table class="tab-aluno">
      <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Descanso</th><th>Por quê</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="mut peq">O ajuste só daquele dia e o Publicar entram na próxima entrega. Aqui, o que muda é o perfil — e vale de hoje em diante.</p>`;

  const escolha = await painel({
    titulo: aluno.nome || 'Aluno',
    corpoHTML: corpo,
    acoes: [{ id: 'foco', label: 'Mudar o foco' }],
  });
  if (escolha === 'foco') await trocarFoco(item, aoMudar);
}

/** Troca o foco do aluno na FICHA — vale de hoje em diante, não só neste dia. */
async function trocarFoco(item, aoMudar) {
  const { aluno, perfil } = item;
  const atual = focoDe(perfil);
  const opcoes = Object.entries(GRUPO_LABEL).map(([g, label]) =>
    `<label class="dia-check"><input type="checkbox" name="foco-painel" value="${g}"${atual.includes(g) ? ' checked' : ''}/><span>${esc(label)}</span></label>`).join('');
  const r = await painel({
    titulo: `Foco de ${aluno.nome || 'aluno'}`,
    corpoHTML: `<p class="mut">Até dois grupos. Isso muda a ficha dele na Gestão e vale em todos os dias, não só neste.</p>
      <div class="foco-grade">${opcoes}</div>`,
    acoes: [{ id: 'salvar', label: 'Salvar na ficha' }],
  });
  if (r !== 'salvar') return;
  // O corpo do modal continua no DOM depois de fechar — é de lá que sai a escolha.
  const marcados = [...document.querySelectorAll('#modal-app-corpo input[name="foco-painel"]:checked')].map((i) => /** @type {HTMLInputElement} */ (i).value);
  const escolhidos = marcados.slice(0, 2);
  if (marcados.length > 2 && !await confirmar({
    titulo: 'Foco vale para dois grupos',
    texto: `Você marcou ${marcados.length}. Vou guardar ${escolhidos.map((g) => GRUPO_LABEL[g].toLowerCase()).join(' e ')} — focar em tudo é não focar em nada.`,
    ok: 'Pode guardar',
  })) return;
  atualizarPerfil(aluno.id, { foco: escolhidos });
  aoMudar();
}
