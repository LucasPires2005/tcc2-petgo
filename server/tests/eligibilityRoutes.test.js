const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture } = require('./helpers/routeFixture');
const { createCpfHmac } = require('../services/eligibilityValidation');

const declaration = { cpf: '52998224725', birthDate: '2000-01-01', acceptedDeclaration: true };
const registration = { name: 'Teste', email: 'test@example.test', password: 'secret123', ...declaration };
const minorBirthDate = `${new Date().getUTCFullYear() - 17}-01-01`;

function noPrivateData(value) {
  assert.doesNotMatch(JSON.stringify(value), /52998224725|2000-01-01|cpf_hmac|cpfHmac|birthDate|cpf_key_version/);
}

test('cadastro: CPF, calendário, menoridade e aceite são validados antes do Supabase Auth', async t => {
  for (const [change, code] of [
    [{ cpf: undefined }, 'CPF_INVALID'], [{ cpf: '00000000000' }, 'CPF_INVALID'],
    [{ birthDate: '2000-02-30' }, 'BIRTH_DATE_INVALID'], [{ birthDate: '2999-01-01' }, 'BIRTH_DATE_INVALID'],
    [{ birthDate: minorBirthDate }, 'UNDERAGE'], [{ acceptedDeclaration: false }, 'DECLARATION_REQUIRED'],
    [{ acceptedDeclaration: 'true' }, 'DECLARATION_REQUIRED']
  ]) {
    const f = await routeFixture(t);
    const result = await f.request('/register', { body: { ...registration, ...change } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, code);
    assert.equal(f.calls.some(call => ['signup', 'run', 'tx', 'deleteAuth'].includes(call.kind)), false);
    noPrivateData(result.body);
  }
});

test('cadastro: sem chave ou migração privada, não cria identidade externa', async t => {
  const f = await routeFixture(t);
  const previous = process.env.CPF_HMAC_SECRET;
  delete process.env.CPF_HMAC_SECRET;
  try {
    const result = await f.request('/register', { body: registration });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'ELIGIBILITY_UNAVAILABLE');
    assert.equal(f.calls.some(call => call.kind === 'signup'), false);
  } finally { process.env.CPF_HMAC_SECRET = previous; }
  const broken = await routeFixture(t, 'auth', { eligibilityError: Object.assign(new Error('private secret'), { code: '42P01' }) });
  assert.equal((await broken.request('/register', { body: registration })).status, 503);
  assert.equal(broken.calls.some(call => call.kind === 'signup'), false);
});

test('cadastro: perfil e declaração são gravados juntos; metadata e resposta não levam CPF/nascimento', async t => {
  const f = await routeFixture(t, 'auth', { missingEligibility: true });
  const result = await f.request('/register', { body: { ...registration, cpf: '529.982.247-25' } });
  assert.equal(result.status, 201);
  assert.equal(result.body.requiresEmailConfirmation, true);
  assert.equal(f.state.eligibility.user_id, 7);
  assert.equal(f.state.eligibility.cpf_hmac, createCpfHmac(declaration.cpf));
  assert.equal(f.state.eligibility.status, 'DECLARED_ADULT');
  const queries = f.calls.filter(call => call.kind === 'tx');
  assert.match(queries[0].sql, /INSERT INTO public.users/);
  assert.match(queries[1].sql, /INSERT INTO petgo_private.user_eligibility/);
  assert.equal(queries.some(call => call.params.includes(declaration.cpf) || call.params.includes(declaration.birthDate)), false);
  noPrivateData(f.calls.find(call => call.kind === 'signup'));
  noPrivateData(result.body);
});

test('cadastro: falha privada desfaz transação e remove somente a identidade recém-criada', async t => {
  for (const option of ['profileInsertError', 'eligibilityWriteError']) {
    const f = await routeFixture(t, 'auth', { missingEligibility: true, [option]: new Error('secret 52998224725') });
    const result = await f.request('/register', { body: registration });
    assert.equal(result.status, 500);
    assert.equal(f.state.eligibility, null);
    assert.deepEqual(f.calls.filter(call => call.kind === 'deleteAuth'), [{ kind: 'deleteAuth', id: 'auth-test-7' }]);
    noPrivateData(result.body);
    noPrivateData(f.calls.filter(call => call.kind === 'logError'));
  }
});

test('cadastro: falha da compensação não anuncia sucesso nem expõe o diagnóstico', async t => {
  const f = await routeFixture(t, 'auth', { missingEligibility: true,
    eligibilityWriteError: new Error('secret CPF'), deleteAuthError: new Error('secret SDK') });
  const result = await f.request('/register', { body: registration });
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'REGISTRATION_ROLLBACK_FAILED');
  assert.equal(f.state.eligibility, null);
  assert.doesNotMatch(JSON.stringify(result.body), /secret/);
});

