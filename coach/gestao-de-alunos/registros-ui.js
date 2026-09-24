// @ts-check
/**
 * Tela Registros — a parte que não precisa de DOM nem de Firebase.
 *
 * Três fontes viram uma lista só:
 *  - os eventos gravados em `gestao/{uid}/eventos` (ver eventos.js);
 *  - os que ainda estão na fila do navegador;
 *  - o HISTÓRICO reconstruído das fichas, para o que aconteceu antes de o log
 *    existir. Esse é calculado na hora e nunca gravado: sem hora e sem origem
 *    na maioria dos casos, gravá-lo só daria cara de registro a um palpite.
 *
 * Testado em registros-ui.test.js.
 */
import { cortar, resumoFeedback } from './eventos.js';

/** Ícone e nome de cada tipo, e o filtro em que ele aparece. */
export const TIPOS = {
  'presenca': { icone: '✅', categoria: 'presenca' },
  'presenca-removida': { icone: '↩️', categoria: 'presenca' },
  'atestado': { icone: '🩺', categoria: 'presenca' },
  'troca-aula': { icone: '🔁', categoria: 'presenca' },
  'reposicao': { icone: '📅', categoria: 'presenca' },
  'foto-perfil': { icone: '📷', categoria: 'foto' },
  'feedback': { icone: '💬', categoria: 'feedback' },
  'ficha-editada': { icone: '✏️', categoria: 'ficha' },
  'avaliacao': { icone: '📏', categoria: 'ficha' },
  'aluno-criado': { icone: '🆕', categoria: 'ficha' },
};

export const CATEGORIAS = [
  ['todos', 'Tudo'], ['presenca', 'Presença'], ['foto', 'Foto'], ['feedback', 'Feedback'], ['ficha', 'Ficha'],
];

export const ORIGEM_ROTULO = { app: 'App', portal: 'Portal do aluno', gestao: 'Gestão', aluno: 'Aluno' };

/** Os filtros de origem: 'aluno' (caixa antiga) só aparece em "Todas". */
export const FILTROS_ORIGEM = [['todas', 'Todas'], ['app', 'App'], ['portal', 'Portal do aluno'], ['gestao', 'Gestão']];

/** O nome legível dos campos da ficha, para "Ficha editada · Telefone, Plano". */
const ROTULO_CAMPO = {
  nome: 'Nome', email: 'E-mail', telefone: 'Telefone', nascimento: 'Nascimento', sexo: 'Sexo',
  endereco: 'Endereço', altura: 'Altura', peso: 'Peso', objetivo: 'Objetivo', nivel: 'Nível',
  status: 'Status', obs: 'Observações', diasTreino: 'Dias de treino', horarios: 'Horários',
  freqVezes: 'Frequência', foco: 'Foco', mensalidade: 'Mensalidade', vencimento: 'Vencimento',
  pagoPor: 'Pago por', parceria: 'Parceria', appLiberado: 'Acesso ao app', id: 'ID',
  anamnese: 'Anamnese', parq: 'PAR-Q', matriz: 'Matriz',
};

