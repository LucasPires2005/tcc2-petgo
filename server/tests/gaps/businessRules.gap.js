// Especificações executáveis ainda NÃO atendidas. Rodar somente com npm run test:gaps.
// Falham de verdade (sem skip/todo): devem ir para a suíte principal após cada correção.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('../helpers/routeFixture');

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
    // Reproduz a referência efetivamente criada pela rota atual para este tipo.
    const reference = f.calls.find(c => c.kind === 'preference').body.external_reference;
    const webhook = await routeFixture(t, 'auth', { payment: { status: 'approved', external_reference: reference } });
    await webhook.request('/webhook', { body: { type: 'payment', data: { id: 'test' } } });
    assert.equal(webhook.calls.filter(c => c.kind === 'run' && c.sql.includes('plan_tier')).length, 0);
  });
}

test('GAP-WEBHOOK: notificação repetida deve ser processada apenas uma vez', async (t) => {
  const f = await routeFixture(t);
  const notification = { body: { type: 'payment', data: { id: 'same-payment' } } };
  await f.request('/webhook', notification);
  await f.request('/webhook', notification);
  assert.equal(f.calls.filter(c => c.kind === 'run').length, 1);
});

test('GAP-RESCUE: repetir o resgate não concede uma segunda recompensa', async (t) => {
  const f = await routeFixture(t, 'animals');
  const request = { method: 'PATCH', token: f.token, body: { rescuer_name: 'Teste', rescuer_contact: 'teste' } };
  assert.equal((await f.request('/42/rescue', request)).status, 200);
  const coinsAfterFirst = f.state.coins;
  await f.request('/42/rescue', request);
  assert.equal(f.state.coins, coinsAfterFirst);
});

test('GAP-COINS: custo negativo não pode aumentar o saldo', async (t) => {
  const f = await routeFixture(t);
  const r = await f.request('/buy-product', { token: f.token, body: { cost: -50, productName: 'Teste' } });
  assert.equal(r.status, 400);
  assert.equal(f.state.coins, 100);
});
