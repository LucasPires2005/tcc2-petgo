const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeFixture, animalForm } = require('./helpers/routeFixture');
const { reserveAnimalCreation } = require('../services/animalCreationLimit');
const { rescueTransaction } = require('./helpers/rescueTransaction');

const now = Date.parse('2026-10-01T15:00:00Z');
const events = (count, at = now - 1000, userId = 7) => Array.from({ length: count }, () => ({ userId, at }));

test('limite permite cinco cadastros; sexto retorna 429 antes de moderar ou fazer upload', async (t) => {
  const f = await routeFixture(t, 'animals', { now: () => now });
  for (let index = 0; index < 5; index++) assert.equal((await f.request('', { token: f.token, form: animalForm() })).status, 200);
  const processed = f.calls.filter(call => call.kind === 'moderate' || call.kind === 'upload').length;
  const response = await f.request('', { token: f.token, form: animalForm() });
  assert.equal(response.status, 429);
  assert.equal(response.body.code, 'ANIMAL_CREATION_LIMIT');
  assert.equal(response.body.retryAfter, 300);
  assert.equal(response.retryAfter, '300');
  assert.equal(f.calls.filter(call => call.kind === 'moderate' || call.kind === 'upload').length, processed);
  assert.equal(f.state.creationEvents.length, 5);
  assert.ok(f.calls.filter(call => call.sql?.includes('pg_advisory_xact_lock')).every(call => call.params[0] === 7));
});

test('vigésimo cadastro é permitido; vigésimo primeiro bloqueado até meia-noite de Brasília', async (t) => {
  const f = await routeFixture(t, 'animals', { now: () => now, creationEvents: events(19, now - 3600000) });
  assert.equal((await f.request('', { token: f.token, form: animalForm() })).status, 200);
  const response = await f.request('', { token: f.token, form: animalForm() });
  assert.equal(response.status, 429);
  assert.match(response.body.error, /20 cadastros/);
  assert.equal(response.body.retryAfter, 12 * 3600);
});

test('admissões simultâneas reservam no máximo cinco vagas', async (t) => {
  const f = await routeFixture(t, 'animals', { now: () => now });
  const responses = await Promise.all(Array.from({ length: 10 }, () => f.request('', { token: f.token, form: animalForm() })));
  assert.equal(responses.filter(response => response.status === 200).length, 5);
  assert.equal(responses.filter(response => response.status === 429).length, 5);
  assert.equal(f.calls.filter(call => call.kind === 'upload').length, 5);
  assert.equal(f.state.creationEvents.length, 5);
});

test('janela móvel libera exatamente após cinco minutos, sem reset prematuro', async (t) => {
  let clock = now;
  const f = await routeFixture(t, 'animals', { now: () => clock, creationEvents: events(5, now) });
  clock = now + 299999;
  assert.equal((await f.request('', { token: f.token, form: animalForm() })).status, 429);
  clock = now + 300000;
  assert.equal((await f.request('', { token: f.token, form: animalForm() })).status, 200);
});

test('cota diária não reinicia na meia-noite UTC; reinicia em Brasília', async (t) => {
  let clock = Date.parse('2026-10-02T00:01:00Z');
  const f = await routeFixture(t, 'animals', { now: () => clock, creationEvents: events(20, now) });
  const blocked = await f.request('', { token: f.token, form: animalForm() });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.retryAfter, 179 * 60);
  clock = Date.parse('2026-10-02T03:00:00Z');
  assert.equal((await f.request('', { token: f.token, form: animalForm() })).status, 200);
});

test('janela de cinco minutos continua atravessando a virada de dia', async (t) => {
  const midnight = Date.parse('2026-10-02T03:00:00Z');
  const f = await routeFixture(t, 'animals', { now: () => midnight, creationEvents: events(5, midnight - 60000) });
  const response = await f.request('', { token: f.token, form: animalForm() });
  assert.equal(response.status, 429);
  assert.equal(response.body.retryAfter, 240);
});

test('limites são individuais; outro usuário tem sua própria cota', async () => {
  const state = { creationEvents: events(5) };
  const db = { transaction: rescueTransaction({ state, user: {}, options: { now: () => now }, record() {} }) };
  assert.equal((await reserveAnimalCreation(db, 7)).allowed, false);
  assert.equal((await reserveAnimalCreation(db, 8)).allowed, true);
  assert.equal((await reserveAnimalCreation(db, 7)).allowed, false);
});

for (const [name, options, status] of [
  ['moderação rejeita', { moderation: { allowed: false, reason: 'Rejeitada' } }, 422],
  ['moderação indisponível', { moderationError: new Error('timeout') }, 503],
  ['upload falha', { uploadError: new Error('storage') }, 500],
  ['INSERT falha', { animalInsertError: new Error('database') }, 500]
]) {
  test(`falha conhecida não consome cota: ${name}`, async (t) => {
    const f = await routeFixture(t, 'animals', { ...options, now: () => now });
    const response = await f.request('', { token: f.token, form: animalForm() });
    assert.equal(response.status, status);
    assert.equal(f.state.creationEvents.length, 0);
    assert.ok(f.calls.some(call => call.sql?.startsWith('DELETE FROM petgo_private.animal_creation_events') && call.kind === 'run'));
  });
}

test('banco ou migração indisponível bloqueia cadastro sem gastar moderação/upload', async (t) => {
  const f = await routeFixture(t, 'animals', { limitError: new Error('missing table') });
  const response = await f.request('', { token: f.token, form: animalForm() });
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'ANIMAL_LIMIT_UNAVAILABLE');
  assert.equal(f.calls.some(call => call.kind === 'moderate' || call.kind === 'upload'), false);
  assert.doesNotMatch(JSON.stringify(response.body), /missing table/);
});

test('rollback na reserva não publica vaga; falha ao liberar mantém proteção conservadora', async (t) => {
  const f = await routeFixture(t, 'animals', { reservationError: new Error('database') });
  assert.equal((await f.request('', { token: f.token, form: animalForm() })).status, 503);
  assert.equal(f.state.creationEvents, undefined);
  const failedRelease = await routeFixture(t, 'animals', { releaseError: new Error('database'), moderation: { allowed: false } });
  assert.equal((await failedRelease.request('', { token: failedRelease.token, form: animalForm() })).status, 422);
  assert.equal(failedRelease.state.creationEvents.length, 1);
});
