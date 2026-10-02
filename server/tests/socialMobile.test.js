const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.resolve(__dirname, '../../app', file), 'utf8');
const service = source('services/socialAuth.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const api = 'https://petgo.example.test';
const supabase = 'https://project.supabase.co';
const callback = 'petgo://auth/social-callback';
const profile = { id: 10, name: 'Pessoa teste', email: 'pessoa@example.test', coins: 0, accessToken: 'petgo-jwt' };
const session = { access_token: 'supabase-credential', refresh_token: 'never-store-me', expires_in: 3600 };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const requests = [];
  const browsers = [];
  const authConfigs = [];
  const responses = [...(options.responses || [session, profile])];
  let now = Date.now();
  let dismissed = 0;
  const context = {
    AbortController, setTimeout, clearTimeout, API_BASE_URL: api,
    Date: { now: () => now },
    process: { env: {
      EXPO_PUBLIC_GOOGLE_LOGIN_ENABLED: 'true', EXPO_PUBLIC_SUPABASE_URL: supabase,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', ...options.env
    } },
    Platform: { OS: options.os || 'android' }, Constants: options.constants || { executionEnvironment: 'standalone' },
    AuthSession: {
      ResponseType: { Code: 'code' }, CodeChallengeMethod: { S256: 'S256' },
      makeRedirectUri: ({ native }) => native,
      AuthRequest: class {
        constructor(config) { authConfigs.push(config); }
        async getAuthRequestConfigAsync() {
          this.codeVerifier = options.verifier || 'v'.repeat(64);
          return { codeChallenge: options.challenge || 'c'.repeat(43) };
        }
      }
    },
    WebBrowser: {
      async openAuthSessionAsync(url, redirect) {
        browsers.push({ url, redirect });
        return options.browser ? options.browser() : { type: 'success', url: `${callback}?code=authorization-code` };
      },
      dismissAuthSession() { dismissed++; }
    },
    async fetch(url, init) {
      requests.push({ url, init });
      if (options.fetch) return options.fetch(url, init, requests.length);
      const next = responses.shift();
      return { ok: !next?.status || next.status < 400, status: next?.status || 200, json: async () => next?.body || next };
    }
  };
  const exported = vm.runInNewContext(`${service}; ({ beginGoogleLogin, completeSocialRegistration, hasPendingSocialRegistration,
    cancelSocialLogin, captureSocialLoginGuard, socialCodeFromCallback, GOOGLE_SOCIAL_ENABLED });`, context);
  return { ...exported, requests, browsers, authConfigs, advance: ms => { now += ms; }, dismissed: () => dismissed };
}

test('Google mobile: PKCE S256 nativo e troca código/verifier, sem refresh token no retorno', async () => {
  const f = fixture();
  const result = await f.beginGoogleLogin();
  assert.equal(f.authConfigs[0].usePKCE, true);
  assert.equal(f.authConfigs[0].codeChallengeMethod, 'S256');
  const authorize = new URL(f.browsers[0].url);
  assert.equal(authorize.origin, supabase);
  assert.equal(authorize.pathname, '/auth/v1/authorize');
  assert.equal(authorize.searchParams.get('provider'), 'google');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 's256');
  assert.equal(authorize.searchParams.get('redirect_to'), callback);
  assert.equal(f.browsers[0].redirect, callback);
  assert.equal(f.requests[0].url, `${supabase}/auth/v1/token?grant_type=pkce`);
  assert.deepEqual(JSON.parse(f.requests[0].init.body), { auth_code: 'authorization-code', code_verifier: 'v'.repeat(64) });
  assert.equal(f.requests[0].init.headers.apikey, 'sb_publishable_test');
  assert.equal(f.requests[1].url, `${api}/auth/social-login`);
  assert.equal(f.requests[1].init.headers.Authorization, 'Bearer supabase-credential');
  assert.equal(result.accessToken, 'petgo-jwt');
  assert.equal(result.refresh_token, undefined);
  assert.equal(f.hasPendingSocialRegistration(), false);
});

