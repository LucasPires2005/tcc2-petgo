-- Executar no SQL Editor do Supabase ANTES do deploy do backend.
-- Não modifica animais, resgates ou moedas existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS petgo_private.animal_creation_events (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS animal_creation_events_user_time_idx
  ON petgo_private.animal_creation_events (user_id, created_at);
ALTER TABLE petgo_private.animal_creation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE petgo_private.animal_creation_events FROM PUBLIC, anon, authenticated;
COMMIT;
