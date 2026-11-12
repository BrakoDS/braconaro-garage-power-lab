/**
 * AS ROTINAS AGENDADAS (Fase 1 · etapa 8, decisões 4 e 14 do ESCOPO).
 *
 * `rotinasDoBox` (index.ts) roda todo dia às 7h e grava a lista do dia em
 * `gestao/{coach}/rotinas/{AAAA-MM-DD}`: a régua de pagamento, as pendências,
 * os créditos vencendo, a 2ª falta seguida e o mês a fechar. A regra é a da
 * Gestão (`rotinas-regras.js`, copiado para lib/gestao); aqui fica só o que
 * não depende do Firestore, para o `checar-rotinas` provar sem rede:
 *
 *  - carregar a regra copiada;
 *  - montar a lista e tirar o que o coach já enviou ou descartou na Fila
 *    (`gestao/{coach}/automacao/feitas`) — a rotina não repete;
 *  - o documento do dia: só o tipo, o aluno, o mês e a validade de cada item
 *    (o texto é montado na Gestão, com a ficha de agora).
 *
 * Nada aqui envia mensagem: quem envia é o coach, pela Fila.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Dados = Record<string, unknown>;

/** `import()` de verdade (o tsc em commonjs trocaria por `require`). */
const importar = new Function('u', 'return import(u)') as (u: string) => Promise<Dados>;

export interface ItemDaRotina { chave: string; tipo: string; validoAte: string; alunoId?: string; mesId?: string; dados?: Dados }

export interface RegrasDasRotinas {
  itensDoDia(fichas: Dados[], hoje: string, ctx: { fechamentos?: Dados; ocupacao?: Dados[]; fechados?: string[] }): ItemDaRotina[];
  TIPOS_DE_MENSAGEM: readonly string[];
}

const _regras = new Map<string, Promise<RegrasDasRotinas>>();

/** A regra das rotinas, da cópia da Gestão em lib/gestao. Carrega uma vez por instância. */
export function regrasDasRotinas(base = join(__dirname, 'gestao')): Promise<RegrasDasRotinas> {
  const ja = _regras.get(base);
  if (ja) return ja;
  const carga = importar(pathToFileURL(join(base, 'coach', 'gestao-de-alunos', 'rotinas-regras.js')).href) as unknown as Promise<RegrasDasRotinas>;
  _regras.set(base, carga);
  return carga;
}

export interface DepsDaRotina {
  regras: RegrasDasRotinas;
  hoje: string;
  fichas: Dados[];
  fechamentos: Dados;
  /** As chaves da Fila já enviadas ou descartadas (`automacao/feitas`). */
  feitas: Dados;
  ocupacao: Dados[];
  fechados: string[];
  agora: number;
}

export interface ListaDoDia { dia: string; geradoEm: number; itens: ItemDaRotina[]; contagem: Record<string, number> }

/**
 * A lista do dia: a regra da Gestão, sem as mensagens que o coach já enviou ou
 * descartou (a mesma chave da Fila). Os avisos (fechamento e pendência) não são
 * mensagem e passam sempre.
 */
export function listaDoDia(d: DepsDaRotina): ListaDoDia {
  const feitas = d.feitas && typeof d.feitas === 'object' ? d.feitas : {};
  const itens = d.regras.itensDoDia(d.fichas, d.hoje, { fechamentos: d.fechamentos, ocupacao: d.ocupacao, fechados: d.fechados })
    .filter((i) => !(d.regras.TIPOS_DE_MENSAGEM.includes(i.tipo) && Object.prototype.hasOwnProperty.call(feitas, i.chave)));
  const contagem: Record<string, number> = {};
  for (const i of itens) contagem[i.tipo] = (contagem[i.tipo] ?? 0) + 1;
  // O Firestore recusa `undefined`: o item vai só com o que tem.
  return { dia: d.hoje, geradoEm: d.agora, itens: JSON.parse(JSON.stringify(itens)), contagem };
}
