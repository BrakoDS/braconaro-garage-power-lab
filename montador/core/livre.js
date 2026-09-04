// @ts-check
/**
 * TREINO LIVRE — a regra da montagem solta.
 *
 * As outras abas partem da modalidade: ela diz quantos exercícios, quantas
 * séries, que formato. Aqui é o contrário — o coach diz tudo, e este módulo só
 * transforma o que ele montou no mesmo par (volume, snapshot) que o resto do
 * sistema já consome. Por isso a classificação entra apenas como etiqueta e
 * como faixa de intensidade para a carga sugerida: ela não escolhe exercício e
 * não molda estrutura.
 *
 * O módulo é puro: recebe `porId` em vez de importar o catálogo, porque o
 * catálogo efetivo é montado na UI a partir da Academia. Assim o teste passa um
 * catálogo de mentira e nada mais precisa existir.
 *
 * @typedef {import('./niveis.js').Nivel} Nivel
 */
import { calcularVolume } from './volume.js';
import { variantesNivel } from './niveis.js';

/** Folga fixa de transição/explicação do dia, igual à das outras abas (5 min). */
const FOLGA_SEG = 300;

/** Número a partir de campo de formulário (vem string), ou null se não der. */
function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** O primeiro valor definido da linha, senão o do bloco. */
const herdar = (daLinha, doBloco) => (daLinha === undefined || daLinha === null || daLinha === '' ? doBloco : daLinha);

/**
 * Monta volume e snapshot de um dia livre.
 * @param {Object} p
 * @param {string} [p.classificacao]  ModalidadeId — etiqueta e faixa de carga
 * @param {Array<{id: string, duracaoSeg: number|string}>} [p.aquecimento]
 * @param {any[]} [p.blocos]
 * @param {(id: string) => any} p.porId
 */
export function montarLivre({ classificacao = 'hipertrofia', aquecimento = [], blocos = [], porId } = {}) {
  const aquecItens = (aquecimento || [])
    .map((a) => {
      const e = a && porId(a.id);
      return e ? { nome: e.nome, duracaoSeg: Math.max(0, num(a.duracaoSeg) || 0) } : null;
    })
    .filter(Boolean);
  const aquecimentoSeg = aquecItens.reduce((s, a) => s + a.duracaoSeg, 0);

  /** @type {{exercicio: any, series: number}[]} */
  const itensVolume = [];
  const blocosSaida = [];
  let principalSeg = 0;

  (blocos || []).forEach((b, i) => {
    const exercicios = [];

    // 1) só as linhas com exercício de verdade participam do agrupamento —
    // uma linha fantasma não pode servir de líder nem quebrar uma cadeia de link.
    const validas = [];
    for (const l of (b && b.exercicios) || []) {
      const e = l && porId(l.id);
      if (e) validas.push({ l, e });
    }

    // 2) `linkado` cola a linha no grupo anterior; a primeira linha válida
    // nunca linka (não há a quem) — o campo é ignorado nela de propósito.
    /** @type {Map<number, {l: any, e: any}[]>} */
    const porGrupo = new Map();
    let grupoAtual = -1;
    validas.forEach(({ l, e }, idx) => {
      if (idx === 0 || !l.linkado) grupoAtual += 1;
      if (!porGrupo.has(grupoAtual)) porGrupo.set(grupoAtual, []);
      porGrupo.get(grupoAtual).push({ l, e });
    });

    for (const [grupo, membros] of porGrupo) {
      // A série do grupo é a da PRIMEIRA linha (o líder) — quem linka abre mão
      // da própria série e assina embaixo da prescrição de quem abriu a cadeia.
      const lider = membros[0].l;
      const series = num(herdar(lider.series, b.series));
      // Grupo sem série é grupo pela metade: cai inteiro, não só o líder — não
      // dá pra fazer bi-set de "faça isso 'NaN' vezes". Some em silêncio aqui;
      // quem avisa o coach é a tela (mesma regra de `linhasIncompletas` em
      // ui/livre.js, agora por grupo em vez de por linha).
      if (!(series > 0)) continue;
      // Descanso também é do líder — é ele quem é cobrado uma vez só entre os
      // membros do grupo; os demais membros não têm descanso próprio na conta.
      const descansoGrupo = Math.max(0, num(herdar(lider.descansoSeg, b.descansoSeg)) || 0);

      let tempoMembrosSeg = 0;
      for (const { l, e } of membros) {
        const reps = String(herdar(l.reps, b.reps) ?? '').trim();
        // O dado de descanso da linha continua sendo o efetivo dela — só a
        // conta de tempo do grupo cobra uma vez (do líder), não o snapshot.
        const descansoSeg = Math.max(0, num(herdar(l.descansoSeg, b.descansoSeg)) || 0);

        itensVolume.push({ exercicio: e, series });
        tempoMembrosSeg += e.tempoMedioSeg || 40;

        exercicios.push({
          id: e.id,
          nome: e.nome,
          padrao: e.padrao,
          equipamento: e.equipamento || [],
          reps,
          descansoSeg,
          seriesRef: series,
          grupo,
          // `seriesFixas` quando o bloco não abre por nível: os três níveis recebem
          // o mesmo número, e a diferenciação sobra na carga. `seriesDigitadas`
          // sempre ligado: aqui a âncora é o número que o coach escreveu, não um
          // cálculo do gerador — o piso de 2 séries do gerador não se aplica.
          niveis: variantesNivel(e, series, /** @type {any} */ (classificacao), {
            seriesFixas: !b.porNivel, seriesDigitadas: true,
          }),
          musculosPrimarios: e.musculosPrimarios || [],
          musculosSecundarios: e.musculosSecundarios || [],
          tecnica: l.tecnica || null,
        });
      }
      // Série × (soma dos tempos dos membros + UM descanso) + 20s de transição
      // por membro (trocar de estação continua custando, mesmo linkado).
      principalSeg += series * (tempoMembrosSeg + descansoGrupo) + 20 * membros.length;
    }

    if (!exercicios.length) return; // bloco vazio não vira nada
    blocosSaida.push({
      // O nome posicional usa o índice de ENTRADA: se o bloco 1 ficou vazio, o
      // segundo continua sendo "Bloco 2" — é o que o coach vê na tela.
      nome: String((b && b.nome) || '').trim() || `Bloco ${i + 1}`,
      porNivel: !!(b && b.porNivel),
      exercicios,
    });
  });

  return {
    vol: calcularVolume(itensVolume),
    nItens: itensVolume.length,
    extra: {
      tempos: {
        aquecimentoSeg,
        principalSeg: Math.round(principalSeg),
        totalSeg: Math.round(aquecimentoSeg + principalSeg + FOLGA_SEG),
      },
      aquecimento: aquecItens,
      livre: { blocos: blocosSaida },
    },
  };
}
