// @ts-check
/**
 * O TREINO BASE NO FORMATO QUE O PORTAL JÁ LÊ.
 *
 * O Portal do aluno entende alguns formatos, e um deles — o do Treino Livre — é
 * exatamente o que o montador individual produz: blocos nomeados pelo coach,
 * cada um com uma lista de exercícios. Publicar nesse formato faz o aluno ver o
 * treino HOJE, com a tela que já existe, em vez de esperar a Etapa 5.
 *
 * O que ainda não vai: a versão de cada aluno. Aqui todos recebem o número da
 * turma (o mesmo em `niveis`, para os três níveis) — é o treino base, que é
 * verdade para todo mundo. A Etapa 5 troca isto pela versão individual, que o
 * aparelho do aluno calcula com `perfil-treino.js` a partir do perfil dele.
 *
 * Módulo puro, testado sem rede.
 */
import { estruturaDe } from '../../../compartilhado/config/estruturas.js';
import { grupoDoExercicio } from '../../../compartilhado/regras/grupos.js';

const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

/** Prescrição de uma linha, do jeito que o Portal lê. @param {any} l */
function exercicioDoPortal(l) {
  const series = Number(l.series) > 0 ? Number(l.series) : null;
  return {
    // `id`, `grupoMuscular` e `series` viajam para o aparelho do aluno poder
    // calcular a versão dele (Etapa 5): sem o grupo não há redistribuição por
    // foco, sem o id não há como casar a exceção daquele dia com a linha, e sem
    // as séries da turma não há com o que comparar. Três campos curtos, nada
    // pessoal — o documento continua pequeno.
    //
    // `grupoMuscular`, e não `grupo`: neste formato `grupo` já quer dizer outra
    // coisa — o índice de bi-set/tri-set que o Treino Livre usa para linkar
    // exercícios (ver `agruparLinkados` em painel-do-aluno/treino-dia.js).
    id: l.id || null,
    grupoMuscular: grupoDoExercicio(l),
    series,
    nome: l.nome,
    padrao: l.padrao || null,
    reps: l.reps || prescricaoPorTempo(l),
    descansoSeg: Number(l.descansoSeg) || 0,
    // Mesmo número para os três níveis: é o treino da turma. O Portal escolhe
    // pelo nível do aluno, e hoje as três respostas são iguais de propósito.
    niveis: series ? Object.fromEntries(NIVEIS.map((n) => [n, { series }])) : null,
    tecnica: l.tecnica || null,
    grupo: null, // bi-set/tri-set é do Treino Livre; aqui cada linha é solta
  };
}

/** Em bloco por tempo, o que o aluno precisa ler é o relógio, não "3×8–12". */
function prescricaoPorTempo(l) {
  if (Number(l.duracaoSeg) > 0) return `${Math.round(Number(l.duracaoSeg) / 60)} min`;
  if (Number(l.rounds) > 0) return `${l.rounds} rounds de ${l.trabalhoSeg || 0}s`;
  return '';
}

/**
 * O dia no formato do Portal. Linha sem nome não vai: o coach salva rascunho com
 * linha em branco, e uma linha vazia no app do aluno é só confusão.
 * @param {any} treino treino base do montador individual
 */
export function paraPortal(treino) {
  const est = estruturaDe(treino?.estrutura);
  return {
    dia: treino.dia,
    modalidade: est.label,
    // Marca o dia como vindo do montador individual: é por ela que o Portal sabe
    // que pode calcular a versão do aluno, em vez de mostrar o número da turma.
    individual: true,
    estrutura: est.id,
    aquecimento: (treino.aquecimento || []).filter((a) => a.nome).map((a) => ({ nome: a.nome, duracaoSeg: a.duracaoSeg || 0 })),
    livre: {
      blocos: (treino.blocos || []).map((b) => ({
        tipo: 'series',
        nome: b.nome,
        porNivel: false, // o número é o mesmo para os três níveis
        exercicios: (b.exercicios || []).filter((l) => l.nome).map(exercicioDoPortal),
      })).filter((b) => b.exercicios.length),
    },
  };
}

/** Tem alguma coisa para publicar? Dia sem exercício nenhum não vai ao Portal. */
export function temConteudoParaPortal(treino) {
  return paraPortal(treino).livre.blocos.length > 0;
}
