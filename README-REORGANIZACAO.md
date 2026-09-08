# Reorganização — o que falta quando você adotar esta versão

Esta cópia é a versão reorganizada do site. **Ela não está no ar.** O que está
publicado continua sendo `C:\Users\guil_\SITES`, com a estrutura antiga.

## Antes de publicar

1. **Apontar o `origin` para o GitHub.** Hoje ele aponta para a pasta local, de
   propósito: um `git push` distraído não alcança produção.
   ```
   git remote set-url origin https://github.com/BrakoDS/braconaro-garage-power-lab.git
   ```
2. **Repassar os links aos alunos.** O Portal mudou de `/aluno/` para
   `/painel-do-aluno/`. Quem instalou o Portal no celular precisa **reinstalar**:
   um app instalado guarda o endereço no momento da instalação, e redirecionar
   não resolve — ele sairia do próprio escopo e abriria como aba comum.
3. **Atualizar os comentários do app do celular.** Em `E:\PROJETOS-CLAUDE\garage-app`,
   catorze comentários citam `SITES/aluno/...` apontando o Portal web como fonte
   da verdade das fórmulas (TMB, TDEE, macros, cargas). Não são endereços, nada
   quebra — mas viram placa para rua que mudou de nome. Ficaram intocados de
   propósito: enquanto esta versão não é a publicada, eles descrevem a verdade.
4. **Conferir o gate do coach num navegador de verdade.** As quatro ferramentas
   estão atrás de senha e não deu para passar por ela aqui. O carregamento dos
   módulos foi verificado (nenhum 404), mas o comportamento depois do login não.

## As três provas

Rode as três antes de qualquer publicação. Elas são o que garante que a
reorganização não mudou o site:

```
node ferramentas/verificar-imports.mjs     # 475 caminhos
node ferramentas/comparar-render.mjs       # 21 telas byte a byte
node --test $(ls coach/montador-de-treino/core/*.test.js coach/montador-de-treino/ui/*.test.js coach/montador-de-treino/config/*.test.js painel-do-aluno/*.test.js compartilhado/regras/*.test.js garage-store/*.test.js)
cd functions && npm run build && npm run checar
```

O comando de teste inclui `config/*.test.js` e `garage-store/*.test.js`, que o
comando antigo **não incluía** — eram 319 testes rodando de 337 existentes.

## O que mudou de endereço

| Antes | Depois |
|---|---|
| `/aluno/` | `/painel-do-aluno/` |
| `/montador/` | `/coach/montador-de-treino/` |
| `/alunos/` | `/coach/gestao-de-alunos/` |
| `/academia/` | `/coach/academia/` |
| `/loja-gestao/` | `/coach/gestao-garage-store/` |
| `/loja/` | `/garage-store/` |

A home, `/coach/`, `/braconaro/` e `/icons/` não mudaram.
