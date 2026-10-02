const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.resolve(__dirname, '../sql/012_google_social_accounts.sql'), 'utf8');
const sql = migration.replace(/^\s*--.*$/gm, '');

test('Google SQL: bloco transacional repetível não recria schema ou modifica registros', () => {
  assert.match(sql, /^\s*BEGIN;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS petgo_private\.social_accounts/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /\b(?:CREATE|DROP|ALTER)\s+SCHEMA\b/i);
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP TABLE|CREATE TRIGGER)\b/i);
});

test('Google SQL: única mudança na senha permite NULL sem substituir senhas legadas', () => {
  assert.match(sql, /ALTER TABLE public\.users ALTER COLUMN password DROP NOT NULL;/);
  const otherStatements = sql.replace(/ALTER TABLE public\.users ALTER COLUMN password DROP NOT NULL;/, '');
  assert.doesNotMatch(otherStatements, /ALTER TABLE public\.users|\bpassword\b/i);
  assert.doesNotMatch(sql, /\bALTER TYPE\b|ALTER COLUMN password (?:TYPE|SET)|\bDROP COLUMN\b/i);
});

test('Google SQL: UUID único preserva legado NULL e não vincula contas por e-mail', () => {
  assert.match(sql, /ON public\.users \(auth_user_id\) WHERE auth_user_id IS NOT NULL/);
  assert.doesNotMatch(sql, /ALTER COLUMN auth_user_id SET NOT NULL|\bemail\b\s+(?:text|varchar)|ON CONFLICT/i);
  assert.match(sql, /user_id integer PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /auth_user_id uuid NOT NULL UNIQUE REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
});

test('Google SQL: marca de origem privada tem RLS e não oferece acesso ao cliente', () => {
  assert.match(sql, /ALTER TABLE petgo_private\.social_accounts ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON TABLE petgo_private\.social_accounts FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(sql, /\bGRANT\b|CREATE\s+POLICY|DISABLE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(sql, /ALTER TABLE (?:public\.animals|petgo_private\.user_eligibility)|REVOKE.*ON SCHEMA/i);
});

test('Google SQL: origem aceita só Google sem duplicar dados de CPF, senha ou nascimento', () => {
  assert.match(sql, /provider text NOT NULL DEFAULT 'google' CHECK \(provider = 'google'\)/);
  assert.doesNotMatch(sql, /^\s*(?:cpf|cpf_hmac|birth_date|date_of_birth|password)\s+/gmi);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
});
