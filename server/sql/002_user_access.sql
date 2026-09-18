-- Executar após 001_admin_access.sql, ANTES de publicar o backend.
-- Não modifica contas, senhas ou animais existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS petgo_private.user_access (
  user_id bigint PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  banned boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE petgo_private.user_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE petgo_private.user_access FROM PUBLIC, anon, authenticated;
COMMIT;
