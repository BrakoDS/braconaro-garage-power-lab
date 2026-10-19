// @ts-check
/**
 * O HTML da aba Catálogo, como STRING — sem DOM, para o teste rodar no Node.
 * Mesma divisão do Inventário: regra de exibição em `core/catalogo.js`,
 * marcação aqui, eventos em `catalogo.js`.
 */
import {
  MODALIDADES_CATALOGO, ROTULO_ADAPTACAO, ROTULO_EQUIPAMENTO, ROTULO_ESTACAO_HIIT, ROTULO_INSTANCIA, ROTULO_MUSCULO,
  ROTULO_PADRAO_CROSS, ROTULO_UNIDADE, contagemPorModalidade, gruposDoCatalogo, ondeEntra, rotulo,
} from '../core/catalogo.js';
import { esc } from './render.js';

/** O que vale (e o que não vale) mudar aqui — fica no topo da aba. */
export const AVISO_CATALOGO = 'O que muda aqui vale na próxima geração da semana (e no "sortear de novo"), nas trocas manuais e no volume por músculo do aluno. '
  + 'Semana já gravada guarda o nome de quando foi salva. Desativado: o gerador deixa de escolher, mas a semana que já o usa continua valendo.';

/** @param {string[]} chaves @param {Record<string, string>} mapa */
const nomes = (chaves, mapa) => chaves.map((k) => rotulo(mapa, k)).join(', ');

/**
 * A barra da aba: modalidades com a contagem, busca, desativados e "Novo exercício".
 * @param {any} estado
 */
function barra(estado) {
  const { exercicios, hyrox } = estado.dados;
  const conta = contagemPorModalidade(exercicios, hyrox.length);
  const abas = MODALIDADES_CATALOGO.map((m) => {
    const c = conta[m.id];
    const numero = c.ativos === c.total ? `${c.total}` : `${c.ativos}/${c.total}`;
    return `<button class="cat-aba${estado.modalidade === m.id ? ' ativa' : ''}" type="button" data-cat-modalidade="${m.id}"
      aria-pressed="${estado.modalidade === m.id}">${esc(m.nome)} <span class="cat-conta">${esc(numero)}</span></button>`;
  }).join('');
  const dis = estado.ocupado ? ' disabled' : '';
  return `<section class="panel cat-barra">
      <div class="cat-abas" role="group" aria-label="Modalidade">${abas}</div>
      <div class="cat-filtros">
        <label class="field cat-busca"><span class="inv-rotulo">Buscar</span>
          <input type="search" id="cat-busca" value="${esc(estado.busca)}" placeholder="Nome, músculo ou equipamento" autocomplete="off" />
        </label>
        <label class="cat-check"><input type="checkbox" id="cat-inativos"${estado.mostrarInativos ? ' checked' : ''} /> Mostrar desativados</label>
        <button class="btn" type="button" data-cat-novo${dis}>+ Novo exercício</button>
      </div>
      <p class="mut cat-aviso">${esc(AVISO_CATALOGO)}</p>
    </section>`;
}

/** Os selos do exercício. @param {any} e */
function selos(e) {
  return [
    !e.ativo ? '<span class="selo cat-selo-inativo">Desativado</span>' : '',
    e.origem === 'coach' ? '<span class="selo cat-selo-coach">Criado pelo coach</span>' : '',
    e.editado ? '<span class="selo cat-selo-editado">Editado</span>' : '',
    e.unilateral ? '<span class="selo cat-selo-uni">Unilateral</span>' : '',
  ].join('');
}

/** @param {any} e @param {boolean} ocupado */
function cartaoExercicio(e, ocupado) {
  const dis = ocupado ? ' disabled' : '';
  const adapt = e.adaptacoes.length
    ? `<dd>${e.adaptacoes.map((a) => `${esc(rotulo(ROTULO_ADAPTACAO, a.adaptacao))} → ${esc(a.nome)}`).join(' · ')}</dd>`
    : '<dd class="mut">—</dd>';
  const era = e.original && e.original.nome !== e.nome ? `<p class="cat-era mut">No catálogo base: ${esc(e.original.nome)}</p>` : '';
  return `<article class="card cat-ex${e.ativo ? '' : ' inativo'}" data-cat-id="${esc(e.id)}">
      <header class="cat-ex-h">
        <h4>${esc(e.nome)}</h4>
        <div class="cat-selos">${selos(e)}</div>
      </header>
      ${era}
      <dl class="cat-dados">
        <dt>Principal</dt><dd><b>${esc(nomes(e.musculoPrincipal, ROTULO_MUSCULO))}</b></dd>
        <dt>Secundários</dt><dd>${e.musculosSecundarios.length ? esc(nomes(e.musculosSecundarios, ROTULO_MUSCULO)) : '<span class="mut">—</span>'}</dd>
        <dt>Equipamento</dt><dd>${esc(nomes(e.equipamentos, ROTULO_EQUIPAMENTO))}</dd>
        <dt>Adaptações</dt>${adapt}
      </dl>
      <p class="cat-onde">${ondeEntra(e).map((p) => `<span>${esc(p)}</span>`).join('')}</p>
      <div class="cat-acoes">
        <button class="btn ghost" type="button" data-cat-editar="${esc(e.id)}"${dis}>Editar</button>
        ${e.ativo
          ? `<button class="btn ghost danger-txt" type="button" data-cat-ativar="${esc(e.id)}" data-ativo="false"${dis}>Desativar</button>`
          : `<button class="btn" type="button" data-cat-ativar="${esc(e.id)}" data-ativo="true"${dis}>Ativar</button>`}
      </div>
    </article>`;
}

