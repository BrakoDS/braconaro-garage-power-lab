// @ts-check
/**
 * O rascunho da Ficha do Aluno — a base do "salvar global".
 *
 * Em vez de um botão Salvar por aba, toda edição dos cards cai num rascunho
 * só, por CAMINHO de campo ('nome', 'anamnese.sono',
 * 'matrizIndividualizacao.cargas.rir'). A barra "alterações não salvas" pergunta
 * `sujo()`; o Salvar grava `montarPatch(fichaAtual)` com um `db.atualizar`.
 *
 * Por que caminho, e não a ficha inteira: o `db.atualizar` troca cada campo do
 * topo inteiro (`Object.assign`). Mandar um `anamnese` montado a partir da
 * ficha de quando a tela abriu apagaria o que outro aparelho gravou no meio em
 * `anamnese.medicamentos`. `montarPatch` aplica só os caminhos editados sobre a
 * ficha de AGORA, e `conflitos` aponta o campo que mudou dos dois lados.
 *
 * Listas são folha: `diasTreino`, `foco`, `adaptacoes.lesoes` se definem
 * inteiras — um caminho nunca entra numa lista pelo índice.
 *
 * Puro: sem DOM, sem banco. A base é copiada na criação; quem chama pode
 * continuar mexendo no objeto dele.
 *
 * Plano: docs/superpowers/specs/2026-10-11-ficha-do-aluno-cards-design.md.
 */
import { canonico } from './db-migracao.js?v=14';

/** @param {any} v */
const copia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
/** @param {unknown} v @returns {v is Record<string, any>} */
const ehMapa = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * Vazio para o formulário: ausente, null, '', lista vazia ou mapa vazio. Campo
 * que não existe na ficha e campo apagado no formulário são a mesma coisa —
 * sem isso, digitar e apagar num campo vazio deixaria a ficha "suja" para sempre.
 * `false` e 0 NÃO são vazios: são valores.
 * @param {any} v
 */
const vazio = (v) => v === undefined || v === null || v === ''
  || (Array.isArray(v) && !v.length) || (ehMapa(v) && !Object.keys(v).length);
/** @param {any} x @param {any} y */
const igual = (x, y) => (vazio(x) && vazio(y)) || canonico(x) === canonico(y);

/**
 * O valor num caminho ('a.b.c'), ou undefined.
 * @param {any} obj @param {string} caminho
 */
export function lerCaminho(obj, caminho) {
  let v = obj;
  for (const parte of caminho.split('.')) {
    if (!ehMapa(v)) return undefined;
    v = v[parte];
  }
  return v;
}

/**
 * Grava `valor` no caminho, DENTRO de `obj` (que é alterado), criando os mapas
 * do meio. O que estiver no meio do caminho e não for mapa é trocado por um.
 * @param {Record<string, any>} obj @param {string[]} partes @param {any} valor
 */
function gravarEm(obj, partes, valor) {
  let v = obj;
  for (const parte of partes.slice(0, -1)) {
    if (!ehMapa(v[parte])) v[parte] = {};
    v = v[parte];
  }
  v[partes[partes.length - 1]] = valor;
}

/** `pai` é ancestral de `filho`? ('anamnese' de 'anamnese.sono') @param {string} pai @param {string} filho */
const ancestral = (pai, filho) => filho.startsWith(pai + '.');

/**
 * Um caminho de campo serve? Não vazio, sem parte vazia.
 * @param {unknown} c @returns {c is string}
 */
const caminhoValido = (c) => typeof c === 'string' && c !== '' && c.split('.').every(Boolean);

/**
 * @typedef {{ caminho: string, base: any, atual: any, meu: any }} Conflito
 *   base: o valor quando a edição começou; atual: o que está no banco agora;
 *   meu: o que está no rascunho
 */

/**
 * Cria o rascunho de uma ficha.
 * @param {any} base a ficha como estava quando a edição começou
 */
