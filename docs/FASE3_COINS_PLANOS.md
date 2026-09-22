# Fase 3 — moedas e proposta de vigência

## Implementado: proteção numérica das rotas de moedas de auth

`add-coins`, `buy-product`, `donate` e `redeem` rejeitam números negativos,
zero, frações, strings, booleanos, objetos e quantidades acima de 2147483647.
Em `add-coins`, apenas a omissão de baseAmount mantém o padrão anterior de 10.
As demais rotas exigem a quantidade. `upgrade-pro` continua custando 50.

O débito utiliza UPDATE condicionado ao saldo, com RETURNING, no adaptador
PostgreSQL já existente. Não há SELECT seguido de sobrescrita de saldo.
O upgrade condiciona também a ausência de PRO, para não cobrar duas vezes.
Créditos calculam o multiplicador no próprio UPDATE e verificam o limite.
Falhas de escrita retornam erro, sem cupom ou confirmação de sucesso.
JWT e identidade continuam sendo validados pelo middleware existente.

Não há migração, dependência, variável de ambiente ou alteração mobile neste
bloco. Não exige novo APK. Após revisão e deploy do backend, testar com uma
conta de ensaio no app atual. Nenhum commit ou deploy foi feito pelo assistente.

## Validação e limites

Executar na raiz: `npm.cmd --prefix server test`.
Os testes de concorrência usam adaptador simulado; não substituem ensaio com
PostgreSQL real. O teste de regressão da compra foi ajustado para verificar
o débito condicional, em vez de exigir a antiga sobrescrita insegura do saldo.
O GAP-COINS foi promovido à suíte principal. Webhook e resgate duplicados
continuam no comando `npm.cmd --prefix server run test:gaps`.

O PostgreSQL reavalia a condição de UPDATE ao disputar uma linha alterada
concorrentemente: [documentação oficial](https://www.postgresql.org/docs/17/transaction-iso.html).

Esta é proteção numérica, não autorização completa da economia:

- O cliente ainda informa o custo positivo de produtos e recompensas. Precisamos
  de catálogo autoritativo no servidor e identificadores no contrato mobile.
- `/add-coins` ainda aceita créditos solicitados pelo usuário autenticado.
  Não há chamada de awardCoins nas telas atuais, mas a função é exposta pelo
  contexto. Recomenda-se desativar esse endpoint público ou vinculá-lo a eventos
  verificados e únicos. Não foi removido silenciosamente para preservar contratos.
- O crédito de resgate em animals.js continua no próximo bloco: hoje pode repetir
  recompensa e confirmar resgate mesmo após falha ao creditar. A correção deve
  tornar resgate e recompensa uma operação transacional e única, não apenas
  mudar a mensagem após uma gravação parcial.
- Não foram corrigidos saldos antigos nem aplicada constraint global no banco.

## Próximo bloco proposto: planos de 30 dias

Proposta para revisão: prazo fixo de **30 dias**, não mês de calendário (que
pode ter 28–31 dias). Manter Mercado Pago exclusivamente Sandbox.

1. Confirmar existência e tipos de subscription_start_date,
   subscription_end_date e subscription_status no Supabase. A arquitetura lista
   esses campos como informados, não como esquema confirmado. Preferir timestamptz.
2. Centralizar ativação utilizada por webhook e checkout-status. Registrar ID
   único do pagamento e aplicar ativação em transação. Repetir callback/consulta
   não pode recalcular início nem estender vencimento. Isso antecipa GAP-WEBHOOK.
3. Usar a data de aprovação confirmada pelo provedor como início e somar 30 dias
   em UTC. Não usar o relógio do celular nem o momento de cada polling.
4. Definir antes da implementação a renovação antecipada: substituir prazo por
   30 dias desde a nova aprovação ou acrescentar ao prazo vigente. Recomenda-se
   acrescentar em renovação do mesmo plano; mudança de tier precisa de regra
   explícita. Planos atuais sem datas não devem expirar arbitrariamente.
5. Revisar também subscribe-plan (simulação Pix), upgrade-pro (Coins) e a
   coexistência is_premium/plan_tier. Hoje não são um estado único; decidir quais
   benefícios têm vigência antes de unificar. Pix permanece uma simulação declarada.
6. Retornar datas e estado efetivo nas respostas de login, perfil e atualização
   de status, sem mudar credenciais, JWT ou redirects de e-mail.
7. Verificar vigência no servidor ao conceder benefícios, incluindo multiplicador
   de moedas e filtros administrativos. Um tier antigo não deve liberar vantagem
   após expirar. Não depender do celular aberto ou de cron gratuito no Render.
8. No mobile, mostrar em Conta e Planos: “Válido até DD/MM/AAAA”, com horário local
   quando relevante, e estado “Expirado”. Mostrar também a data na listagem admin.
9. Testar virada de mês, expiração, pagamento repetido, concorrência entre webhook
   e consulta, erro de banco, renovação e contas preexistentes sem data.

Nenhuma alteração de validade ou de interface foi implementada nesta etapa.
