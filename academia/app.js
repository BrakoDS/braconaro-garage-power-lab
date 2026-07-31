// @ts-check
/**
 * Academia — Inventário + Catálogo de Exercícios.
 * Mesmo login do Coach/Montador (Firebase). Dados via ./db.js (local + nuvem).
 */
import { cloudAtivo, sessaoAtual, login, criarConta, resetarSenha } from '../montador/ui/cloud.js';
import { bloquearSeNaoCoach } from '../montador/ui/coach-guard.js';
import { estaLiberado, tentarLiberar } from '../montador/ui/auth.js';
import { PADROES, PADRAO_LABEL } from '../montador/config/padroes.js';
import * as db from './db.js';

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let UID = null;

/* ============================================================
   Estado dos filtros
   ============================================================ */
let abaAtiva = 'inventario';
const F = {
  invBusca: '', invCat: 'todos',
  exBusca: '', exTag: 'todos', exMusc: 'todos', exEquip: 'todos', soDisp: true, soDesat: false,
  mobBusca: '', mobMusc: 'todos', mobDesat: false,
  tecBusca: '', tecDesat: false,
};
/** Técnicas com o acordeão aberto — sobrevive ao re-render da lista. @type {Set<string>} */
const tecAbertas = new Set();

/* ============================================================
   Abas
   ============================================================ */
const FAB_LABEL = { inventario: '+ Equipamento', exercicios: '+ Exercício', mobilidade: '+ Mobilidade', tecnicas: '+ Técnica' };
$$('.tab').forEach((t) => t.addEventListener('click', () => trocarAba(t.dataset.tab)));
function trocarAba(aba) {
  abaAtiva = aba;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === aba));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + aba));
  // O Negócio não tem uma ação única que caiba no FAB: cada seção tem o seu
  // "+ Adicionar" próprio. Um botão flutuante genérico só confundiria.
  $('#fab').hidden = aba === 'negocio';
  $('#fab').textContent = FAB_LABEL[aba] || '+ Adicionar';
}

/* ============================================================
   Render — Inventário
   ============================================================ */
function renderFiltrosCat() {
  const cats = [...new Set(db.listarInventario().map((e) => e.categoria))];
  const ordem = db.CATEGORIAS.filter((c) => cats.includes(c));
  const chip = (f, txt) => `<button class="chip${F.invCat === f ? ' on' : ''}" data-cat="${esc(f)}" type="button">${esc(txt)}</button>`;
  $('#filtros-cat').innerHTML = [chip('todos', 'Todos'), ...ordem.map((c) => chip(c, c))].join('');
}

function renderInventario() {
  const q = norm(F.invBusca);
  let itens = db.listarInventario().filter((e) => {
    if (F.invCat !== 'todos' && e.categoria !== F.invCat) return false;
    return !q || norm(e.nome).includes(q);
  });
  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $('#count-inv').textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
  if (!itens.length) {
    $('#lista-inv').innerHTML = `<div class="empty"><b>${db.listarInventario().length ? 'Nada encontrado' : 'Inventário vazio'}</b>${db.listarInventario().length ? 'Tente outro filtro ou busca.' : 'Toque em “+ Equipamento” para começar.'}</div>`;
    return;
  }
  $('#lista-inv').innerHTML = itens.map((e) => `
    <button class="row" data-id="${esc(e.id)}" type="button">
      <div>
        <div class="nome">${esc(e.nome)}</div>
        <div class="sub"><span class="badge cat">${esc(e.categoria)}</span>${e.area ? `<span>${esc(e.area)}</span>` : ''}</div>
      </div>
      <div class="qtd">${Number(e.quantidade) || 0}<small>${(Number(e.quantidade) === 1) ? 'unid' : 'unids'}</small></div>
    </button>`).join('');
}

/* ============================================================
   Render — Exercícios
   ============================================================ */
