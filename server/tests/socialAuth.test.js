const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSocialHandlers } = require('../services/socialAuth');
const { verifyMobileToken } = require('../services/mobileSession');
const { createCpfHmac } = require('../services/eligibilityValidation');

process.env.MOBILE_JWT_SECRET = 'social-login-test-only-secret-more-than-32-bytes';
process.env.CPF_HMAC_SECRET = Buffer.alloc(32, 47).toString('base64');
const authId = 'eb9a90cb-ea0a-4b7b-a4d0-ea8f8056b172';
const otherAuthId = 'db9a90cb-ea0a-4b7b-a4d0-ea8f8056b172';
const credential = 'synthetic-supabase-access-token';
const cpf = '52998224725';
const otherCpf = '01234567890';
const googleUser = () => ({ id: authId, email: 'social@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ provider: 'google', user_id: authId }],
  user_metadata: { name: 'Pessoa Google', full_name: 'Pessoa Google' } });
const profile = () => ({ id: 7, name: 'Pessoa Google', email: 'social@example.test', coins: 100,
  is_premium: 0, plan_tier: 0, email_confirmed: true, auth_user_id: authId, password: null });
const eligibility = () => ({ user_id: 7, cpf_hmac: createCpfHmac(cpf), cpf_key_version: 'v1',
  status: 'DECLARED_ADULT', method: 'LOCAL_DECLARATION' });
const declaration = (overrides = {}) => ({ name: 'Pessoa Google', cpf, birthDate: '2000-01-01',
  acceptedDeclaration: true, ...overrides });

