// @ts-check
/**
 * Liga TODAS as telas da Gestão ao barramento, numa ordem só.
 *
 * Usada pelo main.js (o app de verdade) e pela vitrine local — que antes
 * repetia esta lista à mão e ficava para trás a cada tela nova. O que muda
 * entre os dois entra por `o` (a vitrine troca o que falaria com o mundo de
 * fora: o PDF, a prévia do Portal, o WhatsApp).
 *
 * A ORDEM importa num ponto: o roteador e o perfil ligam ANTES das telas e
 * das abas. Os ouvintes de um evento rodam na ordem em que foram ligados, então
 * a tela (ou o painel da aba) já está visível quando o módulo dela desenha.
 */
import * as db from './db.js?v=25';
import { iniciarModais } from './util/dom.js?v=25';
import { iniciarNavegacao } from './navegacao.js?v=25';
import { iniciarLista } from './ui-lista.js?v=25';
import { iniciarPerfil } from './ui-perfil.js?v=25';
import { iniciarFotoDoPerfil } from './ui-fotos.js?v=25';
import { iniciarModalAluno } from './ui-modal-aluno.js?v=25';
import { iniciarAcoesAluno } from './ui-acoes-aluno.js?v=25';
import { iniciarSalvarGlobal } from './ui-salvar-global.js?v=25';
import { iniciarTabGeral } from './ui-tab-geral.js?v=25';
import { iniciarTabSaude } from './ui-tab-saude.js?v=25';
import { iniciarTabTreino } from './ui-tab-treino.js?v=25';
import { iniciarTabAvaliacoes } from './ui-tab-avaliacoes.js?v=25';
import { iniciarTabProgresso } from './ui-tab-progresso.js?v=25';
import { iniciarTabFinanceiro } from './ui-tab-financeiro.js?v=25';
import { iniciarTabPortal } from './ui-tab-portal.js?v=25';
import { iniciarTabRegistros } from './ui-tab-registros.js?v=25';
import { iniciarTabHistorico } from './ui-tab-historico.js?v=25';
import { iniciarTelaCheckin } from './ui-tela-checkin.js?v=25';
import { iniciarTelaTurmas } from './ui-tela-turmas.js?v=25';
import { iniciarTelaAgenda } from './ui-tela-agenda.js?v=25';
import { iniciarTelaFinanceiro } from './ui-tela-financeiro.js?v=25';
import { iniciarTelaCobrancas } from './ui-tela-cobrancas.js?v=25';
import { iniciarTelaAvisos } from './ui-tela-avisos.js?v=25';
import { iniciarTelaMural } from './ui-tela-mural.js?v=25';
import { iniciarTelaDesafios } from './ui-tela-desafios.js?v=25';
import { iniciarTelaLeads } from './ui-tela-leads.js?v=25';
import { iniciarAutomacao } from './automacao.js?v=25';
import { iniciarTelaAutomacao } from './ui-tela-automacao.js?v=25';

/**
 * @param {{
 *   exportarFicha?: (a: any) => any,
 *   urlPrevia?: string,
 *   avisos?: Parameters<typeof iniciarTelaAvisos>[0],
 *   automacao?: Parameters<typeof iniciarTelaAutomacao>[0],
 *   acoesAluno?: Parameters<typeof iniciarAcoesAluno>[0],
 * }} [o]
 *   exportarFicha: gera o PDF da ficha (o app passa o pdf.js); urlPrevia: a
 *   página da prévia do Portal; avisos e automacao: o que a tela de aviso e a
 *   Fila de mensagens usam de fora (abrir o WhatsApp); acoesAluno: a callable
 *   do Criar acesso (a vitrine troca por uma de mentira)
 */
export function iniciarTelas(o = {}) {
  // Primeiro quem mostra: o roteador de telas e o perfil (que troca o painel da aba).
  iniciarNavegacao();
  iniciarModais();
  iniciarLista({ listar: db.listar });
  iniciarPerfil({ obter: db.obter, exportar: o.exportarFicha });
  iniciarFotoDoPerfil();
  iniciarModalAluno();
  iniciarAcoesAluno(o.acoesAluno);
  // O salvar global antes das abas: as de formulário se registram nele.
  iniciarSalvarGlobal();
  // As abas do perfil.
  iniciarTabGeral();
  iniciarTabSaude();
  iniciarTabTreino();
  iniciarTabAvaliacoes();
  iniciarTabProgresso();
  iniciarTabFinanceiro('#tab-geral'); // os botões de dinheiro do card Financeiro
  iniciarTabPortal(o.urlPrevia ? { urlPrevia: o.urlPrevia } : {});
  iniciarTabRegistros();
  iniciarTabHistorico(); // depois dos três que ela abre: uso do app, prévia e linha do tempo
  // As telas do box.
  iniciarTelaCheckin();
  iniciarTelaTurmas();
  iniciarTelaAgenda();
  iniciarTelaFinanceiro();
  iniciarTelaCobrancas();
  iniciarTelaAvisos(o.avisos);
  iniciarTelaMural();
  iniciarTelaDesafios();
  iniciarTelaLeads();
  // O motor de automação (ouve as ações do log) e a Fila de mensagens.
  iniciarAutomacao();
  iniciarTelaAutomacao(o.automacao);
}