function renderFiltrosTags() {
  const chip = (f, txt) => `<button class="chip${F.exTag === f ? ' on' : ''}" data-tag="${esc(f)}" type="button">${esc(txt)}</button>`;
  // MOBILIDADE fica de fora: esses exercícios têm aba própria, filtrar por ela aqui não devolveria nada.
  const tags = db.TAGS.filter((t) => t !== db.TAG_MOBILIDADE);
  $('#filtros-tags').innerHTML = [chip('todos', 'Todos'), ...tags.map((t) => chip(t, t))].join('');
}
function renderFiltroEquip() {
  const inv = db.listarInventario().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const sel = F.exEquip;
  $('#filtro-equip').innerHTML = `<option value="todos"${sel === 'todos' ? ' selected' : ''}>Equipamento: todos</option>` +
    inv.map((e) => `<option value="${esc(e.id)}"${sel === e.id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('');
}
function renderFiltroMusc() {
  // só mostra músculos que aparecem em pelo menos um exercício
  const usados = new Set(db.listarExercicios().flatMap((x) => x.musculos || []));
  const lista = db.MUSCULOS.filter((m) => usados.has(m));
  const sel = F.exMusc;
  $('#filtro-musc').innerHTML = `<option value="todos"${sel === 'todos' ? ' selected' : ''}>Músculo: todos</option>` +
    lista.map((m) => `<option value="${esc(m)}"${sel === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
}

function nomesEquip(ids) {
  const inv = db.listarInventario();
  return (ids || []).map((id) => (inv.find((e) => e.id === id)?.nome) || ('?' + id));
}

function renderExercicios() {
  const q = norm(F.exBusca);
  // Sai daqui só o que serve EXCLUSIVAMENTE ao aquecimento; quem é as duas coisas
  // (prancha, agachamento livre, face pull) continua no catálogo de treino também.
  const base = db.listarExercicios().filter((x) => !db.soMobilidade(x));
  let itens = base.map((x) => ({ x, d: db.disponibilidade(x), ativo: x.ativo !== false }));
  itens = itens.filter(({ x, d, ativo }) => {
    if (F.exTag !== 'todos' && !(x.tags || []).includes(F.exTag)) return false;
    if (F.exMusc !== 'todos' && !(x.musculos || []).includes(F.exMusc)) return false;
    if (F.exEquip !== 'todos' && !(x.equipamentoIds || []).includes(F.exEquip)) return false;
    if (F.soDesat) return !ativo && (!q || norm(x.nome).includes(q));
    if (F.soDisp && !d.disponivel) return false;
    return !q || norm(x.nome).includes(q);
  });
  itens.sort((a, b) => Number(a.d.disponivel) - Number(b.d.disponivel) || a.x.nome.localeCompare(b.x.nome, 'pt'));
  $('#count-ex').textContent = `${itens.length} ${itens.length === 1 ? 'exercício' : 'exercícios'}`;
  if (!itens.length) {
    $('#lista-ex').innerHTML = `<div class="empty"><b>Nenhum exercício</b>${base.length ? 'Ajuste os filtros — talvez estejam ocultos por “Só disponíveis” ou “Desativados”.' : 'Toque em “+ Exercício” para começar.'}</div>`;
    return;
  }
  $('#lista-ex').innerHTML = itens.map(({ x, d, ativo }) => `
    <button class="row${d.disponivel ? '' : ' indisp'}${ativo ? '' : ' indisp'}" data-id="${esc(x.id)}" type="button">
      <div>
        <div class="nome">${esc(x.nome)}${ativo ? '' : ' <span class="badge" style="color:var(--bad);border-color:var(--bad)">Desativado</span>'}</div>
        <div class="sub">${(x.tags || []).map((t) => `<span class="tag ${esc(t)}">${esc(t)}</span>`).join('')}${(x.musculos || []).map((m) => `<span class="musc">${esc(m)}</span>`).join('')}</div>
        <div class="sub2">${esc(nomesEquip(x.equipamentoIds).join(', ') || 'sem equipamento')}</div>
        ${x.padrao ? `<div class="sub2" style="color:var(--mut-2)">Padrão: ${esc(PADRAO_LABEL[x.padrao] || x.padrao)}</div>` : '<div class="alerta">⚠ Sem padrão de movimento — não entra na montagem de treino</div>'}
        ${d.disponivel ? '' : `<div class="alerta">⚠ Indisponível — falta: ${esc(d.falta.join(', '))}</div>`}
        ${ativo ? '' : '<div class="alerta">⚠ Desativado — não entra na montagem de treino</div>'}
      </div>
      <div class="qtd" style="font-size:1.3rem;color:${d.disponivel && ativo ? 'var(--ok)' : 'var(--bad)'}">${d.disponivel && ativo ? '●' : '○'}</div>
    </button>`).join('');
}

/* ============================================================
   Render — Mobilidades e Aquecimento
   ------------------------------------------------------------
   Mesmo modelo de dados do catálogo de treino: o que separa os dois bancos é a
   tag MOBILIDADE. Aqui não faz sentido o filtro "só disponíveis" (quase tudo é
   peso corporal ou acessório solto), então a aba fica com busca + músculo.
   ============================================================ */
function renderFiltroMobMusc() {
  const usados = new Set(db.listarExercicios().filter(db.ehMobilidade).flatMap((x) => x.musculos || []));
  const lista = db.MUSCULOS.filter((m) => usados.has(m));
  const sel = F.mobMusc;
  $('#filtro-mob-musc').innerHTML = `<option value="todos"${sel === 'todos' ? ' selected' : ''}>Músculo: todos</option>` +
    lista.map((m) => `<option value="${esc(m)}"${sel === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
}

function renderMobilidade() {
  const q = norm(F.mobBusca);
  const base = db.listarExercicios().filter(db.ehMobilidade);
  const itens = base.map((x) => ({ x, d: db.disponibilidade(x), ativo: x.ativo !== false })).filter(({ x, ativo }) => {
    if (F.mobMusc !== 'todos' && !(x.musculos || []).includes(F.mobMusc)) return false;
    if (F.mobDesat && ativo) return false;
    return !q || norm(x.nome).includes(q);
  });
  itens.sort((a, b) => a.x.nome.localeCompare(b.x.nome, 'pt'));
  $('#count-mob').textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
  if (!itens.length) {
    $('#lista-mob').innerHTML = `<div class="empty"><b>Nenhuma mobilidade</b>${base.length ? 'Ajuste a busca ou o filtro de músculo.' : 'Toque em “+ Mobilidade” para começar.'}</div>`;
    return;
  }
  $('#lista-mob').innerHTML = itens.map(({ x, d, ativo }) => `
    <button class="row${d.disponivel && ativo ? '' : ' indisp'}" data-id="${esc(x.id)}" type="button">
      <div>
        <div class="nome">${esc(x.nome)}${ativo ? '' : ' <span class="badge" style="color:var(--bad);border-color:var(--bad)">Desativado</span>'}</div>
        <div class="sub">${(x.musculos || []).map((m) => `<span class="musc">${esc(m)}</span>`).join('')}</div>
        <div class="sub2">${esc(nomesEquip(x.equipamentoIds).join(', ') || 'sem equipamento')}</div>
        ${d.disponivel ? '' : `<div class="alerta">⚠ Indisponível — falta: ${esc(d.falta.join(', '))}</div>`}
        ${ativo ? '' : '<div class="alerta">⚠ Desativado — não entra no aquecimento</div>'}
      </div>
      <div class="qtd" style="font-size:1.3rem;color:${d.disponivel && ativo ? 'var(--ok)' : 'var(--bad)'}">${d.disponivel && ativo ? '●' : '○'}</div>
    </button>`).join('');
}

/* ============================================================
   Render — Técnicas de treino
   ============================================================ */
/** Texto multilinha → parágrafos. Cada linha vira um passo; linhas vazias somem. */
function paragrafos(txt) {
  const linhas = String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return linhas.map((l) => `<p>${esc(l)}</p>`).join('');
}

function renderTecnicas() {
  const q = norm(F.tecBusca);
  const base = db.listarTecnicas();
  const itens = base.filter((t) => {
    const ativa = t.ativo !== false;
    if (F.tecDesat && ativa) return false;
    if (!q) return true;
    return norm(t.nome).includes(q) || norm(t.resumo).includes(q);
  });
  itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $('#count-tec').textContent = `${itens.length} ${itens.length === 1 ? 'técnica' : 'técnicas'}`;
  if (!itens.length) {
    $('#lista-tec').innerHTML = `<div class="empty"><b>Nenhuma técnica</b>${base.length ? 'Ajuste a busca ou o filtro.' : 'Toque em “+ Técnica” para começar.'}</div>`;
    return;
  }
  $('#lista-tec').innerHTML = itens.map((t) => {
    const ativa = t.ativo !== false;
    const aberta = tecAbertas.has(t.id);
    return `
    <article class="tec${ativa ? '' : ' indisp'}${aberta ? ' aberta' : ''}" data-id="${esc(t.id)}">
      <button class="tec-hd" type="button" data-toggle aria-expanded="${aberta}">
        <div>
          <div class="nome">${esc(t.nome)}${ativa ? '' : ' <span class="badge" style="color:var(--bad);border-color:var(--bad)">Desativada</span>'}</div>
          ${t.resumo ? `<div class="sub">${esc(t.resumo)}</div>` : ''}
        </div>
        <svg class="tec-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      ${aberta ? `
      <div class="tec-bd">
        ${t.comoExecutar ? `<div class="tec-bloco"><h4>Como executar</h4>${paragrafos(t.comoExecutar)}</div>` : ''}
        ${t.objetivo ? `<div class="tec-bloco"><h4>Objetivo / dica</h4><p>${esc(t.objetivo)}</p></div>` : ''}
        <div class="tec-acoes"><button class="btn ghost btn-sm" type="button" data-editar>Editar</button></div>
      </div>` : ''}
    </article>`;
  }).join('');
}

/* ============================================================
   Render — Dossiê do negócio
   ============================================================ */
/** Valor em reais. Sem centavos quando o número é redondo — preço de plano é inteiro. */
const moeda = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
};

