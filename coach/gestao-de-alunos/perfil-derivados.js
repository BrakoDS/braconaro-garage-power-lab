// @ts-check
/**
 * O que a ficha do aluno MOSTRA sem gravar: valores calculados a partir da
 * ficha, na hora de ler. Base dos cards da Ficha do Aluno
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md).
 *
 * Nada aqui vira campo no banco. Peso, altura, idade, alerta médico e situação
 * financeira mudam sozinhos (chega uma avaliação, vence uma fatura, o aluno faz
 * aniversário); gravados, eles envelheceriam parados — é o que já acontece com
 * o campo `idade`, gravado no cadastro e nunca mais atualizado.
 *
 * Puro: sem DOM, sem banco, e o "hoje" entra por parâmetro.
 */
import { STATUS_LABEL, numf } from './util/formato.js?v=22';
import { historicoFinanceiro, resumoDoPlano } from './financeiro-aluno.js?v=22';
import { triagemParq } from './saude.js?v=22';
import { matrizDe, rotulo, OPCOES_NIVEL, REGIOES_LESAO, GRAVIDADES } from '../../compartilhado/regras/matriz-individualizacao.js?v=22';

/* ============================================================
   Idade
   ============================================================ */

/**
 * Idade em anos completos, pelo nascimento. Sem nascimento, o campo antigo
 * `idade` (gravado no cadastro) é a reserva. null quando não dá para saber.
 * @param {any} a @param {string} hojeIso 'AAAA-MM-DD'
 * @returns {number|null}
 */
export function idadeDoAluno(a, hojeIso) {
  const nasc = String(a?.nascimento || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nasc);
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hojeIso || ''));
  if (m && h) {
    let i = Number(h[1]) - Number(m[1]);
    if (h[2] + h[3] < m[2] + m[3]) i--; // ainda não fez aniversário este ano
    return i >= 0 && i < 130 ? i : null;
  }
  const antiga = numf(a?.idade);
  return antiga != null && antiga >= 0 && antiga < 130 ? Math.floor(antiga) : null;
}

/* ============================================================
   Biometria atual
   ============================================================ */

/**
 * @typedef {{ valor: number|null, origem: 'avaliacao'|'cadastro'|null, num?: number, data?: string }} Medida
 *   origem 'avaliacao': da avaliação `num`, feita em `data`; 'cadastro': o
 *   campo da ficha (só quando nenhuma avaliação tem a medida); null: sem dado.
 */

/** As avaliações, da mais nova para a mais antiga (data, depois número). @param {any} a */
function avaliacoesRecentes(a) {
  return (Array.isArray(a?.avaliacoes) ? a.avaliacoes : []).slice().sort((x, y) => {
    const dx = String(x?.dataRealizada || ''), dy = String(y?.dataRealizada || '');
    if (dx !== dy) return dx < dy ? 1 : -1;
    return (Number(y?.num) || 0) - (Number(x?.num) || 0);
  });
}

/**
 * Uma medida: a da avaliação mais recente que a tem, ou a do cadastro.
 * @param {any} a @param {string} campoAval @param {string} campoFicha
 * @returns {Medida}
 */
function medidaAtual(a, campoAval, campoFicha) {
  for (const av of avaliacoesRecentes(a)) {
    const v = numf(av?.[campoAval]);
    if (v != null && v > 0) return { valor: v, origem: 'avaliacao', num: av.num, data: String(av.dataRealizada || '') };
  }
  const v = numf(a?.[campoFicha]);
  return v != null && v > 0 ? { valor: v, origem: 'cadastro' } : { valor: null, origem: null };
}

/**
 * Peso e altura atuais. A avaliação manda: o campo da ficha só vale enquanto
 * nenhuma avaliação trouxer a medida (é o "peso do cadastro").
 * @param {any} a
 * @returns {{ peso: Medida, altura: Medida }}
 */
export function biometriaAtual(a) {
  return { peso: medidaAtual(a, 'peso', 'peso'), altura: medidaAtual(a, 'estatura', 'altura') };
}