test('Google mobile: desativado por padrão; Expo Go não abre OAuth nem altera login tradicional', async () => {
  const disabled = fixture({ env: { EXPO_PUBLIC_GOOGLE_LOGIN_ENABLED: undefined } });
  assert.equal(disabled.GOOGLE_SOCIAL_ENABLED, false);
  await assert.rejects(disabled.beginGoogleLogin(), { code: 'SOCIAL_DISABLED' });
  for (const constants of [{ executionEnvironment: 'storeClient' }, { appOwnership: 'expo' }]) {
    const f = fixture({ constants });
    await assert.rejects(f.beginGoogleLogin(), { code: 'SOCIAL_NATIVE_BUILD_REQUIRED' });
    assert.equal(f.requests.length, 0);
    assert.equal(f.browsers.length, 0);
  }
});

test('Google mobile: recusa HTTP e Secret/service_role em configurações públicas', async () => {
  for (const env of [
    { EXPO_PUBLIC_SUPABASE_URL: 'http://project.supabase.co' },
    { EXPO_PUBLIC_SUPABASE_URL: 'https://evil.test@project.supabase.co' },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'service_role-jwt' }
  ]) {
    const f = fixture({ env });
    await assert.rejects(f.beginGoogleLogin(), { code: 'SOCIAL_CONFIGURATION' });
    assert.equal(f.requests.length, 0);
  }
});

test('Google mobile: só aceita código no callback social exato, nunca credencial implícita', () => {
  const f = fixture();
  assert.equal(f.socialCodeFromCallback(`${callback}?code=abc`), 'abc');
  for (const url of [
    'petgo://auth/reset-password?code=abc', 'petgo://auth/callback?code=abc',
    'petgo://auth/social-callback/extra?code=abc', 'https://auth/social-callback?code=abc',
    `${callback}?code=abc&code=other`, `${callback}#access_token=secret`,
    `${callback}?code=abc&access_token=secret`, `${callback}?refresh_token=secret`, callback
  ]) assert.throws(() => f.socialCodeFromCallback(url), { code: 'SOCIAL_CALLBACK_INVALID' });
  assert.throws(() => f.socialCodeFromCallback(`${callback}?error=access_denied&error_description=secret`), { code: 'SOCIAL_PROVIDER_ERROR' });
});

test('Google mobile: falha fechada se geração PKCE não fornecer challenge e verifier seguros', async () => {
  for (const options of [{ verifier: 'weak' }, { challenge: 'plain-verifier' }]) {
    const f = fixture(options);
    await assert.rejects(f.beginGoogleLogin(), { code: 'SOCIAL_PKCE_INVALID' });
    assert.equal(f.browsers.length, 0);
    assert.equal(f.requests.length, 0);
  }
});

test('Google mobile: conta nova mantém somente credencial pendente; conclusão envia declaração antes do JWT', async () => {
  const f = fixture({ responses: [session, { requiresOnboarding: true }, { ...profile, cpf: 'never-return', cpf_hash: 'never-return' }] });
  const pending = await f.beginGoogleLogin();
  assert.equal(pending.requiresOnboarding, true);
  assert.equal(pending.accessToken, undefined);
  assert.equal(f.hasPendingSocialRegistration(), true);
  const result = await f.completeSocialRegistration({ cpf: '52998224725', birthDate: '1990-01-01', acceptedDeclaration: true });
  assert.equal(f.requests[2].url, `${api}/auth/social-complete`);
  assert.equal(f.requests[2].init.headers.Authorization, 'Bearer supabase-credential');
  assert.deepEqual(JSON.parse(f.requests[2].init.body), { cpf: '52998224725', birthDate: '1990-01-01', acceptedDeclaration: true });
  assert.equal(result.accessToken, 'petgo-jwt');
  assert.equal(result.cpf, undefined);
  assert.equal(result.cpf_hash, undefined);
  assert.equal(f.hasPendingSocialRegistration(), false);
});

