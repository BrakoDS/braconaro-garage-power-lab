// @ts-check
/**
 * O MOTIVO obrigatório ao desfazer uma aula que tinha falta, crédito de
 * reposição ou atestado (decisão 8 do ESCOPO, etapa 5) — a mesma pergunta no
 * Painel de Presença (ui-tela-turmas.js) e no Check-in (ui-tela-checkin.js).
 * Quem decide QUANDO perguntar é `desfazerPedeMotivo` (checkin-regras.js);
 * quem põe o motivo na linha dos Registros é `comMotivo`.
 */
import { pedirMotivo, avisar } from '../../compartilhado/ui/dialogo.js?v=37';

/** 'AAAA-MM-DD' → 'DD/MM'. @param {string} iso */
const ddmm = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : String(iso || ''));

/**
 * Pergunta o motivo de desfazer a aula. Resolve com o motivo, ou null
 * (cancelou, ou deixou em branco: aí avisa que é obrigatório e nada muda).
 * @param {string} dia o dia da aula ('AAAA-MM-DD')
 */
export async function pedirMotivoDoDesfazerAula(dia) {
  const motivo = await pedirMotivo({
    titulo: 'Desfazer esta aula?',
    texto: `A falta ou o crédito da aula de <b>${ddmm(dia)}</b> sai da ficha (e do Portal do aluno). Por que está desfazendo?`,
    ok: 'Desfazer', placeholder: 'Ex.: ele veio, a chamada errou; crédito lançado no dia errado', perigo: true,
  });
  if (motivo === null) return null;
  if (!motivo) { await avisar({ titulo: 'Falta o motivo', texto: 'Para tirar uma falta ou um crédito, escreva o motivo: ele fica nos Registros. Nada foi desfeito.' }); return null; }
  return motivo;
}
