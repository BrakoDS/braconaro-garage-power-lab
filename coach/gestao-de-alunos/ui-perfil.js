// @ts-check
/**
 * Tela — Perfil do aluno: o cabeçalho e a barra de abas.
 *
 * Segunda tela tirada do `app.js` no fatiamento. Este módulo ABRE o perfil
 * ('abrir-perfil' → o aluno no estado, o cabeçalho, 'perfil-aberto', a aba
 * Dados e a tela), desenha o topo da ficha e a barra de abas, e troca o painel
 * visível. O CONTEÚDO de cada aba é do módulo dela (ui-tab-*.js).
 *
 * O cabeçalho (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md):
 *  - foto (troca ao tocar), nome, número e os selos — Status, Nível e Alerta
 *    médico (vermelho: lesão moderada/severa; âmbar: lesão leve ou PAR-Q com
 *    "Sim"), mais o selo de reavaliação de sempre;
 *  - a barra de ações: WhatsApp (o telefone SALVO da ficha), PDF e o menu ⋯
 *    (Gerar acesso ao Portal, Trocar foto, Excluir aluno — e o PDF, no celular
 *    com o cabeçalho compacto, quando o botão dele sai da barra). Excluir e acesso
 *    saíram da aba Dados: quem trata é o ui-acoes-aluno.js, pelo barramento.
 *
 * Fica preso no topo junto com as abas (`#perfil-topo`) e ENCOLHE ao rolar
 * (`.compacto`): no celular, foto pequena, nome numa linha e ações só com
 * ícone. Na ficha, a barra global da Gestão deixa de ficar presa — o topo da
 * ficha toma o lugar dela, em vez de as duas comerem a tela juntas.
 *
 * Cada clique vira um evento ('voltar-lista', 'exportar-ficha', 'trocar-foto',
 * 'gerar-acesso', 'excluir-aluno', 'abrir-aba'). O PDF chega por parâmetro
 * (`exportar`), para este módulo não carregar o gerador de PDF. E escuta
 * 'alunos-mudaram' para o cabeçalho nunca ficar velho — salvar uma avaliação
 * muda o anel da foto, salvar a matriz muda o nível e o alerta.
 *
 * As abas vêm de `ABAS`: uma aba nova é uma linha a mais aqui e um painel
 * `#tab-<id>` no index.html. A barra rola de lado no celular e segue o padrão
 * de tablist (setas do teclado trocam de aba).
 */
import { esc, iniciais, hoje, waMsg } from './util/formato.js?v=23';
import { reavaliacaoNaLista, seloReavaliacao } from './util/reavaliacao.js?v=23';
import { estado, on, emit, EVENTOS, sairComCuidado } from './estado.js?v=23';
import { seloStatus, seloNivel, alertaMedico } from './perfil-derivados.js?v=23';
import { ligarMenu, alternarMenu } from './ui-menu-acoes.js?v=23';

/** As abas da ficha, na ordem da barra. `id` casa com o painel `#tab-<id>`. */
export const ABAS = Object.freeze([
  { id: 'geral', rotulo: 'Geral' },
  { id: 'saude', rotulo: 'Saúde' },
  { id: 'treino', rotulo: 'Treino' },
  { id: 'avaliacoes', rotulo: 'Avaliações' },
  { id: 'historico', rotulo: 'Histórico' },
]);

/** Rolagem (px) a partir da qual o cabeçalho encolhe, e abaixo da qual volta. A folga entre os dois evita o pisca. */
export const COMPACTA_EM = 96;
export const EXPANDE_EM = 24;

/* ---------- ícones (traço, herdam a cor do texto) ---------- */
const svg = (d, t = 18) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONE = {
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 15),
  voltar: svg('<path d="m15 18-6-6 6-6"/>', 20),
  whatsapp: svg('<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6z"/><path d="M9 9.2c.3 2.4 2.2 4.6 4.8 5.3l1.1-1.1 1.6.8-.4 1.6c-3.8.2-7.6-3.4-7.6-7.3l1.6-.4.8 1.6z"/>'),
  pdf: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6m-3-3 3 3 3-3"/>'),
  mais: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  alerta: svg('<path d="M10.3 4 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>', 14),
  chave: svg('<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M14.5 8.5 17 11"/>', 16),
  lixo: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 16),
};

/* ============================================================
   HTML (puro)
   ============================================================ */

