// @ts-check
/**
 * Aba Dados do perfil — o cadastro do aluno, o acesso ao Portal/app e o
 * indicador de consentimento LGPD.
 *
 * Saiu do `app.js` no fatiamento. O FORMULÁRIO (`formDadosHTML`, `wireForm`,
 * `lerForm`) também é o do cadastro de aluno novo, por isso é exportado: o
 * modal do "+ Cadastrar novo aluno" usa o mesmo, campo por campo.
 *
 * Quando desenha: na primeira vez que a aba abre depois de 'perfil-aberto'.
 * Trocar de aba e voltar NÃO redesenha — o que o coach digitou e ainda não
 * salvou continua no formulário, como sempre foi.
 *
 * Ao salvar, só grava (`db.atualizar`): a gravação já publica o Portal e emite
 * 'alunos-mudaram' (ver boot.js), e é isso que atualiza a lista e o cabeçalho.
 */
import * as db from './db.js?v=13';
import { esc, opt, horaParaInput, STATUS_LABEL } from './util/formato.js?v=13';
import { $, $$ } from './util/dom.js?v=13';
import { estado, on, emit, EVENTOS } from './estado.js?v=13';
import { regFicha } from './registro.js?v=13';
import { apagarFotosDoAluno } from './ui-fotos.js?v=13';
import * as eventos from './eventos.js?v=13';
import { confirmar, avisar } from '../../compartilhado/ui/dialogo.js?v=13';
import { OBJETIVO_LABELS } from '../../compartilhado/config/objetivos.js?v=13';
import { GRUPOS, GRUPO_LABEL } from '../../compartilhado/regras/grupos.js';
import { PERCENTUAIS_PARCERIA } from '../../compartilhado/regras/consumo.js';
import { criarAcesso, linkWhatsApp, mensagemConvite } from './acesso-aluno.js?v=13';
import { carregarConsentimentoLGPD } from './consentimento-read.js?v=13';

/* ============================================================
   O formulário (o mesmo do cadastro)
   ============================================================ */
// A lista veio para o compartilhado (`config/objetivos.js`) quando a regra de
// perfil do montador individual passou a precisar dela: duas listas de objetivo
// significariam a Gestão acrescentar um e a regra nunca ficar sabendo.
const OBJETIVOS = OBJETIVO_LABELS;
const SEXOS = ['Masculino', 'Feminino', 'Outro'];

/** Os dias que o box abre, na ordem da semana. */
export const DIAS_FORM = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb']];

/** Idade em anos a partir de 'AAAA-MM-DD' ('' se não der). @param {string} [iso] */
export function calcIdade(iso) { if (!iso) return ''; const n = new Date(iso + 'T00:00:00'); const h = new Date(); let i = h.getFullYear() - n.getFullYear(); const mm = h.getMonth() - n.getMonth(); if (mm < 0 || (mm === 0 && h.getDate() < n.getDate())) i--; return i >= 0 && i < 130 ? String(i) : ''; }

/** Link do WhatsApp para o telefone digitado ('' sem número). @param {string} [tel] */
export function waLink(tel) { const d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; const full = d.startsWith('55') ? d : '55' + d; return `https://wa.me/${full}`; }

/**
 * O HTML do formulário de dados.
 * @param {any} [a] a ficha (vazia no cadastro)
 * @param {{ idEditavel?: boolean, todos?: any[] }} [opts]
 *   idEditavel: o cadastro deixa escolher o ID; todos: os alunos do box (para
 *   o "quem paga esta conta") — padrão, os do db.
 */
