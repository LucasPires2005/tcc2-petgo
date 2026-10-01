BEGIN;

ALTER TABLE public.animals ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE public.animals ALTER COLUMN rescuer_contact DROP NOT NULL;

-- Impede que um upload já em andamento recrie vínculo com uma conta removida.
-- NOT VALID preserva dados legados; a FK já se aplica a novas gravações.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.animals'::regclass AND conname = 'animals_user_account_fk') THEN
    ALTER TABLE public.animals ADD CONSTRAINT animals_user_account_fk
      FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

ALTER TABLE petgo_private.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE petgo_private.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN ('user_ban', 'user_unban', 'animal_delete', 'user_delete'));

-- Desvincula ANTES de qualquer FK ON DELETE CASCADE alcançar os animais.
-- Também protege exclusões locais de contas legadas, sem Supabase Auth.
CREATE OR REPLACE FUNCTION petgo_private.preserve_animals_on_user_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serializa a verificação com promoções/revogações administrativas.
  LOCK TABLE petgo_private.admin_users IN SHARE MODE;
  IF EXISTS (SELECT 1 FROM petgo_private.admin_users
             WHERE auth_user_id::text = OLD.auth_user_id::text) THEN
    RAISE EXCEPTION 'Administrative account protected' USING ERRCODE = '42501';
  END IF;
  UPDATE public.animals SET "userId" = NULL,
    rescuer_name = 'Conta Removida', rescuer_contact = NULL
    WHERE "userId" = OLD.id;
  RETURN OLD;
END;
$$;

-- A exclusão via Admin SDK aciona este trigger na MESMA transação do Auth.
-- Falha ao preservar animais/remover perfil desfaz a exclusão de auth.users.
CREATE OR REPLACE FUNCTION petgo_private.delete_profile_with_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  LOCK TABLE petgo_private.admin_users IN SHARE MODE;
  IF EXISTS (SELECT 1 FROM petgo_private.admin_users WHERE auth_user_id = OLD.id) THEN
    RAISE EXCEPTION 'Administrative account protected' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.users WHERE auth_user_id::text = OLD.id::text;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION petgo_private.preserve_animals_on_user_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION petgo_private.delete_profile_with_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS petgo_preserve_animals_on_user_delete ON public.users;
CREATE TRIGGER petgo_preserve_animals_on_user_delete BEFORE DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION petgo_private.preserve_animals_on_user_delete();

DROP TRIGGER IF EXISTS petgo_delete_profile_with_auth_user ON auth.users;
CREATE TRIGGER petgo_delete_profile_with_auth_user BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION petgo_private.delete_profile_with_auth_user();
COMMIT;
