const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { routeFixture, animalForm } = require('./helpers/routeFixture');
const { createCpfHmac } = require('../services/eligibilityValidation');

const CPF = '52998224725';
function rescueForm(changes = {}) {
  const form = animalForm('rescue_image');
  for (const [key, value] of Object.entries({
    rescuer_name: 'Pessoa de Teste', rescuer_contact: '(11) 91234-5678',
    rescuer_email: 'Pessoa@EXAMPLE.TEST', rescuer_cpf: CPF,
    acceptedResponsibility: 'true', ...changes
  })) {
    if (value === undefined) form.delete(key);
    else form.set(key, value);
  }
  return form;
}
function rescue(f, form = rescueForm()) {
  return f.request('/42/rescue', { method: 'PATCH', token: f.token, form });
}
function noRescueEffects(f) {
  assert.equal(f.state.rescued, false);
  assert.equal(f.state.coins, 100);
  assert.equal(f.calls.some(call => call.kind === 'upload'), false);
  assert.equal(f.calls.some(call => call.kind === 'tx' && /^(UPDATE|INSERT INTO petgo_private.rescue_declarations)/.test(call.sql)), false);
}

test('resgate de conta legada sem declaração retorna 403 sem bloquear listagem', async t => {
  const f = await routeFixture(t, 'animals', { user: { auth_user_id: null }, eligibility: null });
  const result = await rescue(f);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'ELIGIBILITY_REQUIRED');
  noRescueEffects(f);
  assert.equal((await f.request('', { method: 'GET', token: f.token })).status, 200);
});

test('requisição direta não substitui declaração privada com flags do cliente', async t => {
  const f = await routeFixture(t, 'animals', { missingEligibility: true });
  const result = await rescue(f, rescueForm({ eligible: 'true', age: '99', identityVerified: 'true' }));
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'ELIGIBILITY_REQUIRED');
  noRescueEffects(f);
});

test('resgate rejeita CPF matematicamente válido diferente da declaração', async t => {
  const f = await routeFixture(t, 'animals');
  const result = await rescue(f, rescueForm({ rescuer_cpf: '01234567890' }));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'CPF_DECLARATION_MISMATCH');
  noRescueEffects(f);
});

test('campos obrigatórios, formatos e aceite são validados antes da moderação', async t => {
  const f = await routeFixture(t, 'animals');
  for (const [field, value, code] of [
    ['rescuer_name', '', 'RESCUER_NAME_INVALID'],
    ['rescuer_name', 'A', 'RESCUER_NAME_INVALID'],
    ['rescuer_name', 'A'.repeat(121), 'RESCUER_NAME_INVALID'],
    ['rescuer_name', 'Pessoa\nTeste', 'RESCUER_NAME_INVALID'],
    ['rescuer_contact', 'telefone', 'RESCUER_CONTACT_INVALID'],
    ['rescuer_contact', '119123456', 'RESCUER_CONTACT_INVALID'],
    ['rescuer_contact', '+1 11912345678', 'RESCUER_CONTACT_INVALID'],
    ['rescuer_email', 'email-invalido', 'RESCUER_EMAIL_INVALID'],
    ['rescuer_email', 'teste@dominio..com', 'RESCUER_EMAIL_INVALID'],
    ['rescuer_email', undefined, 'RESCUER_EMAIL_INVALID'],
    ['rescuer_cpf', undefined, 'CPF_INVALID'],
    ['rescuer_cpf', '11111111111', 'CPF_INVALID'],
    ['acceptedResponsibility', undefined, 'RESPONSIBILITY_REQUIRED'],
    ['acceptedResponsibility', 'false', 'RESPONSIBILITY_REQUIRED'],
    ['acceptedResponsibility', '1', 'RESPONSIBILITY_REQUIRED'],
    ['acceptedResponsibility', ' true ', 'RESPONSIBILITY_REQUIRED']
  ]) {
    const result = await rescue(f, rescueForm({ [field]: value }));
    assert.equal(result.status, 400, `${field}: ${String(value)}`);
    assert.equal(result.body.code, code);
  }
  assert.equal(f.calls.some(call => call.kind === 'moderate'), false);
  noRescueEffects(f);
});

test('foto de prova é obrigatória inclusive para requisições JSON diretas', async t => {
  const f = await routeFixture(t, 'animals');
  const result = await f.request('/42/rescue', { method: 'PATCH', token: f.token, body: {
    rescuer_name: 'Pessoa Teste', rescuer_contact: '11912345678',
    rescuer_email: 'test@example.test', rescuer_cpf: CPF, acceptedResponsibility: true
  } });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'RESCUE_IMAGE_REQUIRED');
  assert.equal(f.calls.some(call => call.kind === 'moderate'), false);
  noRescueEffects(f);
});

