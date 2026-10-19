/**
 * Confere o check-in pela uGym (FitControl), sem internet e sem Firebase:
 *
 *     npm run checar:ugym
 *
 *   1) as REGRAS (`ugym.ts`): o envelope da API, a leitura de aulas, reservas e
 *      membros (com a forma real capturada no painel em 17/10/2026), a janela
 *      das aulas, o check-in que vira item e a senha em RSA;
 *   2) o CLIENTE REAL (`clienteFitControl`) falando HTTP com um FitControl
 *      falso local — login com a senha cifrada, token sem "Bearer", `language`,
 *      paginação, sessão expirada, tempo esgotado, e a senha nunca no erro;
 *   3) a RODADA (`sincronizarCheckinsUgym`) com um banco em memória — janela,
 *      cache das aulas, livro contra duplicata, pendentes e erros.
 */
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { relogioDoBox, type Relogio } from './presenca';
import {
  abrirPagina, abrirResposta, aulasNaJanela, checkinsNovos, cifrarSenha, emailsDosMembros, ErroUgym, lerAulas, lerReservas,
  podarLivro, relogioDoTexto, somarMinutos, type AulaUgym, type ItemCheckinUgym, type ReservaUgym,
} from './ugym';
import { clienteFitControl, type ClienteUgym } from './ugym-cliente';
import { lerEstadoDoDoc, sincronizarCheckinsUgym, type EstadoUgym, type RepoUgym, type UltimaRodada } from './ugym-servico';

