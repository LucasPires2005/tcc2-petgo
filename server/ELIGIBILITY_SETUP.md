# Base de maioridade declarada e CPF — etapa 1/2

Esta etapa prepara SQL e helpers. **Não conecta os helpers às rotas**, não cria
onboarding, não habilita login social e não exige dados novos do APK atual.
Cadastro, confirmação, login, recuperação, resgates e moedas permanecem iguais.

## 1. Supabase

Executar integralmente `sql/010_user_eligibility.sql` no SQL Editor como
proprietário do banco. O script pressupõe `petgo_private` e `public.users`
existentes; não recria o schema, não altera permissões globais e não modifica
as tabelas públicas ou a auditoria existente. É transacional e pode ser repetido.

A nova `petgo_private.user_eligibility` usa `user_id → public.users.id`, não
`auth_user_id`. Portanto, contas legadas sem UUID do Supabase são compatíveis.
Nenhuma conta antiga é promovida automaticamente: a tabela começa vazia e
ausência de registro significará declaração pendente na futura integração.
Excluir um usuário local remove apenas sua declaração via FK `ON DELETE CASCADE`.

Cada registro representa uma declaração aprovada: `DECLARED_ADULT` e
`LOCAL_DECLARATION`. Armazena HMAC, versão da chave, data da avaliação e versão
dos termos. Não armazena CPF completo ou nascimento, nem impõe unicidade global
do documento. Hash igual em contas diferentes não prova identidade ou fraude.

RLS fica ativo sem políticas para o navegador. Privilégios da nova tabela são
revogados para `PUBLIC`, `anon` e `authenticated`; a futura persistência ocorrerá
pela conexão privilegiada `DATABASE_URL` do backend.

Não é necessário habilitar Data API, expor `petgo_private`, ativar RLS em
`public.users`/`public.animals` ou modificar as senhas legadas para esta etapa.
“API DISABLED” e RLS são controles diferentes; mantenha as configurações atuais.

Conferência opcional, somente leitura:

```sql
SELECT count(*) FROM petgo_private.user_eligibility;
SELECT relrowsecurity
FROM pg_class
WHERE oid = 'petgo_private.user_eligibility'::regclass;
```

## 2. Chave HMAC no backend

Gere no seu terminal uma chave aleatória própria (o comando imprime um segredo;
copie somente para o Render/server local, nunca para commit, chat ou capturas):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Adicionar **CPF_HMAC_SECRET** às variáveis do backend no Render. Para uso local,
adicionar somente em `server/.env` ignorado pelo Git. Não reutilizar
`MOBILE_JWT_SECRET`, chave Supabase ou segredo do Mercado Pago; não usar variável
`EXPO_PUBLIC_*`/`VITE_*` e não colocar a chave no mobile ou admin.

Os helpers leem a chave somente quando geram/comparam HMAC. Sua ausência NÃO
impede importar o módulo ou iniciar o servidor atual. Uma chamada criptográfica
sem chave válida falha com `CPF_HMAC_NOT_CONFIGURED`, sem expor o segredo; não
aprova silenciosamente. Em futuras rotas, tratar como indisponibilidade, não
como CPF incorreto.

Formato exigido: Base64 canônico, decodificando pelo menos 32 bytes. A versão
atual é `v1`; o prefixo criptográfico é `petgo:cpf:v1:` e o digest é hexadecimal
minúsculo de 64 caracteres. `cpf_key_version` deve ser gravado junto do HMAC.

**Não troque a chave sem um plano de migração/revalidação.** Como o CPF completo
não fica armazenado, não será possível recalcular os hashes antigos. Este helper
não oferece rotação automática nem várias chaves; versão desconhecida não confere.

## 3. Contratos dos helpers

Arquivo: `services/eligibilityValidation.js`.

- `normalizeCpf`: aceita somente texto com 11 dígitos ASCII ou máscara completa
  `000.000.000-00`, com espaços externos opcionais. Retorna dígitos ou `null`.
- `isValidCpf`: valida ambos os dígitos e rejeita sequências repetidas. Não consulta
  a Receita, não confirma existência, titularidade ou vínculo com nascimento.
- `parseBirthDate`: calendário real em `AAAA-MM-DD`; não aceita horário,
  máscara brasileira, normalização automática de datas impossíveis ou ano zero.
- `calculateAge`: idade por aniversário, ou `null` para dados/relógio inválidos
  ou nascimento futuro. Usa a data de Brasília a partir do relógio do servidor.
- `isAdult`: verdadeiro a partir de 18 anos conforme nascimento declarado.
- `createCpfHmac`: retorna hash privado, somente para CPF matematicamente válido.
- `matchesCpfHmac`: compara via `timingSafeEqual`; hash/versão inválidos não conferem.
- `assessEligibility`: resultado interno com erro claro ou declaração aprovada,
  `identityVerified: false`, HMAC, versão e instante UTC da avaliação. Não devolve
  CPF, nascimento nem idade. Não grava banco e não registra payloads.

O parâmetro `now` existe para testes determinísticos; nunca preenchê-lo com
data/hora recebida do aplicativo. A API futura enviará apenas um estado público
selecionado, **nunca o objeto interno inteiro ou seu HMAC**.

Para nascimento em 29/02, a regra demonstrativa é completar idade em **01/03**
nos anos não bissextos. Esta convenção está explícita e testada, não é uma
afirmação de interpretação jurídica. A validação continua sendo autodeclaração.
HMAC é pseudonimização de dado pessoal, não anonimização nem prova de identidade.

## 4. Testes e próximo bloco

```powershell
npm.cmd --prefix server test
npm.cmd --prefix server run test:gaps
```

A suíte utiliza somente dados/chaves artificiais, sem chamar APIs pagas, Supabase
ou consultar documentos reais. Testes estruturais da migração rodam na suíte;
validação SQL em PostgreSQL/PGlite isolado complementa a conferência de constraints,
idempotência e permissões. Nenhuma migração é executada em produção pelos testes.

Depois de validar esta base, o próximo bloco será integrar cadastro/onboarding
e a checagem privada ao resgate, mantendo seus locks e a transação atuais.
Até essa integração, o sistema não bloqueia usuários por maioridade/CPF e não
preenche `user_eligibility`. Não há necessidade de APK novo nesta etapa.
