// @ts-check
/**
 * SEMANA DO BOX — aba Quadro. O coach escreve a semana nos 3 quadros e a tela
 * confere enquanto ele escreve (`core/quadro.js`). Grava sozinho, um pouco
 * depois da última tecla, em `coaches/{uid}/quadros/{AAAA-Www}`.
 *
 * Carrega na primeira vez que a aba aparece: o catálogo (pelo servidor, com os
 * ajustes do coach), o inventário, os nomes já confirmados e o quadro da semana
 * passada (para o aviso de repetição).
 */
import { chaveSemana } from '../../montador-hibrido/core/periodos.js';
import { conferirSemana, QUADROS } from '../core/quadro.js';
import { segundaDaChave } from '../core/vista.js';
import { lerApelidos, lerInventario, lerQuadro, listarCatalogo, salvarApelidos, salvarQuadro } from '../cloud/semana.js';
import { renderConferencia, renderLeitura, renderQuadroBase } from './render-quadro.js';

const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ESPERA_GRAVAR_MS = 1500;

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

/** @returns {{quadros: Record<string, {h: string, metabolico: string}>, extra: {tipo: string|null, dia: string, texto: string}}} */
function textosVazios() {
  return {
    quadros: Object.fromEntries(QUADROS.map((q) => [q.id, { h: '', metabolico: '' }])),
    extra: { tipo: null, dia: 'sabado', texto: '' },
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
  return t;
}

/** @param {{uid: () => string, status: (msg: string, tipo?: 'ok'|'erro'|'') => void}} ctx */
export function montar(ctx) {
  const alvo = $('#quadro-corpo');
  if (!alvo) return;

  const estado = {
    carregado: false,
    semanaId: chaveSemana(hoje()),
    /** @type {{exercicios: any[], hyrox: any[]} | null} */
    catalogo: null,
    inventario: /** @type {any} */ (null),
    /** @type {Record<string, string>} */
    apelidos: {},
    textos: textosVazios(),
    anterior: /** @type {any} */ (null),
    /** @type {ReturnType<typeof conferirSemana> | null} */
    conf: null,
    caminho: 'aulas',
    /** @type {ReturnType<typeof setTimeout> | null} */
    timer: null,
    sujo: false,
  };

  const salvo = (/** @type {string} */ msg, cls = '') => { const el = $('#quadro-salvo'); if (el) { el.textContent = msg; el.className = `qs-salvo ${cls}`; } };

  function conferir() {
    if (!estado.catalogo) return;
    estado.conf = conferirSemana({
      quadros: estado.textos.quadros, extra: estado.textos.extra, catalogo: estado.catalogo,
      apelidos: estado.apelidos, inventario: estado.inventario, anterior: estado.anterior,
    });
    for (const onde of Object.keys(estado.conf.colunas)) {
      const el = document.getElementById(`leitura-${onde.replace('.', '-')}`);
      if (el) el.innerHTML = renderLeitura(onde, estado.conf);
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
    const k = b.getAttribute('data-apelido');
    if (k) { confirmarNome(k, b.getAttribute('data-id') || '-'); return; }
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

  document.addEventListener('semana:vista', (ev) => {
    const vista = /** @type {CustomEvent} */ (ev).detail;
    if (vista === 'quadro' && !estado.carregado) carregar();
    if (vista !== 'quadro') gravar();
  });
}
