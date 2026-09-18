# PetGo Admin — acesso administrativo

Aplicação web independente de `app/` e `server/`, com React, Vite, Tailwind 3, React Router e autenticação Supabase.

## Rodar a estrutura já criada

Na raiz do repositório (PowerShell):

```powershell
cd admin
npm.cmd install
npm.cmd run dev
```

Use Node 22.12+ na série 22 ou Node 24+. `npm.cmd` evita o bloqueio de `npm.ps1` em alguns ambientes Windows.

```powershell
npm.cmd run build
npm.cmd run preview
```

## Comandos equivalentes para começar do zero

Referência apenas: **não execute o scaffold sobre a pasta admin já criada**.

```powershell
npm.cmd create vite@latest admin -- --template react
cd admin
npm.cmd install
npm.cmd install react-router-dom@7 @supabase/supabase-js@2
npm.cmd install -D tailwindcss@3 postcss autoprefixer
npx.cmd tailwindcss init -p
```

Tailwind 3 foi escolhido para usar `tailwind.config.js`, `postcss.config.js` e as diretivas `@tailwind` solicitadas. A instalação de Tailwind 4 é diferente.

## Configurar o acesso (etapa 2)

1. No SQL Editor do Supabase, revisar e executar `server/sql/001_admin_access.sql`. O script cria `petgo_private.admin_users`, com RLS e sem acesso para `anon`/`authenticated`. Não altera as tabelas mobile nem promove contas automaticamente. Manter esse schema fora dos schemas expostos na Data API.
2. Usar uma conta com e-mail confirmado em Authentication > Users (pode ser sua conta existente). Copiar o UUID de Auth, não o ID numérico de `public.users`.
3. No final do SQL há um INSERT comentado. Executar separadamente, substituindo `UUID-DA-SUA-CONTA` pelo UUID escolhido. O RETURNING deve retornar uma linha; se retornar zero, conferir UUID e confirmação de e-mail.
4. Publicar as alterações do servidor no Render pelo seu fluxo de commit/push. O backend usa as variáveis existentes `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `DATABASE_URL`. A conexão do banco deve ser a proprietária usada no SQL ou ter SELECT autorizado explicitamente na tabela privada; não conceder acesso ao navegador. Sem a tabela ou permissão, `/admin/me` falha fechado com 503 e registra um código no Render.
5. Na raiz do repositório, executar `Copy-Item admin/.env.example admin/.env.local`. Preencher a URL do mesmo projeto Supabase e a chave pública **publishable** (ou a antiga chave `anon`) em `VITE_SUPABASE_PUBLISHABLE_KEY`. Não usar a chave secret/service_role.
6. Executar `cd admin` e `npm.cmd run dev`. Após editar `.env.local`, reiniciar o Vite. Entrar com e-mail e senha da conta autorizada.

O `.env.example` é um modelo versionado. O `.env.local` é ignorado pelo Git. Variáveis `VITE_` fazem parte do JavaScript público do navegador. Em produção, essas variáveis serão configuradas na Vercel, não no serviço backend do Render.

Não é necessário mudar SMTP, redirects mobile ou criar novas chaves secretas. Este painel usa login por e-mail/senha; recuperação continua no aplicativo nesta etapa.

## Escopo atual

- Rotas `/login`, `/dashboard`, `/usuarios`, `/animais` e página não encontrada.
- Layout responsivo e páginas de preparação, sem dados fictícios ou reais.
- Login com Supabase, restauração/renovação de sessão e logout local (não desconecta outros dispositivos).
- Rotas protegidas após confirmação de `/admin/me`; usuário comum recebe acesso negado.
- Backend valida o token com `getUser(token)` e consulta a tabela privada a cada chamada administrativa.
- Dashboard com contagens reais de `public.users` e `public.animals`, consultadas por `GET /admin/summary`. O total de animais inclui todos os status; o de usuários conta perfis PetGo, não todas as contas de `auth.users`.
- Atualização manual, horário da consulta, estado vazio e mensagens de erro. Em falhas de atualização, as últimas contagens ficam identificadas como antigas; 401/403 bloqueiam a tela e retornam ao login.
- Gestão de usuários e animais continua em preparação, sem operações de exclusão/banimento.

## Arquitetura de autorização

O Supabase Client faz o login. O backend valida token e associação na tabela privada, sem confiar em `user_metadata`, ID ou papel enviado pelo cliente. As futuras rotas de gestão devem ser adicionadas ao router `server/routes/admin.js`, depois do middleware. Apenas esconder rotas no React não protege o banco.

Se houver leituras diretas pelo navegador no futuro, deverão ter políticas RLS revisadas. Não liberar tabelas administrativas publicamente.

Nunca colocar `SUPABASE_SECRET_KEY`, `service_role`, senha SMTP ou `DATABASE_URL` no frontend. As rotas mobile existentes não passam a ser protegidas por esta mudança: antes de implementar banimento e gestão, será necessário revisar a autorização dessas rotas também.

## Verificação

Na raiz: `node --test server/tests/requireAdmin.test.js server/tests/adminSummary.test.js`. Os testes usam dependências simuladas e não acessam o Supabase. Os testes de resumo fazem requisições HTTP a um servidor efêmero apenas no localhost. Na pasta admin: `npm.cmd run build`.

Para testar o dashboard, publicar primeiro a nova rota do backend no Render. Depois, abrir o admin, conferir contagens contra `SELECT COUNT(*) FROM public.users;` e `SELECT COUNT(*) FROM public.animals;` no SQL Editor e usar Atualizar contagens. Esta etapa não exige nova migração, variável de ambiente ou build mobile. Não há consulta direta do navegador às tabelas.

Após configurar o ambiente, validar: admin entra; conta comum é negada; atualizar a página restaura a sessão; Sair volta ao login; abrir `/usuarios` sem sessão redireciona; revogar a associação no SQL bloqueia novas chamadas ao backend (a tela já aberta pode permanecer até recarregar/verificar de novo). O login real e a migração SQL precisam ser validados no projeto do usuário.

## Vercel (futuro)

Configurar o projeto com Root Directory `admin`, Build Command `npm run build` e Output Directory `dist`. O `vercel.json` permite atualizar URLs de rotas do React Router. Configurar variáveis públicas no ambiente da Vercel quando o login estiver implementado. Nenhum deploy foi realizado nesta etapa.
