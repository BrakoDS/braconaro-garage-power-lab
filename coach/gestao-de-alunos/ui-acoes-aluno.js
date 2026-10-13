// @ts-check
/**
 * As ações do menu ⋯ do cabeçalho da ficha: Gerar acesso ao Portal e Excluir
 * aluno. Saíram da aba Dados (o botão de excluir morava no rodapé do
 * formulário, colado no Salvar — um toque errado no celular apagava um aluno).
 *
 *  - 'gerar-acesso'  abre o modal de acesso: cria a conta (ou um link novo para
 *                    quem já tem) pela callable `criarAcessoAluno` e oferece
 *                    WhatsApp e Copiar. É o mesmo fluxo que o botão da aba Dados
 *                    abre — um só lugar com a regra.
 *  - 'excluir-aluno' abre a confirmação: o botão só acende depois que o coach
 *                    digita o ID do aluno.
 *
 * O HTML de cada estado é puro (testado em ui-acoes-aluno.test.js); a fiação
 * fica em `iniciarAcoesAluno`.
 */
import * as db from './db.js?v=17';
import { esc } from './util/formato.js?v=17';
import { $, abrirModal, fecharModal } from './util/dom.js?v=17';
import { estado, on, emit, EVENTOS } from './estado.js?v=17';
import { apagarFotosDoAluno } from './ui-fotos.js?v=17';
import * as eventos from './eventos.js?v=17';
import { criarAcesso as criarAcessoReal, linkWhatsApp, mensagemConvite } from './acesso-aluno.js?v=17';
import { valorPendente } from './ui-salvar-global.js?v=17';

/* ============================================================
   Acesso ao Portal — HTML (puro)
   ============================================================ */

/**
 * @typedef {{ fase: 'sem-email' } | { fase: 'email-nao-salvo' } | { fase: 'pronto' } | { fase: 'gerando' }
 *   | { fase: 'ok', criado: boolean, texto: string, wa: string } | { fase: 'erro', mensagem: string }} FaseAcesso
 */

/**
 * O corpo do modal de acesso, em cada fase.
 * @param {any} a a ficha (salva) @param {FaseAcesso} f
 */
