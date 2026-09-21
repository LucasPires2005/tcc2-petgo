// Especificações executáveis ainda NÃO atendidas. Rodar somente com npm run test:gaps.
// Falham de verdade (sem skip/todo): devem ir para a suíte principal após cada correção.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('../helpers/routeFixture');

// GAP-CHECKOUT/GAP-TYPE agora estão em ../checkoutValidation.test.js.

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
