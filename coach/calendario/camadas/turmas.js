// @ts-check
/**
 * Camada Turmas: quem vem em cada horário de cada dia.
 *
 * A conta é a MESMA do Painel de Presença (`turmasDoDia`, presenca-regras.js):
 * titulares pelo horário da ficha, reposições, desmarcações, faltas, atestados
 * e o box fechado. Duas diferenças, de propósito: as horas da grade do box
 * entram mesmo vazias (é onde cabe reposição), e "vem" é só quem está
 * confirmado ou presente — quem desmarcou, faltou ou está de atestado vai para
 * "não vêm", com o motivo.
 */
import { turmasDoDia, horasDaGrade } from '../../gestao-de-alunos/presenca-regras.js?v=38';
import { chaveDoDia } from '../../../compartilhado/regras/semana.js?v=38';
import { foraDoTreino } from '../../../compartilhado/regras/planos.js';

/** Os status de quem vem à aula. */
export const VEM = new Set(['confirmado', 'presente']);

/**
 * @typedef {import('../core/camadas.js').Pendente} Pendente
 * @typedef {{ aluno: any, tipo: 'titular'|'reposicao', chave: string, status: string, pendente: Pendente|null }} Pessoa
 * @typedef {{ hora: string, capacidade: number, vem: Pessoa[], naoVem: Pessoa[], naGrade: boolean, lotada: boolean, pendentes: number }} DadosTurma
 */

/**
 * O pedido do app que mexe nesta aula, se houver. O "Não irei" casa pela aula
 * (`chave`); a reserva, pelo crédito que ela usa — e só existe em reposição.
 * @param {Record<string, Pendente[]>} pendentes @param {{ aluno: any, tipo: string, chave: string }} x
 * @returns {Pendente|null}
 */
export function pendenteDe(pendentes, x) {
  const lista = (pendentes || {})[String(x.aluno.id)] || [];
  return lista.find((p) => p.chave === x.chave && (p.tipo === 'aviso' || x.tipo === 'reposicao')) || null;
}

/** @type {import('../core/camadas.js').Camada} */
export const camadaTurmas = {
  id: 'turmas', nome: 'Turmas', cor: '--accent',
  itens(ctx, datas) {
    const ativos = ctx.fichas.filter((a) => !foraDoTreino(a)); // inativo e pausado não estão na turma
    const fechados = new Set(ctx.fechados);
    const out = [];
    for (const data of datas) {
      const grade = horasDaGrade(ctx.meta.turmas, chaveDoDia(data));
      const turmas = turmasDoDia(ativos, data, {
        hoje: ctx.hoje, fechados: ctx.fechados, config: ctx.meta.turmas,
        horasExtras: fechados.has(data) ? [] : grade,
      });
      for (const t of turmas) {
        /** @type {Pessoa[]} */
        const pessoas = t.aulas.map((x) => ({ aluno: x.aluno, tipo: x.tipo, chave: x.chave, status: x.status, pendente: pendenteDe(ctx.pendentes, x) }));
        const vem = pessoas.filter((p) => VEM.has(p.status));
        /** @type {DadosTurma} */
        const dados = {
          hora: t.hora, capacidade: t.capacidade, vem, naoVem: pessoas.filter((p) => !VEM.has(p.status)),
          naGrade: grade.includes(t.hora), lotada: t.capacidade > 0 && vem.length >= t.capacidade,
          pendentes: pessoas.filter((p) => p.pendente).length,
        };
        out.push({ data, hora: t.hora, tipo: 'turma', titulo: `${vem.length}/${t.capacidade}`, dados });
      }
    }
    return out;
  },
};