let falhas = 0;
function ok(condicao: boolean, descricao: string, detalhe = ''): void {
  if (condicao) console.log(`  ✓ ${descricao}`);
  else { falhas++; console.log(`  ✗ ${descricao}${detalhe ? `\n      ${detalhe}` : ''}`); }
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
async function lanca(f: () => Promise<unknown> | unknown): Promise<unknown> {
  try { await f(); return null; } catch (e) { return e; }
}

type Dados = Record<string, unknown>;
const UID = 'COACH';
const HOJE = '2026-10-20';

/* A forma real das linhas (17/10/2026), com dados fictícios. */
const aulaReal = (id: number, ini: string, fim: string): Dados => ({
  id, classShopId: 353, className: `T ${ini.slice(11)}`, classTeacherId: 321, classStartDate: ini, classStartTime: null,
  classEndDate: fim, classEndTime: null, classMember: 6, classJoinMember: 1, classStatus: 1, classCheckinMember: 0,
  classSignStartDate: `${ini.slice(0, 10)} 00:00`, classSignEndDate: ini, qrUrl: null, qrExpireDatetime: null,
});
const reservaReal = (id: number, aula: number, aluno: number, ini: string, checkin: string | null): Dados => ({
  id, memberClassId: aula, memberShopId: 353, memberStudentId: aluno, memberStudentNoid: `Aluno${aluno}`, memberClassName: `T ${ini.slice(11)}`,
  memberTeacherId: 321, memberClassStartDate: ini, memberClassEndDate: `${ini.slice(0, 10)} 20:10`, memberClassPrice: 1.0,
  memberDate: `${ini.slice(0, 10)} 08:00:00`, memberCheckinDate: checkin,
});
const membroReal = (id: number, email: string | null): Dados => ({ studentId: id, studentNoid: `Aluno${id}`, studentNickname: 'X', studentEmail: email });

async function main(): Promise<void> {

/* ================================================================== *
 * 1) As regras
 * ================================================================== */

console.log('\nO ENVELOPE DA API\n');
ok(igual(abrirResposta({ errcode: 0, data: { a: 1 }, errmsg: 'Success' }), { a: 1 }), 'errcode 0 devolve data');
{
  const e2001 = await lanca(() => abrirResposta({ errcode: 2001, errmsg: 'token expired' })) as ErroUgym;
  const e3001 = await lanca(() => abrirResposta({ errcode: 3001 })) as ErroUgym;
  const e500 = await lanca(() => abrirResposta({ errcode: 500, errmsg: 'falhou' })) as ErroUgym;
  const e401 = await lanca(() => abrirResposta({ code: 401 })) as ErroUgym;
  const sem = await lanca(() => abrirResposta({ data: [] })) as ErroUgym;
  ok(e2001?.motivo === 'sessao' && e3001?.motivo === 'sessao' && e401?.motivo === 'sessao', '2001, 3001 e code 401 são sessão expirada (como no painel)');
  ok(e500?.motivo === 'api' && e500.message === 'falhou', 'outro errcode é recusa da API, com a mensagem dela');
  ok(sem?.motivo === 'formato', 'sem errcode nem code: a forma mudou');
  ok(igual(abrirResposta({ code: 200, data: 7 }), 7), 'o formato { code: 200 } também vale');
}
ok(abrirPagina({ list: [{}, {}], total: 5 }).total === 5 && abrirPagina({ list: [] }).total === 0, 'a página traz a lista e o total');
ok((await lanca(() => abrirPagina({ rows: [] })) as ErroUgym)?.motivo === 'formato', 'sem data.list: para, em vez de ler errado');

console.log('\nAULAS, RESERVAS E MEMBROS\n');
ok(igual(relogioDoTexto('2026-10-14 21:57:36', relogioDoBox), { hoje: '2026-10-14', agora: '21:57' }), 'data com segundos vira dia e hora de parede');
ok(igual(relogioDoTexto('2026-10-14T07:05', relogioDoBox), { hoje: '2026-10-14', agora: '07:05' }), 'com T também');
ok(igual(relogioDoTexto(Date.UTC(2026, 9, 14, 22, 0) / 1000, relogioDoBox), { hoje: '2026-10-14', agora: '19:00' }), 'número em segundos: no fuso do box');
ok(igual(relogioDoTexto(Date.UTC(2026, 9, 14, 22, 0), relogioDoBox), { hoje: '2026-10-14', agora: '19:00' }), 'número em milissegundos também');
ok(relogioDoTexto(null, relogioDoBox) === null && relogioDoTexto('', relogioDoBox) === null && relogioDoTexto('ontem', relogioDoBox) === null, 'null, vazio ou lixo: sem hora');

console.log('\nO FUSO: A GRADE É HORA DE PAREDE, O CHECK-IN É UTC\n');
ok(igual(relogioDoTexto('2026-10-19 10:11:23', relogioDoBox, 'utc'), { hoje: '2026-10-19', agora: '07:11' }),
  'o caso real de 19/10: o check-in "10:11" (UTC) é 07:11 no box');
ok(igual(relogioDoTexto('2026-10-19 10:11:23', relogioDoBox), { hoje: '2026-10-19', agora: '10:11' }), 'a grade (padrão) continua hora de parede');
ok(igual(relogioDoTexto('2026-10-21 00:28:00', relogioDoBox, 'utc'), { hoje: '2026-10-20', agora: '21:28' }),
  'aula da noite: 00:28 UTC do dia 21 ainda é 21:28 do dia 20 no box');
ok(igual(relogioDoTexto('2026-10-19 02:59', relogioDoBox, 'utc'), { hoje: '2026-10-18', agora: '23:59' }), 'antes das 03:00 UTC é o dia anterior');
ok(igual(relogioDoTexto('2026-10-19T10:11:00Z', relogioDoBox), { hoje: '2026-10-19', agora: '07:11' }), 'com Z é instante, em qualquer fonte');
ok(igual(relogioDoTexto('2026-10-19T07:11:00-03:00', relogioDoBox, 'utc'), { hoje: '2026-10-19', agora: '07:11' }), 'com −03:00 também: não desconta duas vezes');
ok(igual(relogioDoTexto('2026-10-19 10:11:00.123+0000', relogioDoBox), { hoje: '2026-10-19', agora: '07:11' }), '+0000 e milissegundos também');
ok(igual(relogioDoTexto(Date.UTC(2026, 9, 19, 10, 11) / 1000, relogioDoBox, 'utc'), { hoje: '2026-10-19', agora: '07:11' }), 'número é instante, em qualquer fonte');
{
  const aulas = lerAulas([aulaReal(138776, '2026-10-14 19:10', '2026-10-14 20:10'), { id: 1 }, { classStartDate: '2026-10-14 07:00' },
    { id: 2, classStartDate: '2026-10-14 07:00' }], relogioDoBox);
  ok(igual(aulas[0], { id: '138776', nome: 'T 19:10', dia: '2026-10-14', inicio: '19:10', fim: '20:10' }), 'a aula real vira { id, nome, dia, início, fim }');
  ok(aulas.length === 2 && aulas[1].fim === '08:00', 'sem id ou sem início, fora; sem fim, vale uma hora');
}
{
  const r = lerReservas([
    reservaReal(64045, 138776, 4468, '2026-10-14 19:10', null),
    reservaReal(64046, 138776, 4469, '2026-10-14 19:10', '2026-10-14 22:04:10'),
    { id: 1, memberClassId: 2 },
  ], relogioDoBox);
  ok(r.length === 2, 'reserva sem aluno ou sem aula fica de fora');
  ok(r[0].checkin === null && r[0].dia === '2026-10-14' && r[0].hora === '19:10' && r[0].alunoUgymId === '4468', 'só reservou: sem check-in');
  ok(igual(r[1].checkin, { hoje: '2026-10-14', agora: '19:04' }) && r[1].hora === '19:10',
    'com check-in: a hora dele no box (22:04 UTC = 19:04), e a aula segue 19:10');
}
{
  // Os check-ins reais de 19/10, com a forma da API: aula das 07:05 (parede), check-in 10:11 (UTC).
  const [r] = lerReservas([reservaReal(65005, 138668, 4470, '2026-10-19 07:05', '2026-10-19 10:11:23')], relogioDoBox);
  const n = checkinsNovos([r], { emails: { 4470: 'ana@x.com' }, vistos: {}, coachUid: UID, em: 1 });
  ok(n.itens[0]?.item.checkin.agora === '07:11' && n.itens[0]?.item.hora === '07:05', 'o item de checkinsUgym leva 07:11 — a hora local do check-in — e a aula das 07:05');
  const [noite] = lerReservas([reservaReal(65100, 138800, 4471, '2026-10-20 21:30', '2026-10-21 00:28:00')], relogioDoBox);
  const n2 = checkinsNovos([noite], { emails: { 4471: 'bia@x.com' }, vistos: {}, coachUid: UID, em: 1 });
  ok(n2.itens.length === 1 && n2.itens[0].item.checkin.hoje === '2026-10-20' && n2.itens[0].item.checkin.agora === '21:28',
    'aula das 21:30: o check-in não "cai no dia seguinte" e vira item');
}
ok(igual(emailsDosMembros([membroReal(1, ' Ana@X.com '), membroReal(2, null), membroReal(3, 'sem-arroba'), { id: 4, studentEmail: 'b@y.com.br' }]),
  { 1: 'ana@x.com', 4: 'b@y.com.br' }), 'membro → e-mail em minúsculas; sem e-mail válido, fora; `id` serve se não houver `studentId`');

console.log('\nA JANELA DAS AULAS\n');
{
  const aulas: AulaUgym[] = [
    { id: 'm', nome: '', dia: HOJE, inicio: '07:00', fim: '08:00' },
    { id: 'n', nome: '', dia: HOJE, inicio: '19:10', fim: '20:10' },
    { id: 'o', nome: '', dia: '2026-10-21', inicio: '07:00', fim: '08:00' },
  ];
  const ids = (agora: string) => aulasNaJanela(aulas, { hoje: HOJE, agora }).map((a) => a.id).join(',');
  ok(ids('06:29') === '' && ids('06:30') === 'm', 'abre 30 min antes do início');
  ok(ids('09:00') === 'm' && ids('09:01') === '', 'fecha 60 min depois do fim');
  ok(ids('13:00') === '', 'no meio do dia, nenhuma: a rodada não chama o FitControl');
  ok(ids('19:00') === 'n', 'aula de outro dia nunca entra');
  ok(somarMinutos('23:30', 60) === '23:59' && somarMinutos('07:00', 70) === '08:10', 'somar minutos não passa da meia-noite');
}

console.log('\nO CHECK-IN QUE VIRA ITEM\n');
{
  const r = (id: string, aluno: string, checkin: Relogio | null, dia = HOJE): ReservaUgym => ({ id, aulaId: 'A', alunoUgymId: aluno, noid: `N${aluno}`, dia, hora: '19:10', checkin });
  const ck = { hoje: HOJE, agora: '19:04' };
  const res = checkinsNovos([
    r('1', '10', ck), r('2', '11', null), r('3', '12', ck), r('4', '13', ck), r('5', '10', { hoje: '2026-10-21', agora: '07:00' }), r('1', '10', ck),
  ], { emails: { 10: 'ana@x.com', 13: 'bia@x.com' }, vistos: { 4: HOJE }, coachUid: UID, em: 99 });
  ok(res.itens.length === 1 && res.itens[0].id === 'ugym|1' && res.itens[0].email === 'ana@x.com', 'só o check-in novo, de aluno conhecido, vira item (e uma vez só)');
  ok(igual(res.itens[0].item, { coachUid: UID, origem: 'ugym', dia: HOJE, hora: '19:10', checkin: ck, aulaUgym: 'A', reservaUgym: '1', em: 99 }), 'o item leva a aula, a hora do check-in e o coach');
  ok(igual(res.vistos, { 1: HOJE }), 'a reserva aplicada entra no livro');
  ok(igual(Object.keys(res.pendentes), ['12']) && res.pendentes['12'].noid === 'N12', 'check-in sem e-mail vai para pendentes — e não entra no livro');
  ok(!res.itens.some((i) => i.item.reservaUgym === '2'), 'só reservou (sem check-in): nada');
  ok(!res.itens.some((i) => i.item.reservaUgym === '4'), 'reserva já no livro: nada');
  ok(!res.itens.some((i) => i.item.reservaUgym === '5'), 'check-in em outro dia que não o da aula: dado estranho, nada');
}
ok(igual(podarLivro({ a: '2026-10-12', b: '2026-10-13', c: HOJE, d: 7, e: 'lixo' }, HOJE), { b: '2026-10-13', c: HOJE }), 'o livro guarda só os últimos 7 dias');

console.log('\nA SENHA DO LOGIN\n');
const PAR = generateKeyPairSync('rsa', { modulusLength: 1024 });
const CHAVE_PUBLICA = PAR.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
/** O que o servidor da uGym faz: desfaz o base64 duplo e decifra PKCS#1 v1.5 (tirado à mão — o Node não decifra v1.5 por padrão). */
function decifrar(enviado: string): string {
  const rsa = Buffer.from(Buffer.from(enviado, 'base64').toString('utf8'), 'base64');
  const cru = privateDecrypt({ key: PAR.privateKey, padding: constants.RSA_NO_PADDING }, rsa);
  if (cru[0] !== 0 || cru[1] !== 2) throw new Error('não é PKCS#1 v1.5 tipo 2');
  return cru.subarray(cru.indexOf(0, 2) + 1).toString('utf8');
}
{
  const a = cifrarSenha('s3nh@ção', CHAVE_PUBLICA), b = cifrarSenha('s3nh@ção', CHAVE_PUBLICA);
  ok(decifrar(a) === 's3nh@ção', 'RSA PKCS#1 v1.5 + base64 duplo: o servidor recupera a senha (acentos inclusos)');
  ok(a !== b, 'cada login cifra diferente (o enchimento é aleatório)');
  ok(!a.includes('s3nh'), 'a senha não aparece no que é enviado');
  ok((await lanca(() => cifrarSenha('x', 'isto não é base64!')) as ErroUgym)?.motivo === 'formato', 'chave pública inválida: erro de formato, sem tentar');
  const real = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCXoiBneK1EymjnmYFdpE3uucYQaRRTN0U9LKIvjN1NDA2gGw5ht306KgJqhAbty8pITOaVr7KrNQaQF07Q/LcjZ38Ip5Mo59gBbYTm/Cnw+Jf8oOzC13WI9Vikr0wdiZNv89fnc8Pa4w0P2mN0++i+uR0dmjBKZOTxLkj6frF0+wIDAQAB';
  ok(Buffer.from(Buffer.from(cifrarSenha('x', real), 'base64').toString('utf8'), 'base64').length === 128, 'a chave real do FitControl (17/10) é aceita: 128 bytes de RSA-1024');
}

/* ================================================================== *
 * 2) O cliente real contra um FitControl falso
 * ================================================================== */

console.log('\nO CLIENTE CONTRA UM FITCONTROL FALSO\n');

const USUARIO = 'box@garage.test', SENHA = 'senha-de-teste-NAO-VAZAR';
interface Pedido { metodo: string; caminho: string; query: string; corpo: Dados; auth: string | undefined }

class FitControlFalso {
  pedidos: Pedido[] = [];
  tokens = 0;
  token = '';
  expirarProxima = false;
  demorarMs = 0;
  aulas: Dados[] = [];
  reservas: Dados[] = [];
  membros: Dados[] = [];
  private srv: Server | null = null;

  async subir(): Promise<string> {
    this.srv = createServer((req, res) => { void this.responder(req, res); });
    await new Promise<void>((r) => this.srv!.listen(0, '127.0.0.1', () => r()));
    return `http://127.0.0.1:${(this.srv.address() as AddressInfo).port}/api`;
  }
  async descer(): Promise<void> { await new Promise<void>((r) => this.srv!.close(() => r())); }

  private async responder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let bruto = '';
    for await (const c of req) bruto += c;
    const [caminho, query = ''] = (req.url ?? '').split('?');
    const corpo = bruto ? JSON.parse(bruto) as Dados : {};
    this.pedidos.push({ metodo: req.method ?? '', caminho, query, corpo, auth: req.headers.authorization });
    if (this.demorarMs) await new Promise((r) => setTimeout(r, this.demorarMs));
    const json = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const pagina = (todas: Dados[]) => {
      const de = Number(corpo.firstNum) || 0, n = Number(corpo.num) || 10;
      json({ errcode: 0, data: { list: todas.slice(de, de + n), count: Math.min(n, todas.length - de), total: todas.length }, errmsg: 'Success' });
    };
    if (caminho === '/api/pc/loginSecret') return json({ errcode: 0, data: CHAVE_PUBLICA, errmsg: 'Success' });
    if (caminho === '/api/pc/loginByEmail') {
      let senha = '';
      try { senha = decifrar(String(corpo.password)); } catch { /* senha mal cifrada */ }
      if (corpo.username !== USUARIO || senha !== SENHA) return json({ errcode: 1001, errmsg: 'Usuário ou senha incorretos' });
      this.token = `tok-${++this.tokens}`;
      return json({ errcode: 0, data: { token: this.token, shopId: 353, isMainShop: false }, errmsg: 'Success' });
    }
    if (req.headers.authorization !== this.token || this.expirarProxima) { this.expirarProxima = false; return json({ errcode: 2001, errmsg: 'token invalid' }); }
    if (caminho === '/api/pc/sportsClasses/list') return pagina(this.aulas.filter((a) => String(a.classStartDate).startsWith(String(corpo.startDate))));
    if (caminho === '/api/pc/sportsClasses/memberList') return pagina(this.reservas.filter((r) => r.memberClassId === corpo.memberClassId));
    if (caminho === '/api/pc/sportsDeviceStudent/list') return pagina(this.membros);
    res.writeHead(404); res.end();
  }
}

const fc = new FitControlFalso();
const BASE = await fc.subir();
try {
  fc.aulas = [aulaReal(1, `${HOJE} 07:00`, `${HOJE} 08:00`), aulaReal(2, `${HOJE} 19:10`, `${HOJE} 20:10`), aulaReal(3, '2026-10-21 07:00', '2026-10-21 08:00')];
  fc.reservas = Array.from({ length: 130 }, (_, i) => reservaReal(1000 + i, 2, 5000 + i, `${HOJE} 19:10`, i % 2 ? `${HOJE} 19:0${i % 10}:00` : null));
  fc.membros = [membroReal(5001, 'ana@x.com')];
  const c = clienteFitControl({ usuario: USUARIO, senha: SENHA }, relogioDoBox, { base: BASE, timeoutMs: 400 });

  const { aulas } = await c.aulasDoDia(HOJE);
  ok(aulas.map((a) => a.id).join() === '1,2', 'as aulas de hoje (a de amanhã fica de fora)');
  const login = fc.pedidos.find((p) => p.caminho === '/api/pc/loginByEmail')!;
  ok(fc.pedidos[0].metodo === 'GET' && fc.pedidos[0].caminho === '/api/pc/loginSecret' && fc.pedidos[0].query === 'language=3', 'o login começa pela chave pública, com language=3');
  ok(login.corpo.username === USUARIO && !JSON.stringify(login.corpo).includes(SENHA) && login.corpo.language === 3, 'o login manda o usuário e a senha CIFRADA, nunca a senha');
  const lista = fc.pedidos.find((p) => p.caminho === '/api/pc/sportsClasses/list')!;
  ok(lista.auth === 'tok-1', 'o token vai no Authorization, sem "Bearer"');
  ok(lista.corpo.startDate === HOJE && lista.corpo.endDate === HOJE && lista.corpo.language === 3 && lista.corpo.firstNum === 0, 'a lista de aulas pede só o dia, com language no corpo');

  const { reservas } = await c.reservasDaAula('2');
  ok(reservas.length === 130 && fc.pedidos.filter((p) => p.caminho === '/api/pc/sportsClasses/memberList').length === 2, '130 reservas vêm em duas páginas de 100');
  ok(fc.pedidos.filter((p) => p.caminho === '/api/pc/sportsClasses/memberList').every((p) => p.corpo.memberClassId === 2), 'memberClassId vai como número, como o painel manda');
  ok(c.entradas() === 1, 'um login só para várias chamadas');

  fc.expirarProxima = true;
  const { emails } = await c.emailsDosMembros();
  ok(emails['5001'] === 'ana@x.com' && c.entradas() === 2, 'sessão expirada (2001): refaz o login uma vez e segue');

  const errado = clienteFitControl({ usuario: USUARIO, senha: 'outra' }, relogioDoBox, { base: BASE, timeoutMs: 400 });
  const e = await lanca(() => errado.aulasDoDia(HOJE)) as ErroUgym;
  ok(e instanceof ErroUgym && e.motivo === 'api' && /incorretos/.test(e.message), 'senha errada: o erro da API, com a mensagem dela');
  ok(!String(e?.message).includes('outra') && !String(e?.message).includes('tok-'), 'nem a senha nem o token aparecem no erro');

  const semCred = await lanca(() => clienteFitControl({ usuario: '', senha: '' }, relogioDoBox, { base: BASE }).aulasDoDia(HOJE)) as ErroUgym;
  ok(semCred?.motivo === 'sessao' && /não configuradas/.test(semCred.message), 'sem credenciais: erro claro, sem chamar ninguém');

  fc.demorarMs = 800;
  const lento = await lanca(() => c.reservasDaAula('2')) as ErroUgym;
  ok(lento?.motivo === 'rede' && /tempo esgotado/.test(lento.message), 'FitControl lento: tempo esgotado, sem pendurar a rodada');
  fc.demorarMs = 0;

  const fora = await lanca(() => clienteFitControl({ usuario: USUARIO, senha: SENHA }, relogioDoBox, { base: 'http://127.0.0.1:1/api', timeoutMs: 400 }).aulasDoDia(HOJE)) as ErroUgym;
  ok(fora?.motivo === 'rede', 'FitControl fora do ar: erro de rede');
} finally {
  await fc.descer();
}

/* ================================================================== *
 * 3) A rodada, com um banco em memória
 * ================================================================== */

console.log('\nA RODADA\n');

class RepoMem implements RepoUgym {
  estado: EstadoUgym = lerEstadoDoDoc(undefined);
  checkins: Record<string, Record<string, ItemCheckinUgym>> = {};
  rodadas: UltimaRodada[] = [];
  gravacoes = 0;
  falharGravacao = false;
  async lerEstado() { return JSON.parse(JSON.stringify(this.estado)) as EstadoUgym; }
  async gravar(_uid: string, itens: Array<{ email: string; id: string; item: ItemCheckinUgym }>, estado: EstadoUgym, rodada: UltimaRodada) {
    if (this.falharGravacao) throw new Error('Firestore indisponível');
    this.gravacoes++;
    for (const { email, id, item } of itens) (this.checkins[email] ??= {})[id] = item;
    this.estado = JSON.parse(JSON.stringify(estado));
    this.rodadas.push(rodada);
  }
  async gravarRodada(_uid: string, rodada: UltimaRodada) { this.rodadas.push(rodada); }
}

class ClienteFalso implements ClienteUgym {
  chamadas: string[] = [];
  aulas: AulaUgym[] = [{ id: 'A7', nome: 'T 07:00', dia: HOJE, inicio: '07:00', fim: '08:00' }, { id: 'A19', nome: 'T 19:10', dia: HOJE, inicio: '19:10', fim: '20:10' }];
  reservas: Record<string, ReservaUgym[]> = {};
  emails: Record<string, string> = { 10: 'ana@x.com' };
  erro: ErroUgym | null = null;
  linhaDeAula: Dados = aulaReal(1, `${HOJE} 07:00`, `${HOJE} 08:00`);
  async aulasDoDia(dia: string) { this.chamadas.push(`aulas:${dia}`); if (this.erro) throw this.erro; return { aulas: this.aulas, linhas: [this.linhaDeAula] }; }
  async reservasDaAula(id: string) { this.chamadas.push(`reservas:${id}`); return { reservas: this.reservas[id] ?? [], linhas: (this.reservas[id] ?? []).map(() => reservaReal(1, 1, 1, `${HOJE} 07:00`, null)) }; }
  async emailsDosMembros() { this.chamadas.push('membros'); return { emails: this.emails, linhas: [membroReal(1, 'a@b.co')] }; }
}

const T0 = Date.UTC(2026, 9, 20, 10, 0); // 07:00 no box
const rodar = (cliente: ClienteFalso, repo: RepoMem, agora: number, avisos: string[] = []) => sincronizarCheckinsUgym({
  cliente, repo, coachUid: UID, agora, relogio: relogioDoBox(new Date(agora)),
  log: { info: () => {}, warn: (m) => { avisos.push(m); } },
});
const MIN = 60_000;
const reserva = (id: string, aluno: string, agora: string | null, aulaId = 'A7', hora = '07:00'): ReservaUgym =>
  ({ id, aulaId, alunoUgymId: aluno, noid: `N${aluno}`, dia: HOJE, hora, checkin: agora ? { hoje: HOJE, agora } : null });

{
  const cli = new ClienteFalso(), repo = new RepoMem();
  const r0 = await rodar(cli, repo, T0 - 4 * 60 * MIN); // 03:00
  ok(igual(cli.chamadas, [`aulas:${HOJE}`]) && r0.aulasNaJanela === 0 && repo.gravacoes === 1, 'madrugada: lê as aulas do dia, guarda, e não consulta reserva nenhuma');
  cli.chamadas = [];
  await rodar(cli, repo, T0 - 3.5 * 60 * MIN); // 03:30
  ok(cli.chamadas.length === 0 && repo.gravacoes === 1, 'na rodada seguinte, fora da janela: nenhuma chamada e nenhuma gravação');

  cli.reservas.A7 = [reserva('r1', '10', '06:58'), reserva('r2', '11', null)];
  const r1 = await rodar(cli, repo, T0 + 2 * MIN); // 07:02 — aulas relidas (passou 1h)
  ok(cli.chamadas.includes('reservas:A7') && !cli.chamadas.includes('reservas:A19'), 'na janela: só a aula da hora');
  ok(cli.chamadas.includes('membros') && repo.estado.emails['10'] === 'ana@x.com', 'o primeiro check-in de aluno fora do cache lê a lista de membros e guarda os e-mails');
  ok(r1.checkins === 1 && repo.checkins['ana@x.com']?.['ugym|r1']?.checkin.agora === '06:58', 'o check-in da Ana vira item em checkinsUgym/ana@x.com');
  ok(repo.estado.vistos.r1 === HOJE && !('r2' in repo.estado.vistos), 'a reserva aplicada entra no livro; a que só reservou, não');
  ok(r1.erro === null && repo.rodadas.at(-1)?.checkins === 1, 'a última rodada fica registrada');

  delete repo.checkins['ana@x.com']; // a Gestão aplicou e consumiu
  cli.chamadas = [];
  const r2 = await rodar(cli, repo, T0 + 4 * MIN);
  ok(r2.checkins === 0 && !repo.checkins['ana@x.com'], 'consumido pela Gestão, o item não volta na rodada seguinte (o livro segura)');
  ok(!cli.chamadas.includes(`aulas:${HOJE}`), 'as aulas vêm do estado guardado (menos de 1h)');

  cli.reservas.A7.push(reserva('r3', '12', '07:03'));
  cli.chamadas = [];
  const r3 = await rodar(cli, repo, T0 + 6 * MIN);
  ok(!cli.chamadas.includes('membros') && r3.pendentes === 1 && repo.estado.pendentes['12']?.noid === 'N12',
    'aluno sem e-mail fica pendente (a lista de membros, lida há 4 min, não é relida)');
  cli.chamadas = [];
  await rodar(cli, repo, T0 + 8 * MIN);
  ok(!cli.chamadas.includes('membros'), 'a lista de membros não é relida a cada 2 minutos');
  cli.emails = { ...cli.emails, 12: 'bia@x.com' };
  cli.chamadas = [];
  const r4 = await rodar(cli, repo, T0 + 40 * MIN);
  ok(cli.chamadas.includes('membros') && r4.checkins === 1 && !!repo.checkins['bia@x.com']?.['ugym|r3'] && !repo.estado.pendentes['12'],
    'o cadastro ganhou e-mail: depois de 30 min a lista é relida, o check-in entra e sai dos pendentes');
}
{
  const cli = new ClienteFalso(), repo = new RepoMem(), avisos: string[] = [];
  cli.erro = new ErroUgym('sessao', 'Usuário ou senha incorretos');
  const r = await rodar(cli, repo, T0, avisos);
  ok(r.erro?.motivo === 'sessao' && repo.rodadas.at(-1)?.erro?.mensagem === 'Usuário ou senha incorretos' && repo.gravacoes === 0,
    'login falhou: o erro vai para a última rodada, e o livro fica intocado');
  ok(avisos.length === 1, 'e para o log, como aviso');
}
{
  const cli = new ClienteFalso(), repo = new RepoMem();
  cli.linhaDeAula = { id: 1, className: 'T', dataInicio: 'x' };
  const r = await rodar(cli, repo, T0);
  ok(r.erro?.motivo === 'formato' && /classStartDate/.test(r.erro.mensagem) && repo.gravacoes === 0, 'o FitControl mudou o nome de um campo: para, com o campo no erro');
}
{
  const cli = new ClienteFalso(), repo = new RepoMem();
  cli.reservas.A7 = [reserva('r1', '10', '06:58')];
  repo.falharGravacao = true;
  const r = await rodar(cli, repo, T0 + 2 * MIN);
  ok(r.erro?.motivo === 'interno' && !repo.checkins['ana@x.com'] && !repo.estado.vistos.r1, 'gravação falhou: nem item nem livro (lote só)');
  repo.falharGravacao = false;
  const r2 = await rodar(cli, repo, T0 + 4 * MIN);
  ok(r2.checkins === 1 && !!repo.checkins['ana@x.com']?.['ugym|r1'], 'e a rodada seguinte aplica');
}
ok(igual(lerEstadoDoDoc({ vistos: { a: HOJE }, aulas: { dia: HOJE, lista: 'x', em: 1 }, emailsEm: 'x' }),
  { vistos: { a: HOJE }, emails: {}, emailsEm: 0, aulas: null, pendentes: {} }), 'estado guardado incompleto ou estranho é lido com o padrão');

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
}

main().then(() => process.exit(falhas ? 1 : 0), (e) => { console.error(e); process.exit(1); });
