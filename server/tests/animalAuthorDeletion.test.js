const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture, animalForm } = require('./helpers/routeFixture');

test('exclusão mobile exige sessão e bloqueia banidos antes de executar DELETE', async t => {
  const f = await routeFixture(t, 'animals');
  assert.equal((await f.request('/42', { method: 'DELETE', body: { reason: 'Teste' } })).status, 401);
  const banned = await routeFixture(t, 'animals', { banned: true });
  assert.equal((await banned.request('/42', { method: 'DELETE', token: banned.token, body: { reason: 'Teste' } })).status, 403);
  assert.ok(!banned.calls.some(call => call.sql?.includes('DELETE FROM public.animals')));
});

test('autor vem do JWT e não do payload; excluir não credita ou estorna moedas', async t => {
  const f = await routeFixture(t, 'animals', { authorPhoto: 'https://supabase.example.test/storage/v1/object/public/animals/test.jpg' });
  const r = await f.request('/42', { method: 'DELETE', token: f.token, body: { reason: ' Criado por engano ', userId: 99, creator_id: 99 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.deletedId, 42);
  const query = f.calls.find(call => call.sql?.includes('DELETE FROM public.animals'));
  assert.deepEqual(query.params, ['42', 7, 7, 'Criado por engano']);
  assert.match(query.sql, /creator_id = \?/);
  assert.match(query.sql, /INSERT INTO petgo_private.animal_author_deletions/);
  assert.equal(f.state.coins, 100);
  assert.deepEqual(f.calls.find(call => call.kind === 'removePhoto').paths, ['test.jpg']);
  assert.equal((await f.request('/42', { method: 'DELETE', token: f.token, body: { reason: 'Repetido' } })).status, 404);
});

test('resgatador/outro usuário não pode se passar pelo autor', async t => {
  const f = await routeFixture(t, 'animals', { creatorId: 8 });
  assert.equal((await f.request('/42', { method: 'DELETE', token: f.token, body: { reason: 'Teste', creator_id: 8, userId: 8 } })).status, 404);
  assert.ok(!f.state.authorDeleted);
  assert.ok(!f.calls.some(call => call.kind === 'removePhoto'));
});

test('motivo/ID inválidos são recusados; falha de auditoria impede exclusão e limpeza', async t => {
  const f = await routeFixture(t, 'animals');
  for (const reason of ['', ' a ', 1, null, 'x'.repeat(501)]) {
    assert.equal((await f.request('/42', { method: 'DELETE', token: f.token, body: { reason } })).status, 400);
  }
  assert.equal((await f.request('/bad', { method: 'DELETE', token: f.token, body: { reason: 'Teste' } })).status, 400);
  const failed = await routeFixture(t, 'animals', { authorDeleteError: { code: '42P01' } });
  assert.equal((await failed.request('/42', { method: 'DELETE', token: failed.token, body: { reason: 'Teste' } })).status, 503);
  assert.ok(!failed.state.authorDeleted);
  assert.ok(!failed.calls.some(call => call.kind === 'removePhoto'));
});

test('cadastro grava autoria autenticada independente do userId usado no resgate', async t => {
  const f = await routeFixture(t, 'animals');
  const form = animalForm(); form.append('creator_id', '99');
  const r = await f.request('', { token: f.token, form });
  assert.equal(r.status, 200); assert.equal(r.body.creator_id, 7);
  assert.equal(f.calls.find(call => call.sql?.startsWith('INSERT INTO animals')).params[9], 7);
});
