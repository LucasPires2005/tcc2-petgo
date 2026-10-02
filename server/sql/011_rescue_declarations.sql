-- Registro privado de responsabilidade do resgate. Não contém CPF ou nascimento.
-- Aplicar antes de publicar a integração das rotas. Não altera tabelas existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS petgo_private.rescue_declarations (
  animal_id integer PRIMARY KEY REFERENCES public.animals(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rescuer_name text NOT NULL,
  rescuer_contact text NOT NULL,
  rescuer_email text NOT NULL,
  terms_version text NOT NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rescue_declarations_name_check CHECK (
    char_length(rescuer_name) BETWEEN 2 AND 120
    AND rescuer_name = btrim(rescuer_name) AND rescuer_name !~ '[[:cntrl:]]'
  ),
  CONSTRAINT rescue_declarations_contact_check CHECK (rescuer_contact ~ '^[0-9]{10,11}$'),
  CONSTRAINT rescue_declarations_email_check CHECK (
    char_length(rescuer_email) BETWEEN 3 AND 254
    AND rescuer_email = lower(btrim(rescuer_email)) AND rescuer_email !~ '[[:cntrl:]]'
  ),
  CONSTRAINT rescue_declarations_terms_check CHECK (
    char_length(terms_version) BETWEEN 1 AND 100
    AND terms_version = btrim(terms_version) AND terms_version !~ '[[:cntrl:]]'
  ),
  CONSTRAINT rescue_declarations_time_check CHECK (isfinite(declared_at))
);

ALTER TABLE petgo_private.rescue_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE petgo_private.rescue_declarations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE petgo_private.rescue_declarations IS
  'Declaração acadêmica de responsabilidade do resgate; não comprova identidade ou titularidade de documento.';
COMMENT ON COLUMN petgo_private.rescue_declarations.rescuer_email IS
  'Contato privado informado pelo resgatador; não expor nas listagens públicas de animais.';
COMMENT ON COLUMN petgo_private.rescue_declarations.terms_version IS
  'Versão definida pelo servidor para o texto de responsabilidade aceito.';

COMMIT;