// Este double acompanha somente o SQL da ponte social. Não carrega .env nem chama serviços reais.
function fixture(options = {}) {
  const calls = [];
  const state = { users: options.newUser ? [] : [profile()], marker: Boolean(options.marker),
    eligibility: options.missingEligibility ? null : eligibility() };
  if (options.emailConflict) state.users = [{ ...profile(), id: 8,
    auth_user_id: options.legacyConflict ? null : otherAuthId }];
  let pending = Promise.resolve();
  const record = (kind, details = {}) => calls.push({ kind, ...details });
  function query(copy, sql, params) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    record('query', { sql: normalized, params });
    if (options.dbError) throw new Error('private-database-secret-error');
    if (normalized.includes('pg_advisory_xact_lock')) return [];
    if (/INSERT INTO petgo_private\.user_eligibility/i.test(normalized)) {
      if (options.eligibilityWriteError) throw new Error('private-eligibility-error');
      if (copy.eligibility) return [];
      copy.eligibility = { user_id: params[0], cpf_hmac: params[1], cpf_key_version: params[2],
        status: params[3], method: params[4], assessed_at: params[5], terms_version: params[6] };
      record('insertEligibility');
      return [{ ...copy.eligibility }];
    }
    if (/FROM petgo_private\.user_eligibility/i.test(normalized)) {
      return copy.eligibility ? [{ ...copy.eligibility }] : [];
    }
    if (/INSERT INTO petgo_private\.social_accounts/i.test(normalized)) {
      if (options.markerWriteError) throw new Error('private-marker-error');
      copy.marker = true; record('insertMarker'); return [];
    }
    if (/FROM petgo_private\.social_accounts/i.test(normalized)) {
      return copy.marker ? [{ user_id: copy.users.find(user => user.auth_user_id === authId)?.id, auth_user_id: authId }] : [];
    }
    if (normalized.includes('user_access')) {
      const user = copy.users.find(item => Number(item.id) === Number(params[0]));
      return user ? [{ id: user.id, banned: Boolean(options.banned), version: options.version ?? 0 }] : [];
    }
    if (/INSERT INTO (?:public\.)?users/i.test(normalized)) {
      if (options.profileWriteError) throw new Error('private-profile-error');
      const columns = normalized.match(/users\s*\(([^)]+)\)/i)?.[1].split(',').map(value => value.trim());
      const values = normalized.match(/VALUES\s*\(([^)]+)\)/i)?.[1].split(',').map(value => value.trim());
      const inserted = { ...profile(), id: 9, coins: 0 };
      columns?.forEach((column, index) => {
        const placeholder = values?.[index]?.match(/^\$(\d+)$/);
        if (placeholder) inserted[column] = params[Number(placeholder[1]) - 1];
        else if (/^NULL$/i.test(values?.[index] || '')) inserted[column] = null;
      });
      copy.users.push(inserted); record('insertProfile'); return [{ ...inserted }];
    }
    if (/FROM (?:public\.)?users/i.test(normalized)) {
      let user;
      if (/auth_user_id(?:::text)?\s*=\s*[?$]/i.test(normalized)) user = copy.users.find(item => item.auth_user_id === params[0]);
      else if (/LOWER\(TRIM\((?:u\.)?email\)\)/i.test(normalized) || /email\s*=\s*[?$]/i.test(normalized)) {
        user = copy.users.find(item => item.email.trim().toLowerCase() === params[0]);
        if (/id\s*<>/.test(normalized) && user?.id === params[1]) user = undefined;
      } else user = copy.users.find(item => Number(item.id) === Number(params[0]));
      if (!user) return [];
      if (/SELECT\s+(?:u\.)?\*/i.test(normalized)) return [{ ...user }];
      const result = { ...user, salvos: 0 };
      if (!/\bauth_user_id\b/.test(normalized.split(/FROM/i)[0])) delete result.auth_user_id;
      if (!/\bpassword\b/.test(normalized.split(/FROM/i)[0])) delete result.password;
      return [result];
    }
    throw new Error(`Consulta social não simulada: ${normalized}`);
  }
  const db = {
    get(sql, params, callback) {
      try { callback(null, query(state, sql, params)[0]); } catch (error) { callback(error); }
    },
    transaction(work) {
      const operation = pending.then(async () => {
        record('transaction');
        const copy = structuredClone(state);
        const result = await work({ async query(sql, params = []) { return { rows: query(copy, sql, params) }; } });
        Object.assign(state, copy); record('commit'); return result;
      });
      pending = operation.catch(() => { record('rollback'); });
      return operation;
    }
  };
  const supabase = { auth: { async getUser(token) {
    record('getUser', { token });
    if (options.providerThrows) throw new Error('secret-provider-internal');
    return { error: options.providerError || null,
      data: { user: options.providerError ? null : { ...googleUser(), ...options.googleUser } } };
  } } };
  const handlers = createSocialHandlers({ db, supabase, enabled: () => options.enabled !== false });
  async function request(action = 'login', body = {}, authorization = `Bearer ${credential}`) {
    const req = { body, headers: authorization ? { authorization } : {}, get(name) { return this.headers[name.toLowerCase()]; } };
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; return this; }, set() { return this; }, setHeader() {} };
    await handlers[action](req, res);
    return { status: res.statusCode, body: res.body };
  }
  return { state, calls, request };
}

function noToken(response) {
  assert.equal(response.body?.accessToken, undefined);
  assert.equal(response.body?.password, undefined);
  assert.equal(response.body?.cpf_hmac, undefined);
}

test('Google: piloto desativado não autentica nem consulta perfis', async () => {
  const f = fixture({ enabled: false });
  const response = await f.request();
  assert.equal(response.status, 503); noToken(response); assert.equal(f.calls.length, 0);
});

test('Google: credencial vem somente do Bearer e perfil livre do cliente é ignorado', async () => {
  const f = fixture({ version: 4 });
  const response = await f.request('login', { id: 99, userId: 99, auth_user_id: otherAuthId,
    email: 'injected@example.test', coins: 999999, token: 'not-used', accessToken: 'not-used' });
  assert.equal(response.status, 200);
  assert.equal(response.body.id, 7); assert.equal(response.body.email, 'social@example.test');
  assert.equal(response.body.coins, 100);
  const claims = verifyMobileToken(response.body.accessToken);
  assert.equal(claims.sub, '7'); assert.equal(claims.ver, 4);
  assert.equal(f.calls.find(item => item.kind === 'getUser').token, credential);
  assert.equal(response.body.password, undefined); assert.equal(response.body.auth_user_id, undefined);
});

