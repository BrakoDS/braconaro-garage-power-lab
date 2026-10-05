// @ts-check
/**
 * SEMANA DO BOX — trocar um exercício à mão.
 *
 * O fluxo, todo em modais (`compartilhado/ui/dialogo.js`):
 *  1. o servidor manda as opções da vaga, já com os conflitos (`opcoesTrocaBox`);
 *     sessão travada (semana publicada com dia passado) para aqui;
 *  2. semana publicada pede confirmação — os alunos veem a troca na hora;
 *  3. a lista: a instância da vaga, ou o catálogo inteiro;
 *  4. opção com conflito abre o aviso: substituir no outro lugar, escolher outro
 *     substituto, manter assim mesmo (só repetição/rodízio) ou cancelar;
 *  5. grava a semana inteira pela `salvarSemanaBox`, que revalida tudo.
 *
 * A troca é por SESSÃO: `diasParaSalvar` aplica nos dois dias do H1.
 */
import { avisar, confirmar, painel } from '../../../compartilhado/ui/dialogo.js';
import { diasParaSalvar, rotuloDias, temConflito } from '../core/vista.js';
import { opcoesTroca, salvarSemana } from '../cloud/semana.js';
import { esc } from './render.js';
import { renderAvisoTroca, renderOpcoes } from './render-troca.js';

/**
 * @param {{
 *   semanaId: string, sessao: string, posicao: number,
 *   lerDoc: () => Promise<any>,
 *   status: (msg: string, tipo?: 'ok'|'erro'|'') => void,
 *   ocupar: (sim: boolean) => void,
 * }} o
 */
export async function trocarExercicio(o) {
  o.status('Buscando as opções para a vaga…');
  o.ocupar(true);
  let r;
  try {
    r = await opcoesTroca(o.semanaId, o.sessao, o.posicao);
  } catch (e) {
    o.ocupar(false);
    o.status(/** @type {any} */ (e)?.message || 'Não deu para buscar as opções.', 'erro');
    return;
  }
  o.ocupar(false);
  o.status('');

  if (r.travada) {
    await avisar({
      titulo: 'Sessão travada',
      texto: `A semana já foi publicada e o ${r.vaga.sessao} tem dia que já passou (${rotuloDias(r.vaga.dias)}). `
        + 'Ele não muda mais: algum aluno pode ter registrado a sessão.',
    });
    return;
  }
  if (r.publicada) {
    const ok = await confirmar({
      titulo: 'Semana publicada',
      texto: `Os alunos veem a troca na hora${r.temHoje ? ', inclusive na aula de <b>hoje</b>' : ''}. `
        + `Ela vale para ${esc(r.vaga.sessao)} em ${esc(rotuloDias(r.vaga.dias))}.`,
      ok: 'Continuar',
    });
    if (!ok) return;
  }

  let todas = false;
  for (;;) {
    const escolha = await painel({
      titulo: `Trocar exercício · ${r.vaga.sessao}`,
      corpoHTML: renderOpcoes(r, todas),
    });
    if (!escolha) return;
    if (escolha === 'todas' || escolha === 'instancia') { todas = escolha === 'todas'; continue; }
    if (!escolha.startsWith('escolher:')) return;

    const opcao = r.opcoes.find((x) => x.exercicioId === escolha.slice('escolher:'.length));
    if (!opcao) return;
    const principal = { sessao: r.vaga.sessao, posicao: r.vaga.posicao, exercicioId: opcao.exercicioId };

    if (!temConflito(opcao.conflitos)) {
      await gravar(o, [principal], `${opcao.nome} no ${r.vaga.sessao}, vaga ${r.vaga.posicao}.`);
      return;
    }

    const aviso = renderAvisoTroca(r, opcao);
    const decisao = await painel({ titulo: aviso.titulo, corpoHTML: aviso.corpoHTML, acoes: aviso.acoes, fechar: aviso.fechar, largo: false });
    if (!decisao || decisao === 'cancelar') return;
    if (decisao === 'outro') continue;
    if (decisao === 'manter') {
      await gravar(o, [principal], `${opcao.nome} no ${r.vaga.sessao} — mantido com aviso.`);
      return;
    }
    if (decisao.startsWith('substituir:')) {
      const [, sessao, posicao, id] = decisao.split(':');
      const sub = opcao.substitutos.flatMap((s) => s.opcoes).find((x) => x.exercicioId === id);
      await gravar(o, [principal, { sessao, posicao: Number(posicao), exercicioId: id }],
        `${opcao.nome} no ${r.vaga.sessao}; ${sub?.nome ?? id} no ${sessao}.`);
      return;
    }
    if (decisao.startsWith('outro-substituto:')) {
      // Grava a troca (fica a repetição, com aviso) e abre a vaga do outro lugar,
      // agora com as opções calculadas sobre a semana JÁ trocada.
      const [, sessao, posicao] = decisao.split(':');
      const ok = await gravar(o, [principal], `${opcao.nome} no ${r.vaga.sessao}. Agora escolha o substituto no ${sessao}.`);
      if (ok) await trocarExercicio({ ...o, sessao, posicao: Number(posicao) });
      return;
    }
    return;
  }
}

/**
 * Grava a semana com as trocas e relê o documento. Lê de NOVO antes de montar o
 * pedido: a semana na tela pode ter mudado desde que a lista foi aberta.
 * @param {Parameters<typeof trocarExercicio>[0]} o
 * @param {{sessao: string, posicao: number, exercicioId: string}[]} trocas @param {string} sucesso
 */
async function gravar(o, trocas, sucesso) {
  o.ocupar(true);
  o.status('Gravando a troca…');
  try {
    const doc = await o.lerDoc();
    await salvarSemana(o.semanaId, diasParaSalvar(doc, trocas));
    await o.lerDoc();
    o.status(`Trocado: ${sucesso}`, 'ok');
    return true;
  } catch (e) {
    try { await o.lerDoc(); } catch { /* a mensagem do erro é a que importa */ }
    o.status(/** @type {any} */ (e)?.message || 'Não deu para gravar a troca.', 'erro');
    return false;
  } finally {
    o.ocupar(false);
  }
}
