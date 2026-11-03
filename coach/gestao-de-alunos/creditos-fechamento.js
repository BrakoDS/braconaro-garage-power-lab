// @ts-check
/**
 * Crédito de reposição que nasce quando o BOX FECHA (caminho A: a Gestão
 * materializa). Todo dia que o coach declara fechado — feriado marcado "não
 * abriu" — dá +1 crédito a cada aluno que tinha aula titular naquele dia e
 * ainda não tem nada registrado nele (nem crédito, nem falta, nem presença).
 * Puro; quem grava é o boot (como o Pix). Idempotente: a trava é `atestados[dia]`.
 */
import { aulasDoDia } from './presenca-regras.js?v=30';
import { fimDoMes } from '../../compartilhado/regras/semana.js';

/**
 * @param {any[]} alunos @param {string[]} diasSemAula @param {string} hoje
 * @returns {{ alunoId: string, dia: string, patch: { atestados: Record<string, any> }, log: { tipo: string, resumo: string, extra: any } }[]}
 */
export function creditosDeFechamento(alunos, diasSemAula, hoje) {
  const ativos = alunos.filter((a) => (a.status || 'ativo') !== 'inativo');
  const out = [];
  for (const dia of diasSemAula) {
    // Não gera um crédito que já nasceria vencido (dia de um mês que já passou).
    if (fimDoMes(dia) < hoje) continue;
    // Quem tinha aula titular nesse dia — a mesma conta do Painel; o dia fechado
    // não muda quem É titular, só o status da aula.
    const aulas = aulasDoDia(ativos, dia, { hoje, fechados: [dia] });
    for (const aula of aulas) {
      if (aula.tipo !== 'titular') continue;
      const a = aula.aluno;
      const chave = aula.chave;
      if ((a.atestados || {})[chave]) continue;          // já tem crédito/desmarcação/atestado
      if ((a.faltas || {})[chave]) continue;              // já virou falta
      if ((a.presencas || []).includes(dia)) continue;    // veio de algum jeito
      const expira = fimDoMes(dia);
      const [, m, d] = dia.split('-');
      out.push({
        alunoId: a.id, dia,
        patch: { atestados: { ...(a.atestados || {}), [chave]: { em: Date.now(), tipo: 'fechado', aula: { data: dia, hora: aula.hora || '' }, expira, reposicao: null } } },
        log: { tipo: 'credito', resumo: `Box fechou em ${d}/${m} · +1 crédito de reposição até ${expira.slice(8)}/${m}`, extra: { dia } },
      });
    }
  }
  return out;
}
