const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');
const { normalizeCheckout } = require('../services/checkout');

function saved(type = 'store_purchase', deliveryType = 'ONG') {
  const intent = normalizeCheckout({ type, title: 'Loja PetGo - Caneca', price: 35,
    ...(type === 'plan' ? { planTier: 2 } : {}),
    ...(type === 'store_purchase' ? { deliveryType, deliveryInfo: 'Local escolhido no teste' } : {}) }, 7);
  return { id: 'pref-123', metadata: intent.metadata, external_reference: intent.reference, date_created: '2026-09-21T10:00:00Z' };
}
function payment(preference, overrides = {}) {
  return { id: 100, status: 'approved', external_reference: preference.external_reference,
    currency_id: 'BRL', transaction_amount: 35, date_created: '2026-09-21T10:01:00Z', ...overrides };
}
const check = f => f.request('/checkout-status?preferenceId=pref-123', { method: 'GET', token: f.token });

test('intenção de entrega fica nos metadados e retornos usam PUBLIC_API_URL', async t => {
  const f = await routeFixture(t, 'auth', { env: { PUBLIC_API_URL: 'https://local.example.test' } });
  const r = await f.request('/create-preference', { token: f.token, body: {
    type: 'store_purchase', title: 'Caneca', price: 35, deliveryType: 'DELIVERY', deliveryInfo: ' Rua de teste, 10 '
  } });
  assert.equal(r.status, 200);
  const body = f.calls.find(c => c.kind === 'preference').body;
  assert.equal(body.metadata.delivery_info, 'Rua de teste, 10');
  assert.equal(body.metadata.delivery_type, 'DELIVERY');
  assert.equal(body.metadata.user_id, '7');
  assert.equal(body.metadata.amount_cents, 3500);
  assert.equal(body.notification_url, 'https://local.example.test/auth/webhook');
  assert.equal(body.back_urls.success, 'https://local.example.test/auth/payment-success');
  assert.doesNotMatch(JSON.stringify(body.back_urls), /Rua/);
});

test('novas tentativas explícitas possuem referências distintas', async t => {
  const f = await routeFixture(t);
  for (let i = 0; i < 2; i++) await f.request('/create-preference', { token: f.token, body: { type: 'plan', planTier: 2, price: 39.9 } });
  const calls = f.calls.filter(c => c.kind === 'preference');
  assert.notEqual(calls[0].body.external_reference, calls[1].body.external_reference);
});

test('valida valores, quantidade, planos e entrega antes de chamar provedor', async t => {
  const f = await routeFixture(t);
  for (const change of [{ price: 0 }, { price: 'abc' }, { price: true }, { price: 1.234 },
    { price: null }, { quantity: 2 }, { deliveryInfo: '' }, { deliveryType: 'INVALID' }, { planTier: 2 }]) {
    const r = await f.request('/create-preference', { token: f.token, body: {
      type: 'store_purchase', price: 35, deliveryType: 'ONG', deliveryInfo: 'Unidade de teste', ...change
    } });
    assert.equal(r.status, 400, JSON.stringify(change));
  }
  assert.equal(f.calls.some(c => c.kind === 'preference'), false);
});

for (const deliveryType of ['ONG', 'DELIVERY']) {
  test(`restaura ${deliveryType} do provedor em nova instância do backend`, async t => {
    const preference = saved('store_purchase', deliveryType);
    const f = await routeFixture(t, 'auth', { preference, payments: [payment(preference)] });
    const r = await check(f);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'approved');
    assert.equal(r.body.deliveryType, deliveryType);
    assert.equal(r.body.deliveryInfo, 'Local escolhido no teste');
    assert.equal(r.body.paymentId, '100');
    assert.equal(f.calls.some(c => c.kind === 'run'), false);
    assert.equal(f.calls.find(c => c.kind === 'preferenceGet').preferenceId, 'pref-123');
  });
}

test('outra conta não recebe endereço nem consulta pagamentos da preferência', async t => {
  const preference = saved(); preference.metadata.user_id = '99';
  const f = await routeFixture(t, 'auth', { preference });
  const r = await check(f);
  assert.equal(r.status, 403);
  assert.equal(r.body.deliveryInfo, undefined);
  assert.equal(f.calls.some(c => c.kind === 'paymentSearch'), false);
});

test('status exige JWT e identificador válido antes de consultar provedor', async t => {
  const f = await routeFixture(t);
  assert.equal((await f.request('/checkout-status?preferenceId=pref-123', { method: 'GET' })).status, 401);
  assert.equal((await f.request('/checkout-status?preferenceId=..%2F', { method: 'GET', token: f.token })).status, 400);
  assert.equal(f.calls.some(c => c.kind === 'preferenceGet'), false);
});

for (const overrides of [{ status: 'pending' }, { transaction_amount: 1 }, { currency_id: 'USD' },
  { external_reference: '7_3' }, { date_created: '2026-09-20T10:00:00Z' }]) {
  test(`não aprova resultado incompatível ou pendente: ${JSON.stringify(overrides)}`, async t => {
    const preference = saved('plan');
    const f = await routeFixture(t, 'auth', { preference, payments: [payment(preference, overrides)] });
    const r = await check(f);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'pending');
    assert.equal(f.calls.some(c => c.kind === 'run'), false);
  });
}

test('consulta de plano aprovado funciona mesmo sem entrega do webhook', async t => {
  const preference = saved('plan');
  const f = await routeFixture(t, 'auth', { preference, payments: [payment(preference)] });
  assert.equal((await check(f)).body.status, 'approved');
  assert.deepEqual(f.calls.find(c => c.kind === 'run').params, ['2', '7']);
});

test('aprovação de doação consultada não altera plano', async t => {
  const preference = saved('donation');
  const f = await routeFixture(t, 'auth', { preference, payments: [payment(preference)] });
  assert.equal((await check(f)).body.type, 'donation');
  assert.equal(f.calls.some(c => c.kind === 'run'), false);
});

test('erro de consulta ou escrita não informa aprovação ao aplicativo', async t => {
  const preference = saved('plan');
  for (const errors of [{ paymentError: new Error('secret') }, { writeError: new Error('db secret') }]) {
    const f = await routeFixture(t, 'auth', { preference, payments: [payment(preference)], ...errors });
    const r = await check(f);
    assert.equal(r.status, 503);
    assert.equal(r.body.status, undefined);
    assert.doesNotMatch(r.body.error, /secret/);
  }
});

test('webhook novo preserva ativação de plano e rejeita referência legada incompleta', async t => {
  const preference = saved('plan');
  const f = await routeFixture(t, 'auth', { payment: payment(preference) });
  await f.request('/webhook', { body: { type: 'payment', data: { id: 'test' } } });
  assert.deepEqual(f.calls.find(c => c.kind === 'run').params, ['2', '7']);
  const invalid = await routeFixture(t, 'auth', { payment: { status: 'approved', external_reference: '7_undefined' } });
  await invalid.request('/webhook', { body: { type: 'payment', data: { id: 'test' } } });
  assert.equal(invalid.calls.some(c => c.kind === 'run'), false);
});
