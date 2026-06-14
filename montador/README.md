# Montador de Treinos FULL BODY — Braconaro Garage Power Lab

Gerador automático de treinos full body que respeita as **modalidades**, a **estrutura
real do box** (inventário de aparelhos), a **frequência semanal** do aluno e o
**equilíbrio entre padrões de movimento**, calculando **volume semanal e mensal**.

> **Status: Fase 2 concluída** — núcleo (Fase 1) + **aplicação completa** (`index.html`)
> com 3 abas: Aula do dia, Semana do aluno e cadastro de Alunos (localStorage),
> troca de exercício por alternativa viável e impressão. Periodização avançada é a Fase 3.

---

## Como rodar

Não há build nem dependências (vanilla JS / ES Modules). Mas ES Modules exigem
ser servidos por HTTP (não funcionam via `file://`).

- **Aplicação (Fase 2):** `montador/index.html` — a ferramenta completa para o coach.
- **Demo do núcleo (Fase 1):** `montador/demo.html` — geração rápida para validação.
- **Local:** sirva a raiz do repositório com `.claude/serve-garage.ps1` (porta 8765) →
  `http://localhost:8765/montador/index.html`.
- **Produção:** no GitHub Pages, fica em `…/montador/index.html`.

---

## Stack e decisões de arquitetura

| Decisão | Escolha | Porquê |
|---|---|---|
| Execução | **Client-side**, vanilla JS (ES Modules) | Mesmo modelo do site atual; deploy grátis no GitHub Pages; sem servidor para manter |
| Build | **Nenhum** | Não há Node/npm no ambiente; evita passo de build que quebraria o deploy estático |
| Tipagem | **JSDoc + `// @ts-check`** | Autocomplete e checagem no editor sem compilar |
| Dados | **JSON/JS versionado** + (futuro) `localStorage` | Catálogo no repo; alunos/histórico no navegador (Fase 2) |
| Auth | **Nenhuma** | Foco no gerador (decisão do cliente) |

### Estrutura de pastas

```
montador/
├── data/
│   ├── equipamentos.js   # INVENTÁRIO REAL do box + capacidade por estação
│   └── exercicios.js     # Catálogo mapeado 1:1 aos aparelhos existentes
├── config/
│   ├── padroes.js        # Padrões de movimento + músculos rastreados
│   ├── modalidades.js    # Força / Hipertrofia / HIIT / Hyrox / Híbrido
│   └── frequencias.js    # Combinações de dias (3x/4x/5x) + metas de volume
├── core/
│   ├── viabilidade.js    # Checagem de aparelhos p/ 8 alunos em circuito
│   ├── volume.js         # Volume por músculo/padrão; semanal e mensal
│   ├── periodizacao.js   # Progressão semanal + deload + ajuste por nível
│   ├── gerador.js        # ALGORITMO de montagem (8 passos)
│   ├── planoSemanal.js   # Gera a semana inteira e confere meta de volume
│   └── tipos.js          # Typedefs JSDoc compartilhados
├── ui/
│   ├── store.js          # Persistência de alunos (localStorage)
│   ├── render.js         # Cards de treino, volume e troca de exercício
│   └── app.js            # Controlador das 3 abas
├── index.html / app.css  # APLICAÇÃO (Fase 2)
├── demo.js / demo.html   # Demo do núcleo (Fase 1)
└── README.md
```

---

## Modelo de dados (resumo)

- **Equipamento** — `id, nome, categoria, unidades, compartilhavelDupla, cargasKg`.
  `unidades` = quantas estações simultâneas o box suporta; é o que torna a checagem
  de aparelhos *real*.
- **Exercício** — `id, nome, descricao, padrao, musculosPrimarios[], musculosSecundarios[],
  categorias[] (modalidades+mobilidade/tecnica/wod), equipamento[], nivel, tempoMedioSeg`.
- **Modalidade** — `faixaExercicios, series, reps, descansoSeg, intensidadePctRM, formato,
  finalizador, estimulo`.
- **Combinação de dias** — `frequencia (3/4/5), dias[]` + `META_SERIES_SEMANAIS` por padrão.
- **Treino (gerado)** — `aquecimento[], principal[], finalizador, volume, viabilidade, tempos`.

> O cadastro de **Aluno** (`nome, nivel, frequência, combinação`) entra como entidade
> persistida na Fase 2; o gerador já aceita esses campos como parâmetros.

---

## Lógica de viabilidade de aparelhos

Um treino é um **circuito de K exercícios (estações)**. Os 8 alunos se dividem em
K grupos de `ceil(8/K)`. Cada estação consome unidades do seu equipamento:

```
unidades necessárias = compartilhável em dupla ? ceil(grupo/2) : grupo
```

A soma da demanda por equipamento, em todas as estações, não pode exceder as
unidades do box. Isso implementa as três regras do box de uma vez:
sem exceder o que existe, permitir dupla, e **limitar aparelho único**
(ex.: só 2 Air Bikes ⇒ no máximo 1 estação de bike por treino).

---

## Algoritmo de montagem (8 passos — `core/gerador.js`)

1. **Modalidade do dia** define séries, reps, descanso, formato e finalizador.
2. **Nº de exercícios** (4/5/6) sorteado na faixa da modalidade (mín. em semana de deload; teto 8).
3. **Seleção FULL BODY**: garante os padrões obrigatórios (empurrar, puxar, quadríceps,
   posterior/glúteo; +core e +estabilizadores quando há slots), pontuando candidatos.
4. **Viabilidade de aparelhos** filtra cada inclusão (8 alunos) e **penaliza congestionar
   um mesmo aparelho**, espalhando entre Smith/monocross/cavalinho/halteres/barra.
5. **Volume por músculo** (primário 1.0, secundário 0.5 por série).
6. **Anti-sobrecarga**: teto de séries por músculo + variedade vs. dia anterior.
7. **Ajuste de tempo**: reduz séries e, se preciso, remove exercícios até caber em 45–50 min.
8. **Montagem final**: aquecimento (mobilidade) + bloco principal + finalizador opcional (WOD).

---

## Validação automática (resultados atuais)

Rodando 12 seeds por modalidade (nível intermediário), 100% dos treinos:

| Modalidade | Cobre os 4 padrões grandes | Viável p/ 8 alunos | Dentro de 45–50 min |
|---|---|---|---|
| Força | 12/12 | 12/12 | 12/12 |
| Hipertrofia | 12/12 | 12/12 | 12/12 |
| HIIT | 12/12 | 12/12 | 12/12 |
| Hyrox | 12/12 | 12/12 | 12/12 |
| Híbrido | 12/12 | 12/12 | 12/12 |

(Reproduza pela demo ou via `gerarTreino({...})` no console.)

---

## Roadmap

- **Fase 2 — UI/UX (CONCLUÍDA):** app com 3 abas, cadastro de alunos (localStorage),
  cards de treino imprimíveis, gráficos de volume, troca de exercício por alternativa viável.
- **Fase 3 — Periodização avançada:** mesociclos, autoregulação por nível,
  balanceamento de volume entre dias da semana, deload inteligente, exportar PDF.
- **Ajustes de tuning conhecidos:** metas de volume semanal para iniciante 3x são
  agressivas; o balanceamento entre dias (evitar acúmulo de "puxar") será refinado
  no planejador semanal.
