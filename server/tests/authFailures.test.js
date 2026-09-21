const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');

for (const message of ['Invalid login credentials', 'Email not confirmed']) {
  test(`login não emite token nem escreve quando Supabase nega: ${message}`, async (t) => {
    const f = await routeFixture(t, 'auth', { loginError: { message } });
    const r = await f.request('/login', { body: { email: ' TEST@example.test ', password: 'bad' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.accessToken, undefined);
    assert.equal(f.calls.find(c => c.kind === 'login').email, 'test@example.test');
    assert.equal(f.calls.filter(c => c.kind === 'run').length, 0);
  });
}

test('SMTP indisponível no cadastro não cria perfil e devolve erro identificável', async (t) => {
  const f = await routeFixture(t, 'auth', { signupError: { message: 'Error sending confirmation email' } });
  const r = await f.request('/register', { body: { name: 'Teste', email: 'test@example.test', password: 'secret123' } });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'CONFIRMATION_EMAIL_FAILED');
  assert.equal(f.calls.filter(c => c.kind === 'run').length, 0);
});

test('falha ao salvar cadastro desfaz apenas a identidade recém-criada', async (t) => {
  const f = await routeFixture(t, 'auth', { writeError: new Error('database unavailable') });
  const r = await f.request('/register', { body: { name: 'Teste', email: 'test@example.test', password: 'secret123' } });
  assert.equal(r.status, 500);
  assert.deepEqual(f.calls.filter(c => c.kind === 'deleteAuth'), [{ kind: 'deleteAuth', id: 'auth-test-7' }]);
});

test('cadastro duplicado não chama signUp', async (t) => {
  const f = await routeFixture(t, 'auth', { duplicate: true });
  const r = await f.request('/register', { body: { name: 'Teste', email: 'test@example.test', password: 'secret123' } });
  assert.equal(r.status, 400);
  assert.equal(f.calls.some(c => c.kind === 'signup'), false);
});

for (const route of ['/resend-confirmation', '/request-password-reset']) {
  test(`${route}: falha de envio não responde sucesso e mantém contrato público`, async (t) => {
    const f = await routeFixture(t, 'auth', { emailError: { message: 'SMTP secret diagnostic' } });
    const r = await f.request(route, { body: { email: ' TEST@example.test ' } });
    assert.equal(r.status, 400);
    assert.doesNotMatch(r.body.error, /secret diagnostic/);
    assert.equal(f.calls.find(c => ['resend', 'recovery'].includes(c.kind)).email, 'test@example.test');
  });
}

test('recuperação de conta sem vínculo não cria ou migra identidade', async (t) => {
  const f = await routeFixture(t, 'auth', { user: { auth_user_id: null } });
  const r = await f.request('/request-password-reset', { body: { email: 'test@example.test' } });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'E-mail não encontrado.');
  assert.ok(f.calls.every(c => c.kind === 'get'));
});

test('token de recuperação expirado não altera senha', async (t) => {
  const f = await routeFixture(t, 'auth', { tokenError: { message: 'expired' } });
  const r = await f.request('/reset-password', { body: { token: 'expired', newPassword: 'new-secret123' } });
  assert.equal(r.status, 401);
  assert.equal(f.calls.some(c => ['run', 'updateAuth'].includes(c.kind)), false);
});

test('falha do Supabase ao redefinir senha não altera perfil local', async (t) => {
  const f = await routeFixture(t, 'auth', { updateError: { message: 'unavailable' } });
  const r = await f.request('/reset-password', { body: { token: 'recovery-token', newPassword: 'new-secret123' } });
  assert.equal(r.status, 500);
  assert.equal(f.calls.some(c => c.kind === 'run'), false);
});

test('recuperação bem-sucedida não remove banimento nem fornece JWT mobile', async (t) => {
  const f = await routeFixture(t, 'auth', { banned: true });
  const r = await f.request('/reset-password', { body: { token: 'recovery-token', newPassword: 'new-secret123' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.accessToken, undefined);
  assert.ok(f.calls.filter(c => c.kind === 'run').every(c => !c.sql.includes('user_access')));
  const login = await f.request('/login', { body: { email: 'test@example.test', password: 'new-secret123' } });
  assert.equal(login.status, 403);
  assert.equal(login.body.code, 'ACCOUNT_BANNED');
});

test('rotas reais bloqueiam leitura e exclusão de outra conta', async (t) => {
  const f = await routeFixture(t);
  for (const [suffix, method] of [['/update-status/99', 'GET'], ['/delete/99', 'DELETE']]) {
    assert.equal((await f.request(suffix, { method, token: f.token })).status, 403);
  }
  assert.ok(f.calls.every(c => c.kind === 'get' && c.sql.includes('user_access')));
});
