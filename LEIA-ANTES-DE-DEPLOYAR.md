# Esta pasta NÃO faz deploy

O deploy das Cloud Functions do Garage Power Lab sai de **`teste-hibrido/`**,
que é a fonte da verdade desde 20/09/2026.

## Por que isto foi travado

`site/` e `teste-hibrido/` são clones do MESMO repositório
(`BrakoDS/braconaro-garage-power-lab`), em branches diferentes — aqui
`etapa5a-portal`, lá `master` — e os dois apontavam para o MESMO projeto
Firebase (`projeto-garage-f0a2f`).

O `functions/src/index.ts` daqui parou em setembro/2026 com 4 funções. O da
master tem 9. Um `firebase deploy --only functions` disparado desta pasta
sobrescreveria as funções de produção com uma versão antiga e derrubaria as 5
que só existem na master (lousa, volume, variabilidade, distribuição de treino).
Não era hipótese: bastava rodar o comando no diretório errado.

## O que foi feito

- `.firebaserc` aponta para um id de projeto inválido (tem maiúsculas, que o
  Firebase não aceita), então o CLI para antes de tocar em qualquer coisa;
- a seção `functions` saiu do `firebase.json`, então não há o que deployar
  mesmo que alguém corrija o `.firebaserc` sem ler isto.

São duas travas porque uma só seria fácil de desfazer por engano.

## Se precisar reativar

Não reative. Use `teste-hibrido/`. Se um dia esta pasta voltar a ser a fonte da
verdade, traga o `functions/src/` da master junto — não só a configuração.
