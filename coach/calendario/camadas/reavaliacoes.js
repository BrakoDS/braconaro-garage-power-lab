// @ts-check
/** Camada Reavaliações: a próxima reavaliação de cada aluno, no dia dela. */
import { eventosNasDatas } from './eventos-agenda.js';

/** @type {import('../core/camadas.js').Camada} */
export const camadaReavaliacoes = {
  id: 'reavaliacoes', nome: 'Reavaliações', cor: '--info',
  itens: (ctx, datas) => eventosNasDatas(ctx.fichas, datas, 'reav').map(({ data, ev }) => ({
    data, tipo: 'reavaliacao', titulo: ev.nome, dados: { alunoId: ev.alunoId, nome: ev.nome },
  })),
};
