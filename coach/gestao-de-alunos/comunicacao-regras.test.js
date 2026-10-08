// @ts-check
/**
 * Rodar: node --test coach/gestao-de-alunos/comunicacao-regras.test.js
 *
 * As regras de Aviso em massa, Mural, Desafios e Leads, sem tela e sem nuvem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recentes, publicarItem, alternarAtivo, removerItem, metaDiasValida, destinatariosDoAviso,
  followUpLead, painelDeLeads, comStatus, LIMIAR_FOLLOWUP,
} from './comunicacao-regras.js?v=11';

const DIA = 86400000;
const AGORA = Date.UTC(2026, 9, 8, 15, 0);

/* ---------- itens publicados (Mural e Desafios) ---------- */

const mural = () => [
  { id: 'a', titulo: 'Feriado', texto: 'Sem aula', tipo: 'importante', ativo: true, criadoEm: 100 },
  { id: 'b', titulo: 'Festa', texto: 'Sábado', tipo: 'evento', criadoEm: 300 },
  { id: 'c', titulo: 'Antigo', texto: 'x', tipo: 'info', ativo: false },
];

test('lista publicada: do mais novo para o mais antigo, sem mexer na original', () => {
  const arr = mural();
  assert.deepEqual(recentes(arr).map((x) => x.id), ['b', 'a', 'c'], 'sem data vai para o fim');
  assert.deepEqual(arr.map((x) => x.id), ['a', 'b', 'c']);
});

test('publicar: item novo entra no ar, com id e data, campos na ordem do formulário', () => {
  const r = publicarItem(mural(), null, { titulo: 'Novo', texto: 'Oi', tipo: 'info' }, { id: 'n1', agora: 999 });
  assert.equal(r.length, 4);
  assert.deepEqual(r[3], { id: 'n1', titulo: 'Novo', texto: 'Oi', tipo: 'info', ativo: true, criadoEm: 999 });
  assert.deepEqual(Object.keys(r[3]), ['id', 'titulo', 'texto', 'tipo', 'ativo', 'criadoEm']);
});

test('editar: só os campos do formulário mudam — id, estado e data ficam', () => {
  const r = publicarItem(mural(), 'c', { titulo: 'Revisto', texto: 'y', tipo: 'evento' }, { id: 'ignorado', agora: 999 });
  assert.equal(r.length, 3, 'editar não cria item');
  assert.deepEqual(r[2], { id: 'c', titulo: 'Revisto', texto: 'y', tipo: 'evento', ativo: false });
  assert.deepEqual(publicarItem(mural(), 'sumiu', { titulo: 'x' }, { id: 'z', agora: 1 }), mural(), 'editar item que sumiu: nada muda');
});

test('ocultar/reativar: só `ativo: false` é oculto; o primeiro clique num item sem estado oculta', () => {
  const r = alternarAtivo(mural(), 'a');
  assert.equal(r[0].ativo, false);
  assert.equal(alternarAtivo(r, 'a')[0].ativo, true);
  assert.equal(alternarAtivo(mural(), 'b')[1].ativo, false, 'sem `ativo` = no ar → oculta');
  assert.equal(alternarAtivo(mural(), 'c')[2].ativo, true);
});

test('excluir: tira só aquele', () => {
  assert.deepEqual(removerItem(mural(), 'b').map((x) => x.id), ['a', 'c']);
  assert.deepEqual(removerItem(mural(), 'nao-existe').map((x) => x.id), ['a', 'b', 'c']);
});

test('desafio: a meta de dias é de 1 a 7; o que não for número vira 5', () => {
  assert.deepEqual(['3', '7', '9', '1', '-3', '0', 'abc', '', '4.8'].map(metaDiasValida), [3, 7, 7, 1, 1, 5, 5, 5, 4]);
});

/* ---------- aviso em massa ---------- */

test('aviso: só aluno ativo com WhatsApp completo', () => {
  const r = destinatariosDoAviso([
    { id: '1', telefone: '(14) 99999-0000' }, { id: '2', telefone: '9999-0000' },
    { id: '3', telefone: '14999990000', status: 'inativo' }, { id: '4', telefone: '14999990000', status: 'pendente' }, { id: '5' },
  ]);
  assert.deepEqual(r.map((a) => a.id), ['1', '4']);
});

/* ---------- leads ---------- */