/** Quantos meses cada prazo cobre — usado para mostrar o equivalente mensal. */
const MESES_PRAZO = { Mensal: 1, Trimestral: 3, Semestral: 6 };

function secao(titulo, chave, rotuloBotao, corpo) {
  return `
    <section class="neg-sec">
      <div class="neg-sec-hd">
        <h3>${esc(titulo)}</h3>
        ${chave ? `<button class="btn ghost btn-sm" data-add="${esc(chave)}" type="button">+ ${esc(rotuloBotao)}</button>` : ''}
      </div>
      ${corpo}
    </section>`;
}

const vazio = (txt) => `<div class="neg-vazio">${esc(txt)}</div>`;

/** Linha clicável genérica de uma seção do dossiê. */
const editavel = (sec, id, html, extra = '') =>
  `<button class="neg-linha${extra}" data-sec="${esc(sec)}" data-id="${esc(id)}" type="button">${html}</button>`;

function renderNegocio() {
  const n = db.obterNegocio();
  const abertas = n.pendencias.filter((p) => !p.feito).length;
  $('#count-neg').textContent = abertas
    ? `${abertas} ${abertas === 1 ? 'pendência aberta' : 'pendências abertas'}`
    : 'sem pendências';

  /* --- Perfil + estilo --- */
  const p = n.perfil;
  // Campo nunca preenchido é `null` e aparece como "—". Mostrar "0" ali seria mentira:
  // o coach leria um dado ("tenho 0 alunos") onde só há ausência de dado.
  const num = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v));
  const perfil = `
    <button class="neg-perfil" data-perfil type="button">
      <div class="neg-stats">
        <div class="neg-stat"><b>${esc(p.cidade || '—')}</b><span>Cidade</span></div>
        <div class="neg-stat"><b>${num(p.alunosAtivos)}</b><span>Alunos ativos</span></div>
        <div class="neg-stat"><b>${num(p.capacidadeTurma)}</b><span>Por turma</span></div>
        <div class="neg-stat"><b>${p.tetoDesconto === null || p.tetoDesconto === undefined ? '—' : moeda(p.tetoDesconto)}</b><span>Teto de desconto</span></div>
      </div>
      ${p.estiloTexto ? `<p class="neg-estilo">${esc(p.estiloTexto)}</p>` : ''}
      ${n.modalidades.length ? `<div class="neg-mods">${n.modalidades.map((m) => `<span class="badge">${esc(m)}</span>`).join('')}</div>` : ''}
      <span class="neg-editar">Editar perfil</span>
    </button>`;

  /* --- Pilares --- */
  const pilares = n.pilares.length
    ? `<div class="neg-cards">${n.pilares.map((x) => editavel('pilares', x.id,
        `<b>${esc(x.titulo)}</b><span>${esc(x.texto)}</span>`, ' card')).join('')}</div>`
    : vazio('Nenhum pilar cadastrado.');

  /* --- Horários --- */
  const horarios = n.horarios.length
    ? `<div class="neg-linhas">${[...n.horarios]
        .sort((a, b) => (db.DIAS_SEMANA.indexOf(a.dia) - db.DIAS_SEMANA.indexOf(b.dia)) || String(a.hora).localeCompare(String(b.hora)))
        .map((h) => editavel('horarios', h.id, `
          <span class="neg-dia">${esc(h.dia || '—')}</span>
          <b class="neg-hora">${esc(h.hora || '--:--')}</b>
          <span class="neg-obs">${esc(h.obs || '')}</span>
          <span class="neg-cap">${Number(h.capacidade) || 0}<small>vagas</small></span>`, ' horario')).join('')}</div>`
    : vazio('A grade ainda não foi definida. Cadastre cada aula que você já roda — é o que falta para formalizar a reserva por sessão.');

  /* --- Planos, agrupados por prazo --- */
  const gruposPlano = db.PRAZOS.map((prazo) => {
    const itens = n.planos.filter((x) => x.prazo === prazo)
      .sort((a, b) => db.FREQUENCIAS.indexOf(a.frequencia) - db.FREQUENCIAS.indexOf(b.frequencia));
    if (!itens.length) return '';
    const meses = MESES_PRAZO[prazo] || 1;
    return `
      <div class="neg-grupo">
        <h4>${esc(prazo)}</h4>
        <div class="neg-linhas">${itens.map((x) => editavel('planos', x.id, `
          <span class="neg-freq">${esc(x.frequencia)}</span>
          <span class="neg-obs">${esc(x.inclui || '')}</span>
          <span class="neg-valor">${moeda(x.valor)}${meses > 1 ? `<small>${moeda(Math.round(Number(x.valor) / meses))}/mês</small>` : ''}</span>`, ' plano')).join('')}</div>
      </div>`;
  }).join('');
  // Plano com prazo fora da lista fixa (dado antigo ou digitado errado) não pode sumir da tela.
  const orfaos = n.planos.filter((x) => !db.PRAZOS.includes(x.prazo));
  const planos = (gruposPlano || orfaos.length)
    ? gruposPlano + (orfaos.length ? `<div class="neg-grupo"><h4>Outros</h4><div class="neg-linhas">${orfaos.map((x) => editavel('planos', x.id,
        `<span class="neg-freq">${esc(x.frequencia || '—')}</span><span class="neg-obs">${esc(x.prazo || 'sem prazo')}</span><span class="neg-valor">${moeda(x.valor)}</span>`, ' plano')).join('')}</div></div>` : '')
    : vazio('Nenhum plano cadastrado.');

  /* --- Promoções --- */
  const promocoes = n.promocoes.length
    ? `<div class="neg-cards">${n.promocoes.map((x) => editavel('promocoes', x.id, `
        <b>${esc(x.nome)}${x.ativo === false ? ' <span class="badge off">Pausada</span>' : ''}</b>
        <span class="neg-desc">${esc(x.valor)}</span>
        <span class="neg-obs">${esc(x.duracao)}</span>
        ${x.condicao ? `<span class="neg-cond">${esc(x.condicao)}</span>` : ''}`,
        ` card${x.ativo === false ? ' indisp' : ''}`)).join('')}</div>`
    : vazio('Nenhuma promoção cadastrada.');

  /* --- Mercado --- */
  const mercado = n.mercado.length
    ? `<div class="neg-linhas">${n.mercado.map((x) => editavel('mercado', x.id, `
        <span class="neg-conc"><b>${esc(x.concorrente)}</b><small>${esc(x.oferta)}</small></span>
        <span class="neg-preco">${esc(x.preco)}</span>`, ' mercado')).join('')}</div>`
    : vazio('Nenhuma referência de mercado cadastrada.');

  /* --- Vantagens / desvantagens --- */
  const listaTexto = (sec) => n[sec].length
    ? `<div class="neg-linhas">${n[sec].map((x) => editavel(sec, x.id, `<span>${esc(x.texto)}</span>`, ' texto')).join('')}</div>`
    : vazio('Nada cadastrado.');

  /* --- Pendências --- */
  const pendencias = n.pendencias.length
    ? `<div class="neg-linhas">${n.pendencias.map((x) => `
        <div class="neg-pend${x.feito ? ' feito' : ''}">
          <button class="neg-check" data-feito="${esc(x.id)}" type="button" role="checkbox" aria-checked="${!!x.feito}"
            aria-label="${x.feito ? 'Reabrir' : 'Concluir'} pendência">${x.feito ? '✓' : ''}</button>
          <button class="neg-linha texto" data-sec="pendencias" data-id="${esc(x.id)}" type="button"><span>${esc(x.texto)}</span></button>
        </div>`).join('')}</div>`
    : vazio('Nenhuma pendência — tudo em dia.');

  $('#neg-conteudo').innerHTML = [
    secao('Perfil e estilo', '', '', perfil),
    secao('O que compõe a experiência', 'pilares', 'Pilar', pilares),
    secao('Horários de funcionamento', 'horarios', 'Horário', horarios),
    secao('Planos e valores', 'planos', 'Plano', planos),
    secao('Promoções e descontos', 'promocoes', 'Promoção', promocoes),
    secao('Referências de mercado', 'mercado', 'Referência', mercado),
    secao('Vantagens', 'vantagens', 'Vantagem', listaTexto('vantagens')),
    secao('Desvantagens e riscos', 'desvantagens', 'Risco', listaTexto('desvantagens')),
    secao('Pendências', 'pendencias', 'Pendência', pendencias),
  ].join('');
}

