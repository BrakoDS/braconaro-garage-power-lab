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
    for (const l of (b && b.exercicios) || []) {
      const e = l && porId(l.id);
      if (!e) continue;
      // Linha sem séries é linha pela metade: não conta no volume e não vai ao
      // aluno. Some em silêncio aqui; quem avisa o coach é a tela.
      const series = num(herdar(l.series, b.series));
      if (!(series > 0)) continue; // espelha `linhasIncompletas` em ui/livre.js
      const reps = String(herdar(l.reps, b.reps) ?? '').trim();
      const descansoSeg = Math.max(0, num(herdar(l.descansoSeg, b.descansoSeg)) || 0);

      itensVolume.push({ exercicio: e, series });
      principalSeg += series * ((e.tempoMedioSeg || 40) + descansoSeg) + 20;

      exercicios.push({
        id: e.id,
        nome: e.nome,
        padrao: e.padrao,
        equipamento: e.equipamento || [],
        reps,
        descansoSeg,
        seriesRef: series,
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
