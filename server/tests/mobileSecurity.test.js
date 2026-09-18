const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { issueMobileToken, verifyMobileToken } = require('../services/mobileSession');
const { createRequireMobileUser, bindMobileIdentity, bindAnimalActor } = require('../middleware/requireMobileUser');
const { createAdminRouter } = require('../routes/createAdminRouter');
process.env.MOBILE_JWT_SECRET = crypto.randomBytes(32).toString('hex');

test('JWT verifica assinatura, expiração, algoritmo e versão', () => {
  const token = issueMobileToken(7, 2);
  assert.equal(verifyMobileToken(token).sub, '7');
  assert.equal(verifyMobileToken(token).ver, 2);
  assert.equal(verifyMobileToken(`${token}x`), null);
  assert.equal(verifyMobileToken('not-a-token'), null);
  const [head, payload] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  function forge(header, body) {
    const input = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(body)).toString('base64url')}`;
    return `${input}.${crypto.createHmac('sha256', process.env.MOBILE_JWT_SECRET).update(input).digest('base64url')}`;
  }
  assert.equal(verifyMobileToken(forge({ alg: 'none', typ: 'JWT' }, claims)), null);
  assert.equal(verifyMobileToken(forge(JSON.parse(Buffer.from(head, 'base64url')), { ...claims, exp: 1 })), null);
});

async function fixture(t) {
  const state = { banned: false, version: 0, admin: true, protectedAdmin: false, fail: false, mutations: 0 };
  const db = { get(sql, params, cb) {
    if (sql.startsWith('SELECT auth_user_id FROM petgo_private.admin_users')) return cb(null, state.admin ? {} : null);
    if (state.fail) return cb({ code: '08006' });
    if (sql.startsWith('INSERT INTO petgo_private.user_access')) {
      if (state.protectedAdmin) return cb(null, null);
      state.banned = params[0]; state.version++;
      return cb(null, { user_id: 7, banned: state.banned });
    }
    return cb(null, { id: 7, banned: state.banned, version: state.version });
  } };
  const app = express(); app.use(express.json());
  app.use('/admin', createAdminRouter({ db, auth: { getUser: async () => ({ data: { user: { id: 'admin', email_confirmed_at: 'yes' } } }) } }));
  const guard = createRequireMobileUser({ db });
  app.post('/coins', guard, bindMobileIdentity, (req, res) => { state.mutations++; res.json(req.body); });
  app.post('/animals/:id/rescue', guard, bindAnimalActor, (req, res) => res.json(req.body));
  app.get('/profile/:id', guard, bindMobileIdentity, (req, res) => res.json(req.mobileUser));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { state, async request(path, token, body, method = 'POST') {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, body: await r.json() };
  } };
}

test('banimento bloqueia token ativo; desbanir não reativa o token antigo', async (t) => {
  const f = await fixture(t); const token = issueMobileToken(7);
  assert.equal((await f.request('/coins', token, { userId: 99 })).body.userId, 7);
  assert.equal((await f.request('/admin/users/7/ban', 'admin', { banned: true }, 'PUT')).status, 200);
  const denied = await f.request('/coins', token, {});
  assert.equal(denied.status, 403); assert.equal(denied.body.code, 'ACCOUNT_BANNED');
  assert.equal(f.state.mutations, 1);
  await f.request('/admin/users/7/ban', 'admin', { banned: false }, 'PUT');
  assert.equal((await f.request('/coins', token, {})).status, 401);
  assert.equal((await f.request('/coins', issueMobileToken(7, 2), {})).status, 200);
});

test('sem token, token adulterado, conta alheia e indisponibilidade falham fechados', async (t) => {
  const f = await fixture(t); const token = issueMobileToken(7);
  assert.equal((await f.request('/coins', null, {})).status, 401);
  assert.equal((await f.request('/coins', `${token}x`, {})).status, 401);
  assert.equal((await f.request('/profile/99', token, undefined, 'GET')).status, 403);
  assert.equal((await f.request('/animals/99/rescue', token, { userId: 99 })).body.userId, 7);
  f.state.fail = true;
  assert.equal((await f.request('/coins', token, {})).status, 503);
  assert.equal(f.state.mutations, 0);
});

test('ação admin valida corpo, nega usuário comum e protege contas ADM', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/admin/users/7/ban', null, { banned: true }, 'PUT')).status, 401);
  f.state.admin = false;
  assert.equal((await f.request('/admin/users/7/ban', 'token', { banned: true }, 'PUT')).status, 403);
  f.state.admin = true; f.state.protectedAdmin = true;
  assert.equal((await f.request('/admin/users/7/ban', 'token', { banned: true }, 'PUT')).status, 409);
  assert.equal((await f.request('/admin/users/7/ban', 'token', { banned: 'true' }, 'PUT')).status, 400);
  assert.equal(f.state.version, 0);
});