/**
 * Link do WhatsApp para o telefone da ficha — só a conversa, sem texto — ou
 * '' sem um telefone que dê para discar (menos de 10 dígitos).
 * @param {string} [tel]
 */
export function linkWhatsAppDoAluno(tel) {
  return String(tel || '').replace(/\D/g, '').length >= 10 ? waMsg(tel) : '';
}

/**
 * A aba que o selo de alerta abre: a Saúde, onde moram as lesões e o PAR-Q
 * (os dois motivos de alerta).
 * @param {any} [_a]
 */
export function abaDoAlerta(_a) {
  return 'saude';
}

/** Os selos ao lado do nome. @param {any} a @param {{ tipo: string }} reav */
function htmlSelos(a, reav) {
  const st = seloStatus(a);
  const nv = seloNivel(a);
  const al = alertaMedico(a);
  const motivos = al.motivos.join(' · ');
  return [
    `<span class="status ${esc(st.valor)}">${esc(st.rotulo)}</span>`,
    nv ? `<span class="pc-selo nivel">${esc(nv.rotulo)}</span>` : '',
    al.nivel
      ? `<button class="pc-selo alerta ${al.nivel}" data-acao="alerta" data-aba="${abaDoAlerta(a)}" type="button" `
        + `title="${esc(motivos)}" aria-label="Alerta médico: ${esc(motivos)}">${ICONE.alerta}<span>Alerta médico</span></button>`
      : '',
    seloReavaliacao(reav),
  ].filter(Boolean).join('');
}

/** A barra de ações: WhatsApp, PDF e o menu ⋯. @param {any} a */
function htmlAcoes(a) {
  const nome = a.nome || 'aluno';
  const wa = linkWhatsAppDoAluno(a.telefone);
  const botaoWa = wa
    ? `<a class="pc-btn wa" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Abrir o WhatsApp de ${esc(nome)}">${ICONE.whatsapp}<span>WhatsApp</span></a>`
    : `<button class="pc-btn wa" type="button" disabled title="Sem telefone na ficha" aria-label="WhatsApp: sem telefone na ficha">${ICONE.whatsapp}<span>WhatsApp</span></button>`;
  return `
    <div class="pc-acoes" role="group" aria-label="Ações da ficha">
      ${botaoWa}
      <button class="pc-btn" data-acao="pdf" type="button" aria-label="Exportar a ficha em PDF">${ICONE.pdf}<span>PDF</span></button>
      <div class="pc-menu">
        <button class="pc-btn pc-mais" data-menu-botao type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="pc-menu-lista" aria-label="Mais ações">${ICONE.mais}</button>
        <div class="pc-menu-lista" id="pc-menu-lista" role="menu" aria-label="Mais ações" hidden>
          <button role="menuitem" class="so-compacto" data-acao="pdf" type="button">${ICONE.pdf}Exportar PDF</button>
          <button role="menuitem" data-acao="acesso" type="button">${ICONE.chave}Gerar acesso ao Portal</button>
          <button role="menuitem" data-acao="foto" type="button">${ICONE.camera}Trocar foto</button>
          <div class="pc-menu-sep" role="separator"></div>
          <button role="menuitem" class="perigo" data-acao="excluir" type="button">${ICONE.lixo}Excluir aluno</button>
        </div>
      </div>
    </div>`;
}

/**
 * O cabeçalho da ficha.
 * @param {any} a @param {string} [hojeIso]
 */
export function htmlCabecalho(a, hojeIso = hoje()) {
  const st = seloStatus(a).valor;
  const reav = reavaliacaoNaLista(a, hojeIso);
  const nome = a.nome || 'Sem nome';
  return `
    <button class="pc-voltar" data-acao="voltar" type="button" aria-label="Voltar para a lista de alunos">${ICONE.voltar}<span>Alunos</span></button>
    <div class="pc-id st-${esc(st)} reav-${reav.tipo}">
      <button id="p-avatar" class="pc-foto" data-acao="foto" type="button" aria-label="Trocar a foto de ${esc(nome)}">
        ${a.fotoUrl ? `<img src="${esc(a.fotoUrl)}" alt="" />` : `<span class="pc-ini">${esc(iniciais(a.nome))}</span>`}
        <span class="pc-cam">${ICONE.camera}</span>
      </button>
      <div class="pc-texto">
        <h1 class="pc-nome">${esc(nome)}</h1>
        <div class="pc-meta">
          <span class="pc-num">#${esc(a.id)}</span>
          ${htmlSelos(a, reav)}
        </div>
        ${a.objetivo ? `<div class="pc-obj">${esc(a.objetivo)}</div>` : ''}
      </div>
    </div>
    ${htmlAcoes(a)}`;
}

