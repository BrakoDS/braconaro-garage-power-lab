// @ts-check
/**
 * SEMANA DO BOX — aba Quadro. O coach escreve a semana nos 3 quadros e a tela
 * confere enquanto ele escreve (`core/quadro.js`). Grava sozinho, um pouco
 * depois da última tecla, em `coaches/{uid}/quadros/{AAAA-Www}`.
 *
 * Carrega na primeira vez que a aba aparece: o catálogo (pelo servidor, com os
 * ajustes do coach), o inventário, os nomes já confirmados e o quadro da semana
 * passada (para o aviso de repetição).
 *
 * "Publicar para os alunos" (07/11/2026): `core/publicar-quadro.js` monta o
 * pedido do texto conferido e `publicarQuadroBox` grava a semana que o Portal,
 * o app e a Lousa leem. A faixa de cima diz se a semana está no ar e se o
 * quadro mudou depois da última publicação (assinatura do pedido).
 */
import { chaveSemana } from '../../montador-hibrido/core/periodos.js';
import { conferirSemana, QUADROS } from '../core/quadro.js';
import { segundaDaChave } from '../core/vista.js';
import { pedidoDoQuadro } from '../core/publicar-quadro.js';
import {
  lerApelidos, lerInventario, lerQuadro, lerSemanas, listarCatalogo, publicar, publicarQuadro, salvarApelidos, salvarQuadro,
} from '../cloud/semana.js';
import { confirmar, painel } from '../../../compartilhado/ui/dialogo.js';
import { cadastrarExercicio } from './catalogo.js';
import { esc } from './render.js';
import { renderConferencia, renderImpedimentos, renderLeitura, renderPublicacao, renderPublicar, renderQuadroBase } from './render-quadro.js';

const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ESPERA_GRAVAR_MS = 1500;
/** @type {Record<string, string>} */
const NOME_DIA_CURTO = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
const CHAVE_NIVEL = 'semana-box:quadro-nivel-hyrox';
/** O nível do Hyrox que a tabela mostra fica no navegador (conveniência; sem ele, Fit). */
function nivelSalvo() {
  try { return localStorage.getItem(CHAVE_NIVEL) || 'intermediario'; } catch { return 'intermediario'; }
}

