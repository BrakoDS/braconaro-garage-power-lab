// @ts-check
/**
 * Modal "+ Cadastrar novo aluno" — o cadastro curto (campos-aluno.js): ID,
 * nome, telefone, e-mail, nascimento, sexo, status, mensalidade e vencimento.
 * O resto o coach completa na ficha, card a card.
 *
 * Saiu do `app.js` no fatiamento. Ao cadastrar, grava (`db.criar` — que
 * publica o Portal e avisa a lista) só os campos do cadastro, registra na aba
 * Registros e pede o perfil do aluno novo pelo barramento ('abrir-perfil'),
 * como o clique num card: a ficha abre na aba Geral.
 */
import * as db from './db.js?v=35';
import { formCadastroCurtoHTML, CAMPOS_CADASTRO, wireForm, lerCampos } from './campos-aluno.js?v=35';
import { fundadorPeloInicio } from './cadastro-regras.js?v=35';
import { $, abrirModal, fecharModal } from './util/dom.js?v=35';
import { emit, EVENTOS } from './estado.js?v=35';
import { reg } from './registro.js?v=35';
import { avisar as avisarReal } from '../../compartilhado/ui/dialogo.js?v=35';

/** @type {{ avisar: (o: any) => any }} */
let deps = { avisar: avisarReal };

/**
 * O cadastro que veio da lista do dia ("Virar aluno", etapa 6.2): o Day Pass que
 * a ficha nova guarda (abate na 1ª mensalidade) e o que fazer depois de criar.
 * @type {{ dayPass?: { dia: string, valor: number } | null, aoCriar?: (novo: any) => void } | null}
 */
let pendente = null;

/** Abre o modal do cadastro curto, vazio. */
function abrirVazio() {
  $('#modal-aluno-body').innerHTML = formCadastroCurtoHTML();
  wireForm($('#modal-aluno-body'));
  abrirModal('modal-aluno');
}

/**
 * Abre o cadastro curto já preenchido com quem estava na lista do dia (Day
 * Pass ou aula experimental).
 * @param {{ nome?: string, telefone?: string, dayPass?: { dia: string, valor: number } | null, aoCriar?: (novo: any) => void }} pre
 */
export function abrirCadastroDaLista(pre) {
  abrirVazio();
  pendente = { dayPass: pre.dayPass || null, aoCriar: pre.aoCriar };
  const corpo = $('#modal-aluno-body');
  const nome = /** @type {HTMLInputElement|null} */ ($('input[name=nome]', corpo));
  const tel = /** @type {HTMLInputElement|null} */ ($('input[name=telefone]', corpo));
  if (nome && pre.nome) nome.value = pre.nome;
  if (tel && pre.telefone) tel.value = pre.telefone;
  setTimeout(() => $('input[name=id]', corpo)?.focus(), 50);
}

/**
 * Liga o botão "+" e o formulário do modal. Chamar uma vez, antes do resto do app.
 * @param {Partial<typeof deps>} [d] o que vem de fora (os testes trocam; o app usa o padrão)
 */
export function iniciarModalAluno(d = {}) {
  deps = { ...deps, ...d };
  $('#fab-novo')?.addEventListener('click', () => {
    pendente = null;
    abrirVazio();
    setTimeout(() => $('input[name=id]', $('#modal-aluno-body'))?.focus(), 50);
  });
  $('#form-novo')?.addEventListener('submit', (/** @type {any} */ e) => {
    e.preventDefault();
    const dados = lerCampos(e.target, CAMPOS_CADASTRO);
    if (!dados.nome) { deps.avisar({ texto: 'Informe o nome do aluno.' }); return; }
    // Quem começa até 31/12/2026 é fundador, sozinho (decisão 9); o coach tira no card.
    if (dados.inicio) dados.fundador = fundadorPeloInicio(dados.inicio);
    // Veio de um Day Pass: a ficha guarda o treino pago (abate na 1ª mensalidade, planos.js).
    if (pendente && pendente.dayPass) dados.dayPass = pendente.dayPass;
    const novo = db.criar(dados);
    if (!novo) { deps.avisar({ texto: 'Já existe um aluno com esse ID. Escolha outro.' }); return; }
    reg('aluno-criado', novo, pendente && pendente.dayPass ? 'Aluno cadastrado (veio do Day Pass)' : 'Aluno cadastrado', { chave: `aluno-criado:${novo.id}` });
    const depois = pendente && pendente.aoCriar;
    pendente = null;
    if (depois) depois(novo);
    fecharModal('modal-aluno');
    emit(EVENTOS.ABRIR_PERFIL, novo.id);
  });
}
