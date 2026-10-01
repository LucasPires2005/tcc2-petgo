const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../app/context/AuthContext.js'), 'utf8');
const start = source.indexOf('  async function changePassword(');
const end = source.indexOf('  async function deleteAccount(', start);

test('mobile propaga os erros de senha do backend e mantém sucesso booleano', async () => {
  for (const error of ['A senha atual está incorreta.', 'A nova senha deve ter no mínimo 6 carateres.']) {
    const run = vm.runInNewContext(`${source.slice(start, end)}; changePassword;`, {
      user: { id: 7 }, BASE_URL: 'https://example.test',
      mobileFetch: async () => ({ ok: false, json: async () => ({ error }) })
    });
    await assert.rejects(run('current', '123'), { message: error });
  }
  const run = vm.runInNewContext(`${source.slice(start, end)}; changePassword;`, {
    user: { id: 7 }, BASE_URL: 'https://example.test', mobileFetch: async () => ({ ok: true })
  });
  assert.equal(await run('current', 'long-enough'), true);
});
