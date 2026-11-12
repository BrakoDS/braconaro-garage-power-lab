/**
 * Confere a rotina das 7h (etapa 8) sem rede: a regra copiada da Gestão carrega,
 * a lista do dia sai nos dias certos da régua, a rotina não repete o que o
 * coach já enviou ou descartou na Fila, e o documento do dia só leva o tipo, o
 * aluno, o mês e a validade (nada de texto, valor ou dado de saúde).
 *
 *     npm run build && node lib/checar-rotinas.js
 */
import { listaDoDia, regrasDasRotinas } from './rotinas';

let falhas = 0;
function ok(cond: boolean, desc: string, detalhe = ''): void {
  if (cond) console.log(`  ✓ ${desc}`);
  else { falhas++; console.log(`  ✗ ${desc}${detalhe ? `\n      ${detalhe}` : ''}`); }
}

async function main() {
  const regras = await regrasDasRotinas();
  const ana = { id: 'A', nome: 'Ana Lima', mensalidade: '130', vencimento: '10', pagamentos: {}, consumos: [], restricoes: ['SENTINELA'], avaliacoes: [{ peso: 70 }] };
  const edu = { id: 'E', nome: 'Edu', mensalidade: '150', vencimento: '15', pagamentos: {}, consumos: [] };
  const fechados = { '2026-11': { situacao: 'aprovado' } };
  const lista = (hoje: string, feitas = {}) => listaDoDia({ regras, hoje, fichas: [ana, edu], fechamentos: fechados, feitas, ocupacao: [], fechados: [], agora: 1 });

  console.log('\nA RÉGUA NOS DIAS CERTOS\n');
  const tipos = (hoje: string) => lista(hoje).itens.map((i) => `${i.tipo}:${i.alunoId}`).join(' ');
  ok(tipos('2026-12-01') === 'regua-dia1:A regua-dia1:E', 'dia 1: a virada para os dois', tipos('2026-12-01'));
  ok(tipos('2026-12-05') === 'regua-meio:A' && tipos('2026-12-08') === 'regua-meio:E', 'o meio do caminho: dia 5 (vence no 10) e dia 8 (vence no 15)');
  ok(tipos('2026-12-10') === 'regua-vencimento:A' && tipos('2026-12-11') === 'regua-pos:A', 'o vencimento e o dia seguinte');
  ok(tipos('2026-12-12') === 'pendencia:A', 'depois do vencimento + 1: pendência, sem mensagem');
  ok(tipos('2026-12-04') === '', 'dia sem degrau: lista vazia');

  console.log('\nNÃO REPETE O QUE O COACH JÁ FEZ\n');
  ok(lista('2026-12-01', { 'regua-dia1:A:2026-12': { status: 'enviada', em: 1 } }).itens.map((i) => i.alunoId).join() === 'E', 'a mensagem já enviada na Fila não volta na lista');
  ok(lista('2026-12-12', { 'pendencia:A:2026-12': { status: 'descartada', em: 1 } }).itens.length === 1, 'o aviso de pendência não é mensagem: passa sempre');

  console.log('\nO MÊS A FECHAR\n');
  const semFechar = listaDoDia({ regras, hoje: '2026-12-03', fichas: [], fechamentos: {}, feitas: {}, ocupacao: [], fechados: [], agora: 1 });
  ok(semFechar.itens.some((i) => i.tipo === 'fechamento' && i.mesId === '2026-11'), 'novembro sem fechamento: o aviso aparece');
  ok(!lista('2026-12-03').itens.some((i) => i.tipo === 'fechamento'), 'novembro fechado: sem aviso');

  console.log('\nO DOCUMENTO DO DIA\n');
  const doc = lista('2026-12-01');
  const json = JSON.stringify(doc);
  ok(doc.dia === '2026-12-01' && doc.contagem['regua-dia1'] === 2, 'o dia e a contagem por tipo');
  ok(!json.includes('SENTINELA') && !json.includes('peso') && !json.includes('Olá') && !json.includes('130'), 'só tipo, aluno, mês e validade: sem texto, sem valor, sem dado de saúde', json.slice(0, 200));
  // Num dia de pendência (a Ana venceu no 10), o aviso também vai sem valor e sem dias de atraso.
  const pend = JSON.stringify(lista('2026-12-12'));
  ok(pend.includes('"pendencia"') && !pend.includes('130') && !pend.includes('valor') && !pend.includes('diasAtraso'), 'a pendência também vai sem valor', pend.slice(0, 200));
  ok(doc.itens.every((i) => i.chave && i.tipo && i.validoAte), 'todo item com chave, tipo e validade');

  console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\n✓ Rotina das 7h conferida.');
  process.exit(falhas ? 1 : 0);
}

void main();
