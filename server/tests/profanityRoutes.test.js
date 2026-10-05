const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');
const { routeFixture, animalForm } = require('./helpers/routeFixture');

const rejection = {
  error: 'O texto enviado contém expressões inadequadas. Utilize uma linguagem respeitosa.'
};
const registration = {
  name: 'Ágata', email: 'test@example.test', password: 'secret123',
  cpf: '52998224725', birthDate: '2000-01-01', acceptedDeclaration: true
};

function assertRejected(result) {
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, rejection);
}

function assertNoEffects(fixture) {
  const effects = new Set(['tx', 'run', 'moderate', 'upload', 'removePhoto', 'signup',
    'login', 'requestEmailChange', 'updateAuth', 'deleteAuth', 'preference']);
  assert.deepEqual(fixture.calls.filter(call => effects.has(call.kind)), []);
}

async function adminFixture(t, { admin = true } = {}) {
  const calls = [];
  const db = {
    get(sql, params, callback) {
      if (sql.startsWith('SELECT auth_user_id FROM petgo_private.admin_users')) {
        calls.push({ kind: 'adminMembership', params });
        return callback(null, admin ? {} : null);
      }
      calls.push({ kind: 'adminQuery', sql, params });
      callback(new Error('Unexpected administrative business query'));
    },
    all(sql, params, callback) {
      calls.push({ kind: 'adminQuery', sql, params });
      callback(null, []);
    }
  };
  const auth = {
    async getUser(token) {
      calls.push({ kind: 'adminAuth', token });
      return { data: { user: {
        id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: '2026-01-01'
      } } };
    },
    admin: { async deleteUser(id) { calls.push({ kind: 'deleteAuth', id }); return {}; } }
  };
  const storage = { from() {
    return { async remove(paths) { calls.push({ kind: 'removePhoto', paths }); return {}; } };
  } };
  const app = express();
  app.use(express.json());
  app.use('/admin', createAdminRouter({ auth, db, storage, supabaseUrl: 'https://files.example.test' }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, async request(path, method, token = 'synthetic-admin-token') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin${path}`, {
      method, headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ reason: 'Revisão porra', banned: true }),
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() };
  } };
}

for (const [field, value] of [
  ['name', 'p\u200bórrà!'], ['species', 'porra'], ['breed', 'foda'], ['health', 'Tem merda.']
]) {
  test(`profanidade: cadastro multipart rejeita ${field} antes de cota, moderação e gravação`, async t => {
    const f = await routeFixture(t, 'animals');
    const form = animalForm();
    form.set(field, value);
    assertRejected(await f.request('', { token: f.token, form }));
    assertNoEffects(f);
    assert.deepEqual(f.state.creationEvents || [], []);
    assert.equal(f.state.coins, 100);
  });
}

test('profanidade: nome do resgatador é rejeitado antes de imagem, transação e recompensa', async t => {
  const f = await routeFixture(t, 'animals');
  const form = animalForm('rescue_image');
  form.set('rescuer_name', 'Pessoa merda');
  assertRejected(await f.request('/42/rescue', { method: 'PATCH', token: f.token, form }));
  assertNoEffects(f);
  assert.equal(f.state.rescued, false);
  assert.equal(f.state.coins, 100);
  assert.deepEqual(f.state.rescueDeclarations, []);
});

test('profanidade: cadastro rejeita nome antes de criar identidade ou perfil', async t => {
  const f = await routeFixture(t, 'auth', { missingEligibility: true });
  assertRejected(await f.request('/register', { body: { ...registration, name: 'Pessoa porra' } }));
  assertNoEffects(f);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.eligibility, null);
});

test('profanidade: cadastro verifica texto em objetos e arrays aninhados', async t => {
  const f = await routeFixture(t);
  assertRejected(await f.request('/register', {
    body: { ...registration, details: [{ labels: ['Tranquilo', 'merda'] }] }
  }));
  assertNoEffects(f);
});

test('profanidade: edição rejeita nome antes de UPDATE e solicitação de troca de e-mail', async t => {
  const f = await routeFixture(t);
  assertRejected(await f.request('/update', { method: 'PUT', token: f.token,
    body: { id: 7, name: 'Pessoa foda', email: 'novo@example.test', currentPassword: 'secret123' }
  }));
  assertNoEffects(f);
  assert.ok(f.calls.every(call => call.kind === 'get' && call.sql.includes('user_access')));
});

test('profanidade: complementação social rejeita nome antes do handler social', async t => {
  const f = await routeFixture(t);
  assertRejected(await f.request('/social-complete', { token: 'synthetic-social-credential',
    body: { ...registration, name: 'Pessoa porra' }
  }));
  assert.equal(f.calls.length, 0);
});

for (const legacy of [false, true]) {
  test(`profanidade: login ${legacy ? 'legado' : 'Supabase'} aceita senha com palavra bloqueada`, async t => {
    const password = 'minha porra senha';
    const f = await routeFixture(t, 'auth', {
      user: { password, ...(legacy ? { auth_user_id: null } : {}) }
    });
    const result = await f.request('/login', { body: { email: registration.email, password } });
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.accessToken, 'string');
    const login = f.calls.find(call => call.kind === 'login');
    if (legacy) assert.equal(login, undefined);
    else assert.equal(login.password, password);
  });
}

test('profanidade: cadastro válido preserva senha e e-mail contendo palavra bloqueada', async t => {
  const f = await routeFixture(t, 'auth', { missingEligibility: true });
  const body = { ...registration, email: 'porra@example.test', password: 'minha merda senha' };
  const result = await f.request('/register', { body });
  assert.equal(result.status, 201);
  const signup = f.calls.find(call => call.kind === 'signup');
  assert.equal(signup.email, body.email);
  assert.equal(signup.password, body.password);
  assert.ok(f.calls.some(call => call.sql?.includes('INSERT INTO public.users')));
});

test('profanidade: edição válida conserva fluxo de e-mail e senha atual', async t => {
  const f = await routeFixture(t);
  const result = await f.request('/update', { method: 'PUT', token: f.token,
    body: { id: 7, name: 'Ágata', email: 'merda@example.test', currentPassword: 'minha porra senha' }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.emailChangePending, true);
  assert.equal(f.calls.find(call => call.kind === 'login').password, 'minha porra senha');
  assert.equal(f.calls.find(call => call.kind === 'requestEmailChange').email, 'merda@example.test');
  assert.deepEqual(f.calls.find(call => call.kind === 'run').params, ['Ágata', 7]);
});

test('profanidade: cadastro de animal válido preserva texto e ignora campos técnicos', async t => {
  const f = await routeFixture(t, 'animals');
  const form = animalForm();
  const fields = {
    name: 'Ágata', breed: 'Mestiça', health: 'Em recuperação', email: 'porra@example.test',
    password: 'merda', currentPassword: 'porra', newPassword: 'foda', token: 'porra',
    cpf: 'merda', phone: 'foda', image_url: 'https://files.example.test/merda/image.png'
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const result = await f.request('', { token: f.token, form });
  assert.equal(result.status, 200);
  for (const [key, value] of Object.entries(fields)) {
    if (key !== 'image_url') assert.equal(result.body[key], value);
  }
  assert.equal(result.body.image_url, 'https://files.example.test/pet.png');
  const insert = f.calls.find(call => call.sql?.startsWith('INSERT INTO animals'));
  assert.equal(insert.params[0], fields.name);
  assert.equal(insert.params[2], fields.breed);
  assert.equal(insert.params[3], fields.health);
  assert.equal(f.calls.filter(call => call.kind === 'moderate').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'upload').length, 1);
  assert.equal(f.state.creationEvents.length, 1);
});

test('profanidade: resgate válido aceita palavra bloqueada no e-mail do resgatador', async t => {
  const f = await routeFixture(t, 'animals');
  const form = animalForm('rescue_image');
  form.set('rescuer_email', 'porra@example.test');
  const result = await f.request('/42/rescue', { method: 'PATCH', token: f.token, form });
  assert.equal(result.status, 200);
  assert.equal(f.state.rescued, true);
  assert.equal(f.state.coins, 200);
  assert.equal(f.state.rescueDeclarations[0].rescuer_email, 'porra@example.test');
});

test('profanidade: sessão ausente e banimento mantêm precedência nas rotas de animais', async t => {
  for (const [suffix, method] of [['', 'POST'], ['/42/rescue', 'PATCH'], ['/42', 'DELETE']]) {
    const f = await routeFixture(t, 'animals');
    const body = { name: 'porra', rescuer_name: 'merda', reason: 'foda' };
    assert.equal((await f.request(suffix, { method, body })).status, 401);
    assert.equal(f.calls.length, 0);
    const banned = await routeFixture(t, 'animals', { banned: true });
    const result = await banned.request(suffix, { method, token: banned.token, body });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'ACCOUNT_BANNED');
    assertNoEffects(banned);
  }
});

test('profanidade: motivo ofensivo impede exclusão por autor e remoção de fotos', async t => {
  const f = await routeFixture(t, 'animals', {
    authorPhoto: 'https://supabase.example.test/storage/v1/object/public/animals/test.jpg'
  });
  assertRejected(await f.request('/42', { method: 'DELETE', token: f.token,
    body: { reason: 'Criado por merda' }
  }));
  assertNoEffects(f);
  assert.equal(f.calls.some(call => call.sql?.includes('DELETE FROM public.animals')), false);
  assert.equal(f.state.authorDeleted, undefined);
  assert.equal(f.state.coins, 100);
});

test('profanidade: checkout rejeita endereço ofensivo antes de criar preferência', async t => {
  const f = await routeFixture(t);
  assertRejected(await f.request('/create-preference', { token: f.token, body: {
    type: 'store_purchase', title: 'Caneca', price: 35,
    deliveryType: 'DELIVERY', deliveryInfo: 'Rua da merda, 10'
  } }));
  assertNoEffects(f);
  assert.equal(f.state.events.length, 0);
});

test('profanidade: checkout válido mantém dados de entrega enviados ao provedor', async t => {
  const f = await routeFixture(t);
  const result = await f.request('/create-preference', { token: f.token, body: {
    type: 'store_purchase', title: 'Caneca', price: 35,
    deliveryType: 'DELIVERY', deliveryInfo: 'Rua Ágata, 10'
  } });
  assert.equal(result.status, 200);
  const preference = f.calls.find(call => call.kind === 'preference').body;
  assert.equal(preference.metadata.delivery_info, 'Rua Ágata, 10');
  assert.equal(preference.metadata.delivery_type, 'DELIVERY');
  assert.equal(preference.metadata.user_id, '7');
});

test('profanidade: nome de produto ofensivo impede compra e débito de moedas', async t => {
  const f = await routeFixture(t);
  assertRejected(await f.request('/buy-product', { token: f.token,
    body: { userId: 7, cost: 30, productName: 'Caneca merda' }
  }));
  assertNoEffects(f);
  assert.equal(f.calls.some(call => call.sql?.includes('UPDATE users SET coins')), false);
  assert.equal(f.state.coins, 100);
});

test('profanidade: motivo administrativo ofensivo impede banimento antes da gravação', async t => {
  const f = await adminFixture(t);
  assertRejected(await f.request('/users/7/ban', 'PUT'));
  assert.deepEqual(f.calls.map(call => call.kind), ['adminAuth', 'adminMembership']);
});

test('profanidade: motivos administrativos ofensivos impedem exclusão de conta e animal', async t => {
  const f = await adminFixture(t);
  for (const path of ['/users/7', '/animals/42']) {
    assertRejected(await f.request(path, 'DELETE'));
  }
  assert.deepEqual(f.calls.map(call => call.kind), [
    'adminAuth', 'adminMembership', 'adminAuth', 'adminMembership'
  ]);
});

test('profanidade: autenticação e permissão administrativa mantêm precedência sobre o texto', async t => {
  const f = await adminFixture(t, { admin: false });
  for (const [path, method] of [['/users/7/ban', 'PUT'], ['/users/7', 'DELETE'], ['/animals/42', 'DELETE']]) {
    const before = f.calls.length;
    assert.equal((await f.request(path, method, '')).status, 401);
    assert.equal(f.calls.length, before);
    assert.equal((await f.request(path, method)).status, 403);
    assert.deepEqual(f.calls.slice(before).map(call => call.kind), ['adminAuth', 'adminMembership']);
  }
});

test('profanidade: webhook externo mantém identificador original e processamento do pagamento', async t => {
  const f = await routeFixture(t);
  const result = await f.request('/webhook', { body: {
    type: 'payment', data: { id: 'payment merda' }, name: 'porra',
    external_metadata: { notes: ['foda'] }, userId: 99, planTier: 3
  } });
  assert.equal(result.status, 200);
  assert.deepEqual(f.calls.find(call => call.kind === 'payment'), { kind: 'payment', id: 'payment merda' });
  assert.equal(f.state.events.length, 1);
  assert.equal(f.state.events[0].user_id, '7');
  assert.equal(f.state.events[0].tier, 2);
});