test('cadastro: compensação conserva identidade já vinculada ou cuja propriedade não pode conferir', async t => {
  for (const options of [{ compensationLinkedUser: true }, { compensationLookupError: new Error('lookup secreto') }]) {
    const f = await routeFixture(t, 'auth', { missingEligibility: true,
      eligibilityWriteError: new Error('falha local'), ...options });
    const result = await f.request('/register', { body: registration });
    assert.equal(result.status, 500);
    assert.equal(result.body.code, 'REGISTRATION_ROLLBACK_FAILED');
    assert.equal(f.calls.some(call => call.kind === 'deleteAuth'), false);
    assert.equal(f.state.eligibility, null);
    noPrivateData(result.body);
  }
});

test('declaração: rotas exigem JWT e banimento é conferido antes dos dados privados', async t => {
  for (const method of ['GET', 'POST']) {
    const f = await routeFixture(t);
    assert.equal((await f.request('/eligibility', { method, body: declaration })).status, 401);
    assert.equal(f.calls.length, 0);
    const banned = await routeFixture(t, 'auth', { banned: true });
    assert.equal((await banned.request('/eligibility', { method, token: banned.token, body: declaration })).status, 403);
    assert.equal(banned.calls.some(call => call.sql?.includes('user_eligibility')), false);
  }
});

test('declaração: consulta só devolve estado público; ausência significa pendente', async t => {
  for (const missingEligibility of [false, true]) {
    const f = await routeFixture(t, 'auth', { missingEligibility });
    const result = await f.request('/eligibility', { method: 'GET', token: f.token });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { eligibility: { status: missingEligibility ? 'PENDING' : 'DECLARED_ADULT',
      declaredAdult: !missingEligibility, identityVerified: false } });
    noPrivateData(result.body);
    assert.deepEqual(f.calls.find(call => call.sql?.includes('user_eligibility')).params, [7]);
  }
});

test('declaração: legado sem UUID conclui usando ID do JWT, não o ID enviado pelo app', async t => {
  const f = await routeFixture(t, 'auth', { user: { auth_user_id: null }, missingEligibility: true });
  const result = await f.request('/eligibility', { token: f.token, body: { ...declaration, userId: 99, id: 99 } });
  assert.equal(result.status, 200);
  assert.equal(f.state.eligibility.user_id, 7);
  assert.equal(f.calls.some(call => ['signup', 'login', 'updateAuth'].includes(call.kind)), false);
  noPrivateData(result.body);
});

test('declaração: repetição concorrente é idempotente e outro CPF não substitui o registrado', async t => {
  const f = await routeFixture(t, 'auth', { missingEligibility: true });
  const results = await Promise.all(Array.from({ length: 5 }, () => f.request('/eligibility', { token: f.token, body: declaration })));
  assert.ok(results.every(result => result.status === 200));
  const original = structuredClone(f.state.eligibility);
  const changed = await f.request('/eligibility', { token: f.token, body: { ...declaration, cpf: '01234567890' } });
  assert.equal(changed.status, 400);
  assert.equal(changed.body.code, 'CPF_DECLARATION_MISMATCH');
  assert.deepEqual(f.state.eligibility, original);
});

test('declaração: rejeição não grava e indisponibilidade não aprova silenciosamente', async t => {
  const f = await routeFixture(t, 'auth', { missingEligibility: true });
  assert.equal((await f.request('/eligibility', { token: f.token, body: { ...declaration, birthDate: minorBirthDate } })).status, 400);
  assert.equal(f.calls.some(call => call.kind === 'tx'), false);
  const broken = await routeFixture(t, 'auth', { missingEligibility: true, eligibilityWriteError: new Error('diagnostico secreto') });
  const result = await broken.request('/eligibility', { token: broken.token, body: declaration });
  assert.equal(result.status, 503);
  assert.equal(broken.state.eligibility, null);
  assert.doesNotMatch(JSON.stringify(result.body), /diagnostico/);
});

test('contas antigas: tabela privada ausente não bloqueia login, perfil ou recuperação existentes', async t => {
  const f = await routeFixture(t, 'auth', { user: { auth_user_id: null }, eligibilityError: new Error('migração ausente') });
  assert.equal((await f.request('/login', { body: { email: registration.email, password: registration.password } })).status, 200);
  assert.equal((await f.request('/update-status/7', { method: 'GET', token: f.token })).status, 200);
  // Mantém a limitação anterior das contas sem Supabase Auth, sem migração silenciosa.
  assert.equal((await f.request('/request-password-reset', { body: { email: registration.email } })).status, 404);
  assert.equal(f.calls.some(call => call.sql?.includes('user_eligibility')), false);
  const animals = await routeFixture(t, 'animals', { missingEligibility: true, eligibilityError: new Error('private offline') });
  assert.equal((await animals.request('', { method: 'GET', token: animals.token })).status, 200);
  assert.equal(animals.calls.some(call => call.sql?.includes('user_eligibility')), false);
});

test('declaração: registro privado inconsistente retorna indisponibilidade, sem expor seus campos', async t => {
  const f = await routeFixture(t, 'auth', { eligibility: { cpf_hmac: 'invalido' } });
  const result = await f.request('/eligibility', { method: 'GET', token: f.token });
  assert.equal(result.status, 503);
  noPrivateData(result.body);
});
