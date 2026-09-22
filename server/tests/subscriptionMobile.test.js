const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function source(name) {
  const text = fs.readFileSync(path.resolve(__dirname, `../../app/services/${name}.js`), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
}

test('vigência mobile distingue plano e PRO, cancelado conserva selo até expirar', async () => {
  const { benefit, localDate } = await source('subscriptionDisplay');
  const now = Date.parse('2026-01-01T00:00:00Z');
  const profile = { plan_tier: 3, is_premium: 1, subscription_end_date: '2026-02-01T12:00:00Z', subscription_status: 'CANCELLED' };
  assert.equal(benefit(profile, 'plan', now).active, true);
  assert.match(benefit(profile, 'plan', now).text, /Cancelado \(Acesso até/);
  assert.equal(benefit(profile, 'premium', now).status, 'LEGACY');
  assert.equal(benefit(profile, 'plan', Date.parse(profile.subscription_end_date)).status, 'EXPIRED');
  assert.equal(benefit({ ...profile, subscription_status: 'EXPIRED' }, 'plan', now).active, false);
  assert.equal(localDate('invalid'), null);
  const date = new Date(profile.subscription_end_date);
  assert.equal(localDate(profile.subscription_end_date), `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`);
});
test('operationId persiste antes de enviar, sobrevive a timeout e reinício, nova compra recebe outro ID', async () => {
  const { createOperationRunner, newOperationId } = await source('subscriptionOperations');
  const memory = new Map();
  const ids = [];
  let fail = true;
  const dependencies = {
    read: async key => memory.get(key), write: async (key, value) => memory.set(key, value),
    send: async (_, payload) => {
      assert.equal(memory.get('account-7').operationId, payload.operationId);
      ids.push(payload.operationId);
      if (fail) throw new Error('timeout');
      return new Response(JSON.stringify({ user: {} }), { status: 200 });
    }
  };
  await assert.rejects(createOperationRunner(dependencies)('account-7', 'upgrade-pro', {}), /timeout/);
  fail = false;
  const run = createOperationRunner(dependencies);
  await run('account-7', 'upgrade-pro', {});
  assert.equal(ids[0], ids[1]);
  await run('account-7', 'upgrade-pro', {});
  assert.notEqual(ids[1], ids[2]);
  assert.match(newOperationId(), /^[a-zA-Z0-9_-]{16,100}$/);
});
test('pendência não mistura contas nem tipos; 5xx mantém ID e 400 libera', async () => {
  const { createOperationRunner } = await source('subscriptionOperations');
  const memory = new Map();
  let status = 503;
  const run = createOperationRunner({ read: async k => memory.get(k), write: async (k, v) => memory.set(k, v),
    send: async () => new Response('{}', { status }) });
  await run('account-7', 'subscribe-plan', { planTier: 2 });
  const id = memory.get('account-7').operationId;
  await assert.rejects(run('account-7', 'upgrade-pro', {}), /pendente/);
  await run('account-8', 'upgrade-pro', {});
  assert.notEqual(memory.get('account-8').operationId, id);
  status = 400;
  await run('account-7', 'subscribe-plan', { planTier: 2 });
  assert.equal(memory.get('account-7'), null);
});
test('toques simultâneos não enviam duas ativações; falha ao persistir não envia', async () => {
  const { createOperationRunner } = await source('subscriptionOperations');
  let finish;
  let sends = 0;
  const run = createOperationRunner({ read: async () => null, write: async () => {}, send: () => {
    sends++; return new Promise(resolve => { finish = resolve; });
  } });
  const first = run('account', 'upgrade-pro', {});
  await assert.rejects(run('account', 'upgrade-pro', {}), /andamento/);
  await new Promise(resolve => setImmediate(resolve));
  finish(new Response('{}'));
  await first;
  assert.equal(sends, 1);
  const broken = createOperationRunner({ read: async () => null, write: async () => { throw new Error('disk'); }, send: () => { sends++; } });
  await assert.rejects(broken('account', 'upgrade-pro', {}), /disk/);
  assert.equal(sends, 1);
});

test('troca de sessão durante leitura local não envia operação na nova conta', async () => {
  const { createOperationRunner } = await source('subscriptionOperations');
  const api = await source('mobileApi');
  api.setMobileSession('account-7-token');
  const guard = api.captureSessionGuard();
  let sends = 0;
  const run = createOperationRunner({ read: async () => {
    api.setMobileSession('account-8-token'); return null;
  }, write: async () => {}, send: async () => { sends++; } });
  await assert.rejects(run('account-7', 'upgrade-pro', {}, guard), /sessão mudou/);
  assert.equal(sends, 0);
  api.setMobileSession(null);
});

test('sessão expirada preserva operationId até nova autenticação e confirmação', async () => {
  const { createOperationRunner } = await source('subscriptionOperations');
  let saved = null;
  let status = 401;
  const run = createOperationRunner({ read: async () => saved, write: async (_, v) => { saved = v; },
    send: async () => new Response('{}', { status }) });
  await run('account', 'upgrade-pro', {});
  assert.ok(saved.operationId);
  status = 200;
  await run('account', 'upgrade-pro', {});
  assert.equal(saved, null);
});