test('follow-up: novo há 2+ dias sem contato; contatado há 4+ dias sem retorno (desde o contato)', () => {
  assert.equal(LIMIAR_FOLLOWUP.novo, 2);
  assert.deepEqual(followUpLead({ criadoEm: AGORA - 2 * DIA }, AGORA), { precisa: true, dias: 2, motivo: 'sem contato' }, 'sem status = novo');
  assert.equal(followUpLead({ status: 'novo', criadoEm: AGORA - 1.9 * DIA }, AGORA).precisa, false);
  assert.deepEqual(followUpLead({ status: 'contatado', criadoEm: AGORA - 30 * DIA, statusEm: AGORA - 4 * DIA }, AGORA), { precisa: true, dias: 4, motivo: 'sem retorno' });
  assert.equal(followUpLead({ status: 'contatado', criadoEm: AGORA - 30 * DIA, statusEm: AGORA - 3 * DIA }, AGORA).precisa, false, 'conta do contato, não da criação');
  assert.equal(followUpLead({ status: 'contatado', criadoEm: AGORA - 5 * DIA }, AGORA).precisa, true, 'sem statusEm: conta da criação');
  assert.equal(followUpLead({ status: 'convertido', criadoEm: AGORA - 90 * DIA }, AGORA).precisa, false);
  assert.equal(followUpLead({ status: 'novo' }, AGORA).precisa, false, 'sem data, sem alarme');
});

test('painel de leads: descartado some; contagens; parados primeiro (o mais parado no topo), depois os recentes', () => {
  const leads = [
    { id: 'velho-ok', status: 'convertido', criadoEm: AGORA - 50 * DIA },
    { id: 'parado-5', status: 'novo', criadoEm: AGORA - 5 * DIA },
    { id: 'recente', criadoEm: AGORA - 1 * DIA },
    { id: 'parado-9', status: 'contatado', criadoEm: AGORA - 20 * DIA, statusEm: AGORA - 9 * DIA },
    { id: 'lixo', status: 'descartado', criadoEm: AGORA - 99 * DIA },
    { id: 'contatado-ok', status: 'contatado', criadoEm: AGORA - 3 * DIA, statusEm: AGORA - 1 * DIA },
  ];
  const p = painelDeLeads(leads, AGORA);
  assert.deepEqual(p.ordenados.map((l) => l.id), ['parado-9', 'parado-5', 'recente', 'contatado-ok', 'velho-ok']);
  assert.deepEqual([p.novos, p.contatados, p.convertidos, p.precisam], [2, 2, 1, 2]);
});

test('status do lead: troca só aquele, com o instante — como a nuvem grava', () => {
  const leads = [{ id: 'a', status: 'novo' }, { id: 'b', status: 'novo' }];
  assert.deepEqual(comStatus(leads, 'b', 'contatado', AGORA), [{ id: 'a', status: 'novo' }, { id: 'b', status: 'contatado', statusEm: AGORA }]);
  assert.equal(leads[1].status, 'novo', 'o cache original não muda');
});

test('status do lead (regressão): marcado como contatado agora não pede follow-up na hora', () => {
  // Antes, o cache local trocava o status e não o `statusEm`: um lead de 5
  // dias marcado agora como "contatado" aparecia com "sem retorno há 5d".
  const leads = [{ id: 'v', status: 'novo', criadoEm: AGORA - 5 * DIA }];
  const depois = comStatus(leads, 'v', 'contatado', AGORA);
  assert.equal(followUpLead(depois[0], AGORA).precisa, false);
  assert.equal(followUpLead(depois[0], AGORA + 4 * DIA).precisa, true, 'e pede de novo 4 dias depois do contato');
});

/* ---------- pureza ---------- */

test('puro: nenhuma regra altera o que recebe', () => {
  /** @param {any} o */
  const congelar = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
  const arr = congelar(mural());
  const leads = congelar([{ id: 'x', status: 'novo', criadoEm: AGORA - 3 * DIA }]);
  const copia = JSON.stringify([arr, leads]);
  recentes(arr); publicarItem(arr, null, { titulo: 't' }, { id: 'n', agora: 1 }); publicarItem(arr, 'a', { titulo: 't' }, { id: 'n', agora: 1 });
  alternarAtivo(arr, 'a'); removerItem(arr, 'a'); painelDeLeads(leads, AGORA); comStatus(leads, 'x', 'contatado', AGORA);
  assert.equal(JSON.stringify([arr, leads]), copia);
});
