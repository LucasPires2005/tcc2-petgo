const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture, animalForm } = require('./helpers/routeFixture');

test('rotas reais de animais exigem JWT antes de upload ou consultas de negócio', async (t) => {
  const f = await routeFixture(t, 'animals');
  for (const [suffix, method] of [['', 'GET'], ['', 'POST'], ['/42/rescue', 'PATCH'], ['/user/7', 'GET']]) {
    assert.equal((await f.request(suffix, { method })).status, 401);
  }
  assert.equal(f.calls.length, 0);
});

test('lista pessoal não permite consultar animais de outra conta', async (t) => {
  const f = await routeFixture(t, 'animals');
  assert.equal((await f.request('/user/99', { method: 'GET', token: f.token })).status, 403);
  assert.equal(f.calls.some(c => c.kind === 'all'), false);
  assert.equal((await f.request('/user/7', { method: 'GET', token: f.token })).status, 200);
  assert.deepEqual(f.calls.find(c => c.kind === 'all').params, ['7']);
});

test('cadastro multipart usa autor do JWT e modera antes de upload e INSERT', async (t) => {
  const f = await routeFixture(t, 'animals');
  const r = await f.request('', { token: f.token, form: animalForm() });
  assert.equal(r.status, 200);
  assert.equal(r.body.userId, 7);
  assert.equal(r.body.image_url, 'https://files.example.test/pet.png');
  const write = f.calls.find(c => c.kind === 'run');
  assert.equal(write.params[7], 7);
  assert.deepEqual(write.params.slice(4, 6), [-15.6, -56.1]);
  assert.deepEqual(f.calls.filter(c => ['moderate', 'upload', 'run'].includes(c.kind)).map(c => c.kind), ['moderate', 'upload', 'run']);
});

for (const [suffix, method, field] of [['', 'POST', 'image'], ['/42/rescue', 'PATCH', 'rescue_image']]) {
  test(`${method} animals${suffix}: rejeição e indisponibilidade impedem upload e escrita`, async (t) => {
    for (const [options, status, code] of [
      [{ moderation: { allowed: false, reason: 'Imagem rejeitada' } }, 422, 'IMAGE_REJECTED'],
      [{ moderationError: new Error('timeout') }, 503, 'MODERATION_UNAVAILABLE']
    ]) {
      const f = await routeFixture(t, 'animals', options);
      const r = await f.request(suffix, { method, token: f.token, form: animalForm(field) });
      assert.equal(r.status, status);
      assert.equal(r.body.code, code);
      assert.equal(f.calls.some(c => ['upload', 'run'].includes(c.kind)), false);
    }
  });
}

test('falha de Storage não cadastra registro nem concede moedas', async (t) => {
  const f = await routeFixture(t, 'animals', { uploadError: new Error('unavailable') });
  const r = await f.request('/42/rescue', { method: 'PATCH', token: f.token, form: animalForm('rescue_image') });
  assert.equal(r.status, 500);
  assert.equal(f.calls.some(c => c.kind === 'run'), false);
});

test('resgate multipart credita o resgatador autenticado conforme plano', async (t) => {
  for (const [tier, expected] of [[1, 50], [2, 100], [3, 150]]) {
    const f = await routeFixture(t, 'animals', { user: { plan_tier: tier } });
    const r = await f.request('/42/rescue', { method: 'PATCH', token: f.token, form: animalForm('rescue_image') });
    assert.equal(r.status, 200);
    assert.equal(r.body.earnedCoins, expected);
    const writes = f.calls.filter(c => c.kind === 'run');
    assert.equal(writes[0].params[3], 7);
    assert.equal(writes[0].params[4], '42');
    assert.deepEqual(writes[1].params, [expected, 7]);
  }
});
