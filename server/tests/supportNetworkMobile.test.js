const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SUPPORT_NETWORK_CATALOG, migration } = require('./helpers/supportNetworkFixtures');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../app/services', file), 'utf8');
const source = [read('proximity.js'), read('supportNetwork.js')].join('\n')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
function load(fetch = async () => ({ ok: true, json: async () => ({ items: SUPPORT_NETWORK_CATALOG }) }), extras = {}) {
  return vm.runInNewContext(source + '; ({ normalizeCoordinates, calculateDistance, nearbyItems, nearbyPartners, loadSupportNetwork, directionsUrls })', {
    mobileFetch: fetch, API_BASE_URL: 'https://api.petgo.test', AbortController, setTimeout, clearTimeout, ...extras
  });
}

test('proximidade: coordenadas válidas, distância conhecida e entradas inválidas', () => {
  const api = load();
  assert.equal(api.calculateDistance(0, 0, 0, 0), 0);
  assert.ok(Math.abs(api.calculateDistance(0, 0, 0, 1) - 111.195) < 0.01);
  assert.ok(Number.isFinite(api.calculateDistance(0, 0, 0, 180)));
  assert.equal(api.normalizeCoordinates({ latitude: '-23.67', longitude: '-46.70' }).latitude, -23.67);
  for (const point of [null, {}, { latitude: null, longitude: 0 }, { latitude: '', longitude: 0 },
    { latitude: false, longitude: 0 }, { latitude: [], longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 }, { latitude: NaN, longitude: 0 }]) assert.equal(api.normalizeCoordinates(point), null);
});

test('rede mobile: raio, categoria e ordenação usam a referência escolhida sem mover estabelecimentos', () => {
  const api = load();
  const copy = JSON.stringify(SUPPORT_NETWORK_CATALOG);
  const campus = { latitude: -23.670142, longitude: -46.7010302 };
  const nearby = api.nearbyPartners(SUPPORT_NETWORK_CATALOG, campus, 2);
  assert.equal(nearby.length, 7);
  assert.equal(nearby[0].name, 'Pata & Companhia');
  assert.ok(nearby.every(item => item.dist > 0 && item.dist < 2));
  for (let i = 1; i < nearby.length; i++) assert.ok(nearby[i].dist >= nearby[i - 1].dist);
  for (const category of ['store', 'clinic', 'ngo']) {
    const items = api.nearbyPartners(SUPPORT_NETWORK_CATALOG, campus, 2, category);
    assert.ok(items.length > 0);
    assert.ok(items.every(item => item.category === category && item.dist <= 2));
  }
  const animal = { latitude: -23.6662, longitude: -46.7134 };
  const aroundAnimal = api.nearbyPartners(SUPPORT_NETWORK_CATALOG, animal, 2);
  assert.equal(aroundAnimal[0].name, 'Empório Pet Acolher');
  assert.equal(aroundAnimal[0].dist, 0);
  assert.equal(api.nearbyPartners(SUPPORT_NETWORK_CATALOG, campus, 0.2).length, 1);
  assert.equal(api.nearbyPartners(SUPPORT_NETWORK_CATALOG, { latitude: 0, longitude: 0 }, 100).length, 0);
  assert.equal(api.nearbyPartners(SUPPORT_NETWORK_CATALOG, campus, 0).length, 0);
  assert.equal(JSON.stringify(SUPPORT_NETWORK_CATALOG), copy);
});

test('rede de apoio: seed único e fictício em São Paulo, sem catálogo de Cuiabá', () => {
  assert.equal(new Set(SUPPORT_NETWORK_CATALOG.map(item => item.seed_key)).size, 7);
  assert.deepEqual([...new Set(SUPPORT_NETWORK_CATALOG.map(item => item.category))].sort(), ['clinic', 'ngo', 'store']);
  assert.ok(SUPPORT_NETWORK_CATALOG.every(item => item.address.includes('São Paulo/SP')
    && item.description.includes('fictíc') && item.description.includes('sem parceria real')));
  assert.doesNotMatch(migration, /Cuiabá|demo-cba/);
  assert.match(migration, /ON CONFLICT \(seed_key\) DO NOTHING/);
});

test('proximidade: extração preserva animais pendentes, dados e ordenação existentes', () => {
  const api = load();
  const animals = [{ id: 1, status: 0, latitude: 0, longitude: 0.02, name: 'A' },
    { id: 2, status: 1, latitude: 0, longitude: 0 }, { id: 3, status: 0, latitude: 0, longitude: 0.01, name: 'B' }];
  const result = api.nearbyItems(animals.filter(item => item.status === 0), { latitude: 0, longitude: 0 }, 3);
  assert.equal(result.map(item => item.id).join(','), '3,1');
  assert.equal(result[0].name, 'B');
  assert.equal(animals[0].dist, undefined);
});

test('rede mobile: consulta autenticada, erro do servidor e payload inválido', async () => {
  const api = load(async (url, options) => {
    assert.equal(url, 'https://api.petgo.test/support-network');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ items: SUPPORT_NETWORK_CATALOG }) };
  });
  assert.equal((await api.loadSupportNetwork()).length, SUPPORT_NETWORK_CATALOG.length);
  await assert.rejects(load(async () => ({ ok: false, json: async () => ({ error: 'Serviço indisponível' }) })).loadSupportNetwork(), /Serviço indisponível/);
  await assert.rejects(load(async () => ({ ok: true, json: async () => ({}) })).loadSupportNetwork(), /carregar/);
  await assert.rejects(load(async () => ({ ok: true, json: async () => ({ items: [null] }) })).loadSupportNetwork(), /carregar/);
  await assert.rejects(load(async () => ({ ok: false, json: async () => { throw new SyntaxError('HTML'); } })).loadSupportNetwork(), /carregar/);
});

test('rede mobile: timeout interrompe a consulta e permite uma nova tentativa', async () => {
  let expire;
  let cleared = false;
  const api = load(async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), { setTimeout: callback => { expire = callback; return 1; }, clearTimeout: () => { cleared = true; } });
  const pending = api.loadSupportNetwork();
  expire();
  await assert.rejects(pending, /demorou/);
  assert.equal(cleared, true);
  assert.ok((await load().loadSupportNetwork()).length > 0);
});

test('direções: iOS, Android e fallback recebem coordenadas válidas, nome codificado', () => {
  const api = load();
  const partner = { latitude: '-23.6693', longitude: '-46.7020', name: 'Pata & Companhia' };
  assert.match(api.directionsUrls(partner, 'ios').native, /^maps:\/\/\?daddr=-23.6693,-46.702$/);
  assert.match(api.directionsUrls(partner, 'android').native, /^geo:0,0\?q=-23.6693,-46.702\(Pata%20%26%20Companhia\)$/);
  assert.match(api.directionsUrls(partner, 'web').fallback, /destination=-23.6693%2C-46.702/);
  assert.throws(() => api.directionsUrls({ latitude: 100, longitude: 0 }, 'android'), /indisponível/);
});
