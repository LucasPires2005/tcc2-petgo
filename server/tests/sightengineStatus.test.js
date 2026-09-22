const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');

async function fixture(t, env, admin = true) {
  const app = express();
  app.use('/admin', createAdminRouter({ env,
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'admin', email_confirmed_at: '2026-01-01' } : null } }) },
    db: { get(sql, params, callback) {
      assert.match(sql, /^SELECT auth_user_id FROM petgo_private.admin_users/);
      callback(null, admin ? { auth_user_id: 'admin' } : null);
    } }
  }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (token = 'valid') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/sightengine-status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
}

test('status Sightengine exige token válido e permissão administrativa', async t => {
  const request = await fixture(t, {});
  assert.equal((await request('')).status, 401);
  assert.equal((await request('invalid')).status, 401);
  const denied = await fixture(t, {}, false);
  assert.equal((await denied()).status, 403);
});

test('status Sightengine retorna somente configuração, sem chaves e sem cache', async t => {
  const request = await fixture(t, { SIGHTENGINE_API_USER: 'fake-user', SIGHTENGINE_API_SECRET: 'fake-secret' });
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  assert.deepEqual(result.body, { configured: true, checkType: 'configuration' });
  assert.doesNotMatch(JSON.stringify(result.body), /fake-user|fake-secret/);
});

test('status Sightengine considera ausência, vazio ou espaços como indisponível', async t => {
  for (const env of [{}, { SIGHTENGINE_API_USER: 'user' }, { SIGHTENGINE_API_SECRET: 'secret' },
    { SIGHTENGINE_API_USER: '', SIGHTENGINE_API_SECRET: 'secret' },
    { SIGHTENGINE_API_USER: 'user', SIGHTENGINE_API_SECRET: '   ' }]) {
    const request = await fixture(t, env);
    const result = await request();
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { configured: false, checkType: 'configuration' });
  }
});
