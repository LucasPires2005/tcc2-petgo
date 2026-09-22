const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');

test('checkout usa identidade do JWT e prefere URL Sandbox', async (t) => {
  const f = await routeFixture(t);
  const r = await f.request('/create-preference', { token: f.token,
    body: { userId: 99, title: 'Plano teste', price: 10, planTier: 2 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.init_point, 'https://sandbox.example.test/checkout');
  const request = f.calls.find(c => c.kind === 'preference').body;
  assert.equal(request.external_reference, '7_2');
  assert.equal(request.items[0].unit_price, 10);
  assert.equal(request.items[0].currency_id, 'BRL');
});

test('checkout sem sessão não chama Mercado Pago', async (t) => {
  const f = await routeFixture(t);
  assert.equal((await f.request('/create-preference', { body: { price: 10 } })).status, 401);
  assert.equal(f.calls.length, 0);
});

test('erro do checkout não devolve sucesso nem detalhes do provedor', async (t) => {
  const f = await routeFixture(t, 'auth', { paymentError: new Error('provider secret') });
  const r = await f.request('/create-preference', { token: f.token, body: { price: 10, planTier: 2 } });
  assert.equal(r.status, 500);
  assert.equal(r.body.init_point, undefined);
  assert.doesNotMatch(r.body.error, /provider secret/);
});

for (const status of ['pending', 'rejected', 'cancelled']) {
  test(`webhook consulta provedor e não ativa plano com pagamento ${status}`, async (t) => {
    const f = await routeFixture(t, 'auth', { payment: { status, external_reference: '7_2' } });
    const r = await f.request('/webhook', { body: { type: 'payment', data: { id: 'payment-test' }, status: 'approved' } });
    assert.equal(r.status, 200);
    assert.deepEqual(f.calls.find(c => c.kind === 'payment'), { kind: 'payment', id: 'payment-test' });
    assert.equal(f.calls.some(c => c.kind === 'run'), false);
  });
}

test('webhook aprovado usa referência consultada no provedor, não o usuário do payload', async (t) => {
  const f = await routeFixture(t);
  assert.equal((await f.request('/webhook', { body: { type: 'payment', data: { id: 'test' }, userId: 99, planTier: 3 } })).status, 200);
  const writes = f.calls.filter(c => c.kind === 'run');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].params, ['2', '7']);
});

test('webhook aceita formato query e ignora eventos de outro tipo', async (t) => {
  const f = await routeFixture(t);
  await f.request('/webhook?type=payment&data.id=test');
  assert.equal(f.calls.filter(c => c.kind === 'payment').length, 1);
  await f.request('/webhook', { body: { type: 'merchant_order', data: { id: 'other' } } });
  assert.equal(f.calls.filter(c => c.kind === 'payment').length, 1);
});

test('retornos públicos de sucesso, falha e pendência não alteram dados', async (t) => {
  const f = await routeFixture(t);
  for (const page of ['success', 'failure', 'pending']) {
    assert.equal((await f.request(`/payment-${page}?userId=99&planTier=3`, { method: 'GET' })).status, 200);
  }
  assert.equal(f.calls.length, 0);
});

test('compra com Coins debita conta do token e preserva saldo quando insuficiente', async (t) => {
  const f = await routeFixture(t);
  const buy = cost => f.request('/buy-product', { token: f.token, body: { userId: 99, cost, productName: 'Teste' } });
  assert.equal((await buy(30)).body.newBalance, 70);
  assert.equal((await buy(90)).status, 400);
  assert.equal(f.state.coins, 70);
  const debit = f.calls.find(c => c.kind === 'get' && c.sql.includes('UPDATE users SET coins'));
  assert.deepEqual(debit.params, [30, 7, 30, 2147483647]);
  assert.match(debit.sql, /coins >= \?/);
});
