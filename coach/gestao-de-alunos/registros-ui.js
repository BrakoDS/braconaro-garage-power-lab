// @ts-check
/**
 * Aba Registros da ficha do aluno — a parte que não precisa de DOM nem de Firebase.
 *
 * A linha do tempo de UM aluno. Três fontes viram uma lista só:
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
  'foto-diario': { icone: '📸', categoria: 'foto' },
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
 * A linha do tempo de UM aluno: os eventos dele (gravados + fila) e, antes do
 * primeiro, o que a ficha dele conta. O corte `antesDe` é o evento gravado mais
 * antigo DESTE aluno — o de outro aluno não diz nada sobre quando o log dele começou.
 *
 * @param {any[]} gravados eventos já juntados (pendentes primeiro), de qualquer aluno
 * @param {any} aluno a ficha aberta
 * @param {{ categoria?: string, origem?: string }} [filtro]
 * @returns {{ reais: any[], hist: any[] }} os dois do mais novo ao mais antigo, já filtrados
 */
export function linhaDoTempoDoAluno(gravados, aluno, { categoria, origem } = {}) {
  if (!aluno || aluno.id == null) return { reais: [], hist: [] };
  const id = String(aluno.id);
  const doAluno = juntarEventos(gravados).filter((e) => String(e.alunoId) === id);
  const chaves = new Set(doAluno.map((e) => e.chave).filter(Boolean));
  const antesDe = doAluno.length ? Math.min(...doAluno.map((e) => e.em || Infinity)) : Infinity;
  const hist = historicoDasFichas([aluno], { antesDe, chaves });
  return { reais: filtrarEventos(doAluno, { categoria, origem }), hist: filtrarEventos(hist, { categoria, origem }) };
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

/* ---------- Diário de Evolução: a foto de cada linha ---------- */

/**
 * Só URL de download do nosso Storage vira `<img>`. A regra do Firestore já
 * exige isso ao gravar, mas o documento é escrito pelo aluno — aqui se confere de novo.
 */
const URL_STORAGE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/diario%2F/;

/**
 * Os documentos de `diario/{email}/fotos` indexados pelo dia, sem confiar neles:
 * sem dia coerente com o id, sem `em` ou com URL de fora, fica de fora.
 * @param {any[]|null} docs @returns {Map<string, { em: number, url: string, mini: string }>|null}
 */
export function fotosDoDiarioPorDia(docs) {
  if (!Array.isArray(docs)) return null;
  const porDia = new Map();
  for (const d of docs) {
    if (!d || !DATA_ISO.test(d.id) || d.dia !== d.id) continue;
    const em = Number(d.em);
    if (!(em > 0) || !URL_STORAGE.test(d.url) || !URL_STORAGE.test(d.miniUrl)) continue;
    porDia.set(d.id, { em, url: d.url, mini: d.miniUrl });
  }
  return porDia;
}

/**
 * Põe a foto nos eventos `foto-diario`. O casamento é por dia E `em`: refazer a
 * foto do dia sobrescreve o mesmo caminho, então a linha do envio antigo não
 * pode mostrar a foto nova — ela diz que foi refeita. Dia sem documento = o
 * aluno apagou. Com `porDia` null (não deu para ler), nada muda.
 *
 * @param {any[]} evs @param {Map<string, { em: number, url: string, mini: string }>|null} porDia
 */
export function anexarFotosDoDiario(evs, porDia) {
  if (!porDia) return lista(evs);
  return lista(evs).map((e) => {
    if (!e || e.tipo !== 'foto-diario') return e;
    const f = porDia.get(e.dia);
    if (!f) return { ...e, fotoEstado: 'apagada' };
    if (f.em !== e.em) return { ...e, fotoEstado: 'refeita' };
    return { ...e, foto: { url: f.url, mini: f.mini } };
  });
}

const AVISO_FOTO = {
  apagada: 'O aluno apagou esta foto do diário.',
  refeita: 'Foto refeita depois — a atual está na linha do envio mais novo.',
};

/**
 * Uma linha do feed. Sem nome nem foto do aluno: a aba fica dentro da ficha,
 * então seriam os mesmos em toda linha. A foto do diário, quando há, entra como
 * miniatura clicável (`data-foto`), que o app.js abre em tela cheia.
 * @param {any} ev
 */
export function linhaHTML(ev) {
  const d = new Date(ev.em || 0);
  const hora = ev.semHora ? '—' : `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  const icone = (TIPOS[ev.tipo] || {}).icone || '•';
  const origem = ev.origem && ORIGEM_ROTULO[ev.origem]
    ? `<span class="reg-origem reg-origem--${esc(ev.origem)}">${esc(ORIGEM_ROTULO[ev.origem])}</span>` : '';
  const fila = ev.pendente ? `<span class="reg-fila" title="Ainda não subiu para a nuvem">na fila</span>` : '';
  const foto = ev.foto
    ? `<button class="reg-thumb" type="button" data-foto="${esc(ev.foto.url)}" data-dia="${esc(ev.dia || '')}" aria-label="Ver a foto em tela cheia"><img src="${esc(ev.foto.mini)}" alt="" loading="lazy" /></button>`
    : '';
  const aviso = AVISO_FOTO[ev.fotoEstado] ? `<span class="reg-aviso">${AVISO_FOTO[ev.fotoEstado]}</span>` : '';
  return `<div class="reg-row${ev.derivado ? ' reg-derivado' : ''}${foto ? ' reg-row--foto' : ''}">
    <span class="reg-hora">${hora}</span>${foto}
    <span class="reg-txt"><span class="reg-res">${icone} ${esc(ev.resumo || '')}</span>${ev.detalhe ? `<span class="reg-det">“${esc(ev.detalhe)}”</span>` : ''}${aviso}</span>
    <span class="reg-selos">${origem}${fila}</span>
  </div>`;
}
