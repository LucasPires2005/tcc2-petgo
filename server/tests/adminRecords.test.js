const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');
const { reasonFrom } = require('../routes/adminRecords');

const actor = '11111111-1111-4111-8111-111111111111';
async function fixture(t, { admin = true, result, error } = {}) {
  const queries = [];
  const app = express();
  app.use(express.json());
  app.use('/admin', createAdminRouter({
    supabaseUrl: 'https://petgo.example.test',
    auth: { getUser: async () => ({ data: { user: { id: actor, email_confirmed_at: '2026-01-01' } } }) },
    db: { get(sql, params, callback) {
      if (sql.startsWith('SELECT auth_user_id FROM petgo_private.admin_users')) return callback(null, admin ? {} : null);
      queries.push({ sql, params }); callback(error, result);
    } }
  }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { queries, async request(path, method = 'GET', body, token = 'token') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  } };
}

test('histórico e arquivos exigem autenticação e autorização admin', async t => {
  const f = await fixture(t, { admin: false });
  for (const path of ['/audit', '/files']) {
    assert.equal((await f.request(path, 'GET', undefined, '')).status, 401);
    assert.equal((await f.request(path)).status, 403);
  }
  assert.equal(f.queries.length, 0);
});

test('histórico: filtro e paginação parametrizados, sem cache', async t => {
  const entries = [{ id: '1', actor_id: actor, action: 'user_ban', target_id: '7', reason: 'Abuso' }];
  const f = await fixture(t, { result: { total: '21', entries } });
  const r = await f.request('/audit?action=user_ban&page=2');
  assert.equal(r.status, 200); assert.equal(r.cache, 'no-store');
  assert.deepEqual(r.body, { entries, total: 21, page: 2, totalPages: 2 });
  assert.deepEqual(f.queries[0].params, ['user_ban', 'user_ban', 20]);
});

test('novas consultas recusam filtros inválidos antes do SQL', async t => {
  const f = await fixture(t);
  for (const path of ['/audit?page=0', '/audit?action=unknown', '/audit?action=a&action=b', '/files?link=all', '/files?page=1&page=2', '/files?q=a&q=b', `/files?q=${'x'.repeat(101)}`]) {
    assert.equal((await f.request(path)).status, 400, path);
  }
  assert.equal(f.queries.length, 0);
});

test('arquivos: inventário somente leitura, bucket fixo e busca parametrizada', async t => {
  const f = await fixture(t, { result: { total: '1', files: [{ id: 'uuid', name: 'pasta/foto 1.jpg', animal_ids: [7] }] } });
  const q = " ' OR 1=1 -- ";
  const r = await f.request(`/files?${new URLSearchParams({ q, link: 'linked', page: '2' })}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.files[0].url, 'https://petgo.example.test/storage/v1/object/public/animals/pasta/foto%201.jpg');
  assert.deepEqual(r.body.files[0].animal_ids, [7]);
  assert.equal(f.queries[0].params[2], q.trim().toLowerCase());
  assert.equal(f.queries[0].params[6], 20);
  assert.match(f.queries[0].sql, /o.bucket_id = 'animals'/);
  assert.doesNotMatch(f.queries[0].sql, /\b(DELETE|UPDATE|INSERT)\b/);
});

test('falhas e respostas inválidas das consultas são sanitizadas', async t => {
  for (const options of [{ error: { code: '42P01', message: 'senha secreta' } }, { result: { total: '-1' } }]) {
    const f = await fixture(t, options);
    for (const path of ['/audit', '/files']) {
      const r = await f.request(path);
      assert.equal(r.status, 503); assert.doesNotMatch(JSON.stringify(r.body), /senha secreta/);
    }
  }
});

test('motivos: compatibilidade explícita e rejeição de tipos e comprimentos inválidos', () => {
  assert.equal(reasonFrom(), 'Não informado (painel anterior)');
  assert.equal(reasonFrom({ reason: ' Revisão ' }), 'Revisão');
  for (const reason of [null, 3, [], '', ' a ', 'a'.repeat(501)]) assert.equal(reasonFrom({ reason }), null);
});

test('ações administrativas: motivo inválido não executa alteração', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/users/7/ban', 'PUT', { banned: true, reason: '' })).status, 400);
  assert.equal((await f.request('/animals/7', 'DELETE', { reason: 'a' })).status, 400);
  assert.equal(f.queries.length, 0);
});

test('banimento e exclusão incluem auditoria no mesmo comando SQL e ator do token', async t => {
  const f = await fixture(t, { result: { id: 7, user_id: 7, banned: true } });
  for (const [path, method, body] of [
    ['/users/7/ban', 'PUT', { banned: true, reason: ' Abuso ', actor_id: 'forjado' }],
    ['/animals/7', 'DELETE', { reason: ' Abuso ', actor_id: 'forjado' }]
  ]) {
    assert.equal((await f.request(path, method, body)).status, 200);
    const query = f.queries.at(-1);
    assert.match(query.sql, /WITH /);
    assert.match(query.sql, /INSERT INTO petgo_private.admin_audit_log/);
    assert.match(query.sql, /CROSS JOIN logged/);
    assert.deepEqual(query.params.slice(-2), [actor, 'Abuso']);
    assert.ok(!query.params.includes('forjado'));
  }
  assert.equal(f.queries.length, 2);
});

test('falha de gravação da auditoria não informa sucesso na ação', async t => {
  const f = await fixture(t, { error: { code: '42P01', message: 'detalhe interno' } });
  for (const [path, method, body] of [
    ['/users/7/ban', 'PUT', { banned: true, reason: 'Teste' }], ['/animals/7', 'DELETE', { reason: 'Teste' }]
  ]) {
    const r = await f.request(path, method, body);
    assert.equal(r.status, 503); assert.doesNotMatch(JSON.stringify(r.body), /detalhe interno/);
  }
});
