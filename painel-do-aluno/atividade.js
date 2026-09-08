// @ts-check
/**
 * Nível de atividade do aluno — cálculo puro (sem DOM, sem Firebase).
 *
 * O fator de atividade multiplica a TMB para chegar no TDEE. Até agora o aluno
 * escolhia esse fator num select, o que pedia dele exatamente a conta que o box
 * já tem pronta: quantas vezes por semana ele realmente treina. Este módulo
 * responde isso a partir dos registros — o check-in do coach e os treinos que o
 * próprio aluno lança na Nutrição — e devolve o nível junto com a frase que
 * explica de onde ele saiu.
 *
 * O aluno continua podendo assumir o volante (modo manual): quem trabalha na
 * construção ou pedala para o trabalho gasta o que a agenda do box não vê.
 */

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Os cinco níveis, na ordem do menor para o maior.
 *
 * `min`/`max` são a faixa de treinos por semana que dispara o nível
 * automaticamente. O "Muito intenso" fica de fora de propósito: 1.9 pressupõe
 * trabalho físico pesado somado ao treino, e isso é informação que o box não
 * tem. Sobe pra lá só quem escolher na mão.
 */
export const NIVEIS = [
  { fator: '1.2', rotulo: 'Sedentário', faixa: 'pouco ou nenhum exercício', min: 0, max: 0 },
  { fator: '1.375', rotulo: 'Leve', faixa: '1–2 treinos/semana', min: 1, max: 2 },
  { fator: '1.55', rotulo: 'Moderado', faixa: '3–5 treinos/semana', min: 3, max: 5 },
  { fator: '1.725', rotulo: 'Intenso', faixa: '6–7 treinos/semana', min: 6, max: 7 },
  { fator: '1.9', rotulo: 'Muito intenso', faixa: 'treino pesado + trabalho físico', min: null, max: null },
];

export const FATOR_PADRAO = '1.55';

/** O nível de um fator salvo, ou o padrão se o valor não for reconhecido. */
export function nivelDoFator(fator) {
  return NIVEIS.find((n) => n.fator === String(fator)) || NIVEIS.find((n) => n.fator === FATOR_PADRAO);
}

/** Segunda-feira (ISO) da semana de uma data ISO ou Date. */
function segundaDe(x) {
  const d = typeof x === 'string' ? new Date(x + 'T00:00:00') : new Date(x);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Dom..6=Sáb
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return isoLocal(d);
}
function somarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

/**
 * Média de treinos por semana nas últimas semanas fechadas.
 *
 * Duas decisões que mudam o número e por isso ficam explícitas:
 *
 * 1. A semana corrente NÃO entra. Ela está pela metade — na segunda-feira o
 *    aluno tem zero treinos, e incluí-la puxaria a média para baixo toda vez
 *    que a semana virasse, fazendo o TDEE despencar sozinho às segundas.
 * 2. A contagem começa na semana do PRIMEIRO treino registrado. Quem entrou no
 *    box há dez dias não é sedentário: as semanas em que ele ainda nem era
 *    aluno não são semanas em que ele deixou de treinar.
 *
 * @param {{dias?: string[], hoje?: Date, semanas?: number}} [p]
 * @returns {{media: number|null, semanasContadas: number, porSemana: number[]}}
 */
export function mediaSemanal({ dias = [], hoje = new Date(), semanas = 4 } = {}) {
  const unicos = [...new Set(dias.filter(Boolean))].sort();
  if (!unicos.length) return { media: null, semanasContadas: 0, porSemana: [] };

  const segAtual = segundaDe(hoje);
  const primeira = segundaDe(unicos[0]);

  // As `semanas` últimas segundas fechadas, da mais antiga para a mais recente.
  const janela = [];
  for (let i = semanas; i >= 1; i--) {
    const seg = somarDias(segAtual, -7 * i);
    if (seg >= primeira) janela.push(seg);
  }
  if (!janela.length) return { media: null, semanasContadas: 0, porSemana: [] };

  const porSemana = janela.map((seg) => {
    const fim = somarDias(seg, 6);
    return unicos.filter((d) => d >= seg && d <= fim).length;
  });
  const media = porSemana.reduce((s, v) => s + v, 0) / porSemana.length;
  return { media, semanasContadas: porSemana.length, porSemana };
}

/** O nível cuja faixa contém `vezes` treinos por semana. Acima de 7, o teto automático. */
export function nivelPorVezes(vezes) {
  const v = Math.max(0, Math.round(Number(vezes) || 0));
  const achado = NIVEIS.find((n) => n.min != null && v >= n.min && v <= n.max);
  // Acima de 7x na semana ainda é "Intenso": passar disso exige o trabalho
  // físico que só o aluno sabe informar.
  return achado || NIVEIS.find((n) => n.fator === '1.725');
}