export function htmlModalAcesso(a, f) {
  const email = String(a?.email || '').trim();
  const enviado = a?.acessoEnviadoEm ? new Date(a.acessoEnviadoEm).toLocaleDateString('pt-BR') : '';
  const alvo = `<p class="ac-alvo">${a?.appLiberado === true ? 'Portal e app' : 'Portal do Aluno'} · <b>${esc(email || 'sem e-mail')}</b></p>`;
  const rotulo = enviado ? 'Gerar novo link' : 'Criar acesso';
  if (f.fase === 'sem-email') {
    return `<p class="dlg-texto">Esta ficha não tem e-mail. Preencha e salve o e-mail no card <b>Contato e cadastro</b> (aba Geral) para criar o acesso.</p>
      <div class="ac-botoes"><button class="btn btn-sm" type="button" data-acesso="ir-contato">Ir para Contato</button></div>`;
  }
  if (f.fase === 'email-nao-salvo') {
    return `${alvo}<p class="dlg-texto">O e-mail da ficha mudou e ainda não foi salvo. Salve a ficha (botão <b>Salvar</b> no rodapé) e gere o acesso depois — o servidor confere o e-mail salvo.</p>`;
  }
  if (f.fase === 'ok') {
    return `${alvo}<p class="acesso-ok">${f.criado ? '✓ Conta criada.' : '✓ O aluno já tinha conta — a senha dele não mudou; o link novo permite trocar.'} O link vale por 1 hora.</p>
      <div class="ac-botoes">
        ${f.wa ? `<a class="btn btn-sm" href="${esc(f.wa)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>` : '<span class="hint">Sem telefone na ficha — copie a mensagem e envie por onde preferir.</span>'}
        <button class="btn ghost btn-sm" type="button" data-acesso="copiar">Copiar mensagem</button>
      </div>`;
  }
  const dica = enviado
    ? `Link enviado em ${enviado}. Um link novo serve para quem esqueceu a senha — a conta não muda.`
    : 'Cria a conta de login e gera um link para o aluno definir a própria senha. Você não vê nem escolhe a senha.';
  const erro = f.fase === 'erro' ? `<p class="acesso-erro" role="alert">${esc(f.mensagem)}</p>` : '';
  const gerando = f.fase === 'gerando';
  return `${alvo}<p class="dlg-texto">${esc(dica)}</p>${erro}
    <div class="ac-botoes"><button class="btn btn-sm" type="button" data-acesso="gerar"${gerando ? ' disabled' : ''}>${gerando ? 'Gerando…' : (f.fase === 'erro' ? 'Tentar de novo' : rotulo)}</button></div>`;
}

/**
 * A fase em que o modal abre.
 * @param {any} a a ficha salva @param {string|null} [emailNoFormulario] o e-mail alterado e ainda não salvo, se houver
 * @returns {FaseAcesso}
 */
export function faseInicialAcesso(a, emailNoFormulario = null) {
  const salvo = String(a?.email || '').trim().toLowerCase();
  if (emailNoFormulario != null && emailNoFormulario.trim().toLowerCase() !== salvo) return { fase: 'email-nao-salvo' };
  return salvo ? { fase: 'pronto' } : { fase: 'sem-email' };
}

/* ============================================================
   Excluir — HTML (puro)
   ============================================================ */

/** O corpo da confirmação de exclusão. @param {any} a */
export function htmlExcluir(a) {
  return `
    <p class="dlg-texto">Isto apaga a ficha de <b>${esc(a.nome || a.id)}</b>, as fotos dela e o histórico da aba Registros. <b>Não dá para desfazer.</b></p>
    <div class="field">
      <label for="excluir-id">Para confirmar, digite o ID do aluno: <code class="ex-id">${esc(a.id)}</code></label>
      <input id="excluir-id" name="confirmacao" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
    </div>`;
}

/** O que foi digitado confirma a exclusão? (o ID exato; espaços nas pontas não contam) @param {string} digitado @param {string} id */
export function confirmaExclusao(digitado, id) {
  return String(digitado || '').trim() === String(id);
}

/* ============================================================
   DOM
   ============================================================ */

/** @type {{ criarAcesso: (email: string) => Promise<{criado: boolean, link: string, nome: string}> }} */
let deps = { criarAcesso: criarAcessoReal };

/** O aluno do modal aberto (o modal não pode trocar de aluno no meio). */
let alvoId = '';
/** O texto do convite gerado (para o Copiar). */
let convite = '';

/** @param {FaseAcesso} f */
function desenharAcesso(f) {
  const a = db.obter(alvoId);
  const corpo = $('#modal-acesso-body');
  if (a && corpo) corpo.innerHTML = htmlModalAcesso(a, f);
}

/** @param {string} id */
function abrirAcesso(id) {
  const a = db.obter(id); if (!a) return;
  alvoId = id; convite = '';
  // E-mail mexido e não salvo: o servidor conferiria o antigo.
  const pendente = valorPendente('email');
  desenharAcesso(faseInicialAcesso(a, pendente === undefined ? null : String(pendente || '')));
  abrirModal('modal-acesso');
}

async function gerar() {
  const a = db.obter(alvoId); if (!a) return;
  const email = String(a.email || '').trim().toLowerCase();
  desenharAcesso({ fase: 'gerando' });
  try {
    // O servidor confere o e-mail NA NUVEM: a ficha recém-salva precisa já estar lá.
    await db.enviarAgora().catch(() => undefined);
    const r = await deps.criarAcesso(email);
    db.atualizar(a.id, { acessoEnviadoEm: Date.now() });
    convite = mensagemConvite(r.nome || a.nome || '', email, r.link, r.criado);
    desenharAcesso({ fase: 'ok', criado: !!r.criado, texto: convite, wa: linkWhatsApp(a.telefone, convite) });
  } catch (e) {
    desenharAcesso({ fase: 'erro', mensagem: /** @type {any} */ (e)?.message || 'Não deu para criar o acesso.' });
  }
}

/** @param {string} id */
function abrirExcluir(id) {
  const a = db.obter(id); if (!a) return;
  alvoId = id;
  $('#modal-excluir-body').innerHTML = htmlExcluir(a);
  const ok = /** @type {HTMLButtonElement} */ ($('#btn-excluir-ok'));
  ok.disabled = true;
  abrirModal('modal-excluir');
  setTimeout(() => $('#excluir-id')?.focus(), 50);
}

/**
 * Liga o modal de acesso e a confirmação de exclusão ao barramento. Chamar uma
 * vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (a vitrine troca a callable)
 */
export function iniciarAcoesAluno(d = {}) {
  deps = { ...deps, ...d };
  on(EVENTOS.GERAR_ACESSO, (id) => { if (id) abrirAcesso(id); });
  on(EVENTOS.EXCLUIR_ALUNO, (id) => { if (id) abrirExcluir(id); });

  $('#modal-acesso-body')?.addEventListener('click', async (/** @type {any} */ e) => {
    const b = e.target.closest('[data-acesso]'); if (!b) return;
    if (b.dataset.acesso === 'gerar') gerar();
    else if (b.dataset.acesso === 'ir-contato') { fecharModal('modal-acesso'); emit(EVENTOS.ABRIR_ABA, 'geral'); }
    else if (b.dataset.acesso === 'copiar') {
      try { await navigator.clipboard.writeText(convite); b.textContent = 'Copiado ✓'; } catch { b.textContent = 'Não deu para copiar'; }
    }
  });

  $('#form-excluir')?.addEventListener('input', () => {
    const ok = /** @type {HTMLButtonElement} */ ($('#btn-excluir-ok'));
    const campo = /** @type {HTMLInputElement|null} */ ($('#excluir-id'));
    if (ok) ok.disabled = !confirmaExclusao(campo?.value || '', alvoId);
  });
  $('#form-excluir')?.addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const campo = /** @type {HTMLInputElement|null} */ ($('#excluir-id'));
    const a = db.obter(alvoId);
    if (!a || !confirmaExclusao(campo?.value || '', a.id)) return;
    apagarFotosDoAluno(a);
    // LGPD: a ficha sai, e o rastro dela na aba Registros sai junto.
    eventos.apagarEventosDoAluno(a.id);
    db.remover(a.id);
    fecharModal('modal-excluir');
    if (estado.alunoAtual?.id === a.id) emit(EVENTOS.VOLTAR_LISTA);
  });
}
