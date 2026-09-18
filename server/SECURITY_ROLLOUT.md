# Sessão mobile e banimento — publicação e testes

## O que mudou

- Login continua validando credenciais no Supabase (ou pelo fluxo legado já existente, sem migrar/recriar contas). Depois emite um JWT HS256 da **API PetGo**, não um access token do Supabase.
- Token com validade de 12 horas, somente em memória no app. Ao expirar, pede novo login; não há refresh automático nesta etapa. Fechar/reabrir o app mantém o comportamento anterior de não persistir o perfil.
- Cada chamada protegida verifica assinatura, emissor, audiência, validade, existência do perfil, banimento e versão da sessão no banco. Banir/desbanir incrementa a versão; tokens anteriores não voltam a funcionar.
- Cadastro, confirmação/reenvio, solicitação de recuperação e redefinição continuam públicos. O token do link de recuperação continua sendo validado pelo Supabase. Nenhuma configuração de SMTP, redirect ou deep link foi modificada.
- Perfil, moedas, checkout e animais recebem a identidade validada pelo servidor, não o ID informado pelo cliente. Uploads só começam após autorização. Leitura de animais também exige sessão.
- Banimento vale para a próxima verificação de acesso no backend. Não há push para fechar imediatamente uma tela ociosa nem cancelamento retroativo de operações que já passaram pela autorização. O app limpa a sessão ao receber ACCOUNT_BANNED/SESSION_INVALID.
- Admin: banir/desbanir exige token Supabase + associação administrativa, protege contas ADM e não exclui dados. A tabela privada não é acessível pelos clientes anon/authenticated.
- Retorno `/auth/payment-success` ficou informativo: não permite mais alterar planos via query string. A confirmação permanece no webhook que consulta o pagamento na API do Mercado Pago. Validar o checkout no teste de regressão.

## Ordem obrigatória (ações manuais)

1. Revise o código. **Não publique apenas o backend e continue usando APK antigo**: chamadas sem token passam a receber 401.
2. No SQL Editor do Supabase, como proprietário, execute `server/sql/002_user_access.sql` após a migração 001 já existente. Ela adiciona apenas uma tabela privada; não apaga nem migra usuários.
3. Gere uma chave aleatória no seu terminal:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Cadastre esse valor **somente no Render**, como `MOBILE_JWT_SECRET`. Não envie a chave no chat, não coloque no Expo/Vite e não commite. Use o mesmo valor em todas as instâncias do backend. Trocar a chave invalida todas as sessões mobile.
5. Prepare o novo app, publique o backend e atualize o painel numa janela de teste coordenada. O login depende da tabela e da chave; sem elas falha de forma fechada. O novo app também exige backend atualizado.
6. Para Expo Go/dev client compatível já instalado, basta recarregar o JavaScript (`npx expo start`), pois não há nova dependência nativa. Para testar a versão instalada como APK, **gere e instale novo APK**. Links `petgo://` devem ser validados no build que registra esse esquema.

Não há novo serviço pago ou dependência npm. Não foi executada migração, deploy, commit, banimento ou exclusão em produção pelo assistente.

## Checklist de aceite real

- Criar conta, receber e-mail, confirmar e entrar. Reenviar confirmação. Senha incorreta não autentica.
- Recuperar senha, abrir link, redefinir e entrar com a senha nova; conferir que os redirects continuam corretos.
- Cadastrar/resgatar animal com foto, carregar próximos/mapa/resgatados, conferir moedas, perfil, minhas fotos e checkout.
- Com uma conta comum conectada no celular, banir no painel. Tentar uma chamada protegida: deve falhar e voltar ao login, sem executar a ação.
- Desbanir: token anterior deve continuar inválido; novo login deve funcionar. Recuperação de senha não remove banimento.
- ADM não pode ser banido pela API/painel. Usuário comum não pode chamar rotas administrativas.
- Abrir dois aparelhos para a mesma conta: banimento bloqueia novas chamadas de ambos.

## Validações e limites

Na pasta server: `node --test tests/*.test.js`. Na pasta admin: `npm.cmd run build`.

Os testes usam banco e Supabase simulados; não comprovam entrega SMTP, execução SQL no Supabase nem comportamento físico do Samsung. O bundle Expo não equivale a teste de APK.

Este trabalho protege identidade e banimento nas rotas mobile; não é uma auditoria completa das regras de moedas, planos ou pagamentos. Os valores/regras de negócio enviados pelo cliente e o armazenamento legado de senha preexistentes precisam de revisão separada. O banimento aqui é do acesso à API PetGo, não uma exclusão ou ban global da identidade no Supabase.

Rollback: backend e app devem voltar juntos para versões compatíveis. A tabela privada pode permanecer; não apague dados para reverter. Reverter o backend também retira a proteção de banimento.
