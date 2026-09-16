# Montador de Treinos Híbrido — Lousa do Coach & Dashboard de Volume

O coach escreve e desenha o treino num quadro branco, a IA estrutura, o motor de
variabilidade avisa o que está repetindo na semana, a turma recebe a ficha
ajustada aluno a aluno e o volume é consolidado sozinho.

Quatro etapas, quatro abas, nessa ordem:

```
1 · Lousa  ──▶  2 · Alertas  ──▶  3 · Turma  ──▶  4 · Volume
quadro          variabilidade      até 8 alunos    semana e mês
```

## Por que esta ferramenta existe ao lado das outras duas

O box já tem o **Montador de Treinos** (gera o treino) e o **Montador
Individual** (monta a aula linha a linha). Nenhum dos dois resolve o caso que
este resolve: o coach que já sabe o treino de cabeça e escreve no quadro em dois
minutos, mas depois perde vinte digitando aquilo num formulário. Aqui o quadro
**é** a entrada.

## As quatro Cloud Functions

Todas em `functions/src/`, região `southamerica-east1`, acesso por
`token.admin === true` ou pela allowlist `EMAILS_COACH` (ver `exigirCoach` em
`index.ts`).

| Função | O que faz |
|---|---|
| `parseWorkoutLousa` | Quadro (JPEG/WEBP, qualidade 0,8) + texto ➔ treino estruturado, via OpenAI Vision |
| `checkWorkoutVariability` | Treino novo × últimos 7 dias ➔ alertas e sugestões de troca |
| `distributeWorkoutToStudents` | `matriz_individualizacao` ➔ ficha de cada aluno, gravada em lote |
| `aggregateVolumeMetrics` | Gatilho: recalcula o consolidado da semana e do mês a cada lousa salva |

A lógica pura de cada uma mora num módulo irmão (`lousa.ts`, `variabilidade.ts`,
`distribuicao.ts`, `volume-agregado.ts`), sem rede e sem Firebase, coberta por
`npm run checar` dentro de `functions/`.

## As regras globais do box

Aplicadas **depois** da leitura, de forma determinística, e registradas em
`treino.substituicoes` para o coach ver na prévia:

- Pull-up (e barra fixa, chin-up, pull ups…) ➔ **Puxada Alta Pegada Aberta**
- Corrida (e esteira, sprint, run…) ➔ **Airbike**

Ficam em código e não no prompt de propósito: a IA lê o que está escrito na
lousa, e o coach escreve "pull-up" porque é assim que ele fala. Se a regra
morasse só no prompt, um modelo distraído devolveria "pull-up" e ninguém saberia.

## As três canetas

A cor **é dado**, não decoração — e o prompt da função diz isso à IA:

| Caneta | Significado |
|---|---|
| Preto `#1A1A1A` | Títulos, exercícios e blocos (A Mobilidade, B Aquecimento, C Força, D Metcon) |
| Vermelho `#D32F2F` | Intensidade, RIR, descansos e observações de carga |
| Azul `#1976D2` | Séries, repetições, subdivisões da turma e estações dos 8 alunos |

Os cards do treino estruturado devolvem as mesmas cores (observação em vermelho,
série/repetição em azul), para o coach reconhecer o próprio quadro no resultado.

A quarta ferramenta da barra, **Texto**, não é caneta: ela tira o canvas do
caminho (`pointer-events: none`) para o coach digitar. Sem ela, um quadro com
canvas por cima é uma textarea em que é impossível clicar.

## Onde os dados moram

```
coaches/{uid}/lousas/{workoutId}                   o treino da lousa
coaches/{uid}/lousas/{workoutId}/fichas/{alunoId}  a ficha de cada aluno
coaches/{uid}/matriz_individualizacao/{alunoId}    lesões, restrições, 1RM
coaches/{uid}/volumeAgregado/{chave}               '2026-W38' e '2026-09'
treinoAluno/{email}                                a fatia que o Portal lê
lousaUso/{email}                                   cota diária (só a function escreve)
```

Tudo debaixo de `coaches/{uid}`, que a regra `match /{sub=**}` já cobre — a
ferramenta inteira nasceu **sem afrouxar uma linha de `firestore.rules`**.
`treinoAluno/{email}` é a exceção intencional: é a coleção que o aluno já lê no
Portal, e a regra dela já autoriza o coach a escrever.

### A matriz de individualização

```js
{
  nome: 'Ana Prado',
  email: 'ana@exemplo.com',          // sem e-mail, a ficha não chega ao Portal
  nivel: 'iniciante',                // iniciante | intermediario | avancado
  lesoes: [{
    regiao: 'joelho direito',
    evitar: ['agachamento'],         // casa por substring, nos dois sentidos
    substituir: [{ de: 'Agachamento Livre', para: 'Leg Press' }],
  }],
  restricoes: ['gestante'],
  rm1: { 'Agachamento Livre': 100 }, // kg
}
```

Restrição **sem** substituto tira o exercício da ficha e avisa — nunca some em
silêncio. Aluno sem 1RM recebe a orientação da lousa, nunca um número estimado.

## Como o volume é contado

Uma série conta **inteira** para cada grupamento que a lousa marcou. É diferente
do 1,0/0,5 de `compartilhado/regras/volume.js`, e de propósito: lá existe a
distinção entre músculo primário e secundário porque o catálogo da Academia a
carrega; aqui a lousa escrita à mão não distingue, e inventar um peso 0,5 para o
segundo grupamento seria precisão falsa.

Consequência: `totalSeries` (séries prescritas) **não** é a soma de `porGrupo`
(um exercício multiarticular credita mais de um grupo). São perguntas diferentes,
e o dashboard mostra cada uma no seu lugar.

A meta semanal padrão (10 séries por grupo) é o mesmo número que o aluno vê no
Portal — `META_SERIES_SEMANAIS.hipertrofia` em
`compartilhado/regras/metas-aluno.js`. `checar.ts` compara os dois no CI. O coach
sobrescreve por grupo em `coaches/{uid}.config.metasVolume`.

## Testes

```bash
node --test 'coach/montador-hibrido/core/*.test.js'   # a lógica pura do cliente
cd functions && npm run checar                        # os quatro módulos do servidor
node ferramentas/verificar-imports.mjs                # a fiação
```

`core/periodos.js` duplica de propósito a conta de semana ISO de
`functions/src/volume-agregado.ts` — são dois runtimes sem caminho entre eles. Os
dois testes fixam os mesmos casos de borda (virada de ano, segunda × domingo)
porque a divergência entre eles **não daria erro nenhum**: o gatilho gravaria em
`2026-W38`, a tela pediria `2026-W39`, e o dashboard ficaria eternamente
"consolidando".

## Limites conhecidos

- **A cota é de 40 leituras de lousa por dia** (`LIMITE_LOUSA`). É trava contra
  bug — clique duplo, retry de rede —, não limite de uso normal.
- **O desenho não sobrevive ao recarregar a página.** O rascunho local guarda
  texto, título, data e o treino já reconhecido; o canvas, não. São centenas de
  KB por lousa e o localStorage tem cota de poucos MB — duas lousas encheriam e a
  terceira derrubaria junto o rascunho de texto que cabia.
- **`aggregateVolumeMetrics` recalcula o mês inteiro a cada lousa salva.** Com o
  volume atual do box (dezenas de treinos por mês) isso é barato. Se um dia o
  histórico crescer a ponto de pesar, o caminho é um contador incremental por
  documento em vez da varredura — não está aqui porque otimizar antes de doer
  custaria a simplicidade de "recontar é sempre correto".
