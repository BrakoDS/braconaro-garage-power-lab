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
import { carregarAjustes, salvarAjuste, removerAjuste } from '../cloud-aluno.js';
import * as store from './store.js';

/**
 * As exceções do dia, por aluno, já lidas da nuvem.
 *
 * Ficam num cache de módulo porque a tela redesenha a turma a cada tecla do
 * coach, e ir ao Firestore a cada render seria uma leitura por aluno por
 * caractere digitado. Quem recarrega é a troca de dia (`recarregarAjustes`).
 * @type {Map<string, any>}
 */
const _ajustes = new Map();

/**
 * Lê as exceções de todos os alunos para um dia. Uma leitura por aluno, uma vez
 * por dia aberto — e quem não tem e-mail não tem documento para ler.
 * @param {string} dateId
 */
export async function recarregarAjustes(dateId) {
  _ajustes.clear();
  const comEmail = listarAlunos().filter((a) => a.email);
  const lidos = await Promise.all(comEmail.map(async (a) => {
    try { return [a.email, (await carregarAjustes(a.email))[dateId] || null]; } catch { return [a.email, null]; }
  }));
  for (const [email, ajuste] of lidos) if (ajuste) _ajustes.set(String(email).toLowerCase(), ajuste);
}

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
    const excecao = _ajustes.get(String(aluno.email || '').toLowerCase()) || null;
    const versao = versaoDoAluno({ base: treino, perfil, feitoPorGrupo, excecao, exercicioPorId });
    // A versão SEM a exceção é o ponto de comparação de "o que é ajuste de hoje".
    // Sem ela, o coach que digita de volta o número original gravaria uma exceção
    // igual ao normal — e o aluno ficaria com "ajuste de hoje" para sempre, sem ter.
    const versaoBase = excecao ? versaoDoAluno({ base: treino, perfil, feitoPorGrupo, exercicioPorId }) : versao;
    return { aluno, perfil, feitoPorGrupo, versao, versaoBase, excecao, metas: metasDoAluno(perfil) };
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
  const linhas = turma.map(({ aluno, perfil, versao, excecao }, i) => {
    const focoTxt = focoDe(perfil).map((g) => GRUPO_LABEL[g].toLowerCase()).join(' e ');
    const alerta = versao.linhas.some((l) => l.restrito);
    return `
      <div class="aluno-linha ${alerta ? 'alerta' : ''}" data-aluno="${i}">
        <span class="aluno-nome">${esc(aluno.nome || 'Sem nome')}</span>
        <span class="aluno-perfil">${esc(perfil.objetivo || 'sem objetivo')}${focoTxt ? ` · foco ${esc(focoTxt)}` : ''}</span>
        <span class="aluno-total">${num(versao.total)} séries</span>
        <span class="aluno-foco">${barraDeFoco(turma[i])}</span>
        ${excecao ? '<span class="marca">ajuste de hoje</span>' : ''}
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

/** Opções de troca: exercícios do catálogo com o MESMO padrão de movimento. */
function opcoesDeTroca(l, atualId) {
  const mesmos = Object.values(EXERCICIO_POR_ID)
    .filter((e) => e.padrao === l.padrao && e.id !== l.id)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return `<option value="">—</option>` + mesmos
    .map((e) => `<option value="${esc(e.id)}"${e.id === atualId ? ' selected' : ''}>${esc(e.nome)}</option>`).join('');
}

/**
 * Abre o painel com a versão de um aluno, editável.
 *
 * Duas colunas de edição, e a diferença entre elas é a coisa mais importante
 * desta tela: **hoje** grava uma exceção só daquele dia (`treinoAluno/{email}`),
 * e **sempre** muda a ficha dele na Gestão, valendo de hoje em diante. Misturar
 * as duas é como o coach acaba com um aluno carregando para sempre um limite que
 * era só de uma terça.
 * @param {any} item @param {string} dateId @param {()=>void} aoMudar
 */
export async function abrirAluno(item, dateId, aoMudar) {
  const { aluno, perfil, versao, excecao } = item;
  const semEmail = !aluno.email;
  const linhas = versao.linhas.map((l, i) => {
    const chave = l.id || `pos:${i}`;
    const naoFaz = l.restrito || l.series === 0;
    return `
    <tr class="${naoFaz ? 'restrito' : ''}" data-linha-chave="${esc(chave)}">
      <td>${esc(l.nome)}${l.travado ? ' 🔒' : ''}<br><span class="motivo">${l.motivos.map(esc).join(' · ') || '—'}</span></td>
      <td class="n">${l.travado ? `${l.series} 🔒` : `<input class="campo" type="number" min="0" max="20" data-ajuste="series" value="${naoFaz ? 0 : l.series}" />`}
        ${l.series !== l.seriesBase ? `<br><small>turma ${l.seriesBase}</small>` : ''}</td>
      <td>${esc(l.reps || '—')}${l.descansoSeg ? `<br><small>${l.descansoSeg}s</small>` : ''}</td>
      <td>${l.travado || !l.padrao ? '<span class="mut">—</span>' : `<select data-ajuste="trocaSempre">${opcoesDeTroca(l, restricaoAtual(perfil, l.id))}</select>`}</td>
    </tr>`;
  }).join('');
  const corpo = `
    <p class="mut">${esc(perfil.objetivo || 'sem objetivo')}${focoDe(perfil).length ? ` · foco ${focoDe(perfil).map((g) => GRUPO_LABEL[g].toLowerCase()).join(' e ')}` : ' · sem foco'} ·
      total ${num(versao.total)} séries (turma: ${num(versao.totalBase)})</p>
    ${versao.avisos.length ? `<p class="aviso-painel">${versao.avisos.map(esc).join('<br>')}</p>` : ''}
    <table class="tab-aluno">
      <thead><tr><th>Exercício</th><th>Séries hoje</th><th>Prescrição</th><th>Trocar sempre por</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <label class="obs-aluno">Observação do dia
      <input id="obs-aluno" value="${esc(excecao?.observacao || '')}" placeholder="Segurar a carga hoje." />
    </label>
    <p class="mut peq">“Séries hoje” e a observação valem <b>só em ${esc(dateId)}</b>. “Trocar sempre” muda a ficha do aluno e vale de hoje em diante.
      Zero séries quer dizer que ele não faz o exercício.${semEmail ? ' <b>Este aluno não tem e-mail na ficha: o ajuste do dia não tem onde ser gravado.</b>' : ''}</p>`;

  const acoes = [{ id: 'foco', label: 'Mudar o foco' }];
  if (!semEmail) acoes.unshift({ id: 'salvar', label: 'Salvar o dia' });
  const escolha = await painel({ titulo: aluno.nome || 'Aluno', corpoHTML: corpo, acoes });
  if (escolha === 'foco') { await trocarFoco(item, aoMudar); return; }
  if (escolha === 'salvar') await salvarDoPainel(item, dateId, aoMudar);
}

/** O substituto já cadastrado para um exercício, se houver. */
function restricaoAtual(perfil, id) {
  return (perfil?.restricoes || []).find((r) => r.evitarId === id)?.substitutoId || '';
}

/** Lê o painel (que continua no DOM depois de fechar) e grava o que mudou. */
async function salvarDoPainel(item, dateId, aoMudar) {
  const { aluno, perfil, versao, versaoBase } = item;
  /** @type {Record<string, any>} */
  const linhas = {};
  const trocas = [];
  for (const tr of document.querySelectorAll('#modal-app-corpo tr[data-linha-chave]')) {
    const chave = tr.getAttribute('data-linha-chave');
    const derivada = versao.linhas.find((l, i) => (l.id || `pos:${i}`) === chave);
    // Compara com a versão sem exceção: é o que diz se o número digitado ainda é
    // uma exceção ou se o coach desfez o ajuste dele.
    const semExcecao = versaoBase.linhas.find((l, i) => (l.id || `pos:${i}`) === chave) || derivada;
    const inp = /** @type {HTMLInputElement} */ (tr.querySelector('[data-ajuste="series"]'));
    if (inp && semExcecao && Number(inp.value) !== semExcecao.series) linhas[chave] = { series: Number(inp.value) };
    const sel = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-ajuste="trocaSempre"]'));
    if (sel && sel.value !== restricaoAtual(perfil, derivada?.id)) trocas.push({ evitarId: derivada?.id, substitutoId: sel.value });
  }
  const observacao = /** @type {HTMLInputElement} */ (document.querySelector('#obs-aluno'))?.value.trim() || '';

  // "Sempre" primeiro, e com confirmação: é a mudança que sobrevive ao dia.
  if (trocas.length) {
    const texto = trocas.map((t) => {
      const de = EXERCICIO_POR_ID[t.evitarId]?.nome || t.evitarId;
      return t.substitutoId ? `${de} → ${EXERCICIO_POR_ID[t.substitutoId]?.nome}` : `${de}: volta ao normal`;
    }).join('; ');
    if (await confirmar({
      titulo: `Mudar a ficha de ${aluno.nome || 'aluno'}?`,
      texto: `${texto}. Isso vale em todos os dias, não só hoje.`,
      ok: 'Mudar a ficha',
    })) {
      const restantes = (perfil.restricoes || []).filter((r) => !trocas.some((t) => t.evitarId === r.evitarId));
      const novas = trocas.filter((t) => t.substitutoId).map((t) => ({ ...t, motivo: t.motivo || 'definido no montador' }));
      atualizarPerfil(aluno.id, { restricoes: [...restantes, ...novas] });
    }
  }

  const temAjuste = Object.keys(linhas).length || observacao;
  if (temAjuste) await salvarAjuste(aluno.email, dateId, { linhas, observacao, posAula: false });
  else await removerAjuste(aluno.email, dateId); // voltou ao normal: a exceção some
  await recarregarAjustes(dateId);
  aoMudar();
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
