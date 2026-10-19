// @ts-check
/**
 * SEMANA DO BOX — aba Catálogo (Biblioteca de Movimentos). Mostra o catálogo
 * que o gerador da semana usa e pede ao servidor as mudanças: criar, editar,
 * voltar ao original, ativar e desativar. Nada é gravado daqui — as regras não
 * deixam o navegador escrever em `catalogoExercicios` nem em `catalogoAjustes`.
 *
 * Carrega na primeira vez que a aba aparece (como o Inventário). Depois de cada
 * mudança, RELÊ o catálogo pelo servidor em vez de remendar a lista local: o
 * que aparece é sempre o que o gerador vai usar.
 */
import { avisar, confirmar, painel } from '../../../compartilhado/ui/dialogo.js';
import { exercicioDoPedido, pedidoDoFormulario } from '../core/catalogo.js';
import { ativarExercicio, listarCatalogo, salvarExercicio } from '../cloud/semana.js';
import { esc } from './render.js';
import { renderCatalogo, renderFormExercicio, renderListaCatalogo } from './render-catalogo.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

const CHAVE_ABA = 'semana-box:catalogo-aba';
/** A aba escolhida fica no navegador (conveniência; sem ela, abre em Força). */
function abaSalva() {
  try { return localStorage.getItem(CHAVE_ABA) || 'forca'; } catch { return 'forca'; }
}