/* ============================================================
   Render geral
   ============================================================ */
function renderTudo() {
  renderFiltrosCat(); renderInventario();
  renderFiltrosTags(); renderFiltroMusc(); renderFiltroEquip(); renderExercicios();
  renderFiltroMobMusc(); renderMobilidade();
  renderTecnicas();
  renderNegocio();
}

/* ============================================================
   Filtros — eventos
   ============================================================ */
$('#busca-inv').addEventListener('input', (e) => { F.invBusca = e.target.value; renderInventario(); });
$('#filtros-cat').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { F.invCat = c.dataset.cat; renderFiltrosCat(); renderInventario(); } });
$('#busca-ex').addEventListener('input', (e) => { F.exBusca = e.target.value; renderExercicios(); });
$('#filtros-tags').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { F.exTag = c.dataset.tag; renderFiltrosTags(); renderExercicios(); } });
$('#filtro-musc').addEventListener('change', (e) => { F.exMusc = e.target.value; renderExercicios(); });
$('#filtro-equip').addEventListener('change', (e) => { F.exEquip = e.target.value; renderExercicios(); });
$('#chip-disp').addEventListener('click', () => { F.soDisp = !F.soDisp; $('#chip-disp').classList.toggle('on', F.soDisp); renderExercicios(); });
$('#chip-desat').addEventListener('click', () => { F.soDesat = !F.soDesat; $('#chip-desat').classList.toggle('on', F.soDesat); renderExercicios(); });
$('#busca-mob').addEventListener('input', (e) => { F.mobBusca = e.target.value; renderMobilidade(); });
$('#filtro-mob-musc').addEventListener('change', (e) => { F.mobMusc = e.target.value; renderMobilidade(); });
$('#chip-mob-desat').addEventListener('click', () => { F.mobDesat = !F.mobDesat; $('#chip-mob-desat').classList.toggle('on', F.mobDesat); renderMobilidade(); });
$('#busca-tec').addEventListener('input', (e) => { F.tecBusca = e.target.value; renderTecnicas(); });
$('#chip-tec-desat').addEventListener('click', () => { F.tecDesat = !F.tecDesat; $('#chip-tec-desat').classList.toggle('on', F.tecDesat); renderTecnicas(); });

/* ============================================================
   Modais — abrir/fechar
   ============================================================ */