/**
 * A barra de abas, com a aba `ativa` marcada.
 * @param {string} ativa @param {readonly {id: string, rotulo: string}[]} [abas]
 */
export function htmlAbas(ativa, abas = ABAS) {
  return abas.map((t) => {
    const on = t.id === ativa;
    return `<button class="perfil-aba${on ? ' on' : ''}" role="tab" id="aba-${esc(t.id)}" aria-controls="tab-${esc(t.id)}" `
      + `aria-selected="${on}" tabindex="${on ? 0 : -1}" data-tab="${esc(t.id)}" type="button">${esc(t.rotulo)}</button>`;
  }).join('');
}

/**
 * Compacto ou não, pela rolagem — com folga: encolhe passando de `COMPACTA_EM`
 * e só volta abaixo de `EXPANDE_EM`. Um limite só faria o cabeçalho piscar na
 * fronteira (encolher muda o tamanho da página, e a rolagem com ele).
 * @param {boolean} compacto o estado atual @param {number} y a rolagem
 */
export function proximoCompacto(compacto, y) {
  return compacto ? y >= EXPANDE_EM : y > COMPACTA_EM;
}

/* ============================================================
   DOM
   ============================================================ */

/** @type {{ obter: (id: string) => any, exportar?: (a: any) => any } | null} */
let deps = null;
const $ = (/** @type {string} */ s) => /** @type {HTMLElement|null} */ (document.querySelector(s));

/** Desenha o cabeçalho do aluno. @param {any} a */
export function renderCabecalho(a) {
  const el = $('#perfil-cab');
  if (el && a) el.innerHTML = htmlCabecalho(a);
}

/**
 * Marca a aba aberta na barra e a traz para a vista — no celular a barra rola,
 * e a aba aberta não pode ficar escondida.
 * @param {string} nome
 */
