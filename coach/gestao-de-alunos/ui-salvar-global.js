// @ts-check
/**
 * O salvar global da Ficha do Aluno: um rascunho só para todos os formulários
 * da ficha, uma barra de "alterações não salvas" e uma gravação só.
 *
 * Antes, cada aba (Dados, Anamnese, PAR-Q, Matriz) tinha o próprio Salvar, e
 * trocar de aluno com algo digitado perdia tudo sem aviso. Agora:
 *
 *  - cada aba de formulário se REGISTRA aqui (`registrarFormulario`) com como
 *    se desenha e como se lê, em CAMINHOS de campo ('telefone',
 *    'anamnese.sono', 'matrizIndividualizacao.cargas');
 *  - o que o coach muda vai para o rascunho (perfil-rascunho.js) — só o campo
 *    que ele mexeu, comparado com o que o formulário mostrava ao abrir. Campo
 *    não tocado nunca entra: assim um dado que chega da nuvem no meio da edição
 *    não é desfeito pelo formulário velho na tela;
 *  - toda vez que uma aba abre, ela é desenhada a partir da ficha COM o
 *    rascunho por cima. Trocar de aba não perde nada, e o nível mudado na
 *    Matriz aparece na aba Dados;
 *  - a barra no rodapé diz quantos campos estão pendentes e tem Descartar e
 *    Salvar; as abas com pendência ganham um ponto;
 *  - Salvar grava o rascunho sobre a ficha de AGORA (`montarPatch`); se um
 *    campo editado aqui também mudou em outro aparelho, pergunta qual vale;
 *  - sair da ficha com algo pendente pergunta antes (Salvar e sair /
 *    Descartar / Continuar editando) — e fechar a página, também.
 *
 * O que NÃO passa pelo rascunho continua gravando na hora, como sempre: foto,
 * avaliações, financeiro (pagamento, lançamento), metas, acesso ao Portal e
 * exclusão. Plano: docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md.
 */
import * as db from './db.js?v=18';
import { esc } from './util/formato.js?v=18';
import { $ } from './util/dom.js?v=18';
import { estado, on, emit, EVENTOS, definirGuardaDeSaida } from './estado.js?v=18';
import { criarRascunho, mesmoValor } from './perfil-rascunho.js?v=18';
import { regFicha, regAnamnese, regParq } from './registro.js?v=18';
import { resumoFicha } from './registros-ui.js?v=18';
import { CAMPO as CAMPO_MATRIZ, VERSAO as VERSAO_MATRIZ } from '../../compartilhado/regras/matriz-individualizacao.js?v=18';
import { confirmar, painel, avisar } from '../../compartilhado/ui/dialogo.js?v=18';

/**
 * @typedef {{
 *   aba: string,
 *   desenhar: (vista: any) => void,
 *   ler: () => Record<string, any> | null,
 *   aposSalvar?: () => void,
 * }} Formulario
 *   aba: o id da aba (o painel é `#tab-<aba>`); desenhar: monta o formulário
 *   com a ficha recebida (a ficha COM o rascunho); ler: o que está no
 *   formulário agora, por caminho de campo (null se o formulário não está lá);
 *   aposSalvar: avisada depois de gravar, antes de a aba se redesenhar (os
 *   cards da aba Geral voltam ao modo leitura)
 */

/* ============================================================
   Puro
   ============================================================ */

/**
 * Um objeto como caminhos: `{ sono: '7' }` com prefixo 'anamnese' vira
 * `{ 'anamnese.sono': '7' }`.
 * @param {string} prefixo @param {Record<string, any>} obj
 */
export function comPrefixo(prefixo, obj) {
  /** @type {Record<string, any>} */ const r = {};
  for (const [k, v] of Object.entries(obj || {})) r[`${prefixo}.${k}`] = v;
  return r;
}

/**
 * Os caminhos que mudaram neste formulário: os que diferem do que ele mostrava
 * ao abrir (`antes`), mais os já `tocados` — um campo mudado e depois voltado
 * ao valor de antes precisa passar de novo, para sair do rascunho.
 * @param {Record<string, any>} lidos @param {Record<string, any>} antes @param {Set<string>} tocados
 * @returns {string[]}
 */
export function caminhosMudados(lidos, antes, tocados) {
  return Object.keys(lidos).filter((c) => tocados.has(c) || !mesmoValor(lidos[c], antes[c]));
}