/**
 * O nível automático do aluno e a frase que explica de onde ele veio.
 *
 * Cai para o plano cadastrado (quantas vezes por semana ele contratou) em dois
 * casos: enquanto não houver semana fechada — aluno novo tem meta, não tem
 * histórico — e quando a janela inteira está muda, que é falta de anotação e
 * não prova de que ele não treinou (veja o comentário no corpo).
 *
 * @returns além do nível, `janelaVazia` diz qual dos dois casos levou ao plano.
 *
 * Devolve duas frases: `explicacao` é a que aparece quando o automático está
 * valendo; `sugestao` é a mesma informação dita de fora, para quem escolheu na
 * mão continuar vendo o que o box calculou.
 *
 * @param {{dias?: string[], planoVezes?: string|number, planoDias?: string[], hoje?: Date, semanas?: number}} [p]
 * @returns {{nivel: any, vezes: number|null, fonte: 'presenca'|'plano'|'nenhuma', explicacao: string, sugestao: string, semanasContadas: number}}
 */
export function nivelAutomatico({ dias = [], planoVezes = '', planoDias = [], hoje = new Date(), semanas = 4 } = {}) {
  const { media, semanasContadas, porSemana } = mediaSemanal({ dias, hoje, semanas });

  // Janela inteiramente muda não é prova de que ele não treinou.
  //
  // Quatro semanas seguidas sem NENHUM registro — nem check-in, nem treino
  // lançado — é muito mais provavelmente marcação atrasada do que um aluno
  // matriculado que treinou zero vezes num mês. Foi o que aconteceu com a ficha
  // do próprio coach: um gasto lançado meses atrás dizia "ele já treinava
  // aqui", as semanas seguintes vazias viraram quatro zeros, e a tela afirmou
  // "Sedentário" com uma convicção que ela não tinha.
  //
  // Um único registro na janela já é evidência e vale, mesmo puxando a média
  // para baixo: 1 treino em 4 semanas é perto de sedentário mesmo. O que não
  // vale é o silêncio absoluto.
  const janelaVazia = media != null && !porSemana.some((v) => v > 0);

  if (media != null && !janelaVazia) {
    const vezes = Math.round(media);
    const nivel = nivelPorVezes(vezes);
    const plural = semanasContadas === 1 ? 'na última semana' : `nas últimas ${semanasContadas} semanas`;
    const quanto = `${fmtMedia(media)} ${media === 1 ? 'treino' : 'treinos'} por semana ${plural}`;
    return {
      nivel, vezes, fonte: 'presenca', janelaVazia: false, semanasContadas,
      explicacao: `Calculado pelo seu histórico: ${quanto}.`,
      sugestao: `Pelo seu histórico — ${quanto} — o automático colocaria você em ${nivel.rotulo}.`,
    };
  }

  const doPlano = parseInt(String(planoVezes), 10) || (planoDias || []).length || 0;
  if (doPlano > 0) {
    const nivel = nivelPorVezes(doPlano);
    return {
      nivel, vezes: doPlano, fonte: 'plano', janelaVazia, semanasContadas: janelaVazia ? semanasContadas : 0,
      explicacao: janelaVazia
        ? `Sem registro das últimas ${semanasContadas} semanas — usando seu plano de ${doPlano}x por semana. Assim que houver check-in ou treino lançado, volta a valer sua presença real.`
        : `Pelo seu plano de ${doPlano}x por semana — assim que tiver semanas registradas, passa a valer sua presença real.`,
      sugestao: `Pelo seu plano de ${doPlano}x por semana, o automático colocaria você em ${nivel.rotulo}.`,
    };
  }

  return {
    nivel: nivelDoFator(FATOR_PADRAO), vezes: null, fonte: 'nenhuma', janelaVazia, semanasContadas: 0,
    explicacao: 'Ainda não temos treinos registrados para calcular. Enquanto isso usamos o nível moderado.',
    sugestao: 'Sem treinos registrados, o automático usaria o nível moderado.',
  };
}

/** Média com no máximo uma casa, vírgula decimal e sem ",0" pendurado. */
function fmtMedia(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

/**
 * Como interpretar o que está gravado no documento do aluno.
 *
 * `nivelModo` é novo. Quem já usou a tela antes tem só o `nivelAtividade`, e aí
 * não dá para saber se ele ESCOLHEU aquele valor ou se ele é o resto do padrão
 * — a tela gravava '1.55' em qualquer salvamento, mesmo sem ninguém tocar no
 * select. Então: valor diferente do padrão foi escolha (fica manual); valor
 * igual ao padrão é indistinguível de intocado (passa para automático, que é
 * o que ele teria escolhido tendo a conta pronta).
 *
 * @param {{nivelModo?: string, nivelAtividade?: string}} doc
 * @returns {'auto'|'manual'}
 */
export function modoDoDoc(doc = {}) {
  if (doc.nivelModo === 'auto' || doc.nivelModo === 'manual') return doc.nivelModo;
  const salvo = String(doc.nivelAtividade || '');
  return salvo && salvo !== FATOR_PADRAO ? 'manual' : 'auto';
}
