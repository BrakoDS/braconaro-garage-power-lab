// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/ui-acoes-aluno.test.js
 *
 * As ações do menu ⋯ da ficha: o modal de acesso ao Portal (cada fase) e a
 * confirmação de exclusão pelo ID. Só o HTML e as regras — a fiação com o DOM
 * é conferida na vitrine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlModalAcesso, faseInicialAcesso, htmlExcluir, confirmaExclusao } from './ui-acoes-aluno.js?v=24';

const ana = { id: 'Ana01', nome: 'Ana Lima', email: 'ana@box.com', telefone: '14999990000' };

/* ---------- acesso ---------- */

test('acesso: a fase inicial depende do e-mail salvo (e do pendente no rascunho)', () => {
  assert.deepEqual(faseInicialAcesso(ana), { fase: 'pronto' });
  assert.deepEqual(faseInicialAcesso({ ...ana, email: '' }), { fase: 'sem-email' });
  assert.deepEqual(faseInicialAcesso(ana, ' ANA@box.com '), { fase: 'pronto' }, 'maiúscula e espaço não contam');
  assert.deepEqual(faseInicialAcesso(ana, 'outra@box.com'), { fase: 'email-nao-salvo' },
    'o servidor confere o e-mail SALVO: digitado e não salvo daria um erro sem explicação');
});

test('acesso: sem e-mail, leva ao card Contato em vez de oferecer um botão que falharia', () => {
  const h = htmlModalAcesso({ ...ana, email: '' }, { fase: 'sem-email' });
  assert.match(h, /não tem e-mail/);
  assert.match(h, /data-acesso="ir-contato"/);
  assert.doesNotMatch(h, /data-acesso="gerar"/);
});

test('acesso: e-mail alterado e não salvo pede para salvar antes', () => {
  const h = htmlModalAcesso(ana, { fase: 'email-nao-salvo' });
  assert.match(h, /ainda não foi salvo/);
  assert.doesNotMatch(h, /data-acesso="gerar"/);
});

test('acesso: pronto — Criar acesso na primeira vez, Gerar novo link depois', () => {
  const novo = htmlModalAcesso(ana, { fase: 'pronto' });
  assert.match(novo, /data-acesso="gerar">Criar acesso</);
  assert.match(novo, /Portal do Aluno · <b>ana@box\.com<\/b>/);
  const ja = htmlModalAcesso({ ...ana, appLiberado: true, acessoEnviadoEm: Date.UTC(2026, 9, 1, 15) }, { fase: 'pronto' });
  assert.match(ja, /data-acesso="gerar">Gerar novo link</);
  assert.match(ja, /Link enviado em 01\/10\/2026/);
  assert.match(ja, /Portal e app ·/);
});

test('acesso: gerando trava o botão; erro mostra o motivo e oferece de novo', () => {
  assert.match(htmlModalAcesso(ana, { fase: 'gerando' }), /data-acesso="gerar" disabled>Gerando…</);
  const erro = htmlModalAcesso(ana, { fase: 'erro', mensagem: 'Sem conexão <com> o servidor' });
  assert.match(erro, /role="alert">Sem conexão &lt;com&gt; o servidor</);
  assert.match(erro, />Tentar de novo</);
});

test('acesso: pronto — WhatsApp com a mensagem, e Copiar; sem telefone, só Copiar', () => {
  const ok = htmlModalAcesso(ana, { fase: 'ok', criado: true, texto: 'oi', wa: 'https://api.whatsapp.com/send?phone=55149&text=oi' });
  assert.match(ok, /Conta criada/);
  assert.match(ok, /href="https:\/\/api\.whatsapp\.com\/send\?phone=55149&amp;text=oi"/);
  assert.match(ok, /data-acesso="copiar"/);
  const semTel = htmlModalAcesso(ana, { fase: 'ok', criado: false, texto: 'oi', wa: '' });
  assert.match(semTel, /já tinha conta/);
  assert.match(semTel, /Sem telefone na ficha/);
  assert.doesNotMatch(semTel, /Enviar pelo WhatsApp/);
});

/* ---------- excluir ---------- */

test('excluir: diz o que se perde e pede o ID', () => {
  const h = htmlExcluir(ana);
  assert.match(h, /ficha de <b>Ana Lima<\/b>/);
  assert.match(h, /Não dá para desfazer/);
  assert.match(h, /<code class="ex-id">Ana01<\/code>/);
  assert.match(h, /id="excluir-id"[^>]*autocomplete="off"/);
  assert.doesNotMatch(htmlExcluir({ id: '<b>', nome: '<script>' }), /<script>|<code class="ex-id"><b>/);
});

test('excluir: só o ID exato confirma', () => {
  assert.equal(confirmaExclusao('Ana01', 'Ana01'), true);
  assert.equal(confirmaExclusao('  Ana01 ', 'Ana01'), true, 'espaço nas pontas não conta');
  assert.equal(confirmaExclusao('ana01', 'Ana01'), false);
  assert.equal(confirmaExclusao('Ana0', 'Ana01'), false);
  assert.equal(confirmaExclusao('', 'Ana01'), false);
  assert.equal(confirmaExclusao('007', '007'), true);
});

/* ---------- a marcação ---------- */

test('index.html: o topo preso envolve cabeçalho e abas, e os dois modais existem', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="perfil-topo" id="perfil-topo">\s*<header class="perfil-cab" id="perfil-cab"><\/header>\s*<nav class="perfil-abas"/);
  assert.match(html, /id="modal-acesso"[\s\S]*id="modal-acesso-body"/);
  assert.match(html, /<form id="form-excluir">[\s\S]*id="modal-excluir-body"[\s\S]*id="btn-excluir-ok" type="submit" disabled/,
    'o botão de excluir nasce desligado');
});
