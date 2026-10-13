// @ts-check
/**
 * Os campos do cadastro do aluno. Era a aba Dados; com a ficha em cards
 * (docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md), cada
 * grupo de campos foi para um card: contato, plano e acesso na aba Geral
 * (ui-tab-geral.js); nascimento, sexo, medidas do cadastro e a nota clínica na
 * aba Saúde (ui-tab-saude.js); objetivo, nível, foco, frequência e os dias e
 * horários no card Perfil de treino da aba Treino (ui-tab-treino.js).
 *
 * Este módulo é o DONO dos campos: cada campo é montado uma vez só
 * (`camposDados`) e quem precisa compõe os que usa — o modal do "+ Cadastrar
 * novo aluno" (`formDadosHTML`, o formulário inteiro) e os cards. Assim um
 * campo nunca tem duas marcações diferentes. `lerForm` lê qualquer um deles;
 * `lerCampos` fica só com os campos de um card.
 */
import * as db from './db.js?v=20';
import { esc, opt, horaParaInput, STATUS_LABEL } from './util/formato.js?v=20';
import { $, $$ } from './util/dom.js?v=20';
import { OBJETIVO_LABELS } from '../../compartilhado/config/objetivos.js?v=20';
import { GRUPOS, GRUPO_LABEL } from '../../compartilhado/regras/grupos.js';
import { PERCENTUAIS_PARCERIA } from '../../compartilhado/regras/consumo.js';

/* ============================================================
   Os campos (montados uma vez, compostos por quem usa)
   ============================================================ */
// A lista veio para o compartilhado (`config/objetivos.js`) quando a regra de
// perfil do montador individual passou a precisar dela: duas listas de objetivo
// significariam a Gestão acrescentar um e a regra nunca ficar sabendo.
const OBJETIVOS = OBJETIVO_LABELS;
const SEXOS = ['Masculino', 'Feminino', 'Outro'];

/** Os dias que o box abre, na ordem da semana. */
export const DIAS_FORM = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb']];

/** Os campos da ficha que cada grupo grava (o que `lerCampos` devolve). */
export const CAMPOS = Object.freeze({
  contato: ['nome', 'telefone', 'email', 'endereco', 'status'],
  plano: ['mensalidade', 'vencimento', 'parceria', 'pagoPor'],
  acesso: ['appLiberado', 'modoLite'],
  biometria: ['nascimento', 'idade', 'sexo', 'altura', 'peso'],
  clinica: ['obs'],
  treino: ['objetivo', 'nivel', 'foco', 'freqVezes', 'diasTreino', 'horarios'],
});

/** Idade em anos a partir de 'AAAA-MM-DD' ('' se não der). @param {string} [iso] */
export function calcIdade(iso) { if (!iso) return ''; const n = new Date(iso + 'T00:00:00'); const h = new Date(); let i = h.getFullYear() - n.getFullYear(); const mm = h.getMonth() - n.getMonth(); if (mm < 0 || (mm === 0 && h.getDate() < n.getDate())) i--; return i >= 0 && i < 130 ? String(i) : ''; }

/** Link do WhatsApp para o telefone digitado ('' sem número). @param {string} [tel] */
export function waLink(tel) { const d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; const full = d.startsWith('55') ? d : '55' + d; return `https://wa.me/${full}`; }

/**
 * Cada campo do cadastro, já montado (o `.field` inteiro).
 * @param {any} [a] a ficha (vazia no cadastro)
 * @param {{ idEditavel?: boolean, todos?: any[] }} [opts]
 *   idEditavel: o cadastro deixa escolher o ID; todos: os alunos do box (para
 *   o "quem paga esta conta") — padrão, os do db.
 */
