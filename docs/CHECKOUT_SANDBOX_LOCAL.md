# Fase 2: checkout Sandbox e teste local

## O que mudou

A API valida preço positivo com até duas casas decimais, quantidade, tipo (`plan`, `store_purchase`, `donation`), plano e dados de retirada/entrega antes de chamar o Mercado Pago. A identidade vem do JWT. Planos do aplicativo anterior, sem `type`, continuam aceitos quando possuem um `planTier` válido.

A preferência guarda a intenção em `metadata`: usuário PetGo, tipo, título, valor em centavos e os dados logísticos. Não foi criada tabela nem migração. Cada checkout explicitamente tipado recebe uma referência aleatória própria. A compatibilidade com planos antigos mantém a referência `usuário_plano`.

`GET /auth/checkout-status?preferenceId=...` exige JWT, lê a preferência no Mercado Pago, confere a propriedade e busca seus pagamentos. A resposta só informa aprovação quando encontra referência, moeda BRL, valor e data compatíveis. Produto e doação não atualizam o plano. Um plano aprovado pode ser sincronizado nessa consulta, mesmo se o webhook ainda não chegou. O webhook continua aceitando referências antigas válidas e novas, atualizando apenas planos.

O aplicativo salva localmente o ID da preferência e a URL de checkout, associados ao usuário e à URL da API. Endereço fica na preferência no provedor. Nenhum JWT ou chave secreta é salvo pelo acompanhamento. Após encerrar e reabrir o app, faça login na mesma conta para restaurar a compra pendente. Apagar os dados do Expo Go/aplicativo remove esse identificador local.

Um único contexto de checkout acompanha planos, doações e produtos. Ao voltar do navegador, consulta a API e mostra uma mensagem específica. Também há “Verificar”, “Abrir pagamento” e “Dispensar”. O acompanhamento permite uma preferência pendente por conta/ambiente nesse dispositivo. Dispensar não cancela nem estorna pagamentos. Polling automático ocorre somente em primeiro plano, até oito consultas periódicas por janela de retorno, além da consulta inicial. O botão continua disponível depois.

Pix visual e operações com Coins permanecem como estavam. O contexto de autenticação recebeu somente a URL configurável da API. Cadastro, confirmação e recuperação não tiveram suas regras ou redirects alterados.

## Antes de começar

Use Node 22.x, conforme `server/package.json`, ou o Node local compatível já instalado. Os testes automatizados desta máquina foram executados com Node 24.11.1.

O teste manual precisa de:

- Expo Go compatível com o SDK do projeto no celular ou emulador. Pode ser o iPhone disponível. Nenhum módulo nativo novo foi instalado nesta fase.
- As credenciais do Supabase usado para teste e o acesso SQL já configurado.
- As mesmas credenciais do vendedor de teste da integração Mercado Pago Sandbox que já funcionava e uma conta compradora de teste distinta. Não é necessário alterar para cobrança real nem trocar as credenciais atuais no Render.
- `cloudflared` instalado para publicar temporariamente a API local por HTTPS. A instalação é externa ao projeto. Consulte o [download oficial](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).

“Backend local” significa que o Node executa na sua máquina. O banco continua sendo o Supabase apontado em `DATABASE_URL`. Se usar o banco atual, testes de planos alteram o plano da conta escolhida. Use uma conta PetGo descartável e endereços fictícios.

## 1. Rodar a regressão

Na raiz:

```powershell
npm.cmd --prefix server test
```

Os cinco testes `GAP-CHECKOUT`/`GAP-TYPE` foram promovidos para `checkoutValidation.test.js` na suíte principal. Os 68 testes originais permanecem nela.

Resultado desta implementação: **96 testes passando, sem falhas ou testes ignorados** na suíte principal. A exportação de bundles Android e iOS também passou. Isso não substitui o ensaio manual de pagamento Sandbox descrito abaixo, que ainda precisa ser realizado.

```powershell
npm.cmd --prefix server run test:gaps
```

O segundo comando ainda falha nas três pendências fora deste bloco: deduplicação de webhook, recompensa de resgate repetido e custo negativo de Coins. Essas falhas não foram ocultadas nem corrigidas nesta fase.

## 2. Preparar o arquivo privado do backend

Crie `server/.env` usando [server/.env.example](../server/.env.example) como modelo. Se o arquivo já existir, revise somente o que falta, sem sobrescrever seus valores.

