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
import { calcularVolume, CREDITO_WOD } from './volume.js';
import { variantesNivel } from './niveis.js';
import { FORMATOS_WOD, DESCRICAO_FORMATO, DESCRICAO_EMOM_ROTACAO } from '../config/wod-formatos.js';

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
 * Um bloco de WOD: formato, tempo e uma lista de movimentos com prescrição livre.
 *
 * Não tem série, reps, técnica nem "abrir por nível" — nenhum deles descreve um
 * AMRAP. A forma de saída é a mesma que `core/hibrido.js` já produz, para que o
 * card do coach e o do aluno falem de WOD numa língua só.
 * @param {any} b  bloco de entrada (`tipo: 'wod'`)
 * @param {(id: string) => any} porId
 * @returns {any|null}  null quando não sobrou movimento nenhum
 */
function montarBlocoWod(b, porId) {
  const exercicios = [];
  for (const l of (b && b.exercicios) || []) {
    const e = l && porId(l.id);
    if (!e) continue;
    exercicios.push({
      id: e.id,
      nome: e.nome,
      padrao: e.padrao,
      equipamento: e.equipamento || [],
      // Movimento sem prescrição entra assim mesmo: "burpee" ainda é um movimento
      // do WOD. Quem cobra o número é a tela, não a regra.
      prescricao: String(l.prescricao ?? '').trim(),
    });
  }
  if (!exercicios.length) return null;

  const formato = FORMATOS_WOD.includes(b.formato) ? b.formato : 'AMRAP';
  const rodadasNum = num(b.rodadas);
  return {
    tipo: 'wod',
    // Sem nome ele é "WOD", e não "Bloco 3": o coach reconhece esse bloco pelo
    // que ele é, não pela posição.
    nome: String((b && b.nome) || '').trim() || 'WOD',
    formato,
    descricaoFormato: formato === 'EMOM' ? DESCRICAO_EMOM_ROTACAO : DESCRICAO_FORMATO[formato],
    duracaoMin: Math.max(0, num(b.duracaoMin) || 0),
    // Rodadas só fazem sentido no For Time: no AMRAP e no EMOM quem manda é o
    // relógio, e o Chipper é uma volta só por definição. Arredondada porque meia
    // rodada não existe na sala — ou a turma fecha a volta ou não fecha.
    rodadas: formato === 'For Time' && rodadasNum > 0 ? Math.round(rodadasNum) : null,
    exercicios,
  };
}

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
  /** Padrões de movimento creditados pelos WODs — somados DEPOIS de calcularVolume. */
  const creditosWod = [];
  let principalSeg = 0;

  (blocos || []).forEach((b, i) => {
    if (b && b.tipo === 'wod') {
      const bloco = montarBlocoWod(b, porId);
      if (!bloco) return; // WOD sem movimento não vira nada, igual ao bloco vazio
      for (const m of bloco.exercicios) creditosWod.push(m.padrao);
      principalSeg += bloco.duracaoMin * 60;
      blocosSaida.push(bloco);
      return;
    }

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
      tipo: 'series',
      nome: String((b && b.nome) || '').trim() || `Bloco ${i + 1}`,
      porNivel: !!(b && b.porNivel),
      exercicios,
    });
  });

  // O crédito do WOD entra DEPOIS da conta real, e só em `porPadrao`/`totalSeries`:
  // ver o porquê em CREDITO_WOD (volume.js). É a mesma soma que `volumeHibrido`
  // faz — as duas abas precisam contar o mesmo WOD do mesmo jeito.
  const vol = calcularVolume(itensVolume);
  for (const padrao of creditosWod) {
    vol.porPadrao[padrao] = (vol.porPadrao[padrao] || 0) + CREDITO_WOD;
    vol.totalSeries += CREDITO_WOD;
  }

  return {
    vol,
    // Os movimentos do WOD contam: sem isso um dia 100% WOD não teria barra de
    // salvar — e é justamente o dia que a aba passou a existir para montar.
    nItens: itensVolume.length + creditosWod.length,
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
