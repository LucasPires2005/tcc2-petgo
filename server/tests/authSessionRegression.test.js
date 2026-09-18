const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const { verifyMobileToken } = require('../services/mobileSession');
process.env.MOBILE_JWT_SECRET = 'test-only-secret-with-more-than-32-bytes';

async function fixture(t, { legacy = false, banned = false } = {}) {
  const calls = [];
  const user = { id: 7, name: 'Teste', email: 'test@example.test', password: 'secret123', auth_user_id: legacy ? null : 'uuid' };
  const db = {
    get(sql, params, cb) {
      if (sql.includes('user_access')) return cb(null, { id: 7, version: 0, banned });
      if (sql === 'SELECT id FROM users WHERE LOWER(TRIM(email)) = ?') return cb(null, null);
      cb(null, user);
    },
    run(sql, params, cb) { calls.push(['sql', sql]); cb(null); }
  };
  const auth = {
    signInWithPassword: async (args) => { calls.push(['login', args]); return { error: null }; },
    signUp: async (args) => { calls.push(['signup', args]); return { data: { user: { id: 'uuid', identities: [{}] } } }; },
    resend: async (args) => { calls.push(['resend', args]); return {}; },
    resetPasswordForEmail: async (...args) => { calls.push(['recovery', ...args]); return {}; },
    getUser: async (token) => { calls.push(['recoveryToken', token]); return { data: { user: { id: 'uuid' } } }; },
    admin: { updateUserById: async (...args) => { calls.push(['updatePassword', ...args]); return {}; } }
  };
  const filename = path.resolve(__dirname, '../routes/auth.js');
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  const load = (name) => {
    if (name === '../db') return db;
    if (name === '@supabase/supabase-js') return { createClient: () => ({ auth }) };
    if (name === 'mercadopago') return { MercadoPagoConfig: class {}, Preference: class {}, Payment: class {} };
    return realRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: load, module, console, process: { env: { SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'test' } }
  }, { filename });
  const app = express(); app.use(express.json()); app.use('/auth', module.exports);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { calls, async request(route, body = {}, method = 'POST') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth${route}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
  } };
}

test('login Supabase e legado mantêm perfil e recebem JWT; conta banida não recebe token', async (t) => {
  for (const legacy of [false, true]) {
    const f = await fixture(t, { legacy });
    const r = await f.request('/login', { email: ' TEST@example.test ', password: 'secret123' });
    assert.equal(r.status, 200); assert.equal(r.body.id, 7);
    assert.equal(verifyMobileToken(r.body.accessToken).sub, '7');
    assert.equal(r.body.password, undefined);
  }
  const f = await fixture(t, { banned: true });
  assert.equal((await f.request('/login', { email: 'test@example.test', password: 'secret123' })).status, 403);
});

test('cadastro, reenvio e recuperação permanecem públicos e mantêm redirects', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/register', { name: 'Teste', email: 'test@example.test', password: 'secret123' })).status, 201);
  assert.equal((await f.request('/resend-confirmation', { email: 'test@example.test' })).status, 200);
  assert.equal((await f.request('/request-password-reset', { email: 'test@example.test' })).status, 200);
  assert.equal((await f.request('/reset-password', { token: 'supabase-recovery-token', newPassword: 'new-secret123' })).status, 200);
  assert.equal(f.calls.find(([name]) => name === 'signup')[1].options.emailRedirectTo, 'petgo://auth/callback');
  assert.equal(f.calls.find(([name]) => name === 'recovery')[2].redirectTo, 'petgo://auth/reset-password');
  assert.equal(f.calls.find(([name]) => name === 'recoveryToken')[1], 'supabase-recovery-token');
});

test('operações protegidas rejeitam APK antigo sem token; retorno de pagamento não escreve no banco', async (t) => {
  const f = await fixture(t);
  for (const [route, method] of [['/add-coins', 'POST'], ['/buy-product', 'POST'], ['/update', 'PUT'], ['/delete/7', 'DELETE'], ['/update-status/7', 'GET'], ['/create-preference', 'POST']]) {
    assert.equal((await f.request(route, { id: 7, userId: 7 }, method)).status, 401);
  }
  assert.equal((await f.request('/payment-success?userId=7&planTier=3', {}, 'GET')).status, 200);
  assert.equal(f.calls.length, 0);
});
