-- Executar no SQL Editor do Supabase como proprietario do banco.
-- Fundacao apenas: nao cadastra declaracoes e nao altera fluxos existentes.
-- O schema petgo_private ja existe; suas tabelas e permissoes sao preservadas.
BEGIN;

CREATE TABLE IF NOT EXISTS petgo_private.user_eligibility (
  -- A identidade local permite contas antigas sem auth_user_id.
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  -- Pseudonimo: HMAC-SHA-256 hexadecimal, nunca CPF bruto ou nascimento.
  cpf_hmac text NOT NULL,
  cpf_key_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'DECLARED_ADULT',
  method text NOT NULL DEFAULT 'LOCAL_DECLARATION',
  assessed_at timestamptz NOT NULL DEFAULT now(),
  terms_version text NOT NULL,

  CONSTRAINT user_eligibility_cpf_hmac_check
    CHECK (cpf_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT user_eligibility_cpf_key_version_check
    CHECK (cpf_key_version ~ '^v[1-9][0-9]{0,8}$'),
  CONSTRAINT user_eligibility_status_check
    CHECK (status = 'DECLARED_ADULT'),
  CONSTRAINT user_eligibility_method_check
    CHECK (method = 'LOCAL_DECLARATION'),
  CONSTRAINT user_eligibility_assessed_at_check
    CHECK (isfinite(assessed_at)),
  CONSTRAINT user_eligibility_terms_version_check
    CHECK (char_length(terms_version) BETWEEN 1 AND 100
      AND terms_version = btrim(terms_version)
      AND terms_version !~ '[[:cntrl:]]')
);

ALTER TABLE petgo_private.user_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE petgo_private.user_eligibility FROM PUBLIC, anon, authenticated;
-- Sem politicas para o navegador. O backend acessara pela DATABASE_URL
-- usando o papel proprietario/privilegiado atual, como nas tabelas privadas.
-- Nao conceder acesso ao app e nao habilitar este schema na Data API.

COMMENT ON TABLE petgo_private.user_eligibility IS
  'Declaracao local de maioridade; nao comprova identidade, titularidade do CPF ou idade real. Ausencia de registro indica elegibilidade ainda nao declarada.';
COMMENT ON COLUMN petgo_private.user_eligibility.user_id IS
  'Referencia public.users.id, inclusive para contas legadas sem UUID Supabase. Excluir o usuario local remove somente sua declaracao vinculada.';
COMMENT ON COLUMN petgo_private.user_eligibility.cpf_hmac IS
  'HMAC-SHA-256 do CPF normalizado com chave privada do servidor. Dado pseudonimizado, sem unicidade global e sem uso para fundir contas.';
COMMENT ON COLUMN petgo_private.user_eligibility.cpf_key_version IS
  'Identifica a versao da chave privada usada no HMAC. Rotacao exige estrategia explicita, pois o CPF bruto nao e armazenado.';
COMMENT ON COLUMN petgo_private.user_eligibility.terms_version IS
  'Versao dos termos apresentada e aceita ao registrar a declaracao.';

COMMIT;

-- Nao ha backfill: contas existentes permanecem sem declaracao.
-- Cadastro, login e resgate so consultarao esta tabela em etapa futura.
