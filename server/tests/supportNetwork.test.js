const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createSupportNetworkRouter, SUPPORT_NETWORK_QUERY } = require('../routes/supportNetwork');
const { SUPPORT_NETWORK_CATALOG } = require('./helpers/supportNetworkFixtures');

async function fixture(t) {
  const state = { banned: false, version: 0, unavailable: false, missing: false, queries: [],
    catalogError: null, rows: SUPPORT_NETWORK_CATALOG.map(row => ({ ...row })) };
  const db = { get(sql, params, callback) {
    state.queries.push({ method: 'get', sql, params });
    callback(state.unavailable ? new Error('offline') : null,
      state.missing ? null : { id: 7, banned: state.banned, version: state.version });
  }, all(sql, params, callback) {
    state.queries.push({ method: 'all', sql, params });
    const rows = state.rows.filter(row => row.active === true && row.demonstration === true
      && ['store', 'clinic', 'ngo'].includes(row.category) && row.name?.trim() && row.address?.trim()
      && row.latitude != null && row.longitude != null
      && Number(row.latitude) >= -90 && Number(row.latitude) <= 90
      && Number(row.longitude) >= -180 && Number(row.longitude) <= 180);
    callback(state.catalogError, rows);
  } };
  const app = express();
  app.use('/support-network', createSupportNetworkRouter({ db, verify: token => token === 'valid' ? { sub: '7', ver: 0 } : null }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { state, async request(token) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/support-network', {
      headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  } };
}

test('rede de apoio: sem token ou token inválido não consulta o banco nem expõe catálogo', async t => {
  const f = await fixture(t);
  for (const token of [undefined, 'invalid']) {
    const result = await f.request(token);
    assert.equal(result.status, 401);
    assert.equal(result.body.items, undefined);
  }
  assert.equal(f.state.queries.length, 0);
});

test('rede de apoio: sessão ativa recebe catálogo do partners via consultas somente leitura', async t => {
  const f = await fixture(t);
  const result = await f.request('valid');
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  assert.equal(result.body.demonstration, true);
  assert.ok(result.body.items.length > 0);
  assert.deepEqual([...new Set(result.body.items.map(item => item.category))].sort(), ['clinic', 'ngo', 'store']);
  for (const item of result.body.items) {
    assert.equal(typeof item.id, 'string');
    assert.equal(item.demonstration, true);
    assert.ok(Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    assert.equal(typeof item.address, 'string');
  }
  assert.doesNotMatch(JSON.stringify(result.body), /password|auth_user_id|cpf|rescuer_contact/);
  assert.ok(f.state.queries.every(query => query.sql.trim().startsWith('SELECT')));
  assert.deepEqual(f.state.queries[0].params, ['7']);
  assert.equal(f.state.queries[1].method, 'all');
  assert.equal(f.state.queries[1].sql, SUPPORT_NETWORK_QUERY);
  assert.deepEqual(f.state.queries[1].params, []);
});

test('rede de apoio: banimento e revogação bloqueiam a mesma sessão já aberta', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('valid')).status, 200);
  f.state.banned = true;
  assert.equal((await f.request('valid')).status, 403);
  f.state.banned = false;
  f.state.version = 1;
  assert.equal((await f.request('valid')).status, 401);
  assert.equal(f.state.queries.filter(query => query.method === 'all').length, 1);
});

test('rede de apoio: conta ausente e indisponibilidade do banco não liberam a leitura', async t => {
  const f = await fixture(t);
  f.state.missing = true;
  assert.equal((await f.request('valid')).status, 401);
  f.state.unavailable = true;
  assert.equal((await f.request('valid')).status, 503);
  assert.equal(f.state.queries.filter(query => query.method === 'all').length, 0);
});

test('rede de apoio: mudanças no banco aparecem na próxima consulta sem catálogo fixo', async t => {
  const f = await fixture(t);
  f.state.rows = [{ ...f.state.rows[0], id: 42, name: 'Nome alterado no Supabase',
    latitude: '-23.6693', longitude: '-46.7020', description: null,
    password: 'privado', cpf: 'privado', seed_key: 'privado' }];
  const result = await f.request('valid');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, [{ id: '42', name: 'Nome alterado no Supabase', category: 'store',
    address: f.state.rows[0].address, latitude: -23.6693, longitude: -46.702,
    description: '', demonstration: true }]);
  f.state.rows[0].name = 'Segunda edição';
  assert.equal((await f.request('valid')).body.items[0].name, 'Segunda edição');
});

test('rede de apoio: banco vazio retorna lista vazia, sem fallback ou gravação de seed', async t => {
  const f = await fixture(t);
  f.state.rows = [];
  const result = await f.request('valid');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { demonstration: true, items: [] });
  assert.ok(f.state.queries.every(query => query.sql.trim().startsWith('SELECT')));
});

test('rede de apoio: consulta filtra inativos, não demonstrativos e registros incompletos', async t => {
  const f = await fixture(t);
  const valid = f.state.rows[0];
  f.state.rows = [valid, ...[
    { active: false }, { demonstration: false }, { category: null }, { category: 'other' },
    { address: null }, { address: '  ' }, { name: '  ' }, { latitude: null },
    { longitude: null }, { latitude: 91 }, { longitude: -181 }
  ].map((change, index) => ({ ...valid, id: String(index + 100), ...change }))];
  assert.equal((await f.request('valid')).body.items.length, 1);
  assert.match(SUPPORT_NETWORK_QUERY, /FROM public\.partners/);
  assert.match(SUPPORT_NETWORK_QUERY, /active = true AND demonstration = true/);
  assert.match(SUPPORT_NETWORK_QUERY, /category IN \('store', 'clinic', 'ngo'\)/);
  assert.match(SUPPORT_NETWORK_QUERY, /NULLIF\(TRIM\(name\), ''\) IS NOT NULL/);
  assert.match(SUPPORT_NETWORK_QUERY, /NULLIF\(TRIM\(address\), ''\) IS NOT NULL/);
  assert.match(SUPPORT_NETWORK_QUERY, /latitude BETWEEN -90 AND 90/);
  assert.match(SUPPORT_NETWORK_QUERY, /longitude BETWEEN -180 AND 180/);
});

test('rede de apoio: falha de leitura ou migração ausente retorna 503 sem detalhes internos', async t => {
  const f = await fixture(t);
  for (const code of ['42P01', '42703', '08006']) {
    f.state.catalogError = Object.assign(new Error('segredo DATABASE_URL, SQL e senha'), { code });
    const result = await f.request('valid');
    assert.equal(result.status, 503);
    assert.equal(result.cache, 'no-store');
    assert.match(result.body.error, /indisponível/);
    assert.doesNotMatch(JSON.stringify(result.body), /DATABASE_URL|SQL|senha|42P01|42703|08006/);
    assert.equal(result.body.items, undefined);
  }
  f.state.catalogError = null;
  assert.equal((await f.request('valid')).status, 200);
});
