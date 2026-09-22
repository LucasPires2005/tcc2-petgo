# Planos e PRO — backend de 30 dias

Atualização: a interface e o cancelamento ao fim do período foram implementados
no bloco seguinte. Consulte [CANCELAMENTO_ASSINATURAS.md](CANCELAMENTO_ASSINATURAS.md)
para a migração 004 e o roteiro atual. Os registros abaixo descrevem a entrega
original do backend (003).

## Estado desta entrega

Backend implementado e testes automatizados executados: 127 testes passaram,
incluindo os 113 anteriores. Testes antigos que exigiam o UPDATE simples foram
ajustados para verificar a ativação transacional e o registro da operação.
O GAP-WEBHOOK foi promovido à suíte principal. GAP-RESCUE continua pendente.

Não houve commit, deploy, execução de SQL no Supabase ou pagamento pelo assistente.
As transações foram testadas com adaptadores simulados. A migração e as consultas
precisam de validação no PostgreSQL real; não havia PostgreSQL local disponível.

## Regras

- Duração: 30 períodos de 24 horas em UTC, não mês de calendário.
- Mesmo plano vigente na aprovação: acrescenta 30 dias ao vencimento atual.
- Mudança de plano ou renovação vencida: aprovação + 30 dias.
- Benefício sem início e sem fim: LEGACY, ativo até a primeira nova compra.
- Datas parciais sem vencimento não são consideradas vitalícias.
- Aprovação Mercado Pago usa date_approved, nunca o status declarado pelo celular.
- Plano por nível e PRO por 50 Coins têm relógios independentes. Comprar PRO
  não estende plano e comprar plano não estende PRO.
- Registro e ativação ficam em uma transação, com lock da conta. No PRO, a
  mesma transação debita 50 Coins. Falha desfaz as três alterações.
- Cada pagamento mp:ID só é aplicado uma vez, tanto no webhook quanto na consulta.
- Eventos fora de ordem são projetados pela data de aprovação, a partir de um
  estado inicial privado, para não desfazer compras mais recentes.
- Retornos de pagamentos aprovados antes da migração não ativam um prazo novo.
  Uma reentrega antiga não é uma renovação. Faça pagamentos NOVOS para testar.

## Banco: executar antes de subir o backend

1. Revise e guarde uma cópia dos dados de teste relevantes.
2. Execute [003_subscription_validity.sql](../server/sql/003_subscription_validity.sql)
   no SQL Editor do Supabase, como proprietário. As migrações 001 e 002 já devem
   estar aplicadas (schema petgo_private existente).
3. O script adiciona premium_start_date, premium_end_date e premium_status.
   Se já existia PRO com datas no conjunto subscription_*, copia essas datas
   uma única vez para não perder esse prazo. Contas com datas nulas ficam intactas.
4. Cria tabelas privadas subscription_events, subscription_baselines e
   subscription_rollout. Nenhuma delas fica disponível ao navegador via RLS.
5. Somente então publique o backend. Nenhuma variável ou dependência nova.

IMPORTANTE: subir backend antes da migração pode quebrar consultas de perfil/login
por falta das novas colunas. Não crie políticas públicas para corrigir erros SQL.

Não apague registros de eventos para repetir um teste: isso remove a proteção
contra duplicidade. Use novos IDs de operação/pagamento e conta de teste.
Editar manualmente os prazos depois da primeira ativação não é uma ferramenta
de renovação: a projeção poderá recalculá-los pelos eventos na próxima compra.

## API e compatibilidade

GET /auth/update-status/:id e respostas de login/perfil retornam:

- subscription_start_date, subscription_end_date, subscription_status;
- premium_start_date, premium_end_date, premium_status;
- plan_tier e is_premium efetivos (zero quando vencidos).

Estados retornados: ACTIVE, EXPIRED, LEGACY e INACTIVE. O status armazenado é
atualizado na ativação; ao passar o prazo, o estado efetivo é calculado na leitura,
sem precisar de cron e sem apagar o histórico do nível anterior. Assim, uma linha
no Table Editor pode continuar com ACTIVE, mas a API já devolve EXPIRED.
O backend verifica a vigência para o multiplicador de moedas e no resgate.
Os filtros de plano do admin também consideram expiração.

