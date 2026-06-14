# Montador de Treinos FULL BODY — Braconaro Garage Power Lab

Gerador automático de treinos full body que respeita as **modalidades**, a **estrutura
real do box** (inventário de aparelhos), a **frequência semanal** do aluno e o
**equilíbrio entre padrões de movimento**, calculando **volume semanal e mensal**.

> **Status: Fase 3 concluída** — núcleo + app com 4 abas (Aula do dia, Semana do aluno,
> **Mesociclo**, Alunos). Inclui **balanceamento de volume entre os dias da semana**,
> **mesociclos com progressão de intensidade e deload automático**, troca de exercício
> por alternativa viável e impressão/PDF (via diálogo do navegador).

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
│   ├── periodizacao.js   # Progressão de volume/intensidade + deload + nível
│   ├── gerador.js        # ALGORITMO de montagem (8 passos) + troca de exercício
│   ├── planoSemanal.js   # Semana inteira + BALANCEAMENTO de volume entre dias
│   ├── mesociclo.js      # Encadeia N semanas com progressão e deload
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
- **Fase 3 — Periodização avançada (CONCLUÍDA):** mesociclos com progressão de
  intensidade e deload automático (semana 4 do ciclo), balanceamento de volume
  entre os dias da semana (viés por déficit por padrão), contagem de exercícios
  estável por template, export PDF via diálogo de impressão do navegador.
  Validado: spread entre os 4 padrões grandes ~5 séries; progressão de volume e
  intensidade monotônica 1→3 com deload em 5/5 seeds.
- **Ajustes de tuning em aberto (do treinador):** os números de `META_SERIES_SEMANAIS`
  em `config/frequencias.js` e os fatores de progressão em `core/periodizacao.js`
  são pontos de calibração para a realidade do box.

- **Fase 4 — Carga, histórico e integração (CONCLUÍDA):**
  - **Sugestão de carga inicial** por exercício (nível + intensidade da modalidade,
    com *snap* para os pesos reais do box — `core/cargas.js`).
  - **Histórico por aluno**: salvar treinos gerados e revisar/remover depois
    (aba Histórico, persistido em localStorage via `ui/store.js`).
  - **Integração com o site**: link "Montador de treinos (coach)" no rodapé de `index.html`.

## Próximos passos possíveis

Biblioteca com vídeos/imagens dos exercícios (requer mídia), exportar histórico em PDF
por período, e sugestão de carga personalizada a partir do 1RM informado do aluno.
