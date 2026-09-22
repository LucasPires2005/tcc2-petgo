const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');

async function fixture(t, { admin = true, result = { total: '0', animals: [] }, error } = {}) {
  const queries = [];
  const app = express();
  app.use('/admin', createAdminRouter({
    auth: { getUser: async () => ({ data: { user: { id: 'admin', email_confirmed_at: '2026-01-01' } } }) },
    db: { get(sql, params, callback) {
      if (sql.includes('petgo_private.admin_users')) return callback(null, admin ? {} : null);
      queries.push({ sql, params }); callback(error, result);
    } }
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { queries, async request(path = '/animals', method = 'GET', token = 'token') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin${path}`, {
      method, headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  } };
}

test('animais: leitura e exclusão exigem admin', async (t) => {
  const f = await fixture(t, { admin: false });
  for (const [path, method] of [['/animals', 'GET'], ['/animals/1', 'DELETE']]) {
    assert.equal((await f.request(path, method, '')).status, 401);
    assert.equal((await f.request(path, method)).status, 403);
  }
  assert.equal(f.queries.length, 0);
});

test('animais: paginação e busca parametrizadas, sem dados pessoais', async (t) => {
  const animals = [{ id: 3, image_url: 'https://example.test/photo.jpg', rescue_image_url: null }];
  const f = await fixture(t, { result: { total: '13', animals } });
  const q = " A%' OR 1=1 -- ";
  const r = await f.request(`/animals?${new URLSearchParams({ q, page: '2' })}`);
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'no-store');
  assert.deepEqual(r.body, { animals, total: 13, page: 2, pageSize: 12, totalPages: 2 });
  assert.deepEqual(f.queries[0].params, [q.trim().toLowerCase(), 12, 12]);
  assert.doesNotMatch(f.queries[0].sql, /rescuer_contact|latitude|password/);
});

test('animais: filtros e IDs inválidos não chegam ao banco', async (t) => {
  const f = await fixture(t);
  for (const query of ['?page=0', '?page=1.2', '?page=1000000', '?page=1&page=2', '?q=a&q=b', `?q=${'a'.repeat(101)}`]) {
    assert.equal((await f.request(`/animals${query}`)).status, 400);
  }
  for (const id of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
    assert.equal((await f.request(`/animals/${id}`, 'DELETE')).status, 400);
  }
  assert.equal(f.queries.length, 0);
});

test('animais: lista vazia', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.request()).body, { animals: [], total: 0, page: 1, pageSize: 12, totalPages: 0 });
});

test('animais: exclui somente o ID solicitado em uma consulta', async (t) => {
  const f = await fixture(t, { result: { id: 42 } });
  const r = await f.request('/animals/42', 'DELETE');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { deletedId: 42 });
  assert.equal(f.queries.length, 1);
  assert.match(f.queries[0].sql, /DELETE FROM public.animals WHERE id = \?/);
  assert.match(f.queries[0].sql, /INSERT INTO petgo_private.admin_audit_log/);
  assert.deepEqual(f.queries[0].params, ['42', 'admin', 'Não informado (painel anterior)']);
});

test('animais: exclusão inexistente ou repetida retorna 404', async (t) => {
  const f = await fixture(t, { result: null });
  assert.equal((await f.request('/animals/42', 'DELETE')).status, 404);
});

test('animais: erros do banco são sanitizados e vínculos impedem exclusão', async (t) => {
  for (const code of ['23503', '08006']) {
    const f = await fixture(t, { error: { code, message: 'secret details' } });
    const r = await f.request('/animals/42', 'DELETE');
    assert.equal(r.status, code === '23503' ? 409 : 503);
    assert.doesNotMatch(r.body.error, /secret details/);
    assert.equal((await f.request()).status, 503);
  }
});
