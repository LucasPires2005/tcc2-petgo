
BEGIN;


ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique
  ON public.users (auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS petgo_private.social_accounts (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google' CHECK (provider = 'google'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE petgo_private.social_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE petgo_private.social_accounts FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE petgo_private.social_accounts IS
  'Perfis criados pelo piloto Google; exigem declaracao de maioridade antes do JWT PetGo. Sem backfill ou fusao automatica por email.';
COMMENT ON COLUMN petgo_private.social_accounts.auth_user_id IS
  'UUID autenticado pelo Supabase. FK impede recriar perfil se a identidade Auth for excluida durante o onboarding.';

COMMIT;