/** A semana `delta` semanas depois de `chave`. @param {string} chave @param {number} delta */
function outraSemana(chave, delta) {
  const seg = segundaDaChave(chave);
  if (!seg) return chave;
  const d = new Date(`${seg}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return chaveSemana(d.toISOString().slice(0, 10));
}

/** "Semana 45 · 02/11 a 07/11". @param {string} chave */
function rotuloDaSemana(chave) {
  const seg = segundaDaChave(chave);
  if (!seg) return chave;
  const d = new Date(`${seg}T12:00:00Z`);
  const fim = new Date(d.getTime() + 5 * 864e5);
  const dm = (/** @type {Date} */ x) => `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  return `Semana ${Number(chave.slice(6))} · ${dm(d)} a ${dm(fim)}`;
}

/** As datas da semana ("09/11"), por dia. @param {string} chave */
function datasDaSemana(chave) {
  const seg = segundaDaChave(chave);
  /** @type {Record<string, string>} */
  const datas = {};
  if (!seg) return datas;
  ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].forEach((d, i) => {
    const x = new Date(Date.parse(`${seg}T12:00:00Z`) + i * 864e5);
    datas[d] = `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  return datas;
}

/** Assinatura curta do pedido (djb2): muda quando o que iria ao aluno muda. @param {unknown} v */
function assinatura(v) {
  const s = JSON.stringify(v);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * @returns {{quadros: Record<string, {h: string, metabolico: string}>, extra: {tipo: string|null, dia: string, texto: string},
 *   adaptacoes: Record<string, {texto: string, recursos: string[]}>, semAula: Record<string, {tipo: string, texto: string}>,
 *   publicacao: {assinatura: string, em: number}|null}}
 */
function textosVazios() {
  return {
    quadros: Object.fromEntries(QUADROS.map((q) => [q.id, { h: '', metabolico: '' }])),
    extra: { tipo: null, dia: 'sabado', texto: '' },
    adaptacoes: {},
    semAula: {},
    publicacao: null,
  };
}

/** O documento gravado, completado (semana nova ou gravada pela metade). @param {any} doc */
function textosDo(doc) {
  const t = textosVazios();
  for (const q of QUADROS) {
    const g = doc?.quadros?.[q.id];
    if (g) t.quadros[q.id] = { h: String(g.h ?? ''), metabolico: String(g.metabolico ?? '') };
  }
  if (doc?.extra) t.extra = { tipo: doc.extra.tipo ?? null, dia: doc.extra.dia ?? 'sabado', texto: String(doc.extra.texto ?? '') };
  for (const [dia, a] of Object.entries(doc?.adaptacoes ?? {})) {
    const recursos = Array.isArray(/** @type {any} */ (a)?.recursos) ? /** @type {any} */ (a).recursos.map(String) : [];
    if (recursos.length) t.adaptacoes[dia] = { texto: String(/** @type {any} */ (a).texto ?? ''), recursos };
  }
  for (const [dia, s] of Object.entries(doc?.semAula ?? {})) {
    const tipo = String(/** @type {any} */ (s)?.tipo ?? '');
    if (tipo) t.semAula[dia] = { tipo, texto: String(/** @type {any} */ (s).texto ?? '') };
  }
  const p = doc?.publicacao;
  if (p && typeof p.assinatura === 'string') t.publicacao = { assinatura: p.assinatura, em: Number(p.em) || 0 };
  return t;
}

/** @param {{uid: () => string, status: (msg: string, tipo?: 'ok'|'erro'|'') => void}} ctx */
export function montar(ctx) {
  const alvo = $('#quadro-corpo');
  if (!alvo) return;

  const estado = {
    carregado: false,
    semanaId: chaveSemana(hoje()),
    /** @type {{exercicios: any[], hyrox: any[], vocabulario: any} | null} */
    catalogo: null,
    nivelHyrox: nivelSalvo(),
    inventario: /** @type {any} */ (null),
    /** @type {Record<string, string>} */
    apelidos: {},
    textos: textosVazios(),
    anterior: /** @type {any} */ (null),
    /** @type {ReturnType<typeof conferirSemana> | null} */
    conf: null,
    caminho: 'aulas',
    cadastrando: false,
    /** @type {ReturnType<typeof setTimeout> | null} */
    timer: null,
    sujo: false,
    /** A semana como o aluno lê (`coaches/{uid}/semanas/{id}`): só o que a faixa precisa. */
    publicada: /** @type {{status: 'rascunho'|'publicado'|null, origem: string|null, publicadoEm: Date|null}} */ ({ status: null, origem: null, publicadoEm: null }),
    publicando: false,
  };

  const salvo = (/** @type {string} */ msg, cls = '') => { const el = $('#quadro-salvo'); if (el) { el.textContent = msg; el.className = `qs-salvo ${cls}`; } };

  function conferir() {
    if (!estado.catalogo) return;
    estado.conf = conferirSemana({
      quadros: estado.textos.quadros, extra: estado.textos.extra, catalogo: estado.catalogo,
      apelidos: estado.apelidos, inventario: estado.inventario, anterior: estado.anterior, adaptacoes: estado.textos.adaptacoes,
    });
    for (const onde of Object.keys(estado.conf.colunas)) {
      const el = document.getElementById(`leitura-${onde.replace('.', '-')}`);
      if (el) el.innerHTML = renderLeitura(onde, estado.conf, { nivelHyrox: estado.nivelHyrox });
    }
    const painel = $('#quadro-conferencia');
    if (painel) {
      // Redesenha a cada tecla: a rolagem e os grupos que o coach abriu/fechou ficam como estavam.
      const rolagem = painel.scrollTop;
      const abertos = new Map([...painel.querySelectorAll('details[data-grupo]')].map((d) => [d.getAttribute('data-grupo'), d.open]));
      painel.innerHTML = renderConferencia(estado.conf, { caminho: estado.caminho });
      for (const d of painel.querySelectorAll('details[data-grupo]')) {
        const antes = abertos.get(d.getAttribute('data-grupo'));
        if (antes !== undefined) d.open = antes;
      }
      painel.scrollTop = rolagem;
    }
    desenharPublicacao();
  }

  /** A faixa da publicação: no ar ou não, e se o quadro mudou depois. */
  function desenharPublicacao() {
    const el = $('#quadro-publicacao');
    if (!el || !estado.conf) return;
    const { dias } = pedidoDoQuadro(estado.conf, estado.textos.semAula);
    const p = estado.publicada;
    const mudou = p.status === 'publicado' && p.origem === 'quadro' && estado.textos.publicacao?.assinatura !== assinatura(dias);
    el.innerHTML = renderPublicacao({ ...p, mudou, publicando: estado.publicando });
  }

  /** Relê a semana publicada (status, origem, quando). @param {string} semanaId */
  async function lerPublicada(semanaId) {
    try {
      const doc = (await lerSemanas(ctx.uid(), [semanaId]))[semanaId];
      if (semanaId !== estado.semanaId) return;
      const em = doc?.publicadoEm?.toDate?.() ?? null;
      estado.publicada = { status: doc?.status ?? null, origem: doc?.origem ?? null, publicadoEm: em };
    } catch (e) {
      console.error(e);
      estado.publicada = { status: null, origem: null, publicadoEm: null };
    }
    desenharPublicacao();
  }

  /** "Publicar para os alunos": os dias sem aula, o que falta, e o pedido ao servidor. */
  async function abrirPublicar() {
    if (!estado.conf || estado.publicando) return;
    await gravar();
    /** @type {Record<string, {tipo: string, texto: string}>} */
    let semAula = { ...estado.textos.semAula };
    const corpo = () => /** @type {HTMLElement|null} */ (document.querySelector('#modal-app-corpo'));
    const atualizar = () => {
      const r = pedidoDoQuadro(/** @type {any} */ (estado.conf), semAula);
      const el = document.querySelector('#qs-pub-resumo');
      if (el) el.innerHTML = renderImpedimentos(r);
      const b = /** @type {HTMLButtonElement|null} */ (document.querySelector('#modal-app-acoes [data-acao="publicar"]'));
      if (b) b.disabled = r.impedimentos.length > 0;
    };
    /** @param {Event} ev */
    const mudou = (ev) => {
      const t = /** @type {HTMLInputElement|HTMLSelectElement} */ (ev.target);
      const dia = t.getAttribute('data-sem-aula');
      if (dia) {
        const texto = /** @type {HTMLInputElement|null} */ (corpo()?.querySelector(`[data-sem-aula-texto="${dia}"]`));
        if (t.value) semAula = { ...semAula, [dia]: { tipo: t.value, texto: texto?.value.trim() ?? '' } };
        else { const { [dia]: _fora, ...resto } = semAula; semAula = resto; }
        if (texto) texto.hidden = !t.value;
        atualizar();
        return;
      }
      const diaTexto = t.getAttribute('data-sem-aula-texto');
      if (diaTexto && semAula[diaTexto]) semAula = { ...semAula, [diaTexto]: { ...semAula[diaTexto], texto: t.value.trim() } };
    };
    const r0 = pedidoDoQuadro(estado.conf, semAula);
    const promessa = painel({
      titulo: 'Publicar para os alunos',
      corpoHTML: renderPublicar({ rotulo: rotuloDaSemana(estado.semanaId), datas: datasDaSemana(estado.semanaId), semAula, ...r0 }),
      acoes: [{ id: 'publicar', label: 'Publicar' }], fechar: 'Cancelar',
    });
    corpo()?.addEventListener('change', mudou);
    corpo()?.addEventListener('input', mudou);
    atualizar();
    const acao = await promessa;
    corpo()?.removeEventListener('change', mudou);
    corpo()?.removeEventListener('input', mudou);
    // O motivo e os dias sem aula ficam lembrados no quadro, publicando ou não.
    if (JSON.stringify(semAula) !== JSON.stringify(estado.textos.semAula)) {
      estado.textos.semAula = semAula;
      agendar();
    }
    if (acao !== 'publicar') { desenharPublicacao(); return; }
    const r = pedidoDoQuadro(estado.conf, semAula);
    if (r.impedimentos.length) { ctx.status(r.impedimentos[0].texto, 'erro'); return; }
    const semanaId = estado.semanaId;
    estado.publicando = true;
    desenharPublicacao();
    ctx.status('Publicando a semana…');
    try {
      const resp = await publicarQuadro(semanaId, r.dias);
      if (semanaId === estado.semanaId) {
        estado.textos.publicacao = { assinatura: assinatura(r.dias), em: Date.now() };
        estado.sujo = true;
        await gravar();
      }
      const mantidos = (resp?.mantidos ?? []).map((d) => NOME_DIA_CURTO[d] ?? d);
      ctx.status(`Publicada: os alunos já veem no Portal, no app e na Lousa.${mantidos.length ? ` ${mantidos.join(', ')} já passou e ficou como estava.` : ''}`, 'ok');
    } catch (e) {
      console.error(e);
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para publicar. Tente de novo.', 'erro');
    } finally {
      estado.publicando = false;
      await lerPublicada(semanaId);
    }
  }

  /** "Tirar do ar": a semana volta a rascunho e some do Portal, do app e da Lousa. */
  async function tirarDoAr() {
    const ok = await confirmar({
      titulo: 'Tirar a semana do ar?',
      texto: 'O aluno deixa de ver esta semana no Portal, no app e na Lousa. O quadro continua aqui, e você pode publicar de novo.',
      ok: 'Tirar do ar', perigo: true,
    });
    if (!ok) return;
    const semanaId = estado.semanaId;
    try {
      await publicar(semanaId, false);
      ctx.status('A semana saiu do ar.', 'ok');
    } catch (e) {
      console.error(e);
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para tirar do ar.', 'erro');
    }
    await lerPublicada(semanaId);
  }

  function desenhar() {
    const nomes = [
      ...(estado.catalogo?.exercicios ?? []).map((e) => e.nome),
      ...(estado.catalogo?.hyrox ?? []).flatMap((h) => [h.nome, h.substituta?.nome].filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    alvo.innerHTML = renderQuadroBase({ semanaId: estado.semanaId, rotulo: rotuloDaSemana(estado.semanaId), textos: estado.textos, nomesCatalogo: nomes });
    conferir();
  }

  async function gravar() {
    if (estado.timer) { clearTimeout(estado.timer); estado.timer = null; }
    if (!estado.sujo) return;
    estado.sujo = false;
    salvo('Salvando…');
    try {
      await salvarQuadro(ctx.uid(), estado.semanaId, estado.textos);
      salvo(`Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
    } catch (e) {
      console.error(e);
      estado.sujo = true;
      salvo('Não salvou — confira a conexão. Tento de novo na próxima mudança.', 'erro');
    }
  }
  const agendar = () => {
    estado.sujo = true;
    salvo('Alterações não salvas…');
    if (estado.timer) clearTimeout(estado.timer);
    estado.timer = setTimeout(gravar, ESPERA_GRAVAR_MS);
  };

  async function abrirSemana(/** @type {string} */ semanaId) {
    await gravar();
    estado.semanaId = semanaId;
    estado.publicada = { status: null, origem: null, publicadoEm: null };
    lerPublicada(semanaId);
    ctx.status('Carregando o quadro…');
    try {
      const [doc, anterior] = await Promise.all([
        lerQuadro(ctx.uid(), semanaId), lerQuadro(ctx.uid(), outraSemana(semanaId, -1)),
      ]);
      estado.textos = textosDo(doc);
      estado.anterior = anterior;
      ctx.status('');
    } catch (e) {
      console.error(e);
      estado.textos = textosVazios();
      ctx.status('Não deu para ler o quadro desta semana. Confira a conexão antes de escrever.', 'erro');
    }
    desenhar();
  }

  async function carregar() {
    estado.carregado = true;
    ctx.status('Carregando o catálogo e o inventário…');
    try {
      const [cat, inv, ap] = await Promise.all([listarCatalogo(), lerInventario(ctx.uid()), lerApelidos(ctx.uid())]);
      estado.catalogo = cat;
      estado.inventario = inv;
      estado.apelidos = ap;
    } catch (e) {
      console.error(e);
      estado.carregado = false; // a próxima ida à aba tenta de novo
      ctx.status(/** @type {any} */ (e)?.message || 'Não deu para ler o catálogo.', 'erro');
      return;
    }
    await abrirSemana(estado.semanaId);
  }

  /** Confirma o nome escrito (ou "-" = fora do catálogo) e grava a lista. @param {string} k @param {string} id */
  async function confirmarNome(k, id) {
    estado.apelidos = { ...estado.apelidos, [k]: id };
    conferir();
    try {
      await salvarApelidos(ctx.uid(), Object.fromEntries(Object.entries(estado.apelidos).filter(([, v]) => v && v !== '?')));
    } catch (e) {
      console.error(e);
      ctx.status('O nome valeu nesta tela, mas não foi gravado. Confira a conexão.', 'erro');
    }
  }

  /** "+ Cadastrar": o formulário do Catálogo com o nome escrito; criado, o nome passa a apontar para ele. @param {string} k @param {string} nome */
  async function cadastrar(k, nome) {
    if (!estado.catalogo) return;
    await gravar();
    estado.cadastrando = true;
    const r = await cadastrarExercicio({ nome, dados: estado.catalogo, status: ctx.status }).finally(() => { estado.cadastrando = false; });
    if (!r) return;
    try {
      estado.catalogo = await listarCatalogo();
    } catch (e) {
      console.error(e);
      ctx.status(`${r.nome} foi criado, mas não deu para reler o catálogo. Recarregue a página.`, 'erro');
      return;
    }
    await confirmarNome(k, r.id);
    desenhar();
    ctx.status(`${r.nome} criado no catálogo: já conta no quadro.`, 'ok');
  }

  /** "Marcar como adaptado": o coach conta como resolveu a falta; grava com a semana. @param {string} dia @param {string[]} recursos */
  async function adaptar(dia, recursos) {
    const atual = estado.textos.adaptacoes[dia]?.texto ?? '';
    const acao = await painel({
      titulo: 'Marcar como adaptado',
      corpoHTML: `<label class="field"><span class="inv-rotulo">Como foi adaptado</span>
        <input type="text" id="qs-adaptacao" maxlength="120" value="${esc(atual)}" placeholder="Ex.: banco substituído por caixa de salto" /></label>`,
      acoes: [{ id: 'salvar', label: 'Marcar como adaptado' }], fechar: 'Cancelar', largo: false,
    });
    const texto = /** @type {HTMLInputElement|null} */ (document.querySelector('#qs-adaptacao'))?.value.trim() ?? '';
    if (acao !== 'salvar') return;
    if (!texto) { ctx.status('Escreva em poucas palavras como foi adaptado.', 'erro'); return; }
    estado.textos.adaptacoes = { ...estado.textos.adaptacoes, [dia]: { texto, recursos } };
    conferir();
    agendar();
  }

  alvo.addEventListener('input', (/** @type {Event} */ ev) => {
    const t = /** @type {HTMLTextAreaElement} */ (ev.target);
    const col = t.getAttribute?.('data-col');
    if (!col) return;
    if (col === 'extra') estado.textos.extra.texto = t.value;
    else {
      const [q, lado] = col.split('.');
      estado.textos.quadros[q][lado === 'h' ? 'h' : 'metabolico'] = t.value;
    }
    conferir();
    agendar();
  });

  alvo.addEventListener('change', (/** @type {Event} */ ev) => {
    const t = /** @type {HTMLInputElement|HTMLSelectElement} */ (ev.target);
    const extra = t.getAttribute?.('data-extra');
    if (extra === 'tipo') {
      estado.textos.extra.tipo = t.value || null;
      desenhar();
      agendar();
      return;
    }
    if (extra === 'dia') {
      estado.textos.extra.dia = t.value;
      conferir();
      agendar();
      return;
    }
    if (t.hasAttribute?.('data-nivel-hyrox')) {
      estado.nivelHyrox = t.value;
      try { localStorage.setItem(CHAVE_NIVEL, t.value); } catch { /* sem armazenamento: só não lembra */ }
      conferir();
      return;
    }
    const k = t.getAttribute?.('data-apelido-input');
    if (k) {
      const nome = t.value.trim();
      const ex = estado.catalogo?.exercicios.find((e) => e.nome === nome);
      const h = estado.catalogo?.hyrox.find((x) => x.nome === nome || x.substituta?.nome === nome);
      const id = ex?.id ?? (h ? (h.nome === nome ? `hyrox:${h.estacao}` : `hyrox:${h.estacao}:sub`) : null);
      if (id) confirmarNome(k, id);
      else ctx.status(`"${nome}" não está no catálogo. Escolha um nome da lista.`, 'erro');
    }
  });

  alvo.addEventListener('click', (/** @type {MouseEvent} */ ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('button');
    if (!b) return;
    const delta = b.getAttribute('data-quadro-semana');
    if (delta !== null) {
      abrirSemana(delta === '0' ? chaveSemana(hoje()) : outraSemana(estado.semanaId, Number(delta)));
      return;
    }
    if (b.hasAttribute('data-publicar-quadro')) { abrirPublicar(); return; }
    if (b.hasAttribute('data-tirar-do-ar')) { tirarDoAr(); return; }
    const k = b.getAttribute('data-apelido');
    if (k) { confirmarNome(k, b.getAttribute('data-id') || '-'); return; }
    const novo = b.getAttribute('data-cadastrar');
    if (novo) { cadastrar(novo, b.getAttribute('data-nome') || ''); return; }
    const dia = b.getAttribute('data-adaptar');
    if (dia) { adaptar(dia, (b.getAttribute('data-recursos') || '').split(',').filter(Boolean)); return; }
    const desfazer = b.getAttribute('data-desfazer-adaptacao');
    if (desfazer) {
      const { [desfazer]: _fora, ...resto } = estado.textos.adaptacoes;
      estado.textos.adaptacoes = resto;
      conferir();
      agendar();
      return;
    }
    const trocar = b.getAttribute('data-trocar');
    if (trocar) {
      // Volta a perguntar (só nesta tela, até o coach escolher): útil quando a leitura automática errou.
      estado.apelidos = { ...estado.apelidos, [trocar]: '?' };
      conferir();
      return;
    }
    const caminho = b.getAttribute('data-caminho');
    if (caminho) { estado.caminho = caminho; conferir(); return; }
    const ir = b.getAttribute('data-ir');
    if (ir) {
      const el = /** @type {HTMLTextAreaElement|null} */ (document.getElementById(`quadro-${ir.replace('.', '-')}`));
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const linha = Number(b.getAttribute('data-linha'));
      if (Number.isInteger(linha) && b.getAttribute('data-linha') !== '') {
        const linhas = el.value.split('\n');
        const ini = linhas.slice(0, linha).reduce((a, l) => a + l.length + 1, 0);
        el.focus();
        el.setSelectionRange(ini, ini + (linhas[linha]?.length ?? 0));
      } else el.focus();
    }
  });

  // Saiu da página com texto por gravar: grava antes (e o navegador avisa se não der tempo).
  window.addEventListener('beforeunload', (ev) => {
    if (!estado.sujo) return;
    gravar();
    ev.preventDefault();
  });

  // Exercício criado ou editado na aba Catálogo: o quadro relê e confere de novo.
  document.addEventListener('catalogo:mudou', () => {
    if (!estado.catalogo || estado.cadastrando) return;
    listarCatalogo().then((cat) => { estado.catalogo = cat; conferir(); }).catch(() => { /* fica o catálogo de antes */ });
  });

  document.addEventListener('semana:vista', (ev) => {
    const vista = /** @type {CustomEvent} */ (ev).detail;
    if (vista === 'quadro' && !estado.carregado) carregar();
    if (vista !== 'quadro') gravar();
  });
}