/**
 * O que fazer com um campo mexido: voltou ao que o formulário mostrava ao
 * abrir → sai do rascunho; senão → entra com o valor novo. Comparar só com a
 * ficha não basta: um formulário pode mostrar um padrão onde a ficha não tem
 * nada (a Matriz mostra impacto "livre" para quem não tem matriz), e aí
 * adicionar e remover uma lesão deixaria a ficha "suja" para sempre. A exceção
 * é o campo que já estava no rascunho quando o formulário abriu: voltar ao que
 * ele mostrava é voltar à edição anterior, que continua valendo.
 * @param {any} valor o que está no formulário @param {any} mostrado o que ele mostrava ao abrir
 * @param {boolean} jaNoRascunho o campo já estava no rascunho quando o formulário abriu
 * @returns {'definir' | 'descartar'}
 */
export function acaoDoCampo(valor, mostrado, jaNoRascunho) {
  return !jaNoRascunho && mesmoValor(valor, mostrado) ? 'descartar' : 'definir';
}

/**
 * O campo já tem edição no rascunho — nele mesmo, num campo de fora que o
 * contém, ou num de dentro? Duas abas podem editar o mesmo dado em
 * granularidades diferentes: a Matriz guarda `adaptacoes` inteiro e a Saúde,
 * `adaptacoes.lesoes`. O que o formulário mostra veio dessa edição, e voltar
 * a ele não pode apagá-la.
 * @param {string} caminho @param {string[]} pendentes os caminhos do rascunho
 */
export function cruzaComRascunho(caminho, pendentes) {
  return pendentes.some((p) => p === caminho || caminho.startsWith(p + '.') || p.startsWith(caminho + '.'));
}

/** "1 campo" / "3 campos". @param {number} n */
const campos = (n) => `${n} ${n === 1 ? 'campo' : 'campos'}`;

/**
 * A barra do rodapé.
 * @param {{ pendentes: number, salvo?: boolean }} o
 */
export function htmlBarra({ pendentes, salvo = false }) {
  if (!pendentes) {
    return salvo ? '<div class="bs-texto"><b class="bs-ok">Alterações salvas ✓</b></div>' : '';
  }
  return `
    <div class="bs-texto"><b>Alterações não salvas</b><span>${campos(pendentes)}</span></div>
    <div class="bs-acoes">
      <button class="btn ghost btn-sm" type="button" data-salvar="descartar">Descartar</button>
      <button class="btn btn-sm" type="button" data-salvar="salvar">Salvar</button>
    </div>`;
}

/**
 * Os nomes dos campos do topo da ficha, para os avisos ("Telefone, Anamnese").
 * @param {string[]} caminhos
 */
export function nomesDosCampos(caminhos) {
  const topo = [...new Set(caminhos.map((c) => c.split('.')[0]))];
  return resumoFicha(topo).replace(/^Ficha editada · /, '');
}

/**
 * O patch pronto para gravar: a matriz editada ganha a versão do formato e a
 * hora da edição (que não são campos de formulário).
 * @param {Record<string, any>} patch @param {number} agora
 */
export function completarPatch(patch, agora) {
  if (!patch[CAMPO_MATRIZ]) return patch;
  return { ...patch, [CAMPO_MATRIZ]: { ...patch[CAMPO_MATRIZ], versao: VERSAO_MATRIZ, atualizadoEm: agora } };
}

/* ============================================================
   Estado
   ============================================================ */

/** @type {Map<string, Formulario>} */
const formularios = new Map();
/** @type {ReturnType<typeof criarRascunho> | null} */
let rascunho = null;
let alunoId = '';
/** A aba aberta agora. */
let abaAberta = '';
/**
 * O que o formulário aberto mostrava quando foi desenhado, os campos que já
 * vinham do rascunho nesse momento, e os campos já mexidos nele.
 */
let antes = /** @type {Record<string, any>} */ ({});
let herdados = new Set();
let tocados = new Set();
/** De que aba veio cada caminho do rascunho (o ponto nas abas). @type {Map<string, string>} */
const abaDoCaminho = new Map();
let salvoAgora = false;
let timerSalvo = 0;

/** O rascunho tem alguma coisa? */
export function temPendencias() { return !!rascunho && rascunho.sujo(); }

/**
 * O valor ainda não salvo de um campo, ou `undefined` se ele não foi mexido.
 * @param {string} caminho
 */
export function valorPendente(caminho) {
  return rascunho && rascunho.caminhos().includes(caminho) ? rascunho.valor(caminho) : undefined;
}

/** A ficha do aluno aberto com o rascunho por cima — é com ela que os formulários se desenham. */
function vista() {
  const a = db.obter(alunoId);
  if (!a) return null;
  return rascunho ? { ...a, ...rascunho.montarPatch(a) } : a;
}

/** Recomeça o rascunho a partir da ficha salva. */
function recomecar() {
  const a = db.obter(alunoId);
  rascunho = a ? criarRascunho(a) : null;
  abaDoCaminho.clear();
}