/** As 8 estações da prova, só leitura. @param {any[]} hyrox */
function listaHyrox(hyrox) {
  const linhas = hyrox.map((h) => `<tr>
      <td>${esc(h.n)}</td>
      <td><b>${esc(h.nome)}</b></td>
      <td>${esc(nomes(h.musculoPrincipal, ROTULO_MUSCULO))}<br><span class="mut">${esc(nomes(h.musculosSecundarios, ROTULO_MUSCULO))}</span></td>
      <td>${h.substituta ? `${esc(h.substituta.nome)}<br><span class="mut">${esc(nomes(h.substituta.musculoPrincipal, ROTULO_MUSCULO))}</span>` : '<span class="mut">Sem substituta</span>'}</td>
    </tr>`).join('');
  return `<section class="card cat-grupo">
      <h3>Estações do Hyrox</h3>
      <p class="mut cat-aviso">As 8 estações são as da prova e ficam fixas no servidor (não se editam aqui). Equipamento em manutenção no
        Inventário faz a substituta entrar sozinha na geração.</p>
      <div class="cat-tabela-rolo"><table class="cat-tabela">
        <thead><tr><th>#</th><th>Estação</th><th>Músculos (principal / secundários)</th><th>Substituta</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
    </section>`;
}

/**
 * Só a lista (os grupos) — a busca redesenha isto sem tirar o foco do campo.
 * @param {any} estado
 */
export function renderListaCatalogo(estado) {
  if (estado.modalidade === 'hyrox') return listaHyrox(estado.dados.hyrox);
  const grupos = gruposDoCatalogo(estado.dados.exercicios, {
    modalidade: estado.modalidade, busca: estado.busca, mostrarInativos: estado.mostrarInativos, vocabulario: estado.dados.vocabulario,
  });
  if (!grupos.length) return `<p class="vazio">${estado.busca ? 'Nenhum exercício com essa busca.' : 'Nenhum exercício nesta modalidade.'}</p>`;
  return grupos.map((g) => `<section class="cat-grupo">
      <header class="cat-grupo-h"><h3>${esc(g.titulo)}</h3>${g.subtitulo ? `<span class="mut">${esc(g.subtitulo)}</span>` : ''}
        <span class="cat-conta">${g.itens.filter((e) => e.ativo).length} ativo(s)</span></header>
      <div class="cat-grade">${g.itens.map((e) => cartaoExercicio(e, estado.ocupado)).join('')}</div>
    </section>`).join('');
}

/**
 * A aba inteira.
 * @param {{carregado: boolean, dados: any, modalidade: string, busca: string, mostrarInativos: boolean, ocupado: boolean}} estado
 */
export function renderCatalogo(estado) {
  if (!estado.dados) return `<p class="vazio">${estado.carregado ? 'Carregando o catálogo…' : 'O catálogo carrega quando a aba abre.'}</p>`;
  return `${barra(estado)}<div id="catalogo-lista" class="cat-lista">${renderListaCatalogo(estado)}</div>`;
}

/* ───────────────────────────── o formulário ───────────────────────────── */

/**
 * Grupo de caixinhas (músculos, equipamentos, estações).
 * @param {string} nome @param {readonly string[]} valores @param {Record<string, string>} mapa @param {string[]} marcados @param {string} legenda
 */
function caixas(nome, valores, mapa, marcados, legenda) {
  return `<fieldset class="cat-caixas"><legend>${esc(legenda)}</legend>
    ${valores.map((v) => `<label class="cat-chip"><input type="checkbox" name="${esc(nome)}" value="${esc(v)}"${marcados.includes(v) ? ' checked' : ''} />
      <span>${esc(rotulo(mapa, v))}</span></label>`).join('')}
  </fieldset>`;
}

