// @ts-check
/**
 * O contrato das camadas do Calendário — o que permite "injetar informação"
 * depois sem mexer na tela.
 *
 * Uma camada recebe o contexto (as fichas, o meta do box, os pedidos do app
 * ainda não aplicados, hoje) e as datas do período, e devolve itens. Item com
 * `hora` vai para a célula daquele horário; sem `hora`, para o cabeçalho do
 * dia. Camada nova = um arquivo em `camadas/` + uma linha em `registro.js`.
 * Puro: quem tem rede é o app.
 *
 * @typedef {{ tipo: 'aviso'|'reserva', chave: string, em: number, data?: string, hora?: string }} Pendente
 * @typedef {Object} Contexto
 * @property {any[]} fichas       TODAS as fichas (inativas inclusive), com os pedidos do app aplicados (cópia)
 * @property {{ turmas: any, feriados: Record<string, boolean> }} meta
 * @property {string[]} fechados  os dias em que o box não abriu
 * @property {Record<string, Pendente[]>} pendentes  por id da ficha
 * @property {string} hoje        'AAAA-MM-DD' local
 * @property {string} agora       'HH:MM' local
 *
 * @typedef {{ data: string, hora?: string, tipo: string, titulo: string, dados?: any, camada?: string }} Item
 * @typedef {{ id: string, nome: string, cor: string, itens: (ctx: Contexto, datas: string[]) => Item[] }} Camada
 * @typedef {{ doDia: Item[], porHora: Record<string, Item[]> }} DiaDeCamadas
 */

/**
 * Roda as camadas ligadas sobre as datas e agrupa por dia e por horário.
 * @param {Camada[]} camadas @param {Contexto} ctx @param {string[]} datas @param {Set<string>} ligadas
 * @returns {Record<string, DiaDeCamadas>}
 */
export function rodarCamadas(camadas, ctx, datas, ligadas) {
  /** @type {Record<string, DiaDeCamadas>} */
  const out = Object.fromEntries(datas.map((d) => [d, { doDia: [], porHora: {} }]));
  for (const c of camadas) {
    if (!ligadas.has(c.id)) continue;
    for (const it of c.itens(ctx, datas)) {
      const dia = out[it.data];
      if (!dia) continue;
      const item = { ...it, camada: c.id };
      if (it.hora === undefined) dia.doDia.push(item);
      else (dia.porHora[it.hora] ||= []).push(item);
    }
  }
  return out;
}