/** Desenha a aba de formulário aberta (se for uma) com a vista atual. */
function desenharAberta() {
  const f = formularios.get(abaAberta);
  const v = vista();
  if (!f || !v) return;
  f.desenhar(v);
  antes = f.ler() || {};
  herdados = new Set(Object.keys(antes).filter((c) => cruzaComRascunho(c, rascunho ? rascunho.caminhos() : [])));
  tocados = new Set();
}

/**
 * Redesenha a aba aberta a partir da ficha com o rascunho — para quando a
 * própria aba muda o que mostra (um card que entra ou sai do modo de edição).
 * Não perde nada: o que foi digitado já está no rascunho.
 */
export function redesenharAberta() { desenharAberta(); }

/** O formulário aberto mudou: passa para o rascunho o que mudou nele. */
function coletar() {
  const f = formularios.get(abaAberta);
  if (!f || !rascunho) return;
  const lidos = f.ler();
  if (!lidos) return;
  for (const c of caminhosMudados(lidos, antes, tocados)) {
    tocados.add(c);
    if (acaoDoCampo(lidos[c], antes[c], herdados.has(c)) === 'descartar') {
      rascunho.descartar(c);
      abaDoCaminho.delete(c);
    } else {
      rascunho.definir(c, lidos[c]);
      abaDoCaminho.set(c, f.aba);
    }
  }
  limparAvisoSalvo(); // voltou a editar: o "salvas ✓" de antes não vale mais
  atualizarBarra();
}

/** Desenha a barra e marca as abas com pendência. */
function atualizarBarra() {
  const el = $('#barra-salvar');
  const caminhos = rascunho ? rascunho.caminhos() : [];
  if (el) {
    el.innerHTML = htmlBarra({ pendentes: caminhos.length, salvo: salvoAgora });
    el.hidden = !caminhos.length && !salvoAgora;
    el.classList.toggle('ok', !caminhos.length && salvoAgora);
  }
  const comPendencia = new Set(caminhos.map((c) => abaDoCaminho.get(c)).filter(Boolean));
  for (const aba of formularios.keys()) document.querySelector(`#aba-${aba}`)?.classList.toggle('pendente', comPendencia.has(aba));
}

/* ============================================================
   Salvar, descartar, sair
   ============================================================ */

/**
 * Grava o rascunho. Devolve se gravou (ou se não havia o que gravar).
 * @returns {Promise<boolean>}
 */
export async function salvar() {
  if (!rascunho || !rascunho.sujo()) return true;
  const a = db.obter(alunoId);
  if (!a) return false;

  if (rascunho.caminhos().includes('nome') && !String(rascunho.valor('nome') || '').trim()) {
    emit(EVENTOS.ABRIR_ABA, 'geral');
    await avisar({ titulo: 'Falta o nome', texto: 'O nome do aluno não pode ficar em branco.' });
    return false;
  }

  // O mesmo campo mudou aqui e em outro aparelho (ou no Montador): qual vale?
  const conflitos = rascunho.conflitos(a);
  if (conflitos.length) {
    const escolha = await painel({
      titulo: 'A ficha mudou em outro lugar',
      corpoHTML: `<p class="dlg-texto">Enquanto você editava, <b>${esc(nomesDosCampos(conflitos.map((c) => c.caminho)))}</b> também foi alterado em outro aparelho. Qual versão fica?</p>`,
      acoes: [{ id: 'novo', label: 'Usar o que chegou', secundaria: true }, { id: 'meu', label: 'Manter o meu' }],
      fechar: 'Cancelar',
      largo: false,
    });
    if (!escolha) return false;
    if (escolha === 'novo') for (const c of conflitos) rascunho.descartar(c.caminho);
    rascunho.rebasear(a);
  }

  if (rascunho.sujo()) {
    const patch = completarPatch(rascunho.montarPatch(a), Date.now());
    const { anamnese, parq, ...resto } = patch;
    // A gravação publica o Portal e emite 'alunos-mudaram' (boot.js → db.aoGravar):
    // a lista, o cabeçalho e as outras abas se atualizam por lá.
    db.atualizar(alunoId, patch);
    if (Object.keys(resto).length) regFicha(a, resto);
    if (anamnese) regAnamnese(a, anamnese);
    if (parq) regParq(a, parq);
    estado.alunoAtual = db.obter(alunoId);
  }

  recomecar();
  for (const f of formularios.values()) f.aposSalvar?.();
  desenharAberta(); // mostra o que foi gravado, já normalizado (a matriz limpa, por exemplo)
  avisarSalvo();
  return true;
}

/** Mostra "Alterações salvas ✓" por um instante. */
function avisarSalvo() {
  salvoAgora = true;
  atualizarBarra();
  clearTimeout(timerSalvo);
  timerSalvo = /** @type {any} */ (setTimeout(() => { salvoAgora = false; atualizarBarra(); }, 1800));
}

