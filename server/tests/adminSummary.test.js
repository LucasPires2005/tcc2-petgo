const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');

// Servidor efêmero local; Supabase e PostgreSQL são simulados.
async function fixture(t, { role = 'admin', row = { users: '12', animals: '7' }, countError } = {}) {
  let countQueries = 0;
  const auth = { getUser: async (token) => ({
    data: { user: token === 'valid' ? { id: 'verified-id', email: 'admin@example.test', email_confirmed_at: '2026-01-01' } : null },
    error: token === 'valid' ? null : { status: 401 }
  }) };
  const db = { get(sql, params, callback) {
    if (sql.includes('petgo_private.admin_users')) {
      assert.deepEqual(params, ['verified-id']);
      return callback(null, role === 'admin' ? { auth_user_id: 'verified-id' } : null);
    }
    countQueries++;
    assert.match(sql, /COUNT\(\*\) FROM public.users/);
    assert.match(sql, /COUNT\(\*\) FROM public.animals/);
    callback(countError, row);
  } };
  const app = express();
  app.use('/admin', createAdminRouter({ auth, db }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return {
    get: (token) => fetch(`http://127.0.0.1:${server.address().port}/admin/summary`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }),
    countQueries: () => countQueries
  };
}

test('summary não consulta contagens sem token ou com token inválido', async (t) => {
  const f = await fixture(t);
  for (const token of [null, 'invalid']) {
    const response = await f.get(token);
    assert.equal(response.status, 401);
    await response.json();
  }
  assert.equal(f.countQueries(), 0);
});
test('summary nega conta comum antes de consultar dados', async (t) => {
  const f = await fixture(t, { role: 'user' });
  const response = await f.get('valid');
  assert.equal(response.status, 403);
  await response.json();
  assert.equal(f.countQueries(), 0);
});
test('summary converte COUNT bigint do PostgreSQL e proíbe cache', async (t) => {
  const f = await fixture(t);
  const response = await f.get('valid');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.users, 12);
  assert.equal(data.animals, 7);
  assert.ok(Number.isFinite(Date.parse(data.updatedAt)));
  assert.equal(f.countQueries(), 1);
});
test('summary aceita banco vazio como zero real', async (t) => {
  const f = await fixture(t, { row: { users: '0', animals: '0' } });
  const response = await f.get('valid');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.users, 0); assert.equal(data.animals, 0);
});
test('falha de banco retorna erro, não zeros fictícios nem detalhes SQL', async (t) => {
  const f = await fixture(t, { countError: { code: '08006', message: 'sensitive connection details' } });
  const response = await f.get('valid');
  const data = await response.json();
  assert.equal(response.status, 503);
  assert.deepEqual(Object.keys(data), ['error']);
  assert.doesNotMatch(data.error, /sensitive/);
});
test('summary rejeita resultados ausentes ou fora de precisão segura', async (t) => {
  for (const row of [undefined, { users: '9007199254740992', animals: '2' }]) {
    const f = await fixture(t, { row: row === undefined ? {} : row });
    const response = await f.get('valid');
    assert.equal(response.status, 503);
    await response.json();
  }
});