function abrirModal(id) { $('#' + id).classList.add('open'); }
function fecharModal(id) { $('#' + id).classList.remove('open'); }
$$('.modal-bg').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) fecharModal(m.id); });
});

$('#fab').addEventListener('click', () => {
  if (abaAtiva === 'inventario') abrirEquip();
  else if (abaAtiva === 'tecnicas') abrirTecnica();
  else abrirExerc(null, { mobilidade: abaAtiva === 'mobilidade' });
});

/* ---------- Modal Equipamento ---------- */
let equipEdit = null;
function preencherSelectCat(valor) {
  $('#sel-cat').innerHTML = db.CATEGORIAS.map((c) => `<option value="${esc(c)}"${c === valor ? ' selected' : ''}>${esc(c)}</option>`).join('');
}
function abrirEquip(item = null) {
  equipEdit = item;
  const f = $('#form-equip');
  $('#modal-equip-titulo').textContent = item ? 'Editar equipamento' : 'Novo equipamento';
  preencherSelectCat(item?.categoria || 'Peso livre');
  f.nome.value = item?.nome || '';
  f.quantidade.value = item ? (Number(item.quantidade) || 0) : 1;
  f.area.value = item?.area || '';
  f.obs.value = item?.obs || '';
  $('#btn-del-equip').hidden = !item;
  abrirModal('modal-equip');
  setTimeout(() => f.nome.focus(), 50);
}
$('#form-equip').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const dados = {
    nome: f.nome.value.trim(), categoria: f.categoria.value,
    quantidade: Math.max(0, parseInt(f.quantidade.value, 10) || 0),
    area: f.area.value.trim(), obs: f.obs.value.trim(),
  };
  if (!dados.nome) return;
  if (equipEdit) dados.id = equipEdit.id;
  db.salvarEquip(dados);
  fecharModal('modal-equip');
  renderTudo();
});
$('#btn-del-equip').addEventListener('click', () => {
  if (!equipEdit) return;
  const n = db.exerciciosComEquip(equipEdit.id);
  const aviso = n ? `\n\nAtenção: ${n} exercício(s) usam este equipamento e ficarão INDISPONÍVEIS até serem ajustados.` : '';
  if (!confirm(`Excluir "${equipEdit.nome}"?${aviso}`)) return;
  db.removerEquip(equipEdit.id);
  fecharModal('modal-equip');
  renderTudo();
});

/* ---------- Picker de equipamentos (chips + busca + lista agrupada) ----------
   O inventário cresceu para dezenas de itens e a lista aberta de checkboxes virou
   uma parede no formulário. A seleção agora vive num Set; `#pick-equip` continua no
   DOM como espelho oculto de checkboxes marcados, então o submit segue lendo
   `#pick-equip input:checked` — o contrato de gravação dos IDs não mudou.
   ------------------------------------------------------------------------- */
const equipSel = new Set();
let peBusca = '';

function renderPickEquip() {
  const inv = db.listarInventario();
  const nomeDe = (id) => inv.find((e) => e.id === id)?.nome || `?${id}`;

  // espelho oculto — é daqui que o submit lê os ids
  $('#pick-equip').innerHTML = [...equipSel]
    .map((id) => `<input type="checkbox" value="${esc(id)}" checked />`).join('');

  // chips do que está selecionado
  const sel = [...equipSel].sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt'));
  $('#pe-chips').innerHTML = sel.map((id) => `<span class="sel">${esc(nomeDe(id))}<button type="button" data-rm="${esc(id)}" aria-label="Remover ${esc(nomeDe(id))}">×</button></span>`).join('');
  $('#pe-count').textContent = equipSel.size
    ? `(${equipSel.size} selecionado${equipSel.size > 1 ? 's' : ''})`
    : '(puxa do inventário)';

  // lista agrupada por categoria, filtrada pela busca
  const lista = $('#pe-lista');
  if (!inv.length) {
    lista.innerHTML = '<div class="picker-vazio">Cadastre equipamentos no Inventário primeiro — um exercício precisa de pelo menos um.</div>';
    return;
  }
  const q = norm(peBusca);
  const achados = inv.filter((e) => !q || norm(e.nome).includes(q) || norm(e.categoria).includes(q));
  if (!achados.length) {
    lista.innerHTML = `<div class="picker-vazio">Nenhum equipamento com “${esc(peBusca)}”.</div>`;
    return;
  }
  const grupos = db.CATEGORIAS
    .map((cat) => [cat, achados.filter((e) => e.categoria === cat).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))])
    .filter(([, itens]) => itens.length);
  lista.innerHTML = grupos.map(([cat, itens]) => `
    <div class="grupo">${esc(cat)}</div>
    <div class="opcoes">${itens.map((e) => `
      <button class="opt${equipSel.has(e.id) ? ' on' : ''}" type="button" data-id="${esc(e.id)}"
        aria-pressed="${equipSel.has(e.id)}">${esc(e.nome)}<span class="qtd">×${Number(e.quantidade) || 0}</span></button>`).join('')}</div>`).join('');
}

$('#pe-busca').addEventListener('input', (e) => { peBusca = e.target.value; renderPickEquip(); });
$('#pe-lista').addEventListener('click', (e) => {
  const b = e.target.closest('.opt');
  if (!b) return;
  if (equipSel.has(b.dataset.id)) equipSel.delete(b.dataset.id); else equipSel.add(b.dataset.id);
  renderPickEquip();
});
$('#pe-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  equipSel.delete(b.dataset.rm);
  renderPickEquip();
});

/* ---------- Modal Exercício ---------- */
let exercEdit = null;
/**
 * @param {any} [item] exercício a editar (null = novo)
 * @param {{mobilidade?: boolean}} [opcoes] `mobilidade` já marca a tag MOBILIDADE
 *        num item novo — é como a aba de Mobilidade cria direto no banco dela.
 */
