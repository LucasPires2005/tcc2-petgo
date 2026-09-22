const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(failCommit = false) {
  const calls = [];
  const connection = {
    async query(sql) { calls.push(sql); if (failCommit && sql === 'COMMIT') throw new Error('commit failure'); return { rows: [] }; },
    release() { calls.push('release'); }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../db.js'), 'utf8'), {
    module, process: { env: {} }, console: { log() {}, error() {} },
    require(name) {
      assert.equal(name, 'pg');
      return { Pool: class {
        connect(cb) { if (cb) { cb(null, connection, () => {}); return; } return Promise.resolve(connection); }
        query() { throw new Error('Não usar pool.query dentro da transação'); }
      } };
    }
  });
  return { db: module.exports, calls, connection };
}
test('transação usa mesma conexão até commit e libera uma vez', async () => {
  const f = fixture();
  assert.equal(await f.db.transaction(async tx => {
    assert.equal(tx, f.connection);
    await tx.query('SELECT teste'); return 7;
  }), 7);
  assert.deepEqual(f.calls, ['BEGIN', 'SELECT teste', 'COMMIT', 'release']);
});
test('falha na operação ou commit causa rollback e libera conexão', async () => {
  for (const failCommit of [false, true]) {
    const f = fixture(failCommit);
    await assert.rejects(f.db.transaction(async () => { if (!failCommit) throw new Error('write failure'); }));
    assert.equal(f.calls.at(-2), 'ROLLBACK');
    assert.equal(f.calls.at(-1), 'release');
    assert.equal(f.calls.filter(c => c === 'release').length, 1);
  }
});
