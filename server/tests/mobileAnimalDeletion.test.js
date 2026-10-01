const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../app/services/animalDeletion.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
function load(fetch) {
  return vm.runInNewContext(`${source}; ({ isAnimalAuthor, deleteOwnAnimal })`, {
    mobileFetch: fetch, API_BASE_URL: 'https://petgo.test', setTimeout, clearTimeout, AbortController
  });
}
test('mobile: botão depende de creator_id, nunca de quem resgatou', () => {
  const { isAnimalAuthor } = load();
  assert.equal(isAnimalAuthor({ creator_id: 7, userId: 8 }, 7), true);
  assert.equal(isAnimalAuthor({ creator_id: 7, userId: 8 }, 8), false);
  assert.equal(isAnimalAuthor({ creator_id: null, userId: 7 }, 7), false);
  assert.equal(isAnimalAuthor(null, null), false);
});
test('mobile: DELETE autenticado envia somente motivo e preserva erro amigável', async () => {
  const api = load(async (url, options) => {
    assert.equal(url, 'https://petgo.test/animals/42');
    assert.equal(options.method, 'DELETE');
    assert.deepEqual(JSON.parse(options.body), { reason: 'Criado por engano' });
    return { ok: true, json: async () => ({ deletedId: 42 }) };
  });
  assert.equal((await api.deleteOwnAnimal(42, ' Criado por engano ')).deletedId, 42);
  await assert.rejects(api.deleteOwnAnimal(42, ' a '), /3 a 500/);
  const fail = load(async () => ({ ok: false, json: async () => ({ error: 'Você não é o autor.' }) }));
  await assert.rejects(fail.deleteOwnAnimal(42, 'Teste'), /Você não é o autor/);
});
