// @ts-check
/**
 * SEMANA DO BOX — seção Inventário. Lê `coaches/{uid}/inventario/atual` e grava
 * pela `salvarInventarioBox` (as regras não deixam o navegador gravar ali).
 *
 * Carrega na primeira vez que a aba aparece, não no boot: quem abre a ferramenta
 * para gerar a semana não paga a leitura. Documento que ainda não existe — ou
 * gravado antes do HIIT, sem os recursos dele e sem a turma — passa por
 * `salvarInventario({})`: o servidor grava os PADRÕES dele e os devolve, e a
 * tela não precisa conhecer "smith 2, banco 2, kettlebell 10…".
 *
 * Depois de salvar, avisa a tela das semanas (`semana:recarregar`): o servidor
 * reconferiu as semanas em aberto e pode ter gravado alertas novos nelas.
 */
import {
  MAX_UNIDADES, TURMA_MAX, TURMA_MIN, alteracoesDoInventario, inventarioCompleto, linhasDoInventario, turmaDoInventario,
} from '../core/vista.js';
import { lerInventario, salvarInventario } from '../cloud/semana.js';
import { renderInventario } from './render-inventario.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** @param {{uid: () => string, status: (msg: string, tipo?: 'ok'|'erro'|'') => void}} ctx */
export function montar(ctx) {
  const alvo = $('#inventario-corpo');
  if (!alvo) return;

  const estado = {
    carregado: false,
    /** @type {ReturnType<typeof linhasDoInventario>} */
    original: [],
    /** @type {ReturnType<typeof linhasDoInventario>} */
    editado: [],
    /** A turma gravada e a da tela (`alunosPorAula`, só o HIIT usa). @type {number|null} */
    turmaOriginal: null,
    /** @type {number|null} */
    turma: null,
    ocupado: false,
    /** @type {{semanasAfetadas: any[]|null, reconferidas: number}|null} */
    ultimo: null,
  };

  const copia = (linhas) => linhas.map((l) => ({ ...l }));

  /** O documento salvo vira o estado da tela (gravado e editado iguais). @param {any} doc */
  function aplicar(doc) {
    estado.original = linhasDoInventario(doc);
    estado.editado = copia(estado.original);
    estado.turmaOriginal = turmaDoInventario(doc);
    estado.turma = estado.turmaOriginal;
  }

  /** Alguma coisa para salvar? */
  const temMudanca = () => estado.turma !== estado.turmaOriginal
    || Object.keys(alteracoesDoInventario(estado.original, estado.editado)).length > 0;

  function desenhar() {
    alvo.innerHTML = renderInventario(estado);
  }

  async function carregar() {
    estado.carregado = true;
    desenhar();
    try {
      let doc = await lerInventario(ctx.uid());
      // Primeira vez, ou inventário de antes do HIIT: o servidor grava os
      // padrões dele (e mantém o que já estava gravado) e devolve.
      if (!inventarioCompleto(doc)) doc = await salvarInventario({});
      aplicar(doc);
      ctx.status('');
    } catch (e) {
      console.error(e);
      estado.carregado = false; // a próxima ida à aba tenta de novo
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para ler o inventário.', 'erro');
    }
    desenhar();
  }

  /** @param {string} recurso @param {'total'|'emManutencao'|'turma'} campo @param {number} passo */
  function passo(recurso, campo, passo) {
    if (campo === 'turma') {
      if (estado.turma === null) return;
      estado.turma = Math.max(TURMA_MIN, Math.min(TURMA_MAX, estado.turma + passo));
      estado.ultimo = null;
      desenhar();
      return;
    }
    const l = estado.editado.find((x) => x.recurso === recurso);
    if (!l) return;
    if (campo === 'total') {
      l.total = Math.max(0, Math.min(MAX_UNIDADES, l.total + passo));
      // Menos unidades no box do que em conserto não existe — o servidor recusaria.
      l.emManutencao = Math.min(l.emManutencao, l.total);
    } else {
      l.emManutencao = Math.max(0, Math.min(l.total, l.emManutencao + passo));
    }
    estado.ultimo = null;
    desenhar();
  }

  async function salvar() {
    const mudancas = alteracoesDoInventario(estado.original, estado.editado);
    if (!temMudanca()) return;
    const turma = estado.turma !== estado.turmaOriginal && estado.turma !== null ? estado.turma : undefined;
    estado.ocupado = true;
    desenhar();
    ctx.status('Salvando o inventário e reconferindo as semanas…');
    try {
      const r = await salvarInventario(mudancas, turma);
      aplicar(r);
      estado.ultimo = { semanasAfetadas: r.semanasAfetadas ?? null, reconferidas: Number(r.reconferidas) || 0 };
      ctx.status('Inventário salvo.', 'ok');
      document.dispatchEvent(new CustomEvent('semana:recarregar'));
    } catch (e) {
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para salvar o inventário.', 'erro');
    }
    estado.ocupado = false;
    desenhar();
  }

  alvo.addEventListener('click', (ev) => {
    if (estado.ocupado) return;
    const el = /** @type {HTMLElement} */ (ev.target).closest('[data-inv], [data-inv-salvar], [data-inv-descartar], [data-abrir-semana]');
    if (!el) return;
    if (el.hasAttribute('data-inv-salvar')) { salvar(); return; }
    if (el.hasAttribute('data-inv-descartar')) {
      estado.editado = copia(estado.original);
      estado.turma = estado.turmaOriginal;
      estado.ultimo = null;
      desenhar();
      return;
    }
    const semana = el.getAttribute('data-abrir-semana');
    if (semana) {
      document.dispatchEvent(new CustomEvent('semana:abrir', { detail: semana }));
      return;
    }
    const campo = el.getAttribute('data-inv');
    if (campo === 'total' || campo === 'emManutencao' || campo === 'turma') {
      passo(el.getAttribute('data-recurso') || '', campo, Number(el.getAttribute('data-passo')) || 0);
    }
  });

  // Observação: NÃO redesenha. Redesenhar tiraria o foco do campo a cada letra —
  // e, no blur, trocaria o botão "Salvar" debaixo do cursor no meio do clique
  // (o clique se perde). Só a marca da linha e os dois botões são atualizados.
  alvo.addEventListener('input', (ev) => {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    const recurso = el.getAttribute?.('data-inv-obs');
    const l = recurso && estado.editado.find((x) => x.recurso === recurso);
    if (!l) return;
    l.observacao = el.value;
    estado.ultimo = null;
    const mudou = temMudanca();
    for (const b of alvo.querySelectorAll('[data-inv-salvar], [data-inv-descartar]')) b.disabled = !mudou;
    const o = estado.original.find((x) => x.recurso === recurso);
    const linhaAlterada = !!o && (o.total !== l.total || o.emManutencao !== l.emManutencao || o.observacao !== l.observacao.trim());
    el.closest('.inv-linha')?.classList.toggle('alterado', linhaAlterada);
  });

  document.addEventListener('semana:vista', (ev) => {
    if (/** @type {CustomEvent} */ (ev).detail === 'inventario' && !estado.carregado) carregar();
  });
}
