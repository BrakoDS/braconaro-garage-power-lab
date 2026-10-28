// @ts-check
/**
 * Avaliador de evolução por IA — a parte pura (sem DOM e sem Firebase), testada
 * em `evolucao-fotos.test.js`. A tela é `ui-evolucao-ia.js`; a função,
 * `analisarEvolucaoFotos` (functions/src/evolucao-ia.ts).
 *
 * Junta as fotos de corpo do aluno das duas fontes, em ordem cronológica:
 *   - o Diário de Evolução (`diario/{email}/fotos`, tiradas pelo aluno), com o
 *     ângulo quando ele marcou;
 *   - as fotos das avaliações físicas (frente, lado, costas, tiradas pelo coach),
 *     com o peso da avaliação.
 * A foto do Diário leva o peso da avaliação mais próxima (até 21 dias): é o
 * "peso registrado no período" que a ficha tem.
 *
 * A IA recebe no máximo 8 (o teto da função): as pontas de cada ângulo — o antes
 * e o depois — e, sobrando lugar, o meio do caminho.
 */
import { esc, fmtN, numf } from './util/formato.js?v=27';
import { ANGULOS_DIARIO, fotosDoDiarioPorDia } from './registros-ui.js?v=27';

/** O teto de `analisarEvolucaoFotos` (MAX_FOTOS em evolucao-ia.ts). */
export const MAX_FOTOS_IA = 8;

/** Até quantos dias da avaliação o peso dela vale para a foto do Diário. */
const JANELA_PESO_DIAS = 21;

/** A foto da avaliação é do Storage da Gestão; a função recusa qualquer outra coisa. */
const URL_AVALIACAO = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/gestao%2F/;

const ORDEM = ['frente', 'lado', 'costas'];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {{ data: string, angulo?: string, url: string, mini: string, origem: 'diario' | 'avaliacao', peso?: number }} FotoEvolucao
 */

/** Dias entre duas datas 'AAAA-MM-DD'. @param {string} a @param {string} b */
const distancia = (a, b) => Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000;

/** @param {FotoEvolucao} a @param {FotoEvolucao} b */
const cronologica = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1
  : (a.angulo ? ORDEM.indexOf(a.angulo) : 3) - (b.angulo ? ORDEM.indexOf(b.angulo) : 3));

/**
 * Todas as fotos de corpo do aluno, da mais antiga para a mais nova. `docsDiario`
 * é o que `carregarFotosDoDiario` devolve (null = não deu para ler: entram só as
 * das avaliações). Foto do Diário no mesmo dia e ângulo de uma da avaliação fica
 * de fora: a do coach tem o peso e o padrão da avaliação.
 * @param {any} aluno @param {any[]|null} docsDiario @returns {FotoEvolucao[]}
 */
export function fotosDoAluno(aluno, docsDiario) {
  /** @type {FotoEvolucao[]} */
  const daAvaliacao = [];
  for (const av of (aluno && aluno.avaliacoes) || []) {
    if (!av || !DATA_ISO.test(av.dataRealizada || '')) continue;
    const peso = numf(av.peso);
    for (const angulo of ORDEM) {
      const url = av.fotos && av.fotos[angulo];
      if (typeof url !== 'string' || !URL_AVALIACAO.test(url)) continue;
      daAvaliacao.push({ data: av.dataRealizada, angulo, url, mini: url, origem: 'avaliacao', ...(peso ? { peso } : {}) });
    }
  }
  const pesos = ((aluno && aluno.avaliacoes) || [])
    .filter((/** @type {any} */ av) => av && DATA_ISO.test(av.dataRealizada || '') && numf(av.peso))
    .map((/** @type {any} */ av) => ({ data: av.dataRealizada, peso: /** @type {number} */ (numf(av.peso)) }));
  /** O peso da avaliação mais próxima da data, dentro da janela. @param {string} data */
  const pesoPerto = (data) => {
    let melhor = null;
    for (const p of pesos) {
      const dist = distancia(p.data, data);
      if (dist <= JANELA_PESO_DIAS && (!melhor || dist < melhor.dist)) melhor = { dist, peso: p.peso };
    }
    return melhor ? melhor.peso : undefined;
  };

  const ocupados = new Set(daAvaliacao.map((f) => `${f.data}|${f.angulo}`));
  /** @type {FotoEvolucao[]} */
  const doDiario = [];
  for (const [dia, f] of fotosDoDiarioPorDia(docsDiario) || new Map()) {
    if (f.angulo && ocupados.has(`${dia}|${f.angulo}`)) continue;
    const peso = pesoPerto(dia);
    doDiario.push({
      data: dia, url: f.url, mini: f.mini, origem: 'diario',
      ...(f.angulo ? { angulo: f.angulo } : {}),
      ...(peso ? { peso } : {}),
    });
  }
  return [...daAvaliacao, ...doDiario].sort(cronologica);
}

