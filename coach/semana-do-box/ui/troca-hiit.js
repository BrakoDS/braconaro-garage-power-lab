// @ts-check
/**
 * SEMANA DO BOX — trocar um exercício do HIIT à mão. Mesmo molde do `troca.js`
 * (o do bloco H), em modais (`compartilhado/ui/dialogo.js`):
 *  1. o servidor manda os exercícios da estação com os conflitos
 *     (`opcoesTrocaHiitBox`); HIIT travado (semana publicada com a sexta ou o
 *     sábado no passado) para aqui;
 *  2. semana publicada pede confirmação — os alunos veem a troca na hora;
 *  3. a lista: o que esbarra em tamanho, equipamento ou repetição no dia vem
 *     DESABILITADO (decisão do coach: limite físico não é sugestão);
 *  4. só o rodízio quebrado pergunta: manter ou escolher outro;
 *  5. grava a semana pela `salvarSemanaBox`, que revalida tudo.
 *
 * A troca vale para o HIIT da semana: sexta e sábado mudam juntos.
 */
import { avisar, confirmar, painel } from '../../../compartilhado/ui/dialogo.js';
import { diasComHiitTrocado, rotuloDias, rotuloSlots } from '../core/vista.js';
import { opcoesTrocaHiit, salvarSemana } from '../cloud/semana.js';
import { esc } from './render.js';
import { renderAvisoHiit, renderOpcoesHiit } from './render-troca.js';

/**
 * @param {{
 *   semanaId: string, estacao: string, slot: number,
 *   lerDoc: () => Promise<any>,
 *   status: (msg: string, tipo?: 'ok'|'erro'|'') => void,
 *   ocupar: (sim: boolean) => void,
 * }} o
 */
export async function trocarExercicioHiit(o) {
  o.status('Buscando as opções da estação…');
  o.ocupar(true);
  let r;
  try {
    r = await opcoesTrocaHiit(o.semanaId, o.estacao, o.slot);
  } catch (e) {
    o.ocupar(false);
    o.status(/** @type {any} */ (e)?.message || 'Não deu para buscar as opções.', 'erro');
    return;
  }
  o.ocupar(false);
  o.status('');

  if (r.travada) {
    await avisar({
      titulo: 'HIIT travado',
      texto: `A semana já foi publicada e o HIIT tem dia que já passou (${rotuloDias(r.vaga.dias)}). `
        + 'Ele não muda mais: algum aluno pode ter registrado a aula.',
    });
    return;
  }
  if (r.publicada) {
    const ok = await confirmar({
      titulo: 'Semana publicada',
      texto: `Os alunos veem a troca na hora${r.temHoje ? ', inclusive na aula de <b>hoje</b>' : ''}. `
        + `Ela vale para o HIIT de ${esc(rotuloDias(r.vaga.dias))}.`,
      ok: 'Continuar',
    });
    if (!ok) return;
  }

  for (;;) {
    const escolha = await painel({ titulo: `Trocar exercício · HIIT · ${r.vaga.nome}`, corpoHTML: renderOpcoesHiit(r) });
    if (!escolha || !escolha.startsWith('escolher:')) return;
    const opcao = r.opcoes.find((x) => x.exercicioId === escolha.slice('escolher:'.length));
    // Bloqueada vem desabilitada; se chegar aqui mesmo assim, não grava.
    if (!opcao || opcao.bloqueada) return;
    const troca = { estacao: r.vaga.estacao, slots: r.vaga.slots, exercicioId: opcao.exercicioId };
    const sucesso = `${opcao.nome} em ${r.vaga.nome}, ${rotuloSlots(r.vaga.slots)} (${rotuloDias(r.vaga.dias)}).`;

    if (!opcao.conflitos.semanaAnterior) {
      await gravar(o, troca, sucesso);
      return;
    }
    const aviso = renderAvisoHiit(r, opcao);
    const decisao = await painel({ titulo: aviso.titulo, corpoHTML: aviso.corpoHTML, acoes: aviso.acoes, fechar: aviso.fechar, largo: false });
    if (decisao === 'outro') continue;
    if (decisao === 'manter') await gravar(o, troca, `${sucesso} Quebra o rodízio, com aviso.`);
    return;
  }
}

/**
 * Grava a semana com a troca e relê o documento. Lê de NOVO antes de montar o
 * pedido: a semana na tela pode ter mudado desde que a lista foi aberta.
 * @param {Parameters<typeof trocarExercicioHiit>[0]} o
 * @param {{estacao: string, slots: number[], exercicioId: string}} troca @param {string} sucesso
 */
async function gravar(o, troca, sucesso) {
  o.ocupar(true);
  o.status('Gravando a troca…');
  try {
    const doc = await o.lerDoc();
    await salvarSemana(o.semanaId, diasComHiitTrocado(doc, troca));
    await o.lerDoc();
    o.status(`Trocado: ${sucesso}`, 'ok');
  } catch (e) {
    try { await o.lerDoc(); } catch { /* a mensagem do erro é a que importa */ }
    o.status(/** @type {any} */ (e)?.message || 'Não deu para gravar a troca.', 'erro');
  } finally {
    o.ocupar(false);
  }
}
