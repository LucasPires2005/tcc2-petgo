-- Aplicar no SQL Editor como proprietário ANTES do deploy.
-- Não altera contas existentes; sincroniza apenas futuras trocas confirmadas.
BEGIN;
-- Se houver duplicatas normalizadas, aborta sem apagar ou corrigir contas.
CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_unique
  ON public.users (LOWER(TRIM(email)));
CREATE OR REPLACE FUNCTION petgo_private.sync_confirmed_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email_confirmed_at IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users
               WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
                 AND auth_user_id::text IS DISTINCT FROM NEW.id::text) THEN
      RAISE EXCEPTION 'Email already registered' USING ERRCODE = '23505';
    END IF;
    UPDATE public.users SET email = LOWER(TRIM(NEW.email)), email_confirmed = true
      WHERE auth_user_id::text = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION petgo_private.sync_confirmed_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS petgo_sync_confirmed_email ON auth.users;
CREATE TRIGGER petgo_sync_confirmed_email AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION petgo_private.sync_confirmed_email();
COMMIT;
