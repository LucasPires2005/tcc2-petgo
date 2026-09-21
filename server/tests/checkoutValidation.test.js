// Especificações GAP-CHECKOUT/GAP-TYPE promovidas à regressão após correção.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');

for (const [label, body] of [
  ['preço negativo', { price: -1, planTier: 2 }],
  ['tipo inválido', { price: 10, planTier: 2, type: 'invalid' }],
  ['plano inexistente', { price: 10, planTier: 999 }]
]) {
  test(`GAP-CHECKOUT: rejeitar ${label} antes de criar preferência`, async (t) => {
    const f = await routeFixture(t);
    const r = await f.request('/create-preference', { token: f.token, body });
    assert.equal(r.status, 400);
    assert.equal(f.calls.some(c => c.kind === 'preference'), false);
  });
}

for (const type of ['store_purchase', 'donation']) {
  test(`GAP-TYPE: pagamento ${type} não pode escrever plano`, async (t) => {
    const f = await routeFixture(t);
    await f.request('/create-preference', { token: f.token, body: { type, title: 'Teste', price: 10 } });
    const reference = f.calls.find(c => c.kind === 'preference').body.external_reference;
    const webhook = await routeFixture(t, 'auth', { payment: { status: 'approved', external_reference: reference } });
    await webhook.request('/webhook', { body: { type: 'payment', data: { id: 'test' } } });
    assert.equal(webhook.calls.filter(c => c.kind === 'run' && c.sql.includes('plan_tier')).length, 0);
  });
}