/** @param {{status: (msg: string, tipo?: 'ok'|'erro'|'') => void}} ctx */
export function montar(ctx) {
  const alvo = $('#catalogo-corpo');
  if (!alvo) return;

  const estado = {
    carregado: false,
    /** @type {{exercicios: any[], hyrox: any[], vocabulario: any} | null} */
    dados: null,
    modalidade: abaSalva(),
    busca: '',
    mostrarInativos: true,
    ocupado: false,
  };

  const desenhar = () => { alvo.innerHTML = renderCatalogo(estado); };
  const desenharLista = () => {
    const lista = alvo.querySelector('#catalogo-lista');
    if (lista && estado.dados) lista.innerHTML = renderListaCatalogo(estado);
  };

  async function carregar() {
    estado.carregado = true;
    desenhar();
    try {
      estado.dados = await listarCatalogo();
      ctx.status('');
    } catch (e) {
      console.error(e);
      estado.carregado = false; // a próxima ida à aba tenta de novo
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para ler o catálogo.', 'erro');
    }
    desenhar();
  }

  /** Roda um pedido ao servidor com a aba travada e relê o catálogo no fim. @param {string} msg @param {() => Promise<string>} fn */
  async function executar(msg, fn) {
    estado.ocupado = true;
    desenhar();
    ctx.status(msg);
    try {
      const ok = await fn();
      estado.dados = await listarCatalogo();
      ctx.status(ok, 'ok');
    } catch (e) {
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para completar a operação.', 'erro');
      // Relê mesmo assim: a recusa pode ter vindo de uma mudança feita em outra aba.
      try { estado.dados = await listarCatalogo(); } catch { /* fica a lista de antes */ }
    }
    estado.ocupado = false;
    desenhar();
  }

  /** Os campos do formulário do painel como objeto plano (checkbox repetido vira lista). */
  function lerFormulario() {
    const form = /** @type {HTMLFormElement | null} */ (document.querySelector('#cat-form'));
    /** @type {Record<string, any>} */
    const f = {};
    if (!form) return f;
    for (const [k, v] of new FormData(form).entries()) {
      if (k in f) f[k] = [].concat(f[k], /** @type {any} */ (v));
      else f[k] = ['principal', 'secundario', 'equip', 'estacao'].includes(k) ? [v] : v;
    }
    return f;
  }

  /**
   * Abre o formulário (criar ou editar) e insiste até o servidor aceitar ou o
   * coach desistir: o erro do servidor aparece no topo do formulário, com o que
   * ele digitou.
   * @param {any} exercicio `null` = novo
   */
  async function abrirFormulario(exercicio) {
    if (!estado.dados) return;
    let atual = exercicio;
    let erro = '';
    for (;;) {
      const editando = !!exercicio?.id;
      const acoes = [
        ...(editando && exercicio.editado ? [{ id: 'restaurar', label: 'Voltar ao original', secundaria: true }] : []),
        { id: 'salvar', label: editando ? 'Salvar' : 'Criar exercício' },
      ];
      const pronto = painel({
        titulo: editando ? `Editar · ${exercicio.nome}` : 'Novo exercício',
        corpoHTML: renderFormExercicio({ exercicio: atual, vocabulario: estado.dados.vocabulario, exercicios: estado.dados.exercicios, erro }),
        acoes, fechar: 'Cancelar',
      });
      /** @type {HTMLInputElement | null} */ (document.querySelector('#cat-nome'))?.focus();
      const acao = await pronto;
      if (!acao) return;

      if (acao === 'restaurar') {
        const sim = await confirmar({
          titulo: 'Voltar ao original?',
          texto: `<b>${esc(exercicio.nome)}</b> volta ao que está no catálogo base (nome, músculos, equipamento e adaptações). Ativo/desativado não muda.`,
          ok: 'Voltar ao original',
        });
        if (!sim) continue;
        await executar('Voltando ao original…', async () => {
          await salvarExercicio({ id: exercicio.id, restaurar: true });
          return `${exercicio.original?.nome ?? exercicio.nome}: de volta ao catálogo base.`;
        });
        return;
      }

      const pedido = pedidoDoFormulario(lerFormulario());
      estado.ocupado = true;
      ctx.status(editando ? 'Salvando o exercício…' : 'Criando o exercício…');
      try {
        const r = await salvarExercicio(pedido);
        estado.dados = await listarCatalogo();
        estado.ocupado = false;
        desenhar();
        ctx.status(editando ? `${r.nome} salvo. Vale na próxima geração da semana.` : `${r.nome} criado. Já entra no sorteio da próxima geração.`, 'ok');
        return;
      } catch (e) {
        estado.ocupado = false;
        erro = /** @type {any} */ (e)?.message || 'Não deu para salvar.';
        ctx.status('');
        atual = exercicioDoPedido(pedido, exercicio);
      }
    }
  }

  /** @param {string} id @param {boolean} ativo */
  async function alternar(id, ativo) {
    const e = estado.dados?.exercicios.find((x) => x.id === id);
    if (!e) return;
    if (!ativo) {
      const sim = await confirmar({
        titulo: `Desativar ${e.nome}?`,
        texto: 'O gerador e as trocas deixam de oferecer este exercício (por exemplo, enquanto o equipamento está quebrado). '
          + 'A semana que já o usa continua valendo, e o volume dele continua contando. Dá para ativar de novo a qualquer hora.',
        ok: 'Desativar', perigo: true,
      });
      if (!sim) return;
    }
    /** @type {string[]} */
    let avisos = [];
    await executar(ativo ? 'Ativando…' : 'Desativando…', async () => {
      const r = await ativarExercicio(id, ativo);
      avisos = r?.avisos ?? [];
      return ativo ? `${e.nome} ativado: volta ao sorteio.` : `${e.nome} desativado: fica fora da próxima geração.`;
    });
    if (avisos.length) await avisar({ titulo: 'Atenção ao sorteio', texto: avisos.map(esc).join('<br>') });
  }

  alvo.addEventListener('click', (ev) => {
    const el = /** @type {HTMLElement} */ (ev.target).closest('[data-cat-modalidade], [data-cat-novo], [data-cat-editar], [data-cat-ativar]');
    if (!el || estado.ocupado || !estado.dados) return;
    const modalidade = el.getAttribute('data-cat-modalidade');
    if (modalidade) {
      estado.modalidade = modalidade;
      try { localStorage.setItem(CHAVE_ABA, modalidade); } catch { /* sem armazenamento: só não lembra */ }
      desenhar();
      return;
    }
    if (el.hasAttribute('data-cat-novo')) { abrirFormulario(null); return; }
    const editar = el.getAttribute('data-cat-editar');
    if (editar) { abrirFormulario(estado.dados.exercicios.find((x) => x.id === editar) ?? null); return; }
    const ativar = el.getAttribute('data-cat-ativar');
    if (ativar) alternar(ativar, el.getAttribute('data-ativo') === 'true');
  });

  // A busca redesenha só a lista: redesenhar a barra tiraria o foco do campo a cada letra.
  alvo.addEventListener('input', (ev) => {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    if (el.id !== 'cat-busca') return;
    estado.busca = el.value;
    desenharLista();
  });
  alvo.addEventListener('change', (ev) => {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    if (el.id !== 'cat-inativos') return;
    estado.mostrarInativos = el.checked;
    desenharLista();
  });

  document.addEventListener('semana:vista', (ev) => {
    if (/** @type {CustomEvent} */ (ev).detail === 'catalogo' && !estado.carregado) carregar();
  });
}