export function camposDados(a = {}, opts = {}) {
  const todos = opts.todos || db.listar();
  const sexoOpts = `<option value="">—</option>` + SEXOS.map((s) => opt(s, a.sexo)).join('');
  const objOpts = `<option value="">—</option>` + OBJETIVOS.map((s) => opt(s, a.objetivo)).join('');
  const freqOpts = `<option value="">—</option>` + [1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${String(n) === String(a.freqVezes) ? ' selected' : ''}>${n}x por semana</option>`).join('');
  const nivelOpts = `<option value="">—</option>` + [['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']].map(([v, l]) => `<option value="${v}"${a.nivel === v ? ' selected' : ''}>${l}</option>`).join('');
  // Foco: até dois dos sete grupos grandes. O limite é aplicado na leitura do
  // formulário e de novo na regra — marcar três aqui não pode virar treino torto.
  const focoSel = new Set(a.foco || []);
  const focoHTML = GRUPOS.map((g) => `
    <label class="dia-check"><input type="checkbox" name="foco" value="${g}"${focoSel.has(g) ? ' checked' : ''}/><span>${esc(GRUPO_LABEL[g])}</span></label>`).join('');
  const diasSel = new Set(a.diasTreino || []);
  const horas = a.horarios || {};
  // Cada dia carrega a própria hora. O `freqHorario` antigo (uma hora só para a
  // semana toda) entra como valor inicial de quem ainda não tem hora por dia —
  // assim uma ficha antiga não abre vazia e o coach só confirma o que já valia.
  const horaAntiga = horaParaInput(a.freqHorario);
  const diasHTML = DIAS_FORM.map(([v, l]) => `
    <div class="dia-linha">
      <label class="dia-check"><input type="checkbox" name="diasTreino" value="${v}"${diasSel.has(v) ? ' checked' : ''}/><span>${l}</span></label>
      <input class="dia-hora" type="time" name="hora_${v}" value="${esc(horas[v] || horaAntiga)}"${diasSel.has(v) ? '' : ' disabled'} />
    </div>`).join('');
  const stOpts = ['ativo', 'inativo', 'pendente'].map((s) => `<option value="${s}"${(a.status || 'ativo') === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('');
  // Quem pode ser responsável: qualquer aluno ativo que não seja ele mesmo e que
  // não tenha responsável próprio. Sem esse corte dava para montar corrente (A
  // paga B que paga C) e a soma passaria a depender da ordem em que se lê.
  const temDependentes = todos.some((x) => x.pagoPor && x.pagoPor.id === a.id);
  const candidatos = temDependentes ? [] : todos
    .filter((x) => x.id !== a.id && (x.status || 'ativo') !== 'inativo' && !(x.pagoPor && x.pagoPor.id));
  const pagoPorId = (a.pagoPor && a.pagoPor.id) || '';
  const pagadorOpts = `<option value="">O próprio aluno</option>`
    + candidatos.map((x) => `<option value="${esc(x.id)}"${x.id === pagoPorId ? ' selected' : ''}>${esc(x.nome || x.id)}</option>`).join('');
  const escopoAtual = (a.pagoPor && a.pagoPor.escopo) || 'tudo';
  const escopoOpts = [['tudo', 'Plano e consumíveis'], ['plano', 'Só o plano']]
    .map(([v, l]) => `<option value="${v}"${escopoAtual === v ? ' selected' : ''}>${l}</option>`).join('');
  const pctAtual = String((a.parceria && a.parceria.percentual) || '');
  const parceriaOpts = `<option value="">Sem parceria</option>`
    + PERCENTUAIS_PARCERIA.map((n) => `<option value="${n}"${String(n) === pctAtual ? ' selected' : ''}>${n}% de desconto${n === 100 ? ' (cortesia)' : ''}</option>`).join('');
  return {
    id: opts.idEditavel
      ? `<div class="field full"><label>ID do aluno</label><input name="id" type="text" value="${esc(a.id)}" placeholder="Use o seu padrão de ID — ou deixe vazio para gerar (001, 002…)" /><span class="hint">Precisa ser único. Vazio = numeração automática.</span></div>`
      : `<div class="field full"><label>ID do aluno</label><input type="text" value="${esc(a.id)}" disabled /><span class="hint">O ID é definido no cadastro e não muda (mantém as fotos no lugar).</span></div>`,
    nome: `<div class="field full"><label>Nome completo *</label><input name="nome" type="text" required value="${esc(a.nome)}" placeholder="Nome do aluno" /></div>`,
    nascimento: `<div class="field"><label>Data de nascimento</label><input name="nascimento" type="date" value="${esc(a.nascimento)}" /><span class="hint" data-idade>${a.nascimento ? 'Idade: ' + calcIdade(a.nascimento) + ' anos' : ''}</span></div>`,
    sexo: `<div class="field"><label>Sexo</label><select name="sexo">${sexoOpts}</select></div>`,
    telefone: `<div class="field"><label>Telefone / WhatsApp</label><input name="telefone" type="tel" value="${esc(a.telefone)}" placeholder="(14) 99999-9999" /><a class="wa" data-wa target="_blank" rel="noopener" style="display:none">Abrir no WhatsApp →</a></div>`,
    email: `<div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(a.email)}" placeholder="email@exemplo.com" /></div>`,
    endereco: `<div class="field full"><label>Endereço</label><input name="endereco" type="text" value="${esc(a.endereco)}" placeholder="Rua, número, bairro, cidade" /></div>`,
    status: `<div class="field"><label>Status</label><select name="status">${stOpts}</select></div>`,
    appLiberado: `<div class="field full"><label>App mobile</label><label class="chk-app"><input type="checkbox" name="appLiberado" value="1"${a.appLiberado === true ? ' checked' : ''} /><span>Acesso ao Aplicativo Liberado</span></label><span class="hint">O app no celular é de planos específicos. Desmarcado, o aluno entra no app e para numa tela de bloqueio — o <b>Portal web continua valendo</b>. Ficha antiga, sem esta marcação, fica bloqueada.</span></div>`,
    modoLite: `<div class="field full"><label>Tela do app</label><label class="chk-app"><input type="checkbox" name="modoLite" value="1"${a.modoLite === true ? ' checked' : ''} /><span>Modo simplificado (Lite)</span></label><span class="hint">Para quem quer o app sem distração: a tela inicial mostra só o <b>treino do dia</b> em destaque e os atalhos de água e de conversa com você, e o app fica com duas abas (Hoje e Perfil). Só você liga e desliga — o aluno não mexe nisso.</span></div>`,
    altura: `<div class="field"><label>Altura (cm)</label><input name="altura" type="number" min="0" step="0.1" value="${esc(a.altura)}" placeholder="175" /></div>`,
    peso: `<div class="field"><label>Peso atual (kg)</label><input name="peso" type="number" min="0" step="0.1" value="${esc(a.peso)}" placeholder="80" /></div>`,
    objetivo: `<div class="field"><label>Objetivo</label><select name="objetivo">${objOpts}</select></div>`,
    nivel: `<div class="field"><label>Nível de treino</label><select name="nivel">${nivelOpts}</select></div>`,
    foco: `<div class="field full"><label>Foco (até 2 grupos)</label><div class="dias-treino">${focoHTML}</div><span class="hint">O Montador Individual tira série de onde ele está mais adiantado e põe no foco, mantendo o total do treino da turma.</span></div>`,
    freqVezes: `<div class="field"><label>Frequência semanal</label><select name="freqVezes">${freqOpts}</select><span class="hint">O que ele contratou. Os dias abaixo é que valem no check-in.</span></div>`,
    dias: `<div class="field full"><label>Dias e horários de treino</label><div class="dias-treino">${diasHTML}</div><span class="hint">Marque os dias e a hora de cada um — eles podem ser diferentes. Usados no check-in, no Portal do Aluno e no acumulado mensal do Montador.</span></div>`,
    obs: `<div class="field full"><label>Nota clínica do coach</label><textarea name="obs" placeholder="Lesões, restrições, condições de saúde, observações relevantes…">${esc(a.obs)}</textarea></div>`,
    mensalidade: `<div class="field"><label>Mensalidade (R$)</label><input name="mensalidade" type="number" min="0" step="0.01" value="${esc(a.mensalidade)}" placeholder="150" /></div>`,
    vencimento: `<div class="field"><label>Dia de vencimento</label><input name="vencimento" type="number" min="1" max="31" value="${esc(a.vencimento)}" placeholder="10" /><span class="hint">Dia do mês (1–31) em que a mensalidade vence.</span></div>`,
    parceriaPct: `<div class="field"><label>Parceria (desconto)</label><select name="parceriaPct">${parceriaOpts}</select><span class="hint">A mensalidade cheia continua acima. O desconto entra como investimento do box, não como preço menor.</span></div>`,
    parceriaNome: `<div class="field"><label>Nome da parceria</label><input name="parceriaNome" type="text" value="${esc((a.parceria && a.parceria.nome) || '')}" placeholder="Ex.: Clínica São Jorge"${a.parceria && a.parceria.percentual ? '' : ' disabled'} /><span class="hint">Para saber quanto o box investe em cada uma.</span></div>`,
    pagoPor: `<div class="field"><label>Quem paga esta conta</label><select name="pagoPorId">${pagadorOpts}</select><span class="hint">${temDependentes ? 'Este aluno já paga a conta de outro, então não pode ter um responsável.' : 'A conta dele entra somada na do responsável, e o Portal dele mostra quem acertou.'}</span></div>`,
    pagoPorEscopo: `<div class="field"><label>O responsável cobre</label><select name="pagoPorEscopo"${a.pagoPor && a.pagoPor.id ? '' : ' disabled'}>${escopoOpts}</select><span class="hint">“Só o plano” deixa o que ele consumir no box por conta dele.</span></div>`,
  };
}

/** Uma seção de formulário com os campos. @param {string} titulo @param {string[]} campos */
const secao = (titulo, campos) => `
  <div class="form-sec">
    <h3>${titulo}</h3>
    <div class="grid-form">
      ${campos.join('\n      ')}
    </div>
  </div>`;

/**
 * O formulário inteiro do cadastro (o modal do "+ Cadastrar novo aluno").
 * @param {any} [a] @param {{ idEditavel?: boolean, todos?: any[] }} [opts]
 */
export function formDadosHTML(a = {}, opts = {}) {
  const c = camposDados(a, opts);
  return secao('Dados pessoais', [c.id, c.nome, c.nascimento, c.sexo, c.telefone, c.email, c.endereco, c.status, c.appLiberado, c.modoLite])
    + secao('Dados do treino', [c.altura, c.peso, c.objetivo, c.nivel, c.foco, c.freqVezes, c.dias, c.obs])
    + secao('Financeiro', [c.mensalidade, c.vencimento, c.parceriaPct, c.parceriaNome, c.pagoPor, c.pagoPorEscopo]);
}

/** Liga o cálculo de idade e o link do WhatsApp dentro de um container de form. @param {ParentNode} root */
export function wireForm(root) {
  const nasc = $('input[name=nascimento]', root);
  const idadeEl = $('[data-idade]', root);
  if (nasc && idadeEl) nasc.addEventListener('input', () => { const i = calcIdade(nasc.value); idadeEl.textContent = i ? `Idade: ${i} anos` : ''; });
  // O campo de hora só faz sentido no dia marcado: desabilitado, ele não vai no
  // FormData e a hora não fica pendurada num dia que o aluno não treina.
  $$('.dia-linha', root).forEach((linha) => {
    const chk = $('input[type=checkbox]', linha), hora = $('.dia-hora', linha);
    if (!chk || !hora) return;
    chk.addEventListener('change', () => {
      hora.disabled = !chk.checked;
      if (chk.checked && !hora.value) hora.value = '19:00';
    });
  });
  const pagador = $('select[name=pagoPorId]', root);
  const escopo = $('select[name=pagoPorEscopo]', root);
  if (pagador && escopo) pagador.addEventListener('change', () => { escopo.disabled = !pagador.value; });
  const parcPct = $('select[name=parceriaPct]', root);
  const parcNome = $('input[name=parceriaNome]', root);
  if (parcPct && parcNome) parcPct.addEventListener('change', () => { parcNome.disabled = !parcPct.value; });
  const tel = $('input[name=telefone]', root);
  const wa = $('[data-wa]', root);
  if (tel && wa) {
    const upd = () => { const l = waLink(tel.value); if (l) { wa.href = l; wa.style.display = 'inline-flex'; } else wa.style.display = 'none'; };
    tel.addEventListener('input', upd); upd();
  }
}

/** Lê os campos de um <form> de dados para um objeto. @param {HTMLFormElement} form */
export function lerForm(form) {
  const fd = new FormData(form);
  /** @type {any} */ const o = {};
  for (const [k, v] of fd.entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  o.diasTreino = fd.getAll('diasTreino'); // checkboxes múltiplos
  // Caixa desmarcada não vai no FormData: sem o booleano explícito, desmarcar e
  // salvar deixaria o `true` antigo intacto no `Object.assign` do db.atualizar.
  o.appLiberado = fd.get('appLiberado') === '1';
  o.modoLite = fd.get('modoLite') === '1'; // mesmo motivo do appLiberado
  // Foco do aluno: até dois grupos, e é aqui que o limite vira verdade — a caixa
  // de seleção não impede o terceiro clique, e a regra de perfil também corta,
  // mas gravar três deixaria a ficha dizendo uma coisa e o treino outra.
  o.foco = fd.getAll('foco').slice(0, 2);
  // As horas viram um mapa `{seg:'19:00'}`; os campos soltos `hora_seg` saem do
  // objeto para não virarem colunas fantasma na ficha do aluno. Só entra a hora
  // de dia marcado — hora de dia desmarcado é lixo esperando confundir depois.
  o.horarios = {};
  for (const [v] of DIAS_FORM) {
    const h = String(fd.get('hora_' + v) || '');
    if (o.diasTreino.includes(v) && h) o.horarios[v] = h;
    delete o['hora_' + v];
  }
  // `pagoPor` guarda o vínculo inteiro (quem e quanto) num campo só; os dois
  // selects saem do objeto para não virarem colunas soltas na ficha.
  o.pagoPor = o.pagoPorId ? { id: o.pagoPorId, escopo: o.pagoPorEscopo === 'plano' ? 'plano' : 'tudo' } : null;
  delete o.pagoPorId; delete o.pagoPorEscopo;
  // A mensalidade cheia fica onde sempre esteve; a parceria é só o percentual e
  // o nome. O desconto em reais nunca é gravado — ele é derivado, e assim mudar
  // o preço do plano recalcula o investimento do box sozinho.
  const pct = parseInt(o.parceriaPct, 10);
  o.parceria = pct ? { nome: (o.parceriaNome || '').trim(), percentual: pct } : null;
  delete o.parceriaPct; delete o.parceriaNome;
  if (o.nascimento) o.idade = calcIdade(o.nascimento);
  return o;
}

/**
 * Só os campos de um grupo (`CAMPOS`), lidos do formulário. `lerForm` sempre
 * devolve os booleanos e as listas (para desmarcar gravar `false`); num
 * formulário que não tem esses campos, eles não podem aparecer como "mexidos".
 * @param {HTMLFormElement} form @param {readonly string[]} chaves
 * @returns {Record<string, any>}
 */
export function lerCampos(form, chaves) {
  const o = lerForm(form);
  /** @type {Record<string, any>} */ const r = {};
  for (const k of chaves) if (k in o) r[k] = o[k];
  return r;
}
