# Fase 1: rede de segurança de regressão

Data: 21/09/2026. Base anterior às alterações: commit `4e65b81`.

Esta etapa acrescenta testes e comandos locais. Não altera rotas, middleware, telas, autenticação, banco ou integrações em execução. Não requer migração, variável nova, deploy ou novo APK. Os commits continuam sob responsabilidade do autor do projeto.

## Como executar

Na raiz do repositório:

```powershell
npm.cmd --prefix server test
```

A suíte principal deve terminar com código de saída zero. Ela contém os 35 testes anteriores e 33 novos testes, totalizando 68. Não usa credenciais reais, não envia e-mails, não realiza pagamentos e não altera o Supabase.

Para executar as especificações que reproduzem problemas conhecidos:

```powershell
npm.cmd --prefix server run test:gaps
```

**Esse segundo comando falha atualmente em oito testes, com código de saída 1.** São requisitos ainda não atendidos pelo código atual, separados da regressão para não apresentar esses problemas como corrigidos. Não há `skip`, `todo` ou inversão de expectativas para torná-los verdes. Uma execução genérica de `node --test` pode descobrir testes fora da seleção pretendida. Use os comandos acima.

Depois de cada correção futura, adapte o simulador se o contrato de persistência mudar, confirme a especificação e mova o teste correspondente para a suíte principal. Não altere a expectativa para aceitar a falha.

## Resultados locais

| Verificação | Resultado |
| --- | --- |
| Suíte antes das alterações | 35 testes passaram |
| Suíte principal ampliada | 68 testes passaram, zero falhas, zero testes pulados |
| Especificações de lacunas | 8 falhas reproduzidas, detalhadas abaixo |
| Build do painel | Passou. Aviso de bundle acima de 500 kB, sem erro de compilação |
| Exportação Android/iOS | Passou para ambas as plataformas, em `app/dist/phase1-validation` |

Ambiente de execução dos testes: Node.js `24.11.1`. O servidor declara Node `22.x` para o Render. Esta execução não substitui uma futura validação na mesma versão 22.x. Nenhuma versão ou dependência foi atualizada. Os artefatos de compilação em `admin/dist` e `app/dist` são locais e ignorados pelo Git.

O build Vite precisou de execução fora da restrição inicial do sandbox, que impediu acesso a diretórios do compilador. O teste antigo `authSessionRegression.test.js` também emite um aviso de Promise entre contextos VM. Seus testes passam. O novo helper executa as funções no mesmo contexto para evitar esse aviso nos novos casos.

## Cobertura acrescentada

### Autenticação e recuperação

- Supabase rejeitando senha ou e-mail não confirmado não gera JWT nem escreve confirmação local.
- Falha SMTP no cadastro não cria perfil e devolve código identificável.
- Falha ao gravar perfil aciona a compensação da identidade recém-criada.
- Cadastro duplicado não chama `signUp`.
- Falha no envio de confirmação ou recuperação não retorna sucesso.
- E-mail normalizado chega ao provedor.
- Conta sem `auth_user_id` continua retornando “E-mail não encontrado”, sem migração automática.
- Token de recuperação expirado não altera senha.
- Falha ao atualizar senha no Supabase não atualiza a cópia local.
- Recuperação não remove banimento nem emite JWT mobile.
- Rotas reais impedem leitura ou exclusão de outra conta.

Os testes anteriores continuam verificando login bem-sucedido, redirects de e-mail, rotas públicas, JWT e banimento/desbanimento.

### Checkout e Coins

- Identidade do JWT prevalece sobre `userId` enviado pelo cliente.
- Quando o provedor devolve as duas URLs, a rota seleciona a URL Sandbox.
- Ausência de sessão impede chamada ao provedor.
- Falha no checkout não retorna sucesso nem detalhes internos do provedor.
- Webhook consulta o provedor e ignora uma aprovação declarada somente no corpo da notificação.
- Pagamentos pendentes, rejeitados e cancelados não atualizam plano.
- Pagamento aprovado usa a referência consultada no provedor.
- Notificação aceita o formato query e ignora outro tipo de evento.
- Páginas públicas de retorno não escrevem no banco.
- Coins debita a conta autenticada e preserva saldo quando ele é insuficiente.

O Mercado Pago está completamente simulado nesses testes locais, inclusive sua URL Sandbox. Não é uma execução de compra no Sandbox real. Pix continua visual e não foi alterado nem validado como liquidação financeira.

### Animais e imagens