/** "Ficha editada · Telefone, Plano" @param {string[]} campos */
export function resumoFicha(campos) {
  const nomes = (campos || []).map((c) => ROTULO_CAMPO[c] || c);
  return nomes.length ? `Ficha editada · ${nomes.join(', ')}` : 'Ficha editada';
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dois = (n) => String(n).padStart(2, '0');

/** ms de um 'YYYY-MM-DD' + 'HH:MM' no fuso LOCAL, ou 0 se a data não for válida. */
function instante(iso, hhmm = '12:00') {
  if (!DATA_ISO.test(iso)) return 0;
  const [a, m, d] = iso.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const dt = new Date(a, m - 1, d, h, mi);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? dt.getTime() : 0;
}

/** 'YYYY-MM-DD' local de um instante. @param {number} ms */
export function isoDoDia(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

const dataCurta = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const lista = (v) => (Array.isArray(v) ? v : []);
const mapa = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * O que as fichas contam sobre o passado, como eventos `derivado: true`.
 *
 * @param {any[]} alunos
 * @param {{ antesDe?: number, chaves?: Set<string> }} [opts]
 *   antesDe — só entra o que é anterior ao evento gravado mais antigo;
 *   chaves  — fatos que já têm evento gravado e não podem aparecer de novo.
 * @returns {any[]} do mais novo ao mais antigo
 */
export function historicoDasFichas(alunos, { antesDe = Infinity, chaves = new Set() } = {}) {
  const evs = [];
  const add = (a, tipo, em, resumo, chave, extra = {}) => {
    if (!em || em >= antesDe || chaves.has(chave)) return;
    evs.push({ id: `h-${chave}`, chave, tipo, origem: null, derivado: true,
      alunoId: String(a.id), alunoNome: String(a.nome || ''), em, resumo, ...extra });
  };

  for (const a of lista(alunos)) {
    if (!a || typeof a !== 'object' || a.id == null) continue;
    const id = String(a.id);
    const horas = mapa(a.presencaHoras);

    for (const dia of lista(a.presencas)) {
      if (typeof dia !== 'string') continue;
      const h = HORA.test(horas[dia]) ? horas[dia] : null;
      add(a, 'presenca', instante(dia, h || '12:00'), 'Presença', `presenca:${id}:${dia}`,
        h ? { dia } : { dia, semHora: true });
    }

    for (const [dia, at] of Object.entries(mapa(a.atestados))) {
      if (!DATA_ISO.test(dia)) continue;
      add(a, 'atestado', Number(at && at.em) || 0, `Atestado · aula de ${dataCurta(dia)}`, `atestado:${id}:${dia}`, { dia });
    }

    for (const f of lista(a.feedbacks)) {
      if (!f || typeof f.id !== 'string') continue;
      const o = f.origem === 'app' || f.origem === 'portal' ? f.origem : null;
      add(a, 'feedback', Number(f.criadoEm) || 0, resumoFeedback(f), `feedback:${id}:${f.id}`,
        { origem: o, detalhe: cortar(f.obs, 120) || undefined });
    }

    for (const av of lista(a.avaliacoes)) {
      if (!av || av.num == null) continue;
      add(a, 'avaliacao', Number(av.criadoEm) || 0, `Avaliação física #${av.num}`, `avaliacao:${id}:${av.num}`);
    }

    add(a, 'aluno-criado', Number(a.criadoEm) || 0, 'Aluno cadastrado', `aluno-criado:${id}`);
  }
  for (const e of evs) if (e.detalhe === undefined) delete e.detalhe;
  return juntarEventos(evs);
}

/**
 * Junta listas de eventos sem repetir id, do mais novo ao mais antigo.
 * @param {...any[]} listas
 */
export function juntarEventos(...listas) {
  const porId = new Map();
  for (const l of listas) for (const e of lista(l)) if (e && e.id && !porId.has(e.id)) porId.set(e.id, e);
  return [...porId.values()].sort((a, b) => (b.em || 0) - (a.em || 0) || String(a.id).localeCompare(String(b.id)));
}

/**
 * @param {any[]} evs
 * @param {{ categoria?: string, origem?: string, alunoId?: string }} f
 */
export function filtrarEventos(evs, { categoria = 'todos', origem = 'todas', alunoId = '' } = {}) {
  return lista(evs).filter((e) => {
    if (categoria !== 'todos' && (TIPOS[e.tipo] || {}).categoria !== categoria) return false;
    if (origem !== 'todas' && e.origem !== origem) return false;
    if (alunoId && e.alunoId !== alunoId) return false;
    return true;
  });
}

/** "Hoje", "Ontem" ou "Ter · 22/09/2026". @param {string} iso @param {string} hojeIso */
export function rotuloDia(iso, hojeIso) {
  if (iso === hojeIso) return 'Hoje';
  const ontem = new Date(instante(hojeIso));
  ontem.setDate(ontem.getDate() - 1);
  if (iso === isoDoDia(ontem.getTime())) return 'Ontem';
  const [a, m, d] = iso.split('-');
  return `${DIAS_SEM[new Date(instante(iso)).getDay()]} · ${d}/${m}/${a}`;
}

/**
 * Agrupa pelo dia LOCAL em que o evento aconteceu, mantendo a ordem recebida.
 * @param {any[]} evs @param {string} hojeIso
 * @returns {{ dia: string, rotulo: string, itens: any[] }[]}
 */
export function agruparPorDia(evs, hojeIso) {
  const grupos = [];
  for (const e of lista(evs)) {
    const dia = isoDoDia(e.em || 0);
    let g = grupos[grupos.length - 1];
    if (!g || g.dia !== dia) { g = { dia, rotulo: rotuloDia(dia, hojeIso), itens: [] }; grupos.push(g); }
    g.itens.push(e);
  }
  return grupos;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciais = (nome) => ((nome || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

/**
 * Uma linha do feed. Nome e foto vêm da ficha ATUAL quando ela existe (o aluno
 * pode ter trocado os dois); senão, do que o evento guardou.
 * @param {any} ev @param {any} aluno a ficha, ou null se não existe mais
 */
export function linhaHTML(ev, aluno) {
  const nome = (aluno && aluno.nome) || ev.alunoNome || 'Aluno';
  const foto = aluno && aluno.fotoUrl;
  const d = new Date(ev.em || 0);
  const hora = ev.semHora ? '—' : `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  const icone = (TIPOS[ev.tipo] || {}).icone || '•';
  const origem = ev.origem && ORIGEM_ROTULO[ev.origem]
    ? `<span class="reg-origem reg-origem--${esc(ev.origem)}">${esc(ORIGEM_ROTULO[ev.origem])}</span>` : '';
  const fila = ev.pendente ? `<span class="reg-fila" title="Ainda não subiu para a nuvem">na fila</span>` : '';
  return `<button class="reg-row${ev.derivado ? ' reg-derivado' : ''}" data-id="${esc(ev.alunoId)}" type="button">
    <span class="reg-hora">${hora}</span>
    <span class="rav">${foto ? `<img src="${esc(foto)}" alt="" />` : esc(iniciais(nome))}</span>
    <span class="reg-txt"><span class="rnome">${esc(nome)}</span><span class="reg-res">${icone} ${esc(ev.resumo || '')}</span>${ev.detalhe ? `<span class="reg-det">“${esc(ev.detalhe)}”</span>` : ''}</span>
    <span class="reg-selos">${origem}${fila}</span>
  </button>`;
}
