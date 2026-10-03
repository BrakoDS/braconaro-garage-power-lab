// @ts-check
/**
 * Guarda estática das regras de segurança (firestore.rules e storage.rules).
 *
 * Não substitui o emulador, que precisa de Java e não roda em toda máquina. Este
 * teste trava a REGRESSÃO que já aconteceu: "coach" definido como "quem tem um
 * documento gestao/{uid}", que qualquer aluno logado conseguia criar para si e,
 * com isso, ler os dados de saúde de todos os alunos.
 *
 * Rodar: node --test compartilhado/firebase/regras.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const firestore = ler('firestore.rules');
const storage = ler('storage.rules');

/** Tira os comentários, para o teste olhar só o que o Firebase executa. */
const codigo = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/** Os UIDs da lista de `ehCoach()` de um arquivo. */
function uidsDoCoach(s) {
  const m = codigo(s).match(/function ehCoach\(\)\s*\{[^}]*request\.auth\.uid in \[([^\]]*)\]/);
  assert.ok(m, 'ehCoach() precisa checar request.auth.uid contra uma lista fixa');
  return m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('ninguem vira coach por ter um documento: nenhuma regra usa exists()', () => {
  // exists(gestao/uid), exists(coaches/uid), exists(academia/uid): todos
  // auto-provisionáveis por qualquer conta logada.
  assert.doesNotMatch(codigo(firestore), /exists\(/);
  assert.doesNotMatch(codigo(storage), /firestore\.(exists|get)\(/);
});

test('a lista de coach e a mesma nas duas regras, e nao esta vazia nem com o marcador', () => {
  const f = uidsDoCoach(firestore);
  const s = uidsDoCoach(storage);
  assert.ok(f.length > 0);
  assert.deepEqual(s, f, 'coach novo entra nos dois arquivos');
  for (const uid of f) assert.match(uid, /^[A-Za-z0-9]{20,128}$/, `UID com cara de UID: ${uid}`);
});

test('documentos de coach exigem ehCoach, nao so ser o dono', () => {
  // A regra antiga era `request.auth.uid == uid` sozinha: o aluno é dono do
  // próprio gestao/{uid}, criava o documento e passava a valer como coach.
  const c = codigo(firestore);
  for (const col of ['coaches', 'montadorIndividual', 'gestao', 'academia']) {
    const bloco = c.split(`match /${col}/{uid} {`)[1];
    assert.ok(bloco, `match /${col}/{uid} existe`);
    const ate = bloco.split(/\n    match \//)[0];
    for (const allow of ate.match(/allow [^;]+;/g) || []) {
      assert.match(allow, /ehCoachDono\(uid\)/, `${col}: ${allow.trim()}`);
    }
  }
  assert.doesNotMatch(c, /allow [^;]*:\s*if request\.auth != null && request\.auth\.uid == uid;/);
});

// Os clientes gravam o id em minúsculas; um login "Aluno@…" comparado de forma exata era barrado
// em tudo. Nenhuma regra pode voltar a comparar o e-mail sem o .lower() dos dois lados.
test('o e-mail do aluno e comparado sem diferenca de maiusculas em todas as regras', () => {
  for (const [nome, regras] of [['firestore.rules', firestore], ['storage.rules', storage]]) {
    assert.doesNotMatch(codigo(regras), /token\.email\s*==\s*email\b/, nome);
    assert.doesNotMatch(codigo(regras), /token\.email\.lower\(\)\s*==\s*email(?!\.lower\(\))/, nome);
  }
});

test('o aluno continua limitado ao proprio e-mail no portal', () => {
  const c = codigo(firestore);
  const portal = c.split('match /portal/{email} {')[1].split('}')[0];
  assert.match(portal, /allow read: if request\.auth != null && request\.auth\.token\.email\.lower\(\) == email\.lower\(\);/);
  assert.match(portal, /allow write: if ehCoach\(\);/, 'só o coach escreve (é o que protege o appLiberado)');
});

test('mural de recordes: o grupo prs so e lido pelo coach, e ninguem escreve por ele', () => {
  // A consulta de grupo (collectionGroup('prs')) alcança a subcoleção de TODOS
  // os alunos: aberta para aluno, um leria os PRs dos outros; com escrita, a
  // validação de prValido() ficaria para trás.
  const bloco = codigo(firestore).split('match /{path=**}/prs/{id} {')[1];
  assert.ok(bloco, 'match /{path=**}/prs/{id} existe');
  assert.deepEqual(bloco.split('}')[0].match(/allow [^;]+;/g), ['allow read: if ehCoach();']);
});

test('chat: apagar e so delete, e nenhum update grava apagado (Etapa 17.1)', () => {
  // O apagar por update da 15.2 (texto '', apagado: true) saiu quando a Central
  // migrou para o delete. Se o ramo voltar, a mensagem "apagada" fica no
  // Firestore e o texto dela pode voltar para a tela de quem ainda lê o legado.
  const c = codigo(firestore);
  const chats = c.split('match /chats/{email} {')[1];
  assert.ok(chats, 'match /chats/{email} existe');
  const [resumo, mensagens] = chats.split('match /mensagens/{id} {');
  assert.ok(mensagens, 'match /mensagens/{id} existe dentro de chats');
  const allows = (/** @type {string} */ s) => s.split('}')[0].match(/allow [^;]+;/g) || [];
  assert.ok(allows(resumo).includes('allow delete: if ehAlunoDono(email) || ehCoach();'), 'o resumo sai com a conversa');
  assert.ok(allows(mensagens).includes('allow delete: if ehAlunoDono(email) || ehCoach();'), 'os dois lados apagam a mensagem');

  const autor = c.split('function alteracaoDoAutor(email) {')[1]?.split('\n    }')[0];
  assert.ok(autor, 'function alteracaoDoAutor existe');
  assert.match(autor, /affectedKeys\(\)\.hasOnly\(\['texto', 'editado'\]\)/, 'o autor so troca o texto');
  assert.deepEqual(autor.match(/apagado[^\n]*/g), ["apagado', false) != true"],
    'apagado so aparece na guarda: a apagada antiga nao volta por edicao');
  assert.doesNotMatch(c.split('match /chats/{email} {')[0].split('function mensagemChatValida')[1] || '', /d\.apagado/,
    'nenhuma funcao do chat aceita apagado no documento novo');
});

test('chat: a midia da mensagem so aponta para o nosso bucket, na pasta chats (Etapa 17.2)', () => {
  // Quem recebe abre o mediaUrl/thumbUrl. Sem a trava, uma mensagem "📷 Foto"
  // poderia levar a qualquer endereço; sem o hasOnly, qualquer campo entraria.
  const c = codigo(firestore);
  const valida = c.split('function mensagemChatValida(email) {')[1]?.split('\n    }')[0];
  assert.ok(valida, 'function mensagemChatValida existe');
  assert.match(valida, /hasOnly\(\['texto', 'remetente', 'timestamp', 'tipo', 'mediaUrl', 'duracao', 'thumbUrl'\]\)/);
  assert.match(valida, /midiaDaMensagemValida\(d\)/, 'a criação passa pela validação da mídia');

  // Do texto cru: o `codigo()` cortaria o `https://` como se fosse comentário.
  const url = firestore.split('function urlChatValida(url) {')[1]?.split('\n    }')[0];
  assert.ok(url, 'function urlChatValida existe');
  assert.ok(url.includes("'https://firebasestorage[.]googleapis[.]com/v0/b/projeto-garage-f0a2f[.]firebasestorage[.]app/o/chats%2F"),
    'download URL do bucket do projeto, na pasta chats/');

  const midia = c.split('function midiaDaMensagemValida(d) {')[1]?.split('\n    }')[0];
  assert.ok(midia, 'function midiaDaMensagemValida existe');
  assert.match(midia, /tipo in \['texto', 'imagem', 'video', 'audio'\]/);
  assert.match(midia, /urlChatValida\(d\.mediaUrl\)/, 'mídia exige o mediaUrl');
  assert.match(midia, /urlChatValida\(d\.thumbUrl\)/, 'a capa também é do bucket');

  const autor = c.split('function alteracaoDoAutor(email) {')[1]?.split('\n    }')[0];
  assert.match(autor || '', /antes\.get\('tipo', 'texto'\) == 'texto'/, 'mídia não se edita: o texto dela é o rótulo');
});

test('chat: no Storage os dois lados leem e apagam, e so sobem arquivo novo nos tetos do app (Etapa 17.2)', () => {
  // Com `update`, um lado trocaria o arquivo por trás da mensagem que o outro
  // mandou (a URL continua a mesma). Os tetos são os de LIMITES_MIDIA no app.
  const s = codigo(storage);
  const bloco = s.split('match /chats/{email}/{arquivo} {')[1];
  assert.ok(bloco, 'match /chats/{email}/{arquivo} existe');
  assert.deepEqual(bloco.split('}')[0].match(/allow [^;]+;/g), [
    'allow read, delete: if ehAlunoDono(email) || ehCoach();',
    'allow create: if (ehAlunoDono(email) || ehCoach()) && midiaChatValida(arquivo);',
  ]);

  const dono = s.split('function ehAlunoDono(email) {')[1]?.split('}')[0];
  assert.match(dono || '', /request\.auth != null && request\.auth\.token\.email\.lower\(\) == email\.lower\(\);/);

  const midia = s.split('function midiaChatValida(arquivo) {')[1]?.split('\n    }')[0];
  assert.ok(midia, 'function midiaChatValida existe');
  const tetos = [...midia.matchAll(/contentType\.matches\('(\w+)\/\.\*'\)\s*&& request\.resource\.size <= (\d+) \* 1024 \* 1024/g)]
    .map(([, tipo, mb]) => [tipo, Number(mb)]);
  assert.deepEqual(tetos, [['image', 5], ['audio', 10], ['video', 50]]);
});