export function criarRascunho(base) {
  let b = copia(base) || {};
  /** @type {Map<string, any>} caminho → valor editado */
  const mudancas = new Map();

  /** O ancestral do caminho que já está no rascunho, se houver. @param {string} caminho */
  const ancestralNoRascunho = (caminho) => [...mudancas.keys()].find((c) => ancestral(c, caminho));

  /** Tira do rascunho as mudanças que voltaram a ser iguais à base. */
  const limparIguais = () => {
    for (const [c, v] of mudancas) if (igual(v, lerCaminho(b, c))) mudancas.delete(c);
  };

  return {
    /**
     * Edita um campo. Voltar ao valor da base desfaz a mudança (o campo deixa
     * de estar sujo). Um caminho mais largo engole os de dentro dele; um mais
     * estreito, dentro de um que já está no rascunho, é gravado dentro dele.
     * @param {string} caminho @param {any} valor
     */
    definir(caminho, valor) {
      if (!caminhoValido(caminho)) throw new Error(`rascunho: caminho inválido "${caminho}"`);
      const pai = ancestralNoRascunho(caminho);
      if (pai) {
        const v = ehMapa(mudancas.get(pai)) ? copia(mudancas.get(pai)) : {};
        gravarEm(v, caminho.slice(pai.length + 1).split('.'), copia(valor));
        mudancas.set(pai, v);
      } else {
        for (const c of [...mudancas.keys()]) if (ancestral(caminho, c)) mudancas.delete(c);
        mudancas.set(caminho, copia(valor));
      }
      limparIguais();
    },

    /** O valor que a tela mostra: o do rascunho, ou o da base. @param {string} caminho */
    valor(caminho) {
      if (mudancas.has(caminho)) return copia(mudancas.get(caminho));
      const pai = ancestralNoRascunho(caminho);
      if (pai) return copia(lerCaminho(mudancas.get(pai), caminho.slice(pai.length + 1)));
      return copia(lerCaminho(b, caminho));
    },

    /** Tem alguma alteração não salva? */
    sujo() { return mudancas.size > 0; },

    /** Os caminhos editados, na ordem em que foram editados pela primeira vez. */
    caminhos() { return [...mudancas.keys()]; },

    /** Os campos do topo da ficha que o rascunho muda ('anamnese', 'nome'…). */
    camposDoTopo() { return [...new Set([...mudancas.keys()].map((c) => c.split('.')[0]))]; },

    /**
     * Desfaz edições: um caminho (e o que estiver dentro dele), ou tudo.
     * @param {string} [caminho]
     */
    descartar(caminho) {
      if (caminho === undefined) { mudancas.clear(); return; }
      for (const c of [...mudancas.keys()]) if (c === caminho || ancestral(caminho, c)) mudancas.delete(c);
    },

    /**
     * O que gravar: para cada campo do topo editado, o valor da ficha ATUAL com
     * os caminhos do rascunho aplicados por cima. `{}` quando não há edição.
     * @param {any} atual a ficha como está no banco agora
     * @returns {Record<string, any>}
     */
    montarPatch(atual) {
      /** @type {Record<string, any>} */ const patch = {};
      for (const [c, v] of mudancas) {
        const [topo, ...resto] = c.split('.');
        if (!resto.length) { patch[topo] = copia(v); continue; }
        if (!(topo in patch)) patch[topo] = ehMapa(atual?.[topo]) ? copia(atual[topo]) : {};
        gravarEm(patch[topo], resto, copia(v));
      }
      return patch;
    },

    /**
     * Os campos que mudaram dos dois lados: no banco (atual ≠ base) e aqui
     * (rascunho ≠ atual). Mudança só no banco, em campo que não foi editado,
     * não é conflito — `montarPatch` já a preserva.
     * @param {any} atual @returns {Conflito[]}
     */
    conflitos(atual) {
      /** @type {Conflito[]} */ const lista = [];
      for (const [c, meu] of mudancas) {
        const vb = lerCaminho(b, c), va = lerCaminho(atual, c);
        if (!igual(va, vb) && !igual(va, meu)) lista.push({ caminho: c, base: copia(vb), atual: copia(va), meu: copia(meu) });
      }
      return lista;
    },

    /**
     * Passa a editar a partir de `atual` (a ficha que chegou do banco),
     * mantendo as edições. É o "manter o meu" depois de um conflito; o que
     * ficou igual ao banco deixa de estar sujo.
     * @param {any} atual
     */
    rebasear(atual) {
      b = copia(atual) || {};
      limparIguais();
    },
  };
}
