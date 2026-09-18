const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequireAdmin } = require('../middleware/requireAdmin');

function setup({ header = 'Bearer valid-token', authError, user = { id: 'verified-id', email: 'admin@example.test', email_confirmed_at: '2026-01-01' }, membership, dbError } = {}) {
  let queries = 0;
  let verifiedToken;
  let nextCalls = 0;
  let currentMembership = membership;
  const middleware = createRequireAdmin({
    auth: { getUser: async (token) => { verifiedToken = token; return { data: { user }, error: authError }; } },
    db: { get: (sql, params, callback) => {
      queries++;
      assert.match(sql, /petgo_private\.admin_users/);
      assert.deepEqual(params, ['verified-id']);
      callback(dbError, currentMembership);
    } }
  });
  const req = { get: () => header, body: { role: 'admin', id: 'forged-id' } };
  const res = { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return {
    run: () => middleware(req, res, () => nextCalls++), req, res,
    revoke: () => { currentMembership = undefined; },
    result: () => ({ queries, verifiedToken, nextCalls })
  };
}

test('nega chamada sem Bearer antes de consultar banco', async () => {
  const s = setup({ header: '' }); await s.run();
  assert.equal(s.res.statusCode, 401); assert.equal(s.result().queries, 0);
});
test('nega token inválido mesmo que o cliente se declare admin', async () => {
  const s = setup({ authError: { status: 401 }, membership: {} }); await s.run();
  assert.equal(s.res.statusCode, 401); assert.equal(s.result().queries, 0);
});
test('nega usuário sem e-mail confirmado', async () => {
  const s = setup({ user: { id: 'verified-id' } }); await s.run();
  assert.equal(s.res.statusCode, 403); assert.equal(s.result().queries, 0);
});
test('nega usuário comum', async () => {
  const s = setup(); await s.run();
  assert.equal(s.res.statusCode, 403); assert.equal(s.result().nextCalls, 0);
});
test('autoriza somente identidade validada e cadastrada na tabela privada', async () => {
  const s = setup({ membership: { auth_user_id: 'verified-id' } }); await s.run();
  assert.equal(s.result().verifiedToken, 'valid-token');
  assert.equal(s.result().nextCalls, 1);
  assert.deepEqual(s.req.admin, { id: 'verified-id', email: 'admin@example.test' });
});
test('nega acesso quando banco ou tabela de permissões está indisponível', async () => {
  const s = setup({ dbError: { code: '42P01' } }); await s.run();
  assert.equal(s.res.statusCode, 503); assert.equal(s.result().nextCalls, 0);
});
test('diferencia falha do Supabase de credenciais inválidas', async () => {
  const s = setup({ authError: { status: 503 } }); await s.run();
  assert.equal(s.res.statusCode, 503); assert.equal(s.result().queries, 0);
});
test('revogação é consultada novamente mesmo com o mesmo token', async () => {
  const s = setup({ membership: {} }); await s.run();
  assert.equal(s.result().nextCalls, 1);
  s.revoke(); await s.run();
  assert.equal(s.res.statusCode, 403);
  assert.equal(s.result().nextCalls, 1);
  assert.equal(s.result().queries, 2);
});
