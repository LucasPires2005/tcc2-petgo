-- Execute antes do deploy. Não altera moedas nem estados de resgate.
BEGIN;
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS creator_id integer
  REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS animals_creator_id_idx ON public.animals(creator_id);

-- Somente pendentes têm autoria recuperável pelo modelo antigo.
-- Resgatados antigos ficam sem autor conhecido: não usar o resgatador como autor.
UPDATE public.animals a SET creator_id = a."userId"
WHERE a.creator_id IS NULL AND a.status = 0
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = a."userId");

-- Compatibilidade com cadastros feitos pelo backend anterior durante o deploy.
CREATE OR REPLACE FUNCTION petgo_private.set_animal_creator()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.creator_id := NEW."userId";
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION petgo_private.set_animal_creator() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS petgo_set_animal_creator ON public.animals;
CREATE TRIGGER petgo_set_animal_creator BEFORE INSERT ON public.animals
FOR EACH ROW EXECUTE FUNCTION petgo_private.set_animal_creator();

CREATE TABLE IF NOT EXISTS petgo_private.animal_author_deletions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  animal_id integer NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE petgo_private.animal_author_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON petgo_private.animal_author_deletions FROM PUBLIC, anon, authenticated;
COMMIT;