/** @param {string} nome @param {readonly string[]} valores @param {Record<string, string>} mapa @param {string} atual @param {string} vazio */
function seletor(nome, valores, mapa, atual, vazio) {
  return `<select name="${esc(nome)}">${vazio ? `<option value="">${esc(vazio)}</option>` : ''}
    ${valores.map((v) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(rotulo(mapa, v))}</option>`).join('')}</select>`;
}

/**
 * O formulário de criar (sem `exercicio.id`) ou editar. Ao criar, pede também
 * onde o exercício entra (vaga de força, estações do HIIT, Cross); ao editar,
 * isso fica como está — mudar a vaga de um exercício mexeria em semanas gravadas.
 * @param {{exercicio: any, vocabulario: any, exercicios: any[], erro?: string}} o
 */
export function renderFormExercicio({ exercicio, vocabulario, exercicios, erro = '' }) {
  const e = exercicio ?? {};
  const criando = !e.id;
  const adapt = Object.fromEntries((e.adaptacoes ?? []).map((a) => [a.adaptacao, a.exercicioId]));
  const alvos = exercicios.filter((x) => x.id !== e.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const opcoesAlvo = (atual) => `<option value="">Sem adaptação</option>${alvos.map((x) =>
    `<option value="${esc(x.id)}"${x.id === atual ? ' selected' : ''}>${esc(x.nome)}${x.ativo ? '' : ' (desativado)'}</option>`).join('')}`;
  const cross = e.cross ?? null;

  const modalidade = criando ? `<fieldset class="cat-onde-form"><legend>Onde entra (ao menos um)</legend>
      <label class="field"><span class="inv-rotulo">Força: vaga do H1–H3</span>
        ${seletor('instancia', vocabulario.instancias, ROTULO_INSTANCIA, e.instancia ?? '', 'Não entra na força')}</label>
      ${caixas('estacao', vocabulario.estacoesHiit, ROTULO_ESTACAO_HIIT, e.hiit ?? [], 'HIIT: estações')}
      <label class="cat-check"><input type="checkbox" name="cross"${cross ? ' checked' : ''} /> Entra no WOD do Cross</label>
      <div class="cat-cross">
        <label class="field"><span class="inv-rotulo">Padrão</span>${seletor('cross_padrao', vocabulario.padroesCross, ROTULO_PADRAO_CROSS, cross?.padrao ?? '', 'Escolha')}</label>
        <label class="field"><span class="inv-rotulo">Unidade</span>${seletor('cross_unidade', vocabulario.unidadesCross, ROTULO_UNIDADE, cross?.unidade ?? 'reps', '')}</label>
        <label class="field"><span class="inv-rotulo">RX (1 rodada)</span><input type="number" name="cross_rx" min="1" max="5000" value="${esc(cross?.rx ?? '')}" /></label>
        <label class="field"><span class="inv-rotulo">Carga RX</span><input type="text" name="cross_carga_rx" maxlength="60" placeholder="40/30 kg" value="${esc(cross?.carga?.rx ?? '')}" /></label>
        <label class="field"><span class="inv-rotulo">Carga Scaled</span><input type="text" name="cross_carga_scaled" maxlength="60" placeholder="30/20 kg" value="${esc(cross?.carga?.scaled ?? '')}" /></label>
      </div>
    </fieldset>`
    : `<p class="mut cat-onde">${ondeEntra(e).map((p) => `<span>${esc(p)}</span>`).join('') || 'Sem modalidade.'}</p>`;

  return `<form id="cat-form" class="cat-form" autocomplete="off">
      ${erro ? `<p class="cat-erro" role="alert">${esc(erro)}</p>` : ''}
      <input type="hidden" name="id" value="${esc(e.id ?? '')}" />
      <label class="field"><span class="inv-rotulo">Nome</span>
        <input type="text" name="nome" id="cat-nome" maxlength="100" required value="${esc(e.nome ?? '')}" placeholder="Ex.: Remada curvada com halteres" /></label>
      ${modalidade}
      ${caixas('principal', vocabulario.musculos, ROTULO_MUSCULO, e.musculoPrincipal ?? [], 'Músculo principal (soma 1,0 por série)')}
      ${caixas('secundario', vocabulario.musculos, ROTULO_MUSCULO, e.musculosSecundarios ?? [], 'Secundários (soma 0,5 por série)')}
      ${caixas('equip', vocabulario.equipamentos, ROTULO_EQUIPAMENTO, e.equipamentos ?? [], 'Equipamento')}
      <label class="cat-check"><input type="checkbox" name="unilateral"${e.unilateral ? ' checked' : ''} /> Unilateral (um lado por vez; no HIIT ocupa 2 slots, D e E)</label>
      <fieldset class="cat-adapt"><legend>Adaptações (o aluno com a restrição troca por…)</legend>
        ${vocabulario.adaptacoes.map((a) => `<label class="field"><span class="inv-rotulo">${esc(rotulo(ROTULO_ADAPTACAO, a))}</span>
          <select name="adapt_${esc(a)}">${opcoesAlvo(adapt[a] ?? '')}</select></label>`).join('')}
      </fieldset>
    </form>`;
}