/**
 * As fotos que vão para a IA: de cada ângulo com duas ou mais fotos, a primeira
 * e a última (o antes e o depois); sobrando lugar, a do meio do caminho, um
 * ângulo por vez; por último, o ângulo que só tem uma foto (dá contexto, mas não
 * se compara com nada). "Sem ângulo" — as fotos do Diário de antes da marcação —
 * conta como um ângulo à parte.
 * @param {FotoEvolucao[]} fotos @param {number} [max] @returns {FotoEvolucao[]}
 */
export function escolherParaIA(fotos, max = MAX_FOTOS_IA) {
  /** @type {Map<string, FotoEvolucao[]>} */
  const grupos = new Map();
  for (const f of [...fotos].sort(cronologica)) {
    const k = f.angulo || '';
    grupos.set(k, [...(grupos.get(k) || []), f]);
  }
  const chaves = [...ORDEM, ''].filter((k) => grupos.has(k));
  /** @type {Set<FotoEvolucao>} */
  const escolhidas = new Set();
  const pegar = (/** @type {FotoEvolucao} */ f) => { if (escolhidas.size < max) escolhidas.add(f); };

  for (const k of chaves) {
    const g = /** @type {FotoEvolucao[]} */ (grupos.get(k));
    if (g.length >= 2) { pegar(g[0]); pegar(g[g.length - 1]); }
  }
  for (let rodada = true; rodada && escolhidas.size < max;) {
    rodada = false;
    for (const k of chaves) {
      const g = /** @type {FotoEvolucao[]} */ (grupos.get(k));
      if (g.length < 2) continue;
      const resto = g.filter((f) => !escolhidas.has(f));
      if (!resto.length || escolhidas.size >= max) continue;
      pegar(resto[Math.floor(resto.length / 2)]);
      rodada = true;
    }
  }
  for (const k of chaves) {
    const g = /** @type {FotoEvolucao[]} */ (grupos.get(k));
    if (g.length === 1) pegar(g[0]);
  }
  return [...escolhidas].sort(cronologica);
}

/** "Masculino" → "masculino"; o resto não vai. @param {unknown} s */
const sexoDaFicha = (s) => {
  const t = String(s || '').trim().toLowerCase();
  return t === 'masculino' || t === 'feminino' ? t : undefined;
};

/**
 * O pedido para `analisarEvolucaoFotos`. Do aluno, só o primeiro nome (é o que o
 * rascunho de feedback usa), o sexo e o objetivo da ficha.
 * @param {any} aluno @param {FotoEvolucao[]} escolhidas
 */
export function pedidoParaIA(aluno, escolhidas) {
  const nome = String((aluno && aluno.nome) || '').trim().split(/\s+/)[0] || '';
  const sexo = sexoDaFicha(aluno && aluno.sexo);
  const objetivo = String((aluno && aluno.objetivo) || '').trim();
  return {
    nome,
    ...(sexo ? { sexo } : {}),
    ...(objetivo ? { objetivo } : {}),
    fotos: escolhidas.map((f) => ({
      data: f.data, url: f.url, origem: f.origem,
      ...(f.angulo ? { angulo: f.angulo } : {}),
      ...(f.peso ? { peso: f.peso } : {}),
    })),
  };
}