Preencha localmente `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MOBILE_JWT_SECRET` e `MERCADO_PAGO_ACCESS_TOKEN`. Mantenha também as variáveis Sightengine se testar uploads. Use a configuração JWT já funcional. Nenhum segredo deve entrar no `app/.env.local`.

`server/.env` já é ignorado pelo Git. O Node será iniciado com `--env-file=.env`, pois o projeto não usa dotenv automaticamente. Variáveis já existentes no terminal têm precedência sobre esse arquivo.

## 3. Abrir a URL HTTPS temporária

Em um terminal dedicado:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Copie a URL HTTPS `https://...trycloudflare.com` exibida. É normal não responder até o Node iniciar. Mantenha o terminal aberto. O Quick Tunnel é gratuito e destinado a testes, conforme a [documentação da Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

O túnel encaminha tráfego público para seu Node local. O Mercado Pago precisa alcançá-lo para páginas de retorno e webhook. `localhost` no telefone é o próprio telefone, e não seu computador.

## 4. Configurar o retorno e iniciar o backend

Em `server/.env`, defina a URL copiada:

```dotenv
PUBLIC_API_URL=https://SUA-URL.trycloudflare.com
PORT=3000
```

Em outro terminal, a partir da raiz:

```powershell
cd server
node --env-file=.env index.js
```

Abra a URL HTTPS no navegador do celular. Ela deve mostrar “API PetGo 2.0 Rodando”. Só avance depois disso. Confira também a mensagem de conexão ao Supabase no terminal.

Sem `PUBLIC_API_URL`, o código usa a URL atual do Render. Para este ensaio local, configure obrigatoriamente a URL do túnel. Reinicie o Node depois de mudá-la.

## 5. Apontar o Expo para o backend local

Crie `app/.env.local` usando [app/.env.example](../app/.env.example) como referência:

```dotenv
EXPO_PUBLIC_API_URL=https://SUA-URL.trycloudflare.com
```

A URL deve ser a mesma do passo anterior. Esse arquivo também é ignorado pelo Git. `EXPO_PUBLIC_` é configuração pública incorporada ao aplicativo, nunca lugar para segredos.

Em um terceiro terminal, partindo da raiz:

```powershell
cd app
npx expo start --clear
```

Abra pelo QR Code no Expo Go ou pressione `a` se já tiver um emulador compatível aberto. Para o Metro, celular e computador devem conseguir se comunicar, normalmente na mesma rede. O túnel da API não é um túnel do Metro.

Se o projeto abrir em development build em vez de Expo Go, use `npx expo start --go --clear`. Se o Expo Go instalado não suportar o SDK do projeto, esse é um requisito de compatibilidade do cliente, não um erro do checkout. Não atualize dependências do projeto automaticamente para contornar isso.

Faça login com a conta PetGo de teste. Login, perfil, animais e checkout agora usam a mesma URL configurada. JWT continua restrito ao destino da API configurado.

## 6. Testar retirada e entrega

1. Em Conta, abra um produto da loja.
2. Escolha “Retirar em ONG” e selecione uma unidade.
3. Escolha Mercado Pago. O navegador deve abrir o checkout Sandbox.
4. Conclua com o comprador e os dados de teste que já utiliza na integração.
5. Volte manualmente ao **Expo Go pelo seletor de aplicativos**. Não dependa do botão `petgo://`, que se destina ao app instalado.
6. Aguarde a consulta. O aviso deve mostrar produto, unidade de retirada e identificador de pagamento confirmado pelo provedor.
7. Caso apareça “Aguardando pagamento”, espere alguns segundos e use “Verificar”. Uma demora de indexação no provedor não deve virar aprovação fictícia.
8. Volte ao navegador e ao app novamente. O aviso aprovado não deve aparecer duas vezes.
9. Repita com “Receber em Casa” e endereço fictício. O aviso deve mostrar o endereço escolhido, não uma mensagem de plano ou doação.

Essas mensagens representam a simulação acadêmica. Não há transportadora integrada nem entrega física organizada por este código. Nenhum rastreio fictício novo é gerado no fluxo Mercado Pago.

## 7. Testar os outros caminhos

- **Plano:** escolha um plano diferente do atual, pague no Sandbox e volte ao app. Deve mostrar “Plano ativado” e atualizar o perfil. A tela de planos permanece disponível, com o plano atualizado.
- **Doação:** abra Apoiar em um animal, faça um pagamento de teste e volte. Deve agradecer pelo apoio, sem alterar `plan_tier`.
- **Sem pagar:** abra checkout e volte antes de concluir. Deve continuar pendente, sem pop-up de aprovação.
- **Recusado:** use um cenário de rejeição do ambiente de teste. Deve mostrar que o pagamento não foi aprovado.
- **App encerrado:** crie uma preferência, encerre o app, conclua o teste no navegador e reabra o projeto. Faça login na mesma conta e verifique a restauração do acompanhamento.
- **Backend reiniciado:** mantenha a mesma URL do túnel e reinicie somente o Node antes de voltar ao app. A intenção deve continuar disponível nos metadados da preferência.
- **Rede indisponível:** volte ao app sem rede. Deve manter o acompanhamento e permitir consultar novamente ao reconectar.
- **Outra conta:** sair e entrar em outra conta não deve mostrar os dados da compra anterior.
- **Pix/Coins:** confira que os fluxos anteriores continuam disponíveis. Pix continua visual.

Use “Dispensar” para liberar um teste abandonado. Se dispensar e depois pagar aquela preferência, o app não acompanhará mais o aviso local. O webhook de planos ainda pode processar o pagamento.

## 8. Finalizar o ensaio

Pare os terminais com Ctrl+C. Para voltar ao Render, retire `EXPO_PUBLIC_API_URL` do arquivo local/ambiente e reinicie o Expo com `--clear`. Não leve a URL temporária para um APK de distribuição.

Se reiniciar o túnel e receber outro domínio, atualize os dois arquivos de ambiente, reinicie Node e Expo e crie outra preferência. Preferências antigas mantêm as URLs de retorno antigas. O acompanhamento local é separado por endereço de API.

Somente depois da revisão e do ensaio manual faça seu commit. Nenhum commit, deploy ou pagamento real foi realizado pelo assistente. Para testar estas alterações em Expo Go não é necessário APK novo. Para levar a correção a um APK já instalado, futuramente será necessário distribuir uma atualização compatível.

## Limites deste bloco

- Persistência da intenção no Mercado Pago não é um histórico completo de pedidos no PetGo.
- A retomada depende do arquivo local e da mesma conta/API. Limpar os dados do aplicativo ou mudar de dispositivo não restaura o identificador automaticamente.
- A remoção do acompanhamento e a exibição de Alert não constituem uma transação: encerrar o processo exatamente entre esses passos pode impedir a visualização do aviso, mas não perde a preferência no provedor.
- Clientes antigos sem dados logísticos continuam aceitos, com mensagem genérica. O app atualizado sempre envia os dados de entrega para compras de produtos.
- Consultas e webhooks de plano ainda usam atribuição de `plan_tier`, sem livro de eventos, ordenação global ou idempotência persistente. Isso permanece no roadmap.
- Validação de formato/valor não é catálogo de preços no servidor. O preço continua enviado pelo app, como antes. Catálogo autoritativo faz parte da fase de regras de negócio.
- Assinatura de webhook e conciliação financeira completa continuam fora desta etapa Sandbox.
- A compatibilidade dos fluxos de e-mail continua coberta pela regressão, mas os links `petgo://auth/...` mantêm sua configuração atual. Esta estratégia de retorno manual do checkout não transforma Expo Go em um APK para testar todos os deep links de autenticação.

## Referências

- [Mercado Pago: URLs de retorno](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/configure-back-urls).
- [Mercado Pago: consulta da preferência](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/get-preference/get).
- [Expo: links para o aplicativo e Expo Go](https://docs.expo.dev/linking/into-your-app/).
- [Expo: variáveis de ambiente](https://docs.expo.dev/guides/environment-variables/).

## Arquivos alterados

- `server/routes/auth.js`
- `server/tests/helpers/routeFixture.js`
- `server/tests/gaps/businessRules.gap.js`
- `app/App.js`
- `app/context/AuthContext.js` (somente importação e definição da URL)
- `app/screens/AccountScreen.js`
- `app/screens/MapScreen.js`
- `app/screens/SubscriptionScreen.js`
- `app/services/api.js`
- `app/services/mobileApi.js`
- `docs/TESTES_FASE1.md`

## Arquivos criados

- `server/services/checkout.js`
- `server/.env.example`
- `server/tests/checkoutReturn.test.js`
- `server/tests/checkoutMobile.test.js`
- `server/tests/checkoutValidation.test.js`
- `server/tests/mobileApiEnvironment.test.js`
- `app/context/CheckoutContext.js`
- `app/services/checkoutVerification.js`
- `app/.env.example`
- `docs/CHECKOUT_SANDBOX_LOCAL.md`
