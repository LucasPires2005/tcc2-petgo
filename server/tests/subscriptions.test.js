const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectPeriod, profileWithValidity } = require('../services/subscriptions');
const { routeFixture } = require('./helpers/routeFixture');
const { normalizeCheckout } = require('../services/checkout');

const at = '2026-01-31T12:00:00.000Z';
const event = (tier, approved_at = at, event_key = 'mp:1') => ({ tier, approved_at, event_key });
const blank = { tier: 0, start: null, end: null };

test('prazo fixo de 30 dias em UTC atravessa fevereiro, não soma mês de calendário', () => {
  assert.equal(projectPeriod(blank, [event(2)]).end, '2026-03-02T12:00:00.000Z');
});
test('mesmo plano vigente acrescenta 30 dias; troca e vencido reiniciam', () => {
  const first = projectPeriod(blank, [event(2)]);
  assert.equal(projectPeriod(first, [event(2, '2026-02-10T12:00:00Z')]).end, '2026-04-01T12:00:00.000Z');
  assert.equal(projectPeriod(first, [event(3, '2026-02-10T12:00:00Z')]).end, '2026-03-12T12:00:00.000Z');
  assert.equal(projectPeriod(first, [event(2, '2026-03-05T12:00:00Z')]).end, '2026-04-04T12:00:00.000Z');
});
test('projeção ordena aprovações, independentemente da ordem dos webhooks', () => {
  const events = [event(2), event(2, '2026-02-01T12:00:00Z', 'mp:2'), event(3, '2026-02-10T12:00:00Z', 'mp:3')];
  assert.deepEqual(projectPeriod(blank, events), projectPeriod(blank, events.reverse()));
});
test('legados permanecem ativos; primeira renovação inicia 30 dias', () => {
  const profile = profileWithValidity({ plan_tier: 3, is_premium: 1 });
  assert.equal(profile.subscription_status, 'LEGACY');
  assert.equal(profile.premium_status, 'LEGACY');
  assert.equal(projectPeriod({ ...blank, tier: 3 }, [event(3)]).end, '2026-03-02T12:00:00.000Z');
});
test('expiração no instante exato remove somente o benefício vencido', () => {
  const profile = profileWithValidity({ plan_tier: 3, is_premium: 1, subscription_start_date: at,
    subscription_end_date: '2026-03-02T12:00:00Z' }, Date.parse('2026-03-02T12:00:00Z'));
  assert.equal(profile.plan_tier, 0);
  assert.equal(profile.subscription_status, 'EXPIRED');
  assert.equal(profile.is_premium, 1);
});
test('GAP-WEBHOOK: duas notificações simultâneas gravam somente uma ativação', async t => {
  const f = await routeFixture(t);
  const request = () => f.request('/webhook', { body: { type: 'payment', data: { id: 'payment-test' } } });
  const responses = await Promise.all([request(), request()]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(f.state.events.length, 1);
  assert.equal(f.calls.filter(c => c.kind === 'tx' && c.sql.startsWith('UPDATE public.users SET')).length, 1);
});
test('webhook e checkout-status compartilham o mesmo ID de pagamento', async t => {
  const intent = normalizeCheckout({ type: 'plan', planTier: 2, price: 39.9 }, 7);
  const preference = { metadata: intent.metadata, external_reference: intent.reference, date_created: at };
  const payment = { id: 700, status: 'approved', date_approved: new Date().toISOString(), date_created: at,
    currency_id: 'BRL', transaction_amount: 39.9, external_reference: intent.reference };
  const f = await routeFixture(t, 'auth', { preference, payment, payments: [payment] });
  await f.request('/webhook', { body: { type: 'payment', data: { id: 700 } } });
  assert.equal((await f.request('/checkout-status?preferenceId=pref-1', { method: 'GET', token: f.token })).status, 200);
  assert.equal(f.state.events.length, 1);
});
test('PRO com operationId é renovável e idempotente; prazo do plano não muda', async t => {
  const f = await routeFixture(t, 'auth', { user: { is_premium: 1, coins: 150 } });
  const buy = operationId => f.request('/upgrade-pro', { token: f.token, body: { operationId } });
  const first = await buy('operation-coins-0001');
  assert.equal(first.status, 200);
  assert.equal(first.body.user.plan_tier, 2);
  assert.equal(first.body.user.subscription_end_date, null);
  const repeated = await buy('operation-coins-0001');
  assert.equal(repeated.body.duplicate, true);
  assert.equal(repeated.body.user.premium_end_date, first.body.user.premium_end_date);
  const second = await buy('operation-coins-0002');
  assert.equal(Date.parse(second.body.user.premium_end_date) - Date.parse(first.body.user.premium_end_date), 30 * 86400000);
  assert.equal(f.state.coins, 50);
});
test('falha após inserir evento desfaz registro, prazo e débito; webhook pede retry', async t => {
  const f = await routeFixture(t, 'auth', { activationWriteError: new Error('db') });
  assert.equal((await f.request('/upgrade-pro', { token: f.token, body: { operationId: 'operation-coins-0001' } })).status, 500);
  assert.equal(f.state.coins, 100);
  assert.equal(f.state.events.length, 0);
  assert.equal((await f.request('/webhook', { body: { type: 'payment', data: { id: 'payment-test' } } })).status, 503);
  assert.equal(f.state.events.length, 0);
});
test('Pix de demonstração exige tier válido e deduplica operationId', async t => {
  const f = await routeFixture(t);
  const request = body => f.request('/subscribe-plan', { token: f.token, body });
  assert.equal((await request({ planTier: 9 })).status, 400);
  assert.equal((await request({ planTier: 3, operationId: 'bad' })).status, 400);
  const body = { planTier: 3, operationId: 'operation-pix-000001' };
  assert.equal((await request(body)).status, 200);
  assert.equal((await request(body)).body.duplicate, true);
  assert.equal((await request({ ...body, planTier: 1 })).status, 409);
  assert.equal(f.state.events.length, 1);
  assert.equal(f.state.coins, 100);
});
test('plano expirado não multiplica crédito e perfil de login traz datas sem senha', async t => {
  const f = await routeFixture(t, 'auth', { user: { plan_tier: 3, subscription_start_date: at,
    subscription_end_date: '2026-03-02T12:00:00Z' } });
  const credited = await f.request('/add-coins', { token: f.token, body: { baseAmount: 10 } });
  assert.equal(credited.body.multiplier, 1);
  assert.equal(credited.body.earnedCoins, 10);
  const login = await f.request('/login', { body: { email: 'test@example.test', password: 'secret123' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.plan_tier, 0);
  assert.equal(login.body.subscription_status, 'EXPIRED');
  assert.equal(login.body.password, undefined);
  assert.ok(login.body.accessToken);
});
test('pagamento anterior à implantação não converte benefício legado em vencido', async t => {
  const f = await routeFixture(t, 'auth', { rollout: '2099-01-01T00:00:00Z' });
  assert.equal((await f.request('/webhook', { body: { type: 'payment', data: { id: 'payment-test' } } })).status, 200);
  assert.equal(f.state.events.length, 0);
});
