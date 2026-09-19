// @ts-check
/**
 * MÓDULO 1 — LOUSA DO COACH.
 *
 * O quadro branco: título, data, texto DIGITÁVEL E COLORIDO e um <canvas> por
 * cima para desenhar. O botão dourado manda tudo para a IA e devolve o treino
 * estruturado.
 *
 * ── Por que o texto é digitado, e ainda assim colorido ───────────────────────
 * A primeira versão tinha uma `<textarea>` embaixo do canvas: para escrever, o
 * coach digitava; para marcar intensidade, ele rabiscava com o mouse. Rabiscar
 * com o mouse é improdutivo, e na prática a cor — que é o DADO mais valioso da
 * lousa — só seria usada por quem tivesse tablet. Agora o texto é um
 * `contenteditable` (ver `editor-rico.js`) e as mesmas três canetas pintam o que
 * é digitado.
 *
 * ── A barra tem DOIS eixos, e isso é proposital ──────────────────────────────
 * MODO (digitar / desenhar) decide quem recebe o toque — o editor por baixo ou o
 * canvas por cima. COR (preto / vermelho / azul) vale para os dois ao mesmo
 * tempo: escolher vermelho pinta a seleção do texto E carrega a caneta. Um único
 * eixo misturando as duas coisas — como era antes, com "Texto" no meio das
 * canetas — obrigava o coach a trocar de ferramenta para mudar de cor, e a
 * perder a cor ao voltar a digitar.
 *
 * O canvas continua SOBREPOSTO ao texto, não ao lado: é assim que o quadro do
 * box funciona — escreve "Agachamento" e risca uma seta ao lado, no mesmo lugar.
 */
import { CANETAS } from '../core/cores.js';
import { criarLousa } from '../core/canvas.js';
import { criarHistorico } from '../core/historico.js';
import { criarEditor } from './editor-rico.js';
import { paraPrompt, textoPlano, segmentosDoTreino } from '../core/texto-rico.js';
import { paraGravar, paraGravarSemTreino, totalSeries, exerciciosDo } from '../core/lousa-modelo.js';
import { parseWorkoutLousa, salvarLousa } from '../cloud/chamadas.js';
import { confirmar } from '../../../compartilhado/ui/dialogo.js';
import * as store from './store.js';
import { painel, avisar } from '../../../compartilhado/ui/dialogo.js';
import { confirmarEExcluir } from './excluir-treino.js';
import { cardsDoTreino, esc } from './render-treino.js';

const $ = (s) => /** @type {any} */ (document.querySelector(s));

/** @type {{editor: any, lousa: any, campos: any}|null} */
let tela = null;

/**
 * @param {{uid: () => string, irPara: (aba: string) => void}} ctx
 */