function abrirExerc(item = null, opcoes = {}) {
  exercEdit = item;
  const f = $('#form-exerc');
  $('#modal-exerc-titulo').textContent = item
    ? `Editar ${db.ehMobilidade(item) ? 'mobilidade' : 'exercício'}`
    : (opcoes.mobilidade ? 'Nova mobilidade / aquecimento' : 'Novo exercício');
  f.nome.value = item?.nome || '';
  f.obs.value = item?.obs || '';
  $('#erro-exerc').classList.remove('show');

  // Equipamentos (puxa do inventário) — regra: só dá pra escolher o que existe no inventário
  equipSel.clear();
  for (const id of item?.equipamentoIds || []) equipSel.add(id);
  peBusca = '';
  $('#pe-busca').value = '';
  renderPickEquip();

  // Padrão de movimento (o que o gerador do montador usa p/ equilibrar o full body) + nível
  $('#ex-padrao').innerHTML = ['<option value="">— selecione —</option>',
    ...PADROES.map((p) => `<option value="${esc(p)}">${esc(PADRAO_LABEL[p] || p)}</option>`)].join('');
  $('#ex-padrao').value = item?.padrao || '';
  $('#ex-nivel').value = item?.nivel || 'intermediario';
  // Composto vs. isolado: só o composto entra no dia de Força, e o Híbrido usa isso
  // para misturar os blocos. Default composto, como no catálogo.
  $('#ex-multi').value = item?.multiarticular === false ? '0' : '1';
  // Ocupa o aparelho inteiro: desmarcado por padrão — é a exceção, não a regra.
  f.ocupaTudo.checked = item?.ocupaTudo === true;
  f.ativo.checked = item ? item.ativo !== false : true;

  // Tags
  const selT = new Set(item?.tags || (opcoes.mobilidade ? [db.TAG_MOBILIDADE] : []));
  $('#pick-tags').className = 'pick';
  $('#pick-tags').innerHTML = db.TAGS.map((t) => `<input type="checkbox" id="tg_${esc(t)}" value="${esc(t)}"${selT.has(t) ? ' checked' : ''}/><label for="tg_${esc(t)}">${esc(t)}</label>`).join('');

  // Músculos
  const selM = new Set(item?.musculos || []);
  const muscId = (m) => 'mu_' + m.replace(/[^A-Za-z]/g, '');
  $('#pick-musc').className = 'pick';
  $('#pick-musc').innerHTML = db.MUSCULOS.map((m) => `<input type="checkbox" id="${muscId(m)}" value="${esc(m)}"${selM.has(m) ? ' checked' : ''}/><label for="${muscId(m)}">${esc(m)}</label>`).join('');

  $('#btn-del-exerc').hidden = !item;
  abrirModal('modal-exerc');
  setTimeout(() => f.nome.focus(), 50);
}
$('#form-exerc').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const nome = f.nome.value.trim();
  const equipamentoIds = $$('#pick-equip input:checked').map((i) => i.value);
  const tags = $$('#pick-tags input:checked').map((i) => i.value);
  const musculos = $$('#pick-musc input:checked').map((i) => i.value);
  const err = $('#erro-exerc');
  if (!nome) return;
  // Regra de negócio: exercício exige ao menos 1 equipamento do inventário
  if (!equipamentoIds.length) {
    err.textContent = db.listarInventario().length
      ? 'Selecione ao menos um equipamento do inventário para este exercício.'
      : 'Não há equipamentos no inventário. Cadastre um equipamento antes de criar exercícios.';
    err.classList.add('show');
    return;
  }
  const dados = {
    nome, equipamentoIds, tags, musculos,
    padrao: f.padrao.value, nivel: f.nivel.value || 'intermediario',
    multiarticular: f.multiarticular.value !== '0',
    ocupaTudo: f.ocupaTudo.checked,
    ativo: f.ativo.checked,
    obs: f.obs.value.trim(),
  };
  if (exercEdit) dados.id = exercEdit.id;
  db.salvarExerc(dados);
  fecharModal('modal-exerc');
  renderTudo(); // marcar/desmarcar MOBILIDADE move o item entre as abas
});
$('#btn-del-exerc').addEventListener('click', () => {
  if (!exercEdit) return;
  if (!confirm(`Excluir o exercício "${exercEdit.nome}"?`)) return;
  db.removerExerc(exercEdit.id);
  fecharModal('modal-exerc');
  renderTudo();
});

/* ---------- Modal Técnica ---------- */
let tecEdit = null;
function abrirTecnica(item = null) {
  tecEdit = item;
  const f = $('#form-tecnica');
  $('#modal-tecnica-titulo').textContent = item ? `Editar ${item.nome}` : 'Nova técnica';
  f.nome.value = item?.nome || '';
  f.resumo.value = item?.resumo || '';
  f.comoExecutar.value = item?.comoExecutar || '';
  f.objetivo.value = item?.objetivo || '';
  f.ativo.checked = item ? item.ativo !== false : true;
  $('#erro-tecnica').classList.remove('show');
  $('#btn-del-tecnica').hidden = !item;
  abrirModal('modal-tecnica');
  setTimeout(() => f.nome.focus(), 50);
}
$('#form-tecnica').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const nome = f.nome.value.trim();
  if (!nome) return;
  const dados = {
    nome,
    resumo: f.resumo.value.trim(),
    comoExecutar: f.comoExecutar.value.trim(),
    objetivo: f.objetivo.value.trim(),
    ativo: f.ativo.checked,
  };
  if (tecEdit) dados.id = tecEdit.id;
  const salva = db.salvarTecnica(dados);
  tecAbertas.add(salva.id); // recém-editada já abre expandida, p/ conferir o texto
  fecharModal('modal-tecnica');
  renderTecnicas();
});
$('#btn-del-tecnica').addEventListener('click', () => {
  if (!tecEdit) return;
  if (!confirm(`Excluir a técnica "${tecEdit.nome}"?`)) return;
  db.removerTecnica(tecEdit.id);
  tecAbertas.delete(tecEdit.id);
  fecharModal('modal-tecnica');
  renderTecnicas();
});

/* ---------- Modal Dossiê do negócio ----------
   Um formulário só para todas as seções: `CAMPOS_NEGOCIO` descreve os campos de cada
   uma e o modal se monta a partir daí. Seis formulários quase iguais renderiam o
   mesmo HTML seis vezes — a variação real entre eles é só a lista de campos. */