test('Google: cabeçalho ausente ou inválido não aceita token no corpo', async () => {
  for (const authorization of [null, 'Basic token', 'Bearer', 'Bearer ', 'Bearer token extra']) {
    const f = fixture();
    const response = await f.request('login', { token: credential, accessToken: credential }, authorization);
    assert.equal(response.status, 401); noToken(response);
    assert.equal(f.calls.filter(item => item.kind === 'getUser').length, 0);
  }
});

test('Google: token expirado ou rejeitado pelo Supabase não consulta nem cria perfil', async () => {
  const f = fixture({ providerError: { status: 401, message: 'expired-private-token' } });
  const response = await f.request();
  assert.equal(response.status, 401); noToken(response);
  assert.equal(f.calls.filter(item => item.kind === 'query').length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /expired-private-token|synthetic-supabase-access-token/);
});

test('Google: rejeita UUID inválido, e-mail não confirmado e identidade sem Google', async () => {
  for (const googleUser of [{ id: 'invalid-uuid' }, { email_confirmed_at: null },
    { email: 'invalid..domain@example..test' },
    { identities: [{ provider: 'email' }], app_metadata: { provider: 'email', providers: ['email'] } }]) {
    const f = fixture({ googleUser });
    const response = await f.request();
    assert.ok([401, 403].includes(response.status), `status ${response.status}`); noToken(response);
    assert.equal(f.calls.filter(item => item.kind === 'transaction').length, 0);
  }
});

test('Google: banimento impede o mesmo JWT PetGo de ser emitido', async () => {
  const f = fixture({ banned: true });
  const response = await f.request();
  assert.equal(response.status, 403); noToken(response);
  assert.equal(response.body.code, 'ACCOUNT_BANNED');
});

test('Google: usuário banido não contorna a proteção pela complementação', async () => {
  const f = fixture({ banned: true, marker: true, missingEligibility: true });
  const response = await f.request('complete', declaration());
  assert.equal(response.status, 403); noToken(response);
  assert.equal(f.state.eligibility, null);
  assert.equal(f.calls.filter(item => item.kind === 'insertEligibility').length, 0);
});

test('Google: conta local antiga sem declaração mantém login normal por UUID', async () => {
  const f = fixture({ missingEligibility: true });
  const response = await f.request();
  assert.equal(response.status, 200);
  assert.equal(verifyMobileToken(response.body.accessToken).sub, '7');
  assert.equal(response.body.requiresOnboarding, undefined);
});

