const fs = require('node:fs');
const path = require('node:path');

// Os testes usam os próprios exemplos do SQL: nenhuma segunda fonte de catálogo.
const migration = fs.readFileSync(path.resolve(__dirname, '../../sql/009_support_network.sql'), 'utf8');
const seeds = JSON.parse(migration.split('$partners_seed$')[1]);
const SUPPORT_NETWORK_CATALOG = seeds.map((seed, index) => ({
  ...seed, id: String(index + 1), demonstration: true, active: true
}));

module.exports = { SUPPORT_NETWORK_CATALOG, migration };
