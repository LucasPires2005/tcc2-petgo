const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture, animalForm } = require('./helpers/routeFixture');

function rescue(f, id = '42') {
  return f.request(`/${id}/rescue`, { method: 'PATCH', token: f.token,
    body: { rescuer_name: 'Teste', rescuer_contact: 'teste', userId: 99 } });
}

test('GAP-RESCUE: repetir o resgate não concede uma segunda recompensa', async t => {
  const f = await routeFixture(t, 'animals');
  assert.equal((await rescue(f)).status, 200);
  const balance = f.state.coins;
  assert.equal((await rescue(f)).status, 409);
  assert.equal(f.state.coins, balance);
  assert.equal(f.state.rescuer, 7);
});
test('resgates concorrentes: somente uma confirmação e um crédito', async t => {
  const f = await routeFixture(t, 'animals');
  const results = await Promise.all(Array.from({ length: 8 }, () => rescue(f)));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 7);
  assert.equal(f.state.coins, 200);
  assert.equal(f.calls.filter(c => c.sql?.startsWith('UPDATE public.users SET coins')).length, 1);
  assert.match(f.calls.find(c => c.kind === 'tx').sql, /FOR UPDATE/);
});
test('falha de recompensa reverte também o status do animal', async t => {
  const f = await routeFixture(t, 'animals', { rewardError: new Error('secret database') });
  const r = await rescue(f);
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.body.error, /secret/);
  assert.equal(f.state.rescued, false);
  assert.equal(f.state.coins, 100);
});
test('falha no status não concede moedas; overflow reverte o resgate', async t => {
  for (const options of [{ animalWriteError: new Error('db') }, { user: { coins: 2147483640 } }, { user: { coins: -1 } }]) {
    const f = await routeFixture(t, 'animals', options);
    const before = f.state.coins;
    assert.equal((await rescue(f)).status, 500);
    assert.equal(f.state.rescued, false);
    assert.equal(f.state.coins, before);
  }
});
test('animal ausente ou ID inválido não produz recompensa', async t => {
  const f = await routeFixture(t, 'animals', { missingAnimal: true });
  assert.equal((await rescue(f)).status, 404);
  assert.equal((await rescue(f, '0')).status, 400);
  assert.equal((await rescue(f, 'abc')).status, 400);
  assert.equal(f.state.coins, 100);
});
test('resgate com plano expirado usa multiplicador básico', async t => {
  const f = await routeFixture(t, 'animals', { user: { plan_tier: 3,
    subscription_start_date: '2020-01-01', subscription_end_date: '2020-02-01' } });
  const r = await rescue(f);
  assert.equal(r.body.earnedCoins, 50);
  assert.equal(r.body.multiplier, 1);
});
test('segunda tentativa com foto não faz outro upload; falha de Storage não grava', async t => {
  const f = await routeFixture(t, 'animals');
  for (const expected of [200, 409]) {
    assert.equal((await f.request('/42/rescue', { method: 'PATCH', token: f.token, form: animalForm('rescue_image') })).status, expected);
  }
  assert.equal(f.calls.filter(c => c.kind === 'upload').length, 1);
  const broken = await routeFixture(t, 'animals', { uploadError: new Error('storage') });
  assert.equal((await broken.request('/42/rescue', { method: 'PATCH', token: broken.token, form: animalForm('rescue_image') })).status, 500);
  assert.equal(broken.state.rescued, false);
  assert.equal(broken.state.coins, 100);
});