test('Google: identidade nova precisa complementar e cancelar/retomar não cria nem apaga conta', async () => {
  const f = fixture({ newUser: true, missingEligibility: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await f.request();
    assert.equal(response.status, 200); assert.equal(response.body.requiresOnboarding, true); noToken(response);
  }
  assert.equal(f.state.users.length, 0);
  assert.equal(f.calls.filter(item => item.kind.startsWith('insert')).length, 0);
  assert.equal(f.calls.some(item => item.kind === 'deleteAuth'), false);
});

test('Google: origem social conhecida sem elegibilidade exige complementação sem JWT', async () => {
  const f = fixture({ marker: true, missingEligibility: true });
  const response = await f.request();
  assert.equal(response.status, 200); assert.equal(response.body.requiresOnboarding, true); noToken(response);
});

test('Google: e-mail de conta legada/outra identidade nunca liga ou migra automaticamente', async () => {
  for (const legacyConflict of [false, true]) {
    const f = fixture({ emailConflict: true, legacyConflict, missingEligibility: true });
    const login = await f.request();
    assert.equal(login.status, 409); noToken(login);
    const complete = await f.request('complete', declaration());
    assert.equal(complete.status, 409); noToken(complete);
    assert.equal(f.state.users.length, 1);
    assert.equal(f.state.users[0].auth_user_id, legacyConflict ? null : otherAuthId);
    assert.equal(f.calls.filter(item => item.kind === 'insertProfile').length, 0);
  }
});

test('Google: CPF/nascimento/aceite inválidos não criam usuário ou JWT', async () => {
  for (const input of [declaration({ cpf: '00000000000' }), declaration({ birthDate: '2026-02-30' }),
    declaration({ birthDate: '2020-01-01' }), declaration({ acceptedDeclaration: false })]) {
    const f = fixture({ newUser: true, missingEligibility: true });
    const response = await f.request('complete', input);
    assert.equal(response.status, 400); noToken(response);
    assert.equal(f.state.users.length, 0);
    assert.equal(f.calls.filter(item => item.kind === 'transaction').length, 0);
  }
});

test('Google: complementação persiste declaração privada e origem na mesma transação', async () => {
  const f = fixture({ newUser: true, missingEligibility: true });
  const response = await f.request('complete', declaration());
  assert.ok([200, 201].includes(response.status));
  assert.equal(verifyMobileToken(response.body.accessToken).sub, '9');
  assert.equal(f.state.users.length, 1); assert.equal(f.state.users[0].auth_user_id, authId);
  assert.equal(f.state.users[0].password, null); assert.equal(f.state.users[0].coins, 0);
  assert.equal(f.state.marker, true); assert.equal(f.state.eligibility.cpf_hmac, createCpfHmac(cpf));
  assert.equal(f.calls.filter(item => item.kind === 'commit').length, 1);
  assert.doesNotMatch(JSON.stringify(response.body), /52998224725|2000-01-01|cpf_hmac|cpf_key_version/);
  const subsequent = await f.request();
  assert.equal(subsequent.status, 200); assert.equal(verifyMobileToken(subsequent.body.accessToken).sub, '9');
});

test('Google: complementações simultâneas são idempotentes e criam um único perfil', async () => {
  const f = fixture({ newUser: true, missingEligibility: true });
  const responses = await Promise.all([f.request('complete', declaration()), f.request('complete', declaration())]);
  for (const response of responses) {
    assert.ok([200, 201].includes(response.status));
    assert.equal(verifyMobileToken(response.body.accessToken).sub, '9');
  }
  assert.equal(f.state.users.length, 1);
  assert.equal(f.calls.filter(item => item.kind === 'insertProfile').length, 1);
  assert.equal(f.calls.filter(item => item.kind === 'insertEligibility').length, 1);
  assert.ok(f.calls.some(item => item.sql?.includes('pg_advisory_xact_lock')));
});

test('Google: repetir complementação não pode substituir CPF declarado', async () => {
  const f = fixture({ marker: true });
  const response = await f.request('complete', declaration({ cpf: otherCpf }));
  assert.equal(response.status, 400); noToken(response);
  assert.equal(f.state.eligibility.cpf_hmac, createCpfHmac(cpf));
});

test('Google: falha entre perfil/declaração/origem faz rollback sem cadastro parcial', async () => {
  for (const failure of ['profileWriteError', 'eligibilityWriteError', 'markerWriteError']) {
    const f = fixture({ newUser: true, missingEligibility: true, [failure]: true });
    const response = await f.request('complete', declaration());
    assert.equal(response.status, 503); noToken(response);
    assert.equal(f.state.users.length, 0); assert.equal(f.state.eligibility, null); assert.equal(f.state.marker, false);
    assert.doesNotMatch(JSON.stringify(response.body), /private-|52998224725|2000-01-01|synthetic-supabase/);
  }
});

test('Google: indisponibilidade de serviço ou banco falha fechada sem vazar dados técnicos', async () => {
  for (const options of [{ providerThrows: true }, { dbError: true }]) {
    const f = fixture(options);
    const response = await f.request();
    assert.equal(response.status, 503); noToken(response);
    assert.doesNotMatch(JSON.stringify(response.body), /secret-provider|private-database|synthetic-supabase/);
  }
});

test('Google: rotas da ponte não exigem JWT PetGo e ações de negócio continuam protegidas', async t => {
  const { routeFixture } = require('./helpers/routeFixture');
  const f = await routeFixture(t);
  for (const suffix of ['/social-login', '/social-complete']) {
    const response = await f.request(suffix);
    assert.equal(response.status, 503); noToken(response);
  }
  const business = await f.request('/upgrade-pro', { body: { userId: 7 } });
  assert.equal(business.status, 401);
  const supabaseOnly = await f.request('/upgrade-pro', { body: { userId: 7 }, token: credential });
  assert.equal(supabaseOnly.status, 401);
});
