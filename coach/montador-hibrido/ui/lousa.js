// @ts-check
/**
 * MÓDULO 1 — LOUSA DO COACH.
 *
 * O quadro branco: título, data, texto livre e um <canvas> por cima para
 * desenhar, com as três canetas do box. O botão dourado manda tudo para a IA e
 * devolve o treino estruturado.
 *
 * A DECISÃO DE DESENHO desta tela: o canvas fica SOBREPOSTO à textarea, não ao
 * lado. É assim que o quadro do box funciona — o coach escreve "Agachamento" e
 * risca uma seta ao lado, no mesmo lugar. Duas caixas separadas dariam duas
 * lousas, e a seta perderia o que estava apontando.
 *
 * O preço disso é que só um dos dois pode receber o toque por vez, e é por isso
 * que existe a ferramenta "Texto" na barra: com ela o canvas sai do caminho
 * (`pointer-events: none`) e o coach digita; com qualquer caneta, o canvas volta
 * a receber o traço. Sem esse botão, um quadro com canvas por cima é uma
 * textarea em que é impossível clicar.
 */
import { CANETAS } from '../core/cores.js';
import { criarLousa } from '../core/canvas.js';
import { paraGravar, totalSeries, exerciciosDo } from '../core/lousa-modelo.js';
import { parseWorkoutLousa, salvarLousa } from '../cloud/chamadas.js';
import * as store from './store.js';
import { painel, avisar } from '../../../compartilhado/ui/dialogo.js';
import { cardsDoTreino, esc } from './render-treino.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** A ferramenta "Texto" não é caneta: é o modo em que o canvas deixa o teclado passar. */
const TEXTO = 'texto';

/**
 * @param {{uid: () => string, irPara: (aba: string) => void}} ctx
 */
