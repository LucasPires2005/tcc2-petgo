const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('URL local configurada recebe JWT, Render deixa de ser destino autorizado', async t => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  const originalFetch = global.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://local.example.test/';
  t.after(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
    global.fetch = originalFetch;
  });
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/services/mobileApi.js'), 'utf8');
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  let sent;
  global.fetch = async (_, init) => { sent = init.headers.Authorization; return new Response('{}'); };
  api.setMobileSession('local-token');
  assert.equal(api.API_BASE_URL, 'https://local.example.test');
  await api.mobileFetch(`${api.API_BASE_URL}/animals`);
  assert.equal(sent, 'Bearer local-token');
  await assert.rejects(api.mobileFetch('https://tcc-2026-1-e-2-petgo.onrender.com/animals'), /Destino/);
});
