const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');

async function fixture(t, { admin = true, result = { total: '0', users: [] }, error } = {}) {
  const queries = [];
  const app = express();
  app.use('/admin', createAdminRouter({
    auth: { getUser: async () => ({ data: { user: { id: 'id', email_confirmed_at: '2026-01-01' } } }) },
    db: { get(sql, params, callback) {
      if (sql.includes('petgo_private.admin_users')) return callback(null, admin ? {} : null);
      queries.push({ sql, params }); callback(error, result);
    } }
  }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { queries, async get(query = '', token = 'token') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/users${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, body: await response.json() };
  } };
}

test('listagem bloqueia visitante e usuário comum antes de consultar perfis', async (t) => {
  const f = await fixture(t, { admin: false });
  assert.equal((await f.get('', '')).status, 401);
  assert.equal((await f.get()).status, 403);
  assert.equal(f.queries.length, 0);
});
test('busca usa parâmetros literais e seleciona somente campos públicos do perfil', async (t) => {
  const f = await fixture(t);
  const term = " X%' OR 1=1 -- ";
  const response = await f.get(`?${new URLSearchParams({ q: term, page: '2', plan: '3' })}`);
  assert.equal(response.status, 200);
  assert.deepEqual(f.queries[0].params, [term.trim().toLowerCase(), 3, 20, 20]);
  assert.ok(!f.queries[0].sql.includes(term.trim()));
  assert.doesNotMatch(f.queries[0].sql, /password|auth_user_id|SELECT u\.\*/i);
  assert.match(f.queries[0].sql, /SELECT u.id, u.name, u.email, u.coins, u.plan_tier/);
});
test('rejeita parâmetros inválidos e arrays antes da consulta', async (t) => {
  const f = await fixture(t);
  for (const query of ['?page=0', '?page=-1', '?page=1.2', '?page=1000000', '?page=2&page=3', '?plan=9', '?q=a&q=b', `?q=${'x'.repeat(101)}`]) {
    assert.equal((await f.get(query)).status, 400, query);
  }
  assert.equal(f.queries.length, 0);
});
test('lista vazia tem total e páginas zerados', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.get()).body, { users: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
});
test('paginação devolve total filtrado e preserva os perfis', async (t) => {
  const users = [{ id: 1, name: 'Teste', email: 'teste@example.test', coins: 0, plan_tier: 2 }];
  const f = await fixture(t, { result: { total: '21', users } });
  const response = await f.get('?page=2');
  assert.deepEqual(response.body, { users, total: 21, page: 2, pageSize: 20, totalPages: 2 });
});
test('falha do banco não expõe detalhes ao cliente', async (t) => {
  const f = await fixture(t, { error: { code: '08006', message: 'private database details' } });
  const response = await f.get();
  assert.equal(response.status, 503);
  assert.deepEqual(Object.keys(response.body), ['error']);
  assert.doesNotMatch(response.body.error, /private database/);
});