test('Google mobile: cancelar formulário remove apenas memória local; próximo Google retoma sem deleteUser', async () => {
  const f = fixture({ responses: [session, { requiresOnboarding: true }, session, { requiresOnboarding: true }] });
  await f.beginGoogleLogin();
  f.cancelSocialLogin();
  assert.equal(f.hasPendingSocialRegistration(), false);
  await assert.rejects(f.completeSocialRegistration({}), { code: 'SOCIAL_PENDING_EXPIRED' });
  await f.beginGoogleLogin();
  assert.equal(f.hasPendingSocialRegistration(), true);
  assert.ok(f.requests.every(request => request.init.method === 'POST'));
  assert.ok(f.requests.every(request => !/delete|logout|signout/.test(request.url)));
});

test('Google mobile: erro de CPF conserva pendência para correção; token expirado a remove', async () => {
  const f = fixture({ responses: [session, { requiresOnboarding: true },
    { status: 400, body: { code: 'CPF_INVALID', error: 'CPF inválido.' } },
    { status: 401, body: { code: 'SOCIAL_CREDENTIAL_INVALID', error: 'Entre novamente.' } }] });
  await f.beginGoogleLogin();
  await assert.rejects(f.completeSocialRegistration({}), { code: 'CPF_INVALID' });
  assert.equal(f.hasPendingSocialRegistration(), true);
  await assert.rejects(f.completeSocialRegistration({}), { code: 'SOCIAL_CREDENTIAL_INVALID' });
  assert.equal(f.hasPendingSocialRegistration(), false);
});

test('Google mobile: credencial pendente expira localmente sem refresh ou sessão PetGo', async () => {
  const f = fixture({ responses: [session, { requiresOnboarding: true }] });
  await f.beginGoogleLogin();
  f.advance(10 * 60 * 1000 + 1);
  assert.equal(f.hasPendingSocialRegistration(), false);
  await assert.rejects(f.completeSocialRegistration({}), { code: 'SOCIAL_PENDING_EXPIRED' });
  assert.equal(f.requests.length, 2);
});

test('Google mobile: cancelar navegador não realiza troca de código nem gera sessão', async () => {
  const f = fixture({ browser: async () => ({ type: 'cancel' }) });
  assert.equal((await f.beginGoogleLogin()).cancelled, true);
  assert.equal(f.requests.length, 0);
});

test('Google mobile: lock impede duas aberturas; callback tardio após cancelamento é descartado', async () => {
  const browser = deferred();
  const started = deferred();
  const f = fixture({ browser: () => { started.resolve(); return browser.promise; } });
  const first = f.beginGoogleLogin();
  await started.promise;
  await assert.rejects(f.beginGoogleLogin(), { code: 'SOCIAL_BUSY' });
  f.cancelSocialLogin();
  browser.resolve({ type: 'success', url: `${callback}?code=late-code` });
  await assert.rejects(first, { code: 'SOCIAL_CANCELLED' });
  assert.equal(f.requests.length, 0);
  assert.equal(f.dismissed(), 1);
});

test('Google mobile: resposta tardia da conclusão após logout/cancelamento não entrega JWT', async () => {
  const completion = deferred();
  const started = deferred();
  const f = fixture({ fetch: async (url, init, count) => {
    if (count === 3) { started.resolve(); return completion.promise; }
    const body = count === 1 ? session : { requiresOnboarding: true };
    return { ok: true, status: 200, json: async () => body };
  } });
  await f.beginGoogleLogin();
  const finish = f.completeSocialRegistration({ cpf: '52998224725', birthDate: '1990-01-01', acceptedDeclaration: true });
  await started.promise;
  f.cancelSocialLogin();
  completion.resolve({ ok: true, status: 200, json: async () => profile });
  await assert.rejects(finish, { code: 'SOCIAL_CANCELLED' });
  assert.equal(f.hasPendingSocialRegistration(), false);
});

test('Google mobile: conta banida ou conflito local não vira sessão nem pendência', async () => {
  for (const code of ['ACCOUNT_BANNED', 'SOCIAL_ACCOUNT_CONFLICT']) {
    const f = fixture({ responses: [session, { status: 409, body: { code, error: 'Conta indisponível.' } }] });
    await assert.rejects(f.beginGoogleLogin(), { code });
    assert.equal(f.hasPendingSocialRegistration(), false);
  }
});