export function montar(ctx) {
  const titulo = $('#lousa-titulo');
  const data = $('#lousa-data');
  const hora = $('#lousa-hora');
  const texto = $('#lousa-texto');
  const canvas = /** @type {HTMLCanvasElement} */ ($('#lousa-canvas'));
  const barra = $('#lousa-ferramentas');
  const botao = $('#lousa-reconhecer');
  const status = $('#lousa-status');
  if (!canvas || !barra) return;

  const lousa = criarLousa(canvas);
  const est = store.ler();

  // ---- campos, a partir do rascunho ----
  titulo.value = est.titulo;
  data.value = est.dateId;
  hora.value = est.classTime;
  texto.value = est.texto;

  titulo.addEventListener('input', () => store.atualizar({ titulo: titulo.value }));
  data.addEventListener('change', () => store.atualizar({ dateId: data.value }));
  hora.addEventListener('change', () => store.atualizar({ classTime: hora.value }));
  texto.addEventListener('input', () => store.atualizar({ texto: texto.value }));

  // ---- barra de ferramentas ----
  barra.innerHTML = [
    `<button class="fer fer-texto ativa" data-fer="${TEXTO}" type="button" title="Digitar no quadro (T)">
       <span class="fer-bola" style="background:#FFFFFF;border:1px solid #C9CDD3"></span>Texto</button>`,
    ...CANETAS.map((c) => `
      <button class="fer" data-fer="${c.id}" type="button" title="${esc(c.significado)} (${c.atalho})">
        <span class="fer-bola" style="background:${c.cor}"></span>${esc(c.rotulo)}</button>`),
    `<button class="fer" data-fer="borracha" type="button" title="Apagar (4)">
       <span class="fer-bola fer-borracha"></span>Borracha</button>`,
    `<span class="fer-sep"></span>`,
    `<button class="fer fer-acao" data-acao="desfazer" type="button" title="Desfazer o último traço">↶ Desfazer</button>`,
    `<button class="fer fer-acao" data-acao="limpar" type="button" title="Apagar o quadro inteiro">Limpar</button>`,
  ].join('');

  /** @param {string} id */
  function usarFerramenta(id) {
    const ehTexto = id === TEXTO;
    // A classe no <canvas> é o que liga/desliga `pointer-events` no CSS. Sem
    // ela o canvas engoliria o clique e a textarea nunca receberia foco.
    canvas.classList.toggle('passa-clique', ehTexto);
    if (!ehTexto) lousa.usar(id);
    for (const b of barra.querySelectorAll('[data-fer]')) {
      b.classList.toggle('ativa', b.getAttribute('data-fer') === id);
    }
    if (ehTexto) texto.focus();
  }
  usarFerramenta(TEXTO);

  barra.addEventListener('click', (ev) => {
    const alvo = /** @type {HTMLElement} */ (ev.target).closest('[data-fer],[data-acao]');
    if (!alvo) return;
    const fer = alvo.getAttribute('data-fer');
    if (fer) { usarFerramenta(fer); return; }
    if (alvo.getAttribute('data-acao') === 'desfazer') lousa.desfazer();
    if (alvo.getAttribute('data-acao') === 'limpar') lousa.limpar();
  });

  // Atalhos só quando o foco NÃO está num campo de texto: senão digitar "2" no
  // título trocaria a caneta no meio da palavra.
  document.addEventListener('keydown', (ev) => {
    const emCampo = /** @type {HTMLElement} */ (ev.target)?.matches?.('input, textarea');
    if (emCampo || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const mapa = { t: TEXTO, 1: 'preto', 2: 'vermelho', 3: 'azul', 4: 'borracha' };
    const escolha = mapa[ev.key.toLowerCase()];
    if (escolha) { ev.preventDefault(); usarFerramenta(escolha); }
  });

  // ---- tamanho do canvas ----
  // `ResizeObserver` e não só `window.resize`: o quadro também muda de tamanho
  // quando a aba é mostrada (ele nasce com largura 0 dentro de uma `.view`
  // escondida) e quando o teclado do celular sobe. `resize` não dispara nesses.
  const ro = new ResizeObserver(() => lousa.redimensionar());
  ro.observe(canvas);
  lousa.redimensionar();

  // ---- reconhecer ----
  let ocupado = false;

  function mostrarStatus(txt, tipo = '') {
    status.textContent = txt;
    status.className = `lousa-status ${tipo}`;
  }

  botao.addEventListener('click', async () => {
    if (ocupado) return; // clique duplo é uma leitura paga a mais, não uma segunda opinião

    const digitado = texto.value.trim();
    const desenho = lousa.exportar();
    if (!digitado && !desenho) {
      await avisar({ titulo: 'Lousa vazia', texto: 'Escreva o treino no quadro ou desenhe antes de reconhecer.' });
      return;
    }

    ocupado = true;
    botao.disabled = true;
    const rotulo = botao.textContent;
    botao.textContent = 'Lendo a lousa…';
    mostrarStatus(desenho ? 'Enviando o quadro e o texto para reconhecimento…' : 'Enviando o texto para reconhecimento…');

    try {
      const { treino, restantes } = await parseWorkoutLousa({
        textInput: digitado,
        canvasImageBase64: desenho?.base64 ?? null,
        mimeType: desenho?.mimeType ?? 'image/jpeg',
      });
      mostrarStatus(`Treino reconhecido · ${restantes} leitura(s) restante(s) hoje.`, 'ok');
      await abrirPrevia(treino, { ...lousa.miniatura(), texto: digitado }, ctx, { titulo, data, hora });
    } catch (e) {
      // A mensagem já vem escrita para o coach (`chamadas.js` traduz o que é de
      // transporte e repassa o que a função escreveu).
      mostrarStatus(/** @type {Error} */ (e).message, 'erro');
      await avisar({ titulo: 'Não deu para ler a lousa', texto: /** @type {Error} */ (e).message });
    } finally {
      ocupado = false;
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  });
}

/**
 * O lado A: o quadro do jeito que o coach deixou.
 *
 * Tem que trazer o TEXTO e o DESENHO juntos, empilhados como estão no quadro —
 * não só a imagem do canvas. O canvas guarda apenas o traço; o que foi digitado
 * mora na textarea por baixo dele. Mostrar só o canvas daria um lado A quase em
 * branco justamente para o coach que digitou o treino inteiro, e a comparação
 * que este modal existe para permitir não aconteceria.
 */
function reproducaoDaLousa({ dataUrl, proporcao, texto }) {
  if (!dataUrl && !texto) return '<p class="previa-vazio">Lousa vazia.</p>';
  // A proporção do quadro vai junto para o desenho cair sobre o texto na mesma
  // posição relativa em que o coach o fez. Sem ela, um quadro largo esmagado
  // numa coluna estreita deslocaria cada traço do que ele estava apontando.
  return `<div class="previa-quadro" style="aspect-ratio:${Number(proporcao) || 2}">
    ${texto ? `<pre class="previa-texto">${esc(texto)}</pre>` : ''}
    ${dataUrl ? `<img class="previa-desenho" src="${dataUrl}" alt="Traços desenhados pelo coach sobre o quadro" />` : ''}
  </div>`;
}

/**
 * A PRÉVIA COMPARATIVA: lousa do coach (lado A) × treino estruturado (lado B).
 *
 * Os dois lados juntos, e não só o resultado, porque é a única forma de o coach
 * conferir a leitura sem reconstruir de cabeça o que ele tinha escrito. É aqui
 * que um "3x8" lido como "3x3" aparece — e é por isso que nada é salvo antes
 * deste passo.
 */
async function abrirPrevia(treino, lousaOriginal, ctx, campos) {
  const n = exerciciosDo(treino).length;
  const corpoHTML = `
    <div class="previa">
      <section class="previa-lado">
        <h4 class="previa-h">A · Lousa do coach</h4>
        ${reproducaoDaLousa(lousaOriginal)}
      </section>
      <section class="previa-lado">
        <h4 class="previa-h">B · Treino estruturado</h4>
        <p class="previa-meta">
          <b>${esc(treino.sistema)}</b> · ${n} exercício${n === 1 ? '' : 's'} · ${totalSeries(treino)} séries
        </p>
        ${cardsDoTreino(treino)}
      </section>
    </div>`;

  const acao = await painel({
    titulo: 'Confira antes de usar',
    corpoHTML,
    largo: true,
    // `painel()` já põe o "Fechar" à esquerda, e fechar sem escolher é
    // justamente descartar a leitura — não precisa de um segundo botão dizendo
    // a mesma coisa.
    acoes: [{ id: 'usar', label: 'Usar este treino' }],
  });
  if (acao !== 'usar') return;

  store.definirTreino(treino);
  if (!campos.titulo.value.trim() && treino.titulo) {
    campos.titulo.value = treino.titulo;
    store.atualizar({ titulo: treino.titulo });
  }

  // Salvar AQUI, e não na aba seguinte: é esta gravação que dispara o gatilho de
  // consolidação de volume, e é o `workoutId` dela que a distribuição para a
  // turma exige. Adiar significaria o coach chegar na aba da turma e descobrir
  // que precisa voltar.
  try {
    const dados = paraGravar(treino, {
      dateId: campos.data.value,
      titulo: campos.titulo.value,
      classTime: campos.hora.value,
    });
    const id = await salvarLousa(ctx.uid(), dados, store.ler().workoutId || undefined);
    store.atualizar({ workoutId: id });
    ctx.irPara('alertas');
  } catch (e) {
    console.error('Falha ao salvar a lousa:', e);
    // O treino continua em memória e nas abas seguintes; só a gravação falhou.
    // Dizer isso é melhor que um erro genérico, porque muda o que o coach faz:
    // ele pode seguir montando e tentar salvar de novo, sem redigitar nada.
    await avisar({
      titulo: 'Treino reconhecido, mas não salvo',
      texto: 'O treino está aqui na tela e você pode continuar, mas ele ainda não foi para a nuvem. '
        + 'Confira a conexão e use "Salvar de novo" na aba da turma antes de distribuir.',
    });
    ctx.irPara('alertas');
  }
}
