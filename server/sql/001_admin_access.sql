-- Execute no SQL Editor do Supabase como proprietário do banco.
-- Cria somente a estrutura de autorização; não promove nenhuma conta.
BEGIN;
CREATE SCHEMA IF NOT EXISTS petgo_private;
REVOKE ALL ON SCHEMA petgo_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS petgo_private.admin_users (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE petgo_private.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE petgo_private.admin_users FROM PUBLIC, anon, authenticated;
-- Sem políticas para o navegador. O backend consulta via DATABASE_URL.
COMMIT;

-- Promoção MANUAL: após revisar, execute separadamente com o UUID copiado
-- de Authentication > Users. A conta deve ter e-mail confirmado.
-- INSERT INTO petgo_private.admin_users (auth_user_id)
-- SELECT id FROM auth.users
-- WHERE id = 'UUID-DA-SUA-CONTA'::uuid AND email_confirmed_at IS NOT NULL
-- ON CONFLICT (auth_user_id) DO NOTHING
-- RETURNING auth_user_id;

-- Revogar acesso (somente quando desejado; não exclui a conta):
-- DELETE FROM petgo_private.admin_users WHERE auth_user_id = 'UUID-DA-SUA-CONTA'::uuid;
