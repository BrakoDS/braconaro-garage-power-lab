// @ts-check
/**
 * EXCLUIR UM TREINO — o fluxo, num lugar só.
 *
 * Mora fora da Lousa porque tem DOIS pontos de entrada, e eles não são
 * simétricos:
 *
 *  - a LOUSA, quando o coach tem um treino gravado aberto na tela;
 *  - o CALENDÁRIO, no painel de leitura de um treino PASSADO.
 *
 * O segundo é o que importa de verdade. "Somente leitura" no passado existe
 * para impedir que reescrever uma terça de três semanas atrás mude o gráfico do
 * mês sem nada na tela explicando por quê. Só que APAGAR um treino duplicado é
 * o caso em que mudar o gráfico é exatamente o objetivo — e sem uma saída aqui,
 * o coach que precisa limpar a bagunça de uma migração não tem nenhuma.
 *
 * Deixar isto na Lousa e o Calendário importar de lá acoplaria uma tela de
 * histórico ao editor. Aqui as duas chamam a mesma coisa.
 */
import { excluirLousa } from '../cloud/chamadas.js';
import { confirmar, avisar } from '../../../compartilhado/ui/dialogo.js';
import { esc } from './render-treino.js';

/**
 * Pergunta e, se o coach confirmar, apaga.
 *
 * @param {{workoutId: string, titulo?: string, dateId?: string, passado?: boolean}} alvo
 * @returns {Promise<boolean>} `true` se apagou de verdade
 */
export async function confirmarEExcluir({ workoutId, titulo = '', dateId = '', passado = false }) {
  if (!workoutId) return false;

  const nome = titulo || 'este treino';
  const ok = await confirmar({
    titulo: 'Excluir treino?',
    texto: `Isso apaga <b>${esc(nome)}</b>${dateId ? ` de ${esc(dateId)}` : ''} — o treino, as fichas `
      + 'já distribuídas para a turma e o que os alunos veem no Portal.<br><br>'
      // O aviso muda no passado: ali o número JÁ está no gráfico que o coach
      // olhou, e ele vai vê-lo mudar. Dizer antes é a diferença entre uma
      // correção e um susto.
      + (passado
        ? 'O volume desta semana e deste mês <b>já contava</b> este treino, e vai diminuir.'
        : 'O volume da semana e do mês é recalculado sem ele.')
      + '<br><br>Não dá para desfazer pela tela.',
    ok: 'Excluir treino',
    perigo: true,
  });
  if (!ok) return false;

  try {
    const r = await excluirLousa(workoutId, dateId);
    await avisar({
      titulo: 'Treino excluído',
      texto: `Pronto. ${r.fichas} ficha(s) da turma e ${r.portais} publicação(ões) no Portal foram removidas junto. `
        + 'O gráfico de volume se atualiza em alguns segundos.',
    });
    return true;
  } catch (e) {
    await avisar({ titulo: 'Não deu para excluir', texto: /** @type {Error} */ (e).message });
    return false;
  }
}
