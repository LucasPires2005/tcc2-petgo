const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');

test('GAP-COINS: custo negativo não pode aumentar o saldo', async t => {
  const f = await routeFixture(t);
  const r = await f.request('/buy-product', { token: f.token, body: { cost: -50, productName: 'Teste' } });
  assert.equal(r.status, 400);
  assert.equal(f.state.coins, 100);
});

for (const [path, field] of [['/buy-product', 'cost'], ['/redeem', 'cost'], ['/donate', 'amount'], ['/add-coins', 'baseAmount']]) {
  test(`${path}: rejeita valores inválidos sem gravar`, async t => {
    const f = await routeFixture(t);
    for (const value of [-1, 0, 0.5, null, '', '10', true, [], {}, 2147483648]) {
      assert.equal((await f.request(path, { token: f.token, body: { [field]: value } })).status, 400);
      assert.equal(f.state.coins, 100);
    }
    assert.equal(f.calls.some(c => c.sql?.includes('UPDATE users')), false);
  });
  test(`${path}: falha do banco não informa sucesso`, async t => {
    const f = await routeFixture(t, 'auth', { writeError: new Error('db unavailable') });
    assert.equal((await f.request(path, { token: f.token, body: { [field]: 10 } })).status, 500);
    assert.equal(f.state.coins, 100);
  });
}

test('débitos simultâneos não gastam duas vezes o mesmo saldo (adaptador simulado)', async t => {
  const f = await routeFixture(t);
  const results = await Promise.all(['/buy-product', '/redeem'].map(path =>
    f.request(path, { token: f.token, body: { cost: 80 } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal(f.state.coins, 20);
});

test('créditos preservam multiplicador, acumulam e rejeitam overflow', async t => {
  const f = await routeFixture(t);
  const r = await f.request('/add-coins', { token: f.token });
  assert.equal(r.body.earnedCoins, 20);
  assert.equal(r.body.newBalance, 120);
  assert.equal((await f.request('/add-coins', { token: f.token, body: { baseAmount: 2147483647 } })).status, 400);
  assert.equal(f.state.coins, 120);
});

test('upgrade debita 50 somente uma vez e não confirma erro de escrita', async t => {
  const f = await routeFixture(t);
  assert.equal((await f.request('/upgrade-pro', { token: f.token })).body.user.coins, 50);
  assert.equal((await f.request('/upgrade-pro', { token: f.token })).status, 400);
  assert.equal(f.state.coins, 50);
  const broken = await routeFixture(t, 'auth', { writeError: new Error('db') });
  assert.equal((await broken.request('/upgrade-pro', { token: broken.token })).status, 500);
});

test('doação e resgate preservam respostas válidas e rejeitam saldo inválido', async t => {
  const f = await routeFixture(t);
  assert.equal((await f.request('/donate', { token: f.token, body: { amount: 20 } })).body.newBalance, 80);
  const redeemed = await f.request('/redeem', { token: f.token, body: { cost: 80 } });
  assert.equal(redeemed.body.newBalance, 0);
  assert.match(redeemed.body.couponCode, /^PET-/);
  const broken = await routeFixture(t, 'auth', { user: { coins: -10 } });
  assert.equal((await broken.request('/donate', { token: broken.token, body: { amount: 1 } })).status, 400);
});