/* ============================================================
   Alerta médico
   ============================================================ */

/**
 * O selo de alerta médico do cabeçalho.
 *  - 'vermelho': lesão moderada ou severa — é o que muda a prescrição;
 *  - 'ambar':    lesão leve, ou PAR-Q com algum "Sim";
 *  - null:       nada a sinalizar.
 * As lesões são as da Matriz (`matrizIndividualizacao.adaptacoes.lesoes`), a
 * única fonte de "lesão ativa". Texto livre (anamnese, observações) não acende
 * selo: não dá para saber de um texto se a lesão ainda está ativa.
 * @param {any} a
 * @returns {{ nivel: 'vermelho'|'ambar'|null, motivos: string[] }}
 */
export function alertaMedico(a) {
  const lesoes = matrizDe(a).adaptacoes.lesoes;
  const motivos = lesoes.map((l) => `Lesão ${rotulo(GRAVIDADES, l.gravidade).toLowerCase()} · ${rotulo(REGIOES_LESAO, l.regiao)}`);
  const parqSim = triagemParq(a?.parq?.respostas || {}) === 'alerta';
  if (parqSim) motivos.push('PAR-Q com resposta "Sim"');
  const grave = lesoes.some((l) => l.gravidade === 'moderada' || l.gravidade === 'severa');
  const nivel = grave ? 'vermelho' : (lesoes.length || parqSim) ? 'ambar' : null;
  return { nivel, motivos };
}

/* ============================================================
   Situação financeira
   ============================================================ */

/**
 * A situação do aluno no card Financeiro, no MESMO critério das faturas do card e
 * do Portal (`historicoFinanceiro` → `statusDaCobranca`).
 *  - 'atrasado':  alguma fatura vencida;
 *  - 'a-vencer':  fatura em aberto, ainda no prazo;
 *  - 'coberto':   a conta dele é acertada por outro aluno;
 *  - 'sem-plano': sem mensalidade definida (e nada em aberto);
 *  - 'em-dia':    nada em aberto.
 * @param {any} a @param {any[]} todos @param {string} hojeIso
 * @returns {{ tipo: 'atrasado'|'a-vencer'|'coberto'|'sem-plano'|'em-dia', rotulo: string, emAberto: number, atrasado: number }}
 */
export function situacaoFinanceira(a, todos, hojeIso) {
  const h = historicoFinanceiro(a, todos, hojeIso);
  const r = resumoDoPlano(a, todos, hojeIso);
  const base = { emAberto: h.emAberto, atrasado: h.atrasado };
  if (h.atrasado > 0) return { tipo: 'atrasado', rotulo: 'Atrasado', ...base };
  if (h.emAberto > 0) return { tipo: 'a-vencer', rotulo: 'A vencer', ...base };
  if (r.responsavel) return { tipo: 'coberto', rotulo: `Na conta de ${r.responsavel.nome}`, ...base };
  if (!(r.mensalidadeCheia > 0)) return { tipo: 'sem-plano', rotulo: 'Sem mensalidade', ...base };
  return { tipo: 'em-dia', rotulo: 'Em dia', ...base };
}

/* ============================================================
   Selos do cabeçalho
   ============================================================ */

/**
 * O selo de status. Ficha sem status é ativa (o padrão de sempre).
 * @param {any} a @returns {{ valor: string, rotulo: string }}
 */
export function seloStatus(a) {
  const valor = String(a?.status || 'ativo').toLowerCase();
  return STATUS_LABEL[valor] ? { valor, rotulo: STATUS_LABEL[valor] } : { valor: 'ativo', rotulo: STATUS_LABEL.ativo };
}

/**
 * O selo de nível (Iniciante / Intermediário / Avançado), ou null sem nível —
 * um selo "sem nível" em todo card novo não diria nada.
 * @param {any} a @returns {{ valor: string, rotulo: string } | null}
 */
export function seloNivel(a) {
  const valor = String(a?.nivel || '');
  const r = rotulo(OPCOES_NIVEL, valor);
  return r ? { valor, rotulo: r } : null;
}