export function formDadosHTML(a = {}, opts = {}) {
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
  const idField = opts.idEditavel
    ? `<div class="field full"><label>ID do aluno</label><input name="id" type="text" value="${esc(a.id)}" placeholder="Use o seu padrão de ID — ou deixe vazio para gerar (001, 002…)" /><span class="hint">Precisa ser único. Vazio = numeração automática.</span></div>`
    : `<div class="field full"><label>ID do aluno</label><input type="text" value="${esc(a.id)}" disabled /><span class="hint">O ID é definido no cadastro e não muda (mantém as fotos no lugar).</span></div>`;
  return `
  <div class="form-sec">
    <h3>Dados pessoais</h3>
    <div class="grid-form">
      ${idField}
      <div class="field full"><label>Nome completo *</label><input name="nome" type="text" required value="${esc(a.nome)}" placeholder="Nome do aluno" /></div>
      <div class="field"><label>Data de nascimento</label><input name="nascimento" type="date" value="${esc(a.nascimento)}" /><span class="hint" data-idade>${a.nascimento ? 'Idade: ' + calcIdade(a.nascimento) + ' anos' : ''}</span></div>
      <div class="field"><label>Sexo</label><select name="sexo">${sexoOpts}</select></div>
      <div class="field"><label>Telefone / WhatsApp</label><input name="telefone" type="tel" value="${esc(a.telefone)}" placeholder="(14) 99999-9999" /><a class="wa" data-wa target="_blank" rel="noopener" style="display:none">Abrir no WhatsApp →</a></div>
      <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(a.email)}" placeholder="email@exemplo.com" /></div>
      <div class="field full"><label>Endereço</label><input name="endereco" type="text" value="${esc(a.endereco)}" placeholder="Rua, número, bairro, cidade" /></div>
      <div class="field"><label>Status</label><select name="status">${stOpts}</select></div>
      <div class="field full"><label>App mobile</label><label class="chk-app"><input type="checkbox" name="appLiberado" value="1"${a.appLiberado === true ? ' checked' : ''} /><span>Acesso ao Aplicativo Liberado</span></label><span class="hint">O app no celular é de planos específicos. Desmarcado, o aluno entra no app e para numa tela de bloqueio — o <b>Portal web continua valendo</b>. Ficha antiga, sem esta marcação, fica bloqueada.</span></div>
      <div class="field full"><label>Tela do app</label><label class="chk-app"><input type="checkbox" name="modoLite" value="1"${a.modoLite === true ? ' checked' : ''} /><span>Modo simplificado (Lite)</span></label><span class="hint">Para quem quer o app sem distração: a tela inicial mostra só o <b>treino do dia</b> em destaque e os atalhos de água e de conversa com você, e o app fica com duas abas (Hoje e Perfil). Só você liga e desliga — o aluno não mexe nisso.</span></div>
    </div>
  </div>
  <div class="form-sec">
    <h3>Dados do treino</h3>
    <div class="grid-form">
      <div class="field"><label>Altura (cm)</label><input name="altura" type="number" min="0" step="0.1" value="${esc(a.altura)}" placeholder="175" /></div>
      <div class="field"><label>Peso atual (kg)</label><input name="peso" type="number" min="0" step="0.1" value="${esc(a.peso)}" placeholder="80" /></div>
      <div class="field"><label>Objetivo</label><select name="objetivo">${objOpts}</select></div>
      <div class="field"><label>Nível de treino</label><select name="nivel">${nivelOpts}</select></div>
      <div class="field full"><label>Foco (até 2 grupos)</label><div class="dias-treino">${focoHTML}</div><span class="hint">O Montador Individual tira série de onde ele está mais adiantado e põe no foco, mantendo o total do treino da turma.</span></div>
      <div class="field"><label>Frequência semanal</label><select name="freqVezes">${freqOpts}</select><span class="hint">O que ele contratou. Os dias abaixo é que valem no check-in.</span></div>
      <div class="field full"><label>Dias e horários de treino</label><div class="dias-treino">${diasHTML}</div><span class="hint">Marque os dias e a hora de cada um — eles podem ser diferentes. Usados no check-in, no Portal do Aluno e no acumulado mensal do Montador.</span></div>
      <div class="field full"><label>Observações médicas / restrições / histórico de lesões</label><textarea name="obs" placeholder="Lesões, restrições, condições de saúde, observações relevantes…">${esc(a.obs)}</textarea></div>
    </div>
  </div>
  <div class="form-sec">
    <h3>Financeiro</h3>
    <div class="grid-form">
      <div class="field"><label>Mensalidade (R$)</label><input name="mensalidade" type="number" min="0" step="0.01" value="${esc(a.mensalidade)}" placeholder="150" /></div>
      <div class="field"><label>Dia de vencimento</label><input name="vencimento" type="number" min="1" max="31" value="${esc(a.vencimento)}" placeholder="10" /><span class="hint">Dia do mês (1–31) em que a mensalidade vence.</span></div>
      <div class="field"><label>Parceria (desconto)</label><select name="parceriaPct">${parceriaOpts}</select><span class="hint">A mensalidade cheia continua acima. O desconto entra como investimento do box, não como preço menor.</span></div>
      <div class="field"><label>Nome da parceria</label><input name="parceriaNome" type="text" value="${esc((a.parceria && a.parceria.nome) || '')}" placeholder="Ex.: Clínica São Jorge"${a.parceria && a.parceria.percentual ? '' : ' disabled'} /><span class="hint">Para saber quanto o box investe em cada uma.</span></div>
      <div class="field"><label>Quem paga esta conta</label><select name="pagoPorId">${pagadorOpts}</select><span class="hint">${temDependentes ? 'Este aluno já paga a conta de outro, então não pode ter um responsável.' : 'A conta dele entra somada na do responsável, e o Portal dele mostra quem acertou.'}</span></div>
      <div class="field"><label>O responsável cobre</label><select name="pagoPorEscopo"${a.pagoPor && a.pagoPor.id ? '' : ' disabled'}>${escopoOpts}</select><span class="hint">“Só o plano” deixa o que ele consumir no box por conta dele.</span></div>
    </div>
  </div>`;
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

/* ============================================================
   A aba
   ============================================================ */

/**
 * O bloco "Acesso ao Portal" (sem os eventos).
 *
 * O cadastro público está desligado, então é daqui que sai a conta de login de
 * todo aluno novo (ver acesso-aluno.js e a callable `criarAcessoAluno`). O botão
 * cria a conta sem senha e devolve um link para o aluno definir a dele; para
 * quem já tem conta, só gera um link novo — é o "reenviar acesso".
 * @param {any} a
 */
export function htmlAcesso(a) {
  const email = (a.email || '').trim();
  const enviado = a.acessoEnviadoEm ? new Date(a.acessoEnviadoEm).toLocaleDateString('pt-BR') : '';
  const dica = !email
    ? 'Preencha e salve o e-mail da ficha para criar o acesso.'
    : enviado
      ? `Link enviado em ${enviado}. O mesmo botão gera outro — serve para quem esqueceu a senha.`
      : 'Cria a conta de login e gera um link para o aluno definir a própria senha. Você não vê nem escolhe a senha.';
  return `
    <div class="acesso-cab">
      <div><b>Acesso ao Portal${a.appLiberado === true ? ' e ao app' : ''}</b><span class="hint">${esc(dica)}</span></div>
      <button class="btn btn-sm" type="button" id="btn-acesso"${email ? '' : ' disabled'}>${enviado ? 'Gerar novo link' : 'Criar acesso'}</button>
    </div>
    <div class="acesso-res" id="acesso-res" hidden></div>`;
}

/** Desenha o bloco de acesso com o que está salvo agora. @param {any} a */
function renderAcessoAluno(a) {
  const el = $('#acesso-aluno'); if (!el) return;
  el.innerHTML = htmlAcesso(db.obter(a.id) || a);
  $('#btn-acesso', el)?.addEventListener('click', () => gerarAcessoAluno(a.id));
}

/** @param {string} id */
async function gerarAcessoAluno(id) {
  const a = db.obter(id); if (!a) return;
  const email = (a.email || '').trim().toLowerCase();
  // O servidor confere o e-mail SALVO na nuvem. Um e-mail digitado e ainda não
  // salvo daria "não está na Gestão" — melhor dizer o motivo real antes.
  const campo = $('#form-dados input[name=email]');
  if (campo && campo.value.trim().toLowerCase() !== email) {
    avisar({ titulo: 'Salve a ficha primeiro', texto: 'O e-mail da ficha mudou e ainda não foi salvo. Clique em <b>Salvar alterações</b> e depois em Criar acesso.' });
    return;
  }
  const btn = $('#btn-acesso'), res = $('#acesso-res');
  const rotulo = btn.textContent;
  btn.disabled = true; btn.textContent = 'Gerando…';
  res.hidden = true;
  try {
    await db.enviarAgora().catch(() => undefined);
    const r = await criarAcesso(email);
    db.atualizar(id, { acessoEnviadoEm: Date.now() });
    const texto = mensagemConvite(r.nome || a.nome || '', email, r.link, r.criado);
    const wa = linkWhatsApp(a.telefone, texto);
    res.innerHTML = `
      <p class="acesso-ok">${r.criado ? '✓ Conta criada.' : '✓ O aluno já tinha conta — a senha dele não mudou; o link novo permite trocar.'} O link vale por 1 hora.</p>
      <div class="acesso-acoes">
        ${wa ? `<a class="btn btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>` : '<span class="hint">Sem telefone na ficha — copie a mensagem e envie por onde preferir.</span>'}
        <button class="btn ghost btn-sm" type="button" id="btn-acesso-copiar">Copiar mensagem</button>
      </div>`;
    $('#btn-acesso-copiar', res)?.addEventListener('click', async (/** @type {any} */ e) => {
      try { await navigator.clipboard.writeText(texto); e.target.textContent = 'Copiado ✓'; } catch { e.target.textContent = 'Não deu para copiar'; }
    });
    btn.textContent = 'Gerar novo link';
  } catch (e) {
    res.innerHTML = `<p class="acesso-erro">${esc(/** @type {any} */ (e)?.message || 'Não deu para criar o acesso.')}</p>`;
    btn.textContent = rotulo;
  } finally {
    btn.disabled = false;
    res.hidden = false;
  }
}

/** Indicador (só leitura) de consentimento LGPD do aluno. @param {any} a */
async function carregarConsentimentoAluno(a) {
  const alvoId = a.id;
  const el = $('#lgpd-tag'); if (!el) return;
  const email = (a.email || '').trim().toLowerCase();
  if (!email) { el.innerHTML = 'Consentimento LGPD: <span class="semdado">sem e-mail cadastrado</span>'; return; }
  let c = null;
  try { c = await carregarConsentimentoLGPD(email); } catch (e) { console.warn('LGPD:', /** @type {any} */ (e)?.code || e); }
  if (!$('#lgpd-tag') || estado.alunoAtual?.id !== alvoId) return; // trocou de aluno enquanto carregava
  if (c && c.aceitoEm) {
    const d = new Date(c.aceitoEm).toLocaleDateString('pt-BR');
    $('#lgpd-tag').innerHTML = `Consentimento LGPD: <span class="ok">✓ aceito em ${d}</span>`;
  } else {
    $('#lgpd-tag').innerHTML = 'Consentimento LGPD: <span class="pendente">⚠ ainda não aceito</span>';
  }
}

/** O conteúdo da aba (sem os eventos). @param {any} a @param {{ todos?: any[] }} [o] */
export function htmlAbaDados(a, o = {}) {
  return `
    <div class="lgpd-tag" id="lgpd-tag">Consentimento LGPD: <span>verificando…</span></div>
    <div class="acesso-aluno" id="acesso-aluno"></div>
    <form id="form-dados">
      ${formDadosHTML(a, o)}
      <div class="form-actions">
        <button class="btn" type="submit">Salvar alterações</button>
        <span class="saved-flag" data-saved>Salvo ✓</span>
        <span style="flex:1"></span>
        <button class="btn danger btn-sm" type="button" id="btn-excluir-aluno">Excluir aluno</button>
      </div>
    </form>`;
}

/** Desenha a aba Dados do aluno e liga os eventos. @param {any} a */
function renderDados(a) {
  const painel = $('#tab-dados'); if (!painel) return;
  painel.innerHTML = htmlAbaDados(a);
  carregarConsentimentoAluno(a);
  renderAcessoAluno(a);
  const form = $('#form-dados');
  wireForm(form);
  form.addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const antes = db.obter(a.id);
    const novo = lerForm(form);
    // A gravação publica o Portal e emite 'alunos-mudaram': a lista e o
    // cabeçalho se atualizam por lá (boot.js → db.aoGravar).
    db.atualizar(a.id, novo);
    regFicha(antes, novo);
    estado.alunoAtual = db.obter(a.id);
    const flag = $('[data-saved]', form); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1600);
    // O e-mail salvo é o que habilita o "Criar acesso", e o app liberado muda o título.
    renderAcessoAluno(estado.alunoAtual);
  });
  $('#btn-excluir-aluno').addEventListener('click', async () => {
    if (await confirmar({ titulo: 'Excluir aluno?', texto: `Excluir <b>${esc(a.nome || a.id)}</b>? Esta ação <b>não pode ser desfeita</b>.`, ok: 'Excluir', perigo: true })) {
      apagarFotosDoAluno(a);
      // LGPD: a ficha sai, e o rastro dela na aba Registros sai junto.
      eventos.apagarEventosDoAluno(a.id);
      db.remover(a.id);
      emit(EVENTOS.VOLTAR_LISTA);
    }
  });
}

/** Liga a aba ao barramento. Chamar uma vez, antes do resto do app. */
export function iniciarTabDados() {
  let desenhada = false;
  on(EVENTOS.PERFIL_ABERTO, () => { desenhada = false; });
  on(EVENTOS.ABRIR_ABA, (nome) => {
    if (nome !== 'dados' || desenhada || !estado.alunoAtual) return;
    renderDados(estado.alunoAtual);
    desenhada = true;
  });
}
