# PetGo Admin — etapa 1

Aplicação web independente de `app/` e `server/`, com React, Vite, Tailwind 3 e React Router. Supabase Client incluído como dependência para a próxima etapa.

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

## Escopo atual

- Rotas `/login`, `/dashboard`, `/usuarios`, `/animais` e página não encontrada.
- Layout responsivo e páginas de preparação, sem dados fictícios ou reais.
- Nenhuma autenticação ou autorização implementada nesta etapa; rotas são prévias públicas.
- Nenhuma chamada ao Supabase ou ao backend e nenhuma operação administrativa disponível.

## Próxima etapa: acesso administrativo

O Supabase Client será usado para login. O backend deverá validar o token e a permissão administrativa em cada operação de gestão; apenas esconder rotas no React não protege o banco.

Se houver leituras diretas pelo navegador no futuro, deverão ter políticas RLS revisadas. Não liberar tabelas administrativas publicamente.

Não é necessário gerar chaves ou alterar o Supabase para visualizar esta etapa. Para o login futuro, copiar `.env.example` para `.env.local` e preencher a URL e a chave **pública/publishable** do projeto existente. Nunca colocar `SUPABASE_SECRET_KEY`, `service_role`, senha SMTP ou `DATABASE_URL` no frontend. Tudo com prefixo `VITE_` pode ser lido pelo navegador.

## Vercel (futuro)

Configurar o projeto com Root Directory `admin`, Build Command `npm run build` e Output Directory `dist`. O `vercel.json` permite atualizar URLs de rotas do React Router. Configurar variáveis públicas no ambiente da Vercel quando o login estiver implementado. Nenhum deploy foi realizado nesta etapa.
