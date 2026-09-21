const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const multer = require('multer');
const session = require('../../services/mobileSession');
const middleware = require('../../middleware/requireMobileUser');

// Somente processos de teste importam este arquivo. Não carrega .env nem db.js.
process.env.MOBILE_JWT_SECRET = 'petgo-phase1-test-only-secret-at-least-32-bytes';

async function routeFixture(t, route = 'auth', options = {}) {
  assert.ok(['auth', 'animals'].includes(route));
  const calls = [];
  const user = { id: 7, name: 'Teste', email: 'test@example.test', password: 'secret123',
    auth_user_id: 'auth-test-7', email_confirmed: false, coins: 100, plan_tier: 2,
    ...options.user };
  const state = { coins: user.coins, rescued: false };
  const record = (kind, details = {}) => calls.push({ kind, ...details });
  const db = {
    get(sql, params, cb) {
      record('get', { sql, params });
      if (sql.includes('user_access')) {
        return cb(options.accessError, options.missingUser ? null : {
          id: user.id, banned: Boolean(options.banned), version: 0
        });
      }
      if (sql.trim() === 'SELECT id FROM users WHERE LOWER(TRIM(email)) = ?') {
        return cb(null, options.duplicate ? user : null);
      }
      cb(null, options.missingUser ? null : { ...user, coins: state.coins });
    },
    all(sql, params, cb) { record('all', { sql, params }); cb(null, []); },
    run(sql, params, cb) {
      record('run', { sql, params });
      if (options.writeError) return cb(options.writeError);
      if (sql.startsWith('UPDATE animals')) state.rescued = true;
      if (sql.startsWith('UPDATE users SET coins = COALESCE')) state.coins += params[0];
      else if (sql.startsWith('UPDATE users SET coins = ?')) state.coins = params[0];
      cb(null);
    }
  };
  const auth = {
    async signInWithPassword(args) { record('login', args); return { error: options.loginError }; },
    async signUp(args) {
      record('signup', args);
      return { error: options.signupError, data: { user: { id: user.auth_user_id, identities: [{}] } } };
    },
    async resend(args) { record('resend', args); return { error: options.emailError }; },
    async resetPasswordForEmail(email, args) {
      record('recovery', { email, ...args }); return { error: options.emailError };
    },
    async getUser(token) {
      record('recoveryToken', { token });
      return { error: options.tokenError, data: { user: options.tokenError ? null : { id: user.auth_user_id } } };
    },
    admin: {
      async updateUserById(id, args) { record('updateAuth', { id, ...args }); return { error: options.updateError }; },
      async deleteUser(id) { record('deleteAuth', { id }); return {}; }
    }
  };
  const mocks = {
    express, multer, '../db': db,
    '../services/mobileSession': session,
    '../middleware/requireMobileUser': middleware,
    '../services/checkout': require('../../services/checkout'),
    '@supabase/supabase-js': {
      createClient: () => ({ auth, storage: { from(bucket) {
        assert.equal(bucket, 'animals');
        return {
          async upload(name, buffer, config) {
            record('upload', { name, size: buffer.length, config }); return { error: options.uploadError };
          },
          getPublicUrl: () => ({ data: { publicUrl: 'https://files.example.test/pet.png' } })
        };
      } } })
    },
    '../services/imageModeration': { async moderateImage(file) {
      record('moderate', { size: file?.size });
      if (options.moderationError) throw options.moderationError;
      return options.moderation || { allowed: true };
    } },
    mercadopago: {
      MercadoPagoConfig: class {},
      Preference: class { async get(args) {
        record('preferenceGet', args);
        if (options.paymentError) throw options.paymentError;
        return options.preference || { ...calls.find(c => c.kind === 'preference')?.body, date_created: '2026-09-21T00:00:00Z' };
      }
      async create(args) {
        record('preference', args);
        if (options.paymentError) throw options.paymentError;
        return { id: 'preference-test', sandbox_init_point: 'https://sandbox.example.test/checkout',
          init_point: 'https://live.example.test/checkout' };
      } },
      Payment: class { async search(args) {
        record('paymentSearch', args);
        if (options.paymentError) throw options.paymentError;
        return { results: options.payments || [] };
      }
      async get(args) {
        record('payment', args);
        if (options.paymentError) throw options.paymentError;
        return options.payment || { status: 'approved', external_reference: '7_2' };
      } }
    }
  };
  const filename = path.resolve(__dirname, `../../routes/${route}.js`);
  // Executa a rota real com dependências externas substituídas. Novos imports falham fechados.
  const isolatedRequire = (name) => {
    assert.ok(Object.hasOwn(mocks, name), `Import não simulado: ${name}`);
    return mocks[name];
  };
  const module = { exports: {} };
  const load = vm.runInThisContext(
    `(function(require, module, exports, process, console) {\n${fs.readFileSync(filename, 'utf8')}\n})`, { filename }
  );
  const fakeEnv = { SUPABASE_URL: 'https://supabase.example.test', SUPABASE_SECRET_KEY: 'test-only',
    MERCADO_PAGO_ACCESS_TOKEN: 'test-only', ...options.env };
  load(isolatedRequire, module, module.exports, { env: fakeEnv }, {
    log: (...args) => record('log', { args }),
    error: (...args) => record('logError', { args })
  });
  const app = express();
  app.use(express.json());
  app.use(`/${route}`, module.exports);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, state, token: session.issueMobileToken(user.id), async request(
    suffix = '', { method = 'POST', body = {}, token, form } = {}
  ) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${route}${suffix}`, {
      method,
      headers: { ...(form ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'GET' ? undefined : form || JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: response.headers.get('content-type')?.includes('json')
      ? await response.json() : await response.text() };
  } };
}

function animalForm(field = 'image') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Teste', species: 'Gato', latitude: '-15.6',
    longitude: '-56.1', userId: '99', rescuer_name: 'Teste', rescuer_contact: 'teste' })) form.append(key, value);
  // Bytes sintéticos: estes testes verificam multipart, não o classificador externo.
  form.append(field, new Blob(['test-image'], { type: 'image/png' }), 'test.png');
  return form;
}

module.exports = { routeFixture, animalForm };