const CAMPOS_NEGOCIO = {
  perfil: [
    { n: 'cidade', l: 'Cidade' },
    { n: 'alunosAtivos', l: 'Alunos ativos', t: 'number' },
    { n: 'capacidadeTurma', l: 'Capacidade por turma', t: 'number' },
    { n: 'tetoDesconto', l: 'Teto de desconto (R$)', t: 'number', hint: 'Máximo que um aluno pode acumular por mês somando todas as promoções.' },
    { n: 'estiloTexto', l: 'Estilo de treino', t: 'textarea', full: true },
  ],
  pilares: [
    { n: 'titulo', l: 'Título', full: true, req: true },
    { n: 'texto', l: 'Descrição', t: 'textarea', full: true },
  ],
  horarios: [
    { n: 'dia', l: 'Dia da semana', t: 'select', op: () => db.DIAS_SEMANA, req: true },
    { n: 'hora', l: 'Horário', t: 'time', req: true },
    { n: 'capacidade', l: 'Vagas', t: 'number' },
    { n: 'obs', l: 'Observação', hint: 'Ex.: turma mista, foco em Hyrox.' },
  ],
  planos: [
    { n: 'frequencia', l: 'Frequência', t: 'select', op: () => db.FREQUENCIAS, req: true },
    { n: 'prazo', l: 'Prazo', t: 'select', op: () => db.PRAZOS, req: true },
    { n: 'valor', l: 'Valor total (R$)', t: 'number', req: true, hint: 'Valor cheio do prazo — o equivalente mensal é calculado na lista.' },
    { n: 'inclui', l: 'O que inclui', full: true },
  ],
  promocoes: [
    { n: 'nome', l: 'Nome da promoção', full: true, req: true },
    { n: 'valor', l: 'Desconto', hint: 'Ex.: −R$50' },
    { n: 'duracao', l: 'Duração', hint: 'Ex.: contínuo, 1 mês' },
    { n: 'condicao', l: 'Condição', t: 'textarea', full: true },
    { n: 'ativo', l: 'Promoção ativa', t: 'check', full: true, hint: 'Desmarque para pausar sem apagar.' },
  ],
  mercado: [
    { n: 'concorrente', l: 'Concorrente / referência', full: true, req: true },
    { n: 'preco', l: 'Preço praticado', full: true },
    { n: 'oferta', l: 'O que entrega', t: 'textarea', full: true },
  ],
  vantagens: [{ n: 'texto', l: 'Vantagem', t: 'textarea', full: true, req: true }],
  desvantagens: [{ n: 'texto', l: 'Risco ou desvantagem', t: 'textarea', full: true, req: true }],
  pendencias: [
    { n: 'texto', l: 'Pendência', t: 'textarea', full: true, req: true },
    { n: 'feito', l: 'Concluída', t: 'check', full: true },
  ],
};

/** Rótulo de cada seção no singular, com o artigo certo para o título "Novo/Nova …". */
const TITULO_NEGOCIO = {
  perfil: { novo: 'Perfil do negócio', nome: 'perfil' },
  pilares: { novo: 'Novo pilar', nome: 'pilar' },
  horarios: { novo: 'Novo horário', nome: 'horário' },
  planos: { novo: 'Novo plano', nome: 'plano' },
  promocoes: { novo: 'Nova promoção', nome: 'promoção' },
  mercado: { novo: 'Nova referência', nome: 'referência' },
  vantagens: { novo: 'Nova vantagem', nome: 'vantagem' },
  desvantagens: { novo: 'Novo risco', nome: 'risco' },
  pendencias: { novo: 'Nova pendência', nome: 'pendência' },
};

/** Seção aberta no modal — `'perfil'` grava no objeto de perfil, o resto numa lista. */
let negSec = null, negEdit = null;

function campoNegocio(c, valor) {
  const id = `neg-f-${c.n}`;
  const hint = c.hint ? `<span class="hint">${esc(c.hint)}</span>` : '';
  if (c.t === 'check') {
    return `<div class="field full"><label class="check-linha" for="${id}">
      <input type="checkbox" id="${id}" name="${c.n}"${valor ? ' checked' : ''} />
      <span>${esc(c.l)}${hint}</span></label></div>`;
  }
  const corpo = c.t === 'textarea'
    ? `<textarea id="${id}" name="${c.n}" rows="3">${esc(valor ?? '')}</textarea>`
    : c.t === 'select'
      ? `<select id="${id}" name="${c.n}">${c.op().map((o) => `<option value="${esc(o)}"${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : `<input id="${id}" name="${c.n}" type="${c.t || 'text'}"${c.t === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''} value="${esc(valor ?? '')}" />`;
  return `<div class="field${c.full ? ' full' : ''}"><label for="${id}">${esc(c.l)}</label>${corpo}${hint}</div>`;
}

function abrirNegocio(sec, item = null) {
  negSec = sec; negEdit = item;
  const campos = CAMPOS_NEGOCIO[sec];
  if (!campos) return;
  const base = sec === 'perfil' ? db.obterNegocio().perfil : (item || {});
  const rot = TITULO_NEGOCIO[sec];
  $('#modal-negocio-titulo').textContent = item ? `Editar ${rot.nome}` : rot.novo;
  $('#campos-negocio').innerHTML = campos.map((c) => campoNegocio(c, base[c.n])).join('');
  $('#erro-negocio').classList.remove('show');
  $('#btn-del-negocio').hidden = sec === 'perfil' || !item;
  abrirModal('modal-negocio');
  setTimeout(() => $('#campos-negocio').querySelector('input,select,textarea')?.focus(), 50);
}

$('#form-negocio').addEventListener('submit', (e) => {
  e.preventDefault();
  const campos = CAMPOS_NEGOCIO[negSec];
  const f = e.target;
  const dados = {};
  for (const c of campos) {
    const el = f.elements[c.n];
    if (!el) continue;
    if (c.t === 'check') dados[c.n] = el.checked;
    else if (c.t === 'number') dados[c.n] = Number(el.value) || 0;
    else dados[c.n] = el.value.trim();
    if (c.req && !dados[c.n] && c.t !== 'number') {
      $('#erro-negocio').textContent = `Preencha “${c.l}”.`;
      $('#erro-negocio').classList.add('show');
      el.focus();
      return;
    }
  }
  if (negSec === 'perfil') db.salvarPerfilNegocio(dados);
  else {
    if (negEdit) dados.id = negEdit.id;
    db.salvarItemNegocio(negSec, dados);
  }
  fecharModal('modal-negocio');
  renderNegocio();
});

$('#btn-del-negocio').addEventListener('click', () => {
  if (!negEdit || negSec === 'perfil') return;
  // Horário e plano não têm campo de nome — o que identifica a linha é a combinação
  // que o coach vê na tela. Sem isto a confirmação viraria "Excluir este horário?",
  // que não diz QUAL horário está prestes a sumir.
  const rotulo = negSec === 'horarios' ? `${negEdit.dia} ${negEdit.hora}`
    : negSec === 'planos' ? `${negEdit.prazo} ${negEdit.frequencia}`
    : negEdit.nome || negEdit.titulo || negEdit.concorrente || negEdit.texto || `este ${TITULO_NEGOCIO[negSec].nome}`;
  if (!confirm(`Excluir “${String(rotulo).slice(0, 80)}”?`)) return;
  db.removerItemNegocio(negSec, negEdit.id);
  fecharModal('modal-negocio');
  renderNegocio();
});

$('#neg-conteudo').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { abrirNegocio(add.dataset.add); return; }
  if (e.target.closest('[data-perfil]')) { abrirNegocio('perfil'); return; }
  // Marcar/desmarcar pendência é ação direta: um modal para um booleano seria atrito.
  const chk = e.target.closest('[data-feito]');
  if (chk) {
    const id = chk.dataset.feito;
    const item = db.obterNegocio().pendencias.find((x) => x.id === id);
    if (item) { db.salvarItemNegocio('pendencias', { id, feito: !item.feito }); renderNegocio(); }
    return;
  }
  const linha = e.target.closest('[data-sec]');
  if (linha) {
    const { sec, id } = linha.dataset;
    const item = db.obterNegocio()[sec]?.find((x) => x.id === id);
    if (item) abrirNegocio(sec, item);
  }
});