POST /auth/upgrade-pro e /auth/subscribe-plan aceitam operationId: string de
16 a 100 caracteres (letras, números, underscore ou hífen). Uma nova compra gera
um ID; retry da mesma compra reutiliza o ID, inclusive após falha de rede.
Na simulação Pix, reutilizar ID com outro plano retorna 409. O ID é separado
por conta e por origem, não substitui JWT. Exemplo de corpo para PRO:

```json
{ "operationId": "ensaio-pro-00000001" }
```

O usuário é identificado pelo JWT, não por um ID confiado ao cliente.
Clientes sem operationId ainda podem ativar PRO inativo ou plano novo/vencido.
Renovar o mesmo benefício ativo exige operationId, para não cobrar por toques
repetidos de clientes antigos. A mensagem curta de PRO (“Saldo insuficiente.”)
foi preservada; uma mensagem específica de atualização pode ser refinada no
próximo bloco de frontend.

Mercado Pago continua Sandbox e a rota de assinatura direta é somente a
simulação acadêmica de Pix. Não representa confirmação bancária real.
Os limites de preço autoritativo, créditos livres e assinatura de webhook
continuam no roadmap; esta entrega não alega blindagem financeira completa.

## O que ainda falta no frontend

Nenhum código mobile foi modificado neste bloco. AuthContext.js e
upgradeFeedback.test.js já estavam pendentes do bloco anterior do Alert e foram
preservados. O ajuste manual da mensagem em auth.js também foi mantido em efeito.

Próxima etapa: enviar e persistir operationId, habilitar renovação explícita de
PRO/plano atual, apresentar “Válido até…” separadamente para plano e PRO, e
atualizar o perfil no retorno/foco. Hoje a tela de planos pode desabilitar o
botão do plano atual: backend pronto não significa botão de renovar pronto.

Para backend não é necessário APK novo. Para exibir datas/renovar na interface,
implementaremos o frontend e testaremos no Expo Go antes de distribuir APK.

## Ensaio após deploy

1. Entrar com conta de teste antiga sem datas: verificar que o benefício continua.
2. Comprar plano NOVO no Sandbox e retornar ao Expo Go: checkout e mensagem devem
   continuar funcionando; conferir subscription_end_date no Supabase (+30 dias).
3. Consultar checkout novamente: prazo não muda. Reenviar webhook: mesma regra.
4. Testar PRO numa conta sem PRO e com pelo menos 50 Coins: débito único e
   premium_end_date preenchida, sem alterar subscription_end_date.
5. Via cliente HTTP autenticado de teste, renovar com novo operationId; repetir
   exatamente o mesmo ID: não deve debitar nem prorrogar outra vez.
6. Para renovar plano vigente/trocar, use nova preferência Sandbox; o botão de
   renovação do mesmo plano será incluído no próximo bloco mobile.
7. Testar saldo insuficiente, login, confirmação, recuperação, Pix visual e loja.

## Rollback

Reverter o backend não exige apagar as colunas/tabelas adicionadas. Porém o código
anterior não respeita expiração nem registra novos eventos. Se houver pagamentos
durante esse intervalo, reconciliar antes de voltar a esta versão; rollback de
código não é rollback automático dos dados ou do histórico do provedor.

## Arquivos deste bloco

Modificados:

- server/db.js
- server/routes/auth.js
- server/routes/animals.js
- server/routes/createAdminRouter.js
- server/tests/adminUsers.test.js
- server/tests/checkoutRegression.test.js
- server/tests/checkoutReturn.test.js
- server/tests/gaps/businessRules.gap.js
- server/tests/helpers/routeFixture.js

Criados:

- server/services/subscriptions.js
- server/sql/003_subscription_validity.sql
- server/tests/dbTransaction.test.js
- server/tests/helpers/subscriptionTransaction.js
- server/tests/subscriptions.test.js
- docs/VALIDADE_PLANOS.md

## Referências técnicas

- [node-postgres: transações na mesma conexão](https://node-postgres.com/features/transactions).
- [Mercado Pago: data de aprovação do pagamento](https://www.mercadopago.com.br/developers/en/reference/online-payments/subscriptions/get-payment/get).
