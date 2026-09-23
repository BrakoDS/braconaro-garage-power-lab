// @ts-check
/**
 * O convite de acesso que o coach manda para o aluno.
 *
 * Rodar: node --test coach/gestao-de-alunos/acesso-aluno.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkWhatsApp, mensagemConvite } from './acesso-aluno.js';

const LINK = 'https://projeto-garage-f0a2f.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=abc';

test('conta nova: chama pelo primeiro nome, leva o link e o e-mail de login', () => {
  const m = mensagemConvite('Ana Lima', 'ana@box.com', LINK, true);
  assert.match(m, /^Oi, Ana! Seu acesso/);
  assert.ok(m.includes(LINK), 'o link vai inteiro');
  assert.ok(m.includes('ana@box.com'), 'o aluno sabe com qual e-mail entrar');
  assert.match(m, /1 hora/, 'avisa que o link vence');
});

test('conta que ja existia: a mensagem fala em link novo, nao em acesso novo', () => {
  const m = mensagemConvite('Ana', 'ana@box.com', LINK, false);
  assert.match(m, /link novo/);
  assert.doesNotMatch(m, /está pronto/);
});

test('sem nome na ficha, a saudacao nao fica pela metade', () => {
  assert.match(mensagemConvite('', 'a@b.com', LINK, true), /^Oi! /);
});

test('WhatsApp: DDI do Brasil quando falta, e nada sem telefone utilizavel', () => {
  assert.match(linkWhatsApp('(14) 99866-0352', 'oi'), /^https:\/\/wa\.me\/5514998660352\?text=oi$/);
  assert.match(linkWhatsApp('+55 14 99866-0352', 'oi'), /^https:\/\/wa\.me\/5514998660352\?/);
  assert.equal(linkWhatsApp('', 'oi'), '');
  assert.equal(linkWhatsApp('1234', 'oi'), '');
});

test('o texto vai codificado: o & do link nao corta a mensagem no WhatsApp', () => {
  const url = linkWhatsApp('14998660352', mensagemConvite('Ana', 'a@b.com', LINK, true));
  const texto = decodeURIComponent(url.split('?text=')[1]);
  assert.ok(texto.includes(LINK));
  assert.ok(!url.split('?text=')[1].includes('&'), 'nenhum & cru na query');
});
