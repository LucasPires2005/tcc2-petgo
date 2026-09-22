const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');
const { profileWithValidity, activateSubscription } = require('../services/subscriptions');
const { subscriptionTransaction } = require('./helpers/subscriptionTransaction');
const future = '2099-01-01T12:00:00Z';
const active = { plan_tier: 3, is_premium: 1, subscription_start_date: '2026-01-01T12:00:00Z', subscription_end_date: future,
  premium_start_date: '2026-01-01T12:00:00Z', premium_end_date: future };

for (const kind of ['plan', 'premium']) {
  test(`cancelar ${kind} mantém acesso, prazo e moedas; repetição não grava novamente`, async t => {
    const f = await routeFixture(t, 'auth', { user: active });
    const cancel = () => f.request('/cancel-subscription', { token: f.token, body: { kind, userId: 99 } });
    const r = await cancel();
    const prefix = kind === 'plan' ? 'subscription' : 'premium';
    assert.equal(r.status, 200);
    assert.equal(r.body.user[`${prefix}_status`], 'CANCELLED');
    assert.equal(r.body.user[`${prefix}_end_date`], future);
    assert.equal(r.body.user.plan_tier, 3);
    assert.equal(r.body.user.is_premium, 1);
    assert.equal(r.body.user[kind === 'plan' ? 'premium_status' : 'subscription_status'], 'ACTIVE');
    assert.equal(f.state.coins, 100);
    assert.equal((await cancel()).body.duplicate, true);
    assert.equal(f.calls.filter(c => c.sql?.includes("_status = 'CANCELLED'")).length, 1);
    assert.equal(f.calls.find(c => c.sql?.includes('FOR UPDATE')).params[0], 7);
    const login = await f.request('/login', { body: { email: 'test@example.test', password: 'secret123' } });
    assert.equal(login.body[`${prefix}_status`], 'CANCELLED');
    const expired = profileWithValidity(r.body.user, Date.parse(future));
    assert.equal(expired[`${prefix}_status`], 'EXPIRED');
    assert.equal(expired[kind === 'plan' ? 'plan_tier' : 'is_premium'], 0);
  });
}
test('cancelamento exige JWT, benefício válido e prazo finito', async t => {
  const f = await routeFixture(t);
  assert.equal((await f.request('/cancel-subscription', { body: { kind: 'plan' } })).status, 401);
  assert.equal((await f.request('/cancel-subscription', { token: f.token, body: { kind: 'admin' } })).status, 400);
  assert.equal((await f.request('/cancel-subscription', { token: f.token, body: { kind: 'plan' } })).status, 409);
  assert.equal(f.calls.some(c => c.sql?.includes("_status = 'CANCELLED'")), false);
  const expired = await routeFixture(t, 'auth', { user: { ...active, subscription_end_date: '2020-01-01' } });
  assert.equal((await expired.request('/cancel-subscription', { token: expired.token, body: { kind: 'plan' } })).status, 409);
});
test('falha de banco no cancelamento não confirma sucesso', async t => {
  const f = await routeFixture(t, 'auth', { user: active, activationWriteError: new Error('database private') });
  const r = await f.request('/cancel-subscription', { token: f.token, body: { kind: 'premium' } });
  assert.equal(r.status, 503);
  assert.doesNotMatch(r.body.error, /database private/);
});
test('pagamento antigo não apaga cancelamento, aprovação posterior reativa e duplicata não reativa', async () => {
  const user = { id: 7, coins: 100, ...active, subscription_cancelled_at: '2026-08-01T00:00:00Z' };
  const state = { coins: 100 };
  const db = { transaction: subscriptionTransaction({ user, state }) };
  const activate = (eventKey, approvedAt) => activateSubscription(db, { userId: 7, kind: 'plan', tier: 3, eventKey, approvedAt });
  assert.equal((await activate('mp:old', '2026-07-01T00:00:00Z')).user.subscription_status, 'CANCELLED');
  assert.equal((await activate('mp:new', '2026-09-01T00:00:00Z')).user.subscription_status, 'ACTIVE');
  user.subscription_cancelled_at = '2026-09-02T00:00:00Z';
  assert.equal((await activate('mp:new', '2026-09-01T00:00:00Z')).user.subscription_status, 'CANCELLED');
});