/* Clique nas listas → editar */
$('#lista-inv').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { const it = db.obterEquip(r.dataset.id); if (it) abrirEquip(it); } });
$('#lista-ex').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { const it = db.obterExerc(r.dataset.id); if (it) abrirExerc(it); } });
$('#lista-mob').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { const it = db.obterExerc(r.dataset.id); if (it) abrirExerc(it); } });
// Técnica: o card é leitura (acordeão). Editar é um botão dentro do expandido — ler
// a explicação não deve abrir um modal de edição, ao contrário das outras listas.

$('#lista-tec').addEventListener('click', (e) => {
  const card = e.target.closest('.tec');
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.closest('[data-editar]')) { const t = db.obterTecnica(id); if (t) abrirTecnica(t); return; }
  if (!e.target.closest('[data-toggle]')) return;
  if (tecAbertas.has(id)) tecAbertas.delete(id); else tecAbertas.add(id);
  renderTecnicas();
});

/* ============================================================
   GATE de acesso (mesmo login do Coach/Montador)
   ============================================================ */
const gate = $('#gate'), gform = $('#gate-form');
const gEmail = $('#gate-email'), gSenha = $('#gate-senha'), gErro = $('#gate-erro');
const gToggle = $('#gate-toggle'), gReset = $('#gate-reset');
const gBtn = gform.querySelector('button[type=submit]');

async function entrar(user) {
  if (user && cloudAtivo() && await bloquearSeNaoCoach(user)) return; // barra contas de aluno
  UID = user?.uid || null;
  gate.style.display = 'none';
  $('#app').removeAttribute('hidden');
  trocarAba('inventario');
  renderTudo();
  if (user && user.uid) db.iniciarSync(user.uid, renderTudo);
}
function erroMsg(m) { gErro.style.color = ''; gErro.textContent = m; gErro.style.display = 'block'; }
function okMsg(m) { gErro.style.color = 'var(--ok)'; gErro.textContent = m; gErro.style.display = 'block'; }
function msgAuth(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos. Sem conta? Use “Primeiro acesso? Criar conta”.',
    'auth/user-not-found': 'Conta não encontrada. Use “Primeiro acesso? Criar conta”.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Essa conta já existe — faça login normalmente.',
    'auth/weak-password': 'Senha muito curta (mínimo 6 caracteres).',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
    'permission-denied': 'Login OK, mas o banco está bloqueado (regras do Firestore).',
  })[c] || `Erro ao entrar (${c || 'desconhecido'}).`;
}

if (cloudAtivo()) {
  gate.style.display = 'flex';
  let criando = false;
  gToggle.addEventListener('click', (e) => { e.preventDefault(); criando = !criando; gBtn.textContent = criando ? 'Criar conta e entrar' : 'Entrar'; gToggle.textContent = criando ? 'Já tenho conta — entrar' : 'Primeiro acesso? Criar conta'; gErro.style.display = 'none'; });
  gReset.addEventListener('click', async (e) => { e.preventDefault(); const m = gEmail.value.trim(); if (!m) { erroMsg('Digite seu e-mail acima primeiro.'); gEmail.focus(); return; } try { await resetarSenha(m); okMsg('Enviamos um link de redefinição para seu e-mail.'); } catch (err) { erroMsg(msgAuth(err)); } });
  sessaoAtual().then((u) => { if (u) entrar(u); else gEmail.focus(); });
  gform.addEventListener('submit', async (e) => {
    e.preventDefault(); gErro.style.display = 'none';
    try {
      const user = criando ? await criarConta(gEmail.value.trim(), gSenha.value) : await login(gEmail.value.trim(), gSenha.value);
      entrar(user);
    } catch (err) { erroMsg(msgAuth(err)); console.error('Auth:', err?.code, err?.message); }
  });
} else if (estaLiberado()) {
  entrar();
} else {
  gate.style.display = 'flex';
  gEmail?.remove(); gToggle?.remove(); gReset?.remove(); gSenha.focus();
  gform.addEventListener('submit', async (e) => { e.preventDefault(); if (await tentarLiberar(gSenha.value)) entrar(); else { erroMsg('Senha incorreta.'); gSenha.value = ''; gSenha.focus(); } });
}
