const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminRouter } = require('../routes/createAdminRouter');
const { animalObjectPath, cleanupAnimalPhotos } = require('../services/animalStorageCleanup');

const actor = '11111111-1111-4111-8111-111111111111';
const targetAuth = '22222222-2222-4222-8222-222222222222';
const supabaseUrl = 'https://petgo.example.test';
const photo = name => `${supabaseUrl}/storage/v1/object/public/animals/${name}`;

async function fixture(t, options = {}) {
  const calls = [];
  const initial = options.user === undefined ? { id: 7, auth_user_id: targetAuth, is_admin: false } : options.user;
  let user = initial;
  let animal = options.animal === undefined ? { id: 8, image_url: photo('first.jpg'), rescue_image_url: photo('last.jpg') } : options.animal;
  const db = {
    get(sql, params, callback) {
      if (sql.startsWith('SELECT auth_user_id FROM petgo_private.admin_users')) return callback(null, options.admin === false ? null : {});
      calls.push({ type: 'sql', sql, params });
      if (sql.includes('FROM public.users u WHERE u.id')) return callback(null, user);
      if (sql.includes('pg_catalog.pg_trigger')) return callback(null, { ready: options.ready !== false });
      if (sql === 'SELECT id FROM public.users WHERE id = ?') return callback(null, user);
      if (sql.includes('DELETE FROM public.users')) {
        if (options.databaseError) return callback(options.databaseError);
        user = null; return callback(null, { id: 7 });
      }
      if (sql.includes('DELETE FROM public.animals')) {
        if (options.databaseError) return callback(options.databaseError);
        const result = animal; animal = null; return callback(null, result);
      }
      if (sql.includes('INSERT INTO petgo_private.admin_audit_log')) return callback(options.auditError, { id: 1 });
      callback(new Error(`Unexpected SQL: ${sql}`));
    },
    all(sql, params, callback) {
      calls.push({ type: 'references', sql });
      callback(options.referencesError, options.references || []);
    }
  };
  const storage = { from(bucket) {
    assert.equal(bucket, 'animals');
    return { async remove(paths) { calls.push({ type: 'storage', paths }); return { error: options.storageError || null }; } };
  } };
  const auth = {
    getUser: async () => ({ data: { user: { id: actor, email_confirmed_at: '2026-01-01' } } }),
    admin: { async deleteUser(id, soft) {
      calls.push({ type: 'authDelete', id, soft });
      if (!options.authError && !options.profileRemains) user = null; // Simula o trigger transacional.
      return { error: options.authError || null };
    } }
  };
  const app = express(); app.use(express.json());
  app.use('/admin', createAdminRouter({ auth, db, storage, supabaseUrl }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { calls, get user() { return user; }, async request(path = '/users/7', body = { reason: 'Conta de teste' }, token = 'token') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin${path}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } };
}

test('exclusão de conta exige token e autorização administrativa', async t => {
  const f = await fixture(t, { admin: false });
  assert.equal((await f.request('/users/7', {}, '')).status, 401);
  assert.equal((await f.request()).status, 403);
  assert.equal(f.calls.length, 0);
});

test('exclusão de conta rejeita ID/motivo inválidos sem efeitos', async t => {
  const f = await fixture(t);
  for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) assert.equal((await f.request(`/users/${id}`)).status, 400);
  for (const body of [{}, { reason: 42 }, { reason: '' }, { reason: ' a ' }, { reason: 'a'.repeat(501) }]) {
    assert.equal((await f.request('/users/7', body)).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('contas ADM e a própria identidade administrativa são protegidas', async t => {
  for (const user of [{ id: 7, auth_user_id: targetAuth, is_admin: true }, { id: 7, auth_user_id: actor, is_admin: false }]) {
    const f = await fixture(t, { user });
    assert.equal((await f.request()).status, 409);
    assert.equal(f.calls.length, 1);
  }
});

test('migração ausente bloqueia SDK e exclusão local; conta inexistente retorna 404', async t => {
  const missing = await fixture(t, { user: null });
  assert.equal((await missing.request()).status, 404);
  const f = await fixture(t, { ready: false });
  const result = await f.request();
  assert.equal(result.status, 503);
  assert.match(result.body.error, /007_admin_deletion/);
  assert.ok(!f.calls.some(call => call.type === 'authDelete' || /DELETE FROM/.test(call.sql || '')));
});

test('exclusão usa UUID do banco, hard delete e ator do token; não toca fotos', async t => {
  const f = await fixture(t);
  const result = await f.request('/users/7', { reason: ' Revisão ', auth_user_id: 'forjado', actor_id: 'forjado' });
  assert.deepEqual(result, { status: 200, body: { deletedId: 7 } });
  assert.deepEqual(f.calls.find(call => call.type === 'authDelete'), { type: 'authDelete', id: targetAuth, soft: false });
  assert.deepEqual(f.calls.at(-1).params, [actor, '7', 'Revisão']);
  assert.equal(f.user, null);
  assert.ok(!f.calls.some(call => call.type === 'storage' || /DELETE FROM public.animals/.test(call.sql || '')));
  assert.equal((await f.request()).status, 404);
});

test('falha do Supabase não apaga perfil nem fotos e não expõe erro interno', async t => {
  for (const authError of [{ code: 'unexpected_failure', status: 500, message: 'segredo' }, { status: 404, message: 'URL errada' }, { code: 'not_admin', status: 403 }]) {
    const f = await fixture(t, { authError });
    const result = await f.request();
    assert.equal(result.status, 503);
    assert.doesNotMatch(JSON.stringify(result), /segredo|URL errada/);
    assert.ok(f.user);
    assert.ok(!f.calls.some(call => /DELETE FROM public.users/.test(call.sql || '') || call.type === 'storage'));
  }
});

test('legado e Auth já ausente: exclusão local + auditoria no mesmo SQL', async t => {
  for (const options of [{ user: { id: 7, auth_user_id: null } }, { authError: { code: 'user_not_found' } }]) {
    const f = await fixture(t, options);
    assert.equal((await f.request()).status, 200);
    const query = f.calls.at(-1);
    assert.match(query.sql, /DELETE FROM public.users/);
    assert.match(query.sql, /INSERT INTO petgo_private.admin_audit_log/);
    assert.match(query.sql, /auth_user_id::text IS NOT DISTINCT FROM/);
    assert.deepEqual(query.params.slice(-2), [actor, 'Conta de teste']);
  }
});

test('proteção/vínculos no banco abortam exclusão local', async t => {
  for (const code of ['23503', '42501']) {
    const f = await fixture(t, { user: { id: 7, auth_user_id: null }, databaseError: { code } });
    assert.equal((await f.request()).status, 409);
    assert.ok(f.user);
  }
});

test('perfil ainda presente após SDK não é anunciado como removido', async t => {
  const f = await fixture(t, { profileRemains: true });
  assert.equal((await f.request()).status, 503);
});

test('falha de auditoria após Auth informa exclusão concluída com ressalva', async t => {
  const f = await fixture(t, { auditError: { code: '08006' } });
  const result = await f.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.deletedId, 7);
  assert.match(result.body.warning, /histórico/);
  assert.equal(f.user, null);
});

test('animal: remove fotos originais/resgate somente após DELETE com auditoria', async t => {
  const f = await fixture(t);
  const result = await f.request('/animals/8');
  assert.equal(result.status, 200);
  assert.equal(result.body.storageCleanup.removed, 2);
  assert.equal(result.body.storageCleanup.status, 'complete');
  assert.match(f.calls[0].sql, /DELETE FROM public.animals/);
  assert.match(f.calls[0].sql, /INSERT INTO petgo_private.admin_audit_log/);
  assert.deepEqual(f.calls.filter(call => call.type === 'storage').map(call => call.paths), [['first.jpg'], ['last.jpg']]);
  assert.equal((await f.request('/animals/8')).status, 404);
  assert.equal(f.calls.filter(call => call.type === 'storage').length, 2);
});

test('animal: falha SQL não remove nenhuma foto', async t => {
  const f = await fixture(t, { databaseError: { code: '23503' } });
  assert.equal((await f.request('/animals/8')).status, 409);
  assert.ok(!f.calls.some(call => call.type === 'storage'));
});

test('animal: arquivo ausente é tolerado; erro real gera aviso sem ocultar exclusão do registro', async t => {
  for (const [storageError, expected] of [[{ statusCode: '404', code: 'NoSuchKey' }, 'complete'], [{ statusCode: '403', code: 'AccessDenied' }, 'partial'], [{ statusCode: '404', code: 'NoSuchBucket' }, 'partial']]) {
    const f = await fixture(t, { storageError });
    const result = await f.request('/animals/8');
    assert.equal(result.status, 200);
    assert.equal(result.body.deletedId, 8);
    assert.equal(result.body.storageCleanup.status, expected);
    assert.equal((await f.request('/animals/8')).status, 404);
  }
});

test('animal: preserva foto compartilhada com URL codificada ou assinada', async t => {
  const f = await fixture(t, { references: [{ image_url: photo('%66irst.jpg') }, { rescue_image_url: `${supabaseUrl}/storage/v1/object/sign/animals/last.jpg?token=example` }] });
  const result = await f.request('/animals/8');
  assert.equal(result.body.storageCleanup.shared, 2);
  assert.ok(!f.calls.some(call => call.type === 'storage'));
});

test('animal: falha ao conferir referências preserva fotos e mostra pendência', async t => {
  const f = await fixture(t, { referencesError: { code: '08006' } });
  const result = await f.request('/animals/8');
  assert.equal(result.status, 200);
  assert.equal(result.body.storageCleanup.status, 'partial');
  assert.ok(!f.calls.some(call => call.type === 'storage'));
});

test('Storage: bucket/projeto fixos, decodificação segura e rejeição de caminhos inválidos', () => {
  assert.equal(animalObjectPath(photo('pasta/foto%201.jpg'), supabaseUrl), 'pasta/foto 1.jpg');
  for (const value of ['https://evil.test/storage/v1/object/public/animals/a.jpg', photo('a.jpg').replace('/animals/', '/avatars/'), photo('a/../b.jpg'), photo('a/%2e%2e/b.jpg'), photo('a%2F..%2Fb.jpg'), photo('a%5Cb.jpg'), photo('%00.jpg'), photo('%invalid'), 'file:///tmp/foto.jpg', null]) {
    assert.equal(animalObjectPath(value, supabaseUrl), null, value);
  }
});

test('Storage: deduplica fotos, não remove URL externa e limita espera por falha de rede', async () => {
  let calls = 0;
  const db = { all(sql, params, cb) { cb(null, []); } };
  const result = await cleanupAnimalPhotos({ db, supabaseUrl, timeoutMs: 10,
    animal: { id: 1, image_url: photo('same.jpg'), rescue_image_url: photo('same.jpg') },
    storage: { from() { return { remove() { calls++; return new Promise(() => {}); } }; } }
  });
  assert.equal(calls, 1); assert.equal(result.failed, 1); assert.equal(result.status, 'partial');
  const skipped = await cleanupAnimalPhotos({ db, supabaseUrl, animal: { id: 1, image_url: 'https://external.test/photo.jpg' } });
  assert.equal(skipped.skipped, 1); assert.equal(skipped.status, 'partial');
});
