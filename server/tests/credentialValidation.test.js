const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, isValidEmail } = require('../services/credentialValidation');
const { routeFixture } = require('./helpers/routeFixture');

test('validador de e-mail normaliza e rejeita formatos malformados', () => {
  assert.equal(normalizeEmail(' TEST+tag@Example.COM '), 'test+tag@example.com');
  for (const value of ['test@example.test', 'test+tag@sub.example.com', 'a@xn--exemplo-9za.com']) assert.equal(isValidEmail(value), true, value);
  for (const value of ['a@b', 'a@@b.com', 'a@b..com', 'a..b@c.com', '.a@b.com', 'a@-b.com', 'a@b-.com', 'a@b.c', 'a b@c.com', 'a@b.123', null, {}, 'a'.repeat(65) + '@b.com']) assert.equal(isValidEmail(value), false, String(value));
  assert.equal(normalizeEmail({}), '');
});

for (const [path, method] of [['/register', 'POST'], ['/login', 'POST'], ['/update', 'PUT'], ['/resend-confirmation', 'POST'], ['/request-password-reset', 'POST']]) {
  test(`${path}: formato inválido é rejeitado antes de consultas de negócio e Supabase`, async (t) => {
    const f = await routeFixture(t, 'auth');
    const response = await f.request(path, { method, token: f.token, body: { id: 7, name: 'Teste', email: 'a@b..com', password: 'secret123' } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Formato de e-mail inválido.');
    assert.equal(f.calls.some(call => ['signup', 'login', 'updateAuth', 'resend', 'recovery', 'run'].includes(call.kind)), false);
  });
}

test('edição rejeita duplicidade normalizada antes de atualizar Supabase ou banco', async (t) => {
  const f = await routeFixture(t, 'auth', { duplicate: true });
  const response = await f.request('/update', { method: 'PUT', token: f.token, body: { id: 7, name: 'Teste', email: ' OTHER@example.test ' } });
  assert.equal(response.status, 400);
  assert.deepEqual(f.calls.find(call => call.sql?.includes('AND id <> ?')).params, ['other@example.test', 7]);
  assert.equal(f.calls.some(call => ['updateAuth', 'run'].includes(call.kind)), false);
});

test('edição apenas de nome não trata o próprio e-mail como duplicado', async (t) => {
  const f = await routeFixture(t, 'auth', { duplicate: true });
  const response = await f.request('/update', { method: 'PUT', token: f.token, body: { id: 7, name: 'Novo nome', email: ' TEST@example.test ' } });
  assert.equal(response.status, 200);
  assert.equal(f.calls.some(call => call.kind === 'updateAuth'), false);
});

for (const legacy of [false, true]) {
  test(`senha (${legacy ? 'legada' : 'Supabase'}): senha atual incorreta tem precedência sobre nova curta`, async (t) => {
    const f = await routeFixture(t, 'auth', { user: legacy ? { auth_user_id: null } : {}, loginError: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const response = await f.request('/change-password', { method: 'PUT', token: f.token, body: { id: 7, currentPassword: 'wrong', newPassword: '123' } });
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'A senha atual está incorreta.');
    assert.equal(f.calls.some(call => ['run', 'updateAuth'].includes(call.kind)), false);
  });
  test(`senha (${legacy ? 'legada' : 'Supabase'}): senha atual válida revela erro de nova senha`, async (t) => {
    const f = await routeFixture(t, 'auth', { user: legacy ? { auth_user_id: null } : {} });
    const response = await f.request('/change-password', { method: 'PUT', token: f.token, body: { id: 7, currentPassword: 'secret123', newPassword: '' } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'A nova senha deve ter no mínimo 6 carateres.');
    assert.equal(f.calls.some(call => ['run', 'updateAuth'].includes(call.kind)), false);
  });
}

test('indisponibilidade do Supabase não é confundida com senha incorreta', async (t) => {
  const f = await routeFixture(t, 'auth', { loginError: { status: 503, message: 'Service unavailable' } });
  const response = await f.request('/change-password', { method: 'PUT', token: f.token, body: { id: 7, currentPassword: 'secret123', newPassword: '123' } });
  assert.equal(response.status, 503);
  assert.equal(f.calls.some(call => ['run', 'updateAuth'].includes(call.kind)), false);
});

test('troca de e-mail solicita confirmação sem gravar o endereço novo ou usar admin.updateUserById', async (t) => {
  const f = await routeFixture(t, 'auth');
  const response = await f.request('/update', { method: 'PUT', token: f.token,
    body: { id: 7, name: 'Novo nome', email: 'novo@example.test', currentPassword: 'secret123' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.email, 'test@example.test');
  assert.equal(response.body.emailChangePending, true);
  assert.deepEqual(f.calls.find(call => call.kind === 'requestEmailChange'), {
    kind: 'requestEmailChange', email: 'novo@example.test', emailRedirectTo: 'petgo://auth/callback'
  });
  assert.equal(f.calls.some(call => call.kind === 'updateAuth'), false);
  assert.deepEqual(f.calls.find(call => call.kind === 'run').params, ['Novo nome', 7]);
});

for (const options of [{}, { confirmationDisabled: true }, { loginError: { code: 'invalid_credentials' } }, { emailError: { message: 'SMTP unavailable' } }, { loginUserId: 'other-user' }, { user: { auth_user_id: null } }]) {
  test(`troca de e-mail falha sem alterações locais: ${JSON.stringify(options)}`, async (t) => {
    const f = await routeFixture(t, 'auth', options);
    const body = { id: 7, name: 'Novo nome', email: 'novo@example.test',
      ...(Object.keys(options).length ? { currentPassword: 'secret123' } : {}) };
    const response = await f.request('/update', { method: 'PUT', token: f.token, body });
    assert.ok(response.status >= 400);
    assert.equal(f.calls.some(call => ['run', 'updateAuth'].includes(call.kind)), false);
  });
}