test('responsabilidade e recompensa são gravadas sob os locks existentes sem persistir CPF', async t => {
  const f = await routeFixture(t, 'animals');
  const result = await rescue(f, rescueForm({ rescuer_cpf: '529.982.247-25', userId: '99', rescuer_contact: '+55 (11) 91234-5678' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.earnedCoins, 100);
  const sql = f.calls.filter(call => call.kind === 'tx');
  const animalLock = sql.findIndex(call => call.sql.includes('FROM public.animals') && call.sql.includes('FOR UPDATE'));
  const userLock = sql.findIndex(call => call.sql.includes('FROM public.users') && call.sql.includes('FOR UPDATE'));
  const declaration = sql.findIndex(call => call.sql.includes('FROM petgo_private.user_eligibility'));
  assert.ok(animalLock >= 0 && userLock > animalLock && declaration > userLock);
  assert.match(sql[declaration].sql, /FOR SHARE/);
  assert.deepEqual(sql[declaration].params, [7]);
  const insert = sql.find(call => call.sql.startsWith('INSERT INTO petgo_private.rescue_declarations'));
  assert.deepEqual(insert.params, ['42', 7, 'Pessoa de Teste', '11912345678', 'pessoa@example.test', '2026-10-02-v1']);
  assert.equal(sql.some(call => JSON.stringify(call.params).includes(CPF)), false);
  assert.equal(sql.some(call => call.sql.startsWith('UPDATE public.animals') && call.params.includes('pessoa@example.test')), false);
  assert.equal(JSON.stringify(result.body).includes(CPF), false);
  assert.equal(JSON.stringify(result.body).includes('cpf_hmac'), false);
});

test('DDD e telefone nacional também aceitam prefixo 55 sem sinal de mais', async t => {
  for (const phone of ['5511912345678', '(11) 3456-7890']) {
    const f = await routeFixture(t, 'animals');
    assert.equal((await rescue(f, rescueForm({ rescuer_contact: phone }))).status, 200);
  }
});

test('duplicidade e simultaneidade concedem moedas e declaração uma única vez', async t => {
  const f = await routeFixture(t, 'animals');
  const results = await Promise.all([rescue(f), rescue(f)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(f.state.coins, 200);
  assert.equal(f.calls.filter(call => call.kind === 'upload').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'tx' && call.sql.startsWith('INSERT INTO petgo_private.rescue_declarations')).length, 1);
  assert.equal((await rescue(f)).body.code, 'ANIMAL_ALREADY_RESCUED');
});

test('falha na leitura privada não informa dados técnicos nem concede recompensa', async t => {
  const f = await routeFixture(t, 'animals', { eligibilityError: new Error(`database details ${CPF}`) });
  const result = await rescue(f);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'ELIGIBILITY_UNAVAILABLE');
  assert.equal(JSON.stringify(result.body).includes(CPF), false);
  assert.equal(f.calls.some(call => call.kind === 'logError'), false);
  noRescueEffects(f);
});

test('falha na declaração privada desfaz status e moedas no mesmo rollback', async t => {
  const f = await routeFixture(t, 'animals', { rescueDeclarationError: new Error(`private write ${CPF}`) });
  const result = await rescue(f);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'ELIGIBILITY_UNAVAILABLE');
  assert.equal(f.state.rescued, false);
  assert.equal(f.state.coins, 100);
  assert.equal(f.calls.some(call => call.kind === 'upload'), false);
  assert.equal(JSON.stringify(result.body).includes(CPF), false);
  assert.equal(f.calls.some(call => call.kind === 'logError'), false);
});

test('falha na recompensa desfaz também a declaração privada já inserida', async t => {
  const f = await routeFixture(t, 'animals', { rewardError: new Error('reward write unavailable') });
  const result = await rescue(f);
  assert.equal(result.status, 500);
  assert.equal(f.state.rescued, false);
  assert.equal(f.state.coins, 100);
  assert.deepEqual(f.state.rescueDeclarations || [], []);
  assert.equal(f.calls.filter(call => call.kind === 'tx' && call.sql.startsWith('INSERT INTO petgo_private.rescue_declarations')).length, 1);
});

test('chave HMAC ausente falha fechada sem registrar o CPF', async t => {
  const f = await routeFixture(t, 'animals');
  const previous = process.env.CPF_HMAC_SECRET;
  t.after(() => previous === undefined ? delete process.env.CPF_HMAC_SECRET : process.env.CPF_HMAC_SECRET = previous);
  delete process.env.CPF_HMAC_SECRET;
  const result = await rescue(f);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'ELIGIBILITY_UNAVAILABLE');
  assert.equal(f.calls.some(call => call.kind === 'logError'), false);
  noRescueEffects(f);
});

test('estado ou versão privada inesperados não liberam o resgate', async t => {
  for (const [eligibility, expectedStatus] of [
    [{ status: 'PENDING', cpf_hmac: createCpfHmac(CPF), cpf_key_version: 'v1' }, 403],
    [{ status: 'DECLARED_ADULT', cpf_hmac: createCpfHmac(CPF), cpf_key_version: 'v2' }, 503]
  ]) {
    const f = await routeFixture(t, 'animals', { eligibility });
    assert.equal((await rescue(f)).status, expectedStatus);
    noRescueEffects(f);
  }
});

test('migração de responsabilidade é privada, aditiva e sem documento pessoal duplicado', () => {
  const script = fs.readFileSync(path.join(__dirname, '../sql/011_rescue_declarations.sql'), 'utf8');
  const sql = script.replace(/^\s*--.*$/gm, '');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS petgo_private\.rescue_declarations/);
  assert.match(sql, /animal_id integer PRIMARY KEY REFERENCES public\.animals\(id\) ON DELETE CASCADE/);
  assert.match(sql, /user_id integer NOT NULL REFERENCES public\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE petgo_private\.rescue_declarations FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /\b(?:cpf|cpf_hmac|birth_date|birthDate)\s+(?:text|date|varchar)/i);
  assert.doesNotMatch(sql, /CREATE SCHEMA|DROP|CREATE POLICY|GRANT|ALTER TABLE public\./i);
});
