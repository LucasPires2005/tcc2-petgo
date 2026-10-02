const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.resolve(__dirname, '../sql/010_user_eligibility.sql'), 'utf8');
const sql = migration.replace(/^\s*--.*$/gm, '');

test('elegibilidade SQL: tabela privada transacional e repetível, sem recriar schema', () => {
  assert.match(sql, /^\s*BEGIN;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS petgo_private\.user_eligibility/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /\b(?:CREATE|DROP|ALTER)\s+SCHEMA\b/i);
});

test('elegibilidade SQL: vínculo local suporta legado sem UUID e não exige CPF único', () => {
  assert.match(sql, /user_id integer PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /REFERENCES auth\.users|auth_user_id\s+(?:uuid|integer)|\bUNIQUE\b/i);
});

test('elegibilidade SQL: RLS ativo e tabela sem privilégios/políticas para o navegador', () => {
  assert.match(sql, /ALTER TABLE petgo_private\.user_eligibility ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON TABLE petgo_private\.user_eligibility FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(sql, /\bGRANT\b|CREATE\s+POLICY|DISABLE ROW LEVEL SECURITY/i);
});

test('elegibilidade SQL: dados mínimos e constraints não aceitam verificação oficial fictícia', () => {
  assert.doesNotMatch(sql, /^\s*(?:cpf|birth_date|date_of_birth|password|auth_user_id)\s+/gmi);
  assert.match(sql, /cpf_hmac ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /CHECK \(status = 'DECLARED_ADULT'\)/);
  assert.match(sql, /CHECK \(method = 'LOCAL_DECLARATION'\)/);
  assert.match(sql, /CHECK \(isfinite\(assessed_at\)\)/);
  assert.match(sql, /char_length\(terms_version\) BETWEEN 1 AND 100/);
  assert.match(sql, /cpf_key_version text NOT NULL DEFAULT 'v1'/);
});

test('elegibilidade SQL: não promove contas nem altera tabelas, permissões globais ou triggers existentes', () => {
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP|CREATE TRIGGER)\b/i);
  assert.doesNotMatch(sql, /ALTER TABLE (?:public\.|auth\.)|REVOKE.*ON SCHEMA/i);
  assert.doesNotMatch(sql, /admin_audit_log|user_access|animals/i);
});
