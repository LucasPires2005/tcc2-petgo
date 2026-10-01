// Verificação opcional em PostgreSQL/WASM isolado. Não lê .env nem conecta ao Supabase.
// Uso: node server/tests/helpers/adminDeletionSqlCheck.js <pasta-temporaria-com-pglite>
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
if (!process.argv[2]) throw new Error('Informe a pasta temporária onde @electric-sql/pglite foi instalado.');
const { PGlite } = createRequire(resolve(process.argv[2], 'package.json'))('@electric-sql/pglite');

test('migração 007 em PostgreSQL isolado (sem serviços reais)', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA petgo_private;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.users (id integer PRIMARY KEY, auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE petgo_private.admin_users (auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE public.animals (
      id integer PRIMARY KEY, "userId" integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      name text, status integer, image_url text, rescue_image_url text, rescuer_name text, rescuer_contact text NOT NULL
    );
    CREATE TABLE petgo_private.user_access (user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE);
    INSERT INTO auth.users VALUES
      ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222'),
      ('44444444-4444-4444-8444-444444444444');
    INSERT INTO public.users VALUES (1, '11111111-1111-4111-8111-111111111111'),
      (2, '22222222-2222-4222-8222-222222222222'), (3, NULL), (4, '44444444-4444-4444-8444-444444444444');
    INSERT INTO petgo_private.admin_users VALUES ('11111111-1111-4111-8111-111111111111');
    INSERT INTO public.animals VALUES
      (1, 1, 'Admin', 0, 'admin.jpg', NULL, 'Admin', '111'),
      (2, 2, 'Animal preservado', 1, 'foto.jpg', 'resgate.jpg', 'Pessoa', '222'),
      (3, 3, 'Legado', 0, 'legado.jpg', NULL, 'Legado', '333'),
      (4, 4, 'Rollback', 1, 'rollback.jpg', NULL, 'Pessoa 4', '444');
    INSERT INTO petgo_private.user_access VALUES (2), (3), (4);
    ALTER TABLE public.users ADD COLUMN name text, ADD COLUMN email text;
    ALTER TABLE public.animals ADD COLUMN species text, ADD COLUMN health text;
    ALTER TABLE petgo_private.user_access ADD COLUMN banned boolean DEFAULT false,
      ADD COLUMN version integer DEFAULT 0, ADD COLUMN updated_at timestamptz DEFAULT now();
  `);
  await db.exec(readFileSync(resolve(__dirname, '../../sql/005_admin_audit.sql'), 'utf8'));
  const migration = readFileSync(resolve(__dirname, '../../sql/007_admin_deletion.sql'), 'utf8');

  await t.test('migração é repetível e não apaga dados na implantação', async () => {
    await db.exec(migration); await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.users')).rows[0].total, 4);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.animals')).rows[0].total, 4);
  });

  await t.test('protege ADM no Auth e no perfil local, antes de cascatas', async () => {
    await assert.rejects(db.exec("DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111'"), { code: '42501' });
    await assert.rejects(db.exec('DELETE FROM public.users WHERE id = 1'), { code: '42501' });
    assert.equal((await db.query('SELECT count(*)::int AS total FROM petgo_private.admin_users')).rows[0].total, 1);
  });

  await t.test('excluir Auth remove perfil/acesso e preserva animal/fotos/status sem contato', async () => {
    await db.exec("DELETE FROM auth.users WHERE id = '22222222-2222-4222-8222-222222222222'");
    assert.deepEqual((await db.query('SELECT * FROM public.users WHERE id = 2')).rows, []);
    assert.deepEqual((await db.query('SELECT * FROM petgo_private.user_access WHERE user_id = 2')).rows, []);
    assert.deepEqual((await db.query('SELECT * FROM public.animals WHERE id = 2')).rows[0], {
      id: 2, userId: null, name: 'Animal preservado', status: 1, image_url: 'foto.jpg', rescue_image_url: 'resgate.jpg',
      rescuer_name: 'Conta Removida', rescuer_contact: null, species: null, health: null
    });
    assert.equal((await db.query('SELECT "userId" FROM public.animals WHERE id = 1')).rows[0].userId, 1);
  });

  await t.test('legado: remoção local preserva animal e permite auditoria user_delete', async () => {
    await db.exec(`WITH deleted AS (DELETE FROM public.users WHERE id = 3 RETURNING id)
      INSERT INTO petgo_private.admin_audit_log(actor_id, action, target_id, reason)
      SELECT '11111111-1111-4111-8111-111111111111', 'user_delete', id::text, 'Teste isolado' FROM deleted`);
    assert.equal((await db.query('SELECT "userId" FROM public.animals WHERE id = 3')).rows[0].userId, null);
    assert.equal((await db.query('SELECT action FROM petgo_private.admin_audit_log')).rows[0].action, 'user_delete');
  });

  await t.test('FK inesperada desfaz exclusão do Auth, perfil e anonimização', async () => {
    await db.exec('CREATE TABLE public.extra_link (user_id integer REFERENCES public.users(id)); INSERT INTO public.extra_link VALUES (4)');
    await assert.rejects(db.exec("DELETE FROM auth.users WHERE id = '44444444-4444-4444-8444-444444444444'"), { code: '23503' });
    assert.equal((await db.query('SELECT id FROM public.users WHERE id = 4')).rows.length, 1);
    assert.equal((await db.query("SELECT id FROM auth.users WHERE id = '44444444-4444-4444-8444-444444444444'")).rows.length, 1);
    assert.equal((await db.query('SELECT rescuer_contact FROM public.animals WHERE id = 4')).rows[0].rescuer_contact, '444');
  });

  await t.test('funções privilegiadas não podem ser chamadas pelo navegador', async () => {
    for (const role of ['anon', 'authenticated']) {
      const result = await db.query(`SELECT has_function_privilege($1,
        'petgo_private.delete_profile_with_auth_user()', 'EXECUTE') AS allowed`, [role]);
      assert.equal(result.rows[0].allowed, false);
    }
  });

  await t.test('upload tardio não pode recriar vínculo com conta removida', async () => {
    // Remove somente a FK antiga do fixture para exercitar a adicionada pela 007.
    await db.exec('ALTER TABLE public.animals DROP CONSTRAINT "animals_userId_fkey"');
    await assert.rejects(db.exec(`INSERT INTO public.animals (id, "userId", name)
      VALUES (99, 2, 'Upload tardio')`), { code: '23503' });
  });

  await t.test('rota completa executa preflight, exclusão via Auth e auditoria no PostgreSQL', async () => {
    const express = require('express');
    const { createAdminRouter } = require('../../routes/createAdminRouter');
    await db.exec(`INSERT INTO auth.users VALUES ('55555555-5555-4555-8555-555555555555');
      INSERT INTO public.users (id, auth_user_id, name, email) VALUES (5, '55555555-5555-4555-8555-555555555555', 'Pessoa 5', 'cinco@example.test');
      INSERT INTO public.animals (id, "userId", name, rescuer_contact) VALUES (5, 5, 'Rota', '555')`);
    const adapter = { get(sql, params, callback) {
      let i = 0;
      db.query(sql.replace(/\?/g, () => `$${++i}`), params).then(result => callback(null, result.rows[0]), callback);
    } };
    const auth = { getUser: async () => ({ data: { user: {
      id: '11111111-1111-4111-8111-111111111111', email_confirmed_at: '2026-01-01'
    } } }), admin: { async deleteUser(id, soft) {
      assert.equal(soft, false);
      await db.query('DELETE FROM auth.users WHERE id = $1', [id]);
      return { error: null };
    } } };
    const app = express(); app.use(express.json());
    app.use('/admin', createAdminRouter({ auth, db: adapter }));
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    try {
      const url = `http://127.0.0.1:${server.address().port}/admin/users/5`;
      const options = { method: 'DELETE', headers: { Authorization: 'Bearer teste', 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Validação integrada' }) };
      await db.exec('ALTER TABLE auth.users DISABLE TRIGGER petgo_delete_profile_with_auth_user');
      assert.equal((await fetch(url, options)).status, 503);
      await db.exec('ALTER TABLE auth.users ENABLE TRIGGER petgo_delete_profile_with_auth_user');
      const response = await fetch(url, options);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { deletedId: 5 });
      assert.equal((await db.query('SELECT "userId" FROM public.animals WHERE id = 5')).rows[0].userId, null);
      assert.equal((await db.query("SELECT reason FROM petgo_private.admin_audit_log WHERE action = 'user_delete' AND target_id = '5'")).rows[0].reason, 'Validação integrada');
      assert.deepEqual((await db.query("SELECT details FROM petgo_private.admin_audit_log WHERE action = 'user_delete' AND target_id = '5'")).rows[0].details,
        { name: 'Pessoa 5', email: 'cinco@example.test' });
      const auditResponse = await fetch(`http://127.0.0.1:${server.address().port}/admin/audit`, { headers: options.headers });
      assert.equal(auditResponse.status, 200);
      const entries = (await auditResponse.json()).entries;
      const deletedEntry = entries.find(entry => entry.target_id === '5');
      assert.equal(deletedEntry.current_target, null);
      assert.equal(deletedEntry.details.name, 'Pessoa 5');

      await db.exec("UPDATE public.users SET name = 'Nome antigo', email = 'quatro@example.test' WHERE id = 4");
      const banResponse = await fetch(`http://127.0.0.1:${server.address().port}/admin/users/4/ban`, {
        ...options, method: 'PUT', body: JSON.stringify({ banned: true, reason: 'Teste auditoria' })
      });
      assert.equal(banResponse.status, 200);
      await db.exec("UPDATE public.users SET name = 'Nome atual' WHERE id = 4");
      const history = await fetch(`http://127.0.0.1:${server.address().port}/admin/audit?action=user_ban`, { headers: options.headers });
      const banEntry = (await history.json()).entries[0];
      assert.equal(banEntry.details.name, 'Nome antigo');
      assert.equal(banEntry.current_target.name, 'Nome atual');

      await db.exec("UPDATE public.animals SET species = 'Gato', health = 'Em recuperação', image_url = NULL, rescue_image_url = NULL WHERE id = 2");
      const animalResponse = await fetch(`http://127.0.0.1:${server.address().port}/admin/animals/2`, options);
      assert.equal(animalResponse.status, 200);
      const animalDetails = (await db.query("SELECT details FROM petgo_private.admin_audit_log WHERE action = 'animal_delete' AND target_id = '2'")).rows[0].details;
      assert.equal(animalDetails.species, 'Gato');
      assert.equal(animalDetails.health, 'Em recuperação');
      assert.equal(animalDetails.status, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await t.test('migração 008 preserva autoria após resgate e autor exclui com motivo atômico', async () => {
    const express = require('express');
    const { createAnimalAuthorDeletionRouter } = require('../../routes/animalAuthorDeletion');
    // Registro legado resgatado não pode ganhar autoria a partir do resgatador.
    const migration008 = readFileSync(resolve(__dirname, '../../sql/008_animal_authorship.sql'), 'utf8');
    await db.exec(migration008); await db.exec(migration008);
    assert.equal((await db.query('SELECT creator_id FROM public.animals WHERE id = 4')).rows[0].creator_id, null);
    assert.equal((await db.query('SELECT creator_id FROM public.animals WHERE id = 1')).rows[0].creator_id, 1);
    await db.exec(`INSERT INTO public.users (id) VALUES (6);
      INSERT INTO public.animals (id, "userId", status, creator_id, name) VALUES (60, 6, 0, 1, 'Autoria');
      UPDATE public.animals SET "userId" = 1, status = 1 WHERE id = 60;`);
    assert.equal((await db.query('SELECT creator_id FROM public.animals WHERE id = 60')).rows[0].creator_id, 6);
    const adapter = { get(sql, params, callback) {
      let i = 0;
      db.query(sql.replace(/\?/g, () => `$${++i}`), params).then(result => callback(null, result.rows[0]), callback);
    } };
    const app = express(); app.use(express.json());
    // A sessão real é coberta pelos testes de rota; aqui testamos SQL/PostgreSQL.
    app.use((req, res, next) => { req.mobileUser = { id: Number(req.get('Test-Actor')) }; next(); });
    app.use('/animals', createAnimalAuthorDeletionRouter({ db: adapter }));
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const request = actor => fetch(`http://127.0.0.1:${server.address().port}/animals/60`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Test-Actor': String(actor) },
      body: JSON.stringify({ reason: 'Animal já encontrado' })
    });
    try {
      assert.equal((await request(1)).status, 404);
      // Restrição simulada comprova que uma falha no log desfaz o DELETE.
      await db.exec('ALTER TABLE petgo_private.animal_author_deletions ADD CONSTRAINT test_block CHECK (animal_id <> 60)');
      assert.equal((await request(6)).status, 503);
      assert.equal((await db.query('SELECT id FROM public.animals WHERE id = 60')).rows.length, 1);
      await db.exec('ALTER TABLE petgo_private.animal_author_deletions DROP CONSTRAINT test_block');
      assert.equal((await request(6)).status, 200);
      assert.equal((await request(6)).status, 404);
      assert.deepEqual((await db.query('SELECT actor_user_id, animal_id, reason FROM petgo_private.animal_author_deletions')).rows,
        [{ actor_user_id: 6, animal_id: 60, reason: 'Animal já encontrado' }]);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