export function montar(ctx) {
  const titulo = $('#lousa-titulo');
  const data = $('#lousa-data');
  const canvas = /** @type {HTMLCanvasElement} */ ($('#lousa-canvas'));
  const alvoTexto = $('#lousa-texto');
  const barra = $('#lousa-ferramentas');
  const botao = $('#lousa-reconhecer');
  const status = $('#lousa-status');
  if (!canvas || !barra || !alvoTexto) return;

  const lousa = criarLousa(canvas);
  const editor = criarEditor(alvoTexto);
  const est = store.ler();

  // ---- campos, a partir do rascunho ----
  titulo.value = est.titulo;
  data.value = est.dateId;
  if (est.texto) editor.carregar([{ texto: est.texto, cor: 'preto' }]);

  titulo.addEventListener('input', () => store.atualizar({ titulo: titulo.value }));
  data.addEventListener('change', () => store.atualizar({ dateId: data.value }));
  /* ---------------- desfazer, para as duas camadas ---------------- */

  /**
   * O histórico guarda o QUADRO INTEIRO — texto e traço juntos.
   *
   * Um desfazer por camada obrigaria o coach a saber qual foi a última coisa que
   * ele mexeu antes de escolher o botão certo. Com um só, "voltar" volta o que
   * aconteceu por último, seja lá o que for — inclusive o Limpar, que é o clique
   * mais caro de errar na tela.
   */
  const historico = criarHistorico();

  /**
   * A assinatura barata de um estado.
   *
   * O contador de traços serve porque traço pronto é imutável: se o número não
   * mudou, o desenho não mudou. Comparar ponto a ponto custaria mais que guardar
   * o estado.
   */
  let serieTracos = 0;
  const chaveAtual = () => `${serieTracos}|${editor.html()}`;
  const estadoAtual = () => ({ html: editor.html(), tracos: lousa.tracos() });

  const guardar = () => historico.registrar(chaveAtual(), estadoAtual());

  /**
   * Digitar guarda o estado DEPOIS de uma pausa.
   *
   * Sem a pausa, cada tecla viraria um passo e apagar uma palavra exigiria
   * quinze cliques em Desfazer. Com ela, cada "rajada" de digitação é um passo —
   * que é como o coach pensa no que fez.
   */
  let timerTexto = null;
  const PAUSA_TEXTO = 700;

  editor.aoMudar(() => {
    // O rascunho guarda só o texto PLANO: a cor volta na próxima leitura, e
    // guardar HTML no localStorage seria guardar markup de navegador entre sessões.
    store.atualizar({ texto: editor.texto() });
    clearTimeout(timerTexto);
    timerTexto = setTimeout(() => { guardar(); pintarBarra(); }, PAUSA_TEXTO);
  });

  // Traço pronto é um passo na hora: o gesto acabou, não há rajada a esperar.
  lousa.aoMudar(() => { serieTracos++; guardar(); pintarBarra(); });

  function desfazer() {
    clearTimeout(timerTexto);
    // Guarda o que está na tela antes de voltar: sem isto, o estado atual nunca
    // entrou na pilha (a pausa da digitação ainda não tinha vencido) e o
    // primeiro Desfazer pularia um passo.
    guardar();
    const anterior = historico.desfazer();
    if (!anterior) { pintarBarra(); return; }
    serieTracos++;
    editor.definirHtml(anterior.html);
    lousa.restaurar(anterior.tracos);
    pintarBarra();
  }

  tela = { editor, lousa, historico, campos: { titulo, data } };

  /* ---------------- barra de ferramentas ---------------- */

  let modo = 'digitar';
  let cor = 'preto';

  barra.innerHTML = `
    <div class="fer-grupo" role="group" aria-label="Modo">
      <button class="fer" data-modo="digitar" type="button" title="Digitar no quadro (T)">✎ Digitar</button>
      <button class="fer" data-modo="desenhar" type="button" title="Desenhar sobre o quadro (D)">✐ Desenhar</button>
    </div>
    <div class="fer-grupo" role="group" aria-label="Cor — vale para o texto e para a caneta">
      ${CANETAS.map((c) => `
        <button class="fer fer-cor" data-cor="${c.id}" type="button" title="${esc(c.significado)} (${c.atalho})">
          <span class="fer-bola" style="background:${c.cor}"></span>${esc(c.rotulo)}</button>`).join('')}
    </div>
    <span class="fer-sep"></span>
    <button class="fer" data-acao="borracha" type="button" title="Apagar traço do desenho (4)">
      <span class="fer-bola fer-borracha"></span>Borracha</button>
    <button class="fer fer-acao" data-acao="desfazer" type="button" title="Desfazer a última ação — texto ou traço (Ctrl+Z)">↶ Desfazer</button>
    <button class="fer fer-acao" data-acao="limpar" type="button" title="Apagar o quadro inteiro">Limpar</button>`;

  function pintarBarra() {
    for (const b of barra.querySelectorAll('[data-modo]')) {
      b.classList.toggle('ativa', b.getAttribute('data-modo') === modo);
    }
    for (const b of barra.querySelectorAll('[data-cor]')) {
      b.classList.toggle('ativa', b.getAttribute('data-cor') === cor);
    }
    barra.querySelector('[data-acao=borracha]')?.classList.toggle('ativa', modo === 'borracha');
    const btnDesfazer = barra.querySelector('[data-acao=desfazer]');
    if (btnDesfazer) btnDesfazer.disabled = !historico.podeDesfazer();
    // A classe no canvas é o que liga/desliga `pointer-events` no CSS: em modo
    // digitar ele precisa deixar o clique passar para o editor por baixo.
    canvas.classList.toggle('passa-clique', modo === 'digitar');
  }

  function usarModo(novo) {
    modo = novo;
    if (modo === 'borracha') lousa.usar('borracha');
    else if (modo === 'desenhar') lousa.usar(cor);
    pintarBarra();
    if (modo === 'digitar') editor.focar();
  }

  /** A cor vale para os dois: pinta o texto selecionado E carrega a caneta. */
  function usarCor(novo) {
    cor = novo;
    lousa.usar(cor);
    // Sair da borracha ao escolher uma cor é o que o gesto quer dizer: ninguém
    // clica em "vermelho" querendo continuar apagando.
    if (modo === 'borracha') modo = 'desenhar';
    if (modo === 'digitar') editor.pintar(cor);
    pintarBarra();
  }

  // `mousedown` com preventDefault: sem isto, clicar na barra tira o foco do
  // editor, a seleção morre junto, e `foreColor` chega sem ter o que pintar.
  barra.addEventListener('mousedown', (ev) => {
    if (/** @type {HTMLElement} */ (ev.target).closest('button')) ev.preventDefault();
  });

  barra.addEventListener('click', async (ev) => {
    const alvo = /** @type {HTMLElement} */ (ev.target).closest('[data-modo],[data-cor],[data-acao]');
    if (!alvo) return;
    const m = alvo.getAttribute('data-modo');
    const c = alvo.getAttribute('data-cor');
    const acao = alvo.getAttribute('data-acao');
    if (m) return usarModo(m);
    if (c) return usarCor(c);
    if (acao === 'borracha') return usarModo('borracha');
    if (acao === 'desfazer') return desfazer();
    if (acao === 'limpar') {
      // Confirma mesmo sendo desfazível: "limpar" apaga as DUAS camadas de uma
      // vez, e perguntar custa um clique enquanto descobrir o estrago custa o
      // susto. O Desfazer é a rede embaixo, não a substituição do aviso.
      const ok = await confirmar({
        titulo: 'Limpar o quadro?',
        texto: 'Isso apaga o texto digitado <b>e</b> o desenho. Dá para voltar em <b>↶ Desfazer</b>.',
        ok: 'Limpar tudo',
        perigo: true,
      });
      if (!ok) return;
      clearTimeout(timerTexto);
      guardar();            // o quadro cheio entra na pilha…
      lousa.limpar();
      editor.limpar();
      // "Limpar" quer dizer TREINO NOVO, não só quadro em branco: o rascunho vai
      // junto — e com ele o `workoutId`. Sem isto, o próximo treino gravava POR
      // CIMA do anterior, porque `salvarLousa` reaproveitava o endereço antigo.
      // A data fica (é o único campo que o coach repete de propósito).
      store.limpar();
      titulo.value = '';
      data.value = store.ler().dateId;
      serieTracos++;
      guardar();            // …e o quadro vazio vira o passo seguinte
      usarModo('digitar');
    }
  });

  usarModo('digitar');
  usarCor('preto');
  guardar();       // o estado inicial é o fundo da pilha
  pintarBarra();

  // Atalhos só fora de campo de texto do formulário — mas DENTRO do editor eles
  // valem, que é onde trocar de caneta no meio da frase faz sentido.
  document.addEventListener('keydown', (ev) => {
    // Ctrl+Z / Cmd+Z vai para o NOSSO desfazer, não para o do navegador. Deixar
    // o nativo passar faria ele mexer só no texto e sair de sincronia com a
    // pilha daqui — duas memórias do mesmo quadro, discordando.
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
      // Com um modal aberto o atalho é dele, não da lousa por baixo.
      if (document.querySelector('.modal-bg:not([hidden])')) return;
      ev.preventDefault();
      desfazer();
      return;
    }
    const emCampo = /** @type {HTMLElement} */ (ev.target)?.matches?.('input, textarea');
    if (emCampo || ev.ctrlKey || ev.metaKey) return;
    const dentroDoEditor = alvoTexto.contains(/** @type {Node} */ (ev.target));
    // Dentro do editor, só com Alt: senão digitar "1" viraria troca de caneta.
    if (dentroDoEditor && !ev.altKey) return;
    const mapaCor = { 1: 'preto', 2: 'vermelho', 3: 'azul' };
    if (mapaCor[ev.key]) { ev.preventDefault(); usarCor(mapaCor[ev.key]); return; }
    const mapaModo = { t: 'digitar', d: 'desenhar', 4: 'borracha' };
    const escolha = mapaModo[ev.key.toLowerCase()];
    if (escolha) { ev.preventDefault(); usarModo(escolha); }
  });

  // `ResizeObserver` e não só `window.resize`: o quadro também muda de tamanho
  // quando a aba aparece (nasce com largura 0 dentro de uma `.view` escondida) e
  // quando o teclado do celular sobe. `resize` não dispara nesses.
  new ResizeObserver(() => lousa.redimensionar()).observe(canvas);
  lousa.redimensionar();

  /* ---------------- excluir o treino gravado ---------------- */

  /**
   * O botão só aparece quando a lousa na tela É um documento gravado.
   *
   * Quadro em branco não tem o que apagar, e um botão vermelho parado ali é só
   * uma chance a mais de clique errado. Quem manda é o `workoutId` do rascunho:
   * ele existe depois de salvar e depois de reabrir pelo Calendário, que são
   * exatamente os dois casos em que apagar faz sentido.
   */
  const btnExcluir = $('#lousa-excluir');
  const mostrarExcluir = () => {
    if (btnExcluir) btnExcluir.hidden = !store.ler().workoutId;
  };
  store.aoMudar(mostrarExcluir);
  mostrarExcluir();

  btnExcluir?.addEventListener('click', async () => {
    const est = store.ler();
    if (!est.workoutId) return;

    btnExcluir.disabled = true;
    const rotulo = btnExcluir.textContent;
    try {
      const apagou = await confirmarEExcluir({
        workoutId: est.workoutId,
        titulo: est.treino?.titulo || est.titulo,
        dateId: est.dateId,
      });
      if (!apagou) return;
      // Zera a tela: manter o treino apagado no rascunho deixaria o coach
      // distribuindo, na aba seguinte, uma coisa que não existe mais.
      store.limpar();
      editor.limpar();
      lousa.limpar();
      titulo.value = '';
      historico.recomecar('apagado', { html: editor.html(), tracos: [] });
      pintarBarra();
      mostrarStatus('');
      ctx.irPara('calendario');
    } finally {
      btnExcluir.disabled = false;
      btnExcluir.textContent = rotulo;
    }
  });

  /* ---------------- dia sem treino ---------------- */

  /**
   * Marcar o dia como SEM TREINO — feriado, descanso, box fechado.
   *
   * Grava um documento com `treino: null`, e é isso que o faz não contar: os
   * dois leitores do servidor pulam documento cujo treino não é objeto. O dia
   * aparece no Calendário como bloqueado e some do volume — que é a diferença
   * entre "não teve aula" e "esqueci de montar".
   *
   * O TÍTULO vira o motivo, se o coach tiver escrito um. "Feriado · 7 de
   * setembro" é mais útil daqui a três meses que um genérico "Sem treino", e o
   * campo já está ali preenchido na metade das vezes.
   */
  const btnSemTreino = $('#lousa-sem-treino');
  btnSemTreino?.addEventListener('click', async () => {
    const dia = data.value.trim();
    if (!dia) {
      await avisar({ titulo: 'Escolha a data', texto: 'Preencha a data antes de marcar o dia como sem treino.' });
      return;
    }
    const motivo = titulo.value.trim();
    const ok = await confirmar({
      titulo: 'Marcar dia sem treino?',
      texto: `O dia <b>${esc(dia)}</b> fica marcado como <b>${esc(motivo || 'Sem treino')}</b> no Calendário.<br><br>`
        + 'Ele <b>não soma série nenhuma</b> no Dashboard de Volume e não conta como treino da semana. '
        + 'Dá para remover a marcação depois, pelo próprio Calendário.',
      ok: 'Marcar',
    });
    if (!ok) return;

    btnSemTreino.disabled = true;
    const rotulo = btnSemTreino.textContent;
    btnSemTreino.textContent = 'Marcando…';
    mostrarStatus('Marcando o dia como sem treino…');
    try {
      await salvarLousa(ctx.uid(), paraGravarSemTreino({ dateId: dia, motivo }));
      // O rascunho é zerado: o `workoutId` da marcação não é um treino que o
      // coach possa distribuir, e deixá-lo no estado faria a aba da Turma
      // oferecer envio de um dia que não tem aula.
      store.limpar();
      editor.limpar();
      lousa.limpar();
      titulo.value = '';
      historico.recomecar('sem-treino', { html: editor.html(), tracos: [] });
      pintarBarra();
      mostrarStatus('');
      ctx.irPara('calendario');
    } catch (e) {
      mostrarStatus(/** @type {Error} */ (e).message, 'erro');
      await avisar({ titulo: 'Não deu para marcar', texto: /** @type {Error} */ (e).message });
    } finally {
      btnSemTreino.disabled = false;
      btnSemTreino.textContent = rotulo;
    }
  });

  /* ---------------- reconhecer ---------------- */

  let ocupado = false;

  function mostrarStatus(txt, tipo = '') {
    status.textContent = txt;
    status.className = `lousa-status ${tipo}`;
  }

  botao.addEventListener('click', async () => {
    if (ocupado) return; // clique duplo é uma leitura paga a mais, não uma segunda opinião

    const segmentos = editor.segmentos();
    const digitado = paraPrompt(segmentos).trim();
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
      const { treino, restantes, origem } = await parseWorkoutLousa({
        textInput: digitado,
        canvasImageBase64: desenho?.base64 ?? null,
        mimeType: desenho?.mimeType ?? 'image/jpeg',
      });
      // A ORIGEM na tela: sem ela, ninguém percebe que o caminho barato parou de
      // acertar — a conta da OpenAI conta a história um mês depois.
      const comoFoi = {
        local: 'lido sem IA (catálogo)',
        parcial: 'lido com classificação parcial',
      }[origem] || 'lido pela IA';
      mostrarStatus(`Treino reconhecido · ${comoFoi} · ${restantes} leitura(s) restante(s) hoje.`, 'ok');
      await abrirPrevia(treino, {
        ...lousa.miniatura(),
        segmentos,
        texto: textoPlano(segmentos),
      }, ctx, { titulo, data });
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
 * Abre um treino salvo de volta no quadro — o Calendário chama isto.
 *
 * Prefere o TEXTO ORIGINAL que o coach digitou (guardado em `textoOriginal`
 * desde que este campo existe) e só reconstrói a partir da estrutura quando ele
 * não está lá: reconstruir é fiel ao treino, mas perde o comentário do rodapé e
 * a ordem em que ele preferiu listar. O desenho não volta — ele não é guardado,
 * e dizer isso é melhor que ressuscitar meio quadro.
 *
 * @param {any} lousaSalva o documento de `coaches/{uid}/lousas`
 */
export function abrirTreinoSalvo(lousaSalva) {
  if (!tela || !lousaSalva) return false;
  const { editor, lousa, campos } = tela;
  const treino = lousaSalva.treino;

  const segs = lousaSalva.textoOriginal
    ? [{ texto: String(lousaSalva.textoOriginal), cor: /** @type {const} */ ('preto') }]
    : segmentosDoTreino(treino);

  lousa.limpar();
  editor.carregar(segs);
  campos.titulo.value = treino?.titulo || '';
  campos.data.value = lousaSalva.dateId || '';
  // O quadro passou a ser OUTRO documento: manter o histórico deixaria o coach
  // desfazer de um treino para dentro do anterior.
  tela.historico.recomecar('aberto', { html: editor.html(), tracos: [] });

  store.atualizar({
    titulo: campos.titulo.value,
    dateId: campos.data.value,
    texto: editor.texto(),
    treino,
    workoutId: lousaSalva.workoutId || '',
    workoutDateId: lousaSalva.dateId || '',
    alertas: null,
    fichas: [],
  });
  return true;
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
      textoOriginal: lousaOriginal.texto || '',
    });
    // Reaproveitar o `workoutId` é REGRAVAR aquele documento. Só vale quando é a
    // mesma lousa: o coach corrigiu um "3x8" lido como "3x3" e mandou ler de
    // novo, ou reabriu o treino pelo Calendário. Se a DATA mudou, é outro treino
    // — e regravar ali apagaria o treino do dia anterior sem erro nenhum.
    const est = store.ler();
    const mesmaLousa = est.workoutId && est.workoutDateId === dados.dateId;
    const id = await salvarLousa(ctx.uid(), dados, mesmaLousa ? est.workoutId : undefined);
    store.atualizar({ workoutId: id, workoutDateId: dados.dateId });
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

/**
 * O lado A: o quadro do jeito que o coach deixou.
 *
 * Tem que trazer o TEXTO e o DESENHO juntos, empilhados como estão no quadro —
 * e o texto com as cores dele, porque é a cor que o lado B promete ter
 * entendido. Um lado A em preto e branco não deixaria conferir se o vermelho
 * virou observação e o azul virou série.
 */
function reproducaoDaLousa({ dataUrl, proporcao, segmentos }) {
  const temTexto = (segmentos || []).some((s) => s.texto.trim());
  if (!dataUrl && !temTexto) return '<p class="previa-vazio">Lousa vazia.</p>';
  const html = (segmentos || [])
    .map((s) => {
      const corpo = esc(s.texto).replace(/\n/g, '<br>');
      return s.cor === 'preto' ? corpo : `<span class="tinta-${esc(s.cor)}">${corpo}</span>`;
    })
    .join('');
  // A proporção do quadro vai junto para o desenho cair sobre o texto na mesma
  // posição relativa em que o coach o fez. Sem ela, um quadro largo esmagado
  // numa coluna estreita deslocaria cada traço do que ele estava apontando.
  return `<div class="previa-quadro" style="aspect-ratio:${Number(proporcao) || 2}">
    ${temTexto ? `<div class="previa-texto">${html}</div>` : ''}
    ${dataUrl ? `<img class="previa-desenho" src="${dataUrl}" alt="Traços desenhados pelo coach sobre o quadro" />` : ''}
  </div>`;
}
