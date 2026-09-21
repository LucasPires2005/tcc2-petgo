const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = 'https://tcc-2026-1-e-2-petgo.onrender.com/auth/update-status/7';
let fixtureId = 0;
async function fixture(t) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/services/mobileApi.js'), 'utf8');
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${fixtureId++}`);
  const originalFetch = global.fetch;
  let invalidated = 0;
  const unsubscribe = api.onMobileSessionInvalid(() => invalidated++);
  api.setMobileSession('old-token');
  t.after(() => { global.fetch = originalFetch; unsubscribe(); api.setMobileSession(null); });
  return { api, invalidations: () => invalidated };
}

test('resposta antiga após novo login não invalida a nova sessão', async (t) => {
  const f = await fixture(t);
  let finish;
  global.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = f.api.mobileFetch(url);
  f.api.setMobileSession('new-token');
  finish(new Response(JSON.stringify({ code: 'SESSION_INVALID' }), { status: 401 }));
  await assert.rejects(pending, /sessão mudou/);
  assert.equal(f.invalidations(), 0);
  let sent;
  global.fetch = async (_, init) => { sent = init.headers.Authorization; return new Response('{}'); };
  await f.api.mobileFetch(url);
  assert.equal(sent, 'Bearer new-token');
});

test('perfil recebido depois do logout é descartado', async (t) => {
  const f = await fixture(t);
  let finish;
  global.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = f.api.mobileFetch(url);
  f.api.setMobileSession(null);
  finish(new Response(JSON.stringify({ id: 7, name: 'Perfil antigo' })));
  await assert.rejects(pending, /sessão mudou/);
});

test('falha de rede ou 403 de negócio não encerra sessão válida', async (t) => {
  const f = await fixture(t);
  global.fetch = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(f.api.mobileFetch(url), /Network/);
  global.fetch = async () => new Response(JSON.stringify({ error: 'Acesso a outra conta não permitido.' }), { status: 403 });
  assert.equal((await f.api.mobileFetch(url)).status, 403);
  assert.equal(f.invalidations(), 0);
});

test('sessão inválida atual notifica uma vez e remove Bearer', async (t) => {
  const f = await fixture(t);
  global.fetch = async () => new Response(JSON.stringify({ code: 'SESSION_INVALID', error: 'Expirada' }), { status: 401 });
  await f.api.mobileFetch(url);
  await f.api.mobileFetch(url);
  assert.equal(f.invalidations(), 1);
  let sent;
  global.fetch = async (_, init) => { sent = init.headers.Authorization; return new Response('{}'); };
  await f.api.mobileFetch(url);
  assert.equal(sent, undefined);
});
