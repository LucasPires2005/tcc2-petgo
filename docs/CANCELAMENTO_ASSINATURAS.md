# Interface de vigência e cancelamento ao fim do período

## Implantação: ordem obrigatória

1. Revisar e executar `server/sql/004_subscription_cancellation.sql` no Supabase
   (003 já aplicada). Adiciona somente subscription_cancelled_at e
   premium_cancelled_at; não altera saldos, datas de vencimento ou acesso.
2. Publicar o backend. Usando deploy automático do Render, é necessário **commit
   e push** dos arquivos do servidor.
3. Com o Render atualizado, executar `cd app` e `npx expo start --go --clear`.
   

Não publicar o backend antes do SQL: as novas colunas também são consultadas
nas respostas de perfil/login. Nenhuma variável ou dependência nova é necessária.
As datas/estados podem ser vistos com o backend anterior, mas o cancelamento
só funcionará depois da nova rota ser publicada.

## O que mudou

- Conta e Planos mostram Plano e PRO separadamente: “Válido até DD/MM/AAAA”,
  “Expirado”, “Cancelado (Acesso até DD/MM/AAAA)” ou benefício antigo sem prazo.
- A data ISO é convertida para o fuso local do aparelho. O prazo real continua
  sendo calculado pelo servidor; o relógio do aparelho só orienta a apresentação.
- Selos de Conta desaparecem quando o perfil indica EXPIRED ou o prazo passa.
  Há verificação local a cada segundo e na retomada do app.
- O perfil é atualizado em primeiro plano a cada minuto e ao retornar ao app.
  Leituras de perfil anteriores a uma alteração confirmada não sobrescrevem a
  nova resposta de ativação/cancelamento.
- Plano atual pode ser renovado pelo checkout Sandbox. PRO pode ser ativado ou
  renovado com confirmação explícita das 50 Coins, independentemente do plano.
- A função de Pix visual também envia operationId; não foi acrescentada cobrança
  Pix real ou alterado o checkout Mercado Pago para produção.

## Cancelamento

POST /auth/cancel-subscription, com JWT e corpo `{ "kind": "plan" }` ou
`{ "kind": "premium" }`. O servidor usa o usuário do JWT.

O registro usa lock/transação; repetir o cancelamento não altera o vencimento.
CANCELLED ainda concede o benefício até o instante final. Depois disso, a API
retorna EXPIRED e nível/PRO efetivos zero, sem depender de cron.

Nova aprovação após cancelamento reativa o benefício conforme as regras de
30 dias. Repetir um pagamento antigo, ou receber um webhook atrasado aprovado
antes do cancelamento, não apaga o cancelamento.

O Mercado Pago atual utiliza compras avulsas de teste, não assinaturas recorrentes.
Portanto, esta ação registra o cancelamento no PetGo; não cancela uma cobrança
automática no provedor, não estorna pagamentos e não cancela checkout pendente.
Uma compra pendente aprovada DEPOIS do cancelamento constitui nova ativação.

Legados sem prazo: não é possível cancelar “no vencimento” se ele não existe.
O botão não aparece, a tela explica que não há vencimento e o endpoint retorna
409 caso seja chamado diretamente. Não removemos esse acesso nem inventamos
uma data final. A primeira compra estabelece os 30 dias, como combinado.

## Identificador de operação

Coins/Pix usam um ID por intenção, persistido antes do envio. Falha de rede,
5xx e expiração de sessão mantêm o ID para retry inclusive após reiniciar o app.
Sucesso/rejeição definitiva liberam uma nova intenção. Há trava contra chamadas
simultâneas e separação por conta e URL da API. Trocar de sessão durante a leitura
do arquivo impede enviar a operação na conta nova.

Só ficam no arquivo o identificador e o tipo/parâmetros não secretos. JWT não
é persistido. Limpar os dados do aplicativo remove a pendência; antes de repetir
uma compra nessa situação, conferir saldo e vigência no perfil.

Se houver tentativa pendente de outro tipo/plano, é necessário repetir primeiro
a tentativa original. Não há botão para descartar silenciosamente uma cobrança
incerta. O checkout Mercado Pago mantém sua própria persistência de preferência;
o backend deduplica a ativação pelo ID de pagamento, não pelo ID de Coins/Pix.

## Teste manual no Expo Go

1. Fazer login: conferir datas separadas em Conta e Planos.
2. Renovar o plano atual no Sandbox: prazo aumenta 30 dias; repetir a consulta
   do mesmo pagamento não aumenta de novo.
3. Comprar/renovar PRO com saldo suficiente: debita 50 uma vez, não altera o
   vencimento do plano. Sem saldo, permanece o Alert do backend.
4. Cancelar Plano: conferir CANCELLED, vencimento inalterado e selos ainda ativos.
   Sair e entrar deve preservar a indicação de cancelamento.
5. Cancelar PRO e verificar independência dos dois benefícios.
6. Fazer nova compra após cancelar: o benefício volta a ACTIVE, com regra normal
   de renovação. Não usar um pagamento antigo para simular compra nova.
7. Para ensaiar expiração sem esperar 30 dias, usar EXCLUSIVAMENTE uma conta de
   teste dedicada e ajustar o vencimento correspondente no Supabase para um
   horário próximo. Recarregar perfil e observar remoção do selo e botão de
   reativação. Não usar essa edição manual para simular renovação: a projeção de
   eventos pode restaurar o prazo calculado na próxima compra.
8. Validar login, recuperação, confirmação de e-mail, loja, doação e Pix visual.

## Validação executada e limites

138 testes automatizados passando (127 anteriores + 11 novos).
Exportação Android/iOS concluída. Testes cobrem cancelamento repetido, legado,
expiração, erros, isolamento entre conta/benefício, webhook atrasado, persistência
do ID, timeout, troca de sessão e chamadas simultâneas.

Não foram feitos pagamentos reais, commits, deploy ou SQL remoto. Ainda é
necessário o ensaio visual no aparelho/Expo Go; exportação não substitui esse
teste. GAP-RESCUE continua fora deste bloco.

## Arquivos

Modificados:

- app/context/AuthContext.js
- app/screens/AccountScreen.js
- app/screens/SubscriptionScreen.js
- app/services/mobileApi.js
- server/routes/auth.js
- server/services/subscriptions.js
- server/tests/helpers/subscriptionTransaction.js
- server/tests/upgradeFeedback.test.js
- docs/VALIDADE_PLANOS.md

Criados:

- app/components/SubscriptionBenefits.js
- app/services/subscriptionApi.js
- app/services/subscriptionDisplay.js
- app/services/subscriptionOperations.js
- server/sql/004_subscription_cancellation.sql
- server/tests/subscriptionCancellation.test.js
- server/tests/subscriptionMobile.test.js
- docs/CANCELAMENTO_ASSINATURAS.md