- Rotas reais exigem token antes de upload e consultas de negócio.
- Lista pessoal não permite consultar outra conta.
- Cadastro multipart usa a identidade autenticada e preserva coordenadas.
- Moderação precede upload e gravação.
- Rejeição e indisponibilidade da moderação impedem upload e escrita tanto no cadastro quanto no resgate.
- Falha do Storage impede gravar resgate e conceder moedas.
- Resgate usa o resgatador autenticado e o multiplicador do plano.

### Sessão no cliente

- Resposta de uma sessão antiga não invalida o novo login.
- Perfil recebido depois do logout é descartado.
- Falha de rede ou erro de autorização de negócio não encerra indevidamente a sessão.
- Sessão inválida atual notifica uma vez e remove o Bearer.

## Oito lacunas reproduzidas

| ID | Resultado exigido pelo teste | Comportamento observado com dependências simuladas |
| --- | --- | --- |
| GAP-CHECKOUT: preço | Rejeitar preço negativo antes do provedor | A preferência recebe o valor sem validação local |
| GAP-CHECKOUT: tipo | Rejeitar tipo desconhecido | O tipo é ignorado |
| GAP-CHECKOUT: plano | Rejeitar plano inexistente | O plano é encaminhado sem validação local |
| GAP-TYPE: produto | Compra de produto não escrever plano | Tenta atualizar plano a partir de referência sem plano válido |
| GAP-TYPE: doação | Doação não escrever plano | Tenta atualizar plano a partir de referência sem plano válido |
| GAP-WEBHOOK | Processar uma notificação repetida apenas uma vez | Executa a atualização duas vezes |
| GAP-RESCUE | Não repetir recompensa no mesmo resgate | Saldo simulado sobe de 100 para 200 e depois 300 |
| GAP-COINS | Custo negativo não aumentar saldo | A operação aceita custo negativo |

Repetir uma atribuição do mesmo plano não duplica o nível do plano. O teste do webhook demonstra ausência de deduplicação da escrita, relevante antes de acrescentar outros efeitos ao processamento.

O banco simulado aceita as escritas para observar as tentativas da rota. Não comprova que PostgreSQL aceitaria um plano inválido, nem que Mercado Pago aceitaria preço negativo. A lacuna identificada é a falta de validação antes dessas integrações. O simulador de resgate não é um interpretador SQL nem valida transações ou concorrência. Mudanças nessa persistência exigirão testes próprios contra PostgreSQL de teste.

## Limites e aceite manual

Os testes carregam as rotas reais do Express em servidores locais efêmeros. O helper substitui banco, Auth, Storage, Mercado Pago e moderação por objetos controlados. Imports não previstos no helper falham para evitar carregar acidentalmente uma integração real. As imagens multipart contêm bytes sintéticos e verificam o transporte, não a classificação de uma fotografia.

Os testes do cliente executam `mobileApi.js` sem renderizar React Native. Não comprovam tela, layout, execução de listeners no aparelho, configuração SMTP, políticas reais do Supabase nem o ciclo completo de pagamento.

Pendente de teste manual, usando somente contas e registros descartáveis:

- [ ] Registrar dispositivo, versão do APK e commit do backend usado no ensaio.
- [ ] Criar conta, receber e-mail, confirmar e entrar.
- [ ] Recuperar senha com app fechado e aberto, redefinir e entrar com a nova senha.
- [ ] Conferir mapa, proximidade e formulário com teclado no aparelho físico.
- [ ] Cadastrar e resgatar animal com foto inofensiva.
- [ ] Comprar com Coins e visualizar Pix demonstrativo.
- [ ] Executar checkout com contas Sandbox e registrar retorno atual, inclusive a pendência do aviso de entrega/retirada.
- [ ] Banir conta comum com sessão aberta, provocar nova requisição e conferir bloqueio.
- [ ] Desbanir e conferir que apenas novo login restaura o acesso.

Não é necessário gerar APK por causa desta fase: o JavaScript do aplicativo e suas dependências permanecem iguais. A exportação do bundle é apenas uma verificação de compilação.

## Arquivos desta etapa

- Modificado: `server/package.json`, somente scripts de teste.
- Criado: `server/tests/helpers/routeFixture.js`.
- Criado: `server/tests/authFailures.test.js`.
- Criado: `server/tests/checkoutRegression.test.js`.
- Criado: `server/tests/animalsRegression.test.js`.
- Criado: `server/tests/mobileSessionRace.test.js`.
- Criado: `server/tests/gaps/businessRules.gap.js`.
- Criado: `docs/TESTES_FASE1.md`.

Próximo bloco proposto: corrigir contrato e retorno do checkout Sandbox, usando as especificações desta fase como ponto de partida e mantendo as regressões de autenticação passando.
