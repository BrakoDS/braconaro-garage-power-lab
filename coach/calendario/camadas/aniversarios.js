// @ts-check
/** Camada Aniversários: o dia, o nome e a idade que o aluno faz. Inativo fica de fora. */
import { eventosNasDatas } from './eventos-agenda.js';

/** @type {import('../core/camadas.js').Camada} */
export const camadaAniversarios = {
  id: 'aniversarios', nome: 'Aniversários', cor: '--pink',
  itens: (ctx, datas) => eventosNasDatas(ctx.fichas, datas, 'aniv').map(({ data, ev }) => ({
    data, tipo: 'aniversario', titulo: ev.idade ? `${ev.nome} · ${ev.idade}` : ev.nome,
    dados: { alunoId: ev.alunoId, nome: ev.nome, idade: ev.idade },
  })),
};
