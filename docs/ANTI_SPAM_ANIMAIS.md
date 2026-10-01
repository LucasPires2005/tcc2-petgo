# Anti-SPAM no cadastro de animais — Item D

## Implantação

1. Execute `server/sql/006_animal_creation_limits.sql` no SQL Editor do Supabase
   como proprietário, ANTES de publicar o backend.
2. Confira sucesso e publique o backend pelo procedimento habitual.
3. Não é necessário configurar nova variável, instalar dependência ou gerar APK.
   O mobile atual já apresenta o erro retornado pelo cadastro.

A migração adiciona somente uma tabela privada e seu índice; não modifica
animais, resgates, moedas ou contas. Depende do schema `petgo_private` existente.
Se a tabela ou o banco estiverem indisponíveis, o cadastro retorna 503 em vez de
ignorar a proteção. Consultas do mapa e rotas de resgate/exclusão não mudam.

## Regras

- Até 5 cadastros por usuário autenticado em uma janela móvel de 5 minutos.
- Até 20 por dia, de 00:00 a 00:00 no fuso `America/Sao_Paulo` (Brasília).
- Todas as contas seguem os mesmos limites; não existe bypass para apresentação.
- A contagem começa com os cadastros feitos depois da ativação deste controle.
  Não há reconstrução de autoria dos registros antigos.
- Resgatar ou excluir animais não libera cota: o controle usa um histórico
  privado independente de `animals."userId"`, que muda no resgate.
- São reservadas vagas antes da moderação e do upload para o Storage. O multipart
  local continua sendo validado pelo Multer antes dessa etapa.
- A admissão usa uma transação curta com advisory lock por usuário no PostgreSQL;
  não mantém o lock durante chamadas externas. Reiniciar o Render não zera a cota.
- Falhas conhecidas de moderação, upload ou INSERT liberam a reserva.
  Em queda do processo ou falha da liberação, a reserva permanece contabilizada
  até sair das janelas, evitando liberar vagas de operações de resultado incerto.
- O tempo da janela é o da admissão, calculado pelo banco, não o relógio do app.
- A limpeza remove histórico antigo daquele usuário ao admitir um novo cadastro;
  contas inativas podem conservar seus últimos registros pequenos de controle.

Quando bloqueado: HTTP 429, `code: ANIMAL_CREATION_LIMIT`, `retryAfter` em segundos
e header `Retry-After`. Havendo ambos os limites, o prazo cobre os dois.

## Teste manual (conta dedicada)

1. Cadastre cinco animais de teste consecutivamente: todos devem funcionar.
2. A sexta tentativa deve mostrar o aviso, sem criar animal ou foto no Storage.
3. Aguarde cinco minutos a partir das admissões iniciais e tente novamente.
4. Outra conta deve continuar cadastrando normalmente, mesmo enquanto a primeira
   está bloqueada. Não há limite global de demonstração.
5. Para validar 20 por dia, distribua os cadastros em grupos respeitando os cinco
   minutos; o 21º deve ser bloqueado até a próxima meia-noite de Brasília.
6. Revalide consulta do mapa, resgate e fluxo de exclusão já existente.

Não apagar o histórico do limitador para testar liberação por exclusão de animal.
Os testes automatizados simulam as transações; a execução real do SQL e o ensaio
de concorrência no PostgreSQL de homologação continuam sendo validação integrada.

## Testes locais

```powershell
npm.cmd --prefix server test
npm.cmd --prefix server run test:gaps
```