export function marcarAba(nome) {
  for (const b of document.querySelectorAll('.perfil-aba')) {
    const on = /** @type {HTMLElement} */ (b).dataset.tab === nome;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.setAttribute('tabindex', on ? '0' : '-1');
    if (on) /** @type {HTMLElement} */ (b).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
}

/* ---------- o topo que encolhe ---------- */

let compacto = false;
let naFicha = false;

/**
 * Liga ou desliga o modo compacto. Ao encolher, a altura que o topo perdeu
 * vira folga no fim da página (`--pc-folga`): sem ela, numa ficha curta a
 * página encolheria junto, a rolagem voltaria para cima do limite e o
 * cabeçalho cresceria de novo — o pisca-pisca que a folga do limite sozinha
 * não segura.
 * @param {boolean} sim
 */
function definirCompacto(sim) {
  const topo = $('#perfil-topo');
  if (!topo || compacto === sim) return;
  const antes = topo.offsetHeight;
  topo.classList.toggle('compacto', sim);
  compacto = sim;
  const perdeu = sim ? Math.max(0, antes - topo.offsetHeight) : 0;
  document.documentElement?.style?.setProperty('--pc-folga', `${perdeu}px`);
}

/** Na ficha: a barra global solta e o topo da ficha passa a mandar. @param {boolean} sim */
function marcarNaFicha(sim) {
  naFicha = sim;
  document.documentElement?.classList?.toggle('na-ficha', sim);
  if (!sim) definirCompacto(false);
}

/**
 * Liga o perfil à página. Chamar uma vez, antes do resto do app.
 * @param {{ obter: (id: string) => any, exportar?: (a: any) => any }} d
 *   obter: a ficha pelo id (db.obter); exportar: gera o PDF da ficha
 */
export function iniciarPerfil(d) {
  deps = d;

  // Abrir o perfil: a ficha vai para o estado, o cabeçalho é desenhado, as abas
  // se preparam para o aluno novo ('perfil-aberto'), a aba Geral abre e a tela
  // aparece. Vem do clique num card da lista ou do cadastro de aluno novo.
  on(EVENTOS.ABRIR_PERFIL, (id) => {
    const a = deps?.obter(id);
    if (!a) return;
    estado.alunoAtual = a;
    renderCabecalho(a);
    emit(EVENTOS.PERFIL_ABERTO, a.id);
    emit(EVENTOS.ABRIR_ABA, 'geral');
    emit(EVENTOS.ABRIR_TELA, 'perfil');
  });
  on(EVENTOS.EXPORTAR_FICHA, () => { if (estado.alunoAtual) deps?.exportar?.(estado.alunoAtual); });
  const abas = $('#perfil-abas');
  if (abas) abas.innerHTML = htmlAbas('geral');

  const cab = $('#perfil-cab');
  cab?.addEventListener('click', (e) => {
    const alvo = /** @type {HTMLElement} */ (e.target).closest?.('[data-acao]');
    if (!(alvo instanceof HTMLElement) || alvo.getAttribute('role') === 'menuitem') return; // item do menu: ligarMenu trata
    const acao = alvo.dataset.acao;
    // Sair da ficha passa pela guarda: com alterações não salvas, ela pergunta antes.
    if (acao === 'voltar') sairComCuidado(() => emit(EVENTOS.VOLTAR_LISTA));
    else if (acao === 'pdf') emit(EVENTOS.EXPORTAR_FICHA);
    else if (acao === 'foto') emit(EVENTOS.TROCAR_FOTO);
    else if (acao === 'alerta' && alvo.dataset.aba) emit(EVENTOS.ABRIR_ABA, alvo.dataset.aba);
  });
  // (O DOM de mentira dos testes não tem HTMLElement: lá o menu não é ligado.)
  if (cab && typeof HTMLElement !== 'undefined') {
    ligarMenu(cab, (acao) => {
      if (acao === 'acesso') emit(EVENTOS.GERAR_ACESSO, estado.alunoAtual?.id);
      else if (acao === 'pdf') emit(EVENTOS.EXPORTAR_FICHA);
      else if (acao === 'foto') emit(EVENTOS.TROCAR_FOTO);
      else if (acao === 'excluir') emit(EVENTOS.EXCLUIR_ALUNO, estado.alunoAtual?.id);
    });
  }

  abas?.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.perfil-aba');
    if (b instanceof HTMLElement && b.dataset.tab) emit(EVENTOS.ABRIR_ABA, b.dataset.tab);
  });
  // Setas, Home e End andam pelas abas (padrão WAI-ARIA de tablist).
  abas?.addEventListener('keydown', (e) => {
    const lista = /** @type {HTMLElement[]} */ ([...abas.querySelectorAll('.perfil-aba')]);
    const i = lista.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0) return;
    const prox = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: lista.length - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    const alvo = lista[(prox + lista.length) % lista.length];
    alvo.focus();
    if (alvo.dataset.tab) emit(EVENTOS.ABRIR_ABA, alvo.dataset.tab);
  });

  // A troca de aba: marca a barra e mostra o painel. O CONTEÚDO de cada painel
  // é do módulo da aba (ui-tab-*.js), que ouve o mesmo 'abrir-aba'. Este
  // ouvinte é registrado antes dos deles (iniciarPerfil vem primeiro no
  // main.js), então a aba já está visível quando o módulo desenha.
  on(EVENTOS.ABRIR_ABA, (nome) => {
    marcarAba(nome);
    for (const p of document.querySelectorAll('.tab-panel')) p.classList.toggle('active', p.id === 'tab-' + nome);
  });

  // Entrar na ficha (ou sair dela) muda quem fica preso no topo. O roteador já
  // rolou a página para o alto, então o cabeçalho abre sempre grande.
  on(EVENTOS.ABRIR_TELA, (nome) => {
    marcarNaFicha(nome === 'perfil');
    definirCompacto(false);
  });
  let pedido = 0;
  window.addEventListener?.('scroll', () => {
    if (!naFicha || pedido) return;
    pedido = requestAnimationFrame(() => {
      pedido = 0;
      definirCompacto(proximoCompacto(compacto, window.scrollY));
    });
  }, { passive: true });

  on(EVENTOS.ALUNOS_MUDARAM, () => {
    if (!deps || !estado.alunoAtual || !$('#tela-perfil')?.classList.contains('active')) return;
    const a = deps.obter(estado.alunoAtual.id);
    if (!a) return;
    // Redesenhar troca o menu por um fechado: se estava aberto, reabre.
    const menuEstavaAberto = cab?.querySelector?.('[data-menu-botao]')?.getAttribute('aria-expanded') === 'true';
    renderCabecalho(a);
    if (menuEstavaAberto && cab) alternarMenu(cab, true);
  });
}
