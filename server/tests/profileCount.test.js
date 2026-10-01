const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');

test('perfil retorna salvos na primeira consulta, apenas do usuário autenticado e status 1', async (t) => {
  const f = await routeFixture(t, 'auth', { animals: [
    { userId: 7, status: 1 }, { userId: 7, status: 1 },
    { userId: 7, status: 0 }, { userId: 99, status: 1 }
  ] });
  const response = await f.request('/update-status/7', { method: 'GET', token: f.token });
  assert.equal(response.status, 200);
  assert.equal(response.body.salvos, 2);
  const query = f.calls.find(call => call.sql?.includes('AS salvos'));
  assert.match(query.sql, /COUNT\(\*\)::integer/);
  assert.match(query.sql, /"userId" = users\.id AND status = 1/);
  assert.deepEqual(query.params, [7]);
  assert.equal(f.calls.some(call => call.kind === 'run'), false);
});

test('perfil sem animais salvos retorna zero numérico', async (t) => {
  const f = await routeFixture(t, 'auth');
  const response = await f.request('/update-status/7', { method: 'GET', token: f.token });
  assert.equal(response.status, 200);
  assert.equal(response.body.salvos, 0);
});

test('perfil preserva rejeição sem JWT e de acesso a outra conta', async (t) => {
  const f = await routeFixture(t, 'auth');
  assert.equal((await f.request('/update-status/7', { method: 'GET' })).status, 401);
  assert.equal((await f.request('/update-status/99', { method: 'GET', token: f.token })).status, 403);
  assert.equal(f.calls.some(call => call.sql?.includes('AS salvos')), false);
});

test('falha no contador não responde sucesso com zero fictício', async (t) => {
  const f = await routeFixture(t, 'auth', { profileError: new Error('private database detail') });
  const response = await f.request('/update-status/7', { method: 'GET', token: f.token });
  assert.equal(response.status, 503);
  assert.equal(response.body.salvos, undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /private database detail/);
});