test('Google mobile: contexto só instala sessão normal após ponte/conclusão; nunca na pendência', async () => {
  const context = source('context/AuthContext.js');
  const functions = context.slice(context.indexOf('  function acceptSocialSession'), context.indexOf('  async function register'));
  const changes = [];
  let response = { requiresOnboarding: true };
  const exported = vm.runInNewContext(`${functions}; ({ loginWithGoogle, completeGoogleRegistration });`, {
    beginGoogleLogin: async () => response,
    completeSocialRegistration: async () => profile,
    captureSocialLoginGuard: () => () => {},
    profileVersion: { current: 0 },
    setMobileSession: token => changes.push(['session', token]),
    setUser: user => changes.push(['profile', user]),
    fetchAnimals: () => changes.push(['animals'])
  });
  await exported.loginWithGoogle();
  assert.equal(changes.length, 0);
  response = { cancelled: true };
  await exported.loginWithGoogle();
  assert.equal(changes.length, 0);
  await exported.completeGoogleRegistration({});
  assert.equal(changes[0][1], 'petgo-jwt');
  assert.equal(changes[1][1].accessToken, undefined);
  assert.equal(changes[1][1].id, 10);
  assert.equal(changes[2][0], 'animals');
  assert.match(context, /async function login\(email, password\)\s*\{\s*cancelSocialLogin\(\)/);
  assert.match(context, /logout: \(\) => \{ cancelSocialLogin\(\)/);
});

test('Google mobile: guarda de contexto rejeita cancelamento entre conclusão e instalação do JWT', async () => {
  const f = fixture();
  const guard = f.captureSocialLoginGuard();
  f.cancelSocialLogin();
  assert.throws(guard, { code: 'SOCIAL_CANCELLED' });
  const context = source('context/AuthContext.js');
  const functions = context.slice(context.indexOf('  function acceptSocialSession'), context.indexOf('  async function register'));
  let installed = false;
  const exported = vm.runInNewContext(`${functions}; ({ loginWithGoogle, completeGoogleRegistration });`, {
    beginGoogleLogin: async () => profile,
    completeSocialRegistration: async () => profile,
    captureSocialLoginGuard: () => () => { throw Object.assign(new Error('Cancelado'), { code: 'SOCIAL_CANCELLED' }); },
    profileVersion: { current: 0 }, setMobileSession: () => { installed = true; }, setUser() {}, fetchAnimals() {}
  });
  await assert.rejects(exported.loginWithGoogle(), { code: 'SOCIAL_CANCELLED' });
  await assert.rejects(exported.completeGoogleRegistration({}), { code: 'SOCIAL_CANCELLED' });
  assert.equal(installed, false);
});

test('Google mobile: callbacks legados permanecem separados e onboarding reutiliza formulário seguro', () => {
  const app = source('App.js');
  assert.match(app, /name="SocialOnboarding" component=\{SocialOnboardingScreen\}/);
  assert.match(app, /url\.startsWith\('petgo:\/\/auth\/reset-password'\)/);
  assert.match(app, /url\.startsWith\('petgo:\/\/auth\/callback'\)/);
  const screen = source('screens/SocialOnboardingScreen.js');
  assert.match(screen, /<EligibilityFields/);
  assert.match(screen, /birthDateToIso\(birthDate\)/);
  assert.match(screen, /beforeRemove.*cancelSocialLogin/);
  assert.doesNotMatch(screen, /route\.params|access_token|accessToken/);
  assert.doesNotMatch(source('services/socialAuth.js'), /FileSystem|AsyncStorage|localStorage|console\./);
  assert.doesNotMatch(source('services/socialAuth.js'), /new URL\(/, 'callback não depende do parser nativo de custom schemes');
  assert.match(source('screens/LoginScreen.js'), /GOOGLE_SOCIAL_ENABLED && <TouchableOpacity/);
});
