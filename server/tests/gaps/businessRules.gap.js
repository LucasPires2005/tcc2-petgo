// Histórico de lacunas: GAP-RESCUE resolvido e também coberto na suíte principal.
// Mantido aqui para permitir verificar o comando npm run test:gaps, sem skip/todo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('../helpers/routeFixture');

// GAP-CHECKOUT/GAP-TYPE agora estão em ../checkoutValidation.test.js.

// GAP-WEBHOOK agora está em ../subscriptions.test.js, incluindo concorrência.

test('GAP-RESCUE: repetir o resgate não concede uma segunda recompensa', async (t) => {
  const f = await routeFixture(t, 'animals');
  const request = { method: 'PATCH', token: f.token, body: { rescuer_name: 'Teste', rescuer_contact: 'teste' } };
  assert.equal((await f.request('/42/rescue', request)).status, 200);
  const coinsAfterFirst = f.state.coins;
  await f.request('/42/rescue', request);
  assert.equal(f.state.coins, coinsAfterFirst);
});

// GAP-COINS agora está em ../coinsRegression.test.js (suíte principal).
