// @ts-check
/**
 * Formatação e rótulos usados por mais de uma tela da Gestão.
 *
 * Saíram do `app.js` no fatiamento (docs/superpowers/specs/2026-10-06-refatoracao-gestao-design.md, §2):
 * a lista, o perfil e as próximas telas extraídas precisam dos mesmos. Puro —
 * nada de DOM aqui, então dá para testar no node.
 */

/** Escapa texto para entrar em HTML (conteúdo e atributo entre aspas duplas). @param {unknown} s */
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

/**
 * A data de HOJE no fuso de quem está usando.
 *
 * `toISOString()` devolve UTC, e o box fica em UTC-3: das 21h à meia-noite ele
 * já aponta para o dia seguinte. Como é exatamente nessa janela que o check-in
 * das aulas da noite acontece, a presença ia parar na data errada todo dia.
 */
export function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const hoje = () => isoLocal();

/** As duas iniciais do nome, para o avatar sem foto. @param {string} [nome] */
export function iniciais(nome) {
  return ((nome || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

/** Número no formato brasileiro, ou '—'. @param {unknown} v @param {number} [dec] */
export function fmtN(v, dec = 1) {
  return v == null || isNaN(/** @type {any} */ (v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Situação da matrícula, como o coach lê. */
export const STATUS_LABEL = { ativo: 'Ativo', inativo: 'Inativo', pendente: 'Pendente' };

/** Número digitado (aceita vírgula), ou null. @param {unknown} v */
export const numf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' ('—' sem data). @param {string} [iso] */
export function fmtData(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }

/** 'AAAA-MM-DD' → 'DD/MM' ('' sem data). @param {string} [iso] */
export function fmtDataCurta(iso) { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${d}/${m}`; }

/** A data `n` dias depois (ou antes) de `iso`, no fuso local. @param {string} iso @param {number} n */
export function addDias(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }

/** Um `<option>` com valor e rótulo iguais, marcado se for o atual. @param {string} val @param {unknown} atual */
export function opt(val, atual) { return `<option value="${esc(val)}"${val === atual ? ' selected' : ''}>${esc(val)}</option>`; }

/**
 * Tenta ler uma hora de texto livre para o formato do `<input type="time">`.
 *
 * O campo antigo era digitado à mão e vem de tudo quanto é jeito: "19 Horas",
 * "19h", "18h–19h", "6:30". Pega a primeira hora que aparecer — nas faixas, é o
 * começo, que é o que interessa. Sem nada reconhecível, devolve vazio: melhor o
 * campo em branco do que uma hora inventada na ficha de um aluno.
 * @param {string} [txt] @returns {string} 'HH:MM' ou ''
 */
export function horaParaInput(txt) {
  const m = String(txt || '').match(/(\d{1,2})\s*[:h]?\s*(\d{2})?/);
  if (!m) return '';
  const h = Number(m[1]);
  if (!(h >= 0 && h <= 23)) return '';
  const min = m[2] && Number(m[2]) < 60 ? m[2] : '00';
  return `${String(h).padStart(2, '0')}:${min}`;
}

/** 'HH:MM' → '19h' / '6h30', que é como se fala a hora no box. @param {string} [hhmm] */
export function horaLegivel(hhmm) {
  const m = String(hhmm || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return String(hhmm || '').trim();
  return `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}`;
}

/**
 * O endereço que abre a conversa no WhatsApp. É o `api.whatsapp.com/send`, e
 * NÃO o `wa.me`: o `wa.me` só redireciona para cá, e no redirecionamento troca
 * todo emoji por "" (U+FFFD) — o ✅ e o 💪 chegavam quebrados no aluno, com o
 * texto já certo em UTF-8 no nosso link. Este endereço guarda o texto intacto.
 */
export const WHATSAPP_ENVIAR = 'https://api.whatsapp.com/send';

/**
 * Link do WhatsApp com a mensagem já escrita ('' sem número). Saiu do app.js
 * quando a aba Progresso (parabenizar pelas medalhas) foi para módulo próprio.
 * @param {string} [tel] @param {string} [msg]
 */
export function waMsg(tel, msg) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  const full = d.startsWith('55') ? d : '55' + d;
  return `${WHATSAPP_ENVIAR}?phone=${full}${msg ? '&text=' + encodeURIComponent(msg) : ''}`;
}

/**
 * Os seis dias de aula da semana corrente (Seg–Sáb), como Date à meia-noite.
 * Usado na lista (selo de kcal da semana) e na aba Progresso (gráfico da semana).
 * @returns {Date[]}
 */
export function semanaSegSab() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dow = hoje.getDay();
  const mon = new Date(hoje); mon.setDate(hoje.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: 6 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