/** Tira o "Alterações salvas ✓" (quando o coach volta a editar ou descarta logo depois de salvar). */
function limparAvisoSalvo() {
  salvoAgora = false;
  clearTimeout(timerSalvo);
}

/** Joga fora o rascunho e redesenha o formulário aberto com a ficha salva. */
function descartarTudo() {
  rascunho?.descartar();
  abaDoCaminho.clear();
  limparAvisoSalvo();
  desenharAberta();
  atualizarBarra();
}

/**
 * A guarda de saída: com pendências, pergunta. `true` = pode sair.
 * @returns {boolean | Promise<boolean>}
 */
function guardaDeSaida() {
  if (!temPendencias() || !rascunho) return true;
  const n = rascunho.caminhos().length;
  const nome = db.obter(alunoId)?.nome || 'este aluno';
  return painel({
    titulo: 'Alterações não salvas',
    corpoHTML: `<p class="dlg-texto">Você alterou ${campos(n)} da ficha de <b>${esc(nome)}</b> (${esc(nomesDosCampos(rascunho.caminhos()))}) e ainda não salvou.</p>`,
    acoes: [{ id: 'descartar', label: 'Descartar', perigo: true }, { id: 'salvar', label: 'Salvar e sair' }],
    fechar: 'Continuar editando',
    largo: false,
  }).then(async (escolha) => {
    if (escolha === 'salvar') return salvar();
    if (escolha === 'descartar') { descartarTudo(); return true; }
    return false;
  });
}

/* ============================================================
   Ligação
   ============================================================ */

/**
 * Registra um formulário da ficha. As mudanças nele (input/change, inclusive
 * as disparadas pelo próprio módulo depois de mexer no DOM) vão para o rascunho.
 * Chamar no `iniciar*` de cada aba, depois de `iniciarSalvarGlobal`.
 * @param {Formulario} f
 */
export function registrarFormulario(f) {
  formularios.set(f.aba, f);
  const painelDaAba = $(`#tab-${f.aba}`);
  const aoMudar = () => { if (abaAberta === f.aba) coletar(); };
  painelDaAba?.addEventListener('input', aoMudar);
  painelDaAba?.addEventListener('change', aoMudar);
  // Enter num campo não envia o formulário (não há mais Salvar por aba).
  painelDaAba?.addEventListener('submit', (/** @type {Event} */ e) => e.preventDefault());
}

/** Liga o salvar global ao barramento. Chamar uma vez, depois do perfil e antes das abas. */
export function iniciarSalvarGlobal() {
  on(EVENTOS.PERFIL_ABERTO, (id) => {
    alunoId = id;
    salvoAgora = false;
    recomecar();
    atualizarBarra();
  });
  // A aba de formulário se desenha toda vez que abre, a partir da ficha com o
  // rascunho: nada se perde ao trocar de aba, e o que mudou em outra aba aparece.
  on(EVENTOS.ABRIR_ABA, (nome) => {
    abaAberta = nome;
    if (formularios.has(nome)) desenharAberta();
  });
  on(EVENTOS.ALUNOS_MUDARAM, () => {
    if (!alunoId) return;
    if (!db.obter(alunoId)) { rascunho = null; alunoId = ''; atualizarBarra(); return; } // o aluno foi excluído
    if (temPendencias()) return; // com rascunho, o que chegou é conferido ao salvar (conflitos)
    recomecar();
    // Sem rascunho, a aba aberta mostra o que chegou — a menos que o coach esteja num campo dela.
    const painelAberto = $(`#tab-${abaAberta}`);
    const focoDentro = !!painelAberto && painelAberto.contains(document.activeElement);
    if (formularios.has(abaAberta) && $('#tela-perfil')?.classList.contains('active') && !focoDentro) desenharAberta();
    atualizarBarra();
  });

  $('#barra-salvar')?.addEventListener('click', async (/** @type {any} */ e) => {
    const b = e.target.closest('[data-salvar]');
    if (!b) return;
    if (b.dataset.salvar === 'salvar') salvar();
    else if (b.dataset.salvar === 'descartar'
      && await confirmar({ titulo: 'Descartar alterações?', texto: 'O que você mudou na ficha e não salvou volta ao que estava.', ok: 'Descartar', perigo: true })) {
      descartarTudo();
    }
  });

  definirGuardaDeSaida(guardaDeSaida);
  // Fechar ou recarregar a página com algo pendente: o aviso do navegador.
  if (typeof window !== 'undefined') window.addEventListener?.('beforeunload', (e) => {
    if (!temPendencias()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  // Ctrl/⌘+S salva a ficha (em vez de o navegador tentar salvar a página).
  document.addEventListener?.('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && $('#tela-perfil')?.classList.contains('active')) {
      e.preventDefault();
      salvar();
    }
  });
}