/** "12/09/26 · Perfil · 82,4 kg" @param {FotoEvolucao} f */
export function legendaDaFoto(f) {
  const [a, m, d] = f.data.split('-');
  return [
    `${d}/${m}/${a.slice(2)}`,
    ANGULOS_DIARIO[/** @type {'frente'|'lado'|'costas'} */ (f.angulo)] || 'sem ângulo',
    ...(f.peso ? [`${fmtN(f.peso, 1)} kg`] : []),
  ].join(' · ');
}

/**
 * A fileira das fotos que vão para a IA, com a legenda de cada uma, e a linha
 * que diz quantas de quantas e por quê.
 * @param {FotoEvolucao[]} escolhidas @param {number} total
 */
export function htmlFotosParaIA(escolhidas, total) {
  if (!escolhidas.length) return '';
  const conta = escolhidas.length === total
    ? `${total} ${total === 1 ? 'foto' : 'fotos'} do aluno.`
    : `${escolhidas.length} de ${total} fotos: o antes e o depois de cada ângulo e, sobrando lugar, o meio do caminho.`;
  return `<p class="evo-conta">${esc(conta)}</p>
  <ul class="evo-fotos">${escolhidas.map((f) => `
    <li class="evo-foto">
      <img src="${esc(f.mini)}" alt="${esc(`Foto de ${legendaDaFoto(f)}`)}" loading="lazy" />
      <span class="evo-leg">${esc(legendaDaFoto(f))}</span>
      <span class="evo-origem">${f.origem === 'avaliacao' ? 'Avaliação' : 'Diário'}</span>
    </li>`).join('')}
  </ul>`;
}

const NIVEL = {
  boa: { rotulo: 'Boa para comparar', tom: 'fg-ok' },
  parcial: { rotulo: 'Compara com ressalvas', tom: 'fg-warn' },
  ruim: { rotulo: 'Leitura pouco confiável', tom: 'fg-bad' },
};

/** @param {string} titulo @param {string[]} itens @param {string} vazio */
const secao = (titulo, itens, vazio) => `
  <section class="evo-sec">
    <h3 class="sa-t">${esc(titulo)}</h3>
    ${itens.length ? `<ul class="evo-lista">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p class="card-vazio">${esc(vazio)}</p>`}
  </section>`;

/**
 * O relatório da IA. Tudo que veio do modelo passa por `esc`: é texto de fora
 * entrando no innerHTML. O feedback vai num `<textarea>` para o coach editar
 * antes de copiar.
 * @param {{ qualidade: { nivel: string, avisos: string[] }, evolucao: string[], atencao: string[], feedback: string }} r
 * @param {number} fotos
 */
export function htmlRelatorio(r, fotos) {
  const nivel = NIVEL[/** @type {'boa'|'parcial'|'ruim'} */ (r.qualidade.nivel)] || NIVEL.parcial;
  return `
  <div class="evo-relatorio">
    <section class="evo-sec">
      <h3 class="sa-t">Qualidade da comparação</h3>
      <span class="ac-chip fg-chip ${nivel.tom}">${esc(nivel.rotulo)}</span>
      ${r.qualidade.avisos.length ? `<ul class="evo-lista">${r.qualidade.avisos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </section>
    ${secao('Evolução visível', r.evolucao, 'A IA não apontou mudança visível entre as fotos.')}
    ${secao('Pontos a melhorar / atenção', r.atencao, 'Nada apontado.')}
    <section class="evo-sec">
      <h3 class="sa-t"><label for="evo-feedback">Sugestão de feedback para o aluno</label></h3>
      <textarea id="evo-feedback" class="evo-feedback" rows="6">${esc(r.feedback)}</textarea>
      <div class="evo-feedback-acoes">
        <button class="btn btn-sm" id="evo-copiar" type="button">Copiar</button>
        <span class="evo-nota">Revise antes de mandar: é um rascunho.</span>
      </div>
    </section>
    <p class="evo-rodape">Gerado por IA a partir de ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}. Leitura visual — não substitui a avaliação física.</p>
  </div>`;
}
