# Painel: histórico administrativo e inventário de arquivos

## Escopo desta entrega

- Motivo obrigatório na interface para banir, desbanir e excluir animais.
- Histórico com UUID do administrador validado pelo servidor, ação, alvo, motivo e data.
- Exclusão guarda nome e URLs das fotos para rastreabilidade; não guarda senha ou token.
- Alteração e histórico são escritos em um único comando PostgreSQL com CTEs. Se a auditoria falhar, o comando inteiro falha, sem concluir a alteração.
- Histórico filtrável e paginado, acessível exclusivamente a administradores.
- Inventário paginado do bucket `animals`, com busca e comparação com as URLs de cadastro/resgate em `public.animals`.
- Não modifica `app/`, autenticação mobile, pagamentos, recompensas ou uploads.

Não há exclusão de arquivos nesta entrega. A Fase 6 começa pelo inventário; limpeza segura fica para uma etapa revisada separadamente. Arquivos sem vínculo direto identificado **não são necessariamente órfãos**: uploads em andamento, URLs assinadas ou outras codificações podem não ser reconhecidos. Fotos retidas continuam públicas se o bucket for público; excluir o registro não remove a mídia ofensiva da internet.

## Antes de executar o backend atualizado

1. Revisar `server/sql/005_admin_audit.sql` e executar no SQL Editor do Supabase como proprietário do banco. Depende do schema privado criado na migração 001. Não modifica contas/animais existentes nem recupera histórico passado.
2. Usar as variáveis existentes `DATABASE_URL`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. Não há nova variável obrigatória nem nova chave.
3. A conexão SQL deve ter acesso à nova tabela e à sequência de identidade, e leitura de `storage.objects`. A conexão proprietária existente normalmente atende isso. Caso use papel restrito, revisar privilégios com o responsável pelo banco; não conceder acesso a `anon` ou `authenticated`.
4. Publicar o backend somente depois do SQL. Sem a tabela/permissões, banimento e exclusão administrativa retornam erro e não são aplicados. O fluxo mobile não depende dessa nova tabela.

A consulta a `storage.objects` é somente leitura. Nunca apagar suas linhas por SQL para tentar apagar arquivos: os metadados não são os próprios objetos. Referência: [documentação do Supabase Storage](https://supabase.com/docs/guides/storage/schema/design).

## Testar localmente sem commit

Na raiz do repositório:

```powershell
npm.cmd --prefix server test
npm.cmd --prefix server run test:gaps
npm.cmd --prefix admin run build
```

Esses testes usam doubles do banco, sem executar a migração ou apagar dados reais. Validam autorização, contratos SQL, filtros, motivos, mensagens de erro e regressões. Não substituem o teste integrado do PostgreSQL/Supabase nem a interação visual no navegador.

Para testar a interface completa:

1. Aplicar o SQL 005 no banco de testes escolhido. Se usar o projeto atual, lembrar que ações administrativas locais também alteram esse banco real: usar somente conta/animal descartáveis.
2. Usar seu arquivo **local e ignorado pelo Git** `server/.env`, preenchido com as configurações existentes do backend. Não copiar segredos para variáveis `VITE_`.
3. Iniciar o servidor na raiz:

```powershell
node --env-file=server/.env server/index.js
```

Se as variáveis já estiverem configuradas no terminal, basta `node server/index.js`. A porta padrão é 3000; respeitar eventual `PORT` configurada.

4. Em `admin/.env.local`, apontar `VITE_API_URL=http://localhost:3000` (ou a porta escolhida), mantendo as configurações públicas do mesmo Supabase.
5. Iniciar/reiniciar o painel:

```powershell
npm.cmd --prefix admin run dev
```

6. Entrar como ADM. Confirmar que Dashboard, Usuários e Animais continuam funcionando.
7. Banir uma conta **de teste**, fornecer motivo e confirmar. Conferir Histórico: ação, ID, UUID do administrador, motivo e horário local. Desbanir e conferir o segundo evento. O usuário deverá entrar novamente, como já ocorria antes.
8. Cancelar a caixa de motivo ou informar menos de 3 caracteres: não deve executar a ação. Cancelar a confirmação final também não deve alterar nada.
9. Excluir um animal **descartável**, conferir o evento e a atualização da lista. Não existe desfazer no painel. Confirmar que nenhum arquivo foi apagado.
10. Em Arquivos, testar busca, filtros e abertura de uma foto. Um arquivo vinculado deve indicar os IDs; após exclusão do último registro que o referencia, pode aparecer como sem vínculo direto.
11. Conferir estados vazios, paginação (se houver mais de 20 itens), mensagens de indisponibilidade e acesso negado para conta comum. Não remover tabelas de produção para provocar erro: esse caso está coberto pelos testes.

Se preferir manter o painel conectado ao Render, será necessário **seu commit/push e deploy do backend** para testar as novas rotas lá. Rodar apenas o Vite local não atualiza o servidor remoto. Não é necessário novo APK nesta entrega.

## Limites e próximos blocos

- Histórico registra ações administrativas bem-sucedidas destas rotas, não login, tentativas recusadas, SQL manual ou ações antigas. Não é um registro inviolável contra o proprietário do banco.
- Clientes antigos sem campo `reason` continuam aceitos e recebem motivo explícito `Não informado (painel anterior)`. O painel novo exige de 3 a 500 caracteres. A compatibilidade pode ser removida depois da atualização de todos os clientes web.
- Retentar banimento depois de uma resposta perdida pode gerar outro evento e revogar sessões novamente, como a rota anterior. Atualizar a lista antes de repetir. Exclusão já realizada retorna 404, sem novo evento.
- Inventário não mede quota total, não verifica disponibilidade binária de cada foto e não realiza limpeza automática. Busca em grande volume poderá exigir índices/otimização após medir uso real.
- Próxima entrega possível: procedimento de remoção de mídia via API Storage, com rechecagem de vínculos, janela de segurança para uploads e trilha de auditoria própria. Exige decisão explícita sobre retenção e recuperação antes de implementar.
- Senhas: adiar a Fase 4 evita misturar migração de credenciais com este bloco, mas mantém a pendência de segurança. Tratar separadamente com testes de contas legadas e Supabase; não é promessa de risco zero.

## Rollback

Pode-se reverter o código do painel/backend pelo fluxo de versionamento e deploy já usado. A tabela nova pode permanecer para preservar o histórico, sem interferir no mobile ou backend anterior. Não apagar a tabela para reverter código nem expor o schema privado na Data API.
