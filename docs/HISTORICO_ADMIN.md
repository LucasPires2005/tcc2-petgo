# Histórico enriquecido e refinamento do painel

## Implantação

Este bloco não requer SQL novo, variável de ambiente nem APK. Usa o campo JSONB
`details` já existente em `petgo_private.admin_audit_log`. Publique o backend e o
painel para habilitar todos os detalhes; o painel continua compatível com registros antigos.

As URLs, permissões, motivos obrigatórios, códigos de resposta e regras de
banimento/exclusão foram preservados. O backend mudou somente os dados registrados
na auditoria e o enriquecimento da consulta de histórico.

## Origem das informações

- Novos banimentos/desbanimentos guardam nome e e-mail no registro da ação.
- Novas exclusões de conta guardam nome e e-mail antes da remoção. Para contas com
  Auth, esses campos são lidos antes da chamada ao serviço; nas contas legadas,
  vêm do `DELETE RETURNING` no mesmo comando da auditoria.
- Exclusões de animal guardam nome, espécie, saúde e status, além das URLs já registradas.
- Esses dados guardados prevalecem mesmo que o cadastro seja editado depois.
- Para eventos antigos sem detalhes, o GET consulta o alvo ainda existente, sem
  atualizar o histórico. O painel identifica esses campos como **dado atual**.
- Dados não guardados de um alvo já excluído aparecem como **Não registrado**.
  Um campo guardado como nulo aparece como **Não informado**, sem substituição silenciosa.
- O acesso continua restrito a administradores. Senhas, tokens e documentos não
  são copiados. Nome/e-mail passam a permanecer no histórico inclusive depois da
  exclusão da conta: essa retenção é intencional para auditoria, não anonimização total.

## Conferência manual

1. Execute `npm.cmd --prefix admin run dev` para revisar o painel localmente.
   Confira qual backend está configurado em `admin/.env.local`; o enriquecimento
   novo exige backend atualizado, local ou publicado no Render.
2. Em uma conta descartável, faça banimento e desbanimento com motivos distintos.
   Confira nome, e-mail, motivo, data e UUID administrativo no Histórico.
3. Exclua uma conta/animal exclusivamente de teste e confirme que os detalhes
   permanecem no Histórico. A exclusão é real e não tem desfazer no painel.
4. Abra eventos antigos: verifique a distinção entre dados guardados, atuais e ausentes.
5. Pesquise um nome inexistente em Usuários, Animais e Arquivos. Confira os estados
   vazios; filtre o Histórico por uma ação sem resultados.
6. Confira botões, filtros e quebra de textos longos em janela larga e estreita.
7. Confirme que a página Arquivos continua somente leitura e que os filtros,
   paginação e ações administrativas mantêm o comportamento anterior.

Testes: `npm.cmd --prefix server test`, `npm.cmd --prefix server run test:gaps`
e `npm.cmd --prefix admin run build`. O verificador opcional de PostgreSQL isolado
descrito em `EXCLUSAO_ADMIN.md` também cobre snapshots, banimento e leitura enriquecida.
